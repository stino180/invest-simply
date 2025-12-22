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

const hexToRsv = (signature: string) => {
  const sig = signature.startsWith('0x') ? signature.slice(2) : signature;
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

  const networkMode = profile?.network_mode || 'mainnet';
  const isTestnet = networkMode === 'testnet';
  const hyperliquidApiUrl = isTestnet 
    ? 'https://api.hyperliquid-testnet.xyz/exchange'
    : 'https://api.hyperliquid.xyz/exchange';

  // Hyperliquid user-signed typed data uses this chainId (per their signing spec)
  const signatureChainId = 0x66eee;

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
    try {
      // Get the wallet provider
      const provider = await externalWallet.getEthereumProvider();
      const walletAddress = externalWallet.address;

      const nonce = Date.now();
      const hyperliquidChain = isTestnet ? 'Testnet' : 'Mainnet';

      // Build EIP-712 typed data
      const domain = {
        name: "HyperliquidSignTransaction",
        version: "1",
        chainId: signatureChainId,
        verifyingContract: "0x0000000000000000000000000000000000000000" as const,
      };

      const message = {
        hyperliquidChain,
        agentAddress,
        agentName: "DCA Bot",
        nonce: BigInt(nonce),
      };

      // Request signature from wallet
      const typedData = {
        domain,
        types: APPROVE_AGENT_TYPES,
        primaryType: "HyperliquidTransaction:ApproveAgent",
        message,
      };

      // Sign with the wallet
      const signatureHex = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [walletAddress, JSON.stringify(typedData)],
      });

      const signature = hexToRsv(signatureHex);

      // Submit to Hyperliquid
      const action = {
        type: "approveAgent",
        hyperliquidChain,
        agentAddress,
        agentName: "DCA Bot",
        nonce,
      };

      const response = await fetch(hyperliquidApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          signature,
          nonce,
        }),
      });

      const result = await response.json();

      if (result.status === 'err') {
        throw new Error(result.response || 'Failed to approve agent');
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
      if (error.message?.includes('User rejected')) {
        toast.error('Signature request was rejected');
      } else {
        toast.error(error.message || 'Failed to authorize agent wallet');
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
          <div className="text-xs text-muted-foreground">
            Agent address: <code className="bg-secondary px-1 rounded">{agentAddress.slice(0, 10)}...{agentAddress.slice(-8)}</code>
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
        )}
      </CardContent>
    </Card>
  );
};
