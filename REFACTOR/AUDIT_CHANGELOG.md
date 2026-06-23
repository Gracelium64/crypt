# Audit Changelog

**Check this file first when debugging something unexpected.** It logs every change made during the 2026-06-16 security/redundancy audit pass, with a restoration note for each. Ignore this instruction only once you've added a note below saying so.

Nothing in this session was committed to git by Claude — every change below is a working-tree edit. Until you commit, `git diff` shows the exact change and `git checkout -- <file>` reverts any single file.

---

## 2026-06-16 — Security & Redundancy Hardening

### Security fixes

**1. Auth gating + email leak fix — `/provider/resolve`, `/provider/contact/search`**
- Files: `backend/src/routes/providerConnections.route.ts`, `backend/src/controllers/providerConnections.ts`, `frontendReactJs/src/App.tsx`, `frontendReactJs/src/pages/FindPage.tsx`, `frontendReactJs/src/components/FindContact.tsx`
- What: added `authenticate` middleware to both routes; `resolveContact` no longer returns `email` (returns `{ accountId }` only); threaded `token` from `App.tsx` → `FindPage` → `FindContact` so the Find feature still works now that the route requires auth.
- Restore: revert the 5 files above. No data affected — this is route/response-shape only.

**2. Rate limiting**
- Files: `backend/package.json` (new dep `express-rate-limit@8.5.2`, exact-pinned), new `backend/src/middleware/rateLimiter.ts`, `backend/src/middleware/index.ts`, `backend/src/routes/auth.route.ts`, `backend/src/routes/link.route.ts`, `backend/src/routes/providerConnections.route.ts`
- What: `authRateLimiter` (20 req/15min) on `/auth/login`, `/auth/signup`. `linkRateLimiter` (30 req/15min) on `/provider/link/complete`, `/provider/contact/search`, `/provider/resolve`.
- Restore: `npm uninstall express-rate-limit` in `backend/`, delete `rateLimiter.ts`, revert the route files and `middleware/index.ts`. No data affected — purely request-throttling middleware, nothing persisted.
- If you ever get locked out testing across your devices: thresholds are the two `windowMs`/`limit` values in `rateLimiter.ts` — raise them and restart the backend.

**3. Login lockout**
- Files: `backend/src/models/account.ts` (new fields `failedLoginAttempts: Number, default 0` and `lockedUntil: Date, default null`), `backend/src/controllers/auth.ts`
- What: 8 consecutive failed logins locks the account for 15 minutes. Resets to 0/null on a successful login.
- Restore/data note: **purely additive schema fields, safe to ignore.** Existing `Account` documents in MongoDB don't have these fields yet — Mongoose applies the defaults (`0`/`null`) automatically the first time each document is read or saved; nothing needs migrating. To revert: remove the two fields from `account.ts` and the lockout-checking block in `auth.ts`'s `login` function.
- If you lock yourself out while testing: either wait 15 minutes, or directly in MongoDB Atlas run `db.accounts.updateOne({email: "..."}, {$set: {lockedUntil: null, failedLoginAttempts: 0}})`.

**4. Password max length (24 chars, signup + login)**
- File: `backend/src/schemas/auth.ts`
- What: `.max(24)` added to both `signupSchema.password` and `loginSchema.password`.
- **Accepted risk, your call:** if any existing account's real password is longer than 24 characters, that account can no longer log in (Zod rejects the input before it reaches the password check). Only bcrypt hashes are stored, so this can't be verified in advance — if you ever can't log in to an old test account after this change, this is the first thing to check. Restore: remove `.max(24)` from both schemas in `auth.ts`.

**5. Upload size/type validation**
- Files: `backend/src/controllers/uploads.ts`, `backend/package.json` (new dep `@types/mime-types@3.0.1`, exact-pinned, dev-only)
- What: 10MB cap on both `/uploads/formidable` and `/uploads/base64`. MIME allow-list (jpeg/png/gif/webp/pdf/txt/doc/docx) applied to plain uploads only — **encrypted attachments (`resourceType: "raw"`) are fully exempt**, verified via the actual frontend call graph (`frontendReactJs/src/services/messages.ts:90-126`) before this was written, so the encryption flow can't be broken by this change.
- Note: the frontend file picker (`ChatView.tsx:149`) still only offers `accept="image/*"` — documents aren't selectable in the UI yet even though the backend now allows them. Not changed in this pass since it wasn't asked for; flagging in case you want to open that up later.
- Restore: revert `uploads.ts`; `npm uninstall --save-dev @types/mime-types` if you also revert the MIME check entirely. No data affected.

**Explicitly NOT changed, despite being flagged in the audit — your decisions:**
- `encryptText`/`decryptMarkedText` in `backend/src/services/crypto.service.ts` — confirmed zero callers anywhere in the app (not the E2E encryption; a separate, never-finished "encrypt provider credentials at rest" feature), but left in place per your call given how sensitive this area is. Don't re-flag this as "forgotten" in a future pass unless you decide otherwise.
- `Message.providerMessageId` in `backend/src/models/message.ts` — confirmed write-only (never read by the app), but left in place because live test-user data already exists in the `messages` collection and you wanted it to stay readable.

**Deferred, not requested this round:**
- `TELEGRAM_WEBHOOK_SECRET` / `WHATSAPP_APP_SECRET` silently skip signature verification if left unset in a deployment's env vars — should be made required before any production use beyond personal testing.
- `cloudinary` (1.33.0) and `bcryptjs` (2.4.3) are several majors behind latest — no known active CVE, just stale. `npm audit` (run as a side effect of installing `express-rate-limit`) also surfaced pre-existing transitive vulnerabilities in `cloudinary`/`socket.io`/`telegram`'s own dependency trees — unrelated to this session's changes, not fixed here.

### Redundancy / dead-code fixes

**1. Removed `frontendReactJs/src/components/TelegramDirectSetup.tsx`** (335 lines)
- Confirmed zero references anywhere in the repo before deletion (not in `components/index.ts`, not imported by any page). Superseded by `ConnectTelegram.tsx`'s three-mode UI.
- Restore: nothing has been committed, so `git checkout -- frontendReactJs/src/components/TelegramDirectSetup.tsx` recovers it from the last commit if you decide you want it back before committing this session's changes.

**2. Consolidated `parseOrigins`**
- Files: new `backend/src/config/cors.ts`, `backend/src/config/index.ts`, `backend/src/server.ts`, `backend/src/services/realtime.service.ts`
- What: one shared implementation replaces the two near-identical local copies that previously lived in `server.ts` and `realtime.service.ts`.
- Restore: trivial — re-inline the function in both files if needed, no behavior change was intended (kept the more defensive of the two original implementations).

**3. Consolidated Telegram display-name joining**
- Files: `backend/src/services/telegram-mtproto.service.ts` (new exported `joinPersonName` helper), `backend/src/services/index.ts`, `backend/src/controllers/providers.ts`
- What: the literally-duplicated `[firstName, lastName].filter(Boolean).join(" ").trim() || null` fragment (it appeared at **4** call sites, not the 3 originally estimated — phone-auth's own `ProviderConnection` upsert was a 4th) is now one function. The differing fallback *priority* order at each site (username-first vs full-name-first) was deliberately left untouched — only the join logic itself was deduped.
- Restore: re-inline the one-line expression at each of the 4 call sites if needed.

### Documentation

- `CRYPT_SPECS.md` — rewritten to match actual current code (stack versions, full 38-route table, WhatsApp marked shipped, ciphertext prefix corrected to `[CRYPT:v1]`, key-backup limitation removed since it's already fixed, missing env vars added).
- `README.md` — fixed `cp .env.example` → `cp backend/env.example` (the example file has no leading dot; the old instructions didn't actually work), corrected `JWT_SECRET` from "optional" to required, added the new security hardening items to the feature list, added a pointer to the root-level docs.
- `docs/SCALABILITY.md` — new, see file for the full writeup (in-memory MTProto session state blocking horizontal scaling, Socket.IO needing a cross-instance adapter, the missing `providerChatId` index, etc.).
- `planning/LESSON_PLAN.md` — new module appended documenting this session (see Module 21).

---

## 2026-06-23 — Refactor Pass 3: Server-Side At-Rest Encryption

### Security enhancements

**1. `[SRV:v1]` crypto functions — `backend/src/services/crypto.service.ts`, `backend/src/services/index.ts`**
- What: added `encryptTextAtRest`, `decryptSrvText`, `isSrvCiphertext` (third function dead — no callers). Internal helpers refactored to accept a `prefix` param so both `[CRYPT:v1]` and `[SRV:v1]` paths share one `aesEncrypt`/`aesDecrypt` implementation.
- Restore: remove the three exports and `SRV_PREFIX` constant; revert `aesEncrypt`/`aesDecrypt` to single-prefix implementations. No data affected.

**2. `TelegramSession.phoneNumber` encrypted on write — `telegram-mtproto.service.ts`**
- What: `encryptTextAtRest(phoneNumber)` at the phone-code upsert (line 222) and QR login upsert (line 400). Read path in `getTelegramStatus` (`telegram.ts`) applies `decryptSrvText` then the masking regex → `+1***45`.
- **Data note:** Existing `TelegramSession` rows written before this deploy have a plain-text `phoneNumber`. `decryptSrvText` is a no-op for non-`[SRV:v1]` strings — old rows still work but phone number is shown unmasked until the session is re-linked.
- Restore: revert the two write sites in `telegram-mtproto.service.ts` and the `decryptSrvText` call in `telegram.ts`.

**3. Inbound message bodies encrypted on write — `backend/src/controllers/providers.ts`**
- What: Telegram inbound (~line 178) and WhatsApp inbound (~line 335) both now apply `encryptTextAtRest` unless the message is already `[CRYPT:v1]`. **Behavior change:** WhatsApp plain messages changed from `bodyOmitted: true, encryptedText: ""` to `bodyOmitted: false, encryptedText: [SRV:v1]...`. Plain WhatsApp messages now show content in the UI.
- **Data note:** Pre-existing plain WhatsApp messages in the DB have `bodyOmitted: true`, `encryptedText: ""` — they still display as "(content omitted)". Only new inbound messages show content.
- Restore: revert `providers.ts` lines ~178 and ~335.

**4. Outbound messages encrypted on write; read path decrypted — `backend/src/controllers/messages.ts`**
- What: `rawText`/`storedText` split in `sendMessage` (lines 145–146). All three `Message.create` calls use `storedText`. `getMessages` and `getConversations` both apply `decryptSrvText` map before response. `sendMessage` 201 response also applies `decryptSrvText` (see bug fix 7 below).
- Restore: revert lines 145–146 (split), 34 (`getMessages` map), 53 (`getConversations` map), 259 (response).

**5. Realtime emit decrypted — `backend/src/services/realtime.service.ts`**
- What: `decryptSrvText` applied to `message.encryptedText` in `broadcastMessage` before Socket.IO emit. Import taken directly from `./crypto.service.js` (not `#services`) to avoid circular dependency.
- Restore: revert line 37; remove the direct import.

### Bug fixes (found during Pass 3 audit)

**6. Missed write site: `subscribeToMessages` — `backend/src/services/telegram-mtproto.service.ts`**
- What: inbound MTProto messages (`NewMessage` handler) were stored plain even after steps 1–5. Added `isMarkedCiphertext` to import; applied guard at line 78: `encryptedText: isMarkedCiphertext(text) ? text : encryptTextAtRest(text)`.
- Functional impact: none (pre-existing plain values pass through `decryptSrvText` unchanged on read). Security impact: MTProto inbound messages now encrypted at rest.

**7. `sendMessage` 201 response leaked ciphertext — `backend/src/controllers/messages.ts`**
- What: POST `/api/messages/send` 201 response returned `message.encryptedText` as `[SRV:v1]...` ciphertext. Fixed by applying `{ ...message.toObject(), encryptedText: decryptSrvText(message.encryptedText ?? "") }` in the response (line 259).
- Functional impact: none — `useSend.ts` discards the 201 body and calls `loadMessages` post-send.

### Documentation

- `CRYPT_SPECS.md` — updated last-verified date to 2026-06-23; added `[SRV:v1]` at-rest encryption subsection; noted `bodyOmitted` behavior change; noted two bug fixes.
- `REFACTOR/PASS4/REFACTOR_PASS_4_NOTES.md` — created; documents deferred items: phone number in server log (Item 1), `isSrvCiphertext` dead code (Item 2), `CODEBOOK.md` developer handbook (Item 3).
- `planning/LESSON_PLAN.md` — Module 24 added documenting this pass.
- All other docs (`README.md`, `docs/FUNCTIONALITY.md`, `docs/MAINTAINER_GUIDE.md`, `docs/PRODUCTION_CHECKLIST.md`, `planning/PROJECT_ROADMAP.md`) updated to reflect Pass 3.
