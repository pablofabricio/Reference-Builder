import React, { createContext, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMe, getGetMeQueryKey, type User } from "@workspace/api-client-react";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("auth_token"));
  const queryClient = useQueryClient();

  // Only try to fetch user if we have a token
  const { data: user, isLoading: isQueryLoading } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
      staleTime: Infinity,
    }
  });

  // Handle case where we have a token but fetching user fails (e.g. expired)
  useEffect(() => {
    if (token && !isQueryLoading && !user) {
      // Could clear token here, but let's wait for actual 401 error handling in interceptor if we wanted to be robust
      // For now, if query fails and finishes loading, and we have no user, we might be unauthenticated
    }
  }, [token, isQueryLoading, user]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem("auth_token", newToken);
    setToken(newToken);
    queryClient.setQueryData(getGetMeQueryKey(), newUser);
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    setToken(null);
    queryClient.setQueryData(getGetMeQueryKey(), null);
    queryClient.clear();
    window.location.href = "/";
  };

  // We are loading if we have a token but no user data yet
  const isLoading = !!token && isQueryLoading;

  return (
    <AuthContext.Provider
      value={{
        user: user || null,
        isLoading,
        login,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
