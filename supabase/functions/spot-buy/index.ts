import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as msgpackEncode } from "https://esm.sh/@msgpack/msgpack@3.1.1";
import { keccak256, toHex } from "https://esm.sh/viem@2.21.0";
import { privateKeyToAccount, generatePrivateKey } from "https://esm.sh/viem@2.21.0/accounts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Profile {
  id: string;
  user_id: string;
  privy_did: string;
  wallet_address: string;
  network_mode: "mainnet" | "testnet";
  wallet_type: "privy" | "external" | null;
  agent_wallet_address: string | null;
  agent_wallet_private_key_encrypted: string | null;
  agent_wallet_authorized_at?: string | null;
}

// Network URLs
const MAINNET_INFO_URL = "https://api.hyperliquid.xyz/info";
const MAINNET_EXCHANGE_URL = "https://api.hyperliquid.xyz/exchange";
const TESTNET_INFO_URL = "https://api.hyperliquid-testnet.xyz/info";
const TESTNET_EXCHANGE_URL = "https://api.hyperliquid-testnet.xyz/exchange";

// Size decimals for common perps (fallback if meta lookup doesn't include size decimals)
const PERP_SZ_DECIMALS: Record<string, number> = {
  BTC: 5,
  ETH: 4,
  SOL: 2,
  DOGE: 0,
  AVAX: 2,
  LINK: 2,
  HYPE: 2,
  PURR: 0,
};

// Decrypt the stored private key
function decryptPrivateKey(encrypted: string): string | null {
  try {
    const decoded = atob(encrypted);
    const parts = decoded.split(":");
    if (parts.length >= 2) {
      return parts.slice(1).join(":");
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
  const rotateAgentWallet = async () => {
    console.log("Rotating agent wallet (missing/mismatched key)...");
    const newPrivateKey = generatePrivateKey();
    const account = privateKeyToAccount(newPrivateKey);
    const encryptedKey = encryptPrivateKey(newPrivateKey);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        agent_wallet_address: account.address as string,
        agent_wallet_private_key_encrypted: encryptedKey,
        // Key/address changed => prior authorization is invalid
        agent_wallet_authorized_at: null,
      })
      .eq("id", profile.id);

    if (updateError) {
      throw new Error(`Failed to store agent wallet: ${updateError.message}`);
    }

    console.log(`Created new agent wallet: ${account.address}`);
    return { address: account.address, privateKey: newPrivateKey };
  };

  // If already has an agent wallet, decrypt and validate it
  if (profile.agent_wallet_private_key_encrypted && profile.agent_wallet_address) {
    const privateKey = decryptPrivateKey(profile.agent_wallet_private_key_encrypted);
    if (privateKey) {
      const derived = privateKeyToAccount(privateKey as `0x${string}`).address;
      if (derived.toLowerCase() === profile.agent_wallet_address.toLowerCase()) {
        console.log(`Using existing agent wallet: ${profile.agent_wallet_address}`);
        return { address: profile.agent_wallet_address, privateKey };
      }

      console.warn(
        `Agent wallet mismatch: stored=${profile.agent_wallet_address} derived=${derived}. Rotating.`
      );
      return await rotateAgentWallet();
    }

    console.warn("Failed to decrypt agent wallet key. Rotating.");
    return await rotateAgentWallet();
  }

  // No agent wallet yet
  return await rotateAgentWallet();
}

// Get current price from Hyperliquid
async function getSpotPrice(asset: string, networkMode: string): Promise<number> {
  const infoUrl = networkMode === "testnet" ? TESTNET_INFO_URL : MAINNET_INFO_URL;

  // Just use allMids for now (these are the mids shown in our UI)
  const midsResponse = await fetch(infoUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "allMids" }),
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

// Perps use meta.universe index as the asset id
async function getPerpAssetId(asset: string, networkMode: string): Promise<number> {
  const infoUrl = networkMode === "testnet" ? TESTNET_INFO_URL : MAINNET_INFO_URL;

  const metaResponse = await fetch(infoUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "meta" }),
  });

  if (!metaResponse.ok) {
    throw new Error(`Failed to fetch meta: ${metaResponse.statusText}`);
  }

  const meta = await metaResponse.json();
  const universe: Array<{ name: string }> = meta?.universe ?? [];
  const idx = universe.findIndex((u) => u.name === asset);

  if (idx < 0) {
    throw new Error(`Unsupported asset for trading: ${asset}`);
  }

  return idx;
}

function formatSize(size: number, szDecimals: number): string {
  const formatted = size.toFixed(szDecimals);
  return parseFloat(formatted).toString();
}

function formatPrice(price: number): string {
  const formatted = price.toFixed(2);
  return parseFloat(formatted).toString();
}

function hexToRsv(signatureHex: string): { r: string; s: string; v: number } {
  const sig = signatureHex.startsWith("0x") ? signatureHex.slice(2) : signatureHex;
  const r = `0x${sig.slice(0, 64)}`;
  const s = `0x${sig.slice(64, 128)}`;
  // viem signTypedData returns v as 27 or 28 already (not 0/1)
  let v = parseInt(sig.slice(128, 130), 16);
  // If it's 0 or 1 (raw yParity), convert to 27/28
  if (v < 27) {
    v += 27;
  }
  return { r, s, v };
}

// Correct Hyperliquid L1 action signing (matches SDK behavior)
async function signL1ActionWithAgentWallet(params: {
  privateKey: string;
  action: unknown;
  nonce: number;
  isMainnet: boolean;
  vaultAddress: string | null;
}): Promise<{ r: string; s: string; v: number }> {
  const { privateKey, action, nonce, isMainnet, vaultAddress } = params;

  // 1) msgpack encode action
  const actionBytes = msgpackEncode(action) as Uint8Array;

  // 2) append vault address (20 bytes, all zeros if null)
  const vaultBytes = vaultAddress
    ? Uint8Array.from(
        (vaultAddress.startsWith("0x") ? vaultAddress.slice(2) : vaultAddress)
          .toLowerCase()
          .match(/.{1,2}/g)!
          .map((b) => parseInt(b, 16))
      )
    : new Uint8Array(20);

  // 3) append nonce as 8-byte big-endian
  const nonceHex = BigInt(nonce).toString(16).padStart(16, "0");
  const nonceBytes = Uint8Array.from(nonceHex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));

  const concat = new Uint8Array(actionBytes.length + vaultBytes.length + nonceBytes.length);
  concat.set(actionBytes, 0);
  concat.set(vaultBytes, actionBytes.length);
  concat.set(nonceBytes, actionBytes.length + vaultBytes.length);

  // 4) keccak256 hash => connectionId
  const connectionId = keccak256(toHex(concat));

  // 5) sign EIP-712 typed data with chainId=1337 (Hyperliquid L1 actions)
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const signatureHex = await account.signTypedData({
    domain: {
      name: "Exchange",
      version: "1",
      chainId: 1337,
      verifyingContract: "0x0000000000000000000000000000000000000000",
    },
    types: {
      Agent: [
        { name: "source", type: "string" },
        { name: "connectionId", type: "bytes32" },
      ],
    },
    primaryType: "Agent",
    message: {
      source: isMainnet ? "a" : "b",
      connectionId,
    },
  } as any);

  return hexToRsv(signatureHex);
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

    // IMPORTANT: agent wallets must be approved on Hyperliquid by the user's main wallet
    if (!typedProfile.agent_wallet_authorized_at) {
      throw new Error(
        "Agent wallet not authorized yet. Open Wallet → Authorize Agent Wallet, then try again."
      );
    }

    console.log(
      `Trading setup: user=${typedProfile.wallet_address} agent=${agentWallet.address} net=${networkMode}`
    );

    // Get current price
    const currentPrice = await getSpotPrice(asset, networkMode);
    console.log(`Current ${asset} price: $${currentPrice}`);

    // Resolve perp asset id + size decimals
    const perpAssetId = await getPerpAssetId(asset, networkMode);
    const szDecimals = PERP_SZ_DECIMALS[asset] ?? 4;

    // Calculate size and limit price
    const amountCrypto = amountUsd / currentPrice;
    const slippageMultiplier = 1 + (slippage / 100);
    const limitPrice = currentPrice * slippageMultiplier;

    const formattedSize = formatSize(amountCrypto, szDecimals);
    const formattedPrice = formatPrice(limitPrice);

    console.log(
      `Placing order: assetId=${perpAssetId} ${formattedSize} ${asset} @ ${formattedPrice} (market: ${currentPrice})`
    );

    const timestamp = Date.now();

    // Perp order action (meta.universe index)
    // IMPORTANT: Hyperliquid signatures are sensitive to msgpack field ordering.
    // We keep a plain JS object for the HTTP request body, and a Map-based version
    // (stable insertion order) for msgpack signing.
    const actionBody = {
      type: "order",
      orders: [
        {
          a: perpAssetId,
          b: true, // isBuy
          p: formattedPrice,
          s: formattedSize,
          r: false, // reduceOnly
          t: { limit: { tif: "Ioc" } },
        },
      ],
      grouping: "na",
    };

    const actionForSigning = new Map<string, unknown>([
      ["type", "order"],
      [
        "orders",
        [
          new Map<string, unknown>([
            ["a", perpAssetId],
            ["b", true],
            ["p", formattedPrice],
            ["s", formattedSize],
            ["r", false],
            [
              "t",
              new Map<string, unknown>([
                ["limit", new Map<string, unknown>([["tif", "Ioc"]])],
              ]),
            ],
          ]),
        ],
      ],
      ["grouping", "na"],
    ]);

    // Sign & submit as a Hyperliquid L1 action (SDK-style signing)
    const sig = await signL1ActionWithAgentWallet({
      privateKey: agentWallet.privateKey,
      action: actionForSigning,
      nonce: timestamp,
      isMainnet,
      vaultAddress: null,
    });

    const tradingAddress = agentWallet.address;

    // Submit to Hyperliquid
    // NOTE: vaultAddress is only for subaccounts/vaults. For normal user trading via agent wallets, keep this null.
    const requestBody = {
      action: actionBody,
      nonce: timestamp,
      signature: sig,
      vaultAddress: null,
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