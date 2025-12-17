import { PrivyProvider as PrivyProviderBase } from '@privy-io/react-auth';
import { ReactNode } from 'react';

interface PrivyProviderProps {
  children: ReactNode;
}

export const PrivyProvider = ({ children }: PrivyProviderProps) => {
  // Privy App ID is a publishable key (safe for frontend)
  const appId = 'cmj7gqfzb0334jp0c28ke1s5k';


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
      }}
    >
      {children}
    </PrivyProviderBase>
  );
};
