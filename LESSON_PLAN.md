# Codebase Mastery Lesson Plan

**For:** Grace (WBS graduate, Flutter-strong)  
**Goal:** Full understanding of every non-trivial pattern in this codebase + UI rework before deadline  
**Format:** Interactive teacher sessions (start each: "continue lesson plan, module X")

---

## Revised Time Estimate

| Phase | Days (8h/day) | Hours |
|---|---|---|
| Backend services (the logic layer) | 1 | 8h |
| Frontend custom hooks + API layer | 1 | 8h |
| Cryptography (ECDH + AES-GCM) | 1 | 8h |
| Telegram MTProto | 1.5 | 12h |
| Socket.IO realtime | 0.5 | 4h |
| Media uploads | 0.5 | 4h |
| Link/pairing system | 0.5 | 4h |
| UI rework + refinement | 2 | 16h |
| **Total** | **~8 days** | **~64h** |

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
Answer: the backend crypto service handles *transport-layer* encryption for provider payloads (WhatsApp, Telegram bodies), not the *user-to-user* ECDH layer. Two different crypto concerns.

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

### 5. `services/telegram-mtproto.service.ts` (280 lines) — save for Module 6
Skip for now. Covered in depth in Module 6.

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

**Medium complexity:**
3. `hooks/useSend.ts` (61 lines) — encapsulates the send flow: encrypt → POST → optimistic update
4. `hooks/useConversations.ts` (160 lines) — groups messages into threads, most interesting data transformation
5. `hooks/useRealtime.ts` (34 lines) — Socket.IO client (covered more in Module 7)

**Most complex:**
6. `hooks/useLink.ts` (199 lines) — a state machine for the QR pairing flow. Read with this framing: it's equivalent to a multi-step Flutter form with async validation at each step.

**For each hook, answer:**
- What `useState` variables does it hold?
- What side effects does it run (`useEffect`)?
- What does it return to the component that calls it?
- What would break in the UI if this hook returned nothing?

---

## Module 5 — Cryptography (Day 3, ~8h)

**This is the most technically dense module. Go slowly.**

### Concept first: ECDH key exchange (the "paint mixing" analogy)
Imagine two people agree on a starting color (public). Each picks a secret color only they know. They each mix their secret color with the shared starting color and share the result publicly. Both then mix their secret color with the *other person's* result. Both end up with the same final color — but no observer can reconstruct it without knowing a secret color.

In code:
- "secret color" = private key (never leaves the browser)
- "mixed result you share" = public key (stored on server, anyone can see it)
- "final color both arrive at" = derived shared secret (used as AES key)

### Files (read in this order):
1. `frontendReactJs/src/lib/crypto.test.ts` — read the tests FIRST. They are the clearest documentation of what the functions do and how they chain together.
2. `frontendReactJs/src/lib/crypto.ts` (171 lines) — implement against the tests mentally
3. `backend/src/services/crypto.service.ts` (45 lines) — the backend half

### Functions in `crypto.ts` to understand deeply:
| Function | What it does |
|---|---|
| `arrayBufferToBase64` / `base64ToArrayBuffer` | Convert between raw bytes and storable strings |
| `fingerprintFromPubKey` | SHA-256 hash of a public key → human-readable hex pairs (shown in UI) |
| `importPublicKeyFromBase64` | Reconstruct a CryptoKey object from a stored base64 string |
| `importPrivateJwkKey` | Reconstruct a private CryptoKey from a stored JWK object |

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

| Bot API | MTProto API |
|---|---|
| Telegram runs a server, you receive webhooks | You ARE a Telegram client |
| Limited to bot actions | Full user account access |
| No session persistence needed | Requires a session string to stay connected |
| `grammy`, `node-telegram-bot-api` | `gramjs` |

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

| Path | Content-Type | Use case |
|---|---|---|
| Formidable multipart | `multipart/form-data` | Browser `<input type="file">` |
| Base64 JSON | `application/json` | Programmatic uploads, mobile fallback |

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

| | Telegram (Bot API) | Telegram (MTProto) | WhatsApp Business API |
|---|---|---|---|
| Messages from | Bot account | User's own account | Business phone number |
| Peer-to-peer possible? | No | Yes | **Never** |
| Who owns the session | Telegram's servers | Your backend | Meta's servers |
| Send to arbitrary users | Only if they messaged first | Yes | Only opted-in customers |

**Key constraint:** Every WhatsApp message in and out flows through the business number. There is no way via the Cloud API to make a message appear from another user's phone. Telegram's MTProto path is architecturally special — WhatsApp has no equivalent.

**Consequence for Crypt:** WhatsApp works as a *delivery pipe*, not a direct channel. Crypt is the actual conversation layer. The fan-out message system (already in `messages.ts`) handles this correctly — both accounts see the conversation in Crypt regardless of what WhatsApp delivers.

---

### Meta developer setup (what each credential is)

| Env var | Where it comes from | What it does |
|---|---|---|
| `WHATSAPP_PHONE_NUMBER_ID` | Meta for Developers → WhatsApp → API Setup | Identifies which phone number your API calls send from |
| `WHATSAPP_NUMBER` | Same page, the phone number itself | Used to generate WhatsApp deep links (`wa.me/...`) |
| `WHATSAPP_ACCESS_TOKEN` | Business Portfolio → System Users → Generate Token | Bearer token for all Cloud API calls |
| `WHATSAPP_APP_SECRET` | Meta for Developers → App Settings → Basic | Used to verify webhook HMAC signatures |
| `WHATSAPP_VERIFY_TOKEN` | You invent it | Echo'd back during webhook verification handshake |

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

**Root cause:** In the LINK handler in `providers.ts`, `providerDisplayName` was set to `change.value.metadata?.display_phone_number` — which is the *business number*, not the sender's name. It was then stored as `displayName` in `ProviderConnection`.

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

| Package | Role | Symptom when Linux binary missing |
|---------|------|----------------------------------|
| `esbuild` | JS/TS transpiler | `Missing: @esbuild/linux-x64@0.28.0 from lock file` |
| `rolldown` | Bundler (replaced rollup) | `Cannot find module '@rolldown/binding-linux-x64-gnu'` |
| `lightningcss` | CSS minifier | `Cannot find module '../lightningcss.linux-x64-gnu.node'` |

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

| Flutter | This codebase |
|---|---|
| `StatefulWidget` + `setState` | `useState` |
| `Provider` / `Riverpod` | React Context + `AuthProvider` |
| `FutureBuilder` | `useEffect` + loading state |
| `StreamBuilder` | `useRealtime` + Socket.IO |
| `Navigator.pushNamed` | page state in `App.tsx` |
| `shared_preferences` | `localStorage` |
| `dio` / `http` | `fetch()` inside `apiCall()` |
| `StreamController` | Socket.IO `EventEmitter` |
| Dart `class` with typed fields | TypeScript `interface` / Mongoose schema |
| `pubspec.yaml` | `package.json` |

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
[x] Module 11 - Real-world debugging session — completed 2026-06-15
[x] Module 12 - WhatsApp Business API integration — completed 2026-06-15
[x] Module 13 - Production deployment debugging — completed 2026-06-15
[x] Module 14 - Frontend deployment: native binary platform packages — completed 2026-06-15
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

| Hook | What it does |
|---|---|
| `useCallback(fn, [deps])` | Memoizes a function — returns the same function reference between renders unless a dependency changes. Prevents stale dependency loops when a function is listed in another hook's deps array. |
| `useMemo(() => value, [deps])` | Memoizes a computed value/object — only recomputes when a dependency changes. Prevents unnecessary re-renders when a hook returns an object that would otherwise be a new reference every render. |
| `useRef(initial)` | A mutable box (`ref.current`) that persists across renders without triggering a re-render when changed. Use cases: (1) hold a DOM reference, (2) stale closure fix — store a callback in the ref and update it each render so a long-lived closure (e.g. a socket handler) always calls the latest version. |

### Module 2 — 2026-06-11

**Corrections given:**
- **`realtime.service` misidentified as provider-facing:** Described as "establishes connection to providers." Correction: it establishes Socket.IO connections to **browsers**, not providers. Telegram/WhatsApp are handled by `providers.service` and the MTProto service.
- **`crypto.service` described as a pipeline step:** Said it "passes messages to `providers.service` or `realtime.service`." Correction: it is a stateless utility that encrypts/decrypts a string and returns the result. Controllers orchestrate all service calls; services do not call each other.
- **`media.service` omitted from recall:** Missed in the four-service summary. Handles Cloudinary file uploads via two paths (multipart form-data and base64 JSON).

**Good catches:** Correctly identified `sendToProvider` dispatcher pattern; correctly explained what adding a Signal provider would require (new private function + one if-block).

---

## Revised Time Estimate (as of 2026-06-11)

Based on actual pace (3 modules completed in 1 day vs 3 days estimated) and Claude doing heavy lifting on refactoring:

| Phase | Estimate |
|---|---|
| Remaining modules (6, 7, 8, 9) | ~3 days |
| Refactoring with Claude | ~3 days |
| Module 10 — UI rework | ~2 days |
| **Total remaining** | **~8 days** |

Deadline: 2026-06-24 (~13 days away). Comfortable buffer.

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
