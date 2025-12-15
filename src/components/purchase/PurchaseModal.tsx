import { useState } from 'react';
import { X, Check, Loader2 } from 'lucide-react';
import { Asset, formatPrice } from '@/data/mockAssets';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PurchaseModalProps {
  asset: Asset;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (amount: number) => void;
  balance: number;
}

const presetAmounts = [25, 50, 100, 250, 500];

export const PurchaseModal = ({ 
  asset, 
  isOpen, 
  onClose, 
  onConfirm,
  balance 
}: PurchaseModalProps) => {
  const [amount, setAmount] = useState<string>('50');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  const numAmount = parseFloat(amount) || 0;
  const estimatedQty = numAmount / asset.price;
  const insufficientFunds = numAmount > balance;

  const handleConfirm = async () => {
    if (insufficientFunds || numAmount <= 0) return;
    
    setIsProcessing(true);
    // Simulate transaction
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsProcessing(false);
    setIsSuccess(true);
    
    setTimeout(() => {
      onConfirm(numAmount);
      setIsSuccess(false);
      setAmount('50');
      onClose();
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md bg-card rounded-t-3xl sm:rounded-2xl p-6 animate-slide-up shadow-2xl">
        {/* Close button */}
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
            <h3 className="text-xl font-bold mb-2">Purchase Confirmed!</h3>
            <p className="text-muted-foreground">
              You bought {estimatedQty.toFixed(6)} {asset.symbol}
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center text-xl">
                {asset.icon}
              </div>
              <div>
                <h3 className="text-xl font-bold">Buy {asset.symbol}</h3>
                <p className="text-sm text-muted-foreground">{asset.name}</p>
              </div>
            </div>

            {/* Amount Input */}
            <div className="mb-4">
              <label className="text-sm text-muted-foreground mb-2 block">
                Amount (USD)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">
                  $
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full h-16 pl-10 pr-4 text-3xl font-bold bg-secondary rounded-xl border-2 border-transparent focus:border-primary focus:outline-none transition-colors"
                  placeholder="0"
                />
              </div>
            </div>

            {/* Preset Amounts */}
            <div className="flex gap-2 mb-6">
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

            {/* Summary */}
            <div className="space-y-3 mb-6 p-4 bg-secondary/50 rounded-xl">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Price</span>
                <span className="font-medium">{formatPrice(asset.price)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Est. quantity</span>
                <span className="font-medium">
                  ~{estimatedQty.toFixed(6)} {asset.symbol}
                </span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-border">
                <span className="text-muted-foreground">Available</span>
                <span className={cn(
                  'font-medium',
                  insufficientFunds && 'text-destructive'
                )}>
                  {formatPrice(balance)}
                </span>
              </div>
            </div>

            {/* Confirm Button */}
            <Button
              onClick={handleConfirm}
              disabled={insufficientFunds || numAmount <= 0 || isProcessing}
              className="w-full h-14 text-lg font-semibold rounded-xl gradient-primary hover:opacity-90 transition-opacity"
            >
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : insufficientFunds ? (
                'Insufficient Balance'
              ) : (
                `Confirm Purchase`
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground mt-4">
              No gas fees • Instant execution
            </p>
          </>
        )}
      </div>
    </div>
  );
};
