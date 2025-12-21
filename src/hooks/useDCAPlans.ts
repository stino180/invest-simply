import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePrivyAuth } from '@/context/PrivyAuthContext';
import { toast } from 'sonner';

export interface DBDCAPlan {
  id: string;
  user_id: string;
  asset: string;
  amount_usd: number;
  frequency: string;
  custom_days_interval: number | null;
  execution_time: string | null;
  timezone: string | null;
  specific_days: string[] | null;
  slippage: number;
  is_active: boolean;
  next_execution_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DCAFormData {
  assetId: string;
  amount: number;
  frequency: string;
  customDaysInterval?: number;
  executionTime: string;
  timezone: string;
  specificDays?: string[];
  slippage: number;
}

// Map asset IDs to display info
const assetMap: Record<string, { symbol: string; name: string; icon: string }> = {
  btc: { symbol: 'BTC', name: 'Bitcoin', icon: '₿' },
  eth: { symbol: 'ETH', name: 'Ethereum', icon: 'Ξ' },
  sol: { symbol: 'SOL', name: 'Solana', icon: '◎' },
  doge: { symbol: 'DOGE', name: 'Dogecoin', icon: 'Ð' },
  xrp: { symbol: 'XRP', name: 'XRP', icon: '✕' },
  ada: { symbol: 'ADA', name: 'Cardano', icon: '₳' },
  avax: { symbol: 'AVAX', name: 'Avalanche', icon: '🔺' },
  link: { symbol: 'LINK', name: 'Chainlink', icon: '⬡' },
};

export const getAssetInfo = (assetId: string) => {
  return assetMap[assetId.toLowerCase()] || { 
    symbol: assetId.toUpperCase(), 
    name: assetId, 
    icon: '₿' 
  };
};

export const useDCAPlans = () => {
  const { profile, isAuthenticated } = usePrivyAuth();
  const [plans, setPlans] = useState<DBDCAPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPlans = useCallback(async () => {
    if (!profile?.id) {
      setPlans([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('dca_plans')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPlans(data || []);
      setError(null);
    } catch (err) {
      console.error('Error fetching DCA plans:', err);
      setError('Failed to load DCA plans');
      setPlans([]);
    } finally {
      setIsLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (isAuthenticated && profile?.id) {
      fetchPlans();
    } else {
      setPlans([]);
      setIsLoading(false);
    }
  }, [isAuthenticated, profile?.id, fetchPlans]);

  const createPlan = async (formData: DCAFormData): Promise<boolean> => {
    if (!profile?.id) {
      toast.error('Please log in to create DCA plans');
      return false;
    }

    try {
      const { error } = await supabase.from('dca_plans').insert({
        user_id: profile.id,
        asset: formData.assetId,
        amount_usd: formData.amount,
        frequency: formData.frequency,
        custom_days_interval: formData.customDaysInterval || null,
        execution_time: formData.executionTime,
        timezone: formData.timezone,
        specific_days: formData.specificDays || null,
        slippage: formData.slippage,
        is_active: true,
      });

      if (error) throw error;
      
      toast.success('DCA plan created successfully');
      await fetchPlans();
      return true;
    } catch (err) {
      console.error('Error creating DCA plan:', err);
      toast.error('Failed to create DCA plan');
      return false;
    }
  };

  const updatePlan = async (planId: string, formData: DCAFormData): Promise<boolean> => {
    if (!profile?.id) {
      toast.error('Please log in to update DCA plans');
      return false;
    }

    try {
      const { error } = await supabase
        .from('dca_plans')
        .update({
          asset: formData.assetId,
          amount_usd: formData.amount,
          frequency: formData.frequency,
          custom_days_interval: formData.customDaysInterval || null,
          execution_time: formData.executionTime,
          timezone: formData.timezone,
          specific_days: formData.specificDays || null,
          slippage: formData.slippage,
        })
        .eq('id', planId);

      if (error) throw error;
      
      toast.success('DCA plan updated successfully');
      await fetchPlans();
      return true;
    } catch (err) {
      console.error('Error updating DCA plan:', err);
      toast.error('Failed to update DCA plan');
      return false;
    }
  };

  const togglePlan = async (planId: string): Promise<boolean> => {
    const plan = plans.find(p => p.id === planId);
    if (!plan) return false;

    try {
      const { error } = await supabase
        .from('dca_plans')
        .update({ is_active: !plan.is_active })
        .eq('id', planId);

      if (error) throw error;
      
      toast.success(plan.is_active ? 'DCA plan paused' : 'DCA plan resumed');
      await fetchPlans();
      return true;
    } catch (err) {
      console.error('Error toggling DCA plan:', err);
      toast.error('Failed to update DCA plan');
      return false;
    }
  };

  const deletePlan = async (planId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('dca_plans')
        .delete()
        .eq('id', planId);

      if (error) throw error;
      
      toast.success('DCA plan deleted');
      await fetchPlans();
      return true;
    } catch (err) {
      console.error('Error deleting DCA plan:', err);
      toast.error('Failed to delete DCA plan');
      return false;
    }
  };

  return {
    plans,
    isLoading,
    error,
    createPlan,
    updatePlan,
    togglePlan,
    deletePlan,
    refreshPlans: fetchPlans,
  };
};
