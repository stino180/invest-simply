import { useState, useEffect } from 'react';
import { Shield, Check, AlertCircle, Loader2 } from 'lucide-react';
import { recoverTypedDataAddress, type Hex } from 'viem';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { usePrivyAuth } from '@/context/PrivyAuthContext';
import { usePrivy, useWallets } from '@privy-io/react-auth';
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
  const { profile, refreshProfile } = usePrivyAuth();
  const { wallets } = useWallets();
  const { connectWallet, unlinkWallet } = usePrivy();
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [lastSigningAddress, setLastSigningAddress] = useState<string | null>(null);

  // Prefer authorizing with the external wallet that matches the profile wallet (if present)
  const preferredExternalWallet =
    wallets.find(
      (w) => w.walletClientType !== 'privy' &&
        !!profile?.wallet_address &&
        w.address?.toLowerCase() === profile.wallet_address.toLowerCase()
    ) ?? wallets.find((w) => w.walletClientType !== 'privy');

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

  const handleDisconnectExternalWallet = async () => {
    try {
      preferredExternalWallet?.disconnect?.();
      await refreshProfile();
      toast.success('Wallet disconnected. Reconnect and try again.');
    } catch (e) {
      console.error('Error disconnecting wallet:', e);
      toast.error('Failed to disconnect wallet');
    }
  };

  const handleHardResetWalletConnection = async () => {
    try {
      // This clears the linked wallet session inside Privy (helps when WalletConnect gets "stuck" on a different account).
      const externalAddresses = wallets
        .filter((w) => w.walletClientType !== 'privy')
        .map((w) => w.address)
        .filter((a): a is string => !!a);

      for (const address of externalAddresses) {
        try {
          await unlinkWallet(address);
        } catch (e) {
          // Ignore if already unlinked / not unlinkable
          console.warn('unlinkWallet failed (ignored):', address, e);
        }
      }

      setLastSigningAddress(null);

      connectWallet({
        walletList: ['rainbow'],
        description: 'Reconnect Rainbow to refresh your WalletConnect session.',
      });

      await refreshProfile();
      toast.success('Wallet connection reset. Reconnect Rainbow and try again.');
    } catch (e) {
      console.error('Hard reset wallet connection failed:', e);
      toast.error('Failed to reset wallet connection');
    }
  };

  const handleAuthorize = async () => {
    if (!profile?.id || !agentAddress) return;
    
    // Get the connected external wallet (prefer the one matching the profile wallet)
    const externalWallet = preferredExternalWallet;
    if (!externalWallet) {
      toast.error('No external wallet connected');
      return;
    }

    setIsAuthorizing(true);
    setAuthError(null);
    try {
      const provider = await externalWallet.getEthereumProvider();

      // Ask wallet for the currently active account
      const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
      const requestedSigner = accounts?.[0];
      if (!requestedSigner) {
        throw new Error('No active wallet account found. Please unlock your wallet and try again.');
      }
      const requestedSignerLower = requestedSigner.toLowerCase();

      // Check current chain and switch if needed
      const currentChainIdHex = (await provider.request({ method: 'eth_chainId' })) as string;
      const currentChainId = parseInt(currentChainIdHex, 16);
      const requiredChainId = signatureChainIdNum;
      const requiredChainIdHex = `0x${requiredChainId.toString(16)}`;

      if (currentChainId !== requiredChainId) {
        const chainName = isTestnet ? 'Arbitrum Sepolia (Testnet)' : 'Arbitrum One';
        toast.info(`Switching to ${chainName}...`);

        try {
          await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: requiredChainIdHex }],
          });
        } catch (switchError: any) {
          // Error code 4902 means the chain hasn't been added to the wallet
          if (switchError?.code === 4902) {
            const chainConfig = isTestnet
              ? {
                  chainId: requiredChainIdHex,
                  chainName: 'Arbitrum Sepolia',
                  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                  rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
                  blockExplorerUrls: ['https://sepolia.arbiscan.io'],
                }
              : {
                  chainId: requiredChainIdHex,
                  chainName: 'Arbitrum One',
                  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                  rpcUrls: ['https://arb1.arbitrum.io/rpc'],
                  blockExplorerUrls: ['https://arbiscan.io'],
                };

            await provider.request({
              method: 'wallet_addEthereumChain',
              params: [chainConfig],
            });
          } else {
            throw new Error(
              `Please switch your wallet to ${isTestnet ? 'Arbitrum Sepolia' : 'Arbitrum One'} and try again.`
            );
          }
        }

        // Verify switch was successful
        const newChainIdHex = (await provider.request({ method: 'eth_chainId' })) as string;
        const newChainId = parseInt(newChainIdHex, 16);
        if (newChainId !== requiredChainId) {
          throw new Error(
            `Chain switch failed. Please manually switch to ${isTestnet ? 'Arbitrum Sepolia' : 'Arbitrum One'} in your wallet.`
          );
        }
        toast.success(`Switched to ${isTestnet ? 'Arbitrum Sepolia' : 'Arbitrum One'}`);
      }

      const agentAddressLower = agentAddress.toLowerCase();
      const nonce = Date.now();
      const hyperliquidChain = isTestnet ? 'Testnet' : 'Mainnet';

      const domain = {
        name: 'HyperliquidSignTransaction',
        version: '1',
        chainId: signatureChainIdNum,
        verifyingContract: '0x0000000000000000000000000000000000000000' as const,
      };

      const message = {
        hyperliquidChain,
        agentAddress: agentAddressLower,
        agentName: 'DCA Bot',
        nonce,
      };

      const typedData = {
        domain,
        types: APPROVE_AGENT_TYPES,
        primaryType: 'HyperliquidTransaction:ApproveAgent',
        message,
      };

      const signatureHex = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [
          requestedSignerLower,
          JSON.stringify(typedData, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
        ],
      });

      // Source of truth: who actually signed
      const recoveredSignerLower = (await recoverTypedDataAddress({
        domain: typedData.domain,
        types: typedData.types as any,
        primaryType: typedData.primaryType as any,
        message: typedData.message as any,
        signature: signatureHex as Hex,
      })).toLowerCase();

      setLastSigningAddress(recoveredSignerLower);

      if (recoveredSignerLower !== requestedSignerLower) {
        toast.warning(
          `Wallet signed with ${recoveredSignerLower.slice(0, 10)}...${recoveredSignerLower.slice(-8)} (not ${requestedSignerLower.slice(0, 10)}...${requestedSignerLower.slice(-8)}). Continuing with the recovered address.`
        );
      }

      // Preflight: ensure the REAL signing address is funded on the selected network
      const fetchUserState = async (mode: 'mainnet' | 'testnet') => {
        const { data, error } = await supabase.functions.invoke('hyperliquid-userstate', {
          body: { address: recoveredSignerLower, networkMode: mode },
        });
        if (error) throw error;
        return { perpsState: data?.perpsState, spotState: data?.spotState };
      };

      const getSpotUsdValue = (state: { perpsState?: any; spotState?: any }): number => {
        const balances = state?.spotState?.balances;
        if (!Array.isArray(balances)) return 0;

        const usdcBalance = balances.find((b: any) => b?.coin === 'USDC');
        if (usdcBalance) {
          const total = Number(usdcBalance?.total ?? 0);
          if (total > 0) return total;
        }

        const hasNonZero = balances.some((b: any) => {
          const total = Number(b?.total ?? b?.amount ?? b?.balance ?? 0);
          return Number.isFinite(total) && total > 0;
        });
        return hasNonZero ? 1 : 0;
      };

      const currentMode: 'mainnet' | 'testnet' = isTestnet ? 'testnet' : 'mainnet';
      const otherMode: 'mainnet' | 'testnet' = isTestnet ? 'mainnet' : 'testnet';

      const userStateCurrent = await fetchUserState(currentMode);
      const marginValue = Number(userStateCurrent?.perpsState?.marginSummary?.accountValue ?? 0);
      const spotValue = getSpotUsdValue(userStateCurrent);

      if ((Number.isFinite(marginValue) && marginValue <= 0) && spotValue <= 0) {
        const userStateOther = await fetchUserState(otherMode);
        const otherMarginValue = Number(userStateOther?.perpsState?.marginSummary?.accountValue ?? 0);
        const otherSpotValue = getSpotUsdValue(userStateOther);

        if ((Number.isFinite(otherMarginValue) && otherMarginValue > 0) || otherSpotValue > 0) {
          throw new Error(
            `Your Hyperliquid funds appear to be on ${otherMode}, but the app is set to ${currentMode}. Switch the app network in Settings and try again.`
          );
        }

        throw new Error(
          `Hyperliquid shows no funds for this wallet on ${currentMode} (margin=${marginValue}, spot=${spotValue}). Make sure you deposited with ${recoveredSignerLower.slice(0, 10)}...${recoveredSignerLower.slice(-8)} on ${currentMode}.`
        );
      }

      const signature = splitSignature(signatureHex);
      const action = {
        type: 'approveAgent',
        hyperliquidChain,
        signatureChainId: signatureChainIdHex,
        agentAddress: agentAddressLower,
        agentName: 'DCA Bot',
        nonce,
      };

      console.log('Hyperliquid approveAgent debug:', {
        networkMode,
        hyperliquidApiUrl,
        profileWallet: profile?.wallet_address,
        externalWalletAddress: externalWallet.address,
        requestedSigner: requestedSignerLower,
        recoveredSigner: recoveredSignerLower,
        agentAddress: agentAddressLower,
        action,
        signature,
      });

      const response = await fetch(hyperliquidApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, nonce, signature }),
      });

      const responseText = await response.text();
      let result: any;
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(responseText || `HTTP ${response.status}`);
      }

      if (result.status === 'err') {
        const errorMsg = String(result.response || 'Failed to approve agent');
        const network = isTestnet ? 'testnet' : 'mainnet';

        const userMatch = errorMsg.match(/User:\s*(0x[a-fA-F0-9]{40})/);
        const hlUser = userMatch?.[1]?.toLowerCase();

        if (errorMsg.includes('Must deposit before performing actions')) {
          if (hlUser && hlUser !== recoveredSignerLower) {
            throw new Error(
              `Hyperliquid rejected the signature as coming from ${hlUser.slice(0, 10)}...${hlUser.slice(-8)} (but your wallet signed as ${recoveredSignerLower.slice(0, 10)}...${recoveredSignerLower.slice(-8)}). This indicates a wallet/provider mismatch. Reconnect Rainbow and try again. Full error: ${errorMsg}`
            );
          }

          throw new Error(
            `Hyperliquid says this wallet has no deposit on ${network} for agent authorization. Full error: ${errorMsg}`
          );
        }

        throw new Error(errorMsg);
      }

      const { error: registerError } = await supabase.functions.invoke('agent-wallet', {
        body: { action: 'register-authorization', profileId: profile.id },
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

  const hasExternalWallet = !!preferredExternalWallet;
  const isWalletMismatch =
    !!profile?.wallet_address &&
    !!preferredExternalWallet?.address &&
    preferredExternalWallet.address.toLowerCase() !== profile.wallet_address.toLowerCase();

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
          <div className="text-xs text-muted-foreground space-y-2">
            <div className="space-y-1">
              <div>
                Agent address:{' '}
                <code className="bg-secondary px-1 rounded">{agentAddress.slice(0, 10)}...{agentAddress.slice(-8)}</code>
              </div>
              <div>
                Profile wallet:{' '}
                <code className="bg-secondary px-1 rounded">
                  {profile?.wallet_address ? `${profile.wallet_address.slice(0, 10)}...${profile.wallet_address.slice(-8)}` : '—'}
                </code>
              </div>
              <div>
                Selected external wallet:{' '}
                <code className="bg-secondary px-1 rounded">
                  {preferredExternalWallet?.address ? `${preferredExternalWallet.address.slice(0, 10)}...${preferredExternalWallet.address.slice(-8)}` : '—'}
                </code>
                <span className="ml-2">({isTestnet ? 'testnet' : 'mainnet'})</span>
              </div>
            </div>

            <div className="space-y-1">
              <div>Connected external wallets:</div>
              <ul className="list-disc pl-4 space-y-0.5">
                {wallets
                  .filter((w) => w.walletClientType !== 'privy')
                  .map((w) => (
                    <li key={w.address}>
                      <code className="bg-secondary px-1 rounded">{w.address?.slice(0, 10)}...{w.address?.slice(-8)}</code>
                    </li>
                  ))}
              </ul>
            </div>
          </div>
        )}

        {!hasExternalWallet ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              No external wallet connected. Please connect a wallet like Rainbow to authorize.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {isWalletMismatch ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Your connected wallet doesn’t match the profile wallet. We’ll authorize using the wallet that actually signs the message.
                </AlertDescription>
              </Alert>
            ) : null}

            {lastSigningAddress && profile?.wallet_address && lastSigningAddress.toLowerCase() !== profile.wallet_address.toLowerCase() ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Last signing address was{' '}
                  <code className="bg-secondary px-1 rounded">
                    {lastSigningAddress.slice(0, 10)}...{lastSigningAddress.slice(-8)}
                  </code>
                  , which differs from the profile wallet.
                </AlertDescription>
              </Alert>
            ) : null}

            <Button onClick={handleAuthorize} disabled={isAuthorizing} className="w-full">
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

                  <div className="flex flex-wrap gap-2">
                    {authError.toLowerCase().includes('deposit funds') ? (
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
                    ) : null}

                    {authError.toLowerCase().includes('signature mismatch') ||
                    authError.toLowerCase().includes('provider mismatch') ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleDisconnectExternalWallet}
                        >
                          Disconnect wallet
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleHardResetWalletConnection}
                        >
                          Reset Rainbow connection
                        </Button>
                      </>
                    ) : null}
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
