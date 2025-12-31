-- Add restrictive policies for dca_executions
-- These records should only be created/modified by edge functions (service role)
-- Regular users should not be able to INSERT, UPDATE, or DELETE execution records

-- Deny direct user inserts (edge functions use service role which bypasses RLS)
CREATE POLICY "System only - no user inserts"
ON public.dca_executions
FOR INSERT
WITH CHECK (false);

-- Deny direct user updates
CREATE POLICY "System only - no user updates"
ON public.dca_executions
FOR UPDATE
USING (false);

-- Deny direct user deletes
CREATE POLICY "System only - no user deletes"
ON public.dca_executions
FOR DELETE
USING (false);