import { ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WalletTransaction } from '@/hooks/useWalletData';

interface TransactionListProps {
  transactions: WalletTransaction[];
  limit?: number;
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
};

const getTransactionIcon = (type: WalletTransaction['type']) => {
  switch (type) {
    case 'buy':
      return <RefreshCw className="w-4 h-4" />;
    case 'sell':
      return <RefreshCw className="w-4 h-4" />;
    case 'deposit':
      return <ArrowDownLeft className="w-4 h-4" />;
    case 'withdraw':
      return <ArrowUpRight className="w-4 h-4" />;
  }
};

const getTransactionColor = (type: WalletTransaction['type']) => {
  switch (type) {
    case 'buy':
      return 'bg-primary/20 text-primary';
    case 'sell':
      return 'bg-warning/20 text-warning';
    case 'deposit':
      return 'bg-success/20 text-success';
    case 'withdraw':
      return 'bg-destructive/20 text-destructive';
  }
};

const getTransactionLabel = (tx: WalletTransaction) => {
  switch (tx.type) {
    case 'buy':
      return `Bought ${tx.symbol || 'Asset'}`;
    case 'sell':
      return `Sold ${tx.symbol || 'Asset'}`;
    case 'deposit':
      return tx.symbol ? `Deposit ${tx.symbol}` : 'Deposit';
    case 'withdraw':
      return tx.symbol ? `Withdraw ${tx.symbol}` : 'Withdrawal';
  }
};

export const TransactionList = ({ transactions, limit }: TransactionListProps) => {
  const displayTransactions = limit ? transactions.slice(0, limit) : transactions;

  return (
    <div className="space-y-2">
      {displayTransactions.map((tx) => (
        <div
          key={tx.id}
          className="flex items-center justify-between p-4 rounded-xl bg-card"
        >
          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center',
              getTransactionColor(tx.type)
            )}>
              {getTransactionIcon(tx.type)}
            </div>
            <div>
              <div className="font-semibold text-foreground">{getTransactionLabel(tx)}</div>
              <div className="text-sm text-muted-foreground">
                {formatDate(tx.timestamp)}
              </div>
            </div>
          </div>
          
          <div className="text-right">
            <div className={cn(
              'font-semibold text-foreground',
              tx.type === 'deposit' && 'text-success',
              tx.type === 'withdraw' && 'text-destructive'
            )}>
              {tx.type === 'deposit' ? '+' : tx.type === 'withdraw' ? '-' : ''}
              ${tx.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {tx.amount && tx.symbol && (
              <div className="text-sm text-muted-foreground">
                {tx.amount.toFixed(6)} {tx.symbol}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
