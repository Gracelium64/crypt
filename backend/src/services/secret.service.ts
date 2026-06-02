import crypto from "crypto";
import { env } from "../config/env.js";

const ALGO = "aes-256-gcm";

if (!env.SE_CRETS_MASTER_KEY && !env.DEMO_ENCRYPTION_KEY) {
  // No-op: still allow startup; encryption will fail at runtime if used without key
}

export const encryptSecret = (plaintext: string) => {
  const key = Buffer.from(
    env.SE_CRETS_MASTER_KEY ?? env.DEMO_ENCRYPTION_KEY,
    "utf8",
  );
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(
    ALGO,
    crypto.createHash("sha256").update(key).digest(),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
};

export const decryptSecret = (blobB64: string) => {
  const key = Buffer.from(
    env.SE_CRETS_MASTER_KEY ?? env.DEMO_ENCRYPTION_KEY,
    "utf8",
  );
  const data = Buffer.from(blobB64, "base64");
  const iv = data.slice(0, 12);
  const tag = data.slice(12, 28);
  const encrypted = data.slice(28);
  const decipher = crypto.createDecipheriv(
    ALGO,
    crypto.createHash("sha256").update(key).digest(),
    iv,
  );
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
};
