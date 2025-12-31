export interface PortfolioHolding {
  assetId: string;
  symbol: string;
  name: string;
  icon: string;
  amount: number;
  avgBuyPrice: number;
  currentPrice: number;
}

export interface Transaction {
  id: string;
  type: 'buy' | 'sell' | 'deposit' | 'withdraw';
  assetId?: string;
  symbol?: string;
  amount: number;
  price?: number;
  total: number;
  timestamp: Date;
  status: 'completed' | 'pending' | 'failed';
}

export interface DCAplan {
  id: string;
  assetId: string;
  symbol: string;
  name: string;
  icon: string;
  amount: number;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom' | 'calendar';
  nextExecution: Date;
  totalInvested: number;
  isActive: boolean;
  createdAt: Date;
  // Flexible scheduling options
  customDaysInterval?: number;
  executionTime?: string;
  timezone?: string;
  specificDays?: string[];
  // Trade settings
  slippage?: number;
}

export const mockPortfolio: PortfolioHolding[] = [
  {
    assetId: 'btc',
    symbol: 'BTC',
    name: 'Bitcoin',
    icon: '₿',
    amount: 0.0523,
    avgBuyPrice: 95000,
    currentPrice: 104250,
  },
  {
    assetId: 'eth',
    symbol: 'ETH',
    name: 'Ethereum',
    icon: 'Ξ',
    amount: 1.245,
    avgBuyPrice: 3650,
    currentPrice: 3920.50,
  },
  {
    assetId: 'sol',
    symbol: 'SOL',
    name: 'Solana',
    icon: '◎',
    amount: 12.5,
    avgBuyPrice: 185,
    currentPrice: 228.45,
  },
];

export const mockTransactions: Transaction[] = [
  {
    id: 'tx1',
    type: 'buy',
    assetId: 'btc',
    symbol: 'BTC',
    amount: 0.0123,
    price: 102500,
    total: 1260.75,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    status: 'completed',
  },
  {
    id: 'tx2',
    type: 'deposit',
    amount: 500,
    total: 500,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
    status: 'completed',
  },
  {
    id: 'tx3',
    type: 'buy',
    assetId: 'eth',
    symbol: 'ETH',
    amount: 0.125,
    price: 3850,
    total: 481.25,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
    status: 'completed',
  },
  {
    id: 'tx4',
    type: 'buy',
    assetId: 'sol',
    symbol: 'SOL',
    amount: 5.0,
    price: 215,
    total: 1075,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
    status: 'completed',
  },
  {
    id: 'tx5',
    type: 'deposit',
    amount: 2000,
    total: 2000,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
    status: 'completed',
  },
];

export const mockDCAPlans: DCAplan[] = [
  {
    id: 'dca1',
    assetId: 'btc',
    symbol: 'BTC',
    name: 'Bitcoin',
    icon: '₿',
    amount: 100,
    frequency: 'weekly',
    nextExecution: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3),
    totalInvested: 1200,
    isActive: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 90),
  },
  {
    id: 'dca2',
    assetId: 'eth',
    symbol: 'ETH',
    name: 'Ethereum',
    icon: 'Ξ',
    amount: 50,
    frequency: 'weekly',
    nextExecution: new Date(Date.now() + 1000 * 60 * 60 * 24 * 5),
    totalInvested: 600,
    isActive: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 60),
  },
];

export const calculatePortfolioValue = (holdings: PortfolioHolding[]): number => {
  return holdings.reduce((total, holding) => {
    return total + (holding.amount * holding.currentPrice);
  }, 0);
};

export const calculatePortfolioChange = (holdings: PortfolioHolding[]): { value: number; percentage: number } => {
  let currentTotal = 0;
  let investedTotal = 0;
  
  holdings.forEach(holding => {
    currentTotal += holding.amount * holding.currentPrice;
    investedTotal += holding.amount * holding.avgBuyPrice;
  });
  
  const changeValue = currentTotal - investedTotal;
  const changePercentage = investedTotal > 0 ? (changeValue / investedTotal) * 100 : 0;
  
  return { value: changeValue, percentage: changePercentage };
};

export const mockBalance = {
  usd: 847.50,
  totalDeposited: 5000,
};
