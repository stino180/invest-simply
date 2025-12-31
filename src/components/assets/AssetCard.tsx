import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CryptoAsset } from '@/hooks/useCryptoPrices';
import { cn } from '@/lib/utils';
import { SparklineChart } from './SparklineChart';

interface AssetCardProps {
  asset: CryptoAsset;
}

const formatPrice = (price: number): string => {
  if (price >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  }
  if (price >= 1) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    }).format(price);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(price);
};

export const AssetCard = ({ asset }: AssetCardProps) => {
  const isPositive = asset.change24h >= 0;
  const brandColor = asset.color || '#888888';

  return (
    <Link
      to={`/asset/${asset.id}`}
      className="flex items-center justify-between p-4 rounded-xl bg-card hover:bg-secondary/50 transition-all duration-200 group"
    >
      <div className="flex items-center gap-3">
        <div 
          className="w-10 h-10 rounded-full flex items-center justify-center overflow-hidden"
          style={{ backgroundColor: `${brandColor}20` }}
        >
          {asset.image ? (
            <img 
              src={asset.image} 
              alt={asset.name} 
              className="w-7 h-7"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.innerHTML = `<span style="color: ${brandColor}; font-weight: 600;">${asset.symbol.slice(0, 2)}</span>`;
              }}
            />
          ) : (
            <span 
              className="font-semibold text-sm"
              style={{ color: brandColor }}
            >
              {asset.symbol.slice(0, 2)}
            </span>
          )}
        </div>
        <div>
          <div className="font-semibold text-foreground flex items-center gap-2">
            {asset.symbol}
            <span 
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: brandColor }}
            />
          </div>
          <div className="text-sm text-muted-foreground">{asset.name}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-16 h-8">
          <SparklineChart data={asset.sparkline} isPositive={isPositive} />
        </div>
        
        <div className="text-right min-w-[100px]">
          <div className="font-semibold text-foreground">{formatPrice(asset.price)}</div>
          <div className={cn(
            'text-sm font-medium',
            isPositive ? 'text-success' : 'text-destructive'
          )}>
            {isPositive ? '+' : ''}{asset.change24h.toFixed(2)}%
          </div>
        </div>
        
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
    </Link>
  );
};
