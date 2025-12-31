import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
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
      quantity,
      slippage = 1
    }: {
      asset: string;
      amountUsd?: number;
      quantity?: number;
      slippage?: number;
    }): Promise<SpotBuyResult> => {
      if (!profile?.id) {
        throw new Error('Not authenticated');
      }

      if (!amountUsd && !quantity) {
        throw new Error('Either amountUsd or quantity is required');
      }

      // Preflight: ensure the agent wallet is authorized before attempting a trade
      const { data: authData, error: authErr } = await supabase.functions.invoke('agent-wallet', {
        body: { action: 'check-authorization', profileId: profile.id },
      });

      if (authErr) {
        throw authErr;
      }

      // If DB says not authorized, try to sync from Hyperliquid (covers cases like
      // "Extra agent already used" where Hyperliquid is authorized but our DB isn't).
      if (!authData?.isAuthorized) {
        const { data: syncData, error: syncErr } = await supabase.functions.invoke('agent-wallet', {
          body: { action: 'sync-authorization', profileId: profile.id },
        });

        if (syncErr) {
          throw syncErr;
        }

        if (!syncData?.isAuthorized) {
          throw new Error(
            'Agent wallet not authorized yet. Open Wallet → Authorize Agent Wallet, then try again.'
          );
        }
      }

      const { data, error } = await supabase.functions.invoke('spot-buy', {
        body: {
          profileId: profile.id,
          asset,
          ...(quantity ? { quantity } : { amountUsd }),
          slippage,
        },
      });

      if (error) {
        // Supabase returns a FunctionsHttpError for non-2xx responses.
        // Extract the JSON payload so UI/toasts show the real backend message.
        if (error instanceof FunctionsHttpError) {
          const res = (error as any).context as Response | undefined;
          if (res) {
            const payload = await res.clone().json().catch(() => null);
            const message = payload?.error || payload?.message;
            if (message) throw new Error(String(message));
          }
        }

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

  // Buy by quantity (for assets like PURR that need whole numbers)
  const buyQuantity = async (asset: string, quantity: number, slippage?: number) => {
    if (isProcessing) return null;

    setIsProcessing(true);
    try {
      const result = await mutation.mutateAsync({ asset, quantity, slippage });
      return result;
    } catch (error) {
      return null;
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    buy,
    buyQuantity,
    isProcessing: isProcessing || mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error,
    reset: mutation.reset,
  };
};