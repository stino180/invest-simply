export interface Asset {
  id: string;
  symbol: string;
  name: string;
  icon: string;
  type: 'crypto' | 'stock';
  price: number;
  change24h: number;
  marketCap: number;
  volume24h: number;
  sparkline: number[];
}

export const mockAssets: Asset[] = [
  {
    id: 'btc',
    symbol: 'BTC',
    name: 'Bitcoin',
    icon: '₿',
    type: 'crypto',
    price: 104250.00,
    change24h: 2.34,
    marketCap: 2050000000000,
    volume24h: 45000000000,
    sparkline: [100, 102, 101, 103, 105, 104, 106, 108, 107, 109, 108, 110],
  },
  {
    id: 'eth',
    symbol: 'ETH',
    name: 'Ethereum',
    icon: 'Ξ',
    type: 'crypto',
    price: 3920.50,
    change24h: 1.85,
    marketCap: 472000000000,
    volume24h: 18000000000,
    sparkline: [100, 99, 101, 102, 100, 103, 104, 102, 105, 106, 104, 107],
  },
  {
    id: 'sol',
    symbol: 'SOL',
    name: 'Solana',
    icon: '◎',
    type: 'crypto',
    price: 228.45,
    change24h: 5.67,
    marketCap: 108000000000,
    volume24h: 5200000000,
    sparkline: [100, 103, 105, 104, 108, 110, 109, 112, 115, 113, 116, 118],
  },
  {
    id: 'avax',
    symbol: 'AVAX',
    name: 'Avalanche',
    icon: '🔺',
    type: 'crypto',
    price: 52.30,
    change24h: -1.24,
    marketCap: 21000000000,
    volume24h: 890000000,
    sparkline: [100, 99, 98, 100, 99, 97, 98, 96, 97, 98, 96, 97],
  },
  {
    id: 'link',
    symbol: 'LINK',
    name: 'Chainlink',
    icon: '⬡',
    type: 'crypto',
    price: 28.75,
    change24h: 3.42,
    marketCap: 17500000000,
    volume24h: 1200000000,
    sparkline: [100, 101, 103, 102, 105, 104, 107, 108, 106, 109, 108, 110],
  },
  {
    id: 'arb',
    symbol: 'ARB',
    name: 'Arbitrum',
    icon: '🔷',
    type: 'crypto',
    price: 1.42,
    change24h: -2.15,
    marketCap: 5400000000,
    volume24h: 320000000,
    sparkline: [100, 99, 98, 97, 99, 98, 96, 97, 95, 96, 94, 95],
  },
  {
    id: 'op',
    symbol: 'OP',
    name: 'Optimism',
    icon: '🔴',
    type: 'crypto',
    price: 2.85,
    change24h: 4.20,
    marketCap: 3200000000,
    volume24h: 280000000,
    sparkline: [100, 102, 104, 103, 106, 108, 107, 110, 109, 112, 111, 114],
  },
  {
    id: 'matic',
    symbol: 'POL',
    name: 'Polygon',
    icon: '⬟',
    type: 'crypto',
    price: 0.62,
    change24h: 1.05,
    marketCap: 6100000000,
    volume24h: 450000000,
    sparkline: [100, 100, 101, 102, 101, 103, 102, 104, 103, 105, 104, 106],
  },
];

export const getAssetById = (id: string): Asset | undefined => {
  return mockAssets.find(asset => asset.id === id);
};

export const formatPrice = (price: number): string => {
  if (price >= 1000) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(price);
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(price);
};

export const formatMarketCap = (value: number): string => {
  if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toFixed(2)}`;
};

export const formatVolume = (value: number): string => {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  return `$${value.toFixed(0)}`;
};
