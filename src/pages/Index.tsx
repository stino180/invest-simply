import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

const Index = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    } else {
      navigate('/onboarding');
    }
  }, [isAuthenticated, navigate]);

  // Loading state while redirecting
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center animate-pulse">
        <span className="text-3xl font-bold text-primary-foreground">S</span>
      </div>
    </div>
  );
};

export default Index;
