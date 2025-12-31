import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, Plus, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PriceChart } from '@/components/assets/PriceChart';
import { PurchaseModal } from '@/components/purchase/PurchaseModal';
import { useCryptoPrices } from '@/hooks/useCryptoPrices';
import { useWalletData } from '@/hooks/useWalletData';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

const formatPrice = (price: number) => {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
};

const AssetDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  const { assets, isLoading, refetch } = useCryptoPrices();
  const { holdings, usdcBalance } = useWalletData();

  const handleBack = () => {
    // If user opened this page directly (no in-app history), navigate(-1) won't work.
    const idx = (window.history.state as any)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/assets');
  };
  
  // Find asset by symbol (case insensitive)
  const asset = assets.find(a => a.symbol.toLowerCase() === id?.toLowerCase());
  // Find holding from real wallet data
  const holding = holdings.find(h => h.symbol.toLowerCase() === id?.toLowerCase());

  if (isLoading) {
    return (
      <AppShell hideNav>
        <div className="p-4 safe-top">
          <button onClick={handleBack} className="p-2 -ml-2" aria-label="Go back"> 
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="space-y-4 mt-6">
            <div className="flex justify-center">
              <Skeleton className="w-12 h-12 rounded-full" />
            </div>
            <Skeleton className="h-10 w-48 mx-auto" />
            <Skeleton className="h-6 w-24 mx-auto" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </AppShell>
    );
  }

  if (!asset) {
    return (
      <AppShell hideNav>
        <div className="p-4 safe-top">
          <button onClick={handleBack} className="p-2 -ml-2" aria-label="Go back">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="text-center py-12 text-muted-foreground">
            Asset not found
          </div>
        </div>
      </AppShell>
    );
  }

  const isPositive = asset.change24h >= 0;

  return (
    <AppShell hideNav>
      <div className="min-h-screen pb-24">
        {/* Header */}
        <div className="p-4 safe-top">
          <div className="flex items-center justify-between mb-6">
            <button 
              onClick={handleBack}
              className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors"
              aria-label="Go back"
            >
              <ArrowLeft className="w-6 h-6 text-foreground" />
            </button>
            <div className="flex items-center gap-2">
              {asset.image ? (
                <img 
                  src={asset.image} 
                  alt={asset.name} 
                  className="w-8 h-8 rounded-full"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white"
                  style={{ backgroundColor: asset.color || 'hsl(var(--primary))' }}
                >
                  {asset.symbol.slice(0, 2)}
                </div>
              )}
              <span className="font-semibold text-foreground">{asset.symbol}</span>
            </div>
            <button 
              onClick={() => refetch()}
              className="p-2 -mr-2 rounded-full hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>

          {/* Price */}
          <div className="text-center mb-6">
            <div className="text-4xl font-bold font-display mb-2 text-foreground">
              {formatPrice(asset.price)}
            </div>
            <div className={cn(
              'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium',
              isPositive 
                ? 'bg-success/20 text-success' 
                : 'bg-destructive/20 text-destructive'
            )}>
              {isPositive ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              {isPositive ? '+' : ''}{asset.change24h.toFixed(2)}% (24h)
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="px-4 mb-6">
          <PriceChart isPositive={isPositive} sparkline={asset.sparkline} />
        </div>

        {/* Your Position */}
        {holding && holding.amount > 0 && (
          <div className="px-4 mb-6">
            <div className="p-4 rounded-xl bg-card">
              <h3 className="text-sm text-muted-foreground mb-3">Your Position</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    {formatPrice(holding.value_usd || (holding.amount * (holding.current_price || asset.price)))}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {holding.amount.toFixed(6)} {holding.symbol}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-foreground">
                    @ {formatPrice(holding.current_price || asset.price)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Current Price
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="px-4 mb-6">
          <h3 className="font-semibold mb-3 text-foreground">Market Stats</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-card">
              <div className="text-sm text-muted-foreground mb-1">Current Price</div>
              <div className="font-semibold text-foreground">{formatPrice(asset.price)}</div>
            </div>
            <div className="p-4 rounded-xl bg-card">
              <div className="text-sm text-muted-foreground mb-1">24h Change</div>
              <div className={cn(
                'font-semibold',
                isPositive ? 'text-success' : 'text-destructive'
              )}>
                {isPositive ? '+' : ''}{asset.change24h.toFixed(2)}%
              </div>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="px-4 mb-6">
          <h3 className="font-semibold mb-3 text-foreground">About {asset.name}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {asset.name} ({asset.symbol}) is a cryptocurrency available for trading on Hyperliquid. 
            Current price: {formatPrice(asset.price)} with a 24h change of {asset.change24h >= 0 ? '+' : ''}{asset.change24h.toFixed(2)}%.
          </p>
        </div>

        {/* Fixed Bottom CTA */}
        <div className="fixed bottom-0 left-0 right-0 p-4 glass-strong safe-bottom">
          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1 h-14 text-lg font-semibold rounded-xl"
              onClick={() => navigate('/dca')}
            >
              <Plus className="w-5 h-5 mr-2" />
              DCA
            </Button>
            <Button
              className="flex-1 h-14 text-lg font-semibold rounded-xl gradient-primary hover:opacity-90"
              onClick={() => setShowPurchaseModal(true)}
            >
              Buy {asset.symbol}
            </Button>
          </div>
        </div>
      </div>

      <PurchaseModal
        asset={{
          id: asset.id,
          symbol: asset.symbol,
          name: asset.name,
          price: asset.price,
          change24h: asset.change24h,
          icon: asset.symbol.slice(0, 2),
          isSpotAvailable: asset.isSpotAvailable,
        }}
        isOpen={showPurchaseModal}
        onClose={() => setShowPurchaseModal(false)}
        onConfirm={(amount, result) => {
          console.log(`Purchased ${result?.amountCrypto || amount} of ${asset.symbol}`);
        }}
        balance={usdcBalance}
      />
    </AppShell>
  );
};

export default AssetDetail;
