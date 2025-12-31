-- Add unique constraint on wallet_transactions for upsert support
-- This allows sync-hyperliquid to upsert transactions without duplicating

-- First, deduplicate any existing records with the same user_id and hyperliquid_tx_hash
DELETE FROM public.wallet_transactions a
USING public.wallet_transactions b
WHERE a.id > b.id
  AND a.user_id = b.user_id
  AND a.hyperliquid_tx_hash = b.hyperliquid_tx_hash
  AND a.hyperliquid_tx_hash IS NOT NULL;

-- Add the unique constraint
ALTER TABLE public.wallet_transactions
ADD CONSTRAINT wallet_transactions_user_tx_hash_unique
UNIQUE (user_id, hyperliquid_tx_hash);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_tx_hash
ON public.wallet_transactions(hyperliquid_tx_hash)
WHERE hyperliquid_tx_hash IS NOT NULL;
