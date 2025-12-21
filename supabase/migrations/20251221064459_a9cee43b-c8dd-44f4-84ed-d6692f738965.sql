-- Add slippage column to dca_plans table
ALTER TABLE public.dca_plans 
ADD COLUMN slippage numeric NOT NULL DEFAULT 0.5;