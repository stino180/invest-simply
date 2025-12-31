import { useState, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePrivyAuth } from '@/context/PrivyAuthContext';
import { toast } from 'sonner';

export interface WalletHolding {
  id: string;
  asset: string;
  symbol: string;
  amount: number;
  current_price: number | null;
  value_usd: number | null;
  last_synced_at: string;
}

export interface WalletBalance {
  usdc_balance: number;
  total_value_usd: number;
  last_synced_at: string;
}

export interface WalletTransaction {
  id: string;
  type: 'buy' | 'sell' | 'deposit' | 'withdraw';
  asset: string | null;
  symbol: string | null;
  amount: number | null;
  price: number | null;
  total: number;
  timestamp: string;
  status: string;
  hyperliquid_tx_hash: string | null;
}

export const useWalletData = () => {
  const { profile, isAuthenticated, walletAddress } = usePrivyAuth();
  const queryClient = useQueryClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const hasSynced = useRef(false);

  // Fetch wallet data from backend function (bypasses RLS)
  const { data: walletData, isLoading: walletLoading } = useQuery({
    queryKey: ['wallet-data', profile?.id, profile?.network_mode],
    queryFn: async () => {
      if (!profile?.id) {
        return { holdings: [], balance: null, transactions: [] };
      }

      const { data, error } = await supabase.functions.invoke('get-wallet-data', {
        body: { profileId: profile.id, limit: 200 },
      });

      if (error) {
        console.error('Error fetching wallet data:', error);
        return { holdings: [], balance: null, transactions: [] };
      }

      if (!data?.success) {
        console.error('Wallet data function error:', data?.error);
        return { holdings: [], balance: null, transactions: [] };
      }

      return {
        holdings: (data.holdings || []) as WalletHolding[],
        balance: (data.balance || null) as WalletBalance | null,
        transactions: (data.transactions || []) as WalletTransaction[],
      };
    },
    enabled: isAuthenticated && !!profile?.id,
  });

  const holdings = walletData?.holdings ?? [];
  const balance = walletData?.balance ?? null;
  const transactions = walletData?.transactions ?? [];

  // Sync with Hyperliquid
  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.id || !walletAddress) {
        throw new Error('No wallet connected');
      }

      const { data, error } = await supabase.functions.invoke('sync-hyperliquid', {
        body: {
          profileId: profile.id,
          walletAddress: walletAddress,
          networkMode: profile.network_mode || 'mainnet',
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Sync failed');

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet-data'] });
      toast.success('Wallet synced successfully');
    },
    onError: (error) => {
      console.error('Sync error:', error);
      toast.error('Failed to sync wallet');
    },
  });

  const syncWallet = useCallback(async () => {
    if (isSyncing || !isAuthenticated || !walletAddress) return;
    setIsSyncing(true);
    hasSynced.current = true;
    try {
      await syncMutation.mutateAsync();
    } finally {
      setIsSyncing(false);
    }
  }, [syncMutation, isSyncing, isAuthenticated, walletAddress]);

  // Calculate portfolio metrics
  const totalValue = balance?.total_value_usd || 0;
  const usdcBalance = balance?.usdc_balance || 0;

  // Calculate change (we'd need historical data for this, using 0 for now)
  const portfolioChange = {
    value: 0,
    percentage: 0,
  };

  return {
    holdings,
    balance,
    transactions,
    totalValue,
    usdcBalance,
    portfolioChange,
    isLoading: walletLoading,
    isSyncing,
    syncWallet,
    lastSynced: balance?.last_synced_at,
    hasSynced: hasSynced.current,
  };
};
