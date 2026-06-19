# Crypt — Technical Specifications

_Last verified against source: 2026-06-20 (Refactor Pass 1 applied)._

---

## Stack

### Backend
| Component | Tech | Version |
|-----------|------|---------|
| Runtime | Node.js | 22 (pinned via `.node-version`) |
| Framework | Express | 5.2.1 |
| Database | MongoDB Atlas | cloud |
| ODM | Mongoose | 9.6.3 |
| Real-time | Socket.IO | 4.8.3 |
| Auth | JWT (`jsonwebtoken` 9.0.2) + `bcryptjs` 2.4.3 | — |
| Rate limiting | `express-rate-limit` | 8.5.2 |
| Telegram Bot API | raw `fetch()` calls to `api.telegram.org` — no SDK | — |
| Telegram MTProto | `telegram` (gramjs) | 2.26.22 |
| Media hosting | Cloudinary (`cloudinary` SDK) | 1.33.0 |
| File parsing | formidable | 3.5.4 |
| MIME detection | mime-types | 2.1.35 |
| MIME byte-sniffing | file-type | 22.0.1 |
| Env validation | Zod | 4.4.3 |
| Language | TypeScript | 6.0.3 |

### Frontend
| Component | Tech | Version |
|-----------|------|---------|
| Runtime | Node.js | 22 (pinned via `.node-version`) |
| Framework | React | 19.2.6 |
| Build tool | Vite | 8.0.12 |
| Language | TypeScript | 6.0.2 |
| Real-time | Socket.IO client | 4.8.3 |
| QR codes | qrcode | 1.5.1 |

All dependencies in both `package.json` files are exact-pinned (no `^`/`~` ranges).

### Infrastructure
| Component | Tech |
|-----------|------|
| Database | MongoDB Atlas (cluster0, `crypt` database) |
| Media | Cloudinary |
| Dev tunnel | ngrok or Cloudflare Tunnel — exposes the local backend over HTTPS so Telegram/Meta webhooks can reach it, and so `crypto.subtle` works on mobile (requires a secure context) |
| Production | **Render** — backend deployed as a Web Service (Node-native, not Docker), frontend deployed as a Static Site. Live, not a target. |

---

## Database Collections

| Collection | Model | Purpose |
|-----------|-------|---------|
| `accounts` | `Account` | User credentials (email, bcrypt password hash, displayName, login lockout state) |
| `keys` | `Key` | Public keys indexed by `ownerId` (email or Telegram user ID); also holds the optional server-side encrypted private-key backup blob |
| `messages` | `Message` | All messages (inbound + outbound, encrypted ciphertext stored) |
| `providerconnections` | `ProviderConnection` | Linked provider accounts (provider, providerChatId, displayName) |
| `telegramsessions` | `TelegramSession` | gramjs MTProto session strings per account |
| `links` | `Link` | Short-lived bot link codes (TTL, consumed on completion) |
| `logs` | `Log` | Structured event log (level, event, accountId, context, errorMessage) — written by `logger.service.ts`; instrumented in auth failures, nuke, link completion, key mirror failure, and Telegram session restore failure |

---

## Encryption

### Algorithm
- **Key exchange:** ECDH P-256 (`crypto.subtle.generateKey`, namedCurve `P-256`)
- **Symmetric cipher:** AES-GCM, 256-bit key, 12-byte random IV
- **Key derivation:** ECDH shared secret → HKDF-SHA256 → AES-GCM key (raw ECDH bits are never used directly as the AES key)
- **Key usages required:** `["deriveKey", "deriveBits"]` on the private key (both ops needed for cross-browser compatibility)

### Key storage
- Private key: generated in the browser, stored in `localStorage` (`crypt:priv:<email>`, JWK format) — never sent to the server in plaintext.
- Public key: `localStorage` key `crypt:pub:<email>` (raw bytes, base64); also registered server-side in the `keys` collection under `ownerId = email` and `ownerId = telegramUserId`.
- **Server-side encrypted backup (so a new device doesn't lose the key):** on first login, the browser derives a wrapping key via PBKDF2 (310,000 iterations, SHA-256, random 16-byte salt) from the user's login password, AES-GCM-encrypts the private key JWK with it, and uploads the encrypted blob to `Key.privateKeyJwk`. On login from a new device, the same password re-derives the wrapping key and decrypts the blob — the server only ever holds `AES-GCM(PBKDF2(password, salt, 310k), privateKeyJwk)`, never a usable key. (This replaces an earlier "known limitation" — localStorage-only keys are no longer a single point of failure.)

### Message encryption flow (outbound)
1. Sender fetches recipient's public key from `GET /api/keys/:ownerId`
2. Sender derives shared AES key: `ECDH(senderPriv, recipientPub)` → HKDF
3. Sender encrypts: `AES-GCM(sharedKey, iv, plaintext)` → `base64(iv + ciphertext)` prefixed with `[CRYPT:v1]`
4. Ciphertext sent to backend, stored as `encryptedText` on the `Message` document

### Message decryption flow (inbound)
1. Receiver fetches sender's public key from `GET /api/keys/:senderId`
2. Receiver derives the same shared AES key independently: `ECDH(receiverPriv, senderPub)` → HKDF
3. Receiver splits the `[CRYPT:v1]`-prefixed payload into `iv` (first 12 bytes) + ciphertext (rest)
4. `AES-GCM.decrypt(sharedKey, iv, ciphertext)` → plaintext

### Ciphertext format
```
[CRYPT:v1]<base64(iv[12] + ciphertext[n])>
```

### Security context requirement
`crypto.subtle` requires a secure context (HTTPS or localhost). In development, ngrok or a Cloudflare Tunnel exposes the local server over HTTPS so mobile devices can generate and use keys.

### Separate, unrelated server-side AES helper
`backend/src/services/crypto.service.ts` also contains a second, distinct AES-256-GCM helper (key derived from the `DEMO_ENCRYPTION_KEY` env var) used only to detect the `[CRYPT:v1]` marker (`isMarkedCiphertext`). **Refactor Pass 1 update (C1, 2026-06-20):** `encryptText` and `decryptMarkedText` now have callers — they are used to encrypt/decrypt Telegram MTProto session strings at rest in `TelegramSession` documents. The `DEMO_ENCRYPTION_KEY` env var is therefore required for any deployment that uses MTProto (not just demo purposes). The original "encrypt provider credentials" feature they were written for was never wired up and remains unbuilt, but these functions are no longer dead code. This is unrelated to the user-to-user E2E encryption described above.

---

## Messaging Architecture

### Telegram

```
User A (Crypt) ──MTProto──► Telegram servers ──► User B's Telegram app
                                                        │
                                              (also stored in Crypt DB
                                               via inbound fan-out copy)
```

**MTProto path (primary, when the sender has an active gramjs session):**
- `sendViaMTProto` uses `Api.messages.SendMessage` directly to the recipient's Telegram user ID
- Recipient's gramjs client receives via the `NewMessage` event handler → stored in DB → broadcast via Socket.IO
- Login: phone-code (`sendCode`/`signIn`) or QR (`signInUserWithQrCode`) — see `LESSON_PLAN.md` Modules 6 and 16 for the full session lifecycle and known phone-code delivery caveats.

**Bot path (fallback / webhook, for users without an active MTProto session, and for the `LINK <code>` flow):**
- Outbound: backend sends via raw `fetch()` to the Telegram Bot API
- Inbound: Telegram webhook `POST /api/providers/telegram/webhook`, gated by `secret_token` header validation (`TELEGRAM_WEBHOOK_SECRET`)
- Fan-out: a send also creates an inbound `Message` copy for the recipient's own account so they see it inside Crypt

### WhatsApp — fully implemented (not planned)
- Meta WhatsApp Cloud API, official REST API via raw `fetch()` — no `whatsapp-web.js`/`baileys`, no unofficial client.
- Outbound send and inbound webhook (`POST /api/providers/whatsapp/webhook`, HMAC-verified via `WHATSAPP_APP_SECRET`) both live, same fan-out pattern as the Telegram bot path.
- Every WhatsApp message flows through the single business number — there is no per-user "send as" equivalent to Telegram MTProto (see `LESSON_PLAN.md` Module 12 for the full platform comparison).
- Currently limited to Meta's shared test number with a 5-recipient approval cap pending business verification — see `LESSON_PLAN.md`'s WhatsApp handoff notes.

### Real-time delivery
- **Refactor Pass 1 (C9, 2026-06-20):** Backend now broadcasts to per-account Socket.IO rooms. Clients emit `join:account` on connect; the server emits via `io.to(accountId).emit(...)` instead of `io.emit(...)`. Frontend no longer needs to filter broadcasts by accountId client-side — only the owning account's sockets receive its messages. No socket-level auth token check. Per-account rooms narrow the broadcast surface but do not fix cross-instance delivery (see `SCALABILITY.md`).
- Fallback: polling `GET /api/messages` (10s when Socket.IO is disconnected, 30s as a safety net when connected — see `LESSON_PLAN.md` Module 17 for why the safety-net poll exists).

---

## Authentication

- Registration: `POST /api/auth/signup` — email + password (8–24 chars) + displayName → JWT
- Login: `POST /api/auth/login` — email + password (max 24 chars) → JWT
- All authenticated routes require `Authorization: Bearer <token>` header
- JWT verified via `authenticate` middleware; `req.account` populated with `{ accountId }` (email was removed from JWT payload in Refactor Pass 1 C4, 2026-06-20 — tokens issued before that deploy are rejected)
- Passwords hashed with `bcryptjs` (10 salt rounds)
- **Rate limiting:** `express-rate-limit` on `/auth/login` and `/auth/signup` (20 req / 15 min / IP), and on link-completion and contact-resolution endpoints (30 req / 15 min / IP)
- **Login lockout:** after 8 consecutive failed attempts, the account is locked for 15 minutes (`Account.failedLoginAttempts` / `Account.lockedUntil`)

---

## API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/signup` | Rate-limited | Create account |
| POST | `/api/auth/login` | Rate-limited | Get JWT (lockout after 8 failed attempts) |
| GET | `/api/auth/me` | Yes | Current account info |
| DELETE | `/api/auth/account` | Yes | Delete account + all owned data |
| GET | `/api/providers/status` | No | Provider readiness |
| GET/POST | `/api/providers/telegram/webhook` | Secret token | Bot webhook (verify GET, receive POST) |
| GET/POST | `/api/providers/whatsapp/webhook` | Secret (HMAC) | WA webhook (verify GET, receive POST) |
| GET | `/api/messages` | Yes | Fetch messages |
| POST | `/api/messages/send` | Yes | Send message |
| DELETE | `/api/messages/conversation` | Yes | Delete one conversation |
| DELETE | `/api/messages/all` | Yes | Delete all messages |
| GET | `/api/conversations` | Yes | List conversations |
| POST | `/api/keys/register` | Yes | Register public key (+ optional encrypted backup blob) |
| GET | `/api/keys/me/private` | Yes | Fetch own encrypted private-key backup |
| GET | `/api/keys/:ownerId` | Yes (added C3, 2026-06-20 — was public; changed to prevent membership enumeration via email) | Fetch a public key |
| GET | `/api/provider/connections` | Yes | List linked providers |
| GET | `/api/provider/contact/search` | Yes + rate-limited | Find a contact by username/phone |
| GET | `/api/provider/resolve` | Yes + rate-limited | Resolve a provider chat ID to an internal accountId |
| DELETE | `/api/provider/connections/:id` | Yes | Remove a connection |
| POST | `/api/provider/link/init` | Yes | Start bot link flow |
| GET | `/api/provider/link/status/:code` | Yes (added C2, 2026-06-20 — was public; changed to require auth) | Poll link status |
| POST | `/api/provider/link/complete` | Admin token + rate-limited | Server-side/admin link completion |
| GET | `/api/telegram/direct/status` | Yes | MTProto: session status |
| POST | `/api/telegram/direct/request-code` | Yes | MTProto: send phone code |
| POST | `/api/telegram/direct/verify-code` | Yes | MTProto: verify + connect |
| DELETE | `/api/telegram/direct/session` | Yes | MTProto: disconnect |
| POST | `/api/telegram/direct/request-qr` | Yes | MTProto: start QR login |
| GET | `/api/telegram/direct/qr-status` | Yes | MTProto: poll QR status |
| POST | `/api/telegram/direct/qr-2fa` | Yes | MTProto: submit 2FA password |
| POST | `/api/uploads/base64` | Yes | Upload via base64 JSON (≤10MB, image MIME allow-list) |
| POST | `/api/uploads/formidable` | Yes | Upload via multipart (≤10MB; MIME allow-list unless `resourceType: raw`, i.e. encrypted) |
| POST | `/api/admin/telegram/set-webhook` | Admin token | Set Telegram webhook URL |
| POST | `/api/admin/telegram/delete-webhook` | Admin token | Delete Telegram webhook |
| POST | `/api/admin/providers/test` | Admin token | Test provider send |
| GET | `/api/openapi.json` | No | OpenAPI schema |
| GET | `/api/docs` | No | Swagger UI |

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `PORT` | No (default 4000) | Backend listen port |
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `JWT_SECRET` | Yes (min 32 chars) | JWT signing secret |
| `CORS_ORIGIN` | No (default `http://localhost:5173`) | Comma-separated allowed origins |
| `DEMO_ENCRYPTION_KEY` | Yes (min 32 chars) | Key for the separate server-side AES helper (see Encryption section) |
| `TELEGRAM_BOT_TOKEN` | Yes (Telegram) | Telegram Bot API token |
| `TELEGRAM_BOT_USERNAME` | No | Bot username for deep links |
| `TELEGRAM_WEBHOOK_SECRET` | No — webhook verification is skipped entirely if unset | Webhook `secret_token` validation |
| `TELEGRAM_API_ID` / `TELEGRAM_API_HASH` | Yes (MTProto) | From my.telegram.org |
| `WHATSAPP_ACCESS_TOKEN` | Yes (WA) | WhatsApp Cloud API bearer token |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes (WA) | WhatsApp phone number ID (for API calls) |
| `WHATSAPP_NUMBER` | No | E.164 phone number, used for `wa.me` deep links |
| `WHATSAPP_APP_SECRET` | No — HMAC verification is skipped entirely if unset | Verifies WhatsApp webhook signatures |
| `WHATSAPP_VERIFY_TOKEN` | No (defaults to the literal string `"replace_me"`) | Echoed back during Meta's webhook verification handshake |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Yes (media) | Cloudinary credentials |
| `CLOUDINARY_URL` | No | Alternate single-string Cloudinary credential format |
| `WEBHOOK_ADMIN_TOKEN` | No | Gates `/api/admin/*` and `/api/provider/link/complete` |
| `SE_CRETS_MASTER_KEY` | No | Optional real master key for AES-GCM secret encryption, if per-connection encrypted tokens are ever stored |

**UI documentation note:** A full UI audit and refactor (Module 10) is pending. Frontend component details in this spec may not reflect final visual design after that pass.

**Known gaps, not yet fixed (tracked in `AUDIT_CHANGELOG.md`):** `TELEGRAM_WEBHOOK_SECRET` and `WHATSAPP_APP_SECRET` being optional means webhook signature verification silently no-ops if either is left unset in a deployment — both should be required in production.
