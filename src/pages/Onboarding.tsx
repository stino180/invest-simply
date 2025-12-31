import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Shield, Zap, PiggyBank, Loader2 } from 'lucide-react';
import { usePrivyAuth } from '@/context/PrivyAuthContext';
import { Button } from '@/components/ui/button';

const features = [
  { icon: PiggyBank, title: 'Auto-Invest', desc: 'Set it and forget it DCA' },
  { icon: Zap, title: 'Instant', desc: 'No gas fees, instant execution' },
  { icon: Shield, title: 'Self-Custody', desc: 'You own your keys' },
];

export const Onboarding = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, login, walletAddress, refreshProfile } = usePrivyAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  // If wallet is connected but not authenticated, try to refresh the profile
  useEffect(() => {
    if (!isLoading && !isAuthenticated && walletAddress && !isRefreshing) {
      setIsRefreshing(true);
      refreshProfile().finally(() => setIsRefreshing(false));
    }
  }, [isLoading, isAuthenticated, walletAddress, refreshProfile, isRefreshing]);

  if (isLoading || isRefreshing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center animate-pulse">
            <span className="text-3xl font-bold text-primary-foreground">S</span>
          </div>
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 -left-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-20 -right-32 w-96 h-96 rounded-full bg-success/10 blur-3xl" />
      </div>

      <div className="relative flex-1 flex flex-col p-6 safe-top safe-bottom">
        <div className="flex-1 flex flex-col justify-between animate-fade-in">
          {/* Logo & Brand */}
          <div className="pt-8">
            <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-6 shadow-glow">
              <span className="text-3xl font-bold text-primary-foreground">S</span>
            </div>
            <h1 className="text-4xl font-bold font-display mb-3 text-foreground">
              Stack<span className="text-gradient">Flow</span>
            </h1>
            <p className="text-lg text-muted-foreground">
              The easiest way to invest in crypto. Auto-DCA into your favorite assets.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-4 my-12">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-center gap-4 p-4 rounded-xl glass">
                <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <div className="font-semibold text-foreground">{title}</div>
                  <div className="text-sm text-muted-foreground">{desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="space-y-4">
            <Button
              onClick={login}
              className="w-full h-14 text-lg font-semibold rounded-xl gradient-primary hover:opacity-90 transition-opacity"
            >
              Get Started
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              By continuing, you agree to our Terms of Service and Privacy Policy
            </p>
            
            {/* Wallet indicator for debugging */}
            {walletAddress && (
              <p className="text-xs text-center text-primary font-mono">
                Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
