import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, Plus } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { PriceChart } from '@/components/assets/PriceChart';
import { PurchaseModal } from '@/components/purchase/PurchaseModal';
import { getAssetById, formatPrice, formatMarketCap, formatVolume } from '@/data/mockAssets';
import { mockBalance, mockPortfolio } from '@/data/mockPortfolio';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const AssetDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  
  const asset = getAssetById(id || '');
  const holding = mockPortfolio.find(h => h.assetId === id);

  if (!asset) {
    return (
      <AppShell hideNav>
        <div className="p-4 safe-top">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2">
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
            <button onClick={() => navigate(-1)} className="p-2 -ml-2">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-lg">
                {asset.icon}
              </div>
              <span className="font-semibold">{asset.symbol}</span>
            </div>
            <div className="w-10" /> {/* Spacer */}
          </div>

          {/* Price */}
          <div className="text-center mb-6">
            <div className="text-4xl font-bold font-display mb-2">
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
          <PriceChart isPositive={isPositive} />
        </div>

        {/* Your Position */}
        {holding && (
          <div className="px-4 mb-6">
            <div className="p-4 rounded-xl bg-card">
              <h3 className="text-sm text-muted-foreground mb-3">Your Position</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-2xl font-bold">
                    {formatPrice(holding.amount * holding.currentPrice)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {holding.amount.toFixed(6)} {holding.symbol}
                  </div>
                </div>
                <div className="text-right">
                  <div className={cn(
                    'text-lg font-semibold',
                    holding.currentPrice > holding.avgBuyPrice 
                      ? 'text-success' 
                      : 'text-destructive'
                  )}>
                    {holding.currentPrice > holding.avgBuyPrice ? '+' : ''}
                    {(((holding.currentPrice - holding.avgBuyPrice) / holding.avgBuyPrice) * 100).toFixed(2)}%
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Avg. {formatPrice(holding.avgBuyPrice)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="px-4 mb-6">
          <h3 className="font-semibold mb-3">Market Stats</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-card">
              <div className="text-sm text-muted-foreground mb-1">Market Cap</div>
              <div className="font-semibold">{formatMarketCap(asset.marketCap)}</div>
            </div>
            <div className="p-4 rounded-xl bg-card">
              <div className="text-sm text-muted-foreground mb-1">24h Volume</div>
              <div className="font-semibold">{formatVolume(asset.volume24h)}</div>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="px-4 mb-6">
          <h3 className="font-semibold mb-3">About {asset.name}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {asset.name} ({asset.symbol}) is one of the leading cryptocurrencies by market capitalization. 
            It offers unique features and has a strong community of developers and users.
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
        asset={asset}
        isOpen={showPurchaseModal}
        onClose={() => setShowPurchaseModal(false)}
        onConfirm={(amount) => {
          console.log(`Purchased $${amount} of ${asset.symbol}`);
        }}
        balance={mockBalance.usd}
      />
    </AppShell>
  );
};

export default AssetDetail;
