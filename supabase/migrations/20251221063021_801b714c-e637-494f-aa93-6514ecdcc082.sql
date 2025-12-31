-- Add flexible scheduling columns to dca_plans
ALTER TABLE public.dca_plans 
ADD COLUMN IF NOT EXISTS custom_days_interval INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS execution_time TIME DEFAULT '09:00:00',
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC',
ADD COLUMN IF NOT EXISTS specific_days TEXT[] DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.dca_plans.custom_days_interval IS 'For custom cadence: execute every X days';
COMMENT ON COLUMN public.dca_plans.execution_time IS 'Time of day to execute the DCA';
COMMENT ON COLUMN public.dca_plans.timezone IS 'User timezone for execution time';
COMMENT ON COLUMN public.dca_plans.specific_days IS 'Array of specific days (e.g., monday, tuesday) for calendar-based scheduling';