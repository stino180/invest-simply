import { useState } from 'react';
import { Search, RefreshCw, Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { AssetCard } from '@/components/assets/AssetCard';
import { useCryptoPrices } from '@/hooks/useCryptoPrices';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const filters = ['All', 'Trending', 'Top Gainers', 'Top Losers'];

const Assets = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const { assets, isLoading, refetch } = useCryptoPrices();

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = 
      asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.symbol.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (activeFilter === 'Top Gainers') {
      return matchesSearch && asset.change24h > 0;
    }
    if (activeFilter === 'Top Losers') {
      return matchesSearch && asset.change24h < 0;
    }
    
    return matchesSearch;
  });

  // Sort based on filter
  const sortedAssets = (() => {
    if (activeFilter === 'Top Gainers') {
      return [...filteredAssets].sort((a, b) => b.change24h - a.change24h);
    }
    if (activeFilter === 'Top Losers') {
      return [...filteredAssets].sort((a, b) => a.change24h - b.change24h);
    }
    if (activeFilter === 'Trending') {
      // Sort by price as proxy for popularity since we don't have volume
      return [...filteredAssets].sort((a, b) => b.price - a.price);
    }
    return filteredAssets;
  })();

  return (
    <AppShell>
      <div className="p-4 safe-top space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display text-foreground">Assets</h1>
            <p className="text-sm text-muted-foreground">Live prices from Hyperliquid</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={refetch}
            disabled={isLoading}
          >
            <RefreshCw className={cn("w-5 h-5", isLoading && "animate-spin")} />
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search assets..."
            className="w-full h-12 pl-12 pr-4 bg-secondary text-foreground rounded-xl border-2 border-transparent focus:border-primary focus:outline-none transition-colors placeholder:text-muted-foreground"
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
        {isLoading && assets.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
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
        )}
      </div>
    </AppShell>
  );
};

export default Assets;
