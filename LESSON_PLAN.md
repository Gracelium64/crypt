# Codebase Mastery Lesson Plan

**For:** Grace (WBS graduate, Flutter-strong)  
**Goal:** Full understanding of every non-trivial pattern in this codebase + UI rework before deadline  
**Format:** Interactive teacher sessions (start each: "continue lesson plan, module X")

---

## Revised Time Estimate

| Phase                              | Days (8h/day) | Hours    |
| ---------------------------------- | ------------- | -------- |
| Backend services (the logic layer) | 1             | 8h       |
| Frontend custom hooks + API layer  | 1             | 8h       |
| Cryptography (ECDH + AES-GCM)      | 1             | 8h       |
| Telegram MTProto                   | 1.5           | 12h      |
| Socket.IO realtime                 | 0.5           | 4h       |
| Media uploads                      | 0.5           | 4h       |
| Link/pairing system                | 0.5           | 4h       |
| UI rework + refinement             | 2             | 16h      |
| **Total**                          | **~8 days**   | **~64h** |

Rebuild exercises deferred to after 2026-06-24 deadline — see `REBUILD_EXERCISES.md`.

---

## Already Known (no teaching needed — review only for refactor opportunities)

- TypeScript syntax, type annotations, interfaces, Zod
- Express setup, CORS, route mounting at `/api`
- All route files (`backend/src/routes/`)
- All Mongoose models (`backend/src/models/`)
- Frontend entry points (`main.tsx`, `index.html`, `App.tsx` structure)
- Auth system (`AuthProvider`, `auth-context`, `useAuth`, `data/auth.ts`, `ProtectedLayout`)
- All pages and components
- JWT auth patterns (Zod validation, middleware, `/me` endpoint)

**When reviewing these files:** read for refactor opportunities, not comprehension. Note anything that looks off and flag it in a session.

---

## Module 2 (remaining) — Backend Services (Day 1, ~8h)

**What this module covers:** The five service files — the actual logic layer, not just route wiring.

### 1. `services/crypto.service.ts` (45 lines) — start here

AES-GCM encrypt/decrypt with a `[CRYPT:v1]` prefix marker.  
Key question: why does the backend need to encrypt/decrypt if E2E means the server can't read messages?  
Answer: the backend crypto service handles _transport-layer_ encryption for provider payloads (WhatsApp, Telegram bodies), not the _user-to-user_ ECDH layer. Two different crypto concerns.

### 2. `services/realtime.service.ts` (35 lines)

Socket.IO server side. Two functions only: `initRealtime()` and `broadcastMessage()`.  
Key question: why does `initRealtime` need the HTTP server, not just the Express app?  
Answer: Socket.IO needs to attach to the raw HTTP server to intercept the WebSocket upgrade handshake — Express alone can't handle protocol upgrades.

### 3. `services/media.service.ts` (70 lines)

Cloudinary uploads via two paths: Formidable multipart and base64 JSON.  
Key question: what does Formidable do that `express.json()` can't?  
Answer: `express.json()` only parses `application/json`. File uploads come as `multipart/form-data` — a completely different encoding that requires a dedicated parser.

### 4. `services/providers.service.ts` (175 lines) — the normalization layer

This is the most architecturally important service. It receives raw events from Telegram's Bot API webhook and WhatsApp, then normalizes them into the app's internal `Message` schema.  
Read with this question in mind: "What would break if I added a third provider (e.g. Signal)? What would I need to add here?"

### 5. `services/telegram-mtproto.service.ts` (~435 lines) — save for Module 6

Skip for now. Covered in depth in Module 6. Note: file grew significantly across two sessions — QR login functions were added 2026-06-15 (`startQrLogin`, `getQrLoginStatus`, `resolveQr2fa`, `PendingQr` interface; see Module 16 Part C), and further fixes were added in the same session: `BOT_USER_ID` echo filter, `sendViaMTProto` username fallback, `displayName` fallback order, and the `hasActiveClient` connection-state check (see Module 17).

### End-of-module question:

Draw the data flow from "Telegram Bot API webhook fires" to "React frontend shows the message." Name every function call in order.

---

## Module 3 (remaining) — Frontend Custom Hooks + API Layer (Day 2, ~8h)

**What this module covers:** The hooks and service layer — the parts you haven't looked at deeply yet.

### The API layer first (foundation for everything else)

`lib/api.ts` (28 lines) — one function: `apiCall()`. Read this before touching any hook.  
`lib/constants.ts` — where `VITE_API_BASE_URL` is pulled from.  
`services/messages.ts` — message CRUD using `apiCall()`  
`services/keys.ts` — key CRUD using `apiCall()`

### Custom hooks (read in complexity order)

**Simple ones — warm up:**

1. `hooks/useProviders.ts` (19 lines) — just fetches provider list, minimal state
2. `hooks/useConnections.ts` (64 lines) — fetches connected accounts, exposes connect/disconnect

**Medium complexity:** 3. `hooks/useSend.ts` (61 lines) — encapsulates the send flow: encrypt → POST → optimistic update 4. `hooks/useConversations.ts` (160 lines) — groups messages into threads, most interesting data transformation 5. `hooks/useRealtime.ts` (34 lines) — Socket.IO client (covered more in Module 7)

**Most complex:** 6. `hooks/useLink.ts` (199 lines) — a state machine for the QR pairing flow. Read with this framing: it's equivalent to a multi-step Flutter form with async validation at each step.

**For each hook, answer:**

- What `useState` variables does it hold?
- What side effects does it run (`useEffect`)?
- What does it return to the component that calls it?
- What would break in the UI if this hook returned nothing?

---

## Module 5 — Cryptography (Day 3, ~8h)

**This is the most technically dense module. Go slowly.**

### Concept first: ECDH key exchange (the "paint mixing" analogy)

Imagine two people agree on a starting color (public). Each picks a secret color only they know. They each mix their secret color with the shared starting color and share the result publicly. Both then mix their secret color with the _other person's_ result. Both end up with the same final color — but no observer can reconstruct it without knowing a secret color.

In code:

- "secret color" = private key (never leaves the browser)
- "mixed result you share" = public key (stored on server, anyone can see it)
- "final color both arrive at" = derived shared secret (used as AES key)

### Files (read in this order):

1. `frontendReactJs/src/lib/crypto.test.ts` — read the tests FIRST. They are the clearest documentation of what the functions do and how they chain together.
2. `frontendReactJs/src/lib/crypto.ts` (171 lines) — implement against the tests mentally
3. `backend/src/services/crypto.service.ts` (45 lines) — the backend half

### Functions in `crypto.ts` to understand deeply:

| Function                                      | What it does                                                          |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `arrayBufferToBase64` / `base64ToArrayBuffer` | Convert between raw bytes and storable strings                        |
| `fingerprintFromPubKey`                       | SHA-256 hash of a public key → human-readable hex pairs (shown in UI) |
| `importPublicKeyFromBase64`                   | Reconstruct a CryptoKey object from a stored base64 string            |
| `importPrivateJwkKey`                         | Reconstruct a private CryptoKey from a stored JWK object              |

The rest of the file: ECDH `deriveKey()` → use that derived key for AES-GCM `encrypt()` / `decrypt()`.

### Key architectural insight:

- Private keys: generated in browser, stored in browser (localStorage or IndexedDB), **never sent to server**
- Public keys: sent to server, stored in DB, shared with other users
- Server stores: `encryptedText` (AES-GCM ciphertext), public keys — cannot decrypt messages
- The `[CRYPT:v1]` prefix in `encryptedText` is a version marker so the app can tell if a message is encrypted or plaintext

### Exercise:

Open `crypto.test.ts`. Before reading the test body, try to write the test yourself for "encrypt then decrypt returns original string." Then compare.

---

## Module 6 — Telegram MTProto (Day 4-5, ~12h)

### Background (read before touching the file)

| Bot API                                      | MTProto API                                 |
| -------------------------------------------- | ------------------------------------------- |
| Telegram runs a server, you receive webhooks | You ARE a Telegram client                   |
| Limited to bot actions                       | Full user account access                    |
| No session persistence needed                | Requires a session string to stay connected |
| `grammy`, `node-telegram-bot-api`            | `gramjs`                                    |

This project uses **both**: Bot API for the webhook (`providers.service.ts`) AND MTProto for direct Telegram account connections (`telegram-mtproto.service.ts`). They are completely separate integrations.

### File: `backend/src/services/telegram-mtproto.service.ts` (280 lines)

**Read in 4 passes:**

**Pass 1 — data structures (lines 1-22):**

```
clients: Map<accountId, TelegramClient>   // live connections
pendingAuth: Map<accountId, PendingAuth>  // in-progress logins
```

Flutter analogy: `clients` is like a `Map<String, StreamController>` — one persistent connection per account.

**Pass 2 — `subscribeToMessages()` (lines 29-~90):**
This is the event handler for incoming messages on a connected MTProto account. It:

1. Extracts sender ID from the raw Telegram event
2. Looks up the owner's `ProviderConnection` to get their `providerChatId`
3. Creates a `Message` document
4. Calls `broadcastMessage()` to push to frontend via Socket.IO
   Pay attention to how it handles the case where the sender has an active link with the account owner — it tries to decrypt the message if a shared key exists.

**Pass 3 — auth flow (the phone number → code → session sequence):**

- `startPhoneAuth(accountId, phoneNumber)` — creates a TelegramClient, calls `sendCode()`, stores `phoneCodeHash` in `pendingAuth`
- `completePhoneAuth(accountId, code)` — retrieves pending auth, calls `signIn()`, exports session string, saves to `TelegramSession` in DB
- Why `phoneCodeHash`? Telegram requires you to echo it back when confirming the code — it ties the confirmation to the original request.

**Pass 4 — session restore on startup:**

- `loadAllMTProtoSessions()` — called from `server.ts` bootstrap
- Reads all `TelegramSession` documents from DB
- Reconstructs each `TelegramClient` from the saved session string
- Calls `subscribeToMessages()` for each — so messages arrive even after a server restart

### Key question:

What happens to messages sent to a connected Telegram account while the server is down? (Answer: they queue in Telegram's servers. When `loadAllMTProtoSessions()` runs on restart, the clients reconnect and receive missed messages.)

---

## Module 7 — Socket.IO Realtime (Day 5, ~4h)

**Server side: `services/realtime.service.ts` (35 lines)**  
Two things: attach to HTTP server, broadcast to all connected clients.  
No rooms. No socket-level auth. All logged-in browser tabs receive all messages — the frontend filters by account.

**Client side: `hooks/useRealtime.ts` (34 lines)**  
Flutter analogy: a `StreamSubscription` that you `.cancel()` in `dispose()`.

- `useEffect` with empty deps `[]` = runs once on mount = connect
- return value of `useEffect` = cleanup function = disconnect on unmount

**Polling fallback in `App.tsx`:**  
Find `pollingRef`. When the socket emits `disconnect`, a `setInterval` starts polling `GET /api/messages` every 10 seconds. When socket reconnects, the interval clears.

**Key question:** Why does `broadcastMessage` send to ALL clients rather than only the recipient? What are the security implications? (Discussion: acceptable for a demo/private deployment, not acceptable for a multi-tenant production app.)

---

## Module 8 — Media Uploads (Day 6, ~4h)

**`services/media.service.ts` (70 lines) — two upload paths:**

| Path                 | Content-Type          | Use case                              |
| -------------------- | --------------------- | ------------------------------------- |
| Formidable multipart | `multipart/form-data` | Browser `<input type="file">`         |
| Base64 JSON          | `application/json`    | Programmatic uploads, mobile fallback |

Both paths call the Cloudinary SDK with a buffer and return a URL.

**`routes/uploads.route.ts` (8 lines):**  
`POST /api/uploads/multipart` → Formidable parse → Cloudinary  
`POST /api/uploads/base64` → base64 decode → buffer → Cloudinary

**Refactor opportunity to look for:** Is error handling consistent between the two paths? Does one path swallow errors the other surfaces?

---

## Module 9 — Link/Pairing System (Day 6, ~4h)

The most user-facing complex feature: two users pairing to establish an encrypted channel.

**Backend:**

- `models/link.ts` — document: `{ creatorId, claimerId, creatorPubKey, claimerPubKey, code, status }`
- `routes/link.route.ts` — create link (generates short code), claim link (other user redeems it), check status

**Frontend:**

- `hooks/useLink.ts` (199 lines) — treat this as a state machine. States: `idle → generating → pending → claimed → active`. Map each state to a UI screen in `LinkWizard.tsx`.
- `components/LinkWizard.tsx` (146 lines) — renders different UI per state
- `components/FindContact.tsx` (137 lines) — alternative path: find by username instead of QR

**The crypto connection:**  
When a link is claimed, both users' public keys are in the `link` document. The frontend uses these to derive the shared AES key via ECDH (Module 5). From that point, messages between these two users are encrypted with that derived key.

**Key question:** What prevents a third user from claiming a link code that was meant for someone else? (Look at the `status` field and how `claimLink()` transitions it.)

---

## Module 11 — Real-World Debugging Session (2026-06-15)

This module covers four bugs found and fixed in a live debugging session. Read each one as a case study: what the symptom was, where the bug lived, and what pattern it reveals.

---

### Bug 1 — Telegram session not logging out server-side on disconnect

**Symptom:** After disconnecting a Telegram account from the app and trying to reconnect, the verification code never arrived on the device.

**Root cause:** `disconnectMTProtoSession()` called `client.disconnect()` (closes the TCP connection locally) but never called `api.auth.LogOut()` on Telegram's servers. Telegram still considered the old session alive. When `sendCode()` was called for the same number, Telegram routed the code to that still-alive backend session as an in-app message — not SMS, and not visible to the user.

**Fix:** Call `client.invoke(new Api.auth.LogOut({}))` before `client.disconnect()`, and clear `sessionString` in the DB on disconnect.

**Pattern:** Closing a connection locally is not the same as closing it remotely. Any protocol that tracks sessions server-side (Telegram MTProto, OAuth, WebSockets with server-side state) requires an explicit logout/deregister step or the server-side state persists indefinitely.

**Diagnostic added:** `sendCode()` response has a `type` field — `auth.SentCodeTypeApp` vs `auth.SentCodeTypeSms` — that tells you exactly how Telegram delivered the code. Now logged on every `requestPhoneCode` call.

---

### Bug 2 — Multi-device E2E decryption failing (different keypairs per browser)

**Symptom:** Encrypted messages showed as ciphertext on one device while decrypting fine on another. Settings showed different fingerprints on mobile vs desktop for the same account.

**Root cause:** Private keys were generated in the browser and stored in `localStorage` only. Each browser/device has isolated localStorage. On first login from a new device, `autoSetupKey` found no key in localStorage, generated a fresh keypair, and registered the new public key — overwriting the old one in the DB. Messages encrypted with the old public key became permanently unreadable on the new device, and vice versa.

**Fix:** Server-side key storage with PBKDF2-based encryption. The private key never leaves the browser unencrypted. Full flow:

1. **Key generation (first login on any device):** generate ECDH P-256 keypair → PBKDF2-derive a wrapping key from the user's login password (310,000 iterations, SHA-256, random 16-byte salt) → AES-GCM encrypt the private key JWK → store encrypted blob on server alongside the public key
2. **Key restore (subsequent login on any device):** fetch encrypted blob → PBKDF2-derive same wrapping key from login password + stored salt → AES-GCM decrypt → same private key on every device
3. **Logout:** clears `crypt:priv:{email}` and `crypt:pub:{email}` from localStorage so the restore path runs on next login

**Security property:** The server holds `AES-GCM(PBKDF2(password, salt, 310k), privateKeyJwk)`. A DB dump without the user's password is useless.

**Files changed:**

- `backend/src/models/key.ts` — added `privateKeyJwk: Mixed` field
- `backend/src/schemas/keys.ts` — added optional `privateKeyJwk: string` to register schema
- `backend/src/controllers/keys.ts` — added `getMyPrivateKey` endpoint; stale-blob protection in `registerKey` (clears blob when public key changes without a new blob, preventing key mismatch)
- `backend/src/routes/keys.route.ts` — added `GET /keys/me/private` (authenticated)
- `frontendReactJs/src/services/keys.ts` — added `encryptPrivateKey`, `decryptPrivateKey`, `fetchAndDecryptPrivateKey` using Web Crypto PBKDF2
- `frontendReactJs/src/context/auth-context.ts` — added `consumePassword()` to context type
- `frontendReactJs/src/context/AuthProvider.tsx` — stashes login password in a `useRef` immediately after successful auth; `consumePassword()` reads and clears it (one-time use)
- `frontendReactJs/src/App.tsx` — rewrote `autoSetupKey`: localStorage → server decrypt → generate new

**Pattern:** Password threading across async React state boundaries. The password is only available in the login form at the moment of submission. It needs to reach a `useEffect` that fires later (after `meRequest` completes and sets the user). The solution: store it in a `useRef` in AuthProvider immediately after `loginRequest()` resolves, expose a one-shot `consumePassword()` on the context, call it at the top of the key-setup effect. Refs survive across renders and React Strict Mode remounts without triggering re-renders.

---

### Bug 3 — React Strict Mode race condition generating competing keypairs

**Symptom:** After implementing server-side key sync, keys still differed between devices on every test cycle. The server never retained a working encrypted blob.

**Root cause:** React 18 Strict Mode double-invokes effects to detect side effects. Both invocations of `autoSetupKey` ran concurrently as async functions:

- **1st run:** `consumePassword()` → gets password → network fetch → (awaiting) → generates key K1 → uploads encrypted K1
- **2nd run:** starts immediately, `consumePassword()` → null (consumed) → no localStorage yet (1st run's async subtlecrypto not done) → falls through to generate key K2 → uploads K2 without an encrypted blob

If the 2nd run's upload completed last, the server ended up with K2's public key and no blob. Every subsequent login fell through to generate yet another fresh key.

**Fix:** Two-part guard:

1. `keySetupInProgress = useRef(false)` — checked at the start of `autoSetupKey`, set to true, cleared in `finally`. The synchronous guard check means the 2nd Strict Mode invocation hits `true` and returns immediately before doing anything.
2. Early exit when no localStorage key AND no password — this covers the same case with an explicit intent: if we can't decrypt the server blob and can't encrypt a new one, there's nothing useful to do.

**Pattern:** Strict Mode is a development-only feature but it actively reveals bugs in effects with external side effects (network writes, localStorage). The fix pattern for any async effect that must not run concurrently is a `useRef` guard (not `useState` — state changes trigger re-renders; refs don't).

---

### Key questions for this module:

1. Why does Telegram route login codes to existing active sessions instead of always sending SMS?
2. What is the difference between `client.disconnect()` and `api.auth.LogOut()` in a stateful protocol?
3. Why is PBKDF2 used here instead of just AES-encrypting the private key directly with the password?
4. What does `consumePassword()` return if called twice? Why is that the right behaviour?
5. Why is `useRef` correct for the concurrency guard but `useState` would be wrong?
6. What happens to the server's encrypted blob if the user clicks "Generate New Keypair" mid-session (without a password available)? What does the backend do with it and why?

---

## Module 12 — WhatsApp Business API Integration (2026-06-15)

A full implementation session: wiring the WhatsApp Cloud API into a working provider. Every change was motivated by a real test failure or constraint. Read as a case study in integrating a third-party messaging API.

---

### Platform architecture lesson: WhatsApp Business API ≠ Telegram

|                         | Telegram (Bot API)          | Telegram (MTProto) | WhatsApp Business API   |
| ----------------------- | --------------------------- | ------------------ | ----------------------- |
| Messages from           | Bot account                 | User's own account | Business phone number   |
| Peer-to-peer possible?  | No                          | Yes                | **Never**               |
| Who owns the session    | Telegram's servers          | Your backend       | Meta's servers          |
| Send to arbitrary users | Only if they messaged first | Yes                | Only opted-in customers |

**Key constraint:** Every WhatsApp message in and out flows through the business number. There is no way via the Cloud API to make a message appear from another user's phone. Telegram's MTProto path is architecturally special — WhatsApp has no equivalent.

**Consequence for Crypt:** WhatsApp works as a _delivery pipe_, not a direct channel. Crypt is the actual conversation layer. The fan-out message system (already in `messages.ts`) handles this correctly — both accounts see the conversation in Crypt regardless of what WhatsApp delivers.

---

### Meta developer setup (what each credential is)

| Env var                    | Where it comes from                                | What it does                                           |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta for Developers → WhatsApp → API Setup         | Identifies which phone number your API calls send from |
| `WHATSAPP_NUMBER`          | Same page, the phone number itself                 | Used to generate WhatsApp deep links (`wa.me/...`)     |
| `WHATSAPP_ACCESS_TOKEN`    | Business Portfolio → System Users → Generate Token | Bearer token for all Cloud API calls                   |
| `WHATSAPP_APP_SECRET`      | Meta for Developers → App Settings → Basic         | Used to verify webhook HMAC signatures                 |
| `WHATSAPP_VERIFY_TOKEN`    | You invent it                                      | Echo'd back during webhook verification handshake      |

**System User token vs temporary token:** The temporary token on the API Setup page expires every 24h. System User tokens are permanent. For dev/testing the temporary token is fine; production requires a System User.

**Test recipients:** Meta's test number can only send to explicitly approved phone numbers. Add both test phones in the API Setup "To" dropdown. This limit lifts once the app is published.

---

### Bug 1 — Webhook returning 404 during verification

**Symptom:** Meta's webhook verification hit the callback URL and got 404. Ngrok was running.

**Root cause:** Wrong path. The project mounts providers routes at `/api/providers/...`, not `/api/whatsapp/...`. The actual route is `GET /api/providers/whatsapp/webhook`.

**Diagnosis method:** Read ngrok's HTTP log — it showed `GET /api/whatsapp/webhook 404`. Then `grep` the route files for the actual path.

**Pattern:** Always verify the exact mount path in `server.ts` (`app.use("/api", providersRouter)`) + the route definition (`providersRouter.get("/providers/whatsapp/webhook", ...)`) before configuring external webhooks.

---

### Bug 2 — ProviderConnection storing the business number as the user's display name

**Symptom:** After linking, the Crypt conversation list showed `15556569889` (the Meta business number) as the contact name instead of the other user's name.

**Root cause:** In the LINK handler in `providers.ts`, `providerDisplayName` was set to `change.value.metadata?.display_phone_number` — which is the _business number_, not the sender's name. It was then stored as `displayName` in `ProviderConnection`.

**WhatsApp webhook payload structure:**

```
change.value.metadata.display_phone_number  → business number ("15556569889")
change.value.contacts[].profile.name        → sender's WhatsApp display name ("Grace")
change.value.contacts[].wa_id               → sender's phone number ("4915200000000")
msg.from                                    → sender's phone number
```

**Fix:**

1. Added `contacts` field to `whatsappInboundSchema`
2. Resolved `senderDisplayName = contactEntry?.profile?.name ?? senderPhone`
3. Added `ProviderConnection.updateOne(...)` on every inbound message — self-healing, no migration needed
4. Updated the LINK handler to use `senderDisplayName`

**Existing stale data:** Restarting the backend doesn't fix already-stored wrong values. Fix triggers on the next inbound message from that phone. Sending any message from WhatsApp to the bot corrects it immediately.

---

### Bug 3 — Regex crash when searching by phone number

**Symptom:** `Invalid regular expression: /^+4915200000000$/i: Nothing to repeat`

**Root cause:** `rawUsername` was interpolated directly into `new RegExp('^' + rawUsername + '$')`. The `+` in `+4915200000000` is a regex quantifier — "one or more of nothing" — which is invalid syntax.

**Fix:** Escape the input before using it in a regex:

```ts
const escaped = rawUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const usernameRegex = new RegExp(`^${escaped}$`, "i");
```

**Pattern:** Never interpolate user input directly into `new RegExp()`. Always escape first. This is also a ReDoS vector if the input is long and crafted.

---

### What was built (new files and changes)

**New files:**

- `frontend/src/components/ConnectWhatsApp.tsx` — self-contained link-code flow for WhatsApp, mirrors `ConnectTelegram.tsx`. Uses `useLink` hook internally. Generates a code, shows deep links to open WhatsApp with code pre-filled.

**Modified files:**

- `backend/src/schemas/providers.ts` — added `contacts[].profile.name` and `contacts[].wa_id` to `whatsappInboundSchema`
- `backend/src/controllers/providers.ts` — fixed display name resolution; added `ProviderConnection` self-heal on every inbound message; added confirmation reply after LINK code processed; imported `sendToProvider`
- `backend/src/controllers/messages.ts` — added sender prefix `[Name]: message` for plain WhatsApp outbound messages
- `backend/src/controllers/providerConnections.ts` — fixed regex injection; added `providerChatId` to WhatsApp search (phone number lookup)
- `frontend/src/components/FindContact.tsx` — added provider toggle (Telegram/WhatsApp) directly in the Find tab; fixed placeholder text
- `frontend/src/components/index.ts` — exported `ConnectWhatsApp`
- `frontend/src/pages/SettingsPage.tsx` — added "Connect WhatsApp" section

---

### Key questions for this module

1. Why can't WhatsApp messages appear as coming from another user's phone number, while Telegram MTProto can send messages that appear from a user's own account?
2. What does `change.value.metadata.display_phone_number` actually contain, and why was it the wrong field to use for the user's display name?
3. Why does the `ProviderConnection.updateOne` self-heal approach work without a database migration? What's the trade-off?
4. What's the difference between escaping a string for use in `new RegExp()` vs escaping it for use in a SQL query? (Same class of bug — injection — different context.)
5. Why is the sender prefix only added to plain text messages, not encrypted ones?

---

## Module 13 — Production Deployment Debugging (2026-06-15)

A live debugging session: deploying to Render for the first time and systematically resolving five distinct failure modes. Each failure is a real category of production bug, not a one-off mistake.

---

### Failure 1 — `npm ci` rejected: lock file out of sync

**Symptom:** Render's build failed immediately: `lock file's formidable@3.5.4 does not satisfy formidable@3.5.2`.

**Root cause:** `package.json` pinned `formidable@3.5.2` but the committed `package-lock.json` had `3.5.4` — generated at some point when an unpinned install ran locally.

**Fix:** `npm install` in `backend/` to regenerate the lock file, then commit it.

**Pattern:** `npm ci` is strict by design — it refuses to install if `package.json` and the lock file disagree. This is the right behaviour for production (reproducible builds), but it means the lock file must be committed and kept in sync. Any time you change a dependency version, regenerate and commit the lock file.

---

### Failure 2 — `@esbuild` Linux binaries missing from frontend lock file

**Symptom:** Same `npm ci` rejection, but only listing `@esbuild/linux-x64@0.28.0`, `@esbuild/linux-arm@0.28.0`, etc. — all Linux/Windows platform packages missing.

**Root cause (layered):**

1. Render defaults to Node 24, which ships with **npm 11**. The lock file was generated with npm 10 (Node 22). npm 11 changed how it validates optional platform-specific packages in `npm ci` — the v3 lock file format generated by npm 10 is not accepted by npm 11 for optional deps.
2. A deeper conflict: `vitest@1.0.0` (in devDeps) has a dependency chain that resolves esbuild to `0.21.x`, conflicting with `vite@8`'s requirement for `^0.28.x`. Without forcing the right version, the regenerated lock file had the wrong esbuild.

**Fix (two parts):**

1. Add `frontendReactJs/.node-version` containing `22` — Render reads this and uses Node 22/npm 10 for that service, matching local dev.
2. Add `"overrides": { "esbuild": "0.28.0" }` to `frontendReactJs/package.json` and `legacy-peer-deps=true` in `frontendReactJs/.npmrc` to force correct resolution despite the vitest conflict.

**Pattern:** Lock files are platform-specific in how optional packages are recorded. When your CI/CD platform uses a different Node/npm version than local dev, generated lock files may diverge. Pinning the Node version (`.node-version`, `.nvmrc`, `engines` in `package.json`) is the definitive fix — it makes the lock file generation environment identical to the deployment environment.

---

### Failure 3 — TypeScript build failing: `@types/express` not found

**Symptom:** Build passed `npm ci` but `tsc` failed with `Could not find a declaration file for module 'express'` across every controller and middleware file.

**Root cause:** `NODE_ENV=production` was set as a Render environment variable. npm treats this as `--omit=dev`, so `npm ci` skipped all `devDependencies` — including `@types/express`, `@types/cors`, and `typescript` itself. TypeScript type declarations are dev-only packages; they're not needed at runtime but ARE needed at build time.

**Fix:** Change the Render build command from `npm ci && npm run build` to `npm ci --include=dev && npm run build`. The `--include=dev` flag overrides `NODE_ENV=production` specifically for this install step.

**Pattern:** `NODE_ENV=production` has a side effect beyond runtime behaviour — it makes npm omit devDependencies. Build steps need devDependencies (TypeScript, type declarations, test runners, bundlers). Runtime steps don't. The fix is to be explicit in the build command rather than relying on defaults.

**Secondary lesson:** These TypeScript errors were invisible in local dev because `npm run dev` uses `tsx watch` — which transpiles without type-checking. `tsc` (the build script) does full type checking. Always run `npm run build` locally before pushing, not just `npm run dev`.

---

### Failure 4 — Two real TypeScript errors surfaced by the build

Once types were installed, `tsc` found two bugs:

**Bug A — `providers.ts`: missing `chatId` in `sendToProvider` call**

```
Argument of type '{ provider: "whatsapp"; to: string; text: string; attachments: never[]; }'
is not assignable to parameter of type 'SendPayload'. Property 'chatId' is missing.
```

A `sendToProvider` call in the WhatsApp link-confirmation logic was missing the required `chatId` field. For WhatsApp, `chatId` is the sender's phone number — same value as `to`.

**Bug B — `telegram-mtproto.service.ts`: two type mismatches with gramjs**

1. `randomId: BigInt(...)` — native `bigint` primitive vs gramjs's `BigInteger` type (from `big-integer` package). Fix: cast to `any`.
2. `new Api.auth.LogOut({})` — gramjs constructor takes no arguments, but `{}` (empty object) was passed. Fix: `new Api.auth.LogOut()`.

**Pattern:** TypeScript's value is catching this class of bug before it reaches production. Neither of these would have caused an immediate crash but both indicate incorrect assumptions about the API. Run `tsc` in CI (or at minimum locally before every push) — `tsx` is for developer speed, not correctness verification.

---

### Failure 5 — Runtime crash: `#services/telegram-mtproto.service.js` not defined

**Symptom:** Build succeeded, deployment crashed immediately on startup:

```
TypeError [ERR_PACKAGE_IMPORT_NOT_DEFINED]: Package import specifier
"#services/telegram-mtproto.service.js" is not defined in package.json
```

**Root cause:** Node.js's `imports` field in `package.json` is a strict mapping. The project defines:

```json
"#services": { "default": "./dist/services/index.js" }
```

This maps `#services` → the index file. It does NOT automatically map `#services/realtime.service.js` or any other subpath. Deep imports like `import { initRealtime } from "#services/realtime.service.js"` are undefined and fail at runtime.

Why did this work in development? `tsx` resolves `#` imports by reading the `imports` field but is more lenient with subpaths, falling back to filesystem resolution. Node.js in production is strict.

**Files with deep imports:**

- `server.ts` imported `{ initRealtime }` from `#services/realtime.service.js` and `{ loadAllMTProtoSessions }` from `#services/telegram-mtproto.service.js`
- `controllers/messages.ts` imported `{ hasActiveClient, sendViaMTProto }` from `#services/telegram-mtproto.service.js`

**Fix:** All of these are already re-exported from `services/index.ts`. Change deep imports to use the mapped alias: `import { initRealtime, loadAllMTProtoSessions } from "#services"`.

**Pattern:** Package `imports` subpath aliases (`#db`, `#services`, `#models`, etc.) only resolve what's explicitly mapped. The index file IS the contract. Every symbol consumed from a `#`-aliased package must flow through that package's index — the index is the public API of the module group. Never import directly from a subpath of a `#` alias unless you've added a wildcard pattern to the `imports` field.

---

### Key questions for this module

1. Why does `npm ci` reject a lock file that satisfies the semantic version range in `package.json` (e.g. lock has `3.5.4`, package.json says `3.5.2`)? What is `npm ci` actually checking?
2. What is the difference between running `npm install` and `npm ci`? When would you use each in a CI/CD pipeline?
3. `NODE_ENV=production` affects both npm and your application code. Name two things it changes in each context.
4. Why does `tsx` allow deep `#services/foo.js` imports in development while Node.js rejects them in production? What does this tell you about relying on dev tooling behaviour as a correctness signal?
5. You have a TypeScript error that only appears during `tsc` but not during `tsx watch`. What's the fastest way to add `tsc` checking to your local workflow without slowing down every save?

---

## Module 14 — Frontend Deployment: Native Binary Platform Packages (2026-06-15)

A specific class of deployment failure that affects any project using Vite 8 (or any tool built on native Rust packages). Understanding this pattern means you will recognise and fix it in under 5 minutes next time.

---

### The pattern: native binaries in npm packages

Some npm packages are not pure JavaScript — they contain compiled native code (`.node` files) that must be built for each OS and CPU architecture. They ship these as separate optional npm packages, one per platform:

```
lightningcss                        (the JS wrapper)
├── lightningcss-darwin-arm64       (macOS Apple Silicon binary)
├── lightningcss-darwin-x64         (macOS Intel binary)
├── lightningcss-linux-x64-gnu      (Linux x64, glibc — what Render runs)
├── lightningcss-linux-x64-musl     (Linux x64, musl — what Alpine/Docker runs)
└── ...
```

At install time, npm only downloads the binary for the current platform. On macOS (your machine), it installs `lightningcss-darwin-arm64` and records only that in `package-lock.json`. On Linux (Render), npm CI reads the lock file and finds `lightningcss-linux-x64-gnu` missing — because it was never in the file.

**The error signature:**

```
Error: Cannot find module '../lightningcss.linux-x64-gnu.node'
```

or

```
Cannot find module '@rolldown/binding-linux-x64-gnu'
```

Pattern: `Cannot find module` + a filename ending in `.node` or containing a platform string (`linux-x64`, `linux-arm64`, etc.).

---

### Vite 8 has three of these packages

| Package        | Role                      | Symptom when Linux binary missing                         |
| -------------- | ------------------------- | --------------------------------------------------------- |
| `esbuild`      | JS/TS transpiler          | `Missing: @esbuild/linux-x64@0.28.0 from lock file`       |
| `rolldown`     | Bundler (replaced rollup) | `Cannot find module '@rolldown/binding-linux-x64-gnu'`    |
| `lightningcss` | CSS minifier              | `Cannot find module '../lightningcss.linux-x64-gnu.node'` |

Each surfaced as a separate deployment failure because each had to be fixed independently.

---

### Why the fixes differed per package

**esbuild** — fixed via `overrides`:

```json
"overrides": { "esbuild": "0.28.0" }
```

This worked because `vitest@1.0.0` was pulling in esbuild@0.21.x (a version conflict). The override forced a fresh resolution at 0.28.0, and npm included all platform binaries in the lock file during that fresh resolution.

**rolldown and lightningcss** — required explicit `optionalDependencies`:

```json
"optionalDependencies": {
  "@rolldown/binding-linux-x64-gnu": "1.0.0",
  "@rolldown/binding-linux-x64-musl": "1.0.0",
  "lightningcss-linux-x64-gnu": "1.32.0",
  "lightningcss-linux-x64-musl": "1.32.0"
}
```

There was no version conflict to force re-resolution — the packages were already at the right version. Adding them to `optionalDependencies` explicitly forces npm to resolve and lock them even on macOS.

**Why both gnu AND musl?**

- `gnu` = standard Linux (Ubuntu, Debian, Render's environment)
- `musl` = Alpine Linux, used in many Docker images

Adding both means the project builds in either environment without further lock file issues.

---

### How to diagnose this class of error in future

1. Build fails with `Cannot find module` + a `.node` file or platform string
2. Identify which npm package owns that binary (the path in the error shows the package)
3. Check that package's `optionalDependencies` in its own `package.json`:
   ```bash
   cat node_modules/<package>/package.json | grep -A 20 '"optionalDependencies"'
   ```
4. Add the `linux-x64-gnu` and `linux-x64-musl` variants to your project's `optionalDependencies` at the matching version
5. Delete `package-lock.json`, run `npm install`, commit the new lock file
6. Run `npm run build` locally to confirm before pushing

---

### Why `-gnu` and not `-musl` in `gnu` suffix?

Linux has two main C standard library implementations:

- **glibc** (GNU C Library) — used in Ubuntu, Debian, RHEL, Render's Ubuntu-based instances
- **musl** — used in Alpine Linux (common in Docker `node:alpine` images), smaller and more security-focused

Binaries compiled against glibc do NOT run on musl and vice versa. npm knows which you need at install time via the current platform's libc, but since you're installing on macOS, it can't auto-detect either.

---

### Key questions for this module

1. What does `.node` at the end of a filename tell you about what kind of file it is?
2. You add a new npm package to a project and it works locally on macOS but crashes on your Linux CI with a `Cannot find module` error containing a platform string. What are the first two things you check?
3. Why does `npm ci` reject a lock file that's missing optional packages, even if "optional" implies they shouldn't be required?
4. What's the difference between `optionalDependencies` and `devDependencies`? Can a package be both?
5. You're deploying to an Alpine-based Docker image and get `Cannot find module '...musl.node'`. Why does adding the `-gnu` binary alone not fix it?

---

## Module 15 — Production Deployment to Render.com (2026-06-15)

This module is in two parts. Part A is the clean deployment guide — what to do on a fresh project with no errors, step by step. Part B covers what actually happened during deployment and the production bugs found and fixed afterwards.

---

### Part A — Clean Deployment Guide (Render.com, no Blueprint)

#### What Render needs to know about each service

Render has two service types relevant here:

| Type        | Used for          | What Render does                            |
| ----------- | ----------------- | ------------------------------------------- |
| Web Service | Backend (Express) | Runs a Node process, assigns a port         |
| Static Site | Frontend (Vite)   | Runs a build command, serves `dist/` as CDN |

No Blueprint required. Both are created manually through the Render dashboard.

---

#### Code modifications required before first deployment

These are the changes that MUST exist in the codebase before Render can build and run the app. Make them all before creating any Render services.

**1. Pin Node version in both services**

Create `backend/.node-version` containing `22`.
Create `frontendReactJs/.node-version` containing `22`.

Why: Render defaults to Node 24 (npm 11). The project was developed with Node 22 (npm 10). Lock file format differs between npm versions — npm 11 rejects lock files generated by npm 10 for optional native packages.

**2. Frontend: force Linux native binaries into the lock file**

In `frontendReactJs/package.json`, add:

```json
"overrides": { "esbuild": "0.28.0" },
"optionalDependencies": {
  "@rolldown/binding-linux-x64-gnu": "1.0.0",
  "@rolldown/binding-linux-x64-musl": "1.0.0",
  "lightningcss-linux-x64-gnu": "1.32.0",
  "lightningcss-linux-x64-musl": "1.32.0"
}
```

Create `frontendReactJs/.npmrc` containing `legacy-peer-deps=true`.

Why: Vite 8 uses three Rust-native packages (esbuild, rolldown, lightningcss). macOS installs only darwin binaries; Render runs on Linux and needs the linux-x64 variants. These must be explicitly listed so npm resolves and locks them even on macOS. See Module 14 for the full explanation.

**3. Frontend: SPA routing fallback**

Create `frontendReactJs/public/_redirects` containing `/* /index.html 200`.

Why: Render serves a static site from CDN. React Router is client-side only. Any URL the user navigates to directly (or refreshes) must return `index.html` — otherwise Render returns a 404 for any path that isn't a real file.

**4. Frontend: Socket.IO must connect to the backend URL, not a relative path**

In `frontendReactJs/src/hooks/useRealtime.ts`, `io()` must use `io(apiBase)` where `apiBase` is pulled from `VITE_API_BASE_URL`.

Why: `io()` with no argument connects to the same origin as the page. In production the frontend is on a different domain from the backend — relative connection is impossible.

**5. Frontend: all API calls must use the configured base URL**

Any raw `fetch('/api/...')` call must be replaced with `apiFetch('/...')`. The `apiFetch` wrapper in `lib/api.ts` prepends `apiBase`.

Why: Same reason as above — different domains in production.

**6. Backend: build stage must include devDependencies**

In the Render build command (or Dockerfile build stage), use `npm ci --include=dev && npm run build`, NOT `npm ci` alone.

Why: `NODE_ENV=production` (set as a Render env var) tells npm to omit devDependencies. TypeScript, `@types/*` packages, and `tsx` are all devDependencies — the build step needs them. The `--include=dev` flag overrides the NODE_ENV behavior for this step only.

**7. Backend: no deep `#services/...` imports**

All imports using package-local aliases must go through the index file:

```ts
// Wrong (works in tsx dev, crashes in production Node.js):
import { initRealtime } from "#services/realtime.service.js";

// Right:
import { initRealtime } from "#services";
```

Why: Node.js's `imports` field in `package.json` is strict. It only resolves what's explicitly mapped. `tsx` is more lenient and falls back to filesystem resolution — this masks the error in development.

**8. Backend: CORS must parse a comma-separated origin list**

The `CORS_ORIGIN` env var may contain multiple origins (e.g. for local + production). Socket.IO's `origin` option requires either a string or an array — not a comma-separated string.

Wrap the value: `parseOrigins(raw)` splits on commas, returns a string if there's one origin and an array if there are multiple.

**9. Frontend: TypeScript 6.0 `Uint8Array` is now generic**

`Uint8Array` → `Uint8Array<ArrayBuffer>` in any function signature that passes it to Web Crypto API (`crypto.subtle.*`). TypeScript 6 changed Uint8Array to be generic; Web Crypto requires the specific `ArrayBuffer` variant.

---

#### Render backend (Web Service) — setup

1. Dashboard → New → Web Service → Connect GitHub repo
2. Root directory: `backend`
3. Build command: `npm ci --include=dev && npm run build`
4. Start command: `npm start`
5. Environment variables:

| Variable                   | Where to get it                                           |
| -------------------------- | --------------------------------------------------------- |
| `MONGODB_URI`              | MongoDB Atlas → Connect → Drivers                         |
| `JWT_SECRET`               | `openssl rand -hex 32`                                    |
| `CORS_ORIGIN`              | Your frontend Render URL (set after frontend is deployed) |
| `TELEGRAM_BOT_TOKEN`       | @BotFather                                                |
| `TELEGRAM_WEBHOOK_SECRET`  | Any string you invent                                     |
| `TELEGRAM_API_ID`          | my.telegram.org → API Development Tools                   |
| `TELEGRAM_API_HASH`        | Same page                                                 |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta → WhatsApp → API Setup                               |
| `WHATSAPP_NUMBER`          | Same page                                                 |
| `WHATSAPP_ACCESS_TOKEN`    | Meta → Business Portfolio → System Users                  |
| `WHATSAPP_APP_SECRET`      | Meta → App Settings → Basic                               |
| `WHATSAPP_VERIFY_TOKEN`    | Any string you invent                                     |
| `CLOUDINARY_URL`           | Cloudinary dashboard → API Keys                           |
| `NODE_ENV`                 | `production`                                              |

---

#### Render frontend (Static Site) — setup

1. Dashboard → New → Static Site → Connect GitHub repo
2. Root directory: `frontendReactJs`
3. Build command: `npm ci --legacy-peer-deps && npm run build`
4. Publish directory: `dist`
5. Environment variable: `VITE_API_BASE_URL` = your backend Render URL (e.g. `https://crypt-backend-s14y.onrender.com/api`)

---

#### Post-deployment checklist (do these after both services are live)

1. **Set Telegram webhook to the production URL:**

   ```bash
   curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
     -d "url=https://<backend-url>/api/providers/telegram/webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```

   Confirm response: `{"ok":true,"result":true}`.

2. **Update Meta WhatsApp webhook:**
   In Meta for Developers → WhatsApp → Configuration, set:
   - Callback URL: `https://<backend-url>/api/providers/whatsapp/webhook`
   - Verify token: value of `WHATSAPP_VERIFY_TOKEN`

3. **Set `CORS_ORIGIN` on backend** to the frontend Render URL, then redeploy the backend.

4. **Health check:** `curl https://<backend-url>/api/health` — should return `{"ok":true,"service":"crypt-backend"}`.

---

### Part B — Production Bugs Found After Deployment (2026-06-15)

---

#### Bug 1 — Telegram inbound messages not appearing in the web app

**Symptom:** Messages sent from Crypt reached external Telegram users (via CryptBot). Their replies never appeared in the Crypt web app.

**Root cause:** The MTProto send path had an overly strict condition:

```ts
if (
  payload.provider === "telegram" &&
  hasActiveClient(accountId) &&
  recipientAccountId &&        // ← requires recipient to be a Crypt user
  hasActiveClient(recipientAccountId)  // ← requires recipient to also have MTProto
)
```

Because external Telegram users have no `ProviderConnection` in the DB, `recipientAccountId` was always undefined → condition never true → bot was used for every send. When the external user replied to the bot, the webhook had no `ProviderConnection` mapped to their Telegram ID → `accountId` was undefined → message saved with no `accountId` → invisible to every user.

**Fix:** Remove the recipient requirements. If the sender has an active MTProto session, always send directly via Telegram:

```ts
if (payload.provider === "telegram" && hasActiveClient(accountId))
```

Replies from external users now come back directly to the sender's Telegram account via MTProto, where `subscribeToMessages` correctly saves them with the sender's `accountId`.

For the edge case where the recipient IS a Crypt user but without their own MTProto session, a fan-out `inboundCopy` is created for them after the MTProto send (`else if (recipientAccountId && !hasActiveClient(recipientAccountId))`).

**File:** `backend/src/controllers/messages.ts`

---

#### Bug 2 — "Open WhatsApp app" button did nothing on Android

**Symptom:** The deep link button (`window.location.href = whatsapp://...`) had no effect on Android. "Open WhatsApp web" (`window.open(wa.me/...)`, `_blank`) correctly opened the WhatsApp app.

**Root cause:** Android browsers restrict `whatsapp://` URI scheme deep links when the page is served from a web app context. No crash, no error — the browser silently ignores the navigation.

**Fix:** Removed the "Open WhatsApp app" button entirely. Renamed "Open WhatsApp web" to "Open WhatsApp". The web link (`wa.me/...`) opens WhatsApp on both platforms — redirects to the app on iPhone automatically.

**File:** `frontendReactJs/src/components/ConnectWhatsApp.tsx`

---

#### Bug 3 — `isCodeViaApp: true` interpreted as error

**Symptom:** Telegram code never received. Logs showed `[MTProto] isCodeViaApp: true`.

**Root cause:** Not a bug. `isCodeViaApp: true` is Telegram's standard behavior when the account has an active Telegram app installed — Telegram sends the code as an in-app message (a message from the official "Telegram" account in your chat list) instead of SMS.

**Resolution:** Look for the code in the Telegram app chat list, in the message from the "Telegram" account. Clear stale `telegramsessions` documents in MongoDB if old sessions are preventing fresh auth codes.

---

#### Observation — Port 10000 in Render logs

`==> Detected service running on port 10000` is a **success message**, not an error. Render auto-assigns port 10000 (via the `PORT` env var) and this line confirms the backend bound to it correctly. The app is running.

---

#### Code cleanup done in this session

| File                                                 | Change                                                                                                                                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontendReactJs/src/components/KeyManager.tsx`      | Removed QR code display and `qrDataUrl` prop — redundant since key handshake is backend-mediated                                                                                                            |
| `frontendReactJs/src/pages/SettingsPage.tsx`         | Removed `qrDataUrl` prop (cascading from KeyManager)                                                                                                                                                        |
| `frontendReactJs/src/App.tsx`                        | Removed `qrDataUrl` state, `setQrDataUrl` calls, prop passing                                                                                                                                               |
| `frontendReactJs/src/components/ConnectWhatsApp.tsx` | Removed "Open WhatsApp app" button; kept and renamed "Open WhatsApp web"                                                                                                                                    |
| `frontendReactJs/src/components/OnboardingModal.tsx` | Full rewrite: added WhatsApp step, updated Telegram step to mention in-app code, updated key sync step to mention password-based cross-device restore, updated Find to mention WhatsApp phone number search |
| `backend/src/controllers/messages.ts`                | MTProto condition fix (see Bug 1 above)                                                                                                                                                                     |

---

### Key questions for this module

1. Why does `npm ci` fail when `package-lock.json` was generated on a different npm major version? What specifically changes between npm 10 and npm 11?
2. You deploy a Vite SPA to a static host. The home page loads but navigating directly to `/settings` returns 404. What file do you add and what does it contain?
3. The backend has `NODE_ENV=production` set as an env var. The build command is `npm ci && npm run build`. What goes wrong and why? What's the fix?
4. Explain why `io()` works in local development but must be changed to `io(apiBase)` in production.
5. A Telegram auth code has `isCodeViaApp: true` in the logs. What does this mean, and where should the user look for the code?
6. After the MTProto send fix, what happens when User A (with MTProto) sends to User B (also on Crypt, but without MTProto)? Trace the full path including the fan-out.

---

## Module 16 — Telegram Linking: Debugging + Multi-Mode Connection UI (2026-06-15)

A full investigation session: the phone code linking stopped working during a live demo and resisted several fix attempts. Documents the root cause, what was ruled out, what was built as a result, and the architectural constraint that makes single-device MTProto auth from a server hard.

---

### Part A — Data Architecture (pre-session question)

Before debugging began, two architectural questions were answered by reading the code:

**Does deleting a chat delete from the DB or just the UI?**
`deleteConversation` (`controllers/messages.ts`) runs `Message.deleteMany({ accountId, provider, chatId })` — permanent DB delete. The `ProviderConnection` record for that contact is NOT removed, only the messages.

**Does nuking an account delete everything?**
`nukeAccount` (`controllers/auth.ts`) deletes in order: `Message`, `ProviderConnection`, `TelegramSession`, `Link` (claimed), `Key` (by email), and finally the `Account` document itself. One gap: anonymous contact `ProviderConnection` records (`accountId: null`) created by the inbound webhook upsert are not cleaned up — they have no owner to key the delete on.

---

### Part B — Root Cause Investigation

**Timeline of what happened:**

| Date | Event |
|------|-------|
| Before Friday | MTProto phone code linking working (backend on localhost, Cloudflare tunnel for HTTP) |
| Friday demo | Multiple link/unlink cycles during live testing |
| Friday onwards | Phone code sent successfully (`phoneCodeHash` returned, `isCodeViaApp: true`) but code never arrives in Telegram app |
| Session | New `api_id`/`api_hash` — same result. Deployed to Render — same result. |

**What was ruled out (in order):**

1. **Wrong phone number format** — tried with and without `+` prefix. No change.
2. **FLOOD_WAIT on `api_id`** — new credentials from second Telegram account. No change.
3. **Datacenter IP (Render)** — broken since Friday when still on localhost via Cloudflare tunnel. IP is irrelevant.
4. **Multiple active sessions** — Telegram Devices screen showed only one: Samsung Galaxy A14, online. Nowhere else for the code to go.

**Actual root cause:**
Telegram applies a **per-phone-number silent suppression** after too many auth attempts in a short window. `sendCode` returns `phoneCodeHash` successfully — Telegram accepts the API call — but silently does not deliver the code to the device. No error is returned. This was triggered by the Friday demo's repeated link/unlink/re-link cycles. The restriction is time-based (days to weeks) and is confirmed by:
- New `api_id` not helping (restriction on number, not app credentials)
- Telegram Web's phone login still working (Telegram Web has a trusted `api_id` that bypasses the restriction)
- `isCodeViaApp: true` means Telegram acknowledged the request; the suppression is asynchronous delivery-side

**Clarification on Cloudflare tunnel vs Workers:**
`cloudflared tunnel --url http://localhost:...` is NOT Cloudflare Workers. The tunnel only forwards incoming HTTP traffic to localhost. The backend code runs locally, so MTProto TCP connections to Telegram come from the local machine's residential IP. This is why it worked before — and why the IP was never the problem.

---

### Part C — QR Code Login Implementation

**Why QR login bypasses the problem:**
`signInUserWithQrCode` uses `auth.exportLoginToken` instead of `auth.sendCode`. No code is pushed to any device. Telegram generates a token; the user's own Telegram app accepts it by calling `auth.acceptLoginToken`. The silent suppression only affects `sendCode` delivery.

**Backend additions (`telegram-mtproto.service.ts`):**

```
pendingQr: Map<accountId, PendingQr>  // tracks QR session state per user
```

| Function | What it does |
|----------|-------------|
| `startQrLogin(accountId)` | Creates a gramjs client, calls `signInUserWithQrCode` in a background async task, stores current token in `pendingQr`. The `qrCode` callback fires every ~20s with a refreshed token. |
| `getQrLoginStatus(accountId)` | Returns `{ token, step, error }` for frontend polling. `step` is `qr \| 2fa \| done \| error`. |
| `resolveQr2fa(accountId, password)` | Resolves the deferred Promise the `password` callback is waiting on, unblocking the auth flow. |
| `disconnectMTProtoSession(accountId)` | Calls `api.auth.LogOut()` on Telegram's servers before disconnecting the client locally, then clears `sessionString` in the DB. See Module 11 Bug 1 for why server-side logout is required. |

On successful scan: same session-save + `ProviderConnection` upsert + key mirror as the phone flow. Phone number obtained from `client.getMe().phone` (no user input needed).

**New routes:**
- `POST /telegram/direct/request-qr` — starts the background session
- `GET /telegram/direct/qr-status` — polling endpoint (called every 4s by frontend)
- `POST /telegram/direct/qr-2fa` — submits 2FA password when step becomes `"2fa"`

**2FA handling:** The `password` callback in gramjs returns a Promise. When 2FA is required, `step` is set to `"2fa"` and a resolver function is stored. When the frontend posts the password, `resolveQr2fa` resolves that Promise, unblocking the auth flow. This is a deferred Promise pattern — the HTTP request lifecycle and the gramjs callback lifecycle are decoupled.

---

### Part D — What Didn't Work: The Deep Link Attempt

A `tg://login?token=<base64url>` deep link was added as a button so mobile users could complete QR auth on the same device. The deep link URL is exactly what QR codes encode — the hypothesis was that tapping it in the browser would open Telegram and trigger `auth.acceptLoginToken`.

**Results from real device testing:**
- **Android:** Nothing happened. The `tg://` URI scheme is either not handled or Telegram opens without navigating anywhere useful.
- **iPhone:** Telegram opened and showed: *"This code can be used to allow someone to log in to your Telegram account. To confirm Telegram login, please go to Settings → Devices → Link Desktop Device and scan the code."* — Telegram recognizes the token but routes it as a security notification, not an auto-accept. The user is redirected to the QR scanner, which requires a second device to have something to scan.

**Conclusion:** Telegram apps on both platforms do not implement `auth.acceptLoginToken` via `tg://` deep link. The QR scanning UX (point camera at code) is the only path that auto-accepts. The deep link button was removed and replaced with a clear instruction that a second device is required.

**Pattern:** Library/API documentation describes what the protocol supports. App implementations decide what user-facing gesture triggers it. These are not the same thing.

---

### Part E — Final UI: Three-Mode `ConnectTelegram` Component

`ConnectTelegram.tsx` was refactored to expose three tabs:

| Tab | How it works | Message routing | Reliability |
|-----|-------------|-----------------|-------------|
| Phone code | `sendCode` → code in Telegram app → `signIn` → MTProto session | User-to-user direct | Blocked by per-number suppression currently |
| QR code | `signInUserWithQrCode` → scan with second device | User-to-user direct | Works, requires second device |
| Via CryptBot | `useLink` hook → generate LINK code → send to @CryptBot | Through bot | Always works |

**Implementation note for bot tab:** Uses the existing `useLink` hook (same as `ConnectWhatsApp`). On mount, `useLink` restores any pending link from `sessionStorage` — the `useEffect(() => { if (linkCode) setMode("bot"); }, [linkCode])` guard switches the active tab back to bot mode automatically if a pending link is recovered after page reload.

**Settings descriptor:** Added above the component in `SettingsPage.tsx` explaining all three methods and their trade-offs in plain language.

**Onboarding step 2:** Updated to describe all three methods with explicit priority order: phone code → QR (second device needed) → CryptBot (always works).

---

### Key questions for this module

1. `sendCode` returns `phoneCodeHash` with no error. The code never arrives. What are the two ways Telegram can silently accept an API call without delivering the result?
2. Why does using a new `api_id`/`api_hash` not fix a per-number suppression, but DOES fix a per-`api_id` FLOOD_WAIT?
3. The QR `password` callback returns a `Promise<string>`. The HTTP request that provides the password is a completely separate network call. How does `resolveQr2fa` connect these two — what pattern is this?
4. Why is `useRef` used for the QR poll interval (`qrPollRef`) rather than storing the interval ID in state?
5. A user starts the QR flow, closes the browser, reopens the app. Does the pending bot link survive? Does the QR session survive? Why the difference?
6. The nuke operation deletes `ProviderConnection` by `accountId`. Anonymous contact records have `accountId: null`. What query would you add to also clean those up for a given user's linked phone numbers?

---

## Module 17 — Message Delivery Debugging: Ghost Connections + Mobile Reconnect (2026-06-15)

A production debugging session with direct MongoDB access. Two scenarios were broken; both were traced to the database layer before any code was read. Documents how to diagnose message delivery failures from the data backwards.

---

### The two broken scenarios

| Scenario | Setup | Symptom |
|----------|-------|---------|
| 1 | A (deep-link/CryptBot) ↔ B (CryptBot) | Messages go to CryptBot in both directions, never appear in Crypt for either party |
| 2 | A (deep-link/CryptBot) ↔ B (QR) | A→B works; B→A arrives in Telegram app but never shows in Crypt |

---

### Root cause 1 — Ghost ProviderConnections

**What they are:** When old test accounts were deleted, their `ProviderConnection` documents were not cleaned up. Those documents had `active: true` and pointed to accountIds that no longer exist in the `accounts` collection. Two ghosts existed:
- `providerChatId: 1000235704` → `accountId: 6a270254...` (deleted)
- `providerChatId: 8976479213` → `accountId: 6a2701c4...` (deleted)

**Why they caused failures:**

The fan-out query in `messages.ts`:
```typescript
ProviderConnection.findOne({ provider, providerChatId: payload.chatId, active: true })
```
Already filtered `active: true` — but both the ghost AND the real connection were `active: true`. MongoDB returns the document with the smaller `_id` (insertion order) first. The ghosts were created earlier, so they always won. Fan-out copies landed on accountIds that no real user owns: the messages were in the DB but invisible to everyone.

The bot webhook in `providers.ts` had an even weaker query — no `active: true` filter — making it easier for the ghost to win.

**How it was diagnosed:** Querying the `providerconnections` collection directly and cross-referencing `accountId` values against the `accounts` collection. The ghost accountIds simply didn't appear there.

**The fix:**

*DB:* Deactivated both ghost ProviderConnections in Atlas directly (no deploy needed, takes effect immediately for the live backend).

*Code:* After `ProviderConnection.findOne(...)`, verify the returned `accountId` actually exists in `Account`:
```typescript
const accountExists = await Account.exists({ _id: recipientConn.accountId });
if (accountExists) recipientAccountId = recipientConn.accountId.toString();
```
Added in both `messages.ts` (fan-out path) and `providers.ts` (webhook inbound path). Prevents any future ghost from intercepting messages.

**Files:** `backend/src/controllers/messages.ts`, `backend/src/controllers/providers.ts`

---

### Root cause 2 — Missing ProviderConnection for B

B (test@test.com) had completed three CryptBot link flows, all of which logged `completed: true` in the `links` collection. But the `ProviderConnection` that should have been created by each link was missing.

Likely cause: transient backend error during connection creation, swallowed by the existing `try/catch` around `ProviderConnection.create()` in the link handler. The link itself was marked complete but the connection was never persisted.

**Fix:** Created the missing connection directly in Atlas. The code path that creates it during the link flow was not changed — it already uses the correct accountId. The lesson here is that try/catch around DB writes without any alerting means silent partial failures. The link is "done" from the code's perspective but the side effect was lost.

---

### Root cause 3 — `hasActiveClient` checking map presence, not TCP state

`hasActiveClient(accountId)` originally checked `clients.has(accountId)`. gramjs keeps the client object in the map even after the TCP connection to Telegram drops (network interruption, Render sleep cycle). So `hasActiveClient` returned `true` for a disconnected client, which suppressed the fan-out copy, and the recipient's MTProto subscription (which was dead) never received the message either.

**Fix:**
```typescript
export function hasActiveClient(accountId: string): boolean {
  const client = clients.get(accountId);
  return client !== undefined && (client.connected ?? false);
}
```
`client.connected` is a live property on the gramjs `TelegramClient` instance. A map entry is not the same as a live connection. This directly fixed Scenario 2 B→A.

**File:** `backend/src/services/telegram-mtproto.service.ts`

---

### Root cause 4 — Mobile backgrounding kills Socket.IO; polling disabled on reconnect

When a user switches from Crypt to the Telegram app on mobile, the browser backgrounds the tab and drops the Socket.IO WebSocket connection. On return, Socket.IO reconnects and `isRealtime` flips back to `true` — but the old code stopped polling as soon as `isRealtime` was true. Any Socket.IO broadcasts that fired during the background gap were missed permanently.

**Two fixes in `App.tsx`:**

1. **Reconnect flush:** A `prevIsRealtime` ref detects the `false → true` transition and immediately calls `loadConversations` + `loadMessages` to pull any messages that arrived during the gap.

```typescript
const prevIsRealtime = useRef(false);
useEffect(() => {
  if (isRealtime && !prevIsRealtime.current) {
    void loadConversations(provider);
    if (selectedChatId) void loadMessages(provider, selectedChatId);
  }
  prevIsRealtime.current = isRealtime;
}, [isRealtime, provider, selectedChatId, loadConversations, loadMessages]);
```

2. **Always-on polling:** Removed the `if (isRealtime) return;` early exit. Polling now runs at 30 s when Socket.IO is connected (safety net) and 10 s when it is not.

**File:** `frontendReactJs/src/App.tsx`

---

### Additional fixes in the same session

**`getKey` fallback via ProviderConnection chain** (`controllers/keys.ts`):
When a message is being decrypted and the key lookup for a `providerChatId` (Telegram user ID) returns nothing, the handler now falls back: `ProviderConnection.findOne({ providerChatId })` → `Account.findById(conn.accountId)` → `Key.findOne({ ownerId: account.email })`. Then mirrors the found key back to the `providerChatId` for fast future lookups. Fixes decryption failures for users whose key was registered before their Telegram linking was set up.

**CryptBot echo filter** (`telegram-mtproto.service.ts`):
```typescript
const BOT_USER_ID = env.TELEGRAM_BOT_TOKEN?.split(":")[0] ?? "";
if (BOT_USER_ID && fromId === BOT_USER_ID) return;
```
When A has an active MTProto connection and receives a message delivered via CryptBot, the bot's own message was creating a spurious conversation with `chatId = bot's user ID`. The bot token always starts with `<userId>:`, so the ID is extractable without any API call.

**`sendViaMTProto` username fallback** (`telegram-mtproto.service.ts`):
`getInputEntity(recipientId)` requires the entity to already be in gramjs's local cache. For freshly connected clients (QR login), the cache is empty. If the first attempt fails, the code now looks up the recipient's `@username` in `ProviderConnection` and retries with `getInputEntity("@username")`.

**`displayName` fallback order** (`startQrLogin` in `telegram-mtproto.service.ts`):
Changed from `username || userId || phoneNumber` to `username || phoneNumber || userId`. A numeric Telegram user ID is the least human-readable fallback — a phone number is better.

---

### Debugging methodology used in this session

1. Connected to the live Atlas cluster directly via `mongosh`.
2. Queried `accounts`, `providerconnections`, `telegramsessions` and manually cross-referenced IDs.
3. Queried `messages` filtered by each real `accountId` to confirm which messages were visible to which users vs which went to ghosts.
4. Identified missing connections by checking `links` (all completed) vs `providerconnections` (no result for B).

**Pattern:** When messages are "in Telegram but not in Crypt," the first question is: do the DB records exist? If yes, what `accountId` do they carry? If that `accountId` doesn't match any real account, the fan-out is writing to a ghost.

**Security note:** DB credentials must never appear in shell output. Use env substitution (`$MONGODB_URI`) or a connection script rather than embedding the URI inline in a command.

---

### Key questions for this module

1. The fan-out query already had `active: true`. Why did ghost connections still win? What query change alone would not have been enough without the DB cleanup?
2. `client.connected` returns `boolean | undefined` on gramjs's type. Why was `client.connected ?? false` the correct fix rather than `!!client.connected` or `Boolean(client.connected)`?
3. A user switches to another app for 3 minutes, then returns to Crypt. With the fixes in place, describe exactly what happens in the first 2 seconds after the tab is foregrounded.
4. Why does the CryptBot filter use `env.TELEGRAM_BOT_TOKEN?.split(":")[0]` rather than making an API call to get the bot's user ID?
5. The `getKey` fallback does an on-the-fly mirror write. What are the implications if two requests race through this path simultaneously for the same `ownerId`? Is `findOneAndUpdate` with `upsert: true` safe here?
6. B linked via CryptBot three times. Each link completed (`completed: true` in the `links` collection). The `ProviderConnection` was never created. The error was swallowed. What would you add to the link handler to make this class of failure visible?

---

## Module 18 — ngrok & Local Webhook Tunneling (2026-06-16)

### What ngrok actually is

A reverse-proxy tunnel: it opens an outbound connection from your laptop to ngrok's servers, which then hands you a public HTTPS URL (`https://abc123.ngrok.io`) that forwards any incoming request straight to a port on `localhost`. Your code never changes — it still just listens on `localhost:4000`.

### Why this project ever needed it

Telegram (Bot API) and Meta (WhatsApp Cloud API) deliver events via **webhooks** — they make an outbound HTTP request to a URL you register. That URL must be public HTTPS. During local development your backend only exists at `localhost:4000`, which Telegram's and Meta's servers cannot reach. ngrok bridges exactly that gap: it makes a local server temporarily look like a deployed one.

Documented dev workflow (`docs/MAINTAINER_GUIDE.md`):

```bash
ngrok http 4000
# note the https URL returned, e.g. https://abc123.ngrok.io
npm run set-webhook -- --url https://abc123.ngrok.io/api/providers/telegram/webhook
```

Same URL also went into Meta's webhook Callback URL field during development.

### Current implementation in deployed production: none

```bash
grep -rn "ngrok" --include="*.ts" --include="*.json" .   # zero hits outside markdown docs
```

ngrok appears in exactly three files — `docs/MAINTAINER_GUIDE.md`, `docs/HANDOFF.md`, `PROJECT_ROADMAP.md` — all describing the *local* setup. It is not a dependency, not imported anywhere, not referenced in any deploy config. Render assigns the backend a real, permanent public HTTPS URL the moment it deploys. Per Module 15, both the Telegram webhook and the Meta webhook callback are pointed directly at that Render URL — no tunnel of any kind sits in between in production.

### The same role, played by a different tool, at a different phase

Module 16 Part B already covered this once from the other direction: a Cloudflare tunnel (`cloudflared tunnel --url http://localhost:...`) was used at one point instead of ngrok. Both tools solve the identical problem — "give my local server a public HTTPS face" — and neither one runs your code remotely; the backend logic always executes on whichever machine `localhost` refers to. The moment a *real* deployment exists (Render), the deployed host's own URL takes over that role permanently and the tunnel becomes irrelevant.

### Key architectural insight

ngrok's only job is to simulate "production reachability" without actually deploying. It's a development-loop accelerator, not infrastructure — nothing in the running app depends on it existing, which is why deleting it from your workflow entirely after deploying changes nothing.

### Key questions for this module

1. Why must a webhook URL be public HTTPS, while your own frontend calling your own backend during dev does not need to be?
2. What is the actual difference between "ngrok forwards to localhost" and "the backend code runs on Render's servers"? Where does the code execute in each case?
3. If you deleted every ngrok reference from the docs today, would anything in production behave differently? Why or why not?
4. Module 16 mentioned a Cloudflare tunnel was in use "before Friday." Why didn't switching to Render's datacenter IP matter for the per-phone-number suppression bug, but it would have mattered if the original bug had been an IP-based block?

---

## Module 19 — CORS (2026-06-16)

### What CORS actually is

A restriction enforced by the **browser**, not the server. Same-Origin Policy says JavaScript running on origin A cannot read a response from origin B unless B's server explicitly says "this origin may read my response" via CORS response headers. Origin = scheme + host + port — `https://crypt.onrender.com` and `https://crypt-backend.onrender.com` are different origins even though both are "yours."

**Flutter contrast (useful grounding):** there is no CORS in a Flutter mobile app making HTTP requests — Same-Origin Policy is a browser-only concept. This is the first place in the stack where "because it's a website" actually changes the architecture.

### Why this project needs it at all

Frontend and backend are always on different origins:

| Environment | Frontend origin | Backend origin |
|---|---|---|
| Local dev | `http://localhost:5173` | `http://localhost:4000` |
| Production | `https://<frontend>.onrender.com` | `https://<backend>.onrender.com` |

Without CORS headers from the backend, every `fetch()` call from the frontend would be silently blocked by the browser after the response arrives (the request still hits the server — CORS doesn't stop that — but the browser refuses to hand the response back to your JS).

### Two separate CORS configs in this codebase — and they're not quite the same

**1. REST API — `backend/src/server.ts:29-35`**

```ts
app.use(
  cors({
    origin: parseOrigins(env.CORS_ORIGIN),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
```

**2. Socket.IO — `backend/src/services/realtime.service.ts:13-19`**

```ts
io = new Server(server, {
  cors: {
    origin: parseOrigins(corsOrigin),
    methods: ["GET", "POST"],
  },
});
```

**Key question before reading further:** why does Socket.IO need its *own* `cors` block at all, when Express already has one mounted on the same `app`?
**Answer:** the WebSocket upgrade handshake is a distinct HTTP exchange that bypasses Express's middleware stack entirely (recall Module 2: `initRealtime` attaches directly to the raw `http.Server`, not to `app`). Express's `cors` middleware never sees that request, so Socket.IO has to enforce its own origin check independently.

### Spot the difference — two near-identical helper functions

```ts
// server.ts
const parseOrigins = (raw?: string) => {
  if (!raw) return undefined;
  if (raw.trim() === "*") return "*";
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
};

// realtime.service.ts
const parseOrigins = (raw: string) => {
  if (raw.trim() === "*") return "*";
  const origins = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return origins.length === 1 ? origins[0] : origins;
};
```

Both exist to solve Module 15's Failure 8: `CORS_ORIGIN` may hold a comma-separated list (local + production origins together), but the `cors` and `socket.io` libraries each expect either a single string or an array — never a raw comma-separated string. So both functions split on commas. The difference: `realtime.service.ts`'s version collapses a single-entry array back down to a plain string; `server.ts`'s version always returns an array once there's at least one entry. Functionally this rarely matters (both libraries accept either shape for a single origin), but it's duplicated logic with a silent inconsistency — a clean refactor target: extract one shared `parseOrigins` util and import it in both places.

### The preflight request

For any "non-simple" request (anything with a JSON body, or a custom header like `Authorization`), the browser first sends an `OPTIONS` request asking permission *before* sending the real one. The server must answer with matching `Access-Control-Allow-Methods` / `Access-Control-Allow-Headers`. This is why `methods` and `allowedHeaders` are explicit allowlists here — `Authorization` had to be added by hand because the JWT bearer token rides in that header on every authenticated call; without it in `allowedHeaders`, the preflight would reject any request carrying a token.

### Why production CORS broke before (Module 15 cross-reference)

`CORS_ORIGIN` defaults to `http://localhost:5173` (`backend/src/config/env.ts`). The post-deployment checklist in Module 15 explicitly requires setting it to the *exact* frontend Render URL and redeploying the backend — a mismatch here is invisible in server logs (the request succeeds; the browser just refuses to expose the response), which makes it a confusing first production bug to diagnose.

### Wildcard `origin: "*"`

Both `parseOrigins` implementations special-case `"*"` — any origin allowed. This project's auth is Bearer-JWT-in-header, not cookies, so a wildcard origin is less dangerous here than it would be for a cookie-based session (cookies ride along automatically with cross-origin requests; a manually-attached `Authorization` header does not). Still broad — it would let any website's JS make authenticated calls if it could obtain a token some other way.

### Key questions for this module

1. Why does a CORS failure show as a successful network request in the Network tab, but a hard error in the console?
2. Why does Socket.IO need a second `cors` config instead of inheriting Express's?
3. What would `parseOrigins` need to do differently if `CORS_ORIGIN` were empty in production? (Trace through both implementations.)
4. Why is `Authorization` in `allowedHeaders` but not in `methods`? What's the difference between the two lists?
5. If this app used cookie-based sessions instead of JWT, why would `origin: "*"` become a much more serious vulnerability?

---

## Module 20 — Docker: What It's For, and Is It Actually Needed Here? (2026-06-16)

### What Docker actually is

A way to package an application together with everything below it — runtime, OS libraries, filesystem — minus the kernel, into a portable image that runs identically on any machine with a Docker engine. The promise is "works on my machine" becomes "works on every machine," because the container brings its own machine with it.

### What exists in this repo

Exactly one Dockerfile, backend only — `backend/Dockerfile`:

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npm ci
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "dist/server.js"]
```

**Multi-stage build, read top to bottom:**

1. **`build` stage** — installs *all* deps (including devDependencies — `tsc`, `@types/*`), compiles TypeScript to `dist/`.
2. **`runtime` stage** — starts fresh from a clean `node:20-slim`, installs only production deps (`--omit=dev`), then copies *just the compiled output* (`COPY --from=build /app/dist ./dist`) from the first stage. The TypeScript source, dev tooling, and build-time-only packages never make it into the final image.

**Why two stages instead of one:** the final image is smaller and has a reduced attack surface — no compiler, no type definitions, no source code sitting in the production container.

There is no frontend Dockerfile, and there doesn't need to be — the frontend builds to static HTML/JS/CSS (`dist/`), which a static host serves directly. There's no Node runtime to containerize on that side.

### Where Docker is actually invoked in this project

One place: `docs/DEPLOYMENT.md`, a manual local workflow —

```bash
cd backend
docker build -t crypt-backend:latest .
docker run -p 4000:4000 -e MONGODB_URI="..." ... crypt-backend:latest
```

This is for testing the backend in an isolated container on your own machine. Nothing else in the repo runs `docker build` or `docker run` — no CI step, no deploy script.

### Is it used in the actual deployed production path? No.

Cross-reference Module 15's real Render setup:

> Dashboard → New → **Web Service** → Build command: `npm ci --include=dev && npm run build` → Start command: `npm start`

That's Render's native Node buildpack — it clones the repo, runs your build command directly on Render's own managed Linux image, and starts your process with your start command. It never reads, builds, or runs `backend/Dockerfile`. (Render *does* support a Docker-based service type, which would use the Dockerfile automatically — but this project's service was set up as the Node-native type.)

This also explains why Modules 13-14 are full of npm-buildpack-specific headaches — `.node-version` pinning, `optionalDependencies` for Linux-native binaries, the `npm ci` vs lock-file-version fight. **None of those problems exist inside a Docker build.** Docker pins the OS and Node version explicitly in the `FROM` line; you control the base image yourself, so there's no "Render decided to use Node 24" surprise. That entire category of production bug only happened *because* Docker wasn't the deploy path.

### Verdict: not needed for this project, as currently deployed

You could delete `backend/Dockerfile` today and the live Render deployment would be unaffected — nothing reads it. It is not dead code in the sense of being unreachable; it's an unused alternate path that happens to still work if invoked manually.

**Where it would start to matter:**

- Migrating off Render to a host that requires a container image (Fly.io, AWS ECS/Fargate, Cloud Run, a self-managed VM).
- Wanting guaranteed build-environment parity locally — building inside the `node:20-slim` container sidesteps the macOS-vs-Linux native-binary problem from Module 14 entirely, since the container always builds on Linux.
- Adding a second co-located process (a worker, a queue consumer) where `docker-compose` would let you start everything with one command.

**One documentation inconsistency worth flagging (not fixed here, just noted):** `docs/DEPLOYMENT.md` lists "Backend (Docker)" as the *first* section, ahead of "Render / Static deploy" — easy for a future reader to assume Docker is the canonical production path when it's actually unused there. Worth reordering or annotating next time that file is touched.

### Key questions for this module

1. Why does the Dockerfile install `devDependencies` in the `build` stage but `--omit=dev` in the `runtime` stage? What would break if you skipped the multi-stage split and just did everything in one stage?
2. Module 13's Failure 3 (`@types/express` missing because `NODE_ENV=production` made npm skip devDependencies) — would that bug have been possible inside this Dockerfile? Why or why not?
3. Why doesn't the frontend need a Dockerfile even though the backend does?
4. If you switched Render's backend service from "Web Service (Node)" to "Web Service (Docker)" tomorrow, which of Modules 13 and 14's bugs would simply stop being possible, and which would still apply?
5. Is there any harm in leaving an unused Dockerfile in the repo? Is there harm in deleting it?

---

## Module 21 — Security & Redundancy Hardening Session (2026-06-16)

A full audit-and-fix session: security audit, dead-code audit, scalability writeup, and a spec-accuracy check, followed by implementing the specific fixes approved. Full detail (every file touched, restoration notes) lives in `AUDIT_CHANGELOG.md` — this module covers the *why* and the judgment calls, in the same case-study format as Modules 11-17.

---

### Part A — What the audit found

Two parallel research agents covered security and dead code; direct verification covered scalability and `CRYPT_SPECS.md` drift. Headline findings:

- **Critical:** `GET /provider/resolve` had no auth and leaked a user's email given just their Telegram/WhatsApp chat ID. **Zero rate limiting existed anywhere in the app.**
- **High:** no login lockout; file uploads had no size/type validation.
- **Dead code:** an orphaned 335-line component (`TelegramDirectSetup.tsx`), two near-identical `parseOrigins` functions, a display-name-joining snippet duplicated across 4 call sites (not 3 — more on that below), two backend functions with zero callers, one write-only schema field.
- **Spec drift:** `CRYPT_SPECS.md` was written before WhatsApp shipped and before the server-side key backup shipped — it described both as not-yet-built. Stack versions were wrong across the board (Express 4→5, Mongoose 8→9, React 18→19, Vite 5→8, TypeScript 5→6).

---

### Part B — Why "the obvious fix" wasn't always the right one

This is the part worth studying closely — several fixes that looked simple on paper had a real workflow risk hiding underneath.

**1. Adding `authenticate` to a route isn't free if the frontend doesn't send a token.**
`FindContact.tsx` called `apiFetch(path)` with no third argument. `apiFetch`'s signature is `(path, options, token?)` — it only attaches `Authorization` if you explicitly pass a token. The Find page is rendered inside `ProtectedLayout`, so it *looked* authenticated, but the actual HTTP call carried no proof of that. Gating the route server-side without fixing the frontend call would have broken Find immediately on deploy. **Pattern:** "this component only renders when logged in" and "this component's network calls are authenticated" are two different claims — verify the second one by reading the actual fetch call, not by checking where the component sits in the tree.

**2. Dead code that touches encryption needs a higher bar of proof than a single grep.**
The redundancy audit flagged `encryptText`/`decryptMarkedText` (in `backend/src/services/crypto.service.ts`) as unused. Given "the whole point of this app is encryption," that claim got re-verified by enumerating *every* import statement that pulls from the services barrel across the entire backend (9 sites, listed explicitly) rather than trusting one grep for the literal function name — aliased imports (`import { encryptText as foo }`) would dodge a plain-name search. The re-check confirmed it: these two functions were built for a documented-but-never-wired-up "encrypt provider credentials at rest" feature, completely separate from the real E2E message encryption in `frontendReactJs/src/lib/crypto.ts`. Even with that confirmed, the decision was to leave them in place — zero cost to keeping unused code, and this corner of the codebase is exactly where you don't want to be wrong.

**3. "Write-only" doesn't mean "safe to delete" if real data already depends on the shape staying consistent.**
`Message.providerMessageId` is written in 4 places and read in zero. Normally that's a clean removal. But removing a Mongoose schema field doesn't delete the field from already-stored MongoDB documents — it just stops the app from reading/writing it. Since live test-user data already exists, the field was left in place rather than removed, even though "currently unread" was independently confirmed. The lesson isn't "schema field removal is dangerous" (it isn't — Mongoose schemas aren't migrations), it's that *unread* and *irrelevant* aren't the same thing once real data exists.

**4. Validation can't apply uniformly when one data path is ciphertext.**
The new upload MIME allow-list could not simply apply to "all uploads" — encrypted attachments are sent as `resourceType: "raw"` and are genuinely indistinguishable from random bytes; you cannot MIME-sniff ciphertext. Before writing the validation, the actual call graph in `frontendReactJs/src/services/messages.ts` was traced end-to-end: the encrypted path always goes through `/uploads/formidable` with `resourceType: "raw"` and *never* falls back to `/uploads/base64`; the plain path never sets `resourceType` at all. That trace is what made it possible to write a validation rule that's airtight by construction (`resourceType !== "raw"` skips the check entirely) rather than "probably fine."

**5. A security default that's correct in general can be wrong for one specific user.**
The standard advice for login lockout is ~5 attempts. That number assumes a typical single-device user. This account is actively tested across 2 phones and 2 laptops (per ongoing project notes) — a tight lockout threshold would lock out *legitimate* multi-device testing before it ever stopped an attacker. Settled on 8 attempts / 15-minute lockout, and the same reasoning applied to the rate-limit threshold on `/auth/login` (20 req/15min, more generous than a typical API default).

---

### Part C — The "3 sites" that turned out to be 4

The plan going in said the display-name-joining duplication existed at 3 call sites. While implementing it, a 4th turned up: `telegram-mtproto.service.ts`'s phone-auth flow (`completePhoneAuth`) has its *own* `ProviderConnection` auto-create block with the identical join fragment, separate from the QR-login one. It wasn't found during the planning phase because the original grep for the duplicated fragment was run before the QR-login fallback-order context made it obvious there'd be a sibling code path for the other login method. **Pattern:** when you find N copies of duplicated logic via search, treat N as a lower bound until you've checked every code path that does the same *job*, not just every literal string match.

---

### Key questions for this module

1. Why does checking "is this component inside `ProtectedLayout`" not prove its network calls are authenticated? What's the actual mechanism that would prove it?
2. Why was a single `grep -rn "encryptText"` not sufficient evidence to call a function dead code, even though it happened to be correct in this case?
3. Mongoose schema field removal vs. data deletion — what's actually true about existing MongoDB documents when you delete a field from a model file?
4. Why can't the upload MIME allow-list apply to `resourceType: "raw"` uploads? What would happen if you tried to MIME-sniff an AES-GCM ciphertext blob?
5. The standard advice for login lockout thresholds assumes something about the user's device habits. What does it assume, and why did that assumption not hold here?
6. When a duplicate-logic search finds 3 matches, why might there be a 4th one that the search missed? What kind of search would have caught it the first time?

---

## Module 10 — UI Rework + Refinement (Days 7-8, ~16h)

**Context:** Project deadline is 2026-06-24. This module replaces rebuild exercises in the pre-deadline phase. Goal: make the UI polished enough to submit.

### Before touching any component, do a full UI audit:

Run the app. Go through every screen. For each one, note:

1. Anything that looks unfinished or inconsistent
2. Any user flow that requires more than 2 clicks for a common action
3. Any loading/error state that shows nothing or crashes
4. Mobile layout issues (this is a mobile-first app)

### Areas most likely to need work (based on codebase patterns):

- `OnboardingModal.tsx` — first-run experience, often rushed in development
- `LinkWizard.tsx` — multi-step flow, high chance of edge case gaps
- `ChatView.tsx` — the core loop; check scroll-to-bottom behavior, optimistic updates
- `SettingsPage.tsx` — key management UI, often dense and unclear
- `FindPage.tsx` — discovery flow, check empty states

### Refactor pass for each component:

1. Read the component
2. Identify: unused props, duplicated JSX, hardcoded strings that should be constants, missing loading/error states
3. Check: does the component do one thing? If it's doing 3 things, it should be 3 components.
4. Run and visually verify after each change

### Session format for UI work:

> "Module 10, reviewing [ComponentName]. Here's what I see: [your notes]. What am I missing?"

Claude will read the component with you and add observations.

---

## How to Use This Plan with Claude

Start each session:

> "Continue lesson plan, module [N]."

**Interactive format:**

1. Claude opens the file and gives a 3-sentence orientation
2. Claude asks "what do you think this does?" before explaining
3. You answer, ask questions, or say "I don't know"
4. At end of section: small exercise or key question
5. You answer before Claude confirms

**If stuck:** "Explain in Flutter terms" / "show me the simplest version" / "what breaks if this is removed?"

---

## Flutter → Web Analogies

| Flutter                        | This codebase                            |
| ------------------------------ | ---------------------------------------- |
| `StatefulWidget` + `setState`  | `useState`                               |
| `Provider` / `Riverpod`        | React Context + `AuthProvider`           |
| `FutureBuilder`                | `useEffect` + loading state              |
| `StreamBuilder`                | `useRealtime` + Socket.IO                |
| `Navigator.pushNamed`          | page state in `App.tsx`                  |
| `shared_preferences`           | `localStorage`                           |
| `dio` / `http`                 | `fetch()` inside `apiCall()`             |
| `StreamController`             | Socket.IO `EventEmitter`                 |
| Dart `class` with typed fields | TypeScript `interface` / Mongoose schema |
| `pubspec.yaml`                 | `package.json`                           |

---

## Session Progress Tracker

```
MODULE STATUS:
[x] Module 1 - TypeScript (known)
[x] Module 2 (routes/models known) — [x] services completed 2026-06-11
[x] Module 3 (entry/auth/pages known) — [x] hooks + API layer completed 2026-06-11
[x] Module 4 - Auth (known)
[x] Module 5 - Cryptography — completed 2026-06-11
[ ] Module 6 - Telegram MTProto
[ ] Module 7 - Socket.IO realtime
[ ] Module 8 - Media uploads
[ ] Module 9 - Link/pairing system
[ ] Module 10 - UI rework (pre-deadline)
[x*] Module 11 - Real-world debugging session — executed 2026-06-15, CORE REVIEW PENDING
[x*] Module 12 - WhatsApp Business API integration — executed 2026-06-15, CORE REVIEW PENDING
[x*] Module 13 - Production deployment debugging — executed 2026-06-15, SKIM PENDING
[x*] Module 14 - Frontend deployment: native binary platform packages — executed 2026-06-15, SKIM PENDING
[x*] Module 15 - Production deployment guide + post-deployment bugs — executed 2026-06-15, SKIM PENDING
[x*] Module 16 - Telegram linking debugging + multi-mode connection UI — executed 2026-06-15, CORE REVIEW PENDING
[x*] Module 17 - Message delivery debugging: ghost connections + mobile reconnect — executed 2026-06-15, CORE REVIEW PENDING
[x*] Module 18 - ngrok & local webhook tunneling — executed 2026-06-16, SKIM PENDING
[x*] Module 19 - CORS deep dive — executed 2026-06-16, SKIM PENDING (mostly historical, see Module 21 fix)
[x*] Module 20 - Docker & containerization (is it needed?) — executed 2026-06-16, SKIM PENDING
[x*] Module 21 - Security & redundancy hardening session — executed 2026-06-16, CORE REVIEW PENDING

[x*] = work was done by Claude under Grace's supervision and documented, but NOT yet reviewed/understood by Grace. Do not treat as taught until the review pass happens.
[ ] Rebuild exercises (post-deadline, see REBUILD_EXERCISES.md)
```

## Session Notes

### Module 5 — 2026-06-11

**Corrections given:**

- **ECDH decryption misunderstood:** Described recipient as "dividing" to reverse the shared key. Correction: recipient independently runs ECDH from their own side (`recipientPrivate × senderPublic`) and arrives at the identical shared key. No reversal — independent derivation. Neither side "undoes" anything.
- **IV unclear:** Thought IV was part of the secret. Correction: IV is a random 12-byte salt stored openly alongside the ciphertext. Its job is ensuring the same message encrypts differently each time. Security comes from the AES key, not the IV.
- **HKDF unknown:** Correction: ECDH raw output has mathematical structure; AES requires uniformly random bits. HKDF runs the raw bits through SHA-256 to produce proper key material. The `info` field ("crypt-companion v1") is a domain separator — same keypair in a different app produces a different AES key.
- **`encryptForRecipient` recall:** Described as using "B's public key separately." Correction: public key is only an input to `deriveAesGcmKey`, not referenced independently after that.

**Good catches:** No `decryptFileForRecipient` exists (logged in REFACTOR_NOTES.md). Security model correctly summarised by end: server holds public keys + IV + ciphertext; private keys never leave the browser → attacker gets nothing useful.

### Module 3 — 2026-06-11

**Corrections given:**

- **`useCallback` misread:** Described as "limits to one refresh when called." Correction: it stabilises the function reference so React doesn't see a new object on every render. Loop prevention is a consequence of that stability, not a separate feature.
- **`useMemo` confused with `useCallback`:** Correction: `useCallback` memoizes a **function**, `useMemo` memoizes a **value/object**. Both prevent unnecessary re-renders but for different things.
- **`useRef` scope too narrow:** Described only as the stale closure fix. Correction: general definition is a mutable box that persists across renders without triggering re-renders when changed. Stale closure fix is one use case; holding DOM references is another.
- **`useRealtime` stale closure:** Did not recognise the pattern. Correction: without `useRef`, the socket handler captures `onNewMessage` at creation time and never updates. `callbackRef.current` always points to the latest version because a separate no-deps `useEffect` updates it on every render.
- **`convHook: any` fix:** Suggested passing a message object. Correction: type it as a minimal interface with only the two methods actually called (`loadConversations`, `loadMessages`) — avoids tight coupling to the full hook shape.

**Good instincts:** Correctly identified state held in `useConversations`; correctly spotted decryption runs before appending to state in `handleIncomingMessage`.

**Hook reference (confirmed understood):**

| Hook                           | What it does                                                                                                                                                                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useCallback(fn, [deps])`      | Memoizes a function — returns the same function reference between renders unless a dependency changes. Prevents stale dependency loops when a function is listed in another hook's deps array.                                                                                                              |
| `useMemo(() => value, [deps])` | Memoizes a computed value/object — only recomputes when a dependency changes. Prevents unnecessary re-renders when a hook returns an object that would otherwise be a new reference every render.                                                                                                           |
| `useRef(initial)`              | A mutable box (`ref.current`) that persists across renders without triggering a re-render when changed. Use cases: (1) hold a DOM reference, (2) stale closure fix — store a callback in the ref and update it each render so a long-lived closure (e.g. a socket handler) always calls the latest version. |

### Module 2 — 2026-06-11

**Corrections given:**

- **`realtime.service` misidentified as provider-facing:** Described as "establishes connection to providers." Correction: it establishes Socket.IO connections to **browsers**, not providers. Telegram/WhatsApp are handled by `providers.service` and the MTProto service.
- **`crypto.service` described as a pipeline step:** Said it "passes messages to `providers.service` or `realtime.service`." Correction: it is a stateless utility that encrypts/decrypts a string and returns the result. Controllers orchestrate all service calls; services do not call each other.
- **`media.service` omitted from recall:** Missed in the four-service summary. Handles Cloudinary file uploads via two paths (multipart form-data and base64 JSON).

**Good catches:** Correctly identified `sendToProvider` dispatcher pattern; correctly explained what adding a Signal provider would require (new private function + one if-block).

---

## Revised Time Estimate (as of 2026-06-11)

Based on actual pace (3 modules completed in 1 day vs 3 days estimated) and Claude doing heavy lifting on refactoring:

| Phase                          | Estimate    |
| ------------------------------ | ----------- |
| Remaining modules (6, 7, 8, 9) | ~3 days     |
| Refactoring with Claude        | ~3 days     |
| Module 10 — UI rework          | ~2 days     |
| **Total remaining**            | **~8 days** |

Deadline: 2026-06-24 (~13 days away). Comfortable buffer.

---

## Re-Evaluation (2026-06-16)

**What changed:** 5 days passed since the last estimate. Deadline (2026-06-24) is now **8 days away**, not 13. In that gap, Modules 11-21 happened: WhatsApp integration, production deployment to Render, multiple live debugging sessions, and a full security/redundancy audit. All necessary, none of it was in the original plan.

**Important correction (Grace, 2026-06-16):** Modules 11-21 are marked `[x]` in the tracker because the work was *executed and documented* — by Claude, under Grace's supervision. That is not the same as Grace having reviewed and understood the resulting code, which is the actual goal of this lesson plan. Supervision ≠ comprehension. These modules still need a real pass: read the actual diff/file, answer the "Key questions" section each module already ends with, flag refactor-for-readability candidates.

**Prioritization decision (Grace, 2026-06-16):** Given ~8 days left and a full review of all 11 debugging/deployment modules would take ~4.3 days alone, scope is split:

- **Core review (full depth — touches app logic Grace would actually refactor):** Modules 11, 12, 16, 17, 21
- **Skim (confirm key takeaways only — infra/deploy plumbing, not app code):** Modules 13, 14, 15, 18, 19, 20 (Module 19/CORS downgraded to skim because Module 21 already fixed the duplicate-`parseOrigins` issue it flagged — largely historical now)

| Group | Est. |
|---|---|
| Core review (11, 12, 16, 17, 21 — full depth) | 2.5 days |
| Skim (13, 14, 15, 18, 19, 20) | 0.6 days |
| Still-open teaching (6 light pass, 7 recap, 8, 9 synthesis, 10 UI rework) | ~3 days |
| Refactor backlog (`REFACTOR_NOTES.md`, Claude-led) | ~1.75 days |
| **Total** | **~7.85 days** |

Against **8 days remaining**. Essentially zero buffer — tighter than the 2026-06-11 estimate, almost entirely because the deadline moved closer during the production work, not because the remaining scope grew much. Module 10 (UI rework) remains the most likely item to overrun, now with no slack left to absorb it if it does.

---

---

### Handoff — WhatsApp Business Phone Number Registration (pending as of 2026-06-15)

**Current state:** Using Meta's shared test number (`+1 555 656 9889`). Limited to 5 manually approved recipient numbers. No one outside that list can use WhatsApp with the app.

**What needs to happen to open it for general use:**

1. **Get a dedicated SIM or VoIP number** — do NOT use `+4915224337813` (personal WhatsApp account on the Samsung Galaxy A14). Migrating a personal number to the WhatsApp Business API is one-way: the number can no longer be used with the regular WhatsApp consumer app. Options:
   - Cheap prepaid SIM (German number is fine — country doesn't matter for the API)
   - VoIP number that can receive an SMS verification code (e.g. Twilio, Vonage, or a local provider). Note: some VoIP numbers are rejected by Meta — test with SMS receipt before committing.

2. **Add the number in Meta for Developers** → WhatsApp → API Setup → Step 5 "Add a phone number" → verify via SMS or phone call.

3. **Complete Business Verification in Meta Business Manager** — required to lift the 5-recipient cap and unlock production API access. Requires uploading business documents (registration, address proof). For a solo developer / student project, Meta accepts freelancer/sole trader registrations in some regions.

4. **Submit app for Meta App Review** — request `whatsapp_business_messaging` and `whatsapp_business_management` permissions. Takes a few days to a week. Requires a working demo and privacy policy URL.

5. **Replace env vars** — once the new number is live:
   - `WHATSAPP_PHONE_NUMBER_ID` → new number's ID from Meta dashboard
   - `WHATSAPP_NUMBER` → new number (for deep link generation)
   - `WHATSAPP_ACCESS_TOKEN` → generate a System User token (permanent, not the 24h temp token)

**Pricing context (as of mid-2025, verify before spending):**
- 1,000 free user-initiated conversations/month (user messages the bot first)
- Business-initiated messages (bot messages user first) are charged from the first one
- Crypt's LINK flow is entirely user-initiated (user sends the code) — fits the free tier well for early testing
- Active users staying within 24h reply windows stay free; users receiving a message after 24h silence start a chargeable business-initiated conversation

---

## Instructions for Future Claude Sessions

**Context:** Grace is a WBS bootcamp graduate (Express/React/JWT auth known) with strong Flutter background. Guided walkthrough of `/Users/grace64/ShadowApp/crypt` — TypeScript messaging app with E2E encryption, Telegram MTProto, Socket.IO, MongoDB. Project deadline: 2026-06-24.

**Already known — do not re-teach:** TypeScript, Zod, Express basics, route files, Mongoose models, auth system, all pages/components, JWT patterns.

**Teaching role:** Interactive, not lecture. Ask before explain. Use Flutter analogies. Terse responses.

**Session start protocol:**

1. Ask which module
2. Ask what she remembers from last session (active recall)
3. Ask what confused her
4. Proceed

**Hardest parts:**

- `useMemo` in AuthProvider — "only recalculate context value if deps change, avoids re-rendering every child"
- MTProto session lifecycle — "it's a logged-in Telegram app that never quits; session string = the saved login"
- ECDH key derivation — always use paint mixing analogy first, then show code
- Why two crypto layers exist (transport-layer AES in backend service vs user-to-user ECDH in frontend)
