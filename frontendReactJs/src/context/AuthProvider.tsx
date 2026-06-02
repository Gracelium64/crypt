import React, { useEffect, useMemo, useState } from "react";
import { AuthContext } from "./auth-context";
import {
  loginRequest,
  registerRequest,
  meRequest,
  logoutRequest,
} from "../data/auth";

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any | null>(null);
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("crypt:token") ?? null,
  );
  const [checkSession, setCheckSession] = useState(true);

  useEffect(() => {
    if (!checkSession) return;
    const run = async () => {
      const t = token ?? localStorage.getItem("crypt:token");
      if (!t) {
        setUser(null);
        setCheckSession(false);
        return;
      }
      try {
        const profile = await meRequest(t);
        setUser(profile);
        setToken(t);
      } catch (err) {
        localStorage.removeItem("crypt:token");
        setUser(null);
        setToken(null);
      } finally {
        setCheckSession(false);
      }
    };
    run();
  }, [checkSession]);

  const login = async (payload: { email: string; password: string }) => {
    const { token: t } = await loginRequest(payload);
    localStorage.setItem("crypt:token", t);
    setToken(t);
    setCheckSession(true);
  };

  const register = async (payload: {
    email: string;
    password: string;
    displayName?: string;
  }) => {
    const { token: t } = await registerRequest(payload);
    localStorage.setItem("crypt:token", t);
    setToken(t);
    setCheckSession(true);
  };

  const logout = async () => {
    await logoutRequest();
    localStorage.removeItem("crypt:token");
    setToken(null);
    setUser(null);
    setCheckSession(false);
  };

  const value = useMemo(
    () => ({
      user,
      token,
      signedIn: Boolean(user),
      login,
      register,
      logout,
      setCheckSession,
    }),
    [user, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
