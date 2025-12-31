import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { profileId, updates } = await req.json();

    if (!profileId || !updates) {
      throw new Error('Missing profileId or updates');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Only allow specific fields to be updated
    const allowedFields = ['network_mode', 'low_balance_threshold'];
    const safeUpdates: Record<string, unknown> = {};
    
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        safeUpdates[field] = updates[field];
      }
    }

    if (Object.keys(safeUpdates).length === 0) {
      throw new Error('No valid fields to update');
    }

    console.log(`Updating profile ${profileId}:`, safeUpdates);

    const { data, error } = await supabase
      .from('profiles')
      .update(safeUpdates)
      .eq('id', profileId)
      .select()
      .single();

    if (error) {
      console.error('Profile update error:', error);
      throw error;
    }

    console.log('Profile updated successfully:', data);

    return new Response(JSON.stringify({ success: true, profile: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in update-profile:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ success: false, error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
