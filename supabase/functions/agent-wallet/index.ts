import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { privateKeyToAccount, generatePrivateKey } from "https://esm.sh/viem@2.21.0/accounts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Decrypt the stored private key
function decryptPrivateKey(encrypted: string): string | null {
  try {
    const decoded = atob(encrypted);
    const parts = decoded.split(':');
    if (parts.length >= 2) {
      // Return everything after the first colon (the private key)
      return parts.slice(1).join(':');
    }
    return null;
  } catch {
    return null;
  }
}

// Encrypt private key for storage
function encryptPrivateKey(privateKey: string, salt: string): string {
  const combined = `${salt}:${privateKey}`;
  return btoa(combined);
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
      // Get the user's specific agent wallet address
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
      // If mismatched/corrupted (from older versions), rotate wallet and require re-authorization.
      if (profile?.agent_wallet_address) {
        const encrypted = profile.agent_wallet_private_key_encrypted as string | null | undefined;
        const decrypted = encrypted ? decryptPrivateKey(encrypted) : null;

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
        const encryptedKey = encryptPrivateKey(agentPrivateKey, profileId);

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
      const encryptedKey = encryptPrivateKey(agentPrivateKey, profileId);

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
      // User has authorized the agent wallet on Hyperliquid
      if (!profileId) {
        throw new Error("Missing profileId");
      }

      // Get the user's agent wallet address
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
      // Check if user has authorized the agent on Hyperliquid
      if (!profileId) {
        throw new Error("Missing profileId");
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("wallet_address, agent_wallet_address, agent_wallet_authorized_at")
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
          authorizedAt: profile?.agent_wallet_authorized_at
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "revoke-authorization") {
      // Remove agent wallet authorization (but keep the wallet for future use)
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
      // Get the decrypted private key for trading operations (internal use only)
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

      const privateKey = decryptPrivateKey(profile.agent_wallet_private_key_encrypted);
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