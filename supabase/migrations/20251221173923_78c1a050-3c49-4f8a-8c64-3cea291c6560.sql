-- Add agent wallet fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS agent_wallet_address TEXT,
ADD COLUMN IF NOT EXISTS agent_wallet_authorized_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS wallet_type TEXT DEFAULT 'privy';

-- Add comment for clarity
COMMENT ON COLUMN public.profiles.agent_wallet_address IS 'The agent wallet address authorized to trade on behalf of the user';
COMMENT ON COLUMN public.profiles.wallet_type IS 'Type of wallet: privy or external';