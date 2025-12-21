import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { profileId, limit = 200 } = await req.json();

    if (!profileId) {
      throw new Error('Missing profileId');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const [holdingsRes, balanceRes, txRes] = await Promise.all([
      supabase
        .from('wallet_holdings')
        .select('*')
        .eq('user_id', profileId)
        .order('value_usd', { ascending: false }),
      supabase
        .from('wallet_balances')
        .select('*')
        .eq('user_id', profileId)
        .maybeSingle(),
      supabase
        .from('wallet_transactions')
        .select('*')
        .eq('user_id', profileId)
        .order('timestamp', { ascending: false })
        .limit(Math.min(Math.max(Number(limit) || 200, 1), 1000)),
    ]);

    if (holdingsRes.error) throw holdingsRes.error;
    if (balanceRes.error) throw balanceRes.error;
    if (txRes.error) throw txRes.error;

    return new Response(
      JSON.stringify({
        success: true,
        holdings: holdingsRes.data ?? [],
        balance: balanceRes.data ?? null,
        transactions: txRes.data ?? [],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-wallet-data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
