import React, { createContext, useContext, useState, useCallback } from 'react';

interface User {
  id: string;
  email: string;
  name: string;
  walletAddress: string;
  createdAt: Date;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string) => Promise<void>;
  logout: () => void;
  verifyCode: (code: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const MOCK_USER: User = {
  id: 'user_123',
  email: 'demo@stackflow.app',
  name: 'Demo User',
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f8cB2a',
  createdAt: new Date(),
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('stackflow_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const login = useCallback(async (email: string) => {
    setIsLoading(true);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    setPendingEmail(email);
    setIsLoading(false);
  }, []);

  const verifyCode = useCallback(async (code: string): Promise<boolean> => {
    setIsLoading(true);
    // Simulate verification
    await new Promise(resolve => setTimeout(resolve, 800));
    
    if (code === '123456' || code.length === 6) {
      const newUser = { ...MOCK_USER, email: pendingEmail || MOCK_USER.email };
      setUser(newUser);
      localStorage.setItem('stackflow_user', JSON.stringify(newUser));
      setIsLoading(false);
      return true;
    }
    
    setIsLoading(false);
    return false;
  }, [pendingEmail]);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('stackflow_user');
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        verifyCode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
