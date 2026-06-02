import type { User } from "../types";
import { createContext } from "react";

type AuthContextType = {
  user: User | null;
  token: string | null;
  signedIn: boolean;
  login: (payload: { email: string; password: string }) => Promise<void>;
  register: (payload: {
    email: string;
    password: string;
    displayName?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  setCheckSession: (v: boolean) => void;
};

export const AuthContext = createContext<AuthContextType | null>(null);
