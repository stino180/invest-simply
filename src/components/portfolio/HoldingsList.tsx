import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PortfolioHolding } from '@/data/mockPortfolio';
import { formatPrice } from '@/data/mockAssets';
import { cn } from '@/lib/utils';

interface HoldingsListProps {
  holdings: PortfolioHolding[];
}

export const HoldingsList = ({ holdings }: HoldingsListProps) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 mb-3">
        <h3 className="font-semibold text-lg">Your Holdings</h3>
        <Link 
          to="/assets" 
          className="text-sm text-primary font-medium hover:underline"
        >
          See All
        </Link>
      </div>
      
      <div className="space-y-2">
        {holdings.map((holding) => {
          const value = holding.amount * holding.currentPrice;
          const cost = holding.amount * holding.avgBuyPrice;
          const pnl = value - cost;
          const pnlPercent = (pnl / cost) * 100;
          const isPositive = pnl >= 0;

          return (
            <Link
              key={holding.assetId}
              to={`/asset/${holding.assetId}`}
              className="flex items-center justify-between p-4 rounded-xl bg-card hover:bg-secondary/50 transition-all duration-200 group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg">
                  {holding.icon}
                </div>
                <div>
                  <div className="font-semibold">{holding.symbol}</div>
                  <div className="text-sm text-muted-foreground">
                    {holding.amount.toFixed(holding.amount < 1 ? 6 : 4)} {holding.symbol}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="font-semibold">{formatPrice(value)}</div>
                  <div className={cn(
                    'text-sm font-medium',
                    isPositive ? 'text-success' : 'text-destructive'
                  )}>
                    {isPositive ? '+' : ''}{formatPrice(pnl)} ({pnlPercent.toFixed(2)}%)
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
