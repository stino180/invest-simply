import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// CoinGecko API (free tier)
const COINGECKO_API = "https://api.coingecko.com/api/v3";

// Popular crypto IDs on CoinGecko
const CRYPTO_IDS = [
  'bitcoin',
  'ethereum', 
  'solana',
  'avalanche-2',
  'chainlink',
  'arbitrum',
  'optimism',
  'matic-network',
  'dogecoin',
  'cardano',
  'polkadot',
  'uniswap',
  'aave',
  'maker',
  'compound-governance-token'
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching crypto prices from CoinGecko...');

    // Fetch market data with sparkline
    const response = await fetch(
      `${COINGECKO_API}/coins/markets?vs_currency=usd&ids=${CRYPTO_IDS.join(',')}&order=market_cap_desc&per_page=50&page=1&sparkline=true&price_change_percentage=24h`,
      {
        headers: {
          'Accept': 'application/json',
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('CoinGecko API error:', response.status, errorText);
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`Fetched ${data.length} assets from CoinGecko`);

    // Transform to our format
    const assets = data.map((coin: any) => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      image: coin.image,
      price: coin.current_price,
      change24h: coin.price_change_percentage_24h || 0,
      marketCap: coin.market_cap,
      volume24h: coin.total_volume,
      sparkline: coin.sparkline_in_7d?.price?.slice(-24) || [], // Last 24 points
    }));

    return new Response(JSON.stringify({
      success: true,
      assets,
      fetchedAt: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error fetching crypto prices:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
