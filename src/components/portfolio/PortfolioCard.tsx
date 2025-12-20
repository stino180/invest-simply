import { TrendingUp, TrendingDown, Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface PortfolioCardProps {
  totalValue: number;
  change: { value: number; percentage: number };
  balance: number;
}

export const PortfolioCard = ({ totalValue, change, balance }: PortfolioCardProps) => {
  const [isHidden, setIsHidden] = useState(false);
  const isPositive = change.value >= 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(value);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl gradient-card p-6 shadow-glow">
      {/* Background decoration */}
      <div className="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-primary/10 blur-3xl" />
      <div className="absolute -left-10 -bottom-10 w-32 h-32 rounded-full bg-success/10 blur-3xl" />
      
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground font-medium">Portfolio Value</span>
          <button
            onClick={() => setIsHidden(!isHidden)}
            className="p-1.5 rounded-lg hover:bg-secondary/50 transition-colors"
          >
            {isHidden ? (
              <EyeOff className="w-4 h-4 text-muted-foreground" />
            ) : (
              <Eye className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        </div>
        
        <div className="mb-4">
          <h2 className="text-4xl font-bold font-display tracking-tight text-foreground">
            {isHidden ? '••••••' : formatCurrency(totalValue)}
          </h2>
        </div>
        
        <div className="flex items-center gap-4">
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium',
            isPositive 
              ? 'bg-success/20 text-success' 
              : 'bg-destructive/20 text-destructive'
          )}>
            {isPositive ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )}
            <span>
              {isHidden ? '••••' : `${isPositive ? '+' : ''}${formatCurrency(change.value)}`}
            </span>
            <span className="opacity-80">
              ({isPositive ? '+' : ''}{change.percentage.toFixed(2)}%)
            </span>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-border/50">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Available Balance</span>
            <span className="font-semibold text-foreground">
              {isHidden ? '••••' : formatCurrency(balance)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
