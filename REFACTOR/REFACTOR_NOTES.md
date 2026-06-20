# Refactor Notes

Issues to address before or after deadline. Add findings as you review.

---

## Security / Architecture

### `broadcastMessage` sends to all connected users
**File:** `backend/src/services/realtime.service.ts` line 21  
`io.emit("message:new", ...)` broadcasts every message to every connected browser tab.  
The frontend filters by `accountId` — meaning the data reaches the client, it just doesn't display.  
Acceptable for a private/demo deployment. For multi-tenant production: emit to a per-account room instead.

```ts
// Current
io.emit("message:new", payload);

// Safer
io.to(`account:${message.accountId}`).emit("message:new", payload);
// (requires clients to join their room on connect)
```

---

## Bugs

### WhatsApp `tokenOverride` ignored in request header
**File:** `backend/src/services/providers.service.ts` line 127  
`sendWhatsApp` accepts `opts.tokenOverride` and uses it for the credential check (line 95), but the actual HTTP request hardcodes `env.WHATSAPP_ACCESS_TOKEN` instead of the resolved `token` variable.

```ts
// Current (line 127) — bug: ignores tokenOverride
Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,

// Fix
Authorization: `Bearer ${token}`,
```

**Blocked:** Fix only after WhatsApp credentials are available and send functionality can be tested end-to-end.

---

---

## Code Organisation — Backend (Priority)

### Separate types into the types folder + infer from Zod schemas
Types are currently defined inline in service and controller files (e.g. `SendPayload`, `SendResult`, `ConversationSummary`).  
Move to `backend/src/types/` organised by domain (`providerTypes.ts`, `mediaTypes.ts`, `messageTypes.ts`, etc.) and re-export via barrel (`types/index.ts`).  
Improves readability and makes types reusable across controllers and services without circular imports.

Where a Zod schema already exists for the same shape, delete the manual interface and use `z.infer<typeof schema>` instead — single source of truth, no drift between runtime validation and compile-time type. Apply consistently across both backend and frontend. Any manually written interface that duplicates a Zod schema is a candidate for removal.

For Mongoose models, standardise on `InferSchemaType` (Option A) — infer the TypeScript type directly from the schema rather than defining a separate interface:

```ts
// Standard pattern for all Mongoose models:
const messageSchema = new Schema({ text: String, ... });
type IMessage = InferSchemaType<typeof messageSchema>;
export const Message = model<IMessage>("Message", messageSchema);
```

Any model currently using a manually written interface passed as a generic (`model<IMessage>`) should be migrated to `InferSchemaType`.

---

## Code Organisation — Frontend (Priority)

### Split App.css into per-page/component stylesheets
Currently all styles live in `App.css`. Move page-specific styles to a `src/styles/` folder (`chat.css`, `settings.css`, `auth.css`, etc.).  
Keep `App.css` and `index.css` for global styles only (resets, CSS variables, typography).  
Re-export via barrel or import directly in each component file.  
Reduces merge conflicts and makes it obvious where a style rule applies.

---

## TypeScript — Frontend

### `convHook: any` in `useSend`
**File:** `frontendReactJs/src/hooks/useSend.ts` line 4  
`convHook` is typed as `any`. Replace with a minimal interface covering only the two methods actually used:

```ts
interface ConvRefresher {
  loadConversations?: (provider: string) => Promise<void>;
  loadMessages?: (provider: string, chatId: string, ...args: any[]) => Promise<void>;
}
```

---

## Missing Features

### No `decryptFileForRecipient` function
**File:** `frontendReactJs/src/lib/crypto.ts`  
`encryptFileForRecipient` exists but there is no corresponding decrypt function. Encrypted file attachments cannot be decrypted on the recipient side. Decide: implement decryption, or remove file encryption and send files as plain Cloudinary URLs.

### `TelegramSession.sessionString` stored unencrypted in MongoDB
**File:** `backend/src/services/telegram-mtproto.service.ts` (session save in `completePhoneAuth`, `startQrLogin`; session read in `loadAllMTProtoSessions`)  
**Risk:** A MongoDB dump exposes live Telegram session strings. An attacker with DB access can extract a session string, plug it into gramjs, and have full authenticated access to the user's Telegram account — read messages, send as them, etc. No password needed.

**Fix:** Wire up the already-implemented `encryptText`/`decryptMarkedText` from `backend/src/services/crypto.service.ts`:
- Wrap session string in `encryptText()` before any DB write
- Wrap in `decryptMarkedText()` before passing to `TelegramClient` on read
- `decryptMarkedText` already has a passthrough for unencrypted values — existing sessions keep working with no migration needed

**Dependency:** Requires `DEMO_ENCRYPTION_KEY` env var to be set and stable. If the key rotates, all encrypted sessions break and users must re-link. Document this in the Render env var setup guide.

**Estimated change:** 3–4 lines in one file. Low risk due to passthrough behaviour.

### Loop variable `s` in `loadAllMTProtoSessions` is not descriptive
**File:** `backend/src/services/telegram-mtproto.service.ts` line 116  
Rename `s` → `session` for readability.

### Media upload/download gaps — intentional non-MVP scope cuts
All four items below were deliberately deferred before the 2026-06-24 deadline. File sending was non-MVP. Implement as a post-deadline feature in a single session covering all four paths together.

### Missing: Telegram inbound media download
**File:** `backend/src/services/media.service.ts` (gap — function does not exist)  
Telegram Bot API webhooks deliver a `file_id`, not file bytes. No `downloadAndUploadTelegramMedia` equivalent exists. Inbound Telegram media attachments are never downloaded or stored — only text messages are processed. Fix mirrors the WhatsApp pattern: call `getFile` → get download path → download bytes → upload to Cloudinary.

### Missing: WhatsApp outbound media (sending files TO WhatsApp users)
**File:** `backend/src/services/providers.service.ts`  
WhatsApp Cloud API requires media to be uploaded to Meta's servers first (to obtain a `media_id`), then sent in a message using that ID. The current `sendWhatsApp` implementation likely only supports text. Sending file attachments outbound to WhatsApp users requires a separate media upload step to the Graph API. Needs investigation and implementation.

### Missing: Telegram outbound media (sending files TO Telegram users)
**File:** `backend/src/services/providers.service.ts`  
Bot API supports `sendPhoto`, `sendDocument`, etc. If attachments are already on Cloudinary as public URLs, Telegram can fetch them directly — this may partially work already. Needs verification: confirm whether Cloudinary attachment URLs are being passed to the Bot API send call, or silently dropped.

### Base64 upload path: weak MIME validation
**File:** `backend/src/controllers/uploads.ts` line 38  
`uploadBase64` trusts the client-declared MIME type from the data URL string (`data:image/jpeg;base64,...`) without verifying the actual bytes. A client can declare `image/jpeg` while sending arbitrary bytes. The formidable path is stronger — it cross-checks both declared MIME type and file extension.  
**Proper fix:** byte-sniff the buffer using a library like `file-type` (checks magic bytes — e.g. JPEGs always start with `FF D8 FF`) regardless of the declared MIME type. Apply to both paths.

### `GET /provider/link/status/:code` is unauthenticated and leaks PII
**File:** `backend/src/routes/link.route.ts` line 9  
The status polling endpoint has no `authenticate` middleware. A caller who knows or guesses a valid 6-character link code gets back `providerChatId` (Telegram user ID or WhatsApp phone number) and `providerDisplayName` — real user PII. The route has no rate limiter either (`linkRateLimiter` is only on `completeLink`). The only legitimate callers are authenticated frontend sessions.

**Fix:** Add `authenticate` middleware to the route. The frontend already sends the auth token on all `apiFetch` calls.

```ts
linkRouter.get("/provider/link/status/:code", authenticate, getLinkStatus);
```

### Full security audit of all backend API endpoints needed
Several endpoints may have inconsistent auth, missing rate limiting, or unintended public access. `GET /provider/link/status/:code` was found during Module 9 review. A systematic pass across all routes in `backend/src/routes/` is needed:
- Confirm every non-public route has `authenticate`
- Confirm sensitive routes have `requireAdmin` or appropriate access control
- Confirm rate limiting exists on all auth and provider endpoints
- Cross-reference with the Module 21 audit (which covered `/provider/resolve` and login lockout) to avoid duplication

### `GET /keys/:ownerId` is unauthenticated and leaks membership PII
**File:** `backend/src/routes/keys.route.ts` line 10  
The public key lookup route has no `authenticate` middleware. `ownerId` is the user's email address — an anonymous caller who knows or guesses an email can confirm whether that person is a Crypt user and retrieve their public key. While public keys are cryptographically safe to expose, membership enumeration via email is PII leakage. The frontend only calls this route from within the authenticated send flow.

**Fix:** Add `authenticate` middleware.

```ts
keysRouter.get("/keys/:ownerId", authenticate, getKey);
```

---

### Authorization layer missing — router and controller level both required
**Scope:** All protected backend routes  
Authentication (JWT verification via `authenticate`) confirms identity but does not enforce what an authenticated user is allowed to do. Currently authorization is implicit only — controllers read `req.account!.email` from the JWT to scope operations, which is the correct foundation but is not a substitute for explicit authorization checks.

**Required:** Authorization must be enforced at two levels:
1. **Router level** — role/permission guards before the handler runs (e.g. `requireAdmin`, or a `requireOwner(param)` middleware that checks the JWT identity matches the resource being accessed)
2. **Controller level** — verify the authenticated user has rights to the specific resource being read/written, not just that they are logged in

Add explicit authorization as part of the pre-production security pass.

### GET /provider/resolve — intentional open lookup (documented decision)

Returns `accountId` (MongoDB ObjectId, not PII) for a given `providerChatId`. Accessible to any authenticated Crypt user — required for cross-account message fan-out routing. Restricting this endpoint to the requesting user's own records would break inbound message delivery to other recipients.

Accepted risk: any authenticated user can confirm whether a Telegram/WhatsApp ID belongs to a Crypt account. This is acceptable for a private/closed deployment. `accountId` is an opaque identifier — it carries no user-readable PII.

This decision was reviewed and documented during Pass 1 Correction (2026-06-20). Revisit if the deployment ever becomes multi-tenant or public.

---

### Production-readiness standard — applies to all future audits
This codebase targets production quality, not demo quality. "Private deployment" or "pre-deadline scope cut" are acceptable reasons to defer a non-MVP feature, but never a reason to accept a security gap, an architectural inconsistency, or code that would not pass a professional review. All audit passes and refactor decisions should be evaluated against the question: **"Is this acceptable in a real production app?"** If not, it goes in the refactor backlog with a priority, not a "good enough for now" label.

Non-MVP features deferred explicitly by Grace (file encryption, media send paths, etc.) are the exception — these are deliberate scope decisions, not quality compromises.

### Email in JWT payload — PII exposure, should be replaced with accountId-only token
**Files:** `backend/src/controllers/auth.ts` (token creation), `backend/src/middleware/authenticate.ts` (token decode + `req.account` attachment), `backend/src/controllers/keys.ts` (consumer)

JWTs are signed but not encrypted. Any party who obtains the token can base64-decode it and read every field. The current JWT payload contains the user's email, which is PII. `accountId` (MongoDB ObjectId) is opaque and sufficient as the sole identity claim.

**Migration plan (four phases, execute in order):**

**Phase 1 — Audit all `req.account!.email` consumers**
Before touching anything, grep the entire backend for `req.account` and list every field accessed. This scopes the change:
```bash
grep -rn "req\.account" backend/src --include="*.ts"
```
Expected hits: `keys.ts` (`registerKey`, `getMyPrivateKey`), `auth.ts` (nuke), possibly others. List them all before proceeding.

**Phase 2 — Remove email from JWT and update types**
In `auth.ts` (token creation): remove `email` from the JWT payload object — keep `accountId` only (plus any other non-PII claims like `iat`/`exp`).

In `authenticate.ts`: update the decoded payload type. Remove `email` from the `req.account` interface/type. TypeScript will then surface every consumer that breaks — use compiler errors as the migration checklist.

**Phase 3 — Replace `req.account!.email` with a DB lookup helper**
Add a thin helper in `backend/src/services/` or `backend/src/lib/`:
```ts
export async function getAccountEmail(accountId: string): Promise<string> {
  const account = await Account.findById(accountId, { email: 1 }).lean();
  if (!account?.email) throw new Error("Account not found", { cause: { status: 404 } });
  return account.email;
}
```
Replace every broken `req.account!.email` reference with `await getAccountEmail(req.account!.accountId)`.

Performance note: `Account.findById` with a projection on an indexed `_id` field is a single indexed read — negligible cost. Cache in the request object if the same handler calls it more than once.

**Phase 4 (optional, evaluate separately) — Migrate `Key.ownerId` from email to accountId**
Currently `Key.ownerId` holds either a user email (for Crypt accounts) or a provider chat ID (Telegram user ID / WhatsApp phone number) for mirrored keys. This dual-identity is why the field is a plain string. If `ownerId` for Crypt users migrated to `accountId`, the email lookup in Phase 3 could be eliminated entirely for the key registration path.

However this is a **schema migration** — existing `Key` documents in the DB use email as ownerId. Requires:
1. A migration script: `Key.updateMany({ ownerId: account.email }, { ownerId: account._id.toString() })` for each account
2. Updating `GET /keys/:ownerId` — the frontend and `useSend.ts` must pass `accountId`, not email
3. Auditing the provider mirror path — mirrored keys use chat IDs, not emails, so they are unaffected

**Recommendation:** Do Phase 1–3 first (safe, no data migration). Evaluate Phase 4 as a separate decision after the app is in production and the Key lookup patterns are confirmed stable.

### `privJwk` typed as `any` — private key material deserves a strict type
**Files:** `frontendReactJs/src/lib/crypto.ts` (all function signatures), `frontendReactJs/src/hooks/useSend.ts` line 15  
Private key JWK objects are passed around as `any` throughout the crypto layer and `useSend`. This is the same class of problem as `convHook: any` (see TypeScript section above) but higher stakes — `any` on private key material means no compile-time guarantee it's not accidentally serialized, logged, or passed to the wrong function.

Define a proper type matching the Web Crypto JWK shape:
```ts
interface EcdhPrivateJwk {
  kty: "EC";
  crv: "P-256";
  d: string;
  x: string;
  y: string;
  key_ops?: string[];
  ext?: boolean;
}
```
Replace all `privJwk: any` and `privJwkObj: any` parameters with `EcdhPrivateJwk`. Export from `frontendReactJs/src/lib/crypto.ts` and import wherever used.

### Silent catch blocks swallow failures — errors must be visible to users AND logged
**Scope:** Both frontend and backend across the entire codebase  
Numerous `catch` blocks contain `// ignore`, `// non-fatal`, or empty bodies. These create invisible partial failures — the system continues as if nothing went wrong while data is lost or operations silently fail. Module 17 documented a concrete consequence: three completed provider links never created a `ProviderConnection` because the creation error was swallowed.

**Required for every catch block:**
1. **User-facing feedback** — surface errors to the user via a toast, inline error state, or error boundary. "Something went wrong" is better than silent failure. The user should know when an action did not complete.
2. **Structured logging** — log to the chosen logging system (see below) with enough context to diagnose later: what operation failed, what the inputs were, what the error was.

**Audit task:** Grep the entire codebase for silent catch patterns and fix each one:
```bash
grep -rn "catch.*{" --include="*.ts" --include="*.tsx" . | grep -v "console\."
```
Every result is a candidate — evaluate whether the swallowed error is genuinely non-fatal or just incorrectly suppressed.

---

### Logging strategy: replace console.log with structured logging
**Scope:** Backend + frontend  
`console.log` / `console.error` are invisible in production unless actively tailing logs. A structured logging system allows filtering, searching, alerting, and persistence.

**Recommended approach (two-layer):**

**Layer 1 — Backend structured logger: Pino**  
Fast, low-overhead, JSON output by default. Drop-in replacement for `console.log` calls.
```bash
npm install pino pino-pretty   # pino-pretty for dev readability
```
Log levels: `logger.info(...)`, `logger.warn(...)`, `logger.error(...)`. JSON in production, pretty-printed in dev. Integrate as Express middleware (`pino-http`) to log every request automatically.

**Layer 2 — MongoDB `logs` collection for business-critical events**  
For events that matter to the app (failed ProviderConnection creates, key mirror failures, link completions, auth failures) — write structured documents to a `logs` collection:
```ts
{ timestamp, level: "error"|"warn"|"info", event: string, context: object, error?: string }
```
This gives queryable history: "show me all failed link completions in the last 7 days." Does not replace Pino — Pino handles infra/request logging, MongoDB handles business events.

**Layer 3 (optional, recommended post-launch) — Sentry**  
Frontend error tracking: captures unhandled errors, user context, breadcrumbs showing what the user did before the crash. Free tier covers this project's scale. Add the Sentry browser SDK to the React app and the Sentry Node SDK to the backend.
```bash
npm install @sentry/react @sentry/node
```

**Implementation order:** Pino first (backend, low effort, high signal), then MongoDB logs collection for business events, then Sentry if user-facing error reporting becomes a priority.

### notFound route — status audit

**Backend:** `notFoundHandler` is implemented and correctly wired.
- File: `backend/src/middleware/notFoundHandler.ts` — returns `{ ok: false, error: "Not found" }` with HTTP 404
- Registered in `server.ts`: `app.use("*splat", notFoundHandler)` — correctly positioned after all routes and before the error handler
- **Status: ✓ Complete. No action needed.**

**Frontend:** No React Router or URL-based routing exists. Navigation is handled via an internal `tab` state in `App.tsx` switching between `"chats"`, `"find"`, and `"settings"`. A 404 route is not applicable to this architecture.
- **Status: ✓ Not needed. Tab-based routing is intentional.**

---

### CSS refactor — add inline style extraction to existing task

**Finding:** 122 inline `style={}` attributes exist across 14 tsx files, in addition to the monolithic `App.css`.

Affected files: `ConnectTelegram.tsx`, `ConnectWhatsApp.tsx`, `ConnectionsPanel.tsx`, `FindContact.tsx`, `KeyManager.tsx`, `LinkWizard.tsx`, `OnboardingModal.tsx`, `Timeline.tsx`, `AuthPage.tsx`, `ChatView.tsx`, `ChatsPage.tsx`, `SettingsPage.tsx`, `ProtectedLayout.tsx`, `App.tsx` (~30+ instances).

**Extends the existing App.css split task:** In addition to splitting `App.css` into per-page/component stylesheets, all inline `style={}` props must be extracted into their corresponding CSS files. Goal: zero inline styles remaining in tsx after the refactor. CSS class names must be descriptive and component-scoped (e.g. `.nuke-countdown-timer`) to avoid collisions with existing rules.

**Risk mitigation:** Take a screenshot baseline of all pages and UI states before touching any file. Move rules verbatim; verify visually after each component; run `tsc --noEmit` after the full pass.

---

### SwaggerUI — implementation status

**Status: ✓ Fully implemented. No action needed.**
- File: `backend/src/routes/swagger.route.ts`
- Routes: `GET /api/docs` (HTML page with Swagger UI), `GET /api/openapi.json` (OpenAPI spec)
- Method: CDN-based (`unpkg.com/swagger-ui-dist`) — no npm dependency, lightweight
- Spec file: `backend/openapi.json`
- Note: CDN requires an internet connection. For offline/air-gapped environments: replace CDN links with a local `swagger-ui-dist` npm install. Not a blocker for current deployment.

---

<!-- Add new findings below this line -->
