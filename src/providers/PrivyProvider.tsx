import { PrivyProvider as PrivyProviderBase } from '@privy-io/react-auth';
import { ReactNode } from 'react';
import { arbitrum, arbitrumSepolia } from 'viem/chains';

interface PrivyProviderProps {
  children: ReactNode;
}

export const PrivyProvider = ({ children }: PrivyProviderProps) => {
  const appId = import.meta.env.VITE_PRIVY_APP_ID || '';

  if (!appId) {
    console.error('VITE_PRIVY_APP_ID is not configured');
    return <>{children}</>;
  }

  return (
    <PrivyProviderBase
      appId={appId}
      config={{
        appearance: {
          theme: 'dark',
          accentColor: '#22d3ee',
          logo: '/icon-192.png',
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
        loginMethods: ['email', 'wallet'],
        supportedChains: [arbitrum, arbitrumSepolia],
        defaultChain: arbitrum,
      }}
    >
      {children}
    </PrivyProviderBase>
  );
};
