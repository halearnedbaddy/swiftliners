import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  requestOTP as apiRequestOTP,
  registerWithPhone,
  loginWithPhone,
  registerWithEmail,
  loginWithEmail,
  logout as apiLogout,
  getCurrentUser,
} from '@/services/supabaseAuth';

interface User {
  id: string;
  phone?: string;
  name: string;
  email?: string;
  role: 'buyer' | 'seller' | 'admin';
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (phone: string, otp: string) => Promise<{ success: boolean; error?: string }>;
  loginEmail: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (data: { phone: string; name: string; email?: string; role?: string; otp: string }) => Promise<{ success: boolean; error?: string }>;
  registerEmail: (data: { email: string; password: string; name: string; role?: string }) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  requestOTP: (phone: string, purpose: 'LOGIN' | 'REGISTRATION') => Promise<{ success: boolean; error?: string; otp?: string }>;
}

const SupabaseAuthContext = createContext<AuthContextType | null>(null);

export function SupabaseAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from localStorage on mount
  useEffect(() => {
    const storedUser = getCurrentUser();
    if (storedUser) {
      setUser(storedUser);
    }
    setIsLoading(false);
  }, []);

  const requestOTP = useCallback(async (phone: string, purpose: 'LOGIN' | 'REGISTRATION') => {
    const response = await apiRequestOTP(phone, purpose);
    return {
      success: response.success,
      error: response.error,
      otp: response.otp,
    };
  }, []);

  const login = useCallback(async (phone: string, otp: string) => {
    const response = await loginWithPhone(phone, otp);
    if (response.success && response.data?.user) {
      setUser(response.data.user as User);
      return { success: true };
    }
    return { success: false, error: response.error || 'Login failed' };
  }, []);

  const loginEmail = useCallback(async (email: string, password: string) => {
    const response = await loginWithEmail(email, password);
    if (response.success && response.data?.user) {
      setUser(response.data.user as User);
      return { success: true };
    }
    return { success: false, error: response.error || 'Login failed' };
  }, []);

  const register = useCallback(async (data: { phone: string; name: string; email?: string; role?: string; otp: string }) => {
    const response = await registerWithPhone(data);
    if (response.success && response.data?.user) {
      setUser(response.data.user as User);
      return { success: true };
    }
    return { success: false, error: response.error || 'Registration failed' };
  }, []);

  const registerEmail = useCallback(async (data: { email: string; password: string; name: string; role?: string }) => {
    const response = await registerWithEmail(data);
    if (response.success && response.data?.user) {
      setUser(response.data.user as User);
      return { success: true };
    }
    return { success: false, error: response.error || 'Registration failed' };
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return (
    <SupabaseAuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        loginEmail,
        register,
        registerEmail,
        logout,
        requestOTP,
      }}
    >
      {children}
    </SupabaseAuthContext.Provider>
  );
}

export function useSupabaseAuth() {
  const context = useContext(SupabaseAuthContext);
  if (!context) {
    throw new Error('useSupabaseAuth must be used within a SupabaseAuthProvider');
  }
  return context;
}
