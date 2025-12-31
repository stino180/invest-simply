import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Network URLs
const HYPERLIQUID_MAINNET_URL = "https://api.hyperliquid.xyz/info";
const HYPERLIQUID_TESTNET_URL = "https://api.hyperliquid-testnet.xyz/info";

// Popular spot tokens on Hyperliquid
const SPOT_TOKENS = [
  'HYPE', 'PURR', 'JEFF', 'PIP', 'CATBAL', 'BUDDY', 'FARM', 'RAGE', 
  'LQNA', 'WETH', 'WBTC', 'USDC0', 'USDT0'
];

// Token metadata (logos and colors)
const TOKEN_METADATA: Record<string, { name: string; color: string; image?: string }> = {
  HYPE: { name: 'Hyperliquid', color: '#22D3EE', image: 'https://app.hyperliquid.xyz/icons/HYPE.svg' },
  PURR: { name: 'Purr', color: '#F472B6', image: 'https://app.hyperliquid.xyz/icons/PURR.svg' },
  JEFF: { name: 'Jeff', color: '#FBBF24', image: 'https://app.hyperliquid.xyz/icons/JEFF.svg' },
  PIP: { name: 'Pip', color: '#34D399', image: 'https://app.hyperliquid.xyz/icons/PIP.svg' },
  CATBAL: { name: 'Catbal', color: '#A78BFA', image: 'https://app.hyperliquid.xyz/icons/CATBAL.svg' },
  BUDDY: { name: 'Buddy', color: '#FB923C', image: 'https://app.hyperliquid.xyz/icons/BUDDY.svg' },
  FARM: { name: 'HyperFarm', color: '#4ADE80', image: 'https://app.hyperliquid.xyz/icons/FARM.svg' },
  RAGE: { name: 'Rage Trade', color: '#EF4444', image: 'https://app.hyperliquid.xyz/icons/RAGE.svg' },
  LQNA: { name: 'Liqna', color: '#06B6D4', image: 'https://app.hyperliquid.xyz/icons/LQNA.svg' },
  WETH: { name: 'Wrapped ETH', color: '#627EEA', image: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
  WBTC: { name: 'Wrapped BTC', color: '#F7931A', image: 'https://assets.coingecko.com/coins/images/7598/small/wrapped_bitcoin_wbtc.png' },
  USDC0: { name: 'USD Coin', color: '#2775CA', image: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png' },
  USDT0: { name: 'Tether', color: '#26A17B', image: 'https://assets.coingecko.com/coins/images/325/small/Tether.png' },
  // Perp tokens
  BTC: { name: 'Bitcoin', color: '#F7931A', image: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png' },
  ETH: { name: 'Ethereum', color: '#627EEA', image: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
  SOL: { name: 'Solana', color: '#00FFA3', image: 'https://assets.coingecko.com/coins/images/4128/small/solana.png' },
  AVAX: { name: 'Avalanche', color: '#E84142', image: 'https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png' },
  ARB: { name: 'Arbitrum', color: '#28A0F0', image: 'https://assets.coingecko.com/coins/images/16547/small/photo_2023-03-29_21.47.00.jpeg' },
  DOGE: { name: 'Dogecoin', color: '#C2A633', image: 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png' },
  LINK: { name: 'Chainlink', color: '#2A5ADA', image: 'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png' },
  SUI: { name: 'Sui', color: '#4DA2FF', image: 'https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpeg' },
  PEPE: { name: 'Pepe', color: '#3D9942', image: 'https://assets.coingecko.com/coins/images/29850/small/pepe-token.jpeg' },
  WIF: { name: 'dogwifhat', color: '#C8A87A', image: 'https://assets.coingecko.com/coins/images/33566/small/dogwifhat.jpg' },
};

// Top perp markets to show
const TOP_PERPS = ['BTC', 'ETH', 'SOL', 'AVAX', 'ARB', 'DOGE', 'LINK', 'SUI', 'PEPE', 'WIF'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Parse network mode from request body
    let networkMode = 'mainnet';
    try {
      const body = await req.json();
      networkMode = body.networkMode || 'mainnet';
    } catch {
      // No body or invalid JSON, use default
    }
    
    const HYPERLIQUID_INFO_URL = networkMode === 'testnet' 
      ? HYPERLIQUID_TESTNET_URL 
      : HYPERLIQUID_MAINNET_URL;
    
    console.log(`Fetching Hyperliquid market data (${networkMode})...`);

    // Fetch all mid prices and spotMeta in parallel
    const [midsResponse, spotMetaResponse] = await Promise.all([
      fetch(HYPERLIQUID_INFO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'allMids' })
      }),
      fetch(HYPERLIQUID_INFO_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'spotMeta' })
      })
    ]);

    if (!midsResponse.ok) {
      throw new Error('Failed to fetch prices from Hyperliquid');
    }

    const mids: Record<string, string> = await midsResponse.json();
    console.log(`Fetched ${Object.keys(mids).length} prices`);

    // Get available spot assets
    const spotAssetSymbols = new Set<string>();
    if (spotMetaResponse.ok) {
      const spotMeta = await spotMetaResponse.json();
      const universe = spotMeta?.universe ?? [];
      universe.forEach((u: { name: string }) => {
        // Extract base symbol from "TOKEN/USDC" format
        const baseSymbol = u.name.split('/')[0];
        if (baseSymbol) {
          // Remove @ prefix if present
          const cleanSymbol = baseSymbol.startsWith('@') ? baseSymbol.slice(1) : baseSymbol;
          spotAssetSymbols.add(cleanSymbol);
          // Also add common aliases
          if (cleanSymbol === 'WBTC') spotAssetSymbols.add('BTC');
          if (cleanSymbol === 'WETH') spotAssetSymbols.add('ETH');
        }
      });
      console.log(`Available spot assets (${networkMode}): ${Array.from(spotAssetSymbols).join(', ')}`);
    }

    // Fetch candle data for sparklines (24h, 1h intervals)
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Get tokens to display
    const tokensToFetch = [...new Set([...SPOT_TOKENS, ...TOP_PERPS])];
    
    // Fetch candles for each token in parallel
    const candlePromises = tokensToFetch.map(async (symbol) => {
      try {
        const candleResponse = await fetch(HYPERLIQUID_INFO_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'candleSnapshot',
            req: {
              coin: symbol,
              interval: '1h',
              startTime: oneDayAgo,
              endTime: now
            }
          })
        });

        if (candleResponse.ok) {
          const candles = await candleResponse.json();
          return { symbol, candles };
        }
        return { symbol, candles: [] };
      } catch {
        return { symbol, candles: [] };
      }
    });

    const candleResults = await Promise.all(candlePromises);
    const candlesBySymbol: Record<string, any[]> = {};
    candleResults.forEach(({ symbol, candles }) => {
      candlesBySymbol[symbol] = candles;
    });

    // Build asset list
    const assets: Array<{
      id: string;
      symbol: string;
      name: string;
      image: string;
      color: string;
      price: number;
      change24h: number;
      sparkline: number[];
      isSpotAvailable: boolean;
    }> = [];

    for (const symbol of tokensToFetch) {
      const priceStr = mids[symbol];
      if (!priceStr) continue;

      const price = parseFloat(priceStr);
      if (price <= 0) continue;

      const candles = candlesBySymbol[symbol] || [];
      const sparkline = candles.map((c: any) => parseFloat(c.c)); // Close prices

      // Calculate 24h change
      let change24h = 0;
      if (candles.length >= 2) {
        const oldPrice = parseFloat(candles[0].o); // Open of first candle
        const newPrice = parseFloat(candles[candles.length - 1].c); // Close of last candle
        if (oldPrice > 0) {
          change24h = ((newPrice - oldPrice) / oldPrice) * 100;
        }
      }

      const metadata = TOKEN_METADATA[symbol] || { 
        name: symbol, 
        color: '#888888',
        image: `https://app.hyperliquid.xyz/icons/${symbol}.svg`
      };

      assets.push({
        id: symbol.toLowerCase(),
        symbol,
        name: metadata.name,
        image: metadata.image || '',
        color: metadata.color,
        price,
        change24h,
        sparkline: sparkline.length > 0 ? sparkline : [price, price], // Fallback to flat line
        isSpotAvailable: spotAssetSymbols.has(symbol),
      });
    }

    // Sort by price (highest first) as proxy for market cap
    assets.sort((a, b) => b.price - a.price);

    console.log(`Processed ${assets.length} assets`);

    return new Response(JSON.stringify({
      success: true,
      assets,
      networkMode,
      fetchedAt: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error fetching Hyperliquid prices:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
