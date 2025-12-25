import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as msgpackEncode } from "https://esm.sh/@msgpack/msgpack@3.1.1";
import { keccak256, toHex } from "https://esm.sh/viem@2.21.0";
import { privateKeyToAccount, generatePrivateKey } from "https://esm.sh/viem@2.21.0/accounts";
import { encode as hexEncode, decode as hexDecode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

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

class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
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
      // Don't retry on HTTP errors (4xx, 5xx) - only on network failures
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

// AES-256-GCM decryption for private keys
async function decryptPrivateKey(encrypted: string, profileId: string): Promise<string | null> {
  try {
    const encryptionKey = Deno.env.get("ENCRYPTION_KEY");
    if (!encryptionKey) {
      console.error("ENCRYPTION_KEY not configured");
      return null;
    }

    // Derive the same key from encryption key + profileId
    const keyMaterial = new TextEncoder().encode(encryptionKey + profileId);
    const hashBuffer = await crypto.subtle.digest("SHA-256", keyMaterial);
    
    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      hashBuffer,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    // Decode hex string
    const combined = hexDecode(new TextEncoder().encode(encrypted));
    
    // Extract IV (first 12 bytes) and ciphertext
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      cryptoKey,
      ciphertext
    );

    return new TextDecoder().decode(plaintext);
  } catch (error) {
    console.error("AES decryption failed:", error);
    return null;
  }
}

// Legacy decryption for migrating old base64-encoded keys
function decryptLegacyKey(encrypted: string): string | null {
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

// AES-256-GCM encryption for private keys
async function encryptPrivateKey(privateKey: string, profileId: string): Promise<string> {
  const encryptionKey = Deno.env.get("ENCRYPTION_KEY");
  if (!encryptionKey) {
    throw new Error("ENCRYPTION_KEY not configured");
  }

  // Derive a 256-bit key from the encryption key + profileId using SHA-256
  const keyMaterial = new TextEncoder().encode(encryptionKey + profileId);
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyMaterial);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    hashBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );

  // Generate a random 12-byte IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const plaintext = new TextEncoder().encode(privateKey);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    plaintext
  );

  // Combine IV + ciphertext and encode as hex
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  
  return new TextDecoder().decode(hexEncode(combined));
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
    const encryptedKey = await encryptPrivateKey(newPrivateKey, profile.id);

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
    // Try AES-256-GCM decryption first, then legacy base64
    let privateKey = await decryptPrivateKey(profile.agent_wallet_private_key_encrypted, profile.id);
    
    if (!privateKey) {
      // Try legacy decryption for migration
      privateKey = decryptLegacyKey(profile.agent_wallet_private_key_encrypted);
      if (privateKey) {
        console.log("Migrating legacy encrypted key to AES-256-GCM");
        // Re-encrypt with new method
        const newEncrypted = await encryptPrivateKey(privateKey, profile.id);
        await supabase
          .from("profiles")
          .update({ agent_wallet_private_key_encrypted: newEncrypted })
          .eq("id", profile.id);
      }
    }
    
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

// Get current price from Hyperliquid with retry
async function getSpotPrice(asset: string, networkMode: string): Promise<number> {
  const infoUrl = networkMode === "testnet" ? TESTNET_INFO_URL : MAINNET_INFO_URL;

  const midsResponse = await fetchWithRetry(infoUrl, {
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

// Spot uses spotMeta to get asset info (index, size decimals, etc.)
interface SpotAssetInfo {
  assetId: number;  // 10000 + spotMeta index
  szDecimals: number;
  name: string;
}

async function getSpotAssetInfo(asset: string, networkMode: string): Promise<SpotAssetInfo> {
  const infoUrl = networkMode === "testnet" ? TESTNET_INFO_URL : MAINNET_INFO_URL;

  const spotMetaResponse = await fetchWithRetry(infoUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "spotMeta" }),
  });

  if (!spotMetaResponse.ok) {
    throw new Error(`Failed to fetch spotMeta: ${spotMetaResponse.statusText}`);
  }

  const spotMeta = await spotMetaResponse.json();
  
  // spotMeta has a "universe" array with spot pairs
  // Each item has: { name, tokens, index, ... }
  // We need to match by the base token symbol (e.g., "HYPE" from "HYPE/USDC")
  const universe: Array<{ name: string; tokens: number[]; index: number; szDecimals?: number }> = 
    spotMeta?.universe ?? [];
  
  // The "name" in spotMeta is typically "TOKEN/USDC" format
  // Match either the exact name or the base token
  let spotInfo = universe.find((u) => 
    u.name === asset || 
    u.name === `${asset}/USDC` ||
    u.name.split("/")[0] === asset
  );

  if (!spotInfo) {
    // Also check for @asset format used in some APIs
    spotInfo = universe.find((u) => u.name === `@${asset}`);
  }

  if (!spotInfo) {
    console.log("Available spot pairs:", universe.map(u => u.name).join(", "));
    throw new Error(`Spot asset ${asset} not found in spotMeta. Available: ${universe.slice(0, 10).map(u => u.name).join(", ")}...`);
  }

  // Spot asset ID = 10000 + spotMeta index
  const assetId = SPOT_ASSET_OFFSET + spotInfo.index;
  const szDecimals = spotInfo.szDecimals ?? 4;  // Default to 4 if not specified

  console.log(`Resolved spot asset: ${spotInfo.name} -> assetId=${assetId}, szDecimals=${szDecimals}`);

  return {
    assetId,
    szDecimals,
    name: spotInfo.name,
  };
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

    // Re-fetch authorization status after ensureAgentWallet, because ensureAgentWallet
    // may rotate keys/addresses and the original typedProfile can be stale.
    const { data: authProfile, error: authProfileError } = await supabase
      .from("profiles")
      .select("agent_wallet_address, agent_wallet_authorized_at")
      .eq("id", profileId)
      .single();

    if (authProfileError || !authProfile) {
      throw new Error("Failed to verify agent wallet authorization status");
    }

    const dbAgentAddress = (authProfile.agent_wallet_address as string | null) ?? null;
    const dbAuthorizedAt = (authProfile.agent_wallet_authorized_at as string | null) ?? null;

    // IMPORTANT: agent wallets must be approved on Hyperliquid by the user's main wallet.
    // If the agent wallet rotated, dbAuthorizedAt will be null.
    if (!dbAuthorizedAt || !dbAgentAddress || dbAgentAddress.toLowerCase() !== agentWallet.address.toLowerCase()) {
      throw new HttpError(
        "Agent wallet not authorized yet. Open Wallet → Authorize Agent Wallet, then try again.",
        409
      );
    }

    console.log(
      `Trading setup: user=${typedProfile.wallet_address} agent=${agentWallet.address} net=${networkMode}`
    );

    // Get current price
    const currentPrice = await getSpotPrice(asset, networkMode);
    console.log(`Current ${asset} price: $${currentPrice}`);

    // Resolve SPOT asset info (not perp!)
    const spotInfo = await getSpotAssetInfo(asset, networkMode);
    const spotAssetId = spotInfo.assetId;
    const szDecimals = spotInfo.szDecimals;

    // Calculate size and limit price
    const amountCrypto = amountUsd / currentPrice;
    const slippageMultiplier = 1 + (slippage / 100);
    const limitPrice = currentPrice * slippageMultiplier;

    const formattedSize = formatSize(amountCrypto, szDecimals);
    const formattedPrice = formatPrice(limitPrice);

    console.log(
      `Placing SPOT order: assetId=${spotAssetId} (${spotInfo.name}) ${formattedSize} ${asset} @ ${formattedPrice} (market: ${currentPrice})`
    );

    const timestamp = Date.now();

    // SPOT order action - uses 10000 + spotMeta index
    // IMPORTANT: Hyperliquid signatures are sensitive to msgpack field ordering.
    // We keep a plain JS object for the HTTP request body, and a Map-based version
    // (stable insertion order) for msgpack signing.
    const actionBody = {
      type: "order",
      orders: [
        {
          a: spotAssetId,  // SPOT asset ID = 10000 + spotMeta index
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
            ["a", spotAssetId],  // SPOT asset ID
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

    console.log("Submitting SPOT order to Hyperliquid...");

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
      const hlMsg = String(result.response ?? "");

      // Hyperliquid returns this when the currently-signing agent wallet isn't registered/approved.
      // Our UI marks authorization optimistically, so if HL rejects we clear authorization and
      // force the user to re-authorize the CURRENT agent address.
      if (hlMsg.toLowerCase().includes("does not exist")) {
        await supabase
          .from("profiles")
          .update({ agent_wallet_authorized_at: null })
          .eq("id", profileId);

        throw new HttpError(
          `Agent wallet not recognized by Hyperliquid yet. Open Wallet → Authorize Agent Wallet for ${agentWallet.address}, then try again.`,
          409
        );
      }

      throw new HttpError(`Hyperliquid error: ${hlMsg}`, 502);
    }

    const orderId = result.response?.data?.statuses?.[0]?.resting?.oid || 
                    result.response?.data?.statuses?.[0]?.filled?.oid ||
                    `spot-${timestamp}`;

    // Record the transaction with retry for failed inserts
    let txRecorded = false;
    for (let attempt = 0; attempt < 3; attempt++) {
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

      if (!txError) {
        txRecorded = true;
        break;
      }
      
      console.error(`Transaction recording attempt ${attempt + 1}/3 failed:`, txError);
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      }
    }

    if (!txRecorded) {
      // Log critical warning - trade succeeded but record failed
      console.error("CRITICAL: Trade succeeded but failed to record transaction after retries", {
        profileId,
        orderId,
        asset,
        amountUsd,
        amountCrypto: parseFloat(formattedSize),
        price: currentPrice,
        timestamp: new Date().toISOString()
      });
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

    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unknown error";

    return new Response(
      JSON.stringify({
        success: false,
        error: message,
      }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});