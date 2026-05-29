import crypto from "node:crypto";
import { env } from "../config/env.js";

const MARKER_PREFIX = "[CRYPT:v1]";

const buildKey = () => {
  const keyMaterial = env.DEMO_ENCRYPTION_KEY;
  return crypto.createHash("sha256").update(keyMaterial).digest();
};

const key = buildKey();

export const encryptText = (plainText: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, authTag, encrypted]).toString("base64");
  return `${MARKER_PREFIX}${payload}`;
};

export const decryptMarkedText = (rawText: string): string => {
  if (!rawText.startsWith(MARKER_PREFIX)) {
    return rawText;
  }

  const payload = Buffer.from(rawText.slice(MARKER_PREFIX.length), "base64");
  const iv = payload.subarray(0, 12);
  const authTag = payload.subarray(12, 28);
  const encryptedData = payload.subarray(28);

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
};

export const isMarkedCiphertext = (value: string) =>
  value.startsWith(MARKER_PREFIX);
