import QRCode from "qrcode";
import { apiJson, apiFetch } from "../lib/api";
import { arrayBufferToBase64, fingerprintFromPubKey } from "../lib/crypto";

export const generateKeypair = async (localOwnerId: string) => {
  if (!localOwnerId) throw new Error("Enter local ID first");

  const kp = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveKey", "deriveBits"],
  );

  const pubRaw = await crypto.subtle.exportKey("raw", kp.publicKey);
  const pubB64 = arrayBufferToBase64(pubRaw);
  const privJwk = await crypto.subtle.exportKey("jwk", kp.privateKey);

  try {
    localStorage.setItem(`crypt:priv:${localOwnerId}`, JSON.stringify(privJwk));
    localStorage.setItem(`crypt:pub:${localOwnerId}`, pubB64);
  } catch { /* ignore */ }

  const fingerprint = await fingerprintFromPubKey(pubRaw);
  const qrDataUrl = await QRCode.toDataURL(`${localOwnerId}:${pubB64}`);

  return { pubB64, privJwk, fingerprint, qrDataUrl };
};

// PBKDF2-based private key encryption/decryption

async function deriveWrappingKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptPrivateKey(password: string, jwk: unknown): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveWrappingKey(password, salt);
  const plain = new TextEncoder().encode(JSON.stringify(jwk));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  const combined = new Uint8Array(16 + 12 + cipher.byteLength);
  combined.set(salt, 0);
  combined.set(iv, 16);
  combined.set(new Uint8Array(cipher), 28);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptPrivateKey(password: string, blob: string): Promise<unknown> {
  const combined = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const ciphertext = combined.slice(28);
  const key = await deriveWrappingKey(password, salt);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(new TextDecoder().decode(plain));
}

export const registerPublicKey = async (
  pubKeyB64: string,
  authToken?: string | null,
  privJwk?: unknown,
  password?: string | null,
) => {
  if (!pubKeyB64) throw new Error("public key missing");

  let encryptedBlob: string | undefined;
  if (privJwk && password) {
    encryptedBlob = await encryptPrivateKey(password, privJwk);
  }

  return apiJson(
    "/keys/register",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        publicKey: pubKeyB64,
        ...(encryptedBlob ? { privateKeyJwk: encryptedBlob } : {}),
      }),
    },
    authToken,
  );
};

export const fetchAndDecryptPrivateKey = async (
  authToken?: string | null,
  password?: string | null,
): Promise<unknown | null> => {
  if (!password) return null;
  try {
    const resp = await apiFetch("/keys/me/private", {}, authToken);
    if (!resp.ok) return null;
    const json = await resp.json();
    const blob: string | null = json?.data?.privateKeyJwk ?? null;
    if (!blob) return null;
    return await decryptPrivateKey(password, blob);
  } catch {
    return null;
  }
};

export const resolveKeypairDisplay = async (localOwnerId: string, pubB64: string) => {
  const raw = Uint8Array.from(atob(pubB64), (c) => c.charCodeAt(0)).buffer;
  const fingerprint = await fingerprintFromPubKey(raw);
  const qrDataUrl = await QRCode.toDataURL(`${localOwnerId}:${pubB64}`);
  return { fingerprint, qrDataUrl };
};

export default { generateKeypair, registerPublicKey, resolveKeypairDisplay };
