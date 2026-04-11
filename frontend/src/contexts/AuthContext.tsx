'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { AuthUser, signIn as apiSignIn, signOut as apiSignOut, setPassword as apiSetPassword, getMe, refresh } from '@/lib/auth-api';

export interface NewPasswordRequired {
  challenge: 'NEW_PASSWORD_REQUIRED';
  session: string;
}

interface AuthContextType {
  user:                AuthUser | null;
  isAuthenticated:     boolean;
  isLoading:           boolean;
  signIn:              (email: string, password: string) => Promise<NewPasswordRequired | void>;
  completeNewPassword: (email: string, newPassword: string, session: string) => Promise<void>;
  signOut:             () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<AuthUser | null>(null);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setUser(await getMe());
      } catch {
        try {
          await refresh();
          setUser(await getMe());
        } catch {
          // not authenticated
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await apiSignIn(email, password);
    if (result.challenge === 'NEW_PASSWORD_REQUIRED') {
      return { challenge: 'NEW_PASSWORD_REQUIRED' as const, session: result.session! };
    }
    setUser(await getMe());
  }, []);

  const completeNewPassword = useCallback(async (email: string, newPassword: string, session: string) => {
    await apiSetPassword(email, newPassword, session);
    setUser(await getMe());
  }, []);

  const signOut = useCallback(async () => {
    try { await apiSignOut(); } catch { /* ignore */ }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoading, signIn, completeNewPassword, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
