import { apiBase } from "./constants";

export async function apiFetch(
  path: string,
  options: RequestInit = {},
  token?: string | null,
) {
  const url = path.startsWith("http")
    ? path
    : `${apiBase}/api${path.startsWith("/") ? path : "/" + path}`;

  const headers = new Headers((options.headers as HeadersInit) || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  options.headers = headers;

  return fetch(url, options);
}

export async function apiJson(
  path: string,
  options: RequestInit = {},
  token?: string | null,
) {
  const resp = await apiFetch(path, options, token);
  const j = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(j?.error || "request failed");
  return j;
}
