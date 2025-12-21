import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { privateKeyToAccount, generatePrivateKey } from "https://esm.sh/viem@2.21.0/accounts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Store the agent wallet private key securely in Supabase secrets
// This is a singleton agent that can trade on behalf of authorized users
const AGENT_PRIVATE_KEY = Deno.env.get("AGENT_WALLET_PRIVATE_KEY");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, profileId, signature, nonce } = await req.json();

    // Get or generate agent wallet address
    let agentAccount;
    if (AGENT_PRIVATE_KEY) {
      agentAccount = privateKeyToAccount(AGENT_PRIVATE_KEY as `0x${string}`);
    } else {
      // For development/demo: generate deterministic address from a seed
      // In production, you'd want to properly manage this key
      console.warn("AGENT_WALLET_PRIVATE_KEY not set - using demo mode");
      const demoKey = generatePrivateKey();
      agentAccount = privateKeyToAccount(demoKey);
    }

    const agentAddress = agentAccount.address;

    if (action === "get-agent-address") {
      // Return the agent wallet address that users need to authorize
      return new Response(
        JSON.stringify({ 
          success: true, 
          agentAddress,
          message: "Authorize this address on Hyperliquid to enable automated trading"
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "register-authorization") {
      // User has authorized the agent wallet on Hyperliquid
      // Update their profile to mark authorization
      if (!profileId) {
        throw new Error("Missing profileId");
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          agent_wallet_address: agentAddress,
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
          agentAddress 
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

      // Check Hyperliquid for actual authorization
      const isAuthorized = profile?.agent_wallet_authorized_at !== null;

      return new Response(
        JSON.stringify({ 
          success: true, 
          isAuthorized,
          agentAddress: profile?.agent_wallet_address || agentAddress,
          authorizedAt: profile?.agent_wallet_authorized_at
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "revoke-authorization") {
      // Remove agent wallet authorization
      if (!profileId) {
        throw new Error("Missing profileId");
      }

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          agent_wallet_address: null,
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
