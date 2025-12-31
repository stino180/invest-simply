import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Network URLs
const HYPERLIQUID_MAINNET_URL = "https://api.hyperliquid.xyz/info";
const HYPERLIQUID_TESTNET_URL = "https://api.hyperliquid-testnet.xyz/info";

interface SpotBalance {
  coin: string;
  hold: string;
  total: string;
  entryNtl: string;
}

interface SpotClearinghouseState {
  balances: SpotBalance[];
}

interface SpotTransfer {
  time: number;
  coin: string;
  usdc: string;
  amount: string;
  fee: string;
  hash: string;
  direction: string; // "deposit" or "withdraw"
}

interface SpotFill {
  time: number;
  coin: string;
  px: string;
  sz: string;
  side: string; // "B" for buy, "A" for sell
  startPosition: string;
  dir: string;
  closedPnl: string;
  hash: string;
  oid: number;
  crossed: boolean;
  fee: string;
  tid: number;
  feeToken: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { profileId, walletAddress, networkMode = 'mainnet' } = await req.json();

    if (!profileId || !walletAddress) {
      throw new Error('Missing profileId or walletAddress');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const HYPERLIQUID_INFO_URL = networkMode === 'testnet' 
      ? HYPERLIQUID_TESTNET_URL 
      : HYPERLIQUID_MAINNET_URL;

    console.log(`Fetching Hyperliquid data for wallet: ${walletAddress} (${networkMode})`);

    // Fetch spot clearinghouse state from Hyperliquid
    const spotResponse = await fetch(HYPERLIQUID_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'spotClearinghouseState',
        user: walletAddress
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

    // Fetch spot transfers (deposits/withdrawals)
    const transfersResponse = await fetch(HYPERLIQUID_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'spotTransferHistory',
        user: walletAddress
      })
    });

    let transfers: SpotTransfer[] = [];
    if (transfersResponse.ok) {
      transfers = await transfersResponse.json();
      console.log('Transfers fetched:', transfers.length);
    }

    // Fetch spot fills (trades)
    const fillsResponse = await fetch(HYPERLIQUID_INFO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'userFillsByTime',
        user: walletAddress,
        startTime: Date.now() - 90 * 24 * 60 * 60 * 1000, // Last 90 days
        endTime: Date.now()
      })
    });

    let fills: SpotFill[] = [];
    if (fillsResponse.ok) {
      fills = await fillsResponse.json();
      console.log('Fills fetched:', fills.length);
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
      
      if (coin === 'USDC' || coin === 'USDC0') {
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

    // Process transactions
    const transactions: Array<{
      user_id: string;
      type: string;
      asset: string | null;
      symbol: string | null;
      amount: number | null;
      price: number | null;
      total: number;
      timestamp: string;
      status: string;
      hyperliquid_tx_hash: string | null;
    }> = [];

    // Process transfers as deposit/withdraw transactions
    for (const transfer of transfers) {
      const usdcAmount = parseFloat(transfer.usdc);
      transactions.push({
        user_id: profileId,
        type: transfer.direction === 'deposit' ? 'deposit' : 'withdraw',
        asset: transfer.coin || 'USDC',
        symbol: transfer.coin || 'USDC',
        amount: parseFloat(transfer.amount) || usdcAmount,
        price: null,
        total: Math.abs(usdcAmount),
        timestamp: new Date(transfer.time).toISOString(),
        status: 'completed',
        hyperliquid_tx_hash: transfer.hash
      });
    }

    // Process fills as buy/sell transactions
    for (const fill of fills) {
      const price = parseFloat(fill.px);
      const size = parseFloat(fill.sz);
      const total = price * size;
      
      transactions.push({
        user_id: profileId,
        type: fill.side === 'B' ? 'buy' : 'sell',
        asset: fill.coin,
        symbol: fill.coin,
        amount: size,
        price: price,
        total: total,
        timestamp: new Date(fill.time).toISOString(),
        status: 'completed',
        hyperliquid_tx_hash: fill.hash
      });
    }

    console.log(`Processed ${transactions.length} transactions`);

    // Clear existing holdings for this user
    await supabase
      .from('wallet_holdings')
      .delete()
      .eq('user_id', profileId);

    // Insert new holdings
    if (holdings.length > 0) {
      const { error: holdingsError } = await supabase
        .from('wallet_holdings')
        .insert(holdings.map(h => ({
          user_id: profileId,
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
        user_id: profileId,
        usdc_balance: usdcBalance,
        total_value_usd: totalValue,
        last_synced_at: new Date().toISOString()
      }, {
        onConflict: 'user_id'
      });

    if (balanceError) {
      console.error('Balance upsert error:', balanceError);
    }

    // Upsert transactions from Hyperliquid (don't delete local transactions)
    // This preserves locally recorded transactions while updating with Hyperliquid data
    if (transactions.length > 0) {
      for (const tx of transactions) {
        // Only upsert if we have a valid Hyperliquid hash
        if (tx.hyperliquid_tx_hash) {
          const { error: txError } = await supabase
            .from('wallet_transactions')
            .upsert(tx, {
              onConflict: 'user_id,hyperliquid_tx_hash',
              ignoreDuplicates: false
            });

          if (txError) {
            // If upsert fails (e.g., no unique constraint), try insert
            // This handles cases where the constraint doesn't exist
            console.log('Upsert failed, trying insert:', txError.message);
            await supabase
              .from('wallet_transactions')
              .insert(tx)
              .then(({ error }) => {
                if (error && !error.message.includes('duplicate')) {
                  console.error('Transaction insert error:', error);
                }
              });
          }
        }
      }
      console.log(`Synced ${transactions.length} transactions from Hyperliquid`);
    }

    return new Response(JSON.stringify({
      success: true,
      holdings,
      balance: {
        usdc_balance: usdcBalance,
        total_value_usd: totalValue
      },
      transactions: transactions.length,
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
