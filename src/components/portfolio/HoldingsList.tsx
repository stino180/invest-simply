import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { WalletHolding } from '@/hooks/useWalletData';
import { Skeleton } from '@/components/ui/skeleton';

interface HoldingsListProps {
  holdings: WalletHolding[];
  isLoading?: boolean;
}

const formatPrice = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

// Map of common crypto icons (emoji fallback)
const getAssetIcon = (symbol: string) => {
  const icons: Record<string, string> = {
    'BTC': '₿',
    'ETH': 'Ξ',
    'SOL': '◎',
    'USDC': '$',
    'USDT': '$',
    'PURR': '🐱',
    'HFUN': '🎉',
  };
  return icons[symbol] || symbol.charAt(0);
};

export const HoldingsList = ({ holdings, isLoading }: HoldingsListProps) => {
  if (isLoading) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1 mb-3">
          <h3 className="font-semibold text-lg text-foreground">Your Holdings</h3>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-card">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div>
                  <Skeleton className="w-16 h-4 mb-1" />
                  <Skeleton className="w-24 h-3" />
                </div>
              </div>
              <Skeleton className="w-20 h-4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1 mb-3">
          <h3 className="font-semibold text-lg text-foreground">Your Holdings</h3>
          <Link 
            to="/assets" 
            className="text-sm text-primary font-medium hover:underline"
          >
            Browse Assets
          </Link>
        </div>
        <div className="p-8 rounded-xl bg-card text-center">
          <p className="text-muted-foreground">No holdings yet</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Buy crypto to see your holdings here
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1 mb-3">
        <h3 className="font-semibold text-lg text-foreground">Your Holdings</h3>
        <Link 
          to="/assets" 
          className="text-sm text-primary font-medium hover:underline"
        >
          See All
        </Link>
      </div>
      
      <div className="space-y-2">
        {holdings.map((holding) => {
          const value = holding.value_usd || 0;

          return (
            <Link
              key={holding.id}
              to={`/asset/${holding.symbol.toLowerCase()}`}
              className="flex items-center justify-between p-4 rounded-xl bg-card hover:bg-secondary/50 transition-all duration-200 group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-lg font-semibold">
                  {getAssetIcon(holding.symbol)}
                </div>
                <div>
                  <div className="font-semibold text-foreground">{holding.symbol}</div>
                  <div className="text-sm text-muted-foreground">
                    {holding.amount.toFixed(holding.amount < 1 ? 6 : 4)} {holding.symbol}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="font-semibold text-foreground">{formatPrice(value)}</div>
                  {holding.current_price && (
                    <div className="text-sm text-muted-foreground">
                      @{formatPrice(holding.current_price)}
                    </div>
                  )}
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
