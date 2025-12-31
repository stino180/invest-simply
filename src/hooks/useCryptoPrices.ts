import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePrivyAuth } from '@/context/PrivyAuthContext';

export interface CryptoAsset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  color: string;
  price: number;
  change24h: number;
  sparkline: number[];
  isSpotAvailable: boolean;
}

export const useCryptoPrices = () => {
  const { profile } = usePrivyAuth();
  const [assets, setAssets] = useState<CryptoAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const networkMode = profile?.network_mode || 'mainnet';

  const fetchPrices = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fnError } = await supabase.functions.invoke('fetch-crypto-prices', {
        body: { networkMode }
      });

      if (fnError) {
        throw new Error(fnError.message);
      }

      if (data?.success && data?.assets) {
        setAssets(data.assets);
      } else {
        throw new Error(data?.error || 'Failed to fetch prices');
      }
    } catch (err) {
      console.error('Error fetching crypto prices:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPrices();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, [networkMode]);

  return { assets, isLoading, error, refetch: fetchPrices, networkMode };
};
