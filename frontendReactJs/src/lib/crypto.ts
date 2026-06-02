export const secureMarker = "[CRYPT:v1]";

export const isSecureCiphertext = (value: string) =>
  value.startsWith(secureMarker);

export const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const base64ToHex = (b64: string) => {
  const bin = atob(b64);
  const arr: string[] = [];
  for (let i = 0; i < bin.length; i++) {
    arr.push(bin.charCodeAt(i).toString(16).padStart(2, "0"));
  }
  return arr.join("");
};

export const fingerprintFromPubKey = async (pubRaw: ArrayBuffer) => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", pubRaw);
  const b64 = arrayBufferToBase64(hashBuffer);
  const hex = base64ToHex(b64).toUpperCase();
  return `${hex.slice(0, 4)} ${hex.slice(4, 8)} ${hex.slice(8, 12)}`;
};

export const base64ToArrayBuffer = (b64: string) => {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

export const importPublicKeyFromBase64 = async (b64: string) => {
  const ab = base64ToArrayBuffer(b64);
  return await crypto.subtle.importKey(
    "raw",
    ab,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
};

export const importPrivateJwkKey = async (jwk: any) =>
  crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    ["deriveKey", "deriveBits"],
  );

export const deriveAesGcmKey = async (privJwkObj: any, otherPubB64: string) => {
  const privKey = await importPrivateJwkKey(privJwkObj);
  const pubKey = await importPublicKeyFromBase64(otherPubB64);
  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: pubKey },
    privKey,
    256,
  );

  const hkdfKey = await crypto.subtle.importKey(
    "raw",
    sharedBits,
    "HKDF",
    false,
    ["deriveKey"],
  );

  const salt = new Uint8Array([]);
  const info = new TextEncoder().encode("crypt-companion v1");

  const aesKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  return aesKey;
};

export const encryptForRecipient = async (
  plaintext: string,
  privJwkObj: any,
  recipientPubB64: string,
) => {
  const aesKey = await deriveAesGcmKey(privJwkObj, recipientPubB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    encoded,
  );
  const combined = new Uint8Array(iv.byteLength + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.byteLength);
  return secureMarker + arrayBufferToBase64(combined.buffer);
};

export const decryptFromSender = async (
  secureText: string,
  privJwkObj: any,
  senderPubB64: string,
) => {
  if (!secureText || !secureText.startsWith(secureMarker)) return null;
  try {
    const payload = secureText.slice(secureMarker.length);
    const ab = base64ToArrayBuffer(payload);
    const arr = new Uint8Array(ab);
    const iv = arr.slice(0, 12);
    const cipher = arr.slice(12);
    const aesKey = await deriveAesGcmKey(privJwkObj, senderPubB64);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      aesKey,
      cipher,
    );
    return new TextDecoder().decode(plain);
  } catch (_err) {
    console.error("decrypt failed", _err);
    return null;
  }
};

export const encryptFileForRecipient = async (
  file: File,
  privJwkObj: any,
  recipientPubB64: string,
) => {
  const aesKey = await deriveAesGcmKey(privJwkObj, recipientPubB64);
  const fileBuf = await file.arrayBuffer();

  const header = JSON.stringify({
    filename: file.name,
    contentType: file.type,
  });
  const headerBytes = new TextEncoder().encode(header);
  const headerLen = headerBytes.length;

  const wrapper = new Uint8Array(4 + headerLen + fileBuf.byteLength);
  const view = new DataView(wrapper.buffer);
  view.setUint32(0, headerLen);
  wrapper.set(headerBytes, 4);
  wrapper.set(new Uint8Array(fileBuf), 4 + headerLen);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    wrapper.buffer,
  );
  const combined = new Uint8Array(iv.byteLength + cipherBuffer.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipherBuffer), iv.byteLength);

  const blob = new Blob([combined.buffer], {
    type: "application/octet-stream",
  });
  return { blob, filename: `${file.name}.enc` };
};
