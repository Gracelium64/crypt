# Refactor Pass 3 — Progress Log

**Branch:** `dev/grace-refactor-3`
**Started:** 2026-06-23
**Status:** Implementation complete — pending smoke test

---

## Design Decision: `[SRV:v1]` prefix

Server-side at-rest encryption uses the prefix `[SRV:v1]`, distinct from the client-side E2E prefix `[CRYPT:v1]`. This eliminates ambiguity on read: `decryptSrvText` only acts on `[SRV:v1]` values; `[CRYPT:v1]` E2E messages pass through unchanged and are decrypted client-side as before.

---

## Step 1 — crypto.service.ts: add server-side crypto functions

**File:** `backend/src/services/crypto.service.ts`

**Changes:**
- Refactored internal `encryptText`/`decryptMarkedText` to share `aesEncrypt`/`aesDecrypt` helpers parameterised on prefix
- Added `const SRV_PREFIX = "[SRV:v1]"`
- Added three new exports: `encryptTextAtRest`, `decryptSrvText`, `isSrvCiphertext`

**Verified:** `grep -n "SRV_PREFIX\|encryptTextAtRest\|decryptSrvText\|isSrvCiphertext"` confirms all three exports present at lines 5, 43, 44, 45.

**TypeScript:** `tsc --noEmit` — clean.

---

## Step 2 — services/index.ts: export new crypto functions

**File:** `backend/src/services/index.ts`

**Changes:** Added `encryptTextAtRest`, `decryptSrvText`, `isSrvCiphertext` to the crypto re-export block.

**Verified:** `grep -n "encryptTextAtRest\|decryptSrvText\|isSrvCiphertext"` confirms all three at lines 12–14.

---

## Step 3 — G1-A+B: phoneNumber encryption on write (telegram-mtproto.service.ts)

**File:** `backend/src/services/telegram-mtproto.service.ts`

**Changes:**
- Added `encryptTextAtRest` to import (line 8)
- Line 222 (phone-code flow upsert): `phoneNumber` → `encryptTextAtRest(phoneNumber)`
- Line 400 (QR login upsert): `phoneNumber` → `encryptTextAtRest(phoneNumber)`

**Verified:** `grep -n "encryptTextAtRest"` returns lines 8, 222, 400 — both write sites confirmed.

---

## Step 4 — G1-C: phoneNumber decryption on read (telegram.ts)

**File:** `backend/src/controllers/telegram.ts`

**Changes:**
- Added `decryptSrvText` to `#services` import
- `getTelegramStatus`: wraps `session.phoneNumber` with `decryptSrvText()` before the masking regex — user still sees `+1***45`, not the raw ciphertext

**Verified:** `grep -n "decryptSrvText\|phoneNumber"` confirms `decryptSrvText` at line 12, applied at line 26.

---

## Step 5 — G2-B+C+D: inbound message encryption (providers.ts)

**File:** `backend/src/controllers/providers.ts`

**Changes:**
- Added `encryptTextAtRest` to `#services` import (line 4)
- **Telegram inbound (~line 178):** `encryptedText: incomingRaw` → `encryptedText: isMarkedCiphertext(incomingRaw) ? incomingRaw : encryptTextAtRest(incomingRaw)`
- **WhatsApp inbound (~line 335):** removed `const isEncrypted = isMarkedCiphertext(incomingRaw)` local variable; changed `encryptedText: isEncrypted ? incomingRaw : ""` and `bodyOmitted: !isEncrypted` to `encryptedText: isMarkedCiphertext(incomingRaw) ? incomingRaw : encryptTextAtRest(incomingRaw)` and `bodyOmitted: false`

**Behavior change (WhatsApp):** Plain WhatsApp messages previously had their body discarded (`bodyOmitted: true`, `encryptedText: ""`). They are now stored encrypted at rest and displayable in the UI.

**Verified:** `grep -n "encryptTextAtRest\|isEncrypted\|bodyOmitted"` — `encryptTextAtRest` at lines 4, 178, 335; `isEncrypted` variable is gone; `bodyOmitted: false` at both sites (lines 179, 336).

---

## Step 6 — G2-E: rawText/storedText split (messages.ts sendMessage)

**File:** `backend/src/controllers/messages.ts`

**Changes:**
- Added `encryptTextAtRest`, `decryptSrvText` to `#services` import
- Renamed `storedText` (payload value) → `rawText`; added `const storedText = isMarkedCiphertext(rawText) ? rawText : encryptTextAtRest(rawText)`
- All three `Message.create` calls (outbound, fan-out ~203, MTProto recipient copy ~247) use `storedText` — DB stores at-rest encrypted value
- MTProto send (`sendFn`): changed from `storedText` → `rawText` — provider receives plain text
- WhatsApp label block: changed base from `storedText` → `rawText` — provider receives plain text with label prefix

**Verified:** `grep -n "rawText\|storedText\|outboundText\|sendFn\|encryptedText:"` confirms split at lines 143–144; `sendFn(rawText)` at 185; `outboundText = rawText` at 215; all three `encryptedText: storedText` at 155, 204, 247.

---

## Step 7 — G2-F+G: read path decryption (messages.ts getMessages + getConversations)

**File:** `backend/src/controllers/messages.ts`

**Changes:**
- **`getMessages`:** `.map(m => ({ ...m, encryptedText: decryptSrvText(m.encryptedText ?? "") }))` applied to result before `res.json` — `[SRV:v1]` values are decrypted to plain text; `[CRYPT:v1]` E2E values pass through unchanged
- **`getConversations`:** `rawMessages` → `messages` via `.map(m => ({ ...m, encryptedText: decryptSrvText(m.encryptedText ?? "") }))` before the conversation-building loop — `previewMessage` and `isSecureMessage` both operate on decrypted values; `isSecureMessage` correctly returns false for formerly-`[SRV:v1]` plain messages

**Verified:** `grep -n "decryptSrvText\|rawMessages\|messages.reverse"` confirms decrypt at lines 34 and 53.

---

## Step 8 — G2-H: decrypt before realtime emit (realtime.service.ts)

**File:** `backend/src/services/realtime.service.ts`

**Changes:**
- Imported `decryptSrvText` directly from `./crypto.service.js` (not `#services` — avoids circular import)
- `encryptedText: message.encryptedText` → `encryptedText: decryptSrvText(message.encryptedText ?? "")` in the socket emit payload

**Verified:** `grep -n "decryptSrvText\|encryptedText"` confirms import at line 5, applied at line 37.

---

## TypeScript build

`cd backend && npx tsc --noEmit` — **0 errors** after all changes.

---

## Smoke test scope (not yet run — requires live Telegram/WhatsApp connections)

1. Phone-code Telegram connect → Settings shows masked phone (e.g. `+1***45`)
2. QR Telegram connect → same
3. Receive a plain Telegram message → readable text in chat UI
4. Receive a WhatsApp plain message → readable text in chat UI (previously showed "content omitted")
5. Send a plain outbound message → displayed correctly for sender and recipient
6. Send an E2E crypt message → `[Encrypted message]` for non-crypt; decrypts for crypt users
7. Real-time delivery (socket) of plain message → readable text immediately on arrival

---

## Remaining (Group 3 — no code)

Operational mitigations from the plan doc — no implementation required:
- [ ] MongoDB Atlas: lock network access to Render egress IPs, remove `0.0.0.0/0`
- [ ] Atlas user: confirm `readWrite` only, no `atlasAdmin`
- [ ] Confirm Atlas connection string absent from all git history
- [ ] Rotate Atlas credentials if not rotated since June 2026 leak
