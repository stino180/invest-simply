import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CryptoAsset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  sparkline: number[];
}

// Brand colors for popular cryptos
export const cryptoColors: Record<string, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#00FFA3',
  AVAX: '#E84142',
  LINK: '#2A5ADA',
  ARB: '#28A0F0',
  OP: '#FF0420',
  MATIC: '#8247E5',
  POL: '#8247E5',
  DOGE: '#C2A633',
  ADA: '#0033AD',
  DOT: '#E6007A',
  UNI: '#FF007A',
  AAVE: '#B6509E',
  MKR: '#1AAB9B',
  COMP: '#00D395',
  HYPE: '#22D3EE',
};

export const useCryptoPrices = () => {
  const [assets, setAssets] = useState<CryptoAsset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrices = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fnError } = await supabase.functions.invoke('fetch-crypto-prices');

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
    
    // Refresh every 60 seconds
    const interval = setInterval(fetchPrices, 60000);
    return () => clearInterval(interval);
  }, []);

  return { assets, isLoading, error, refetch: fetchPrices };
};
