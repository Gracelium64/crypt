# Debug Session — 2026-06-22

Multi-device E2E key continuity bugs. All bugs were in the key setup / registration flow. No Telegram or WhatsApp changes.

---

## 1. Key mismatch on new-device login — missing auth token on public key fetch

**Symptom:** Every device that logged in to an existing account got a different keypair. Settings showed a different fingerprint on Android, iPhone, and desktop for the same account.

**Root cause:** Step 2 of `autoSetupKey` in `App.tsx` tried to recover the keypair from the server:

```typescript
const serverJwk = await fetchAndDecryptPrivateKey(auth.token, password);
if (serverJwk) {
  const serverPubResp = await apiFetch(`/keys/${encodeURIComponent(auth.user?.id ?? "")}`).catch(() => null);
```

The `apiFetch` call had no auth token. `GET /keys/:ownerId` requires `authenticate` middleware (added in C3, 2026-06-20). The 401 response made `serverPubResp.ok` false → recovery silently fell through to step 3 (generate fresh key) every time.

**Fix (`frontendReactJs/src/App.tsx`):** Pass `auth.token` as the third argument:

```typescript
const serverPubResp = await apiFetch(`/keys/${encodeURIComponent(auth.user?.id ?? "")}`, {}, auth.token).catch(() => null);
```

**Why it worked for logout→login without key regeneration:** The `autoSetupKey` auto-generates a key on first login (step 3) and DOES encrypt the blob with the password, so the server blob exists. The bug only surfaced in step 2 (recovery). On same-device reload, step 1 (localStorage) succeeds before step 2 is even reached.

---

## 2. Manual keypair regeneration nukes the server blob

**Symptom:** Generate new keypair in Settings → logout → login → keypair changes again. Keypair was stable across logout/login without manual generation in between.

**Root cause:** `generateAndRegisterKeypair` in `App.tsx` called:

```typescript
await registerPublicKeyService(r.pubB64, auth.token);  // no privJwk, no password
```

Without a `privJwk`/`password`, no encrypted blob was sent. The backend's stale-blob-protection logic in `registerKey` detected a new public key without a blob and **nulled the existing blob**:

```typescript
if (!existing || existing.publicKey !== publicKey) {
  update.privateKeyJwk = null;
}
```

Next login: `fetchAndDecryptPrivateKey` found null → fell through to step 3 → generated yet another new key.

**Fix — three parts:**

1. **`POST /auth/verify-password` endpoint** (`backend/src/controllers/auth.ts`, `backend/src/routes/auth.route.ts`): authenticated, rate-limited via `authRateLimiter`, bcrypt-checks the supplied password against the stored hash. Returns `{ ok: true }` on match, 401 on mismatch. Does not increment `failedLoginAttempts` (user is already authenticated).

2. **`generateAndRegisterKeypair` in `App.tsx`:** now requires a `password: string` parameter. Calls `verifyPasswordRequest` first — aborts with `"Incorrect password."` if wrong. On success, passes `privJwk` and `password` to `registerPublicKeyService` so the blob is always encrypted and saved.

3. **KeyManager confirm dialog** (`frontendReactJs/src/components/KeyManager.tsx`): password field added to the confirmation step. "Generate anyway" button is disabled until field is non-empty. Enter key also blocked while empty. `handleConfirmGenerate` has a hard `if (!pw) return` guard so no code path bypasses the field. Password is required on both the "replace existing" and "generate fresh" paths — both now open the confirm dialog.

**Schema** (`backend/src/schemas/auth.ts`): `verifyPasswordSchema = z.object({ password: z.string().min(1).max(24) })`.

---

## 3. Cross-provider unread indicator not showing

**Symptom:** When viewing Telegram conversations, no dot appeared on the WhatsApp pill even if WhatsApp had unread messages.

**Root cause:** `useConversations.loadConversations` called `setConversations(parsed.data)` — replacing the entire array with only the active provider's conversations. The `pillHasUnread` check (`convHook.conversations.some(c => c.provider === p && ...)`) could never find the inactive provider's conversations.

**Fix (`frontendReactJs/src/hooks/useConversations.ts`):** Merge instead of replace — keep conversations from other providers intact:

```typescript
setConversations((prev) => [
  ...prev.filter((c) => c.provider !== currentProvider),
  ...parsed.data,
]);
```

**Additional changes (`frontendReactJs/src/App.tsx`):**
- On login (keyed on `auth.token`), load all providers silently (`showLoading = false`) so both providers' unread state is populated from the start
- Polling interval loads all providers silently on every tick (was only loading the active provider)
- `onNewMessage`: real-time messages from the inactive provider now trigger a silent `loadConversations` for that provider so the pill dot appears immediately

---

## 4. Conversations from all providers showing in active provider's tab (regression from fix 3)

**Symptom:** Switching to WhatsApp tab showed both Telegram and WhatsApp conversations mixed together.

**Root cause:** Fix 3 made `convHook.conversations` contain all providers' data, but `ChatsPage` received the unfiltered array.

**Fix (`frontendReactJs/src/App.tsx`):** Filter + suppress at render time before passing to ChatsPage:

```typescript
conversations={convHook.conversations
  .filter((c) => c.provider === provider)
  .map((c) =>
    chatOpen && c.chatId === selectedChatId
      ? { ...c, lastDirection: undefined }
      : c,
  )}
```

The `.map` also suppresses the unread dot for the currently open conversation, preventing polls from re-lighting it while the chat is in view.

**`loadConversations` wrapper updated** with `showLoading = true` default. Active-provider-switch and initial load use the default (shows spinner); background poll and silent all-provider loads pass `false`.

---

## 5. iPhone XR — old encrypted messages unreadable (collateral damage, not a new bug)

**Symptom:** A user logged in only on iPhone XR suddenly couldn't decrypt older messages from a contact.

**Cause:** Not a bug in iPhone XR's account — a consequence of the key-overwriting loop (bugs 1 + 2). When `test@test.com` (the contact) regenerated their key and registered the new public key to the server, all historical messages encrypted with their old public key became permanently unreadable. iPhone XR fetched `test@test.com`'s current public key (the new one), derived a wrong ECDH shared secret, and decryption failed.

**Resolution:** Not fixable for existing messages. Once bugs 1 and 2 are deployed, keys will be stable across logins. Test accounts should be nuked and re-registered fresh.

---

## Files changed

| File | Change |
|---|---|
| `backend/src/schemas/auth.ts` | Added `verifyPasswordSchema`, `VerifyPasswordBody` |
| `backend/src/controllers/auth.ts` | Added `verifyPassword` handler |
| `backend/src/routes/auth.route.ts` | Added `POST /auth/verify-password` route |
| `frontendReactJs/src/data/auth.ts` | Added `verifyPasswordRequest` |
| `frontendReactJs/src/data/index.ts` | Exported `verifyPasswordRequest` |
| `frontendReactJs/src/hooks/useConversations.ts` | Merge-by-provider in `loadConversations` |
| `frontendReactJs/src/App.tsx` | auth.token fix; password verification; all-provider loading; ChatsPage filter+suppress |
| `frontendReactJs/src/components/KeyManager.tsx` | Password field in confirm dialog; button disabled without password |
| `frontendReactJs/src/pages/SettingsPage.tsx` | Updated `generateAndRegisterKeypair` prop type |
