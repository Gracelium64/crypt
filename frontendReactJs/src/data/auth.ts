import { apiJson, apiFetch } from "@/lib/api";
import type { LoginPayload, RegisterPayload, User } from "@/types";
import { UserSchema, TokenResponseSchema } from "@/schemas";

const parseError = async (res: Response, fallback: string): Promise<string> => {
  try {
    const data = await res.json();
    return typeof data?.error === "string" ? data.error : fallback;
  } catch { /* non-fatal: resp.json() parse failure — return caller's fallback error string */ }
  return fallback;
};

export const loginRequest = async (payload: LoginPayload): Promise<{ token: string }> => {
  const j = await apiJson("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return TokenResponseSchema.parse(j.data);
};

export const registerRequest = async (payload: RegisterPayload): Promise<{ token: string }> => {
  const j = await apiJson("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return TokenResponseSchema.parse(j.data);
};

export const meRequest = async (token: string): Promise<User> => {
  const resp = await apiFetch("/auth/me", {}, token);
  if (!resp.ok) throw new Error(await parseError(resp, "Session expired"));
  const j = await resp.json();
  return UserSchema.parse(j.data);
};

export const logoutRequest = async (): Promise<void> => {
  // No server logout endpoint — token cleared client-side
};

export const verifyPasswordRequest = async (token: string, password: string): Promise<boolean> => {
  const resp = await apiFetch(
    "/auth/verify-password",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) },
    token,
  );
  return resp.ok;
};

export const nukeAccountRequest = async (token: string): Promise<void> => {
  const resp = await apiFetch("/auth/account", { method: "DELETE" }, token);
  if (!resp.ok) {
    const j = await resp.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error(typeof j?.error === "string" ? j.error : "Nuke failed");
  }
};
