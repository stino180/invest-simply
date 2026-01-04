import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as jose from "https://deno.land/x/jose@v5.2.0/index.ts";
import { generatePrivateKey, privateKeyToAccount } from "https://esm.sh/viem@2.21.0/accounts";

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

// Simple encryption for storing private keys (in production, use a proper encryption service)
function encryptPrivateKey(privateKey: string, salt: string): string {
  // Base64 encode with salt prefix for basic obfuscation
  // In production, you'd use proper encryption with a master key
  const combined = `${salt}:${privateKey}`;
  return btoa(combined);
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
    const isExternalWallet = walletAddress && !user.email; // External wallet users typically don't have email

    // Check if user exists in profiles by privy_did
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('*')
      .eq('privy_did', privyDid)
      .maybeSingle();

    if (existingProfile) {
      // Update wallet address if:
      // 1. Profile has no wallet address yet, OR
      // 2. Profile is for an email user (wallet_type = 'privy') and embedded wallet address changed
      if (walletAddress) {
        const isEmbeddedWalletUser = existingProfile.wallet_type === 'privy';
        
        if (!existingProfile.wallet_address) {
          console.log(`Setting initial wallet address for profile: ${walletAddress}`);
          await supabase
            .from('profiles')
            .update({ wallet_address: walletAddress })
            .eq('id', existingProfile.id);
          existingProfile.wallet_address = walletAddress;
        } else if (isEmbeddedWalletUser && existingProfile.wallet_address !== walletAddress) {
          // For embedded wallet users, update the wallet address (Privy controls this)
          console.log(`Updating embedded wallet address: ${existingProfile.wallet_address} -> ${walletAddress}`);
          await supabase
            .from('profiles')
            .update({ wallet_address: walletAddress })
            .eq('id', existingProfile.id);
          existingProfile.wallet_address = walletAddress;
        } else if (!isEmbeddedWalletUser && existingProfile.wallet_address !== walletAddress) {
          // For external wallet users, don't silently switch - require reconnection
          console.warn(
            `Connected wallet (${walletAddress}) differs from profile wallet (${existingProfile.wallet_address}). Not updating profile wallet automatically.`
          );
          // Invalidate agent authorization so we don't accidentally treat the wrong wallet as approved
          await supabase
            .from('profiles')
            .update({ agent_wallet_authorized_at: null })
            .eq('id', existingProfile.id);
        }
      }

      // Ensure agent wallet exists for email users with embedded wallets
      if (!existingProfile.agent_wallet_address && walletAddress) {
        const agentPrivateKey = generatePrivateKey();
        const agentAccount = privateKeyToAccount(agentPrivateKey);
        const newAgentAddress = agentAccount.address;
        const encryptedKey = encryptPrivateKey(agentPrivateKey, existingProfile.id);
        
        console.log(`Generating agent wallet for existing user: ${newAgentAddress}`);
        await supabase
          .from('profiles')
          .update({ 
            agent_wallet_address: newAgentAddress,
            agent_wallet_private_key_encrypted: encryptedKey
          })
          .eq('id', existingProfile.id);
        existingProfile.agent_wallet_address = newAgentAddress;
      }

      console.log('Existing user logged in:', existingProfile.id);
      return new Response(
        JSON.stringify({
          success: true,
          profile: existingProfile,
          isNewUser: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create new Supabase auth user, or fetch existing one if email already exists
    let authUserId: string;
    
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        privy_did: privyDid,
        wallet_address: walletAddress,
      },
    });

    if (authError) {
      // Check if the error is because the email already exists
      if (authError.message?.includes('already been registered') || authError.code === 'email_exists') {
        console.log('Auth user already exists, looking up by email:', email);
        
        // Look up the existing user by email
        const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
        
        if (listError) {
          console.error('Error listing users:', listError);
          return new Response(
            JSON.stringify({ error: 'Failed to lookup existing user' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        const existingAuthUser = usersData.users.find(u => u.email === email);
        
        if (!existingAuthUser) {
          console.error('Could not find existing auth user with email:', email);
          return new Response(
            JSON.stringify({ error: 'User state inconsistency' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        authUserId = existingAuthUser.id;
        console.log('Found existing auth user:', authUserId);
      } else {
        console.error('Error creating auth user:', authError);
        return new Response(
          JSON.stringify({ error: 'Failed to create user' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      authUserId = authData.user.id;
      console.log('Created new auth user:', authUserId);
    }

    // Generate agent wallet for external wallet users
    let agentWalletAddress: string | null = null;
    let agentWalletEncrypted: string | null = null;
    
    if (walletAddress) {
      // Generate a new agent wallet for this user
      const agentPrivateKey = generatePrivateKey();
      const agentAccount = privateKeyToAccount(agentPrivateKey);
      agentWalletAddress = agentAccount.address;
      
      // Encrypt the private key before storing
      agentWalletEncrypted = encryptPrivateKey(agentPrivateKey, authUserId);
      
      console.log(`Generated agent wallet ${agentWalletAddress} for new user with external wallet`);
    }

    // Create profile with agent wallet if applicable
    const { data: newProfile, error: profileError } = await supabase
      .from('profiles')
      .insert({
        user_id: authUserId,
        privy_did: privyDid,
        wallet_address: walletAddress,
        email: user.email,
        wallet_type: walletAddress ? 'external' : 'privy',
        agent_wallet_address: agentWalletAddress,
        agent_wallet_private_key_encrypted: agentWalletEncrypted,
        network_mode: 'mainnet', // Default to mainnet for new users
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

    console.log('New user created:', newProfile.id, agentWalletAddress ? `with agent wallet ${agentWalletAddress}` : '');
    return new Response(
      JSON.stringify({ 
        success: true, 
        profile: newProfile, 
        isNewUser: true,
        agentWalletGenerated: !!agentWalletAddress
      }),
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