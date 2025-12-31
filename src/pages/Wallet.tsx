import { useState } from 'react';
import { Copy, Check, Plus, ArrowUpRight, QrCode, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { TransactionList } from '@/components/transactions/TransactionList';
import { RampModal } from '@/components/ramp/RampModal';
import { AgentWalletAuth } from '@/components/wallet/AgentWalletAuth';
import { usePrivyAuth } from '@/context/PrivyAuthContext';
import { useWalletData } from '@/hooks/useWalletData';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const paymentMethods = [
  { id: 'venmo', name: 'Venmo', icon: '💜', connected: true },
  { id: 'zelle', name: 'Zelle', icon: '💵', connected: false },
  { id: 'usdc', name: 'USDC Transfer', icon: '💰', connected: true },
];

const Wallet = () => {
  const { walletAddress: userWallet, isAuthenticated } = usePrivyAuth();
  const { transactions, usdcBalance, isSyncing, syncWallet } = useWalletData();
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [rampMode, setRampMode] = useState<'onramp' | 'offramp' | null>(null);

  const walletAddress = userWallet || null;

  const handleCopy = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AppShell>
      <div className="p-4 safe-top space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold font-display text-foreground">Wallet</h1>
          <p className="text-sm text-muted-foreground">Manage your funds</p>
        </div>

        {/* Balance Card */}
        <div className="p-6 rounded-2xl gradient-card shadow-glow">
          <p className="text-sm text-muted-foreground mb-1">Available Balance</p>
          <h2 className="text-4xl font-bold font-display mb-4 text-foreground">
            ${usdcBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </h2>

          <div className="flex gap-3">
            <Button
              className="flex-1 h-12 rounded-xl gradient-primary"
              onClick={() => setRampMode('onramp')}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Funds
            </Button>
            <Button
              variant="secondary"
              className="flex-1 h-12 rounded-xl"
              onClick={() => setRampMode('offramp')}
            >
              <ArrowUpRight className="w-4 h-4 mr-2" />
              Withdraw
            </Button>
          </div>
        </div>

        {/* ZKP2P Ramp Modal */}
        <RampModal
          open={rampMode !== null}
          onOpenChange={(open) => !open && setRampMode(null)}
          mode={rampMode || 'onramp'}
          walletAddress={walletAddress ?? ''}
        />

        {/* Wallet Address */}
        <div className="p-4 rounded-xl bg-card">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground">Your Wallet</h3>
            <button
              onClick={() => setShowQR(!showQR)}
              disabled={!walletAddress}
              className="p-2 rounded-lg hover:bg-secondary transition-colors disabled:opacity-50 disabled:pointer-events-none"
              aria-disabled={!walletAddress}
            >
              <QrCode className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>

          {showQR && walletAddress && (
            <div className="mb-4 p-4 bg-white rounded-xl flex items-center justify-center">
              {/* Placeholder QR */}
              <div className="w-32 h-32 bg-[repeating-conic-gradient(#000_0deg_90deg,#fff_90deg_180deg)_0_0/25%_25%] rounded-lg" />
            </div>
          )}

          <div className="flex items-center gap-2">
            <code className="flex-1 p-3 bg-secondary rounded-lg text-sm font-mono truncate text-foreground">
              {walletAddress ?? (isAuthenticated ? 'Loading wallet…' : 'Connect a wallet to view your address')}
            </code>
            <button
              onClick={handleCopy}
              disabled={!walletAddress}
              className={cn(
                'p-3 rounded-lg transition-all',
                copied ? 'bg-success/20 text-success' : 'bg-secondary hover:bg-secondary/80',
                !walletAddress && 'opacity-50 pointer-events-none'
              )}
              aria-disabled={!walletAddress}
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Send USDC (Arbitrum) to deposit funds</p>
        </div>

        {/* Agent Wallet Authorization */}
        <AgentWalletAuth />

        {/* Payment Methods */}
        <div>
          <h3 className="font-semibold mb-3 text-foreground">Payment Methods</h3>
          <div className="space-y-2">
            {paymentMethods.map((method) => (
              <div key={method.id} className="flex items-center justify-between p-4 rounded-xl bg-card">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg">
                    {method.icon}
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">{method.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {method.connected ? 'Connected' : 'Not connected'}
                    </div>
                  </div>
                </div>
                <Button
                  variant={method.connected ? 'ghost' : 'secondary'}
                  size="sm"
                  className="rounded-lg"
                >
                  {method.connected ? 'Manage' : 'Connect'}
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction History */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-foreground">Recent Transactions</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={syncWallet}
              disabled={isSyncing}
              className="h-8 px-2"
            >
              <RefreshCw className={cn('w-4 h-4', isSyncing && 'animate-spin')} />
            </Button>
          </div>
          {transactions.length > 0 ? (
            <TransactionList transactions={transactions} limit={10} />
          ) : (
            <div className="p-8 text-center text-muted-foreground rounded-xl bg-card">
              <p>No transactions yet</p>
              <p className="text-sm mt-1">Your transaction history will appear here after syncing</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
};

export default Wallet;
