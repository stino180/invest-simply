import { useState } from 'react';
import { AlertTriangle, Wallet, Plus, TrendingUp, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { RampModal } from '@/components/ramp/RampModal';
import { usePrivyAuth } from '@/context/PrivyAuthContext';

interface BalanceWarningCardProps {
  usdcBalance: number;
  totalMonthlyRequired: number;
  nextExecutionTotal: number;
  executionsCovered: number;
  weeksCovered: number;
  hasLowBalance: boolean;
  hasCriticalBalance: boolean;
  shortfall: number;
}

export const BalanceWarningCard = ({
  usdcBalance,
  totalMonthlyRequired,
  nextExecutionTotal,
  executionsCovered,
  weeksCovered,
  hasLowBalance,
  hasCriticalBalance,
  shortfall,
}: BalanceWarningCardProps) => {
  const [showRampModal, setShowRampModal] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const { walletAddress } = usePrivyAuth();

  const isWarning = hasLowBalance || hasCriticalBalance;
  const warningLevel = hasCriticalBalance ? 'critical' : hasLowBalance ? 'warning' : 'healthy';

  return (
    <>
      <div className={cn(
        "p-4 rounded-xl border transition-all",
        warningLevel === 'critical' && "bg-destructive/10 border-destructive/30",
        warningLevel === 'warning' && "bg-amber-500/10 border-amber-500/30",
        warningLevel === 'healthy' && "bg-card border-border"
      )}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              warningLevel === 'critical' && "bg-destructive/20",
              warningLevel === 'warning' && "bg-amber-500/20",
              warningLevel === 'healthy' && "bg-primary/20"
            )}>
              {isWarning ? (
                <AlertTriangle className={cn(
                  "w-5 h-5",
                  warningLevel === 'critical' && "text-destructive",
                  warningLevel === 'warning' && "text-amber-500"
                )} />
              ) : (
                <Wallet className="w-5 h-5 text-primary" />
              )}
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold text-foreground">
                  ${usdcBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <span className="text-xs text-muted-foreground">USDC Balance</span>
              </div>
              
              {hasCriticalBalance ? (
                <p className="text-sm text-destructive font-medium">
                  Insufficient funds! Need ${shortfall.toFixed(2)} more for next execution
                </p>
              ) : hasLowBalance ? (
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  Low balance — covers ~{Math.floor(weeksCovered)} week{Math.floor(weeksCovered) !== 1 ? 's' : ''} of DCA
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Covers {executionsCovered === Infinity ? '∞' : executionsCovered} execution{executionsCovered !== 1 ? 's' : ''}
                  {weeksCovered !== Infinity && ` (~${Math.floor(weeksCovered)} weeks)`}
                </p>
              )}
            </div>
          </div>

          <Button 
            size="sm" 
            onClick={() => setShowRampModal(true)}
            className={cn(
              "shrink-0",
              hasCriticalBalance && "bg-destructive hover:bg-destructive/90"
            )}
          >
            <Plus className="w-4 h-4 mr-1" />
            Top Up
          </Button>
        </div>

        {/* Expandable Details */}
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center gap-1 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {showDetails ? 'Hide' : 'Show'} projection details
        </button>

        {showDetails && (
          <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Next execution cost</span>
              <span className="font-medium text-foreground">${nextExecutionTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Monthly DCA total</span>
              <span className="font-medium text-foreground">${totalMonthlyRequired.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Executions covered</span>
              <span className="font-medium text-foreground">
                {executionsCovered === Infinity ? '∞' : executionsCovered}
              </span>
            </div>
            
            {/* Projection bar */}
            <div className="mt-2">
              <div className="flex justify-between text-xs text-muted-foreground mb-1">
                <span>Balance coverage</span>
                <span>{Math.min(Math.round((weeksCovered / 8) * 100), 100)}%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all",
                    warningLevel === 'critical' && "bg-destructive",
                    warningLevel === 'warning' && "bg-amber-500",
                    warningLevel === 'healthy' && "bg-success"
                  )}
                  style={{ width: `${Math.min((weeksCovered / 8) * 100, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Based on 8 weeks of DCA activity
              </p>
            </div>
          </div>
        )}
      </div>

      {walletAddress && (
        <RampModal
          open={showRampModal}
          onOpenChange={setShowRampModal}
          mode="onramp"
          walletAddress={walletAddress}
        />
      )}
    </>
  );
};
