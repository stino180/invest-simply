import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const HYPERLIQUID_INFO_URL = "https://api.hyperliquid.xyz/info";

interface SpotBalance {
  coin: string;
  hold: string;
  total: string;
  entryNtl: string;
}

interface SpotClearinghouseState {
  balances: SpotBalance[];
}

interface AssetPrice {
  coin: string;
  price: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from JWT
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Get user's profile with wallet address
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, wallet_address')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      throw new Error('Failed to fetch profile');
    }

    if (!profile?.wallet_address) {
      console.log('No wallet address found for user');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No wallet connected',
        holdings: [],
        balance: { usdc_balance: 0, total_value_usd: 0 }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Fetching Hyperliquid data for wallet: ${profile.wallet_address}`);

    // Fetch spot clearinghouse state from Hyperliquid
    const spotResponse = await fetch(HYPERLIQUID_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'spotClearinghouseState',
        user: profile.wallet_address
      })
    });

    if (!spotResponse.ok) {
      console.error('Hyperliquid API error:', await spotResponse.text());
      throw new Error('Failed to fetch from Hyperliquid');
    }

    const spotData: SpotClearinghouseState = await spotResponse.json();
    console.log('Spot data:', JSON.stringify(spotData));

    // Fetch current prices for all assets
    const pricesResponse = await fetch(HYPERLIQUID_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'allMids'
      })
    });

    let prices: Record<string, string> = {};
    if (pricesResponse.ok) {
      prices = await pricesResponse.json();
      console.log('Prices fetched:', Object.keys(prices).length, 'assets');
    }

    // Process balances
    const holdings: Array<{
      asset: string;
      symbol: string;
      amount: number;
      current_price: number;
      value_usd: number;
    }> = [];

    let usdcBalance = 0;
    let totalValue = 0;

    for (const balance of spotData.balances || []) {
      const amount = parseFloat(balance.total);
      if (amount <= 0) continue;

      const coin = balance.coin;
      
      if (coin === 'USDC') {
        usdcBalance = amount;
        totalValue += amount;
        continue;
      }

      // Get price for this asset
      const priceKey = `${coin}`;
      const price = prices[priceKey] ? parseFloat(prices[priceKey]) : 0;
      const valueUsd = amount * price;
      totalValue += valueUsd;

      holdings.push({
        asset: coin,
        symbol: coin,
        amount,
        current_price: price,
        value_usd: valueUsd
      });
    }

    console.log(`Processed ${holdings.length} holdings, USDC: ${usdcBalance}, Total: ${totalValue}`);

    // Clear existing holdings for this user
    await supabase
      .from('wallet_holdings')
      .delete()
      .eq('user_id', profile.id);

    // Insert new holdings
    if (holdings.length > 0) {
      const { error: holdingsError } = await supabase
        .from('wallet_holdings')
        .insert(holdings.map(h => ({
          user_id: profile.id,
          asset: h.asset,
          symbol: h.symbol,
          amount: h.amount,
          current_price: h.current_price,
          value_usd: h.value_usd,
          last_synced_at: new Date().toISOString()
        })));

      if (holdingsError) {
        console.error('Holdings insert error:', holdingsError);
      }
    }

    // Upsert wallet balance
    const { error: balanceError } = await supabase
      .from('wallet_balances')
      .upsert({
        user_id: profile.id,
        usdc_balance: usdcBalance,
        total_value_usd: totalValue,
        last_synced_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (balanceError) {
      console.error('Balance upsert error:', balanceError);
    }

    return new Response(JSON.stringify({
      success: true,
      holdings,
      balance: {
        usdc_balance: usdcBalance,
        total_value_usd: totalValue
      },
      last_synced_at: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in sync-hyperliquid:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
