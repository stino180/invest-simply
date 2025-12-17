import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PrivyUser {
  did: string;
  email?: string;
  wallet?: {
    address: string;
  };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { privyUser, accessToken } = await req.json();
    
    if (!privyUser || !accessToken) {
      console.error('Missing privyUser or accessToken');
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify Privy access token
    const privyAppId = Deno.env.get('PRIVY_APP_ID');
    const privyAppSecret = Deno.env.get('PRIVY_APP_SECRET');
    
    if (!privyAppId || !privyAppSecret) {
      console.error('Privy credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify token with Privy
    const verifyResponse = await fetch('https://auth.privy.io/api/v1/token/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'privy-app-id': privyAppId,
        'Authorization': `Basic ${btoa(`${privyAppId}:${privyAppSecret}`)}`,
      },
      body: JSON.stringify({ access_token: accessToken }),
    });

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      console.error('Privy verification failed:', errorText);
      return new Response(
        JSON.stringify({ error: 'Invalid Privy token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const verifyData = await verifyResponse.json();
    console.log('Privy verification successful:', verifyData.user_id);

    // Initialize Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const user: PrivyUser = privyUser;
    const privyDid = user.did;
    const email = user.email || `${privyDid}@privy.local`;
    const walletAddress = user.wallet?.address;

    // Check if user exists in profiles by privy_did
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('privy_did', privyDid)
      .maybeSingle();

    if (existingProfile) {
      // Update wallet address if changed
      if (walletAddress && existingProfile.wallet_address !== walletAddress) {
        await supabase
          .from('profiles')
          .update({ wallet_address: walletAddress })
          .eq('id', existingProfile.id);
      }

      console.log('Existing user logged in:', existingProfile.id);
      return new Response(
        JSON.stringify({ 
          success: true, 
          profile: { ...existingProfile, wallet_address: walletAddress || existingProfile.wallet_address },
          isNewUser: false 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create new Supabase auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        privy_did: privyDid,
        wallet_address: walletAddress,
      },
    });

    if (authError) {
      console.error('Error creating auth user:', authError);
      return new Response(
        JSON.stringify({ error: 'Failed to create user' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create profile
    const { data: newProfile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        user_id: authData.user.id,
        privy_did: privyDid,
        wallet_address: walletAddress,
        email: user.email,
      })
      .select()
      .single();

    if (profileError) {
      console.error('Error creating profile:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to create profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('New user created:', newProfile.id);
    return new Response(
      JSON.stringify({ success: true, profile: newProfile, isNewUser: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in privy-auth function:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
