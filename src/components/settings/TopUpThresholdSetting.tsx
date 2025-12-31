import { useState, useEffect } from 'react';
import { DollarSign, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePrivyAuth } from '@/context/PrivyAuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface TopUpThresholdSettingProps {
  onThresholdChange?: (threshold: number) => void;
}

export const TopUpThresholdSetting = ({ onThresholdChange }: TopUpThresholdSettingProps) => {
  const { profile } = usePrivyAuth();
  const [threshold, setThreshold] = useState<string>('100');
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalThreshold, setOriginalThreshold] = useState<string>('100');

  useEffect(() => {
    const fetchThreshold = async () => {
      if (!profile?.id) return;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('low_balance_threshold')
        .eq('id', profile.id)
        .single();
      
      if (data && !error) {
        const value = (data as any).low_balance_threshold?.toString() || '100';
        setThreshold(value);
        setOriginalThreshold(value);
      }
    };
    
    fetchThreshold();
  }, [profile?.id]);

  const handleChange = (value: string) => {
    // Only allow numbers and decimal point
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setThreshold(value);
      setHasChanges(value !== originalThreshold);
    }
  };

  const handleSave = async () => {
    if (!profile?.id) return;
    
    const numericValue = parseFloat(threshold) || 0;
    
    if (numericValue < 0) {
      toast({
        title: 'Invalid threshold',
        description: 'Threshold must be a positive number',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSaving(true);
    
    // Use edge function to bypass RLS (Privy auth doesn't use Supabase auth)
    const { data, error } = await supabase.functions.invoke('update-profile', {
      body: {
        profileId: profile.id,
        updates: { low_balance_threshold: numericValue }
      }
    });
    
    setIsSaving(false);
    
    if (error || !data?.success) {
      toast({
        title: 'Failed to save',
        description: 'Could not update your threshold setting',
        variant: 'destructive',
      });
      return;
    }
    
    setOriginalThreshold(threshold);
    setHasChanges(false);
    onThresholdChange?.(numericValue);
    
    toast({
      title: 'Threshold saved',
      description: `You'll be reminded when balance drops below $${numericValue}`,
    });
  };

  const presetAmounts = [50, 100, 250, 500];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center shrink-0">
          <DollarSign className="w-5 h-5 text-foreground" />
        </div>
        <div className="flex-1">
          <div className="font-medium text-foreground">Low Balance Alert</div>
          <p className="text-sm text-muted-foreground">
            Get reminded to add funds when your balance drops below this amount
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
          <Input
            type="text"
            inputMode="decimal"
            value={threshold}
            onChange={(e) => handleChange(e.target.value)}
            className="pl-7"
            placeholder="100"
          />
        </div>
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || isSaving}
          size="icon"
          variant={hasChanges ? "default" : "secondary"}
        >
          <Check className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex gap-2">
        {presetAmounts.map((amount) => (
          <button
            key={amount}
            onClick={() => handleChange(amount.toString())}
            className={cn(
              "flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors",
              parseFloat(threshold) === amount
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-foreground hover:bg-secondary/80"
            )}
          >
            ${amount}
          </button>
        ))}
      </div>
    </div>
  );
};