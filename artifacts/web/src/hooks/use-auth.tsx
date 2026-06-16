import React, { createContext, useContext, useEffect, useState } from "react";
import { useGetMe, setAuthTokenGetter, UserProfile } from "@workspace/api-client-react";
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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    setAuthTokenGetter(() => {
      return localStorage.getItem("token");
    });
  }, []);

  const { data: user, isLoading, error } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
    }
  });

  useEffect(() => {
    if (error && token) {
      // Invalid token
      localStorage.removeItem("token");
      setToken(null);
      setLocation("/login");
    }
  }, [error, token, setLocation]);

  const login = (newToken: string) => {
    localStorage.setItem("token", newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem("token");
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
