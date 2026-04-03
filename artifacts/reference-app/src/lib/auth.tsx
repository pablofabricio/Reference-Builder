import React, { createContext, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetMeQueryKey, type User } from "@workspace/api-client-react";

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
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(!!token);
  const queryClient = useQueryClient();

  useEffect(() => {
    let isMounted = true;

    const loadMe = async () => {
      if (!token) {
        if (!isMounted) return;
        setUser(null);
        setIsLoading(false);
        queryClient.setQueryData(getGetMeQueryKey(), null);
        return;
      }

      if (isMounted) setIsLoading(true);

      try {
        const response = await fetch("/api/auth/me", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Unauthorized");
        }

        const payload = await response.json();
        const profile = (payload?.data ?? payload) as User;

        if (!isMounted) return;
        setUser(profile);
        queryClient.setQueryData(getGetMeQueryKey(), profile);
      } catch {
        if (!isMounted) return;
        localStorage.removeItem("auth_token");
        setToken(null);
        setUser(null);
        queryClient.setQueryData(getGetMeQueryKey(), null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadMe();

    return () => {
      isMounted = false;
    };
  }, [token, queryClient]);

  useEffect(() => {
    const handleUserProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Partial<User>>).detail;
      if (!detail) return;

      setUser((previous) => {
        if (!previous) return previous;
        const nextUser = { ...previous, ...detail } as User;
        queryClient.setQueryData(getGetMeQueryKey(), nextUser);
        return nextUser;
      });
    };

    window.addEventListener("user-profile-updated", handleUserProfileUpdated as EventListener);

    return () => {
      window.removeEventListener("user-profile-updated", handleUserProfileUpdated as EventListener);
    };
  }, [queryClient]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem("auth_token", newToken);
    setToken(newToken);
    setUser(newUser);
    setIsLoading(false);
    queryClient.setQueryData(getGetMeQueryKey(), newUser);
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    setToken(null);
    setUser(null);
    setIsLoading(false);
    queryClient.setQueryData(getGetMeQueryKey(), null);
    queryClient.clear();
    window.location.href = "/";
  };

  return (
    <AuthContext.Provider
      value={{
        user,
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
