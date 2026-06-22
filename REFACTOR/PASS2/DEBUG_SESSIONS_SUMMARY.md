# Debug Sessions Summary

All bugs found and fixed across the three post-refactor debug sessions (2026-06-20 to 2026-06-22). Ordered chronologically within each session.

---

## Session 1 — 2026-06-20
*Branch: `dev/grace-refactor-debug`. Local testing of refactored codebase.*

### 1. MongoDB auth error on startup
**Root cause:** Local `mongod` had `security: authorization: "enabled"` in `/opt/homebrew/etc/mongod.conf` but the local connection string had no credentials. TCP connects but first query is rejected.
**Fix:** Removed the `security` block from `mongod.conf`, restarted MongoDB. Auth disabled for local dev (machine not network-exposed).

### 2. Frontend CSS import path mismatch
**Root cause:** `app-dialogs.css` moved from `styles/components/` to `styles/` during refactor; import in `App.tsx` not updated.
**Fix:** `App.tsx:3` — corrected import path from `./styles/components/app-dialogs.css` to `./styles/app-dialogs.css`.

### 3. `validateQuery` middleware crash (Express 5)
**Root cause:** Express 5 defines `req.query` as a getter-only property. Direct assignment `req.query = result.data` throws `TypeError: Cannot set property query`.
**Fix:** `validateQuery.ts` — replaced direct assignment with `Object.defineProperty(req, "query", { value: result.data, writable: true, configurable: true })`.

### 4. Provider status always showing "Needs setup"
**Root cause:** `useProviders` hook called `/providers/status` without an auth token. The refactored branch requires `authenticate` on that route (unlike `prod/green`). 401 silently set `providerStatuses: []` and the effect never re-ran after login (empty `useCallback` dep array).
**Fix:** `useProviders.ts` — hook now accepts and forwards `authToken`; dep array includes it. `App.tsx` — passes `auth.token` to hook, adds it to the load effect deps.

### 5. Telegram phone code never delivered
**Root cause:** Ghost MTProto session left by `prod/green`. On session replacement, the old client was only `disconnect()`-ed — `auth.LogOut` was never sent to Telegram. Telegram kept routing codes to the ghost session (`isCodeViaApp: true`). No client was connected to it, so codes were never received.
**Fix:** `telegram-mtproto.service.ts` — three locations (phone code flow, QR flow, `disconnectMTProtoSession`) now call `auth.LogOut` before replacing or destroying a client. `disconnectMTProtoSession` reconstructs the client from the DB session string if not in memory, ensuring logout reaches Telegram even after a backend restart.

### 6. Mobile UI freeze (Safari/iPhone, WhatsApp)
**Root cause:** Polling `useEffect` in `App.tsx` had `convHook.lastSync` in its dependency array. Every new message updated `lastSync`, which cleared and re-created the polling interval — causing a cascade loop instead of a stable interval.
**Fix:** `App.tsx` — added `lastSyncRef` following the existing ref pattern. Removed `lastSync` from the polling effect deps so the interval is stable across messages.

---

## Session 2 — 2026-06-21
*Branch: `prod/blue`. Production deployment to Render + smoke-test cycle.*

### 7. Render frontend build — `@aashutoshrathi/word-wrap` removed from npm
**Root cause:** Package yanked from the npm registry; it was a transitive dependency of ESLint.
**Fix:** `frontendReactJs/package.json` — npm override: `"@aashutoshrathi/word-wrap": "npm:word-wrap@1.2.5"`.

### 8. Render frontend build — TypeScript 6 widened `JsonWebKey.kty`
**Root cause:** TypeScript 6 changed `JsonWebKey.kty` from `"EC"` to `string | undefined`. The `EcdhPrivateJwk` type required `kty: "EC"`, so `crypto.subtle.exportKey("jwk", ...)` results no longer satisfied it.
**Fix:** `keys.ts`, `crypto.test.ts` — wrapped every `crypto.subtle.exportKey("jwk", ...)` call with `EcdhPrivateJwkSchema.parse()` to narrow at runtime.

### 9. Render backend build — `es5-ext@0.10.14` missing from lock file
**Root cause:** `es6-symbol@3.1.3` (in lock file) depends on `es5-ext@0.10.14`, which was removed from the registry. `npm ci` could not resolve it.
**Fix:** `backend/package.json` — npm override: `"es6-symbol": "3.1.4"`, which drops the `es5-ext` dependency entirely.

### 10. Secure message decryption failure (both ends)
**Root cause:** Race condition in the re-decrypt `useEffect`. `privJwk` is loaded from localStorage synchronously (fast). The effect fired immediately when `privJwk` became available, before messages had arrived from the network. It found an empty message list, ran nothing, and never re-triggered because `convHook.messages` was not in its dependency array.
**Fix:** `App.tsx` — added `loadMessages` to the outer load effect's deps so a full message fetch (with inline decryption) re-runs when `privJwk` becomes available. Added `toDecrypt.length === 0` early-exit guard in the re-decrypt effect.

### 11. Settings page auto-focus keyboard popup (mobile)
**Root cause:** `autoFocus` attributes on both the phone number input (step idle) and the verification code input (step code) in `ConnectTelegram.tsx` immediately opened the keyboard on navigation.
**Fix:** Removed `autoFocus` from both. Retained it on the 2FA password input (appears mid-flow after the user has explicitly entered their phone number).

### 12. Polling regression — message list erratic/blank
**Root cause:** `setMessages(incoming)` was called unconditionally on every poll, including `since`-filtered results which only contain new messages. This replaced the full thread with only the newest batch.
**Fix:** `useConversations.ts` — new messages are appended (de-duplicated) when `since` is set; full replace only when no `since` param.

### 13. Nuke account — incomplete erasure
**Root cause:** Nuking left orphan documents: mirror keys (stored under `providerChatId`), fan-out inbound message copies stored under other accounts, links stored by `providerChatId`, and no Telegram `auth.LogOut` before session deletion.
**Fix:** `auth.ts` — `nukeAccount` rewrote to: collect `providerChatIds` before deletion, call `disconnectMTProtoSession`, delete fan-out copies, delete links by both `claimedAccountId` and `providerChatId`, delete keys by both `ownerId: accountId` and `ownerId: { $in: providerChatIds }`.

### 14. Telegram `ResendCode` returning `SEND_CODE_UNAVAILABLE`
**Root cause:** `requestPhoneCode` called `auth.ResendCode` when `isCodeViaApp: true`, trying to force SMS. For accounts with an active Telegram app session, Telegram refuses this — app delivery is the correct channel.
**Fix:** `telegram-mtproto.service.ts` — removed the `ResendCode` block entirely. `codeType` derived directly: `result?.isCodeViaApp ? "app" : "sms"`.

### 15. Provider pills — no unread dot on inactive provider (partial fix, completed in session 3)
**Implementation:** `App.tsx` — `pillHasUnread` check added. `useConversations.ts` — `markConversationRead` sets `lastDirection: undefined` for opened conversation immediately in local state.
**Remaining gap (fixed in session 3):** `conversations` array only held the active provider's data, so the pill check could never find unread conversations for the inactive provider.

### 16. "No chats yet" empty state flickering and wrong conditions
**Root cause:** Empty-state button appeared even when a connection existed for another provider, and showed before connections had loaded.
**Fix:** `App.tsx` / `ChatsPage.tsx` — button only shown when no connection exists for the **current provider** specifically, and only when `connectionsLoading` is false.

---

## Session 3 — 2026-06-22
*Branch: `prod/blue`. Multi-device key continuity.*

### 17. New-device key recovery silently failing — missing auth token
**Root cause:** Step 2 of `autoSetupKey` fetched the stored public key with `apiFetch('/keys/${userId}')` — no auth token. `GET /keys/:ownerId` requires `authenticate` (added C3, 2026-06-20). The 401 caused `serverPubResp.ok` to be false; recovery fell through silently to step 3 (generate fresh key) on every new-device login. Each device got a unique keypair, making cross-device decryption impossible.
**Fix:** `App.tsx` — pass `auth.token` as third argument to the `apiFetch` call in step 2 of `autoSetupKey`.
**Note:** Same-device logout/login was stable because step 1 (localStorage) succeeded before step 2 was reached.

### 18. Manual keypair regeneration erases the server blob
**Root cause:** `generateAndRegisterKeypair` called `registerPublicKeyService(pubKey, token)` with no `privJwk` and no `password`. No encrypted blob in the request triggered the backend's stale-blob protection: new public key + no blob → `privateKeyJwk` set to null. Next login found no blob → fell through to generate yet another fresh key. Chain: generate new key → logout → login → new key again, indefinitely.
**Fix:**
- **`backend/src/schemas/auth.ts`:** Added `verifyPasswordSchema` and `VerifyPasswordBody`.
- **`backend/src/controllers/auth.ts`:** Added `verifyPassword` handler — authenticated, bcrypt-checks supplied password, returns 200 or 401, does not modify `failedLoginAttempts`.
- **`backend/src/routes/auth.route.ts`:** Added `POST /auth/verify-password` — rate-limited via `authRateLimiter`, body validated by `verifyPasswordSchema`.
- **`frontendReactJs/src/data/auth.ts`:** Added `verifyPasswordRequest`.
- **`App.tsx`:** `generateAndRegisterKeypair` now requires `password: string`, calls `verifyPasswordRequest` first, passes `privJwk` + `password` to `registerPublicKeyService`.
- **`KeyManager.tsx`:** Confirm dialog now includes a mandatory password field. "Generate anyway" disabled until non-empty; Enter key blocked when empty; `handleConfirmGenerate` has hard early-exit guard. Password required on both replace-existing and fresh-generate paths.

### 19. Cross-provider unread indicator not showing
**Root cause:** `useConversations.loadConversations` called `setConversations(parsed.data)` — replacing the entire array with only the active provider's conversations. The `pillHasUnread` check searched `convHook.conversations` for the inactive provider and never found anything.
**Fix:** `useConversations.ts` — merge by provider instead of replace:
```typescript
setConversations((prev) => [
  ...prev.filter((c) => c.provider !== currentProvider),
  ...parsed.data,
]);
```
`App.tsx` — load all providers silently on login; poll all providers silently on every tick; `onNewMessage` triggers a silent `loadConversations` for real-time messages from the inactive provider.

### 20. Conversations from all providers mixing in active tab (regression from fix 19)
**Root cause:** Fix 19 made `convHook.conversations` contain all providers' data, but `ChatsPage` received the unfiltered array.
**Fix:** `App.tsx` — filter by active provider and suppress unread dot for the currently open conversation at render time before passing to `ChatsPage`:
```typescript
convHook.conversations
  .filter((c) => c.provider === provider)
  .map((c) =>
    chatOpen && c.chatId === selectedChatId
      ? { ...c, lastDirection: undefined }
      : c,
  )
```
`loadConversations` wrapper updated with `showLoading = true` default; background loads pass `false` to suppress spinner flicker.

---

## Recurring patterns

| Pattern | Bugs |
|---|---|
| Missing auth token on authenticated routes | 4, 17 |
| Silent fallthrough masking the actual failure | 17, 18 |
| Partial data write leaving server in inconsistent state | 18 |
| Shared state array consumed by multiple callers with different expectations | 15/19, 20 |
| React effect dependency array bug (missing dep / stale closure) | 4, 6, 10 |
| `auth.LogOut` not sent before Telegram session replacement | 5, 13 |
| npm registry / lock file drift on Render builds | 7, 9 |
