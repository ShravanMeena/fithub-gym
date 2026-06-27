import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthAPI, TOKEN_KEY } from '../api/client';
import { registerForPush, unregisterPush } from '../notifications/push';

type User = {
  id: number;
  name: string;
  email: string;
  role?: string;
  ai_until?: string | null;
  ai_active?: boolean;
  org?: { id: number; slug: string; name: string; tagline?: string; primary_color?: string; logo_url?: string | null };
};

type AuthState = {
  user: User | null;
  loading: boolean;
  signup: (name: string, email: string, password: string, orgId?: number) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({} as AuthState);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session on launch.
  useEffect(() => {
    (async () => {
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      if (token) {
        try {
          const { user } = await AuthAPI.me();
          setUser(user);
          registerForPush(user.org?.id).catch(() => {});
        } catch {
          await AsyncStorage.removeItem(TOKEN_KEY);
        }
      }
      setLoading(false);
    })();
  }, []);

  const persist = async (data: { token: string; user: User }) => {
    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    setUser(data.user);
    registerForPush(data.user.org?.id).catch(() => {});
  };

  const signup = useCallback(async (name: string, email: string, password: string, orgId?: number) => {
    persist(await AuthAPI.signup(name, email, password, orgId));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    persist(await AuthAPI.login(email, password));
  }, []);

  const logout = useCallback(async () => {
    await unregisterPush().catch(() => {});
    await AsyncStorage.removeItem(TOKEN_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, signup, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
