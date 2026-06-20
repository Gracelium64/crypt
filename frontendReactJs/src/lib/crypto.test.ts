import { describe, it, expect } from "vitest";
import {
  arrayBufferToBase64,
  encryptForRecipient,
  decryptFromSender,
} from "./crypto";
import { EcdhPrivateJwkSchema } from "../schemas";

describe("crypto E2E", () => {
  it("encrypts and decrypts between two keypairs", async () => {
    const sender = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey"],
    );
    const recipient = await crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey"],
    );

    const senderPubRaw = await crypto.subtle.exportKey("raw", sender.publicKey);
    const recipientPubRaw = await crypto.subtle.exportKey(
      "raw",
      recipient.publicKey,
    );

    const senderPubB64 = arrayBufferToBase64(senderPubRaw);
    const recipientPubB64 = arrayBufferToBase64(recipientPubRaw);

    const senderPrivJwk = EcdhPrivateJwkSchema.parse(
      await crypto.subtle.exportKey("jwk", sender.privateKey),
    );
    const recipientPrivJwk = EcdhPrivateJwkSchema.parse(
      await crypto.subtle.exportKey("jwk", recipient.privateKey),
    );

    const plain = "hello vitest";
    const secure = await encryptForRecipient(
      plain,
      senderPrivJwk,
      recipientPubB64,
    );
    const decrypted = await decryptFromSender(
      secure,
      recipientPrivJwk,
      senderPubB64,
    );

    expect(decrypted).toBe(plain);
  });
});
