-- Add column to store encrypted agent wallet private key per user
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS agent_wallet_private_key_encrypted TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.profiles.agent_wallet_private_key_encrypted IS 'Encrypted private key for user-specific agent wallet';