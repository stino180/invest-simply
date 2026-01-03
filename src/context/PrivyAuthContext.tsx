import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
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

  // Track last synced state to prevent duplicate calls
  const lastSyncedRef = useRef<{ did: string; wallet: string | null } | null>(null);
  const isSyncingRef = useRef(false);

  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
  const externalWallet = wallets.find(w => w.walletClientType !== 'privy');

  const hasWalletLogin = user?.linkedAccounts?.some(
    (acc: any) => acc.type === 'wallet' && acc.walletClientType !== 'privy'
  );

  // For wallet logins, use external wallet. For email logins, use embedded wallet.
  // This ensures the profile.wallet_address always matches the wallet that will sign.
  const walletAddress = hasWalletLogin
    ? (externalWallet?.address || user?.wallet?.address || null)
    : (embeddedWallet?.address || null);

  const syncWithBackend = useCallback(async (force = false) => {
    if (!authenticated || !user) {
      setProfile(null);
      setIsLoading(false);
      return;
    }

    // Prevent concurrent syncs
    if (isSyncingRef.current) {
      console.log('[PrivyAuth] Sync already in progress, skipping');
      return;
    }

    // Check if we already synced this exact state (idempotency check)
    const currentState = { did: user.id, wallet: walletAddress };
    if (
      !force &&
      lastSyncedRef.current &&
      lastSyncedRef.current.did === currentState.did &&
      lastSyncedRef.current.wallet === currentState.wallet
    ) {
      console.log('[PrivyAuth] Already synced this state, skipping');
      setIsLoading(false);
      return;
    }

    isSyncingRef.current = true;

    try {
      const accessToken = await getAccessToken();
      if (!accessToken) {
        console.error('No access token available');
        setIsLoading(false);
        return;
      }

      const hasEmailLogin = !!user?.email?.address;

      console.log('[PrivyAuth] Syncing with backend:', {
        did: user.id,
        email: user.email?.address,
        walletAddress,
        hasWalletLogin,
        hasEmailLogin,
        linkedAccounts: user.linkedAccounts?.map((a: any) => ({ type: a.type, walletClientType: a.walletClientType })),
      });

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
        // Mark this state as synced
        lastSyncedRef.current = currentState;
      }
    } catch (err) {
      console.error('Error syncing with backend:', err);
    } finally {
      isSyncingRef.current = false;
      setIsLoading(false);
    }
  }, [authenticated, user, walletAddress, hasWalletLogin, getAccessToken]);

  const refreshProfile = useCallback(async () => {
    // Force refresh bypasses idempotency check
    await syncWithBackend(true);
  }, [syncWithBackend]);

  // Only trigger sync when authentication state changes, not on every wallet update
  // The walletAddress is already captured in syncWithBackend's closure
  useEffect(() => {
    if (ready) {
      if (authenticated && user) {
        syncWithBackend();
      } else {
        setProfile(null);
        setIsLoading(false);
        lastSyncedRef.current = null; // Reset on logout
      }
    }
  }, [ready, authenticated, user?.id, syncWithBackend]); // Use user.id instead of user object

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
