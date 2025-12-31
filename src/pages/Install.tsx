import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, Smartphone, Share, Plus, Check, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const Install = () => {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Detect iOS
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(iOS);

    // Listen for install prompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 -left-32 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-20 -right-32 w-96 h-96 rounded-full bg-success/10 blur-3xl" />
      </div>

      <div className="relative p-4 safe-top safe-bottom">
        {/* Header */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground mb-8"
        >
          <ArrowLeft className="w-5 h-5" />
          Back
        </button>

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-2xl gradient-primary flex items-center justify-center mx-auto mb-4 shadow-glow">
            <span className="text-4xl font-bold text-primary-foreground">S</span>
          </div>
          <h1 className="text-3xl font-bold font-display mb-2">
            Install StackFlow
          </h1>
          <p className="text-muted-foreground">
            Add to your home screen for the best experience
          </p>
        </div>

        {isInstalled ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-success" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Already Installed!</h2>
            <p className="text-muted-foreground mb-6">
              StackFlow is installed on your device
            </p>
            <Button
              onClick={() => navigate('/dashboard')}
              className="rounded-xl gradient-primary"
            >
              Open App
            </Button>
          </div>
        ) : (
          <>
            {/* Install Button (for supported browsers) */}
            {deferredPrompt && (
              <div className="mb-8">
                <Button
                  onClick={handleInstall}
                  className="w-full h-14 text-lg font-semibold rounded-xl gradient-primary hover:opacity-90 transition-opacity"
                >
                  <Download className="w-5 h-5 mr-2" />
                  Install Now
                </Button>
              </div>
            )}

            {/* Benefits */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              {[
                { icon: '⚡', label: 'Instant Access' },
                { icon: '📱', label: 'Home Screen' },
                { icon: '🔔', label: 'Notifications' },
              ].map((benefit) => (
                <div
                  key={benefit.label}
                  className="p-4 rounded-xl bg-card text-center"
                >
                  <div className="text-2xl mb-2">{benefit.icon}</div>
                  <div className="text-xs text-muted-foreground">{benefit.label}</div>
                </div>
              ))}
            </div>

            {/* iOS Instructions */}
            {isIOS && (
              <div className="mb-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-primary" />
                  Install on iPhone/iPad
                </h3>
                <div className="space-y-3">
                  <Step
                    number={1}
                    icon={<Share className="w-5 h-5" />}
                    title="Tap the Share button"
                    description="In Safari's bottom toolbar"
                  />
                  <Step
                    number={2}
                    icon={<Plus className="w-5 h-5" />}
                    title="Add to Home Screen"
                    description="Scroll down and tap 'Add to Home Screen'"
                  />
                  <Step
                    number={3}
                    icon={<Check className="w-5 h-5" />}
                    title="Tap Add"
                    description="Confirm by tapping 'Add' in the top right"
                  />
                </div>
              </div>
            )}

            {/* Android/Chrome Instructions */}
            {!isIOS && !deferredPrompt && (
              <div className="mb-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <Smartphone className="w-5 h-5 text-primary" />
                  Install on Android
                </h3>
                <div className="space-y-3">
                  <Step
                    number={1}
                    icon={<span className="text-lg">⋮</span>}
                    title="Open browser menu"
                    description="Tap the three dots in the top right"
                  />
                  <Step
                    number={2}
                    icon={<Download className="w-5 h-5" />}
                    title="Install app"
                    description="Tap 'Install app' or 'Add to Home screen'"
                  />
                  <Step
                    number={3}
                    icon={<Check className="w-5 h-5" />}
                    title="Confirm"
                    description="Tap 'Install' in the popup"
                  />
                </div>
              </div>
            )}

            {/* Desktop Instructions */}
            {!isIOS && (
              <div className="p-4 rounded-xl bg-secondary/50 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">On Desktop Chrome:</p>
                <p>Click the install icon (⊕) in the address bar, or use the browser menu → "Install StackFlow"</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

interface StepProps {
  number: number;
  icon: React.ReactNode;
  title: string;
  description: string;
}

const Step = ({ number, icon, title, description }: StepProps) => (
  <div className="flex items-start gap-4 p-4 rounded-xl bg-card">
    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-sm">
      {number}
    </div>
    <div className="flex-1">
      <div className="font-medium flex items-center gap-2">
        {icon}
        {title}
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  </div>
);

export default Install;
