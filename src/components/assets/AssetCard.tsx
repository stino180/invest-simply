import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Asset, formatPrice } from '@/data/mockAssets';
import { cn } from '@/lib/utils';
import { SparklineChart } from './SparklineChart';

interface AssetCardProps {
  asset: Asset;
}

export const AssetCard = ({ asset }: AssetCardProps) => {
  const isPositive = asset.change24h >= 0;

  return (
    <Link
      to={`/asset/${asset.id}`}
      className="flex items-center justify-between p-4 rounded-xl bg-card hover:bg-secondary/50 transition-all duration-200 group"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg">
          {asset.icon}
        </div>
        <div>
          <div className="font-semibold">{asset.symbol}</div>
          <div className="text-sm text-muted-foreground">{asset.name}</div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="w-16 h-8">
          <SparklineChart data={asset.sparkline} isPositive={isPositive} />
        </div>
        
        <div className="text-right min-w-[100px]">
          <div className="font-semibold">{formatPrice(asset.price)}</div>
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
