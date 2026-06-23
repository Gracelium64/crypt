# Refactor Pass 4 — Notes

Items surfaced during Pass 3 audit (2026-06-23) that are deferred to Pass 4.

---

## Item 1 — Plain phone number in server log

**File:** `backend/src/services/telegram-mtproto.service.ts`
**Line:** 185

```typescript
console.log("[MTProto] code sent to", phoneNumber, "via", codeType);
```

**Issue:** The phone number is logged in plain text to stdout before it is encrypted and written to the DB. Pass 3 encrypts the phone number at rest, but this log line was not updated and still leaks it to server logs.

Lines 174–176 nearby also log debug info about the `sendCode` response — these are fine (no PII).

**Fix for Pass 4:** Replace with a redacted form, e.g.:

```typescript
console.log("[MTProto] code sent via", codeType);
```

or keep the number but redact it:

```typescript
console.log("[MTProto] code sent to", phoneNumber.replace(/(\+?\d{1,3})\d+(\d{2})$/, "$1***$2"), "via", codeType);
```

**Why deferred:** Retained for debugging during the current test phase.

---

## Item 2 — `isSrvCiphertext` is dead code

**Files:**
- `backend/src/services/crypto.service.ts` line 45
- `backend/src/services/index.ts` line 14

**Issue:** `isSrvCiphertext` was added symmetrically alongside `encryptTextAtRest` and `decryptSrvText` in Pass 3 Step 1, but it is never called anywhere in the backend or frontend. Confirmed by exhaustive grep across the entire project (excluding `node_modules` and `dist`).

**Fix for Pass 4:** Remove the export from `crypto.service.ts` and the re-export from `services/index.ts` — unless a future read path needs it (e.g., a conditional decrypt guard).

---

## Item 3 — `docs/CODEBOOK.md` developer handbook (deferred from Pass 1)

**Deferred from:** `REFACTOR/PASS1/REFACTOR_PASS_1_REPORT.md` — item D8; deferred again at Pass 3 close (2026-06-23).

**What it is:** An 8-chapter developer handbook (`docs/CODEBOOK.md`) with Mermaid diagrams. Planned during Pass 1 as a deep-dive reference for future contributors and Grace's own learning. Not yet written.

**Chapters:**
1. Authentication & JWT — signup/login/JWT lifecycle, `authenticate` middleware, `req.account` population
2. Mongoose Models & Type Inference — schema definitions, `InferSchemaType`, relationships between collections
3. ECDH Key Exchange & AES-GCM Encryption — both the client-side E2E layer (`[CRYPT:v1]`) and the server-side at-rest layer (`[SRV:v1]`)
4. Socket.IO Realtime — per-account rooms, `broadcastMessage`, `join:account`, polling fallback
5. Telegram Integration Patterns — MTProto session lifecycle, gramjs `TelegramClient`, bot webhook vs. direct
6. Provider Link Flow — link code generation → bot receives `LINK <code>` → `ProviderConnection` created
7. Media Uploads — Formidable multipart path, base64 path, Cloudinary re-hosting, encrypted attachment exemption
8. Structured Logging — Pino, MongoDB `logs` collection, error visibility standards (see `REFACTOR/REFACTOR_NOTES.md`)

**Format:** Mermaid sequence/flow diagrams for each chapter, paired with a prose explanation. Intended as a living document updated each refactor pass.

**Why deferred:** scope cut at Pass 1 close; deferred again at Pass 3. Low urgency while the app is in active refactor. High value once the codebase stabilises.
