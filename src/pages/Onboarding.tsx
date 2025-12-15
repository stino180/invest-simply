import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Mail, Loader2, Shield, Zap, PiggyBank } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const features = [
  { icon: PiggyBank, title: 'Auto-Invest', desc: 'Set it and forget it DCA' },
  { icon: Zap, title: 'Instant', desc: 'No gas fees, instant execution' },
  { icon: Shield, title: 'Self-Custody', desc: 'You own your keys' },
];

export const Onboarding = () => {
  const navigate = useNavigate();
  const { login, verifyCode, isLoading } = useAuth();
  const [step, setStep] = useState<'welcome' | 'email' | 'verify'>('welcome');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@')) {
      setError('Please enter a valid email');
      return;
    }
    setError('');
    await login(email);
    setStep('verify');
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) {
      setError('Please enter the 6-digit code');
      return;
    }
    const success = await verifyCode(code);
    if (success) {
      navigate('/dashboard');
    } else {
      setError('Invalid code. Try 123456');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 -left-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-20 -right-32 w-96 h-96 rounded-full bg-success/10 blur-3xl" />
      </div>

      <div className="relative flex-1 flex flex-col p-6 safe-top safe-bottom">
        {step === 'welcome' && (
          <div className="flex-1 flex flex-col justify-between animate-fade-in">
            {/* Logo & Brand */}
            <div className="pt-8">
              <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center mb-6 shadow-glow">
                <span className="text-3xl font-bold text-primary-foreground">S</span>
              </div>
              <h1 className="text-4xl font-bold font-display mb-3">
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
                    <div className="font-semibold">{title}</div>
                    <div className="text-sm text-muted-foreground">{desc}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="space-y-4">
              <Button
                onClick={() => setStep('email')}
                className="w-full h-14 text-lg font-semibold rounded-xl gradient-primary hover:opacity-90 transition-opacity"
              >
                Get Started
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                By continuing, you agree to our Terms of Service and Privacy Policy
              </p>
            </div>
          </div>
        )}

        {step === 'email' && (
          <div className="flex-1 flex flex-col animate-fade-in">
            <button
              onClick={() => setStep('welcome')}
              className="text-sm text-muted-foreground mb-8"
            >
              ← Back
            </button>

            <div className="flex-1">
              <h2 className="text-3xl font-bold font-display mb-2">
                Enter your email
              </h2>
              <p className="text-muted-foreground mb-8">
                We'll send you a verification code
              </p>

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full h-14 pl-12 pr-4 bg-secondary rounded-xl border-2 border-transparent focus:border-primary focus:outline-none transition-colors text-lg"
                    autoFocus
                  />
                </div>
                
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button
                  type="submit"
                  disabled={isLoading || !email}
                  className="w-full h-14 text-lg font-semibold rounded-xl gradient-primary hover:opacity-90 transition-opacity"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>
              </form>
            </div>
          </div>
        )}

        {step === 'verify' && (
          <div className="flex-1 flex flex-col animate-fade-in">
            <button
              onClick={() => setStep('email')}
              className="text-sm text-muted-foreground mb-8"
            >
              ← Back
            </button>

            <div className="flex-1">
              <h2 className="text-3xl font-bold font-display mb-2">
                Check your email
              </h2>
              <p className="text-muted-foreground mb-8">
                Enter the 6-digit code sent to <span className="text-foreground">{email}</span>
              </p>

              <form onSubmit={handleVerifySubmit} className="space-y-4">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full h-16 text-center text-3xl font-mono tracking-[0.5em] bg-secondary rounded-xl border-2 border-transparent focus:border-primary focus:outline-none transition-colors"
                  autoFocus
                />
                
                {error && (
                  <p className="text-sm text-destructive text-center">{error}</p>
                )}

                <Button
                  type="submit"
                  disabled={isLoading || code.length !== 6}
                  className="w-full h-14 text-lg font-semibold rounded-xl gradient-primary hover:opacity-90 transition-opacity"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    'Verify & Continue'
                  )}
                </Button>

                <p className="text-sm text-center text-muted-foreground">
                  Didn't receive the code?{' '}
                  <button className="text-primary font-medium">Resend</button>
                </p>
                
                <p className="text-xs text-center text-muted-foreground bg-secondary/50 p-3 rounded-lg">
                  💡 Demo: Enter any 6 digits or use <span className="font-mono">123456</span>
                </p>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
