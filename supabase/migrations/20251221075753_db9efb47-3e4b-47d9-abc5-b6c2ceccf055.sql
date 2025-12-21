-- Add auto top-up threshold setting to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS low_balance_threshold numeric DEFAULT 100;