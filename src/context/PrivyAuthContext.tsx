import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { supabase } from '@/integrations/supabase/client';

interface Profile {
  id: string;
  user_id: string;
  privy_did: string;
  wallet_address: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
  network_mode: 'mainnet' | 'testnet';
  low_balance_threshold: number | null;
}

interface PrivyAuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  profile: Profile | null;
  walletAddress: string | null;
  login: () => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const PrivyAuthContext = createContext<PrivyAuthContextType | undefined>(undefined);

export const PrivyAuthProvider = ({ children }: { children: ReactNode }) => {
  const { ready, authenticated, user, login, logout: privyLogout, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
  const externalWallet = wallets.find(w => w.walletClientType !== 'privy');

  // Prefer the user-selected external wallet when present (matches what you connect in MetaMask/Rainbow),
  // otherwise fall back to the embedded wallet.
  const walletAddress = externalWallet?.address || embeddedWallet?.address || user?.wallet?.address || null;

  const syncWithBackend = async () => {
    if (!authenticated || !user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        console.error('No access token available');
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('privy-auth', {
        body: {
          privyUser: {
            did: user.id,
            email: user.email?.address,
            wallet: walletAddress ? { address: walletAddress } : undefined,
          },
          accessToken,
        },
      });

      if (error) {
        console.error('Backend sync error:', error);
        setIsLoading(false);
        return;
      }

      if (data?.profile) {
        setProfile(data.profile);
      }
    } catch (err) {
      console.error('Error syncing with backend:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshProfile = async () => {
    await syncWithBackend();
  };

  useEffect(() => {
    if (ready) {
      if (authenticated && user) {
        syncWithBackend();
      } else {
        setProfile(null);
        setIsLoading(false);
      }
    }
  }, [ready, authenticated, user, walletAddress]);

  const handleLogout = async () => {
    await privyLogout();
    setProfile(null);
  };

  return (
    <PrivyAuthContext.Provider
      value={{
        isAuthenticated: authenticated && !!profile,
        isLoading: !ready || isLoading,
        profile,
        walletAddress,
        login,
        logout: handleLogout,
        refreshProfile,
      }}
    >
      {children}
    </PrivyAuthContext.Provider>
  );
};

export const usePrivyAuth = () => {
  const context = useContext(PrivyAuthContext);
  if (context === undefined) {
    throw new Error('usePrivyAuth must be used within a PrivyAuthProvider');
  }
  return context;
};
