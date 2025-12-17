import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
}

interface Profile {
  id: string;
  user_id: string;
  privy_did: string;
  wallet_address: string;
}

// Hyperliquid mainnet info endpoint
const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";
const HYPERLIQUID_EXCHANGE_URL = "https://api.hyperliquid.xyz/exchange";

// Get current price from Hyperliquid
async function getAssetPrice(asset: string): Promise<number> {
  const response = await fetch(HYPERLIQUID_INFO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "allMids"
    })
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

// Sign a message using Privy's server-side wallet API
async function signWithPrivy(
  privyDid: string,
  walletAddress: string,
  message: string
): Promise<string> {
  const PRIVY_APP_ID = Deno.env.get("PRIVY_APP_ID");
  const PRIVY_APP_SECRET = Deno.env.get("PRIVY_APP_SECRET");

  if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
    throw new Error("Privy credentials not configured");
  }

  // Privy server wallet signing endpoint
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
        method: "personal_sign",
        params: {
          message: message,
          encoding: "utf-8"
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Privy signing error:", errorText);
    throw new Error(`Privy signing failed: ${response.status}`);
  }

  const result = await response.json();
  return result.data.signature;
}

// Build and sign Hyperliquid order
async function executeHyperliquidOrder(
  profile: Profile,
  asset: string,
  amountUsd: number,
  price: number
): Promise<{ orderId: string; amountCrypto: number }> {
  const amountCrypto = amountUsd / price;
  
  // Hyperliquid order action
  const timestamp = Date.now();
  const action = {
    type: "order",
    orders: [{
      a: getAssetIndex(asset), // asset index
      b: true, // isBuy
      p: price.toFixed(2), // price (market order uses current price)
      s: amountCrypto.toFixed(6), // size
      r: false, // reduceOnly
      t: { limit: { tif: "Ioc" } } // Immediate or cancel for market-like behavior
    }],
    grouping: "na"
  };

  const actionHash = await hashAction(action, timestamp);
  
  // Sign with Privy
  const signature = await signWithPrivy(
    profile.privy_did,
    profile.wallet_address,
    actionHash
  );

  // Submit to Hyperliquid
  const response = await fetch(HYPERLIQUID_EXCHANGE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      nonce: timestamp,
      signature,
      vaultAddress: null
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Hyperliquid order failed: ${errorText}`);
  }

  const result = await response.json();
  
  if (result.status === "err") {
    throw new Error(`Hyperliquid error: ${result.response}`);
  }

  return {
    orderId: result.response?.data?.statuses?.[0]?.resting?.oid || `dca-${timestamp}`,
    amountCrypto
  };
}

// Get Hyperliquid asset index (simplified mapping)
function getAssetIndex(asset: string): number {
  const assetMap: Record<string, number> = {
    "BTC": 0,
    "ETH": 1,
    "SOL": 5,
    // Add more as needed
  };
  return assetMap[asset] ?? 0;
}

// Hash action for signing (simplified - real implementation needs EIP-712)
async function hashAction(action: unknown, timestamp: number): Promise<string> {
  const message = JSON.stringify({ action, nonce: timestamp });
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return "0x" + hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
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
      return new Date(now.setMonth(now.getMonth() + 1));
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
        profiles!inner(id, user_id, privy_did, wallet_address)
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
      
      if (!profile?.wallet_address || !profile?.privy_did) {
        console.log(`Skipping plan ${plan.id}: missing wallet or privy_did`);
        continue;
      }

      try {
        console.log(`Executing DCA for plan ${plan.id}: ${plan.amount_usd} USD -> ${plan.asset}`);

        // Get current price
        const price = await getAssetPrice(plan.asset);
        console.log(`Current ${plan.asset} price: $${price}`);

        // Execute order via Hyperliquid
        const { orderId, amountCrypto } = await executeHyperliquidOrder(
          profile,
          plan.asset,
          plan.amount_usd,
          price
        );

        // Record execution
        const { error: execError } = await supabase
          .from("dca_executions")
          .insert({
            plan_id: plan.id,
            amount_usd: plan.amount_usd,
            amount_crypto: amountCrypto,
            price_at_execution: price,
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
          price
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
