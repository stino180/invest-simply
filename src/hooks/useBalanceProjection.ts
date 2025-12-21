import { useMemo, useState, useEffect } from 'react';
import { useWalletData } from './useWalletData';
import { useDCAPlans, DBDCAPlan } from './useDCAPlans';
import { usePrivyAuth } from '@/context/PrivyAuthContext';
import { supabase } from '@/integrations/supabase/client';

interface ExecutionProjection {
  totalMonthlyRequired: number;
  nextExecutionTotal: number;
  executionsCovered: number;
  weeksCovered: number;
  hasLowBalance: boolean;
  hasCriticalBalance: boolean;
  shortfall: number;
  planBreakdown: PlanProjection[];
  lowBalanceThreshold: number;
}

interface PlanProjection {
  planId: string;
  asset: string;
  amountPerExecution: number;
  executionsPerMonth: number;
  monthlyTotal: number;
  nextExecution: Date | null;
}

const DEFAULT_LOW_BALANCE_THRESHOLD = 100;
const CRITICAL_BALANCE_THRESHOLD_EXECUTIONS = 1; // Critical if can't cover next execution

export const useBalanceProjection = () => {
  const { usdcBalance } = useWalletData();
  const { plans: dbPlans, isLoading: plansLoading } = useDCAPlans();
  const { profile } = usePrivyAuth();
  const [lowBalanceThreshold, setLowBalanceThreshold] = useState(DEFAULT_LOW_BALANCE_THRESHOLD);

  // Fetch user's custom threshold
  useEffect(() => {
    const fetchThreshold = async () => {
      if (!profile?.id) return;
      
      const { data } = await supabase
        .from('profiles')
        .select('low_balance_threshold')
        .eq('id', profile.id)
        .single();
      
      if (data && (data as any).low_balance_threshold != null) {
        setLowBalanceThreshold((data as any).low_balance_threshold);
      }
    };
    
    fetchThreshold();
  }, [profile?.id]);

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
        lowBalanceThreshold,
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
    
    // Determine warning states based on user's custom threshold
    const hasLowBalance = usdcBalance < lowBalanceThreshold && usdcBalance >= nextExecutionTotal;
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
      lowBalanceThreshold,
    };
  }, [dbPlans, usdcBalance, lowBalanceThreshold]);

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
