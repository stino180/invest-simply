import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { keccak256, encodeAbiParameters, parseAbiParameters, toHex, stringToHex, concat, pad, numberToHex } from "https://esm.sh/viem@2.21.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DcaPlan {
  id: string;
  user_id: string;
  asset: string;
  amount_usd: number;
  frequency: string;
  is_active: boolean;
  next_execution_at: string;
  slippage: number;
}

interface Profile {
  id: string;
  user_id: string;
  privy_did: string;
  wallet_address: string;
  network_mode: 'mainnet' | 'testnet';
  wallet_type: 'privy' | 'external' | null;
  agent_wallet_address: string | null;
}

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 500;

// Retry with exponential backoff for network requests
async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, options);
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(`Fetch attempt ${attempt + 1}/${retries} failed:`, lastError.message);
      
      if (attempt < retries - 1) {
        const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError || new Error("Fetch failed after retries");
}

// Network URLs
const MAINNET_INFO_URL = "https://api.hyperliquid.xyz/info";
const MAINNET_EXCHANGE_URL = "https://api.hyperliquid.xyz/exchange";
const TESTNET_INFO_URL = "https://api.hyperliquid-testnet.xyz/info";
const TESTNET_EXCHANGE_URL = "https://api.hyperliquid-testnet.xyz/exchange";

// Spot assets use 10000 + spotMeta index
const SPOT_ASSET_OFFSET = 10000;

// Spot asset info result
interface SpotAssetInfo {
  assetId: number;  // 10000 + spotMeta index
  szDecimals: number;
  name: string;
}

// Get spot asset info from spotMeta
async function getSpotAssetInfo(asset: string, networkMode: string): Promise<SpotAssetInfo> {
  const infoUrl = networkMode === 'testnet' ? TESTNET_INFO_URL : MAINNET_INFO_URL;

  const spotMetaResponse = await fetchWithRetry(infoUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "spotMeta" }),
  });

  if (!spotMetaResponse.ok) {
    throw new Error(`Failed to fetch spotMeta: ${spotMetaResponse.statusText}`);
  }

  const spotMeta = await spotMetaResponse.json();
  const universe: Array<{ name: string; tokens: number[]; index: number; szDecimals?: number }> = 
    spotMeta?.universe ?? [];
  
  // Match by base token symbol
  let spotInfo = universe.find((u) => 
    u.name === asset || 
    u.name === `${asset}/USDC` ||
    u.name.split("/")[0] === asset
  );

  if (!spotInfo) {
    console.log("Available spot pairs:", universe.map(u => u.name).join(", "));
    throw new Error(`Spot asset ${asset} not found in spotMeta`);
  }

  const assetId = SPOT_ASSET_OFFSET + spotInfo.index;
  const szDecimals = spotInfo.szDecimals ?? 4;

  console.log(`Resolved spot asset: ${spotInfo.name} -> assetId=${assetId}, szDecimals=${szDecimals}`);

  return { assetId, szDecimals, name: spotInfo.name };
}

// Get current price from Hyperliquid with retry
async function getAssetPrice(asset: string, networkMode: string): Promise<number> {
  const infoUrl = networkMode === 'testnet' ? TESTNET_INFO_URL : MAINNET_INFO_URL;
  
  const response = await fetchWithRetry(infoUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "allMids" })
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch prices: ${response.statusText}`);
  }

  const data = await response.json();
  const price = data[asset];
  
  if (!price) {
    throw new Error(`Asset ${asset} not found on Hyperliquid`);
  }

  return parseFloat(price);
}

// Sign a typed data message using Privy's server-side wallet API
async function signTypedDataWithPrivy(
  privyDid: string,
  walletAddress: string,
  typedData: unknown
): Promise<string> {
  const PRIVY_APP_ID = Deno.env.get("PRIVY_APP_ID");
  const PRIVY_APP_SECRET = Deno.env.get("PRIVY_APP_SECRET");

  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    throw new Error("Privy credentials not configured");
  }

  console.log(`Signing with Privy for wallet: ${walletAddress}`);

  // Privy server wallet RPC endpoint
  const response = await fetch(
    `https://auth.privy.io/api/v1/users/${privyDid}/wallets/${walletAddress}/rpc`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "privy-app-id": PRIVY_APP_ID,
        "Authorization": `Basic ${btoa(`${PRIVY_APP_ID}:${PRIVY_APP_SECRET}`)}`,
      },
      body: JSON.stringify({
        method: "eth_signTypedData_v4",
        params: {
          typedData
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Privy signing error:", response.status, errorText);
    throw new Error(`Privy signing failed: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  console.log("Privy signature obtained successfully");
  return result.data.signature;
}

// Sign using the agent wallet (for external wallet users)
async function signTypedDataWithAgent(typedData: unknown): Promise<string> {
  const { privateKeyToAccount } = await import("https://esm.sh/viem@2.21.0/accounts");
  const { signTypedData } = await import("https://esm.sh/viem@2.21.0/accounts");
  
  const AGENT_PRIVATE_KEY = Deno.env.get("AGENT_WALLET_PRIVATE_KEY");
  
  if (!AGENT_PRIVATE_KEY) {
    throw new Error("Agent wallet not configured");
  }

  const account = privateKeyToAccount(AGENT_PRIVATE_KEY as `0x${string}`);
  console.log(`Signing with agent wallet: ${account.address}`);

  // Sign the typed data
  const signature = await account.signTypedData(typedData as any);
  console.log("Agent signature obtained successfully");
  return signature;
}

// Build EIP-712 typed data for Hyperliquid order
function buildOrderTypedData(
  action: unknown,
  nonce: number,
  isMainnet: boolean
) {
  const domain = {
    name: "Exchange",
    version: "1",
    chainId: isMainnet ? 1 : 421614, // Mainnet or Arbitrum Sepolia for testnet
    verifyingContract: "0x0000000000000000000000000000000000000000" as `0x${string}`
  };

  const types = {
    Agent: [
      { name: "source", type: "string" },
      { name: "connectionId", type: "bytes32" },
    ],
  };

  // Hyperliquid uses a specific action hash format
  const actionHash = hashHyperliquidAction(action, nonce);

  const message = {
    source: isMainnet ? "a" : "b", // 'a' for mainnet, 'b' for testnet
    connectionId: actionHash,
  };

  return {
    domain,
    types,
    primaryType: "Agent" as const,
    message
  };
}

// Hash Hyperliquid action for signing
function hashHyperliquidAction(action: unknown, nonce: number): `0x${string}` {
  const actionStr = JSON.stringify(action);
  const combined = `${actionStr}${nonce}`;
  return keccak256(stringToHex(combined));
}

// Format number for Hyperliquid (remove trailing zeros)
function formatSize(size: number, szDecimals: number): string {
  const formatted = size.toFixed(szDecimals);
  // Remove trailing zeros but keep at least szDecimals precision if needed
  return parseFloat(formatted).toString();
}

function formatPrice(price: number): string {
  // Hyperliquid uses 2 decimal places for prices typically
  const formatted = price.toFixed(2);
  return parseFloat(formatted).toString();
}

// Build and sign Hyperliquid order
async function executeHyperliquidOrder(
  profile: Profile,
  asset: string,
  amountUsd: number,
  currentPrice: number,
  slippage: number,
  networkMode: string,
  useAgentWallet: boolean
): Promise<{ orderId: string; amountCrypto: number; executedPrice: number }> {
  const exchangeUrl = networkMode === 'testnet' ? TESTNET_EXCHANGE_URL : MAINNET_EXCHANGE_URL;
  const isMainnet = networkMode === 'mainnet';
  
  // Determine which wallet address to use for the order
  const tradingAddress = useAgentWallet ? profile.agent_wallet_address! : profile.wallet_address;
  
  // Get SPOT asset info (not perp)
  const spotInfo = await getSpotAssetInfo(asset, networkMode);

  // Calculate size and price with slippage for market-like execution
  const amountCrypto = amountUsd / currentPrice;
  const slippageMultiplier = 1 + (slippage / 100);
  const limitPrice = currentPrice * slippageMultiplier;
  
  const formattedSize = formatSize(amountCrypto, spotInfo.szDecimals);
  const formattedPrice = formatPrice(limitPrice);

  console.log(`Placing SPOT order: assetId=${spotInfo.assetId} (${spotInfo.name}) ${formattedSize} ${asset} @ ${formattedPrice} (market: ${currentPrice})`);

  const timestamp = Date.now();
  
  // SPOT order action - uses 10000 + spotMeta index
  const action = {
    type: "order",
    orders: [{
      a: spotInfo.assetId,  // SPOT asset ID
      b: true, // isBuy
      p: formattedPrice,
      s: formattedSize,
      r: false, // reduceOnly
      t: { limit: { tif: "Ioc" } } // Immediate-or-cancel for market-like execution
    }],
    grouping: "na"
  };

  // Build typed data for EIP-712 signing
  const typedData = buildOrderTypedData(action, timestamp, isMainnet);
  
  // Sign with appropriate method
  let signature: string;
  if (useAgentWallet) {
    signature = await signTypedDataWithAgent(typedData);
  } else {
    signature = await signTypedDataWithPrivy(
      profile.privy_did,
      profile.wallet_address,
      typedData
    );
  }

  // Submit to Hyperliquid
  const requestBody = {
    action,
    nonce: timestamp,
    signature: {
      r: signature.slice(0, 66),
      s: "0x" + signature.slice(66, 130),
      v: parseInt(signature.slice(130, 132), 16)
    },
    vaultAddress: null
  };

  console.log("Submitting order to Hyperliquid...");

  const response = await fetchWithRetry(exchangeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  const responseText = await response.text();
  console.log("Hyperliquid response:", responseText);

  if (!response.ok) {
    throw new Error(`Hyperliquid order failed: ${responseText}`);
  }

  let result;
  try {
    result = JSON.parse(responseText);
  } catch {
    throw new Error(`Invalid Hyperliquid response: ${responseText}`);
  }
  
  if (result.status === "err") {
    throw new Error(`Hyperliquid error: ${result.response}`);
  }

  const orderId = result.response?.data?.statuses?.[0]?.resting?.oid || 
                  result.response?.data?.statuses?.[0]?.filled?.oid ||
                  `dca-${timestamp}`;

  return {
    orderId,
    amountCrypto: parseFloat(formattedSize),
    executedPrice: currentPrice
  };
}

// Calculate next execution time based on frequency
function getNextExecutionTime(frequency: string): Date {
  const now = new Date();
  switch (frequency) {
    case "daily":
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
    case "weekly":
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    case "monthly":
      const nextMonth = new Date(now);
      nextMonth.setMonth(nextMonth.getMonth() + 1);
      return nextMonth;
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Starting DCA execution check...");

    // Get all active plans that are due for execution
    const now = new Date().toISOString();
    const { data: duePlans, error: plansError } = await supabase
      .from("dca_plans")
      .select(`
        *,
        profiles!inner(id, user_id, privy_did, wallet_address, network_mode, wallet_type, agent_wallet_address)
      `)
      .eq("is_active", true)
      .lte("next_execution_at", now);

    if (plansError) {
      console.error("Error fetching plans:", plansError);
      throw plansError;
    }

    console.log(`Found ${duePlans?.length || 0} plans due for execution`);

    const results = [];

    for (const plan of duePlans || []) {
      const profile = plan.profiles as unknown as Profile;
      
      // Check wallet requirements based on wallet type
      const isExternalWallet = profile.wallet_type === 'external';
      const canExecute = isExternalWallet 
        ? !!profile.agent_wallet_address  // External wallets need agent authorization
        : !!profile.wallet_address && !!profile.privy_did;  // Privy wallets need privy_did
      
      if (!canExecute) {
        console.log(`Skipping plan ${plan.id}: wallet not properly configured (type: ${profile.wallet_type})`);
        continue;
      }

      try {
        const networkMode = profile.network_mode || 'mainnet';
        console.log(`Executing DCA for plan ${plan.id}: ${plan.amount_usd} USD -> ${plan.asset} (${networkMode})`);

        // Get current price
        const price = await getAssetPrice(plan.asset, networkMode);
        console.log(`Current ${plan.asset} price: $${price}`);

        // Execute order via Hyperliquid
        const { orderId, amountCrypto, executedPrice } = await executeHyperliquidOrder(
          profile,
          plan.asset,
          plan.amount_usd,
          price,
          plan.slippage || 1, // Default 1% slippage
          networkMode,
          isExternalWallet
        );

        // Record execution
        const { error: execError } = await supabase
          .from("dca_executions")
          .insert({
            plan_id: plan.id,
            amount_usd: plan.amount_usd,
            amount_crypto: amountCrypto,
            price_at_execution: executedPrice,
            status: "completed",
            hyperliquid_order_id: orderId
          });

        if (execError) {
          console.error("Error recording execution:", execError);
        }

        // Update next execution time
        const nextExecution = getNextExecutionTime(plan.frequency);
        await supabase
          .from("dca_plans")
          .update({ next_execution_at: nextExecution.toISOString() })
          .eq("id", plan.id);

        results.push({
          planId: plan.id,
          status: "success",
          orderId,
          amountCrypto,
          price: executedPrice
        });

        console.log(`Successfully executed plan ${plan.id}`);

      } catch (execErr) {
        const errorMessage = execErr instanceof Error ? execErr.message : "Unknown error";
        console.error(`Failed to execute plan ${plan.id}:`, errorMessage);

        // Record failed execution
        await supabase
          .from("dca_executions")
          .insert({
            plan_id: plan.id,
            amount_usd: plan.amount_usd,
            status: "failed",
            error_message: errorMessage
          });

        results.push({
          planId: plan.id,
          status: "failed",
          error: errorMessage
        });
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        executedPlans: results.length,
        results 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("DCA execution error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
