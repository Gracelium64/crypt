import { apiJson, apiFetch } from "../lib/api";

type LoginPayload = { email: string; password: string };
type RegisterPayload = {
  email: string;
  password: string;
  displayName?: string;
};

export const loginRequest = async (payload: LoginPayload) => {
  const j = await apiJson("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return j.data as { token: string };
};

export const registerRequest = async (payload: RegisterPayload) => {
  const j = await apiJson("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return j.data as { token: string };
};

export const meRequest = async (token: string) => {
  const resp = await apiFetch("/auth/me", {}, token);
  if (!resp.ok) throw new Error("me fetch failed");
  const j = await resp.json();
  return j.data as { email: string; displayName?: string; id?: string };
};

export const logoutRequest = async () => {
  // no-op placeholder (server has no logout endpoint)
  return;
};
