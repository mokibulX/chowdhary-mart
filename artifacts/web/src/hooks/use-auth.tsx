import React, { createContext, useContext, useEffect, useState } from "react";
import { customFetch, useGetMe, getGetMeQueryKey, setAuthTokenGetter, UserProfile } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface AuthContextType {
  user: UserProfile | null;
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);
const TOKEN_KEY = "token";

function isNativeApp() {
  return Boolean((window as any).Capacitor?.isNativePlatform?.());
}

async function getStoredToken() {
  if (!isNativeApp()) return localStorage.getItem(TOKEN_KEY);
  try {
    const { Preferences } = await import("@capacitor/preferences");
    return (await Preferences.get({ key: TOKEN_KEY })).value;
  } catch {
    return localStorage.getItem(TOKEN_KEY);
  }
}

async function setStoredToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  if (!isNativeApp()) return;
  const { Preferences } = await import("@capacitor/preferences");
  await Preferences.set({ key: TOKEN_KEY, value: token });
}

async function clearStoredToken() {
  localStorage.removeItem(TOKEN_KEY);
  if (!isNativeApp()) return;
  const { Preferences } = await import("@capacitor/preferences");
  await Preferences.remove({ key: TOKEN_KEY });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem(TOKEN_KEY));
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    setAuthTokenGetter(() => getStoredToken());
    void getStoredToken().then((stored) => {
      if (stored) setToken(stored);
    });
  }, []);

  const { data: user, isLoading, error } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      enabled: !!token,
      retry: false,
    }
  });

  useEffect(() => {
    if (error && token) {
      // Invalid token
      void clearStoredToken();
      setToken(null);
      setLocation("/login");
    }
  }, [error, token, setLocation]);

  const login = (newToken: string) => {
    void setStoredToken(newToken);
    setToken(newToken);
  };

  const logout = () => {
    void customFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    void clearStoredToken();
    setToken(null);
    setLocation("/login");
    toast({
      title: "Logged out",
      description: "You have been logged out successfully.",
    });
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, token, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
