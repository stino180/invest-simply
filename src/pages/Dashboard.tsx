import { Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { PortfolioCard } from '@/components/portfolio/PortfolioCard';
import { HoldingsList } from '@/components/portfolio/HoldingsList';
import { TransactionList } from '@/components/transactions/TransactionList';
import { 
  mockPortfolio, 
  mockTransactions, 
  mockBalance,
  calculatePortfolioValue, 
  calculatePortfolioChange 
} from '@/data/mockPortfolio';
import { Button } from '@/components/ui/button';

const Dashboard = () => {
  const totalValue = calculatePortfolioValue(mockPortfolio);
  const change = calculatePortfolioChange(mockPortfolio);

  return (
    <AppShell>
      <div className="p-4 safe-top space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Good morning 👋</p>
            <h1 className="text-2xl font-bold font-display">Dashboard</h1>
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
          change={change} 
          balance={mockBalance.usd}
        />

        {/* Holdings */}
        <HoldingsList holdings={mockPortfolio} />

        {/* Recent Activity */}
        <div>
          <div className="flex items-center justify-between px-1 mb-3">
            <h3 className="font-semibold text-lg">Recent Activity</h3>
            <Link 
              to="/transactions" 
              className="text-sm text-primary font-medium hover:underline"
            >
              See All
            </Link>
          </div>
          <TransactionList transactions={mockTransactions} limit={3} />
        </div>
      </div>
    </AppShell>
  );
};

export default Dashboard;
