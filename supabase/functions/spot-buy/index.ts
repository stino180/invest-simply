import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { keccak256, stringToHex } from "https://esm.sh/viem@2.21.0";
import { privateKeyToAccount, generatePrivateKey } from "https://esm.sh/viem@2.21.0/accounts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Profile {
  id: string;
  user_id: string;
  privy_did: string;
  wallet_address: string;
  network_mode: 'mainnet' | 'testnet';
  wallet_type: 'privy' | 'external' | null;
  agent_wallet_address: string | null;
  agent_wallet_private_key_encrypted: string | null;
}

// Network URLs
const MAINNET_INFO_URL = "https://api.hyperliquid.xyz/info";
const MAINNET_EXCHANGE_URL = "https://api.hyperliquid.xyz/exchange";
const TESTNET_INFO_URL = "https://api.hyperliquid-testnet.xyz/info";
const TESTNET_EXCHANGE_URL = "https://api.hyperliquid-testnet.xyz/exchange";

// Asset metadata mapping - spot assets have different indices
const SPOT_ASSET_META: Record<string, { tokenId: number; szDecimals: number }> = {
  "BTC": { tokenId: 1, szDecimals: 5 },
  "ETH": { tokenId: 2, szDecimals: 4 },
  "SOL": { tokenId: 5, szDecimals: 2 },
  "DOGE": { tokenId: 4, szDecimals: 0 },
  "AVAX": { tokenId: 7, szDecimals: 2 },
  "LINK": { tokenId: 6, szDecimals: 2 },
  "HYPE": { tokenId: 3, szDecimals: 2 },
  "PURR": { tokenId: 8, szDecimals: 0 },
};

// Decrypt the stored private key
function decryptPrivateKey(encrypted: string): string | null {
  try {
    const decoded = atob(encrypted);
    const parts = decoded.split(':');
    if (parts.length >= 2) {
      return parts.slice(1).join(':');
    }
    return null;
  } catch {
    return null;
  }
}

// Encrypt a private key for storage
function encryptPrivateKey(privateKey: string): string {
  const salt = crypto.randomUUID();
  return btoa(`${salt}:${privateKey}`);
}

// Generate a new agent wallet and store it in the profile
async function ensureAgentWallet(
  supabase: any,
  profile: Profile
): Promise<{ address: string; privateKey: string }> {
  // If already has an agent wallet, decrypt and return it
  if (profile.agent_wallet_private_key_encrypted && profile.agent_wallet_address) {
    const privateKey = decryptPrivateKey(profile.agent_wallet_private_key_encrypted);
    if (privateKey) {
      console.log(`Using existing agent wallet: ${profile.agent_wallet_address}`);
      return { address: profile.agent_wallet_address, privateKey };
    }
  }

  // Generate new agent wallet
  console.log("Generating new agent wallet for user...");
  const newPrivateKey = generatePrivateKey();
  const account = privateKeyToAccount(newPrivateKey);
  const encryptedKey = encryptPrivateKey(newPrivateKey);

  // Store in profile
  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      agent_wallet_address: account.address as string,
      agent_wallet_private_key_encrypted: encryptedKey,
      agent_wallet_authorized_at: new Date().toISOString()
    })
    .eq("id", profile.id);

  if (updateError) {
    throw new Error(`Failed to store agent wallet: ${updateError.message}`);
  }

  console.log(`Created new agent wallet: ${account.address}`);
  return { address: account.address, privateKey: newPrivateKey };
}

// Get current price from Hyperliquid
async function getSpotPrice(asset: string, networkMode: string): Promise<number> {
  const infoUrl = networkMode === 'testnet' ? TESTNET_INFO_URL : MAINNET_INFO_URL;
  
  // Get spot meta and asset contexts
  const response = await fetch(infoUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "spotMeta" })
  });

  if (!response.ok) {
    // Fallback to allMids for price data
    const midsResponse = await fetch(infoUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "allMids" })
    });
    
    if (!midsResponse.ok) {
      throw new Error(`Failed to fetch prices: ${midsResponse.statusText}`);
    }
    
    const midsData = await midsResponse.json();
    const price = midsData[asset];
    
    if (!price) {
      throw new Error(`Asset ${asset} not found`);
    }
    
    return parseFloat(price);
  }

  // Try to get spot-specific price
  const data = await response.json();
  console.log("Spot meta response:", JSON.stringify(data).slice(0, 500));
  
  // Fallback to allMids
  const midsResponse = await fetch(infoUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "allMids" })
  });
  
  const midsData = await midsResponse.json();
  const price = midsData[asset];
  
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

// Sign using the user's agent wallet
async function signTypedDataWithAgentWallet(privateKey: string, typedData: unknown): Promise<string> {
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  console.log(`Signing with agent wallet: ${account.address}`);

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
    chainId: isMainnet ? 1 : 421614,
    verifyingContract: "0x0000000000000000000000000000000000000000" as `0x${string}`
  };

  const types = {
    Agent: [
      { name: "source", type: "string" },
      { name: "connectionId", type: "bytes32" },
    ],
  };

  const actionHash = hashHyperliquidAction(action, nonce);

  const message = {
    source: isMainnet ? "a" : "b",
    connectionId: actionHash,
  };

  return {
    domain,
    types,
    primaryType: "Agent" as const,
    message
  };
}

function hashHyperliquidAction(action: unknown, nonce: number): `0x${string}` {
  const actionStr = JSON.stringify(action);
  const combined = `${actionStr}${nonce}`;
  return keccak256(stringToHex(combined));
}

function formatSize(size: number, szDecimals: number): string {
  const formatted = size.toFixed(szDecimals);
  return parseFloat(formatted).toString();
}

function formatPrice(price: number): string {
  const formatted = price.toFixed(2);
  return parseFloat(formatted).toString();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { profileId, asset, amountUsd, slippage = 1 } = await req.json();

    if (!profileId || !asset || !amountUsd) {
      throw new Error("Missing required fields: profileId, asset, amountUsd");
    }

    console.log(`Spot buy request: ${amountUsd} USD -> ${asset} for profile ${profileId}`);

    // Get profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", profileId)
      .single();

    if (profileError || !profile) {
      throw new Error("Profile not found");
    }

    const typedProfile = profile as Profile;
    const networkMode = typedProfile.network_mode || 'mainnet';
    const isMainnet = networkMode === 'mainnet';
    const exchangeUrl = isMainnet ? MAINNET_EXCHANGE_URL : TESTNET_EXCHANGE_URL;

    // Ensure user has an agent wallet (create one if needed)
    const agentWallet = await ensureAgentWallet(supabase, typedProfile);

    // Get current price
    const currentPrice = await getSpotPrice(asset, networkMode);
    console.log(`Current ${asset} price: $${currentPrice}`);

    // Get asset metadata
    const assetMeta = SPOT_ASSET_META[asset];
    if (!assetMeta) {
      throw new Error(`Asset ${asset} not supported for spot trading`);
    }

    // Calculate size and limit price
    const amountCrypto = amountUsd / currentPrice;
    const slippageMultiplier = 1 + (slippage / 100);
    const limitPrice = currentPrice * slippageMultiplier;
    
    const formattedSize = formatSize(amountCrypto, assetMeta.szDecimals);
    const formattedPrice = formatPrice(limitPrice);

    console.log(`Placing spot order: ${formattedSize} ${asset} @ ${formattedPrice} (market: ${currentPrice})`);

    const timestamp = Date.now();
    
    // Build spot order action
    // For spot, we use the spot order format
    const action = {
      type: "order",
      orders: [{
        a: assetMeta.tokenId,
        b: true, // isBuy
        p: formattedPrice,
        s: formattedSize,
        r: false, // reduceOnly
        t: { limit: { tif: "Ioc" } } // Immediate-or-cancel
      }],
      grouping: "na"
    };

    // Build typed data
    const typedData = buildOrderTypedData(action, timestamp, isMainnet);
    
    // Sign with agent wallet
    const signature = await signTypedDataWithAgentWallet(agentWallet.privateKey, typedData);
    const tradingAddress = agentWallet.address;

    // Submit to Hyperliquid
    // NOTE: vaultAddress is only for subaccounts/vaults. For normal user trading via agent wallets, keep this null.
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

    console.log("Submitting spot order to Hyperliquid...");

    const response = await fetch(exchangeUrl, {
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
                    `spot-${timestamp}`;

    // Record the transaction
    const { error: txError } = await supabase
      .from("wallet_transactions")
      .insert({
        user_id: profileId,
        type: "buy",
        asset: asset,
        symbol: asset,
        amount: parseFloat(formattedSize),
        price: currentPrice,
        total: amountUsd,
        timestamp: new Date().toISOString(),
        status: "completed",
        hyperliquid_tx_hash: orderId
      });

    if (txError) {
      console.error("Error recording transaction:", txError);
      // Don't throw - transaction succeeded even if recording failed
    }

    console.log(`Spot buy successful: ${formattedSize} ${asset} @ $${currentPrice}`);

    return new Response(
      JSON.stringify({
        success: true,
        orderId,
        asset,
        amountUsd,
        amountCrypto: parseFloat(formattedSize),
        price: currentPrice,
        tradingAddress
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Spot buy error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});