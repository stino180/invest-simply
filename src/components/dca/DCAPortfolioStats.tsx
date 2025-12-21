import { TrendingUp, TrendingDown, DollarSign, BarChart3, Activity } from 'lucide-react';
import { PortfolioStats } from '@/hooks/useDCAStats';
import { cn } from '@/lib/utils';

interface DCAPortfolioStatsProps {
  stats: PortfolioStats;
  monthlyInvestment: number;
  activePlansCount: number;
}

export const DCAPortfolioStats = ({ stats, monthlyInvestment, activePlansCount }: DCAPortfolioStatsProps) => {
  const isPositive = stats.unrealizedPnL >= 0;
  
  return (
    <div className="space-y-4">
      {/* Main Portfolio Card */}
      <div className="p-5 rounded-xl glass">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">Portfolio Overview</h3>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          {/* Total Invested */}
          <div className="p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-1.5 mb-1">
              <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Invested</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              ${stats.totalInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          {/* Current Value */}
          <div className="p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-1.5 mb-1">
              <Activity className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Current Value</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              ${stats.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          {/* Unrealized PnL */}
          <div className="p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-1.5 mb-1">
              {isPositive ? (
                <TrendingUp className="w-3.5 h-3.5 text-success" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-destructive" />
              )}
              <span className="text-xs text-muted-foreground">Unrealized PnL</span>
            </div>
            <p className={cn(
              "text-lg font-bold",
              isPositive ? "text-success" : "text-destructive"
            )}>
              {isPositive ? '+' : ''}{stats.unrealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className={cn(
              "text-xs",
              isPositive ? "text-success/80" : "text-destructive/80"
            )}>
              {isPositive ? '+' : ''}{stats.unrealizedPnLPercent.toFixed(2)}%
            </p>
          </div>

          {/* Total Executions */}
          <div className="p-3 rounded-lg bg-secondary/50">
            <div className="flex items-center gap-1.5 mb-1">
              <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Buys</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {stats.totalExecutions}
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      <div className="flex gap-3">
        <div className="flex-1 p-3 rounded-xl bg-card border border-border">
          <p className="text-xs text-muted-foreground mb-1">Monthly investment</p>
          <p className="text-lg font-bold text-foreground">
            ${monthlyInvestment.toLocaleString()}
          </p>
        </div>
        <div className="flex-1 p-3 rounded-xl bg-card border border-border">
          <p className="text-xs text-muted-foreground mb-1">Active plans</p>
          <p className="text-lg font-bold text-primary">
            {activePlansCount}
          </p>
        </div>
      </div>
    </div>
  );
};
