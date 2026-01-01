-- Combined migrations for invest-simply
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/dtbkglvoqssyhfaklwfj/sql

-- Create user profiles table with wallet addresses
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  privy_did TEXT UNIQUE,
  wallet_address TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create DCA plans table
CREATE TABLE public.dca_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset TEXT NOT NULL,
  amount_usd DECIMAL(12,2) NOT NULL CHECK (amount_usd > 0),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'biweekly', 'monthly')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  next_execution_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create DCA executions log
CREATE TABLE public.dca_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.dca_plans(id) ON DELETE CASCADE,
  amount_usd DECIMAL(12,2) NOT NULL,
  amount_crypto DECIMAL(18,8),
  price_at_execution DECIMAL(18,2),
  status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
  hyperliquid_order_id TEXT,
  error_message TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create table for cached wallet holdings
CREATE TABLE public.wallet_holdings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  asset TEXT NOT NULL,
  symbol TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  current_price NUMERIC,
  value_usd NUMERIC,
  last_synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, asset)
);

-- Create table for wallet balance (USDC)
CREATE TABLE public.wallet_balances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  usdc_balance NUMERIC NOT NULL DEFAULT 0,
  total_value_usd NUMERIC NOT NULL DEFAULT 0,
  last_synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create a table for wallet transactions from Hyperliquid
CREATE TABLE public.wallet_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  asset TEXT,
  symbol TEXT,
  amount NUMERIC,
  price NUMERIC,
  total NUMERIC NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed',
  hyperliquid_tx_hash TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add all additional columns to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS low_balance_threshold numeric DEFAULT 100,
ADD COLUMN IF NOT EXISTS network_mode text NOT NULL DEFAULT 'mainnet' CHECK (network_mode IN ('mainnet', 'testnet')),
ADD COLUMN IF NOT EXISTS agent_wallet_address TEXT,
ADD COLUMN IF NOT EXISTS agent_wallet_authorized_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS wallet_type TEXT DEFAULT 'privy',
ADD COLUMN IF NOT EXISTS agent_wallet_private_key_encrypted TEXT;

-- Add additional columns to dca_plans
ALTER TABLE public.dca_plans
ADD COLUMN IF NOT EXISTS custom_days_interval INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS execution_time TIME DEFAULT '09:00:00',
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC',
ADD COLUMN IF NOT EXISTS specific_days TEXT[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS slippage numeric NOT NULL DEFAULT 0.5;

-- Add unique constraint on wallet_transactions for upsert support
ALTER TABLE public.wallet_transactions
ADD CONSTRAINT wallet_transactions_user_tx_hash_unique
UNIQUE (user_id, hyperliquid_tx_hash);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dca_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dca_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dca_plans_updated_at
  BEFORE UPDATE ON public.dca_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wallet_holdings_updated_at
  BEFORE UPDATE ON public.wallet_holdings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wallet_balances_updated_at
  BEFORE UPDATE ON public.wallet_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wallet_transactions_updated_at
  BEFORE UPDATE ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_timestamp ON public.wallet_transactions(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_tx_hash ON public.wallet_transactions(hyperliquid_tx_hash) WHERE hyperliquid_tx_hash IS NOT NULL;

-- Profiles policies
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own profile" ON public.profiles FOR DELETE USING (auth.uid() = user_id);

-- DCA plans policies
CREATE POLICY "Users can view their own DCA plans" ON public.dca_plans FOR SELECT USING (user_id IN (SELECT id FROM public.profiles WHERE profiles.user_id = auth.uid()));
CREATE POLICY "Users can create DCA plans" ON public.dca_plans FOR INSERT WITH CHECK (user_id IN (SELECT id FROM public.profiles WHERE profiles.user_id = auth.uid()));
CREATE POLICY "Users can update their own DCA plans" ON public.dca_plans FOR UPDATE USING (user_id IN (SELECT id FROM public.profiles WHERE profiles.user_id = auth.uid()));
CREATE POLICY "Users can delete their own DCA plans" ON public.dca_plans FOR DELETE USING (user_id IN (SELECT id FROM public.profiles WHERE profiles.user_id = auth.uid()));

-- DCA executions policies (read-only for users, system-only for writes)
CREATE POLICY "Users can view their own executions" ON public.dca_executions FOR SELECT USING (plan_id IN (SELECT dp.id FROM public.dca_plans dp JOIN public.profiles p ON dp.user_id = p.id WHERE p.user_id = auth.uid()));
CREATE POLICY "System only - no user inserts" ON public.dca_executions FOR INSERT WITH CHECK (false);
CREATE POLICY "System only - no user updates" ON public.dca_executions FOR UPDATE USING (false);
CREATE POLICY "System only - no user deletes" ON public.dca_executions FOR DELETE USING (false);

-- Wallet holdings policies
CREATE POLICY "Users can view their own holdings" ON public.wallet_holdings FOR SELECT USING (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));
CREATE POLICY "Users can insert their own holdings" ON public.wallet_holdings FOR INSERT WITH CHECK (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));
CREATE POLICY "Users can update their own holdings" ON public.wallet_holdings FOR UPDATE USING (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));
CREATE POLICY "Users can delete their own holdings" ON public.wallet_holdings FOR DELETE USING (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

-- Wallet balances policies
CREATE POLICY "Users can view their own balance" ON public.wallet_balances FOR SELECT USING (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));
CREATE POLICY "Users can insert their own balance" ON public.wallet_balances FOR INSERT WITH CHECK (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));
CREATE POLICY "Users can update their own balance" ON public.wallet_balances FOR UPDATE USING (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

-- Wallet transactions policies
CREATE POLICY "Users can view their own transactions" ON public.wallet_transactions FOR SELECT USING (user_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));
CREATE POLICY "Users can insert their own transactions" ON public.wallet_transactions FOR INSERT WITH CHECK (user_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));
CREATE POLICY "Users can delete their own transactions" ON public.wallet_transactions FOR DELETE USING (user_id IN (SELECT profiles.id FROM profiles WHERE profiles.user_id = auth.uid()));
