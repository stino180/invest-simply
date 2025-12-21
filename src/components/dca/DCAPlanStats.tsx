import { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown, Clock, DollarSign } from 'lucide-react';
import { PlanStats, DCAExecution } from '@/hooks/useDCAStats';
import { cn } from '@/lib/utils';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface DCAPlanStatsProps {
  stats: PlanStats;
}

const formatDate = (dateStr: string) => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(dateStr));
};

const formatPrice = (price: number) => {
  if (price >= 1000) {
    return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (price >= 1) {
    return price.toFixed(2);
  }
  return price.toFixed(6);
};

export const DCAPlanStats = ({ stats }: DCAPlanStatsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const isPositive = stats.unrealizedPnL >= 0;
  const hasData = stats.executionCount > 0;

  if (!hasData) {
    return (
      <div className="p-4 rounded-xl bg-card border border-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg">
            {stats.icon}
          </div>
          <div>
            <div className="font-semibold text-foreground">{stats.symbol}</div>
            <div className="text-sm text-muted-foreground">{stats.name}</div>
          </div>
        </div>
        <p className="text-sm text-muted-foreground text-center py-4">
          No executions yet. Stats will appear after your first DCA purchase.
        </p>
      </div>
    );
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="p-4 rounded-xl bg-card border border-border">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg">
              {stats.icon}
            </div>
            <div>
              <div className="font-semibold text-foreground">{stats.symbol}</div>
              <div className="text-sm text-muted-foreground">{stats.name}</div>
            </div>
          </div>
          <div className="text-right">
            <div className={cn(
              "font-semibold",
              isPositive ? "text-success" : "text-destructive"
            )}>
              {isPositive ? '+' : ''}{stats.unrealizedPnLPercent.toFixed(2)}%
            </div>
            <div className="text-xs text-muted-foreground">
              {stats.executionCount} buys
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground text-xs">Total Invested</span>
            <div className="font-semibold text-foreground">
              ${stats.totalInvested.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Current Value</span>
            <div className="font-semibold text-foreground">
              ${stats.currentValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Avg Entry Price</span>
            <div className="font-semibold text-foreground">
              ${formatPrice(stats.averageEntryPrice)}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Current Price</span>
            <div className="font-semibold text-foreground">
              ${formatPrice(stats.currentPrice)}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Total {stats.symbol}</span>
            <div className="font-semibold text-foreground">
              {stats.totalCrypto.toFixed(6)}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Unrealized PnL</span>
            <div className={cn(
              "font-semibold",
              isPositive ? "text-success" : "text-destructive"
            )}>
              {isPositive ? '+' : ''}${stats.unrealizedPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Execution History Toggle */}
        <CollapsibleTrigger className="w-full mt-4 pt-3 border-t border-border flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <span>Execution History</span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
            {stats.executions.map((execution) => (
              <ExecutionRow key={execution.id} execution={execution} symbol={stats.symbol} />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};

const ExecutionRow = ({ execution, symbol }: { execution: DCAExecution; symbol: string }) => {
  return (
    <div className="p-3 rounded-lg bg-secondary/50 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-success" />
        </div>
        <div>
          <div className="text-sm font-medium text-foreground">
            Bought {execution.amount_crypto?.toFixed(6) || '—'} {symbol}
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(execution.executed_at)}
          </div>
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-medium text-foreground">
          ${execution.amount_usd.toFixed(2)}
        </div>
        {execution.price_at_execution && (
          <div className="text-xs text-muted-foreground">
            @ ${formatPrice(execution.price_at_execution)}
          </div>
        )}
      </div>
    </div>
  );
};
