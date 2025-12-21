-- Add network preference column to profiles
ALTER TABLE public.profiles 
ADD COLUMN network_mode text NOT NULL DEFAULT 'mainnet' CHECK (network_mode IN ('mainnet', 'testnet'));