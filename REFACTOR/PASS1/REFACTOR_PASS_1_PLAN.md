# Refactor Pass 1 — Plan

## Context

Structured refactor of the `crypt` codebase. All changes are applied to the `dev/grace-slop-refactor` branch and tested in development before deploying to Render.

---

## Phase A — Additions to REFACTOR_NOTES.md

Append three new sections at the bottom of `REFACTOR_NOTES.md`:

### Item 1: notFound route status (informational)

**Backend:** `notFoundHandler` exists and is correctly wired.
- File: `backend/src/middleware/notFoundHandler.ts`
- Returns `{ ok: false, error: "Not found" }` with HTTP 404
- Registered in `server.ts`: `app.use("*splat", notFoundHandler)` — after all routes, before the error handler
- **Status: ✓ Complete. No action needed.**

**Frontend:** No React Router or URL-based routing. The app uses an internal `tab` state in `App.tsx` to switch between `"chats"`, `"find"`, and `"settings"` views. A 404 route is not applicable to this architecture.
- **Status: ✓ Not needed. Architecture is intentional.**

### Item 2: CSS inline style extraction (extends existing CSS refactor item)

**Finding:** 122 inline `style={}` attributes exist across 14 tsx files.

Affected files:
- `components/ConnectTelegram.tsx`, `ConnectWhatsApp.tsx`, `ConnectionsPanel.tsx`, `FindContact.tsx`, `KeyManager.tsx`, `LinkWizard.tsx`, `OnboardingModal.tsx`, `Timeline.tsx`
- `pages/AuthPage.tsx`, `ChatView.tsx`, `ChatsPage.tsx`, `SettingsPage.tsx`
- `layouts/ProtectedLayout.tsx`
- `App.tsx` (~30+ inline styles — heaviest: dialog overlays, modals, nuke countdown timer)

**Plan:** Extract all inline `style={}` props into component/page CSS files. No inline styles should remain in tsx after this refactor.

### Item 3: SwaggerUI implementation status (informational)

**Status: ✓ Fully implemented. No action needed.**
- File: `backend/src/routes/swagger.route.ts`
- Routes: `GET /api/docs` (HTML + Swagger UI), `GET /api/openapi.json` (spec)
- Method: CDN-based — no npm dependency
- Note: CDN requires internet access. For offline use: swap CDN links for a local `swagger-ui-dist` install.

---

## Phase B — Production-Readiness Audit Findings

### CRITICAL

| # | Issue | File |
|---|-------|------|
| B1 | `TelegramSession.sessionString` stored unencrypted in MongoDB | `telegram-mtproto.service.ts` |
| B2 | `GET /provider/link/status/:code` unauthenticated — leaks PII | `routes/link.route.ts:9` |
| B3 | `GET /keys/:ownerId` unauthenticated — leaks membership via email | `routes/keys.route.ts:10` |
| B4 | Email in JWT payload — PII readable by any token holder | `controllers/auth.ts` |
| B5 | Silent catch blocks swallow failures | codebase-wide |
| B6 | Authorization layer missing | all protected routes |

### HIGH

| # | Issue | File |
|---|-------|------|
| B7 | WhatsApp `tokenOverride` ignored | `providers.service.ts:127` |
| B8 | Base64 upload trusts client-declared MIME | `controllers/uploads.ts:38` |
| B9 | `broadcastMessage` emits to ALL connected users | `realtime.service.ts:21` |

### MEDIUM

| # | Issue | File |
|---|-------|------|
| B10 | `convHook: any` in useSend | `hooks/useSend.ts:4` |
| B11 | `privJwk: any` throughout crypto layer | `lib/crypto.ts`, `hooks/useSend.ts:15` |
| B12 | Types inline in services/controllers | backend-wide |
| B13 | Mongoose models use manual interfaces | backend models |
| B14 | No structured logging | backend-wide |
| B15 | 122 inline styles in tsx files | 14 tsx files |
| B16 | Monolithic `App.css` (822 lines) | `App.css` |
| B17 | Loop variable `s` not descriptive | `telegram-mtproto.service.ts:116` |

### DEFERRED (out of scope for this pass)

D1–D4: File decryption, media download/upload gaps — deliberate scope cuts  
D5: Pino logging — post-launch  
D6: Sentry — post-launch  
**Exception:** MongoDB logs collection (C16) IS included.

---

## Phase C — Implementation Steps (execution order)

### C1 — Encrypt Telegram session strings
- File: `backend/src/services/telegram-mtproto.service.ts`
- Wrap DB writes with `encryptText()`, reads with `decryptMarkedText()` (both from `crypto.service.ts`)
- `decryptMarkedText` passthrough means existing sessions work without migration
- Verify `DEMO_ENCRYPTION_KEY` is set in both `.env.development` and Render before deploying

### C2 — Authenticate link status endpoint
- File: `backend/src/routes/link.route.ts`
- Add `authenticate` middleware to `GET /provider/link/status/:code`

### C3 — Authenticate key lookup endpoint
- File: `backend/src/routes/keys.route.ts`
- Add `authenticate` middleware to `GET /keys/:ownerId`

### C4 — Remove email from JWT (all 4 phases, DB migration approved)

**Phase 1:** `grep -rn "req\.account" backend/src --include="*.ts"` — audit all consumers  
**Phase 2:** Remove `email` from JWT payload (`auth.ts`) and from `req.account` type (`authenticate.ts`) — use TS errors as checklist  
**Phase 3:** Add `getAccountEmail(accountId)` helper; replace all broken `req.account!.email` references  
**Phase 4:** Migrate `Key.ownerId` from email to accountId

Migration scripts (in `backend/src/scripts/`):
- `backup-keys-before-migration.ts` — backs up all Key documents to `keys_backup_pre_migration` collection
- `migrate-key-owner-ids.ts` — updates `Key.ownerId` from email to `account._id.toString()`
- `rollback-key-migration.ts` — restores from backup if migration fails

npm scripts to add to `backend/package.json`:
```json
"backup:keys": "tsx src/scripts/backup-keys-before-migration.ts",
"migrate:key-owner-ids": "tsx src/scripts/migrate-key-owner-ids.ts",
"rollback:key-migration": "tsx src/scripts/rollback-key-migration.ts"
```

After migration: frontend and `useSend.ts` must pass `accountId` (not email) to `GET /keys/:ownerId`.

**User impact:** Existing JWT tokens invalidated on deploy — users must re-login.

### C5 — Silent catch blocks audit and fix
- `grep -rn "catch" --include="*.ts" --include="*.tsx" . | grep -v "console\."`
- Add user-facing feedback + `console.error(err)` (marked `// TODO: replace with Pino`) to every silent catch

### C6 — Authorization layer
- Verify every protected controller checks resource ownership (not just authentication)
- Add `requireAdmin` to admin routes
- Add inline ownership checks where a user should only access their own data

### C7 — Fix WhatsApp tokenOverride bug
- File: `backend/src/services/providers.service.ts:127`
- Change `env.WHATSAPP_ACCESS_TOKEN` → `token` in the Authorization header

### C8 — Base64 MIME byte-sniffing
- File: `backend/src/controllers/uploads.ts`
- Add `file-type` package to `dependencies` (not devDependencies — Render requires it in prod)
- Check publish date on npmjs.com, pin exact version, verify ≥5 days old
- Byte-sniff buffer before Cloudinary upload; reject MIME mismatch

### C9 — Socket.IO per-account rooms

**Backend (`realtime.service.ts`):**
```ts
socket.on("join:account", (accountId: string) => {
  socket.join(`account:${accountId}`);
});
// broadcastMessage:
io?.to(`account:${payload.accountId}`).emit("message:new", payload);
```

**Frontend (`hooks/useRealtime.ts`):**
- Add `accountId: string | null` param
- Add `accountIdRef` (mirrors existing `callbackRef` pattern at lines 7–11)
- Emit `join:account` in `onConnect` handler using `accountIdRef.current`

**App.tsx line 281:**
```ts
const { isRealtime } = useRealtime(auth.user?.id ?? null, onNewMessage);
```

**Deploy order:** Frontend static site first, backend service second. Old backend ignores `join:account` event — no messages lost during the transition window.

### C10 — Type `convHook` in useSend
- File: `frontendReactJs/src/hooks/useSend.ts:4`
- Replace `any` with `ConvRefresher` interface

### C11 — Type `privJwk` in crypto layer
- Files: `frontendReactJs/src/lib/crypto.ts`, `frontendReactJs/src/hooks/useSend.ts:15`
- Define and export `EcdhPrivateJwk` interface from `crypto.ts`
- Replace all `privJwk: any` and `privJwkObj: any`

### C12 — Backend types folder consolidation
- Move inline types to `backend/src/types/` organised by domain
- Replace manual interfaces duplicating Zod schemas with `z.infer<typeof schema>`
- Migrate Mongoose models to `InferSchemaType`

### C13 + C14 — CSS refactor (done as one coordinated pass)

**Risk mitigation (mandatory):**
1. Screenshot baseline of all pages and UI states before touching any file
2. Grep every class name to confirm ownership before moving
3. Move rules verbatim — no edits during the move
4. Extract inline styles one component at a time (simplest first, App.tsx last)
5. Visually verify after each file
6. `cd frontendReactJs && npx tsc --noEmit` after the full pass

**Styles folder structure:**
```
frontendReactJs/src/styles/
  global.css
  auth.css
  chat.css
  settings.css
  components/
    link-wizard.css
    onboarding.css
    timeline.css
    connections-panel.css
    ... (one per component with significant styles)
```

### C15 — Rename `s` → `session`
- File: `backend/src/services/telegram-mtproto.service.ts:116`

### C16 — MongoDB logs collection
- New: `backend/src/models/log.model.ts`
- New: `backend/src/services/logger.service.ts` — `logEvent(level, event, context?, error?)` function
- Instrument: failed ProviderConnection creates, key mirror failures, link completions, auth failures, nuke triggered, Telegram session errors
- No new env vars — uses existing `MONGODB_URI`

---

## Dev / Production Parity

- **`DEMO_ENCRYPTION_KEY`**: must be set in `.env.development` AND Render dashboard before C1 is deployed
- **TypeScript compile**: `cd backend && npm run build` must succeed before any deploy
- **`file-type` package (C8)**: must be in `dependencies`, not `devDependencies`
- **C4 migration**: run backup script first, verify count, then migrate; Render shell access for prod
- **C9 deploy order**: frontend static site first, backend service second
- **Testing flow**: all changes tested on `dev/grace-slop-refactor` against dev environment before prod deploy

---

## Impact Summary

| Item | User impact |
|------|-------------|
| C1 | None — existing sessions continue via passthrough |
| C2/C3 | None — frontend already sends auth tokens |
| C4 | **Must re-login after deploy** |
| C5 | Errors now visible to users (were silently swallowed) |
| C9 | None visible — messages still arrive in correct chat |
| C13/C14 | Visual-only — no functional impact |

---

## Features to Re-Test After Refactor

- Auth: register, login, logout, nuke account
- Key exchange: register, fetch contact key, private key storage
- LinkWizard: QR flow (both directions), status polling, completeLink
- Telegram: connect, disconnect, send, receive (realtime + polling)
- WhatsApp: connect, disconnect, send, receive, file send
- Cross-provider: find contact, start conversation
- File uploads: Base64 and formidable paths
- Real-time: correct account scoping, no cross-account leakage
- Admin routes: requireAdmin enforced
- Token invalidation (C4): old tokens rejected, new tokens work

---

## Phase D — Post-Refactor Documentation

| # | Task |
|---|------|
| D0 | Update `LESSON_PLAN.md` |
| D1 | Update all files in `docs/` |
| D2 | Update `PRODUCTION_CHECKLIST.md` |
| D3 | Update `PROJECT_ROADMAP.md` |
| D4 | Update `REBUILD_EXERCISES.md` (now targets React Native) |
| D5 | Update `CRYPT_SPECS.md` |
| D6 | Update `SCALABILITY.md` |
| D7 | Remove stale handoff files (confirm with Grace first) |
| D8 | Create `docs/CODEBOOK.md` — complete developer handbook with Mermaid diagrams (show chapter examples first) |
| D9 | All docs: add "UI — Module 10 update pending" placeholder |
| D10 | Create `docs/POSTMAN_TESTING.md` + Postman collection JSON (all routes incl. honeypot) |

---

## Handoff Protocol

- At ~60% context window: write `REFACTOR_PASS_1_HANDOFF_001.md` (incrementing) and stop
- New session reads the handoff and continues from the exact next step
- Progress is tracked live in `REFACTOR_PASS_1.md`

## Final Output

- `REFACTOR_PASS_1_REPORT.md` — written after all phases are complete
