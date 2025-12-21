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

  // Fetch cached holdings from database
  const { data: holdings = [], isLoading: holdingsLoading } = useQuery({
    queryKey: ['wallet-holdings', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      
      const { data, error } = await supabase
        .from('wallet_holdings')
        .select('*')
        .order('value_usd', { ascending: false });

      if (error) {
        console.error('Error fetching holdings:', error);
        return [];
      }

      return data as WalletHolding[];
    },
    enabled: isAuthenticated && !!profile?.id,
  });

  // Fetch cached balance from database
  const { data: balance, isLoading: balanceLoading } = useQuery({
    queryKey: ['wallet-balance', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;

      const { data, error } = await supabase
        .from('wallet_balances')
        .select('*')
        .maybeSingle();

      if (error) {
        console.error('Error fetching balance:', error);
        return null;
      }

      return data as WalletBalance | null;
    },
    enabled: isAuthenticated && !!profile?.id,
  });

  // Fetch cached transactions from database
  const { data: transactions = [], isLoading: transactionsLoading } = useQuery({
    queryKey: ['wallet-transactions', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];

      const { data, error } = await supabase
        .from('wallet_transactions')
        .select('*')
        .order('timestamp', { ascending: false });

      if (error) {
        console.error('Error fetching transactions:', error);
        return [];
      }

      return data as WalletTransaction[];
    },
    enabled: isAuthenticated && !!profile?.id,
  });

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
      queryClient.invalidateQueries({ queryKey: ['wallet-holdings'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] });
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
    isLoading: holdingsLoading || balanceLoading || transactionsLoading,
    isSyncing,
    syncWallet,
    lastSynced: balance?.last_synced_at,
    hasSynced: hasSynced.current,
  };
};
