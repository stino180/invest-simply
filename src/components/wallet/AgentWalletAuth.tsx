import { useState, useEffect } from 'react';
import { Shield, ExternalLink, Check, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { usePrivyAuth } from '@/context/PrivyAuthContext';
import { toast } from 'sonner';

interface AgentWalletAuthProps {
  onAuthorizationChange?: (isAuthorized: boolean) => void;
}

export const AgentWalletAuth = ({ onAuthorizationChange }: AgentWalletAuthProps) => {
  const { profile } = usePrivyAuth();
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isConfirming, setIsConfirming] = useState(false);

  const networkMode = profile?.network_mode || 'mainnet';
  const hyperliquidUrl = networkMode === 'testnet' 
    ? 'https://app.hyperliquid-testnet.xyz/subaccounts'
    : 'https://app.hyperliquid.xyz/subaccounts';

  useEffect(() => {
    fetchAgentStatus();
  }, [profile?.id]);

  const fetchAgentStatus = async () => {
    if (!profile?.id) return;
    
    setIsLoading(true);
    try {
      // First get the agent address
      const { data: agentData, error: agentError } = await supabase.functions.invoke('agent-wallet', {
        body: { action: 'get-agent-address' }
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

  const handleConfirmAuthorization = async () => {
    if (!profile?.id) return;
    
    setIsConfirming(true);
    try {
      const { data, error } = await supabase.functions.invoke('agent-wallet', {
        body: { action: 'register-authorization', profileId: profile.id }
      });

      if (error) throw error;

      setIsAuthorized(true);
      onAuthorizationChange?.(true);
      toast.success('Agent wallet authorization confirmed!');
    } catch (error) {
      console.error('Error confirming authorization:', error);
      toast.error('Failed to confirm authorization');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleRevokeAuthorization = async () => {
    if (!profile?.id) return;
    
    setIsConfirming(true);
    try {
      const { data, error } = await supabase.functions.invoke('agent-wallet', {
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
      setIsConfirming(false);
    }
  };

  const copyAddress = () => {
    if (agentAddress) {
      navigator.clipboard.writeText(agentAddress);
      toast.success('Agent address copied!');
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
            disabled={isConfirming}
          >
            {isConfirming ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Revoke Authorization
          </Button>
        </CardContent>
      </Card>
    );
  }

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
            This creates a sub-account on Hyperliquid that can only trade for you. 
            Your funds remain in your control and you can revoke access anytime.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="text-sm font-medium">Steps to authorize:</div>
          
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-medium shrink-0">1</span>
              <div>
                <button 
                  onClick={copyAddress}
                  className="text-primary hover:underline cursor-pointer"
                >
                  Copy agent address
                </button>
                {agentAddress && (
                  <code className="block text-xs bg-secondary px-2 py-1 rounded mt-1 text-muted-foreground">
                    {agentAddress}
                  </code>
                )}
              </div>
            </div>
            
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-medium shrink-0">2</span>
              <div>
                <a 
                  href={hyperliquidUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Open Hyperliquid Sub-accounts
                  <ExternalLink className="w-3 h-3" />
                </a>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Connect your wallet and add the agent as an authorized trader
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-medium shrink-0">3</span>
              <span>Come back and confirm authorization below</span>
            </div>
          </div>
        </div>

        <Button 
          onClick={handleConfirmAuthorization}
          disabled={isConfirming}
          className="w-full"
        >
          {isConfirming ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          I've Authorized the Agent Wallet
        </Button>
      </CardContent>
    </Card>
  );
};
