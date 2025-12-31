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
  asset TEXT NOT NULL CHECK (asset IN ('BTC', 'ETH', 'SOL')),
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

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dca_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dca_executions ENABLE ROW LEVEL SECURITY;

-- Profiles policies (users can read/update their own profile)
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- DCA plans policies
CREATE POLICY "Users can view their own DCA plans"
  ON public.dca_plans FOR SELECT
  USING (user_id IN (SELECT id FROM public.profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can create DCA plans"
  ON public.dca_plans FOR INSERT
  WITH CHECK (user_id IN (SELECT id FROM public.profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can update their own DCA plans"
  ON public.dca_plans FOR UPDATE
  USING (user_id IN (SELECT id FROM public.profiles WHERE profiles.user_id = auth.uid()));

CREATE POLICY "Users can delete their own DCA plans"
  ON public.dca_plans FOR DELETE
  USING (user_id IN (SELECT id FROM public.profiles WHERE profiles.user_id = auth.uid()));

-- DCA executions policies (read-only for users)
CREATE POLICY "Users can view their own executions"
  ON public.dca_executions FOR SELECT
  USING (plan_id IN (
    SELECT dp.id FROM public.dca_plans dp
    JOIN public.profiles p ON dp.user_id = p.id
    WHERE p.user_id = auth.uid()
  ));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dca_plans_updated_at
  BEFORE UPDATE ON public.dca_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();