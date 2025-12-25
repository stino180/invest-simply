// Supabase Edge Function: hyperliquid-userstate
// Purpose: fetch Hyperliquid /info userState for a given wallet (avoids CORS from browser)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type NetworkMode = 'mainnet' | 'testnet';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const address = String(body?.address || '').trim();
    const networkMode = (body?.networkMode as NetworkMode) || 'mainnet';

    if (!address || !address.startsWith('0x') || address.length < 10) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const infoUrl =
      networkMode === 'testnet'
        ? 'https://api.hyperliquid-testnet.xyz/info'
        : 'https://api.hyperliquid.xyz/info';

    const hlRes = await fetch(infoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'userState', user: address.toLowerCase() }),
    });

    const text = await hlRes.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    return new Response(
      JSON.stringify({ success: true, networkMode, address: address.toLowerCase(), userState: json }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('hyperliquid-userstate error:', e);
    return new Response(
      JSON.stringify({ success: false, error: 'Unexpected error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
