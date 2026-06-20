# Postman Testing Guide

**Last updated:** 2026-06-20 (Refactor Pass 1)

The fastest way to get a complete Postman collection is to import the OpenAPI spec the app already serves:

```
GET http://localhost:4000/api/openapi.json
```

In Postman: **Import → Link → paste the URL**. Postman generates the full collection from it. The routes below are a manual supplement for things the spec doesn't capture (flows, honeypot, environment setup).

---

## 1. Collection Variables (set these first)

| Variable | Example value | Notes |
|----------|--------------|-------|
| `baseUrl` | `http://localhost:4000` | Or your Render backend URL |
| `token` | _(empty)_ | Set after login step below |
| `adminToken` | _(your `WEBHOOK_ADMIN_TOKEN`)_ | Used for admin endpoints |
| `linkCode` | _(empty)_ | Set after link init |

---

## 2. Setup Flow (run in order)

### A. Register + login

**1. Signup**
```
POST {{baseUrl}}/api/auth/signup
Content-Type: application/json

{
  "email": "test@example.com",
  "password": "testpass1",
  "displayName": "Test User"
}
```
→ Saves the returned `token` to the `token` variable.

**2. Login** (if already registered)
```
POST {{baseUrl}}/api/auth/login
Content-Type: application/json

{ "email": "test@example.com", "password": "testpass1" }
```
→ Saves the returned `token`.

**3. Verify token**
```
GET {{baseUrl}}/api/auth/me
Authorization: Bearer {{token}}
```

---

## 3. Route Groups

### Auth

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/signup` | No | email + password (8-24 chars) + displayName |
| POST | `/api/auth/login` | Rate-limited | Returns JWT |
| GET | `/api/auth/me` | Yes | Returns `{ accountId }` — no email in token |
| DELETE | `/api/auth/account` | Yes | Nuke account + all data |

### Provider status / webhooks

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/providers/status` | Yes (JWT) | Provider readiness — requires Bearer token (Pass 2 Correction) |
| GET | `/api/providers/telegram/webhook` | Secret token | Webhook verification (GET) |
| POST | `/api/providers/telegram/webhook` | Secret token | Inbound update |
| GET | `/api/providers/whatsapp/webhook` | HMAC secret | Webhook verification (GET) |
| POST | `/api/providers/whatsapp/webhook` | HMAC secret | Inbound update |

### Messages

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/messages` | Yes | `?provider=telegram&chatId=...` |
| POST | `/api/messages/send` | Yes | `{ provider, to, text, encryptedText?, attachments? }` |
| DELETE | `/api/messages/conversation` | Yes | `?provider=...&chatId=...` |
| DELETE | `/api/messages/all` | Yes | Nukes all messages for account |
| GET | `/api/conversations` | Yes | Returns `ConversationSummary[]` |

### Keys

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/keys/register` | Yes | `{ ownerId, publicKey, privateKeyJwk? }` |
| GET | `/api/keys/me/private` | Yes | Returns encrypted private key blob |
| GET | `/api/keys/:ownerId` | Yes | Fetch any public key |

### Provider connections + linking

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/provider/connections` | Yes (JWT) | List linked providers |
| GET | `/api/provider/contact/search` | Yes + rate-limited | `?provider=...&query=...` |
| GET | `/api/provider/resolve` | Admin token (`x-admin-token`) | `?provider=...&chatId=...` — restricted in Pass 2 Correction |
| DELETE | `/api/provider/connections/:id` | Yes | Remove a connection |
| POST | `/api/provider/link/init` | Yes | `{ provider }` → returns `code` |
| GET | `/api/provider/link/status/:code` | Yes | Poll until `completed: true` |
| POST | `/api/provider/link/complete` | Admin token + rate-limited | `{ code, providerChatId, ... }` |

**Link flow test:**
1. `POST /api/provider/link/init` → save the `code`
2. `GET /api/provider/link/status/:code` → verify `completed: false`
3. Manually trigger `POST /api/provider/link/complete` (admin token) to simulate bot completing it
4. `GET /api/provider/link/status/:code` → verify `completed: true`

### Telegram MTProto

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/telegram/direct/status` | Yes (JWT) | MTProto session status |
| POST | `/api/telegram/direct/request-code` | Yes + rate-limited | `{ phoneNumber }` — `authRateLimiter` (20 req/15 min) |
| POST | `/api/telegram/direct/verify-code` | Yes + rate-limited | `{ phoneNumber, code, phoneCodeHash }` — `authRateLimiter` |
| DELETE | `/api/telegram/direct/session` | Yes (JWT) | Disconnect |
| POST | `/api/telegram/direct/request-qr` | Yes + rate-limited | Starts QR login (no body) — `authRateLimiter` |
| GET | `/api/telegram/direct/qr-status` | Yes (JWT) | Poll for `{ token, step }` — NOT rate-limited (polling) |
| POST | `/api/telegram/direct/qr-2fa` | Yes + rate-limited | `{ password }` when step = "2fa" — `authRateLimiter` |

### Uploads

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/uploads/base64` | Yes | `{ dataUrl, resourceType? }` — ≤10MB |
| POST | `/api/uploads/formidable` | Yes | `multipart/form-data`, `file` field — ≤10MB |

### Admin

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/admin/telegram/set-webhook` | Admin token (`x-admin-token`) | `{ url }` |
| POST | `/api/admin/telegram/delete-webhook` | Admin token | No body |
| POST | `/api/admin/providers/test` | Admin token | Test send |

### OpenAPI / Swagger

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/openapi.json` | No (local) / JWT (production) | Import this into Postman; gated by `NODE_ENV === "production"` |
| GET | `/api/docs` | No (local) / JWT (production) | Swagger UI; gated by `NODE_ENV === "production"` |

---

## 4. Honeypot Routes

These routes log every hit to the `honeypots` MongoDB collection and return convincing fake data. They are intentionally public — no auth, no legitimate use, pure trap. **Do not use these in production testing.** They exist to detect scanners.

| Path | What fake data it returns |
|------|--------------------------|
| `GET /api/users` | Fake user list with bcrypt hashes |
| `POST /api/users/login` | Fake JWT with fake user |
| `GET /api/users/:id` | Fake user document |
| `GET /api/accounts` | Fake org accounts with billing info |
| `GET /api/credentials` | Fake MongoDB URIs, JWT secrets, API keys |
| `GET /api/env` | Fake `process.env` dump |
| `GET /api/config` | Fake feature flags and limits |
| `GET /api/settings` | Fake app settings with email contacts |
| `GET /api/sessions` | Fake active sessions with IPs |
| `GET /api/tokens` | Fake API token list |
| `GET /api/logs` | Fake log tail |
| `GET /api/db/stats` | Fake MongoDB stats |
| `GET /api/analytics` | Fake usage metrics |
| `GET /api/reports` | Fake report list |
| `GET /api/payments` | Fake payment records |
| `GET /api/billing` | Fake billing + card details |
| `GET /api/export` | Fake data export |
| `GET /api/backup` | Fake backup status + S3 paths |
| `GET /api/system` | Fake server info |
| `GET /api/debug` | Fake heap dump with credentials |
| `GET /api/internal` | Fake internal service mesh |
| `GET /api/v1/users` | Legacy API (deprecated v1) fake users |

To verify honeypot logging works, hit one of these routes and query `db.honeypots.find()` in Atlas.

---

## 5. Authentication Header Format

All `Auth: Yes` routes require:
```
Authorization: Bearer <token>
```

Admin routes require:
```
x-admin-token: <WEBHOOK_ADMIN_TOKEN value>
```

Telegram webhook requires:
```
X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET value>
```
