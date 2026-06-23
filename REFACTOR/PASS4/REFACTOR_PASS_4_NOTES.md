# Refactor Pass 4 — Notes

Items surfaced during Pass 3 audit (2026-06-23) that are deferred to Pass 4.

---

## Item 1 — Plain phone number in server log ✓ DONE (2026-06-23)

**File:** `backend/src/services/telegram-mtproto.service.ts`
**Line:** 185

**Was:**
```typescript
console.log("[MTProto] code sent to", phoneNumber, "via", codeType);
```

**Now:**
```typescript
console.log("[MTProto] code sent to", phoneNumber.replace(/(\+?\d{1,3})\d+(\d{2})$/, "$1***$2"), "via", codeType);
```

**Result:** Phone number is redacted in server logs (e.g., `+1***45`). PII no longer leaks to stdout. Verified by reading line 185 of the file post-edit.

---

## Item 2 — `isSrvCiphertext` is dead code ✓ DONE (2026-06-23)

**Files:**
- `backend/src/services/crypto.service.ts` — export removed
- `backend/src/services/index.ts` — re-export removed

**Result:** `isSrvCiphertext` has been deleted from both files. Confirmed absent from the entire codebase (`backend/src` + `frontendReactJs/src`) via exhaustive grep.

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
