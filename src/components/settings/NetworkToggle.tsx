import { useState } from 'react';
import { Globe, TestTube } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePrivyAuth } from '@/context/PrivyAuthContext';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

export const NetworkToggle = () => {
  const { profile, refreshProfile } = usePrivyAuth();
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  
  const isTestnet = profile?.network_mode === 'testnet';

  const handleToggle = async () => {
    if (!profile) {
      toast({
        title: 'Connect a wallet',
        description: 'Log in first to switch between testnet and mainnet.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    const newMode = isTestnet ? 'mainnet' : 'testnet';
    
    try {
      // Use edge function to bypass RLS (Privy auth doesn't use Supabase auth)
      const { data, error } = await supabase.functions.invoke('update-profile', {
        body: {
          profileId: profile.id,
          updates: { network_mode: newMode }
        }
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Update failed');
      
      await refreshProfile();

      // Invalidate wallet data to force re-sync with new network
      // Crypto prices will auto-refetch via useEffect when profile.network_mode changes
      queryClient.invalidateQueries({ queryKey: ['wallet-data'] });
      
      toast({
        title: `Switched to ${newMode === 'testnet' ? 'Testnet' : 'Mainnet'}`,
        description: newMode === 'testnet' 
          ? 'Now using Hyperliquid testnet. Tap Sync to refresh wallet data.' 
          : 'Now using Hyperliquid mainnet for real trading. Tap Sync to refresh.',
      });
    } catch (error) {
      console.error('Failed to update network mode:', error);
      toast({
        title: 'Error',
        description: 'Failed to update network mode',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isSaving}
      className="w-full flex items-center justify-between p-4 rounded-xl transition-colors hover:bg-secondary disabled:opacity-50"
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center',
          isTestnet ? 'bg-accent/30' : 'bg-primary/20'
        )}>
          {isTestnet ? (
            <TestTube className="w-5 h-5 text-accent-foreground" />
          ) : (
            <Globe className="w-5 h-5 text-primary" />
          )}
        </div>
        <div className="text-left">
          <div className="font-medium text-foreground">
            Network: {isTestnet ? 'Testnet' : 'Mainnet'}
          </div>
          <div className="text-sm text-muted-foreground">
            {isTestnet ? 'Using test funds' : 'Real trading enabled'}
          </div>
        </div>
      </div>
      <div className={cn(
        'w-11 h-6 rounded-full transition-colors relative',
        isTestnet ? 'bg-yellow-500' : 'bg-primary'
      )}>
        <div className={cn(
          'absolute top-1 w-4 h-4 rounded-full bg-white transition-transform',
          isTestnet ? 'left-6' : 'left-1'
        )} />
      </div>
    </button>
  );
};
