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
  const { profile, refreshProfile, login } = usePrivyAuth();
  const { wallets } = useWallets();
  const { connectWallet, unlinkWallet } = usePrivy();
  const [agentAddress, setAgentAddress] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [lastSigningAddress, setLastSigningAddress] = useState<string | null>(null);

  // Find embedded wallet (created by Privy for email users)
  const embeddedWallet = wallets.find((w) => w.walletClientType === 'privy');
  
  // Find external wallet (Rainbow, MetaMask, etc.)
  const externalWallet =
    wallets.find(
      (w) => w.walletClientType !== 'privy' &&
        !!profile?.wallet_address &&
        w.address?.toLowerCase() === profile.wallet_address.toLowerCase()
    ) ?? wallets.find((w) => w.walletClientType !== 'privy');
  
  // Use external wallet if available, otherwise fall back to embedded wallet
  const activeWallet = externalWallet || embeddedWallet;
  const isUsingEmbeddedWallet = !externalWallet && !!embeddedWallet;

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
    if (!profile?.id) {
      setAgentAddress(null);
      setIsAuthorized(false);
      onAuthorizationChange?.(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      // First get the agent address
      const { data: agentData, error: agentError } = await supabase.functions.invoke('agent-wallet', {
        body: { action: 'get-agent-address', profileId: profile.id },
      });

      if (agentError) throw agentError;
      setAgentAddress(agentData.agentAddress);

      // Then check authorization status
      const { data: authData, error: authError } = await supabase.functions.invoke('agent-wallet', {
        body: { action: 'check-authorization', profileId: profile.id },
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
      externalWallet?.disconnect?.();
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
    
    // Use whichever wallet is available (external preferred, embedded as fallback)
    const walletToUse = activeWallet;
    if (!walletToUse) {
      toast.error('No wallet available');
      return;
    }

    const isEmbedded = walletToUse.walletClientType === 'privy';

    setIsAuthorizing(true);
    setAuthError(null);
    try {
      // For embedded wallets, use Privy's switchChain method first
      const requiredChainId = signatureChainIdNum;
      const requiredChainName = isTestnet ? 'Arbitrum Sepolia' : 'Arbitrum One';

      // For embedded wallets, we skip chain switching entirely.
      // Privy embedded wallets sign with the chain specified in the EIP-712 domain,
      // regardless of what chain the wallet reports. The signature will be valid.
      if (isEmbedded) {
        console.log('Using embedded wallet - skipping chain switch, signing with domain chainId:', requiredChainId);
      }

      const provider = await walletToUse.getEthereumProvider();

      // Ask wallet for connected/active accounts (for debugging + safety)
      const connectedAccounts = (await provider.request({ method: 'eth_accounts' })) as string[];
      const requestedSigner = walletToUse.address || connectedAccounts?.[0];
      if (!requestedSigner) {
        throw new Error('No active wallet account found. Please unlock your wallet and try again.');
      }

      const requestedSignerLower = requestedSigner.toLowerCase();
      const connectedLower = (connectedAccounts || []).map((a) => a.toLowerCase());

      // For external wallets only, verify the provider is connected to the expected address
      if (!isEmbedded && walletToUse.address && !connectedLower.includes(walletToUse.address.toLowerCase())) {
        const list = connectedAccounts?.length
          ? connectedAccounts.map((a) => `${a.slice(0, 6)}...${a.slice(-4)}`).join(', ')
          : 'none';
        throw new Error(
          `Wallet session looks stale.\n\n` +
          `Privy thinks your external wallet is: ${walletToUse.address.slice(0, 6)}...${walletToUse.address.slice(-4)}\n` +
          `But the wallet provider is connected to: ${list}\n\n` +
          `Please disconnect/reconnect the wallet inside the app (Reset connection) and in your wallet app, then try again.`
        );
      }

      // For external wallets only, verify the wallet's active account matches the profile wallet
      const profileWalletLower = profile.wallet_address?.toLowerCase();
      if (!isEmbedded && profileWalletLower && requestedSignerLower !== profileWalletLower) {
        const shortExpected = `${profile.wallet_address?.slice(0, 6)}...${profile.wallet_address?.slice(-4)}`;
        const shortActual = `${requestedSigner.slice(0, 6)}...${requestedSigner.slice(-4)}`;
        throw new Error(
          `Wrong wallet account active!\n\n` +
          `Expected: ${shortExpected}\n` +
          `Active: ${shortActual}\n\n` +
          `Please switch to ${shortExpected} in your wallet (Rabby/MetaMask) and try again.`
        );
      }

      // For external wallets, handle chain switching via provider
      if (!isEmbedded) {
        let currentChainIdHex = (await provider.request({ method: 'eth_chainId' })) as string;
        let currentChainId = parseInt(currentChainIdHex, 16);

        if (Number.isFinite(currentChainId) && currentChainId !== requiredChainId) {
          toast.message(`Switching wallet to ${requiredChainName}...`);
          
          try {
            await provider.request({
              method: 'wallet_switchEthereumChain',
              params: [{ chainId: signatureChainIdHex }],
            });
          } catch (switchError: any) {
            if (switchError?.code === 4902 || switchError?.message?.includes('Unrecognized chain')) {
              try {
                await provider.request({
                  method: 'wallet_addEthereumChain',
                  params: [{
                    chainId: signatureChainIdHex,
                    chainName: requiredChainName,
                    rpcUrls: [isTestnet 
                      ? 'https://sepolia-rollup.arbitrum.io/rpc' 
                      : 'https://arb1.arbitrum.io/rpc'],
                    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                    blockExplorerUrls: [isTestnet 
                      ? 'https://sepolia.arbiscan.io' 
                      : 'https://arbiscan.io'],
                  }],
                });
                await provider.request({
                  method: 'wallet_switchEthereumChain',
                  params: [{ chainId: signatureChainIdHex }],
                });
              } catch (addError: any) {
                throw new Error(
                  `Failed to add ${requiredChainName} to wallet: ${addError?.message || 'Unknown error'}. Please add it manually.`
                );
              }
            } else if (switchError?.code === 4001 || switchError?.message?.includes('rejected')) {
              throw new Error(`Chain switch to ${requiredChainName} was rejected. Please approve the switch and try again.`);
            } else {
              throw new Error(
                `Failed to switch to ${requiredChainName}: ${switchError?.message || 'Unknown error'}. Try switching manually in your wallet.`
              );
            }
          }

          await new Promise(resolve => setTimeout(resolve, 500));

          currentChainIdHex = (await provider.request({ method: 'eth_chainId' })) as string;
          currentChainId = parseInt(currentChainIdHex, 16);
          
          if (currentChainId !== requiredChainId) {
            throw new Error(
              `Wallet is still on chain ${currentChainId} after switch attempt. Required: ${requiredChainId} (${requiredChainName}). Please switch manually and try again.`
            );
          }
          
          toast.success(`Switched to ${requiredChainName}`);
        }
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

      // Build full EIP-712 typed data including EIP712Domain type (required by some wallets)
      const typedData = {
        domain,
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          ...APPROVE_AGENT_TYPES,
        },
        primaryType: 'HyperliquidTransaction:ApproveAgent',
        message,
      };

      console.log('Signing EIP-712 typed data:', JSON.stringify(typedData, null, 2));

      let signatureHex: string;
      try {
        // Use original checksummed address (some providers are strict about casing)
        signatureHex = await provider.request({
          method: 'eth_signTypedData_v4',
          params: [
            requestedSigner,
            JSON.stringify(typedData, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
          ],
        }) as string;
      } catch (signError: any) {
        console.error('eth_signTypedData_v4 failed:', signError);
        
        // Provide more specific error messages
        if (signError?.message?.includes('rejected') || signError?.code === 4001) {
          throw new Error('Signature request was rejected. Please approve the signature in your wallet.');
        }
        if (signError?.message?.includes('User denied') || signError?.message?.includes('cancelled')) {
          throw new Error('You cancelled the signature request. Please try again and approve.');
        }
        
        // For embedded wallets, try to provide helpful context
        if (isEmbedded) {
          throw new Error(
            `Embedded wallet signing failed: ${signError?.message || 'Unknown error'}. ` +
            `This may be a temporary issue - please try again.`
          );
        }
        
        throw new Error(`Wallet signing failed: ${signError?.message || 'Unknown error'}`);
      }

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
           `Wallet signed with ${recoveredSignerLower.slice(0, 10)}...${recoveredSignerLower.slice(-8)} (not ${requestedSignerLower.slice(0, 10)}...${requestedSignerLower.slice(-8)}).`
         );
       }

       // For external wallets, if the signature comes from a different address than the profile wallet, stop here.
       // For embedded wallets, we trust Privy's signing.
       if (!isEmbedded && profile?.wallet_address && recoveredSignerLower !== profile.wallet_address.toLowerCase()) {
         throw new Error(
           `Wallet/provider mismatch: expected ${profile.wallet_address.slice(0, 10)}...${profile.wallet_address.slice(-8)} but signature came from ${recoveredSignerLower.slice(0, 10)}...${recoveredSignerLower.slice(-8)}. Disconnect/reset your wallet connection and try again.`
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
        walletAddress: walletToUse.address,
        walletType: walletToUse.walletClientType,
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

        // "Extra agent already used" means the agent is already authorized on Hyperliquid's side
        // Just register it in our database and continue
        if (errorMsg.toLowerCase().includes('extra agent already used')) {
          console.log('Agent already authorized on Hyperliquid, registering in database...');
          const { error: registerError } = await supabase.functions.invoke('agent-wallet', {
            body: { action: 'register-authorization', profileId: profile.id },
          });
          if (registerError) throw registerError;

          setIsAuthorized(true);
          onAuthorizationChange?.(true);
          toast.success('Agent wallet was already authorized! Automated trading is now enabled.');
          return;
        }

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

      const rawMessage =
        error?.message ||
        error?.cause?.message ||
        (typeof error === 'string' ? error : '') ||
        'Failed to authorize agent wallet';

      // Some environments throw this error outside the normal Hyperliquid response parsing.
      // Treat it as "already authorized" and just sync our DB.
      if (rawMessage.toLowerCase().includes('extra agent already used') && profile?.id) {
        const { error: registerError } = await supabase.functions.invoke('agent-wallet', {
          body: { action: 'register-authorization', profileId: profile.id },
        });
        if (!registerError) {
          setIsAuthorized(true);
          onAuthorizationChange?.(true);
          setAuthError(null);
          toast.success('Agent wallet was already authorized! Automated trading is now enabled.');
          return;
        }
      }

      // Privy/wallet connectors sometimes throw a generic "Unknown connector error" inside iframes
      // (browser wallet extensions like Rabby/MetaMask may be blocked). Provide a clear next step.
      const looksLikeConnectorIssue =
        rawMessage.toLowerCase().includes('unknown connector error') ||
        rawMessage.toLowerCase().includes('connector') ||
        rawMessage.toLowerCase().includes('ethereum') ||
        error?.name === 'SecurityError';

      const message = looksLikeConnectorIssue
        ? 'Wallet connector failed (often happens inside the preview iframe). Open the app in a new tab and try again, or use WalletConnect.'
        : rawMessage;

      setAuthError(message);

      if (rawMessage.includes('User rejected')) {
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

  if (!profile?.id) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Enable Automated Trading
          </CardTitle>
          <CardDescription>Log in to generate your agent wallet and authorize trading.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={login} className="w-full">Log in</Button>
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

  const hasWallet = !!activeWallet;
  const isWalletMismatch =
    !!profile?.wallet_address &&
    !!externalWallet?.address &&
    externalWallet.address.toLowerCase() !== profile.wallet_address.toLowerCase();

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
                Active wallet:{' '}
                <code className="bg-secondary px-1 rounded">
                  {activeWallet?.address ? `${activeWallet.address.slice(0, 10)}...${activeWallet.address.slice(-8)}` : '—'}
                </code>
                <span className="ml-2">
                  ({isUsingEmbeddedWallet ? 'embedded' : 'external'}, {isTestnet ? 'testnet' : 'mainnet'})
                </span>
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

        {!hasWallet ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              No wallet available. Please log in to create a wallet.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {isUsingEmbeddedWallet && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Using your app wallet. Make sure you've deposited funds to Hyperliquid using this wallet address.
                </AlertDescription>
              </Alert>
            )}
            
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

                     {authError.toLowerCase().includes('connector failed') ||
                     authError.toLowerCase().includes('unknown connector error') ||
                     authError.toLowerCase().includes('preview iframe') ? (
                       <Button
                         type="button"
                         size="sm"
                         variant="outline"
                         onClick={() => window.open(window.location.href, '_blank', 'noopener,noreferrer')}
                       >
                         Open in new tab
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
