import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePrivyAuth } from '@/context/PrivyAuthContext';
import { toast } from 'sonner';

interface SpotBuyResult {
  success: boolean;
  orderId?: string;
  asset?: string;
  amountUsd?: number;
  amountCrypto?: number;
  price?: number;
  error?: string;
}

export const useSpotBuy = () => {
  const { profile } = usePrivyAuth();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);

  const mutation = useMutation({
    mutationFn: async ({ 
      asset, 
      amountUsd, 
      slippage = 1 
    }: { 
      asset: string; 
      amountUsd: number; 
      slippage?: number;
    }): Promise<SpotBuyResult> => {
      if (!profile?.id) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase.functions.invoke('spot-buy', {
        body: {
          profileId: profile.id,
          asset,
          amountUsd,
          slippage,
        },
      });

      if (error) {
        throw error;
      }

      if (!data.success) {
        throw new Error(data.error || 'Purchase failed');
      }

      return data;
    },
    onSuccess: (data) => {
      // Invalidate wallet data to refresh balances
      queryClient.invalidateQueries({ queryKey: ['wallet-data'] });
      toast.success(`Purchased ${data.amountCrypto?.toFixed(6)} ${data.asset}`);
    },
    onError: (error) => {
      console.error('Spot buy error:', error);
      toast.error(error instanceof Error ? error.message : 'Purchase failed');
    },
  });

  const buy = async (asset: string, amountUsd: number, slippage?: number) => {
    if (isProcessing) return null;
    
    setIsProcessing(true);
    try {
      const result = await mutation.mutateAsync({ asset, amountUsd, slippage });
      return result;
    } catch (error) {
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    buy,
    isProcessing: isProcessing || mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error,
    reset: mutation.reset,
  };
};