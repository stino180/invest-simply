import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { privateKeyToAccount, generatePrivateKey } from "https://esm.sh/viem@2.21.0/accounts";
import { encode as hexEncode, decode as hexDecode } from "https://deno.land/std@0.168.0/encoding/hex.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

async function decryptPrivateKey(encrypted: string, profileId: string): Promise<string | null> {
  try {
    const encryptionKey = Deno.env.get("ENCRYPTION_KEY");
    if (!encryptionKey) {
      console.error("ENCRYPTION_KEY not configured");
      return null;
    }

    // Derive the same key
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
    console.error("Decryption failed:", error);
    return null;
  }
}

// Legacy decryption for migrating old base64-encoded keys
function decryptLegacyKey(encrypted: string): string | null {
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, profileId, signature, nonce } = await req.json();

    if (action === "get-agent-address") {
      if (!profileId) {
        throw new Error("Missing profileId");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("agent_wallet_address, agent_wallet_private_key_encrypted, agent_wallet_authorized_at")
        .eq("id", profileId)
        .single();

      if (profileError) {
        throw profileError;
      }

      // If user already has an agent wallet, validate the stored private key matches the address.
      if (profile?.agent_wallet_address) {
        const encrypted = profile.agent_wallet_private_key_encrypted as string | null | undefined;
        
        // Try new AES decryption first, then legacy base64
        let decrypted: string | null = null;
        if (encrypted) {
          decrypted = await decryptPrivateKey(encrypted, profileId);
          if (!decrypted) {
            // Try legacy decryption for migration
            decrypted = decryptLegacyKey(encrypted);
            if (decrypted) {
              console.log("Migrating legacy encrypted key to AES-256-GCM");
              // Re-encrypt with new method
              const newEncrypted = await encryptPrivateKey(decrypted, profileId);
              await supabase
                .from("profiles")
                .update({ agent_wallet_private_key_encrypted: newEncrypted })
                .eq("id", profileId);
            }
          }
        }

        if (decrypted) {
          const derived = privateKeyToAccount(decrypted as `0x${string}`).address;
          if (derived.toLowerCase() === profile.agent_wallet_address.toLowerCase()) {
            return new Response(
              JSON.stringify({
                success: true,
                agentAddress: profile.agent_wallet_address,
                isAuthorized: !!profile.agent_wallet_authorized_at,
                message: profile.agent_wallet_authorized_at
                  ? "Agent wallet is authorized for automated trading"
                  : "Authorize this address on Hyperliquid to enable automated trading",
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          console.warn(
            `Agent wallet mismatch detected. stored=${profile.agent_wallet_address} derived=${derived}. Rotating.`
          );
        } else {
          console.warn("Agent wallet key missing or failed to decrypt. Rotating.");
        }

        // Rotate agent wallet
        const agentPrivateKey = generatePrivateKey();
        const agentAccount = privateKeyToAccount(agentPrivateKey);
        const agentAddress = agentAccount.address;
        const encryptedKey = await encryptPrivateKey(agentPrivateKey, profileId);

        const { error: updateError } = await supabase
          .from("profiles")
          .update({
            agent_wallet_address: agentAddress,
            agent_wallet_private_key_encrypted: encryptedKey,
            agent_wallet_authorized_at: null,
          })
          .eq("id", profileId);

        if (updateError) {
          console.error("Error rotating agent wallet:", updateError);
          throw updateError;
        }

        return new Response(
          JSON.stringify({
            success: true,
            agentAddress,
            isAuthorized: false,
            message: "Agent wallet rotated. Please authorize the new address to enable automated trading.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Generate new agent wallet for this user if they don't have one
      const agentPrivateKey = generatePrivateKey();
      const agentAccount = privateKeyToAccount(agentPrivateKey);
      const agentAddress = agentAccount.address;
      const encryptedKey = await encryptPrivateKey(agentPrivateKey, profileId);

      // Save to profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          agent_wallet_address: agentAddress,
          agent_wallet_private_key_encrypted: encryptedKey,
        })
        .eq("id", profileId);

      if (updateError) {
        console.error("Error saving agent wallet:", updateError);
        throw updateError;
      }

      console.log(`Generated new agent wallet ${agentAddress} for profile ${profileId}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          agentAddress,
          isAuthorized: false,
          message: "Authorize this address on Hyperliquid to enable automated trading"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "register-authorization") {
      if (!profileId) {
        throw new Error("Missing profileId");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("agent_wallet_address")
        .eq("id", profileId)
        .single();

      if (profileError || !profile?.agent_wallet_address) {
        throw new Error("No agent wallet found for this profile");
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          agent_wallet_authorized_at: new Date().toISOString(),
          wallet_type: 'external'
        })
        .eq("id", profileId);

      if (updateError) {
        console.error("Error updating profile:", updateError);
        throw updateError;
      }

      console.log(`Agent wallet authorized for profile ${profileId}`);

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Agent wallet authorization recorded",
          agentAddress: profile.agent_wallet_address
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "check-authorization") {
      if (!profileId) {
        throw new Error("Missing profileId");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("wallet_address, agent_wallet_address, agent_wallet_authorized_at, network_mode")
        .eq("id", profileId)
        .single();

      if (profileError) {
        throw profileError;
      }

      const isAuthorized = profile?.agent_wallet_authorized_at !== null;

      return new Response(
        JSON.stringify({
          success: true,
          isAuthorized,
          agentAddress: profile?.agent_wallet_address,
          authorizedAt: profile?.agent_wallet_authorized_at,
          networkMode: profile?.network_mode,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "sync-authorization") {
      if (!profileId) {
        throw new Error("Missing profileId");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("wallet_address, agent_wallet_address, agent_wallet_authorized_at, network_mode")
        .eq("id", profileId)
        .single();

      if (profileError) throw profileError;

      const walletAddress = String(profile?.wallet_address || "").toLowerCase();
      const agentAddress = String(profile?.agent_wallet_address || "").toLowerCase();
      const networkMode = (profile?.network_mode as string) || "mainnet";

      if (!walletAddress || !agentAddress) {
        return new Response(
          JSON.stringify({ success: true, isAuthorized: false, message: "Missing wallet or agent address" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const infoUrl =
        networkMode === "testnet" ? "https://api.hyperliquid-testnet.xyz/info" : "https://api.hyperliquid.xyz/info";

      // Hyperliquid: fetch currently approved extra agents for the user
      const extraAgentsRes = await fetch(infoUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "extraAgents", user: walletAddress }),
      });

      const extraText = await extraAgentsRes.text();
      let extra: any = null;
      try {
        extra = JSON.parse(extraText);
      } catch {
        extra = null;
      }

      const list: Array<{ address?: string; validUntil?: number | string }> = Array.isArray(extra)
        ? extra
        : Array.isArray(extra?.response)
          ? extra.response
          : [];

      const now = Date.now();
      const found = list.find((a) => {
        const addr = String(a?.address || "").toLowerCase();
        const vu = Number(a?.validUntil ?? 0);
        return addr === agentAddress && Number.isFinite(vu) && vu > now;
      });

      if (!found) {
        return new Response(
          JSON.stringify({
            success: true,
            isAuthorized: false,
            message: "Agent not found in Hyperliquid extraAgents list",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Mark as authorized in our DB
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ agent_wallet_authorized_at: new Date().toISOString() })
        .eq("id", profileId);

      if (updateError) throw updateError;

      return new Response(
        JSON.stringify({
          success: true,
          isAuthorized: true,
          agentAddress: profile.agent_wallet_address,
          authorizedAt: new Date().toISOString(),
          message: "Authorization synced from Hyperliquid",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "revoke-authorization") {
      if (!profileId) {
        throw new Error("Missing profileId");
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          agent_wallet_authorized_at: null
        })
        .eq("id", profileId);

      if (updateError) {
        throw updateError;
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Agent wallet authorization revoked"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "get-agent-private-key") {
      if (!profileId) {
        throw new Error("Missing profileId");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("agent_wallet_private_key_encrypted, agent_wallet_authorized_at")
        .eq("id", profileId)
        .single();

      if (profileError) {
        throw profileError;
      }

      if (!profile?.agent_wallet_authorized_at) {
        throw new Error("Agent wallet not authorized");
      }

      if (!profile?.agent_wallet_private_key_encrypted) {
        throw new Error("No agent wallet key found");
      }

      // Try new decryption first, then legacy
      let privateKey = await decryptPrivateKey(profile.agent_wallet_private_key_encrypted, profileId);
      if (!privateKey) {
        privateKey = decryptLegacyKey(profile.agent_wallet_private_key_encrypted);
      }
      
      if (!privateKey) {
        throw new Error("Failed to decrypt agent wallet key");
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          privateKey
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (error) {
    console.error("Agent wallet error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
