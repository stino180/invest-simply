import { useState } from 'react';
import { X, ChevronDown, Check, Loader2 } from 'lucide-react';
import { mockAssets, Asset, formatPrice } from '@/data/mockAssets';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CreateDCAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (plan: { assetId: string; amount: number; frequency: string }) => void;
}

const frequencies = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
];

const presetAmounts = [25, 50, 100, 250];

export const CreateDCAModal = ({ isOpen, onClose, onConfirm }: CreateDCAModalProps) => {
  const [selectedAsset, setSelectedAsset] = useState<Asset>(mockAssets[0]);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [amount, setAmount] = useState('50');
  const [frequency, setFrequency] = useState('weekly');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const numAmount = parseFloat(amount) || 0;

  const handleConfirm = async () => {
    if (numAmount <= 0) return;
    
    setIsProcessing(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsProcessing(false);
    setIsSuccess(true);
    
    setTimeout(() => {
      onConfirm({ assetId: selectedAsset.id, amount: numAmount, frequency });
      setIsSuccess(false);
      setAmount('50');
      setFrequency('weekly');
      onClose();
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-md bg-card rounded-t-3xl sm:rounded-2xl p-6 animate-slide-up shadow-2xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 p-2 rounded-full hover:bg-secondary transition-colors"
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>

        {isSuccess ? (
          <div className="py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4 animate-scale-in">
              <Check className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-xl font-bold mb-2">DCA Plan Created!</h3>
            <p className="text-muted-foreground">
              Auto-buying ${numAmount} of {selectedAsset.symbol} {frequency}
            </p>
          </div>
        ) : (
          <>
            <h3 className="text-xl font-bold mb-6">Create DCA Plan</h3>

            {/* Asset Selector */}
            <div className="mb-4">
              <label className="text-sm text-muted-foreground mb-2 block">
                Select Asset
              </label>
              <button
                onClick={() => setShowAssetPicker(!showAssetPicker)}
                className="w-full flex items-center justify-between p-4 bg-secondary rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-lg">
                    {selectedAsset.icon}
                  </div>
                  <div className="text-left">
                    <div className="font-semibold">{selectedAsset.symbol}</div>
                    <div className="text-sm text-muted-foreground">{selectedAsset.name}</div>
                  </div>
                </div>
                <ChevronDown className={cn(
                  'w-5 h-5 text-muted-foreground transition-transform',
                  showAssetPicker && 'rotate-180'
                )} />
              </button>
              
              {showAssetPicker && (
                <div className="mt-2 bg-secondary rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {mockAssets.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => {
                        setSelectedAsset(asset);
                        setShowAssetPicker(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 p-3 hover:bg-card transition-colors',
                        selectedAsset.id === asset.id && 'bg-card'
                      )}
                    >
                      <div className="w-8 h-8 rounded-full bg-card flex items-center justify-center">
                        {asset.icon}
                      </div>
                      <div className="text-left flex-1">
                        <div className="font-medium text-sm">{asset.symbol}</div>
                        <div className="text-xs text-muted-foreground">{asset.name}</div>
                      </div>
                      <div className="text-sm font-medium">{formatPrice(asset.price)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Amount Input */}
            <div className="mb-4">
              <label className="text-sm text-muted-foreground mb-2 block">
                Amount per purchase (USD)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground">
                  $
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full h-14 pl-10 pr-4 text-2xl font-bold bg-secondary rounded-xl border-2 border-transparent focus:border-primary focus:outline-none transition-colors"
                  placeholder="0"
                />
              </div>
              
              <div className="flex gap-2 mt-3">
                {presetAmounts.map((preset) => (
                  <button
                    key={preset}
                    onClick={() => setAmount(preset.toString())}
                    className={cn(
                      'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                      amount === preset.toString()
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary hover:bg-secondary/80'
                    )}
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Frequency Selector */}
            <div className="mb-6">
              <label className="text-sm text-muted-foreground mb-2 block">
                Frequency
              </label>
              <div className="grid grid-cols-2 gap-2">
                {frequencies.map((freq) => (
                  <button
                    key={freq.value}
                    onClick={() => setFrequency(freq.value)}
                    className={cn(
                      'py-3 rounded-xl text-sm font-medium transition-all',
                      frequency === freq.value
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary hover:bg-secondary/80'
                    )}
                  >
                    {freq.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="p-4 bg-secondary/50 rounded-xl mb-6">
              <p className="text-sm text-center text-muted-foreground">
                You'll automatically invest <span className="font-semibold text-foreground">${numAmount}</span> into{' '}
                <span className="font-semibold text-foreground">{selectedAsset.symbol}</span>{' '}
                {frequencies.find(f => f.value === frequency)?.label.toLowerCase()}
              </p>
            </div>

            <Button
              onClick={handleConfirm}
              disabled={numAmount <= 0 || isProcessing}
              className="w-full h-14 text-lg font-semibold rounded-xl gradient-primary hover:opacity-90 transition-opacity"
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'Create DCA Plan'
              )}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
