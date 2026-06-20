import React, { useEffect, useMemo, useRef, useState } from "react";
import { AuthContext } from "./auth-context";
import { loginRequest, registerRequest, meRequest, logoutRequest } from "@/data";
import type { User } from "@/types";

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(
    () => localStorage.getItem("crypt:token") ?? null,
  );
  const [checkSession, setCheckSession] = useState(true);
  const passwordRef = useRef<string | null>(null);

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
        console.error("[Auth] session check failed:", err);
        localStorage.removeItem("crypt:token");
        setUser(null);
        setToken(null);
      } finally {
        setCheckSession(false);
      }
    };
    run();
  }, [checkSession, token]);

  const login = async (payload: { email: string; password: string }) => {
    const { token: t } = await loginRequest(payload);
    passwordRef.current = payload.password;
    localStorage.setItem("crypt:token", t);
    setToken(t);
    setCheckSession(true);
  };

  const register = async (payload: { email: string; password: string; displayName?: string }) => {
    const { token: t } = await registerRequest(payload);
    passwordRef.current = payload.password;
    localStorage.setItem("crypt:token", t);
    setToken(t);
    setCheckSession(true);
  };

  const consumePassword = (): string | null => {
    const p = passwordRef.current;
    passwordRef.current = null;
    return p;
  };

  const logout = async () => {
    const email = user?.email;
    await logoutRequest();
    localStorage.removeItem("crypt:token");
    if (email) {
      localStorage.removeItem(`crypt:priv:${email}`);
      localStorage.removeItem(`crypt:pub:${email}`);
    }
    setToken(null);
    setUser(null);
    setCheckSession(false);
  };

  const value = useMemo(
    () => ({ user, token, signedIn: Boolean(user), checkSession, login, register, logout, setCheckSession, consumePassword }),
    [user, token, checkSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
