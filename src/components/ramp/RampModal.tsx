import { useState, useEffect } from 'react';
import { ExternalLink, ArrowDownLeft, ArrowUpRight, Smartphone, Monitor } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface RampModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'onramp' | 'offramp';
  walletAddress: string;
}

const paymentPlatforms = [
  { id: 'venmo', name: 'Venmo' },
  { id: 'revolut', name: 'Revolut' },
  { id: 'wise', name: 'Wise' },
  { id: 'cashapp', name: 'Cash App' },
];

const currencies = [
  { id: 'USD', name: 'USD' },
  { id: 'EUR', name: 'EUR' },
  { id: 'GBP', name: 'GBP' },
];

// Base chain for USDC
const CHAIN_ID = '8453';
// USDC on Base
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export const RampModal = ({ open, onOpenChange, mode, walletAddress }: RampModalProps) => {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [platform, setPlatform] = useState('venmo');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const isOnramp = mode === 'onramp';
  const title = isOnramp ? 'Add Funds' : 'Withdraw Funds';
  const description = isOnramp 
    ? 'Buy crypto with Venmo, Revolut, or other payment methods via ZKP2P'
    : 'Sell crypto to Venmo, Revolut, or other payment methods via ZKP2P';

  const buildZkp2pUrl = () => {
    const baseUrl = 'https://zkp2p.xyz/swap';
    const params = new URLSearchParams();
    
    // Required params
    params.set('referrer', 'Drip Buy');
    params.set('callbackUrl', window.location.origin + '/wallet');
    
    // Token destination - USDC on Base
    params.set('toToken', `${CHAIN_ID}:${USDC_ADDRESS}`);
    params.set('recipientAddress', walletAddress);
    
    // Optional params
    if (amount) {
      params.set('inputAmount', amount);
    }
    params.set('inputCurrency', currency);
    params.set('paymentPlatform', platform);
    
    return `${baseUrl}?${params.toString()}`;
  };

  const handleContinue = () => {
    const url = buildZkp2pUrl();
    window.open(url, '_blank');
    onOpenChange(false);
  };

  // Mobile view - show instructions
  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" />
              {title}
            </DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <div className="flex items-start gap-3">
                <Monitor className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-foreground mb-1">Desktop Required</p>
                  <p className="text-sm text-muted-foreground">
                    ZKP2P's on/off-ramp currently requires a desktop browser with the PeerAuth extension for secure payment verification.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <p className="font-medium text-sm">To add or withdraw funds:</p>
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <span className="font-mono text-primary">1.</span>
                  Open this app on a desktop browser
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-primary">2.</span>
                  Click "Add Funds" or "Withdraw"
                </li>
                <li className="flex gap-2">
                  <span className="font-mono text-primary">3.</span>
                  Complete the ZKP2P flow with your payment app
                </li>
              </ol>
            </div>

            {/* Wallet address for manual transfer */}
            <div className="p-3 rounded-lg bg-secondary/50 text-sm">
              <p className="text-muted-foreground mb-1">Or send USDC (Base) directly to:</p>
              <code className="text-xs font-mono break-all text-foreground">{walletAddress}</code>
            </div>
          </div>

          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full">
            Got it
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  // Desktop view - show the ramp form
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isOnramp ? (
              <ArrowDownLeft className="w-5 h-5 text-success" />
            ) : (
              <ArrowUpRight className="w-5 h-5 text-primary" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (optional)</Label>
            <div className="flex gap-2">
              <Input
                id="amount"
                type="number"
                placeholder="100"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1"
              />
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Payment Platform */}
          <div className="space-y-2">
            <Label>Payment Method</Label>
            <Select value={platform} onValueChange={setPlatform}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paymentPlatforms.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Wallet destination */}
          <div className="p-3 rounded-lg bg-secondary/50 text-sm">
            <p className="text-muted-foreground mb-1">
              {isOnramp ? 'Funds will be sent to:' : 'Funds will be withdrawn from:'}
            </p>
            <code className="text-xs font-mono break-all text-foreground">{walletAddress}</code>
          </div>

          {/* ZKP2P info */}
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm">
            <p className="text-foreground">
              Powered by <span className="font-semibold">ZKP2P</span> — a decentralized P2P ramp using zero-knowledge proofs for instant, trustless fiat ↔ crypto swaps.
            </p>
          </div>
        </div>

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Cancel
          </Button>
          <Button onClick={handleContinue} className="flex-1 gradient-primary">
            Continue to ZKP2P
            <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
