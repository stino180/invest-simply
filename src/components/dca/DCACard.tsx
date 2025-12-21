import { useState } from 'react';
import { Pause, Play, Trash2, Clock, Pencil } from 'lucide-react';
import { DCAplan } from '@/data/mockPortfolio';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface DCACardProps {
  plan: DCAplan;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (plan: DCAplan) => void;
}

const weekDayLabels: Record<string, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
};

const formatFrequency = (plan: DCAplan): string => {
  if (plan.frequency === 'custom' && plan.customDaysInterval) {
    return `Every ${plan.customDaysInterval} day${plan.customDaysInterval > 1 ? 's' : ''}`;
  }
  if (plan.frequency === 'calendar' && plan.specificDays?.length) {
    const days = plan.specificDays.map(d => weekDayLabels[d] || d).join(', ');
    return days;
  }
  const labels: Record<string, string> = {
    daily: 'Daily',
    weekly: 'Weekly',
    biweekly: 'Every 2 weeks',
    monthly: 'Monthly',
  };
  return labels[plan.frequency] || plan.frequency;
};

const formatDate = (date: Date) => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

export const DCACard = ({ plan, onToggle, onDelete, onEdit }: DCACardProps) => {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDeleteConfirm = () => {
    onDelete(plan.id);
    setShowDeleteDialog(false);
  };

  return (
    <>
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
              <div className="font-semibold text-foreground">{plan.symbol}</div>
              <div className="text-sm text-muted-foreground">{plan.name}</div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => onEdit(plan)}
              className="p-2 rounded-lg hover:bg-primary/20 text-primary transition-colors"
              title="Edit plan"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={() => onToggle(plan.id)}
              className={cn(
                'p-2 rounded-lg transition-colors',
                plan.isActive 
                  ? 'hover:bg-warning/20 text-warning' 
                  : 'hover:bg-success/20 text-success'
              )}
              title={plan.isActive ? 'Pause plan' : 'Resume plan'}
            >
              {plan.isActive ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={() => setShowDeleteDialog(true)}
              className="p-2 rounded-lg hover:bg-destructive/20 text-destructive transition-colors"
              title="Delete plan"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Amount</span>
            <div className="font-semibold text-foreground">${plan.amount}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Frequency</span>
            <div className="font-semibold text-foreground">{formatFrequency(plan)}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Next buy</span>
            <div className="font-semibold text-foreground">
              {plan.isActive ? formatDate(plan.nextExecution) : 'Paused'}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Total invested</span>
            <div className="font-semibold text-foreground">${plan.totalInvested.toLocaleString()}</div>
          </div>
        </div>

        {/* Execution details */}
        {(plan.executionTime || plan.slippage) && (
          <div className="mt-3 pt-3 border-t border-border flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {plan.executionTime && (
              <div className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>{plan.executionTime}</span>
                {plan.timezone && (
                  <span className="text-muted-foreground/60">({plan.timezone})</span>
                )}
              </div>
            )}
            {plan.slippage && (
              <div className="flex items-center gap-1.5">
                <span>Slippage: {plan.slippage}%</span>
              </div>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete DCA Plan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the {plan.symbol} DCA plan? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
