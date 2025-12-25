import { useState, useEffect } from 'react';
import { Shield, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { usePrivyAuth } from '@/context/PrivyAuthContext';
import { useWallets } from '@privy-io/react-auth';
import { toast } from 'sonner';

interface AgentWalletAuthProps {
  onAuthorizationChange?: (isAuthorized: boolean) => void;
}

// EIP-712 types for Hyperliquid agent approval
const APPROVE_AGENT_TYPES = {
  "HyperliquidTransaction:ApproveAgent": [
    { name: "hyperliquidChain", type: "string" },
    { name: "agentAddress", type: "address" },
    { name: "agentName", type: "string" },
    { name: "nonce", type: "uint64" },
  ],
};

// Split signature hex into r, s, v components for Hyperliquid API
const splitSignature = (signatureHex: string): { r: string; s: string; v: number } => {
  const sig = signatureHex.startsWith('0x') ? signatureHex.slice(2) : signatureHex;
  if (sig.length !== 130) throw new Error('Invalid signature length');
  const r = `0x${sig.slice(0, 64)}`;
  const s = `0x${sig.slice(64, 128)}`;
  let v = parseInt(sig.slice(128, 130), 16);
  if (v < 27) v += 27;
  return { r, s, v };
};


export const AgentWalletAuth = ({ onAuthorizationChange }: AgentWalletAuthProps) => {
  const { profile } = usePrivyAuth();
  const { wallets } = useWallets();
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const networkMode = profile?.network_mode || 'mainnet';
  const isTestnet = networkMode === 'testnet';
  const hyperliquidApiUrl = isTestnet 
    ? 'https://api.hyperliquid-testnet.xyz/exchange'
    : 'https://api.hyperliquid.xyz/exchange';

  // Hyperliquid signature chain IDs
  // - For signing (EIP-712 domain) we use a NUMBER
  // - For the exchange API request body we must send the chain id in HEX string form (per docs)
  const signatureChainIdNum = isTestnet ? 421614 : 42161; // Arbitrum Sepolia / Arbitrum One
  const signatureChainIdHex = `0x${signatureChainIdNum.toString(16)}`;

  useEffect(() => {
    fetchAgentStatus();
  }, [profile?.id]);

  const fetchAgentStatus = async () => {
    if (!profile?.id) return;
    
    setIsLoading(true);
    try {
      // First get the agent address
      const { data: agentData, error: agentError } = await supabase.functions.invoke('agent-wallet', {
        body: { action: 'get-agent-address', profileId: profile.id }
      });

      if (agentError) throw agentError;
      setAgentAddress(agentData.agentAddress);

      // Then check authorization status
      const { data: authData, error: authError } = await supabase.functions.invoke('agent-wallet', {
        body: { action: 'check-authorization', profileId: profile.id }
      });

      if (authError) throw authError;
      setIsAuthorized(authData.isAuthorized);
      onAuthorizationChange?.(authData.isAuthorized);
    } catch (error) {
      console.error('Error fetching agent status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthorize = async () => {
    if (!profile?.id || !agentAddress) return;
    
    // Get the connected external wallet
    const externalWallet = wallets.find(w => w.walletClientType !== 'privy');
    if (!externalWallet) {
      toast.error('No external wallet connected');
      return;
    }

    setIsAuthorizing(true);
    setAuthError(null);
    try {
      // Get the wallet provider
      const provider = await externalWallet.getEthereumProvider();

      // Privy/connector “expected” address
      const expectedWalletAddress = externalWallet.address;
      const expectedWalletAddressLower = expectedWalletAddress.toLowerCase();
      const agentAddressLower = agentAddress.toLowerCase();

      // Note: EIP-712 signing doesn't require being on a specific chain - the chainId is in the domain

      // IMPORTANT: sign with the wallet’s currently selected account (not just what the connector reports)
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      const signerAddress = accounts?.[0];
      if (!signerAddress) {
        throw new Error('No active wallet account found. Please unlock your wallet and try again.');
      }
      const signerAddressLower = signerAddress.toLowerCase();

      if (signerAddressLower !== expectedWalletAddressLower) {
        throw new Error(
          `Wallet account mismatch. Your wallet is currently set to ${signerAddress.slice(0, 10)}...${signerAddress.slice(-8)} but the app expects ${expectedWalletAddress.slice(0, 10)}...${expectedWalletAddress.slice(-8)}. Switch accounts in your wallet and try again.`
        );
      }
      // Preflight (server-side): verify Hyperliquid account exists / has funds for the signing address
      try {
        const { data: preflightData, error: preflightError } = await supabase.functions.invoke(
          'hyperliquid-userstate',
          {
            body: {
              address: signerAddressLower,
              networkMode: isTestnet ? 'testnet' : 'mainnet',
            },
          }
        );

        if (preflightError) throw preflightError;

        const accountValue = Number(preflightData?.userState?.marginSummary?.accountValue ?? 0);
        console.log('Hyperliquid preflight userState:', {
          networkMode,
          signerAddress: signerAddressLower,
          accountValue,
          userState: preflightData?.userState,
        });

        // If Hyperliquid reports no account value, surface a very explicit message.
        if (Number.isFinite(accountValue) && accountValue <= 0) {
          const network = isTestnet ? 'testnet' : 'mainnet';
          throw new Error(
            `Hyperliquid says this wallet has no deposit on ${network} (accountValue=${accountValue}). Make sure you deposited on ${network} with ${signerAddress.slice(0, 10)}...${signerAddress.slice(-8)}.`
          );
        }
      } catch (e: any) {
        // If we get a clear preflight error, show it (better than the generic "Must deposit" later)
        if (e?.message) {
          throw e;
        }
      }

      const nonce = Date.now();
      const hyperliquidChain = isTestnet ? 'Testnet' : 'Mainnet';

      // Build EIP-712 typed data
      const domain = {
        name: "HyperliquidSignTransaction",
        version: "1",
        chainId: signatureChainIdNum,
        verifyingContract: "0x0000000000000000000000000000000000000000" as const,
      };

      const message = {
        hyperliquidChain,
        agentAddress: agentAddressLower,
        agentName: "DCA Bot",
        nonce,
      };

      // Request signature from wallet
      const typedData = {
        domain,
        types: APPROVE_AGENT_TYPES,
        primaryType: "HyperliquidTransaction:ApproveAgent",
        message,
      };

      // Sign with the wallet (use replacer to handle any BigInt values)
      const signatureHex = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [signerAddressLower, JSON.stringify(typedData, (_, v) => typeof v === 'bigint' ? v.toString() : v)],
      });

      // Split signature into r, s, v components (Hyperliquid API format)
      const signature = splitSignature(signatureHex);

      // Build the action with signatureChainId per Hyperliquid API spec
      const action = {
        type: "approveAgent",
        hyperliquidChain,
        signatureChainId: signatureChainIdHex,
        agentAddress: agentAddressLower,
        agentName: "DCA Bot",
        nonce,
      };

      console.log('Hyperliquid approveAgent debug:', {
        networkMode,
        hyperliquidApiUrl,
        expectedWalletAddress,
        expectedWalletAddressLower,
        signerAddress,
        signerAddressLower,
        agentAddress,
        agentAddressLower,
        action,
        nonce,
        signature,
      });

      const response = await fetch(hyperliquidApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          nonce,
          signature,
        }),
      });

      // Handle non-JSON error responses
      const responseText = await response.text();
      let result;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(responseText || `HTTP ${response.status}`);
      }

      if (result.status === 'err') {
        const errorMsg = result.response || 'Failed to approve agent';
        
        // Check for specific Hyperliquid errors
        if (errorMsg.includes('Must deposit before performing actions')) {
          const network = isTestnet ? 'testnet' : 'mainnet';
          throw new Error(`You must deposit funds to Hyperliquid ${network} before authorizing an agent. Visit the Hyperliquid app to deposit first.`);
        }
        
        throw new Error(errorMsg);
      }

      // Register authorization in our backend
      const { error: registerError } = await supabase.functions.invoke('agent-wallet', {
        body: { action: 'register-authorization', profileId: profile.id }
      });

      if (registerError) throw registerError;

      setIsAuthorized(true);
      onAuthorizationChange?.(true);
      toast.success('Agent wallet authorized! Automated trading is now enabled.');
    } catch (error: any) {
      console.error('Error authorizing agent:', error);
      const message = error?.message || 'Failed to authorize agent wallet';
      setAuthError(message);

      if (message.includes('User rejected')) {
        toast.error('Signature request was rejected');
      } else {
        toast.error(message);
      }
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleRevokeAuthorization = async () => {
    if (!profile?.id) return;
    
    setIsRevoking(true);
    try {
      // Note: Hyperliquid doesn't have a revoke API - we just remove from our DB
      // The user would need to revoke on Hyperliquid's UI if they want to fully remove
      const { error } = await supabase.functions.invoke('agent-wallet', {
        body: { action: 'revoke-authorization', profileId: profile.id }
      });

      if (error) throw error;

      setIsAuthorized(false);
      onAuthorizationChange?.(false);
      toast.success('Agent wallet authorization revoked');
    } catch (error) {
      console.error('Error revoking authorization:', error);
      toast.error('Failed to revoke authorization');
    } finally {
      setIsRevoking(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (isAuthorized) {
    return (
      <Card className="border-success/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Check className="w-5 h-5 text-success" />
            Agent Wallet Authorized
          </CardTitle>
          <CardDescription>
            Automated DCA trading is enabled for your wallet
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-xs text-muted-foreground mb-3">
            Agent: <code className="bg-secondary px-1 rounded">{agentAddress?.slice(0, 10)}...{agentAddress?.slice(-8)}</code>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRevokeAuthorization}
            disabled={isRevoking}
          >
            {isRevoking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Revoke Authorization
          </Button>
        </CardContent>
      </Card>
    );
  }

  const hasExternalWallet = wallets.some(w => w.walletClientType !== 'privy');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          Enable Automated Trading
        </CardTitle>
        <CardDescription>
          Authorize our agent wallet to execute DCA trades on your behalf
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            This creates a trading agent on Hyperliquid that can only trade for you. 
            Your funds remain in your control and you can revoke access anytime.
          </AlertDescription>
        </Alert>

        {agentAddress && (
          <div className="text-xs text-muted-foreground space-y-1">
            <div>
              Agent address:{' '}
              <code className="bg-secondary px-1 rounded">{agentAddress.slice(0, 10)}...{agentAddress.slice(-8)}</code>
            </div>
            {hasExternalWallet ? (
              <div>
                Signing wallet:{' '}
                <code className="bg-secondary px-1 rounded">
                  {wallets.find(w => w.walletClientType !== 'privy')?.address?.slice(0, 10)}...
                  {wallets.find(w => w.walletClientType !== 'privy')?.address?.slice(-8)}
                </code>
                <span className="ml-2">({isTestnet ? 'testnet' : 'mainnet'})</span>
              </div>
            ) : null}
          </div>
        )}

        {!hasExternalWallet ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              No external wallet connected. Please connect a wallet like MetaMask to authorize.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            <Button 
              onClick={handleAuthorize}
              disabled={isAuthorizing}
              className="w-full"
            >
              {isAuthorizing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Authorizing...
                </>
              ) : (
                'Authorize Agent Wallet'
              )}
            </Button>

            {authError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs space-y-2">
                  <div>{authError}</div>
                  {authError.toLowerCase().includes('deposit funds') ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const url = isTestnet
                            ? 'https://app.hyperliquid-testnet.xyz/'
                            : 'https://app.hyperliquid.xyz/';
                          window.open(url, '_blank', 'noopener,noreferrer');
                        }}
                      >
                        Open Hyperliquid
                      </Button>
                    </div>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
