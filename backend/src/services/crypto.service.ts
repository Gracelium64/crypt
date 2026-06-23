import crypto from "node:crypto";
import { env } from "../config/env.js";

const MARKER_PREFIX = "[CRYPT:v1]";
const SRV_PREFIX = "[SRV:v1]";

const buildKey = () => {
  const keyMaterial = env.DEMO_ENCRYPTION_KEY;
  return crypto.createHash("sha256").update(keyMaterial).digest();
};

const key = buildKey();

const aesEncrypt = (plainText: string, prefix: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]).toString("base64");
  return `${prefix}${payload}`;
};

const aesDecrypt = (rawText: string, prefix: string): string => {
  if (!rawText.startsWith(prefix)) return rawText;
  const payload = Buffer.from(rawText.slice(prefix.length), "base64");
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const encryptedData = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encryptedData), decipher.final()]).toString("utf8");
};

// Client-side E2E marker — used for messages encrypted by the frontend
export const encryptText = (plainText: string): string => aesEncrypt(plainText, MARKER_PREFIX);
export const decryptMarkedText = (rawText: string): string => aesDecrypt(rawText, MARKER_PREFIX);
export const isMarkedCiphertext = (value: string) => value.startsWith(MARKER_PREFIX);

// Server-side at-rest marker — used for plain inbound/outbound message bodies and phone numbers
export const encryptTextAtRest = (plainText: string): string => aesEncrypt(plainText, SRV_PREFIX);
export const decryptSrvText = (rawText: string): string => aesDecrypt(rawText, SRV_PREFIX);
export const isSrvCiphertext = (value: string) => value.startsWith(SRV_PREFIX);
