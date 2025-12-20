import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v5.2.0/index.ts";

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

    // Get Privy credentials
    const privyAppId = Deno.env.get('PRIVY_APP_ID');
    const privyAppSecret = Deno.env.get('PRIVY_APP_SECRET');
    
    if (!privyAppId || !privyAppSecret) {
      console.error('Privy credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch the verification key from Privy
    const appConfigResponse = await fetch(`https://auth.privy.io/api/v1/apps/${privyAppId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'privy-app-id': privyAppId,
      },
    });

    if (!appConfigResponse.ok) {
      console.error('Failed to fetch Privy app config');
      return new Response(
        JSON.stringify({ error: 'Failed to fetch Privy configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const appConfig = await appConfigResponse.json();
    const verificationKey = appConfig.verification_key;

    if (!verificationKey) {
      console.error('No verification key in Privy app config');
      return new Response(
        JSON.stringify({ error: 'Missing verification key' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the JWT token using the public key
    try {
      const publicKey = await jose.importSPKI(verificationKey, 'ES256');
      const { payload } = await jose.jwtVerify(accessToken, publicKey, {
        issuer: 'privy.io',
        audience: privyAppId,
      });

      console.log('Privy token verified successfully, user:', payload.sub);

      // Verify the DID matches
      if (payload.sub !== privyUser.did) {
        console.error('Token subject does not match provided DID');
        return new Response(
          JSON.stringify({ error: 'Token mismatch' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (jwtError) {
      console.error('JWT verification failed:', jwtError);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase admin client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const user: PrivyUser = privyUser;
    const privyDid = user.did;
    // Sanitize DID for email format - remove colons and special chars
    const sanitizedDid = privyDid.replace(/[^a-zA-Z0-9]/g, '_');
    const email = user.email || `${sanitizedDid}@privy.local`;
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
