import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePrivyAuth } from '@/context/PrivyAuthContext';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = usePrivyAuth();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        navigate('/dashboard');
      } else {
        navigate('/onboarding');
      }
    }
  }, [isAuthenticated, isLoading, navigate]);

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
};

export default Index;
