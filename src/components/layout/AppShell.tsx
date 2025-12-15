import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

interface AppShellProps {
  children: ReactNode;
  hideNav?: boolean;
}

export const AppShell = ({ children, hideNav = false }: AppShellProps) => {
  return (
    <div className="min-h-screen bg-background">
      <main className={!hideNav ? 'pb-24' : ''}>
        {children}
      </main>
      {!hideNav && <BottomNav />}
    </div>
  );
};
