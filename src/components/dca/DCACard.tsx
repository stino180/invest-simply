import { Pause, Play, Trash2 } from 'lucide-react';
import { DCAplan } from '@/data/mockPortfolio';
import { cn } from '@/lib/utils';

interface DCACardProps {
  plan: DCAplan;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

const formatFrequency = (freq: string) => {
  const labels: Record<string, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: 'Every 2 weeks',
    monthly: 'Monthly',
  };
  return labels[freq] || freq;
};

const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

export const DCACard = ({ plan, onToggle, onDelete }: DCACardProps) => {
  return (
    <div className={cn(
      'p-4 rounded-xl bg-card border transition-all',
      plan.isActive ? 'border-primary/30' : 'border-border opacity-60'
    )}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg">
            {plan.icon}
          </div>
          <div>
            <div className="font-semibold">{plan.symbol}</div>
            <div className="text-sm text-muted-foreground">{plan.name}</div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <button
            onClick={() => onToggle(plan.id)}
            className={cn(
              'p-2 rounded-lg transition-colors',
              plan.isActive 
                ? 'hover:bg-warning/20 text-warning' 
                : 'hover:bg-success/20 text-success'
            )}
          >
            {plan.isActive ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => onDelete(plan.id)}
            className="p-2 rounded-lg hover:bg-destructive/20 text-destructive transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">Amount</span>
          <div className="font-semibold">${plan.amount}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Frequency</span>
          <div className="font-semibold">{formatFrequency(plan.frequency)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Next buy</span>
          <div className="font-semibold">
            {plan.isActive ? formatDate(plan.nextExecution) : 'Paused'}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Total invested</span>
          <div className="font-semibold">${plan.totalInvested.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );
};
