import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Check, Loader2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useSpotBuy } from '@/hooks/useSpotBuy';

interface Asset {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  icon: string;
  isSpotAvailable?: boolean;
}

interface PurchaseModalProps {
  asset: Asset;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (amount: number, result?: { amountCrypto: number }) => void;
  balance: number;
}

const presetAmountsUsd = [25, 50, 100, 250, 500];
const presetQuantities = [1, 2, 5, 10, 20]; // For quantity mode (PURR etc)

// Assets that require whole number quantities
const WHOLE_NUMBER_ASSETS = ['PURR'];

const formatPrice = (price: number) => {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  if (price >= 0.01) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
};

export const PurchaseModal = ({ 
  asset, 
  isOpen, 
  onClose, 
  onConfirm,
  balance 
}: PurchaseModalProps) => {
  const navigate = useNavigate();
  const [amount, setAmount] = useState<string>('50');
  const [isSuccess, setIsSuccess] = useState(false);
  const [purchasedAmount, setPurchasedAmount] = useState<number>(0);

  const { buy, buyQuantity, isProcessing, error, reset } = useSpotBuy();

  // Use quantity mode for assets that require whole numbers (like PURR)
  const useQuantityMode = WHOLE_NUMBER_ASSETS.includes(asset.symbol);
  const numAmount = parseFloat(amount) || 0;

  // In quantity mode, numAmount is the number of tokens; in USD mode, it's USD
  const estimatedQty = useQuantityMode ? numAmount : numAmount / asset.price;
  const estimatedCost = useQuantityMode ? numAmount * asset.price : numAmount;
  const insufficientFunds = estimatedCost > balance;
  const spotUnavailable = asset.isSpotAvailable === false;

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setIsSuccess(false);
      setAmount(useQuantityMode ? '1' : '50'); // Default to 1 for quantity mode
      setPurchasedAmount(0);
      reset();
    }
  }, [isOpen, reset, useQuantityMode]);

  const handleConfirm = async () => {
    if (insufficientFunds || numAmount <= 0 || isProcessing) return;

    // Use buyQuantity for quantity mode, buy for USD mode
    const result = useQuantityMode
      ? await buyQuantity(asset.symbol, numAmount)
      : await buy(asset.symbol, numAmount);

    if (result?.success) {
      setPurchasedAmount(result.amountCrypto || estimatedQty);
      setIsSuccess(true);

      setTimeout(() => {
        onConfirm(estimatedCost, { amountCrypto: result.amountCrypto || estimatedQty });
        onClose();
      }, 2000);
    }
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
          disabled={isProcessing}
        >
          <X className="w-5 h-5 text-muted-foreground" />
        </button>

        {isSuccess ? (
          <div className="py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4 animate-scale-in">
              <Check className="w-8 h-8 text-success" />
            </div>
            <h3 className="text-xl font-bold mb-2 text-foreground">Purchase Confirmed!</h3>
            <p className="text-muted-foreground">
              You bought {purchasedAmount.toFixed(6)} {asset.symbol}
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-xl">
                {asset.icon}
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">Buy {asset.symbol}</h3>
                <p className="text-sm text-muted-foreground">{asset.name}</p>
              </div>
            </div>

            {/* Spot unavailable warning */}
            {spotUnavailable && (
              <div className="mb-4 p-3 rounded-lg bg-warning/10 border border-warning/20 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                <div className="text-sm text-warning">
                  <p className="font-medium">Spot trading not available</p>
                  <p className="mt-1 text-muted-foreground">
                    {asset.symbol} is only available as a perpetual on Hyperliquid. Spot trading is currently limited to native HyperEVM tokens.
                  </p>
                </div>
              </div>
            )}

            {/* Error message */}
            {error && !spotUnavailable && (
              <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="text-sm text-destructive">
                  <p>
                    {error instanceof Error ? error.message : 'Purchase failed'}
                  </p>
                  {error instanceof Error &&
                    error.message.includes('Agent wallet not authorized') && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          navigate('/wallet');
                        }}
                        className="mt-2 underline underline-offset-4"
                      >
                        Go to Wallet to authorize
                      </button>
                    )}
                </div>
              </div>
            )}

            {/* Amount Input */}
            <div className="mb-4">
              <label className="text-sm text-muted-foreground mb-2 block">
                {useQuantityMode ? `Quantity (${asset.symbol})` : 'Amount (USD)'}
              </label>
              <div className="relative">
                {!useQuantityMode && (
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-muted-foreground">
                    $
                  </span>
                )}
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className={cn(
                    "w-full h-16 pr-4 text-3xl font-bold text-foreground bg-secondary rounded-xl border-2 border-transparent focus:border-primary focus:outline-none transition-colors",
                    useQuantityMode ? "pl-4" : "pl-10"
                  )}
                  placeholder="0"
                  disabled={isProcessing}
                  step={useQuantityMode ? "1" : "any"}
                  min={useQuantityMode ? "1" : "0"}
                />
                {useQuantityMode && (
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-lg font-medium text-muted-foreground">
                    {asset.symbol}
                  </span>
                )}
              </div>
            </div>

            {/* Preset Amounts */}
            <div className="flex gap-2 mb-6">
              {(useQuantityMode ? presetQuantities : presetAmountsUsd).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setAmount(preset.toString())}
                  disabled={isProcessing}
                  className={cn(
                    'flex-1 py-2 rounded-lg text-sm font-medium transition-all',
                    amount === preset.toString()
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-foreground hover:bg-secondary/80',
                    isProcessing && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {useQuantityMode ? preset : `$${preset}`}
                </button>
              ))}
            </div>

            {/* Summary */}
            <div className="space-y-3 mb-6 p-4 bg-secondary/50 rounded-xl">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Price</span>
                <span className="font-medium text-foreground">{formatPrice(asset.price)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {useQuantityMode ? 'Est. cost' : 'Est. quantity'}
                </span>
                <span className="font-medium text-foreground">
                  {useQuantityMode
                    ? formatPrice(estimatedCost)
                    : `~${estimatedQty.toFixed(6)} ${asset.symbol}`
                  }
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Slippage</span>
                <span className="font-medium text-foreground">1%</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-border">
                <span className="text-muted-foreground">Available USDC</span>
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
              disabled={spotUnavailable || insufficientFunds || numAmount <= 0 || isProcessing}
              className="w-full h-14 text-lg font-semibold rounded-xl gradient-primary hover:opacity-90 transition-opacity"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Processing...
                </>
              ) : spotUnavailable ? (
                'Spot Not Available'
              ) : insufficientFunds ? (
                'Insufficient USDC Balance'
              ) : (
                `Confirm Purchase`
              )}
            </Button>

            <p className="text-xs text-center text-muted-foreground mt-4">
              Trading on Hyperliquid • Instant execution
            </p>
          </>
        )}
      </div>
    </div>
  );
};