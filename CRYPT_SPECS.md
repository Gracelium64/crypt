# Crypt — Technical Specifications

---

## Stack

### Backend
| Component | Tech | Version |
|-----------|------|---------|
| Runtime | Node.js | ≥20 |
| Framework | Express | 4.x |
| Database | MongoDB Atlas | cloud |
| ODM | Mongoose | 8.x |
| Real-time | Socket.IO | 4.x |
| Auth | JWT (`jsonwebtoken`) + bcrypt | — |
| Telegram Bot | `node-telegram-bot-api` | pinned |
| Telegram MTProto | `telegram` (gramjs) | 2.26.22 |
| Media hosting | Cloudinary | REST API |
| File parsing | formidable | 3.5.2 |
| Env validation | Zod | 3.x |
| Language | TypeScript | 5.x |

### Frontend
| Component | Tech | Version |
|-----------|------|---------|
| Framework | React | 18.x |
| Build tool | Vite | 5.x |
| Language | TypeScript | 5.x |
| Real-time | Socket.IO client | 4.x |
| QR codes | qrcode | pinned |

### Infrastructure
| Component | Tech |
|-----------|------|
| Database | MongoDB Atlas (cluster0, `crypt` database) |
| Media | Cloudinary |
| Dev tunnel | Cloudflare Tunnel (required for `crypto.subtle` on mobile) |
| Production target | Render (web service + env vars) |

---

## Database Collections

| Collection | Model | Purpose |
|-----------|-------|---------|
| `accounts` | `Account` | User credentials (email, bcrypt password hash, displayName) |
| `keys` | `Key` | Public keys indexed by `ownerId` (email or Telegram user ID) |
| `messages` | `Message` | All messages (inbound + outbound, encrypted ciphertext stored) |
| `providerconnections` | `ProviderConnection` | Linked provider accounts (provider, providerChatId, displayName) |
| `telegramsessions` | `TelegramSession` | gramjs MTProto session strings per account |
| `links` | `Link` | Short-lived bot link codes (TTL, consumed on completion) |

---

## Encryption

### Algorithm
- **Key exchange:** ECDH P-256 (`crypto.subtle.generateKey`, namedCurve `P-256`)
- **Symmetric cipher:** AES-GCM, 256-bit key, 12-byte random IV
- **Key derivation:** `crypto.subtle.deriveKey` — ECDH shared secret → AES-GCM key
- **Key usages required:** `["deriveKey", "deriveBits"]` on the private key (both ops needed for cross-browser compatibility)

### Key storage
- Private key: `localStorage` key `crypt:priv:<email>` (JWK format)
- Public key: `localStorage` key `crypt:pub:<email>` (raw bytes, base64)
- Public key also registered server-side in the `keys` collection under `ownerId = email` and `ownerId = telegramUserId`

### Message encryption flow (outbound)
1. Sender fetches recipient's public key from `GET /api/keys/:ownerId`
2. Sender derives shared AES key: `ECDH(senderPriv, recipientPub)`
3. Sender encrypts: `AES-GCM(sharedKey, iv, plaintext)` → `base64(iv + ciphertext)` prefixed with `CRYPT1:`
4. Ciphertext sent to backend, stored as `encryptedText` on the `Message` document

### Message decryption flow (inbound)
1. Receiver fetches sender's public key from `GET /api/keys/:senderId`
2. Receiver derives same shared AES key: `ECDH(receiverPriv, senderPub)` — symmetric, same result
3. Receiver splits `CRYPT1:<base64>` → `iv` (first 12 bytes) + `ciphertext` (rest)
4. `AES-GCM.decrypt(sharedKey, iv, ciphertext)` → plaintext

### Ciphertext format
```
CRYPT1:<base64(iv[12] + ciphertext[n])>
```

### Security context requirement
`crypto.subtle` requires a secure context (HTTPS or localhost). In development, a Cloudflare Tunnel is used to expose the local server over HTTPS so mobile devices can generate and use keys.

### Known limitation
If `localStorage` is cleared (device wiped), the private key is lost and old messages become permanently unreadable. See `CLAUDE_HANDOFF_OFFLINE.md` for the planned fix (server-side encrypted key backup).

---

## Messaging Architecture

### Telegram

```
User A (Crypt) ──MTProto──► Telegram servers ──► User B's Telegram app
                                                        │
                                              (also stored in Crypt DB
                                               via inbound fan-out copy)
```

**MTProto path (primary):**
- Both users have active gramjs clients in memory on the backend
- `sendViaMTProto` uses `Api.messages.SendMessage` directly to the recipient's Telegram user ID
- Recipient's gramjs client receives via `NewMessage` event handler → stored in DB → broadcast via Socket.IO

**Bot path (fallback / webhook):**
- Outbound: backend sends via Telegram Bot API to `chatId`
- Inbound: Telegram webhook POST to `/api/providers/telegram/webhook`
- Fan-out: on outbound send, backend also creates an inbound `Message` copy for the recipient's account (so they see it in Crypt)

### WhatsApp (planned)
- Same architecture pattern as Telegram MTProto
- Direct connection via `whatsapp-web.js` or `@whiskeysockets/baileys`
- Blocked pending credentials

### Real-time delivery
- Backend broadcasts new messages via Socket.IO to all authenticated connections
- Frontend filters by `provider` and `chatId`; non-matching messages trigger conversation list refresh only
- Fallback: 10-second polling when Socket.IO is not connected

---

## Authentication

- Registration: `POST /api/auth/register` — email + password + displayName → JWT
- Login: `POST /api/auth/login` — email + password → JWT
- All authenticated routes require `Authorization: Bearer <token>` header
- JWT verified via `authenticateToken` middleware; `req.account` populated with `{ _id, email }`
- Passwords hashed with bcrypt (default salt rounds)

---

## API Routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/register` | No | Create account |
| POST | `/api/auth/login` | No | Get JWT |
| GET | `/api/providers/status` | No | Provider readiness |
| POST | `/api/providers/telegram/webhook` | Secret | Bot webhook |
| POST | `/api/providers/whatsapp/webhook` | Secret | WA webhook |
| GET | `/api/messages` | Yes | Fetch messages |
| POST | `/api/messages` | Yes | Send message |
| DELETE | `/api/messages/conversation` | Yes | Delete conversation |
| GET | `/api/conversations` | Yes | List conversations |
| POST | `/api/keys/register` | Yes | Register public key |
| GET | `/api/keys/:ownerId` | No | Fetch public key |
| GET | `/api/provider-connections` | Yes | List linked providers |
| DELETE | `/api/provider-connections/:id` | Yes | Remove connection |
| POST | `/api/link/start` | Yes | Start bot link flow |
| GET | `/api/link/status/:code` | Yes | Poll link status |
| POST | `/api/telegram/direct/request-code` | Yes | MTProto: send phone code |
| POST | `/api/telegram/direct/verify-code` | Yes | MTProto: verify + connect |
| GET | `/api/telegram/direct/status` | Yes | MTProto: session status |
| DELETE | `/api/telegram/direct/session` | Yes | MTProto: disconnect |

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `PORT` | Yes | Backend listen port (default 4000) |
| `MONGODB_URI` | Yes | MongoDB Atlas connection string |
| `JWT_SECRET` | Yes | JWT signing secret |
| `CORS_ORIGIN` | Yes | Comma-separated allowed origins |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram Bot API token |
| `TELEGRAM_BOT_USERNAME` | No | Bot username for deep links |
| `TELEGRAM_WEBHOOK_SECRET` | No | Webhook secret header validation |
| `TELEGRAM_API_ID` | Yes (MTProto) | From my.telegram.org |
| `TELEGRAM_API_HASH` | Yes (MTProto) | From my.telegram.org |
| `WHATSAPP_ACCESS_TOKEN` | Yes (WA) | WhatsApp Cloud API token |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes (WA) | WhatsApp phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | Yes (WA) | Webhook verification token |
| `CLOUDINARY_CLOUD_NAME` | Yes (media) | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Yes (media) | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Yes (media) | Cloudinary API secret |
| `DEMO_ENCRYPTION_KEY` | Yes | 32-char hex key for server-side encryption |
| `WEBHOOK_ADMIN_TOKEN` | No | Admin token for programmatic link completion |
