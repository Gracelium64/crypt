import QRCode from "qrcode";
import { apiJson } from "../lib/api";
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

  // persist keys locally
  try {
    localStorage.setItem(`crypt:priv:${localOwnerId}`, JSON.stringify(privJwk));
    localStorage.setItem(`crypt:pub:${localOwnerId}`, pubB64);
  } catch {
    // ignore localStorage failures
  }

  const fingerprint = await fingerprintFromPubKey(pubRaw);
  const qrDataUrl = await QRCode.toDataURL(`${localOwnerId}:${pubB64}`);

  return { pubB64, privJwk, fingerprint, qrDataUrl };
};

export const registerPublicKey = async (
  pubKeyB64: string,
  authToken?: string | null,
) => {
  if (!pubKeyB64) throw new Error("public key missing");

  return apiJson(
    "/keys/register",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publicKey: pubKeyB64 }),
    },
    authToken,
  );
};

export const resolveKeypairDisplay = async (localOwnerId: string, pubB64: string) => {
  const raw = Uint8Array.from(atob(pubB64), (c) => c.charCodeAt(0)).buffer;
  const fingerprint = await fingerprintFromPubKey(raw);
  const qrDataUrl = await QRCode.toDataURL(`${localOwnerId}:${pubB64}`);
  return { fingerprint, qrDataUrl };
};

export default { generateKeypair, registerPublicKey, resolveKeypairDisplay };
