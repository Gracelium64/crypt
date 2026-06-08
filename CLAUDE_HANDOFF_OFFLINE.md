# Handoff: Offline Key Recovery (Re-link Decryption Issue)

## Problem

When a user unlinks a device (clears browser/app storage) and re-connects their Telegram account, old secure messages in the database become permanently unreadable on that device.

**Why it happens:**
- Each user's ECDH P-256 private key lives only in `localStorage` (`crypt:priv:<email>`).
- Secure messages are encrypted as: `AES-GCM(shared_secret)` where `shared_secret = ECDH(senderPriv, recipientPub)`.
- When localStorage is cleared, the private key is gone.
- On re-login, `autoSetupKey` in `App.tsx` generates a **new** keypair and registers the new public key.
- The new private key derives a **different** shared secret — old ciphertext cannot be decrypted.
- This is mathematically irreversible without the original private key.

**What still works fine:**
- New messages sent after re-linking decrypt correctly.
- If localStorage is NOT cleared (re-opening browser, re-linking Telegram without wiping device storage), messages continue to decrypt normally because the key is still there.

---

## Recommended Solution: Server-side Encrypted Key Backup

Store the private key on the server, encrypted with a key derived from the user's login password. Restore it automatically on re-login before generating a new key.

### Backend changes

1. Add `keyBackup: String` field to `backend/src/models/account.ts`.
2. Add `PUT /api/account/key-backup` — accepts `{ encryptedKey: string }`, stores on account.
3. Add `GET /api/account/key-backup` — returns `{ encryptedKey: string }` for authenticated user.
4. Register new `accountRouter` in `backend/src/routes/index.ts`.

### Frontend changes — on key generation (`autoSetupKey` in `App.tsx`)

After generating or loading the keypair, encrypt the private JWK with PBKDF2 derived from the user's password and upload:

```typescript
const backupKey = await crypto.subtle.deriveKey(
  { name: "PBKDF2", salt: new TextEncoder().encode(email), iterations: 200000, hash: "SHA-256" },
  await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]),
  { name: "AES-GCM", length: 256 },
  false,
  ["encrypt", "decrypt"],
);
const iv = crypto.getRandomValues(new Uint8Array(12));
const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, backupKey,
  new TextEncoder().encode(JSON.stringify(privJwk)));
const blob = btoa(JSON.stringify({ iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) }));
await apiFetch("/account/key-backup", {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ encryptedKey: blob }),
}, token);
```

### Frontend changes — on re-login (in `autoSetupKey`, when localStorage is empty)

Before falling through to generate a new key, attempt to restore from the server backup:

```typescript
const backupResp = await apiFetch("/account/key-backup", {}, token);
if (backupResp.ok) {
  const { encryptedKey } = await backupResp.json();
  // decrypt with same PBKDF2 derivation using the password held in memory at login
  // on success: setPrivJwk, setPubKeyB64, store in localStorage, return
  // on decrypt failure: fall through to generate new key
}
```

**Constraint:** The plaintext password must be held in component state briefly at login time (currently it's discarded after `auth.login()`). The auth context or a ref needs to hold it until `autoSetupKey` runs.

### Why this approach
- Private key is never stored in plaintext on the server.
- PBKDF2 at 200k iterations makes brute-forcing the backup impractical.
- Transparent to the user — no recovery codes to manage.
- If the user forgets their password the backup is unrecoverable, same as any E2E system.

---

## Alternative: Recovery Code (No Password Dependency)

On first key generation, show a base64 export of the private JWK (or a BIP39 mnemonic). User saves it offline. On re-link, show a "Restore from recovery code" input before generating a new key. Simpler to implement but requires explicit user action.

---

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/models/account.ts` | Add `keyBackup: { type: String, default: null }` |
| `backend/src/routes/account.route.ts` | New file: GET + PUT `/account/key-backup` |
| `backend/src/routes/index.ts` | Register `accountRouter` |
| `frontendReactJs/src/App.tsx` | Update `autoSetupKey`: backup on generate, restore before regenerating |
| `frontendReactJs/src/context/useAuth.tsx` | Hold plaintext password briefly in state/ref after login |

---

## Behaviour Summary

| Scenario | Decrypts? |
|----------|-----------|
| Re-open browser (localStorage intact) | Yes |
| Re-link Telegram, localStorage intact | Yes |
| Clear localStorage, re-login (no backup) | No — new key generated |
| Clear localStorage, re-login (backup implemented) | Yes — key restored |
| New device (backup implemented) | Yes — key restored |
