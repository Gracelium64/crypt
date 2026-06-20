# Debug Session — 2026-06-21

Production deployment of `prod/blue` branch. C4 DB migration (Key.ownerId email→accountId). Full smoke-test cycle on live Render deployment followed by a UI bug-fix pass.

---

## 1. Render deploy failures — frontend

### 1a. `@aashutoshrathi/word-wrap@1.2.3` removed from npm registry

**Symptom:** Render frontend build failed:
```
npm error 404 Not Found - GET https://registry.npmjs.org/@aashutoshrathi%2fword-wrap
```

**Cause:** The package was yanked from the npm registry. It was a transitive dependency of eslint.

**Fix:** `frontendReactJs/package.json` — npm override:
```json
"overrides": {
  "@aashutoshrathi/word-wrap": "npm:word-wrap@1.2.5"
}
```
`word-wrap@1.2.5` (published 2023-07-22) is the canonical replacement. ≥5 days old ✓

---

### 1b. TypeScript 6 — `JsonWebKey.kty` now `string | undefined`

**Symptom:** Render frontend build failed with type errors:
```
Argument of type 'CryptoKeyPair' is not assignable to parameter of type 'EcdhPrivateJwk'
Type 'string | undefined' is not assignable to type '"EC"'
```

**Cause:** TypeScript 6 widened the `JsonWebKey` type — `kty` is now `string | undefined`. The `EcdhPrivateJwk` type requires `kty: "EC"`, so `crypto.subtle.exportKey("jwk", ...)` return value no longer satisfies it directly.

**Fix:** Wrap every `crypto.subtle.exportKey("jwk", ...)` call with `EcdhPrivateJwkSchema.parse()` to narrow the result at runtime.

Files changed:
- `frontendReactJs/src/services/keys.ts`
- `frontendReactJs/src/lib/crypto.test.ts`

---

## 2. Render deploy failure — backend

### `es5-ext@0.10.14` missing from lock file

**Symptom:** Render backend build failed:
```
npm error code ELOCKVERIFY
npm error npm ci can only install packages when your package.json and package-lock.json are in sync.
Missing: es5-ext@0.10.14 from lock file
```

**Cause:** `es6-symbol@3.1.3` (in lock file) depends on `es5-ext`. The `es5-ext@0.10.14` release was later removed/replaced and Render's registry view no longer resolved it.

**Fix:** `backend/package.json` — npm override that pins `es6-symbol` to `3.1.4`, which drops the `es5-ext` dependency entirely:
```json
"overrides": {
  "es6-symbol": "3.1.4"
}
```
`es6-symbol@3.1.4` published 2024-03-01 ≥5 days old ✓

---

## 3. Secure message decryption failure (both ends)

**Symptom:** Both A (iPhone) and B (Android) saw garbled ciphertext `[CRYPT:v1]...` — messages were never decrypted on either side.

**Root cause — race condition in re-decrypt effect:** `privJwk` is loaded from localStorage synchronously (fast). The re-decrypt `useEffect` fired immediately on `privJwk` becoming available, before messages had arrived from the network. It found an empty message list, ran nothing, and never re-triggered because `convHook.messages` was not in its dependency array.

**Fix (`frontendReactJs/src/App.tsx`):**
1. Added `loadMessages` to the outer load effect's deps so a full message fetch (with inline decryption) re-runs when `privJwk` becomes available.
2. Added `toDecrypt.length === 0` early-exit guard in the re-decrypt effect to avoid no-op passes.

---

## 4. Settings page auto-focus keyboard popup

**Symptom:** Navigating to Settings on mobile immediately opened the keyboard, jumping the page to the phone number input field in Connect Telegram.

**Fix (`frontendReactJs/src/components/ConnectTelegram.tsx`):** Removed `autoFocus` from the phone number input (step idle) and the verification code input (step code). Retained `autoFocus` on the 2FA password input — it appears mid-flow after the user has explicitly entered their phone number.

---

## 5. Polling regression — message list erratic/blank

**Symptom:** During incremental polling (with `since` param), the message list jumped, went blank, then only showed the newest message. Previously unaffected on `prod/green`.

**Root cause:** `setMessages(incoming)` was called unconditionally on every poll, including `since`-filtered results — which only contain new messages. This replaced the full thread with only the new batch.

**Fix (`frontendReactJs/src/hooks/useConversations.ts`):**
```typescript
if (since && incoming.length > 0) {
  setMessages((prev) => {
    const existingIds = new Set(prev.map((m) => m._id));
    const fresh = incoming.filter((m) => !existingIds.has(m._id));
    return fresh.length > 0 ? [...prev, ...fresh] : prev;
  });
} else if (!since) {
  setMessages(incoming);
}
```

---

## 6. Nuke account — incomplete erasure

**Symptom:** Nuking an account left orphan documents in the database:
- Keys stored under the `providerChatId` as `ownerId` (mirror keys created at link time)
- Fan-out inbound message copies stored under OTHER accounts (when A sent a message, B received an inbound copy under B's `accountId`)
- Links stored by `providerChatId` in addition to `claimedAccountId`
- No proper Telegram API logout before session deletion

**Fix (`backend/src/controllers/auth.ts`):** Rewrote `nukeAccount` to:
1. Collect `providerChatIds` from connections before deleting them
2. Call `disconnectMTProtoSession(accountId)` to send `auth.LogOut` to Telegram before destroying the session
3. Delete fan-out copies: `Message.deleteMany({ from: { $in: providerChatIds }, accountId: { $ne: accountId } })`
4. Delete links by both `claimedAccountId` AND `{ providerChatId: { $in: providerChatIds } }`
5. Delete keys by both `ownerId: accountId` AND `{ ownerId: { $in: providerChatIds } }`

---

## 7. Database cleanup — MongoDB Compass

After nuking test accounts via the app, orphan documents remained (legacy pre-migration data and accounts created outside the nuke flow). Cleaned up manually via Compass mongosh shell.

Kept account `6a293d0df97a390c84840a59` (grace6424@icloud.com). Deleted everything else:

```js
db.accounts.deleteMany({ "_id": { $ne: ObjectId("6a293d0df97a390c84840a59") } })
// deletedCount: 4

db.messages.deleteMany({ "accountId": { $ne: "6a293d0df97a390c84840a59" } })
// deletedCount: 198

db.providerconnections.deleteMany({ "accountId": { $ne: "6a293d0df97a390c84840a59" } })
// deletedCount: 9

db.telegramsessions.deleteMany({ "accountId": { $ne: "6a293d0df97a390c84840a59" } })
// deletedCount: 2

db.links.deleteMany({ "claimedAccountId": { $ne: "6a293d0df97a390c84840a59" } })
// deletedCount: 20

db.keys.deleteMany({ ownerId: { $in: ["6a2c0f7ec9f0e1e56d3819ce", "6a2ff6d08a469e4afeb1ae61", "6a2ff7648a469e4afeb1ae62", "6a301911ce59101f44168707", "8976479213", "1000235704", "4915224337813", "4915207005318"] } })
// deletedCount: 8
```

**Note:** The cleanup also deleted the legacy Telegram `ProviderConnection` for `6a293d0df97a390c84840a59` — it was likely stored with a stale `accountId` value (pre-migration format) and matched the `$ne` filter. Re-linking via phone code in the app recreated it correctly with the ObjectId accountId.

---

## 8. Telegram ResendCode removed

**Symptom:** Backend logs showed `SEND_CODE_UNAVAILABLE` on every phone code request for active accounts (accounts with a running Telegram app session).

**Root cause:** `requestPhoneCode` was calling `auth.ResendCode` when `isCodeViaApp: true`, trying to force SMS delivery. For active accounts, Telegram refuses this — the code routes to the Telegram app, which is the correct behaviour. `SEND_CODE_UNAVAILABLE` is not an error; it means "the app delivery is working, there is no alternative channel."

**Fix (`backend/src/services/telegram-mtproto.service.ts`):** Removed the entire `ResendCode` block. `codeType` is now derived directly:
```typescript
const codeType: "app" | "sms" = result?.isCodeViaApp ? "app" : "sms";
```
Return type narrowed from `"app" | "sms" | "call" | "other"` to `"app" | "sms"`.

---

## 9. Telegram phone code ghost session — RESOLVED

The ghost session issue documented in `TELEGRAM_PHONE_CODE_ISSUE.md` was resolved this session.

The 24-hour Telegram freshness window elapsed. Terminating all Telegram sessions on the device from Telegram's own settings (not via Crypt) cleared the ghost session. Phone code delivery (`isCodeViaApp: false`, code via SMS) now works correctly for `+49 1522 4337813`.

The `auth.LogOut` fix from the previous session (preventing future ghost sessions) is confirmed in place.

Debug UI (`Reset other sessions` button) removed from `ConnectTelegram.tsx` per `TELEGRAM_PHONE_CODE_ISSUE.md` § UI Cleanup.

---

## 10. UI improvements — loading states

All async operations now show a rotating spinner instead of a blank or static button:

| Location | Trigger | Implementation |
|---|---|---|
| Thread (Timeline) | Initial message load | `messagesLoading` state in App.tsx; spinner in Timeline when `loading && messages.length === 0` |
| Conversation list (ChatsPage) | Initial conversations load | `conversationsLoading` state in App.tsx; spinner when `conversationsLoading && conversations.length === 0` |
| Delete conversation | DELETE request in flight | `deleteBusy` state; spinner replaces 🗑 icon in ChatView header |
| Send button | Message send in flight | Spinner replaces ➤ icon in composer |
| Auth buttons | Login / register in flight | Spinner replaces button text in AuthPage |
| Find/Search | Contact search in flight | Spinner replaces "Search" text in FindContact |
| Key generation | Keypair generation / registration | Spinner replaces button text in KeyManager |

**CSS:** All spinners use `.spinner` (16px, `border-top-color: currentColor`) from `global.css`. Large centered ones add `.spinner--lg` (28px, accent colour border). `global.css` is now imported in `main.tsx` so it is available before login — previously it was only loaded inside `App.tsx`, which caused the auth page spinner to be invisible.

---

## 11. UI improvements — unread indicators

**Conversation list:** Each conversation row shows a bold display name and a small blue dot (`.conv-unread-dot`, 8px, `var(--accent)`) when `lastDirection === "inbound"`.

**Provider pills:** A 6px blue dot (`.provider-pill-dot`) appears on a provider pill when that provider is NOT currently active and has at least one conversation with `lastDirection === "inbound"`.

**Read-on-open:** `openConversation` in App.tsx calls `convHook.markConversationRead(chatId)`, which immediately sets `lastDirection: undefined` for the opened conversation in local state. The unread dot clears the moment the user taps the conversation — no round-trip required.

---

## 12. UI improvements — "No chats yet" state

- Shows a spinner while `conversationsLoading` is true (instead of the empty-state immediately).
- "Go to Settings" button is only shown when:
  1. There are no conversations for the **current provider** (not any provider globally)
  2. AND `connectionsLoading` is false (connections have fully loaded)
  3. AND there is no connection for the **current provider** specifically

This prevents the button appearing on the Telegram tab when only WhatsApp is linked, and prevents a brief flash on initial load before connections are fetched.

---

## 13. ConnectTelegram — debug UI removed

Removed from `ConnectTelegram.tsx`:
- `resetConfirm`, `resetDone`, `resetError` state declarations
- `resetOtherSessions` async function
- `{resetError && ...}` error display in connected view
- "Reset other sessions" button and its confirm flow

Connected view restored to: `Active` chip + Disconnect confirm flow only.

The backend endpoint `POST /api/telegram/direct/reset-sessions` and `resetOtherSessions` service function are retained — they are correct behaviour and may be useful for future admin tooling.
