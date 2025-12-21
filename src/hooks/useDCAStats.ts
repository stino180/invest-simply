import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePrivyAuth } from '@/context/PrivyAuthContext';
import { useCryptoPrices } from './useCryptoPrices';
import { getAssetInfo } from './useDCAPlans';

export interface DCAExecution {
  id: string;
  plan_id: string;
  amount_usd: number;
  amount_crypto: number | null;
  price_at_execution: number | null;
  status: string;
  executed_at: string;
  error_message: string | null;
}

export interface PlanStats {
  planId: string;
  asset: string;
  symbol: string;
  name: string;
  icon: string;
  totalInvested: number;
  totalCrypto: number;
  averageEntryPrice: number;
  currentPrice: number;
  currentValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  executionCount: number;
  lastExecution: DCAExecution | null;
  executions: DCAExecution[];
}

export interface PortfolioStats {
  totalInvested: number;
  currentValue: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  totalExecutions: number;
  planStats: PlanStats[];
}

export const useDCAStats = (planIds: string[], planAssets: Record<string, string>) => {
  const { profile, isAuthenticated } = usePrivyAuth();
  const { assets: cryptoAssets } = useCryptoPrices();
  const [executions, setExecutions] = useState<DCAExecution[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchExecutions = useCallback(async () => {
    if (!profile?.id || planIds.length === 0) {
      setExecutions([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('dca_executions')
        .select('*')
        .in('plan_id', planIds)
        .order('executed_at', { ascending: false });

      if (error) throw error;
      setExecutions(data || []);
    } catch (err) {
      console.error('Error fetching DCA executions:', err);
      setExecutions([]);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.id, planIds]);

  useEffect(() => {
    if (isAuthenticated && profile?.id && planIds.length > 0) {
      fetchExecutions();
    } else {
      setExecutions([]);
      setIsLoading(false);
    }
  }, [isAuthenticated, profile?.id, planIds, fetchExecutions]);

  // Get current price for an asset
  const getCurrentPrice = useCallback((assetId: string): number => {
    const asset = cryptoAssets.find(a => 
      a.id.toLowerCase() === assetId.toLowerCase() || 
      a.symbol.toLowerCase() === assetId.toLowerCase()
    );
    return asset?.price || 0;
  }, [cryptoAssets]);

  // Calculate stats for each plan
  const planStats = useMemo((): PlanStats[] => {
    return planIds.map(planId => {
      const planExecutions = executions.filter(e => e.plan_id === planId && e.status === 'success');
      const assetId = planAssets[planId] || '';
      const assetInfo = getAssetInfo(assetId);
      
      const totalInvested = planExecutions.reduce((sum, e) => sum + e.amount_usd, 0);
      const totalCrypto = planExecutions.reduce((sum, e) => sum + (e.amount_crypto || 0), 0);
      const averageEntryPrice = totalCrypto > 0 ? totalInvested / totalCrypto : 0;
      const currentPrice = getCurrentPrice(assetId);
      const currentValue = totalCrypto * currentPrice;
      const unrealizedPnL = currentValue - totalInvested;
      const unrealizedPnLPercent = totalInvested > 0 ? (unrealizedPnL / totalInvested) * 100 : 0;

      return {
        planId,
        asset: assetId,
        symbol: assetInfo.symbol,
        name: assetInfo.name,
        icon: assetInfo.icon,
        totalInvested,
        totalCrypto,
        averageEntryPrice,
        currentPrice,
        currentValue,
        unrealizedPnL,
        unrealizedPnLPercent,
        executionCount: planExecutions.length,
        lastExecution: planExecutions[0] || null,
        executions: planExecutions,
      };
    });
  }, [planIds, planAssets, executions, getCurrentPrice]);

  // Calculate portfolio-wide stats
  const portfolioStats = useMemo((): PortfolioStats => {
    const totalInvested = planStats.reduce((sum, p) => sum + p.totalInvested, 0);
    const currentValue = planStats.reduce((sum, p) => sum + p.currentValue, 0);
    const unrealizedPnL = currentValue - totalInvested;
    const unrealizedPnLPercent = totalInvested > 0 ? (unrealizedPnL / totalInvested) * 100 : 0;
    const totalExecutions = planStats.reduce((sum, p) => sum + p.executionCount, 0);

    return {
      totalInvested,
      currentValue,
      unrealizedPnL,
      unrealizedPnLPercent,
      totalExecutions,
      planStats,
    };
  }, [planStats]);

  // Get stats for a specific plan
  const getPlanStats = useCallback((planId: string): PlanStats | undefined => {
    return planStats.find(p => p.planId === planId);
  }, [planStats]);

  return {
    executions,
    planStats,
    portfolioStats,
    getPlanStats,
    isLoading,
    refetch: fetchExecutions,
  };
};
