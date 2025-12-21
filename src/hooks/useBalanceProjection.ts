import { useMemo } from 'react';
import { useWalletData } from './useWalletData';
import { useDCAPlans, DBDCAPlan } from './useDCAPlans';

interface ExecutionProjection {
  totalMonthlyRequired: number;
  nextExecutionTotal: number;
  executionsCovered: number;
  weeksCovered: number;
  hasLowBalance: boolean;
  hasCriticalBalance: boolean;
  shortfall: number;
  planBreakdown: PlanProjection[];
}

interface PlanProjection {
  planId: string;
  asset: string;
  amountPerExecution: number;
  executionsPerMonth: number;
  monthlyTotal: number;
  nextExecution: Date | null;
}

const LOW_BALANCE_THRESHOLD_WEEKS = 2; // Warn if less than 2 weeks covered
const CRITICAL_BALANCE_THRESHOLD_EXECUTIONS = 1; // Critical if can't cover next execution

export const useBalanceProjection = () => {
  const { usdcBalance } = useWalletData();
  const { plans: dbPlans, isLoading: plansLoading } = useDCAPlans();

  const projection = useMemo((): ExecutionProjection => {
    const activePlans = dbPlans.filter(p => p.is_active);
    
    if (activePlans.length === 0) {
      return {
        totalMonthlyRequired: 0,
        nextExecutionTotal: 0,
        executionsCovered: Infinity,
        weeksCovered: Infinity,
        hasLowBalance: false,
        hasCriticalBalance: false,
        shortfall: 0,
        planBreakdown: [],
      };
    }

    // Calculate breakdown for each plan
    const planBreakdown: PlanProjection[] = activePlans.map(plan => {
      const executionsPerMonth = getExecutionsPerMonth(plan);
      return {
        planId: plan.id,
        asset: plan.asset,
        amountPerExecution: plan.amount_usd,
        executionsPerMonth,
        monthlyTotal: plan.amount_usd * executionsPerMonth,
        nextExecution: plan.next_execution_at ? new Date(plan.next_execution_at) : null,
      };
    });

    const totalMonthlyRequired = planBreakdown.reduce((sum, p) => sum + p.monthlyTotal, 0);
    const nextExecutionTotal = planBreakdown.reduce((sum, p) => sum + p.amountPerExecution, 0);
    
    // Calculate how many executions can be covered
    const avgExecutionCost = planBreakdown.reduce((sum, p) => sum + p.amountPerExecution, 0);
    const executionsCovered = avgExecutionCost > 0 ? Math.floor(usdcBalance / avgExecutionCost) : Infinity;
    
    // Calculate weeks covered
    const weeklyRequired = totalMonthlyRequired / 4;
    const weeksCovered = weeklyRequired > 0 ? usdcBalance / weeklyRequired : Infinity;
    
    // Determine warning states
    const hasLowBalance = weeksCovered < LOW_BALANCE_THRESHOLD_WEEKS && weeksCovered >= CRITICAL_BALANCE_THRESHOLD_EXECUTIONS;
    const hasCriticalBalance = usdcBalance < nextExecutionTotal;
    const shortfall = hasCriticalBalance ? nextExecutionTotal - usdcBalance : 0;

    return {
      totalMonthlyRequired,
      nextExecutionTotal,
      executionsCovered,
      weeksCovered,
      hasLowBalance,
      hasCriticalBalance,
      shortfall,
      planBreakdown,
    };
  }, [dbPlans, usdcBalance]);

  return {
    ...projection,
    usdcBalance,
    isLoading: plansLoading,
  };
};

function getExecutionsPerMonth(plan: DBDCAPlan): number {
  switch (plan.frequency) {
    case 'daily':
      return 30;
    case 'weekly':
      return 4;
    case 'biweekly':
      return 2;
    case 'monthly':
      return 1;
    case 'custom':
      return plan.custom_days_interval ? 30 / plan.custom_days_interval : 1;
    case 'calendar':
      return (plan.specific_days?.length || 1) * 4;
    default:
      return 1;
  }
}
