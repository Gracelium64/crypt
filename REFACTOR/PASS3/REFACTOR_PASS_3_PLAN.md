# Refactor Pass 3 — Security: Plain-Text PII in MongoDB

**Branch:** TBD (cut from `prod/blue`)
**Identified:** 2026-06-22
**Status:** Not started

---

## Context

Security audit conducted 2026-06-22 mapped every field written to MongoDB and assessed what lands in plain text. Passwords and private ECDH keys are correctly protected. The remaining plain-text fields fall into three groups based on how fixable they are without breaking core functionality.

**Database nuked before this pass began — only test data existed, no real users affected. No migration scripts needed and no backward-compatible fallback required on read paths. Encrypt on write, decrypt on read, clean slate.**

---

## Group 1 — Encrypt `TelegramSession.phoneNumber`

**Risk:** HIGH. Phone numbers are PII. The session string right beside it is AES-256-GCM encrypted; the phone number is not.

**Fix:** Apply `encryptText()` on every write; `decryptText()` on every read. No fallback for plain-text legacy values needed.

**Write sites (`backend/src/services/telegram-mtproto.service.ts`):**
- Line ~222 — phone code flow session upsert
- Line ~400 — QR login session upsert

**Read sites:**
- Any controller that returns `phoneNumber` to the client (Settings display of connected phone)
- Wrap with `decryptText()` before sending in response

**Re-test scope:** Telegram connect flow (phone code path + QR path) + Settings page display of connected phone number.

---

## Group 2 — Server-side encryption at rest for `Message.encryptedText`

**Risk:** MEDIUM. Inbound messages from non-crypt users (standard Telegram/WhatsApp messages) are stored as plain text. Messages sent through crypt's E2E flow already carry the `[CRYPT:v1]` prefix and are unreadable at the DB level.

**Fix:** Before inserting any inbound message body that does not already have a `[CRYPT:v1]` prefix, apply `encryptText()`. On read, apply `decryptText()`. No fallback for plain-text legacy values needed.

**Write sites to update:**
- `backend/src/controllers/providers.ts` — inbound Telegram message storage (~line 178)
- `backend/src/controllers/providers.ts` — inbound WhatsApp message storage (~line 336)
- `backend/src/controllers/messages.ts` — outbound send storage (lines ~143-154)

**Re-test scope:** Full chat flow for both providers — message send, receive, polling, real-time delivery, message list display. Requires a proper smoke-test cycle.

---

## Group 3 — Fields that cannot be encrypted without breaking functionality

These fields stay plain. Mitigation is operational (Atlas access control), not code.

| Collection | Field | Why encryption is not viable |
|---|---|---|
| `Account` | `email` | Login does `findOne({ email })`. Encrypted values can't be queried. Adding a deterministic hash-for-lookup would invalidate all existing accounts. |
| `ProviderConnection` | `providerChatId` | Used in regex search (contact find feature), mirror-key logic, nuke flow. Regex on encrypted data is impossible — breaks contact search entirely. |
| `ProviderConnection` | `username` | Same — contact search queries this field. |
| `Message` | `from`, `to`, `chatId` | Message threading, polling, real-time routing, and conversation grouping all depend on exact-match lookups. Encryption is non-deterministic (random IV per encrypt), so `findOne({ chatId })` would never match. |

**Operational mitigations to apply instead:**
- [ ] MongoDB Atlas network access list: lock to Render egress IPs only — remove `0.0.0.0/0`
- [ ] Atlas user is least-privilege: `readWrite` on the single app database only, no `atlasAdmin`
- [ ] Confirm Atlas connection string is absent from all git history across all branches (already done post-June-2026 incident)
- [ ] Rotate Atlas credentials if not rotated since the June 2026 leak

---

## Execution order

1. Group 1 (`TelegramSession.phoneNumber`) + Group 2 (`Message.encryptedText`) — implement together in a single pass; no staged rollout needed since DB was nuked
2. Group 3 operational items — no code, no re-test
3. Smoke-test full chat flow for both providers before shipping
