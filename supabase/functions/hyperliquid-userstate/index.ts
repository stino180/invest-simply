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

    const lowercaseAddress = address.toLowerCase();

    // Fetch both perps (clearinghouseState) and spot (spotClearinghouseState) in parallel
    const [perpsRes, spotRes] = await Promise.all([
      fetch(infoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'clearinghouseState', user: lowercaseAddress }),
      }),
      fetch(infoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'spotClearinghouseState', user: lowercaseAddress }),
      }),
    ]);

    const perpsText = await perpsRes.text();
    const spotText = await spotRes.text();

    let perpsData: unknown = null;
    let spotData: unknown = null;

    try {
      perpsData = JSON.parse(perpsText);
    } catch {
      perpsData = { raw: perpsText };
    }

    try {
      spotData = JSON.parse(spotText);
    } catch {
      spotData = { raw: spotText };
    }

    console.log(`Fetched state for ${lowercaseAddress} on ${networkMode}:`);
    console.log('Perps:', JSON.stringify(perpsData).substring(0, 200));
    console.log('Spot:', JSON.stringify(spotData).substring(0, 200));

    return new Response(
      JSON.stringify({
        success: true,
        networkMode,
        address: lowercaseAddress,
        perpsState: perpsData,
        spotState: spotData,
        // Keep userState for backward compat (now uses perps data)
        userState: perpsData,
      }),
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
