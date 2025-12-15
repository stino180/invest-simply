import { useState } from 'react';
import { Search } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { AssetCard } from '@/components/assets/AssetCard';
import { mockAssets } from '@/data/mockAssets';
import { cn } from '@/lib/utils';

const filters = ['All', 'Trending', 'Top Gainers', 'New'];

const Assets = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const filteredAssets = mockAssets.filter(asset => {
    const matchesSearch = 
      asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.symbol.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (activeFilter === 'Top Gainers') {
      return matchesSearch && asset.change24h > 3;
    }
    
    return matchesSearch;
  });

  // Sort by change for Top Gainers
  const sortedAssets = activeFilter === 'Top Gainers' 
    ? [...filteredAssets].sort((a, b) => b.change24h - a.change24h)
    : filteredAssets;

  return (
    <AppShell>
      <div className="p-4 safe-top space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold font-display">Assets</h1>
          <p className="text-sm text-muted-foreground">Browse and invest in crypto</p>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets..."
            className="w-full h-12 pl-12 pr-4 bg-secondary rounded-xl border-2 border-transparent focus:border-primary focus:outline-none transition-colors"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
          {filters.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all',
                activeFilter === filter
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              )}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Asset List */}
        <div className="space-y-2">
          {sortedAssets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} />
          ))}
          
          {sortedAssets.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No assets found
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
};

export default Assets;
