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

-- Enable RLS
ALTER TABLE public.wallet_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_balances ENABLE ROW LEVEL SECURITY;

-- RLS policies for wallet_holdings
CREATE POLICY "Users can view their own holdings"
ON public.wallet_holdings
FOR SELECT
USING (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can insert their own holdings"
ON public.wallet_holdings
FOR INSERT
WITH CHECK (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can update their own holdings"
ON public.wallet_holdings
FOR UPDATE
USING (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can delete their own holdings"
ON public.wallet_holdings
FOR DELETE
USING (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

-- RLS policies for wallet_balances
CREATE POLICY "Users can view their own balance"
ON public.wallet_balances
FOR SELECT
USING (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can insert their own balance"
ON public.wallet_balances
FOR INSERT
WITH CHECK (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can update their own balance"
ON public.wallet_balances
FOR UPDATE
USING (user_id IN (SELECT id FROM profiles WHERE profiles.user_id = auth.uid()));

-- Add triggers for updated_at
CREATE TRIGGER update_wallet_holdings_updated_at
BEFORE UPDATE ON public.wallet_holdings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_wallet_balances_updated_at
BEFORE UPDATE ON public.wallet_balances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();