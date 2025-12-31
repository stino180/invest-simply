import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { PortfolioCard } from '@/components/portfolio/PortfolioCard';
import { HoldingsList } from '@/components/portfolio/HoldingsList';
import { TransactionList } from '@/components/transactions/TransactionList';
import { Button } from '@/components/ui/button';
import { useWalletData } from '@/hooks/useWalletData';
import { usePrivyAuth } from '@/context/PrivyAuthContext';

const Dashboard = () => {
  const { isAuthenticated, profile } = usePrivyAuth();
  const { 
    holdings,
    transactions,
    totalValue, 
    usdcBalance, 
    portfolioChange, 
    isLoading, 
    isSyncing, 
    syncWallet,
    lastSynced,
    hasSynced
  } = useWalletData();

  const isTestnet = profile?.network_mode === 'testnet';

  // Auto-sync on first load if authenticated and no cached data
  useEffect(() => {
    if (isAuthenticated && !isLoading && !lastSynced && !hasSynced && !isSyncing) {
      syncWallet();
    }
  }, [isAuthenticated, isLoading, lastSynced, hasSynced, isSyncing, syncWallet]);

  return (
    <AppShell>
      <div className="p-4 safe-top space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-muted-foreground">Good morning 👋</p>
              {isTestnet && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-500/20 text-yellow-500">
                  Testnet
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold font-display text-foreground">Dashboard</h1>
          </div>
          <Link to="/assets">
            <Button size="sm" className="rounded-xl gradient-primary">
              <Plus className="w-4 h-4 mr-1" />
              Buy
            </Button>
          </Link>
        </div>

        {/* Portfolio Card */}
        <PortfolioCard 
          totalValue={totalValue} 
          change={portfolioChange} 
          balance={usdcBalance}
          onRefresh={syncWallet}
          isRefreshing={isSyncing}
          lastSynced={lastSynced}
        />

        {/* Holdings */}
        <HoldingsList holdings={holdings} isLoading={isLoading} />

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between px-1 mb-3">
            <h3 className="font-semibold text-lg text-foreground">Recent Activity</h3>
            <Link 
              to="/transactions" 
              className="text-sm text-primary font-medium hover:underline"
            >
              See All
            </Link>
          </div>
          {transactions.length > 0 ? (
            <TransactionList transactions={transactions} limit={3} />
          ) : (
            <div className="p-4 text-center text-muted-foreground rounded-xl bg-card">
              <p className="text-sm">No recent activity</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
};

export default Dashboard;
