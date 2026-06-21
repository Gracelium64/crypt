# Postman Testing Guide

**Last updated:** 2026-06-21

---

## Part 1 — Two ways to get started

### Option A: Import from OpenAPI (fastest)

The backend serves its own OpenAPI spec. While the backend is running locally:

1. In Postman: **Import → Link → paste:**
   ```
   http://localhost:4000/api/openapi.json
   ```
2. Postman generates the full collection from it.
3. Continue with **Part 2** to add collection variables and test scripts on top.

> In production `NODE_ENV=production` gates the spec behind JWT auth. Fetch it locally instead.

### Option B: Build the collection from scratch

Follow every step in this document in order. Takes ~15 minutes.

---

## Part 2 — Create the collection and set variables

### 2.1 Create the collection

1. Postman sidebar → **New** → **Collection**
2. Name it `Crypt API`
3. Click the collection name → **Variables** tab

### 2.2 Add collection variables

Add all of these now (leave the value column empty for the auto-set ones):

| Variable | Initial value | How it gets set |
|----------|--------------|-----------------|
| `baseUrl` | `http://localhost:4000` | Manual — change to your Render URL for prod |
| `token` | _(empty)_ | Auto-set by login/signup test script |
| `adminToken` | _(your `WEBHOOK_ADMIN_TOKEN`)_ | Manual |
| `linkCode` | _(empty)_ | Auto-set by link init test script |
| `qrToken` | _(empty)_ | Auto-set by QR request test script |

Click **Save**.

### 2.3 Set the default Authorization for the collection

1. Click the collection → **Authorization** tab
2. Type: **Bearer Token**
3. Token: `{{token}}`

Every request inside the collection inherits this automatically. For public or admin routes, override at the individual request level.

### 2.4 Create folders

Inside `Crypt API`, create these folders in order (right-click collection → Add Folder):

```
Auth
Keys
Messages
Conversations
Provider Connections
Link Flow
Telegram — Phone Code
Telegram — QR Login
Uploads
Admin
Providers / Webhooks
OpenAPI
Honeypot
```

---

## Part 3 — Auth folder

### POST Signup

**URL:** `{{baseUrl}}/api/auth/signup`
**Method:** POST
**Authorization:** None (override — set Type to No Auth)
**Headers:** `Content-Type: application/json`
**Body (raw JSON):**
```json
{
  "email": "test@example.com",
  "password": "testpass1",
  "displayName": "Test User"
}
```

**Tests tab** (auto-captures token):
```javascript
pm.test("201 created", () => pm.response.to.have.status(201));
const json = pm.response.json();
pm.test("returns token", () => pm.expect(json.data.token).to.be.a("string"));
pm.collectionVariables.set("token", json.data.token);
```

---

### POST Login

**URL:** `{{baseUrl}}/api/auth/login`
**Method:** POST
**Authorization:** None (override)
**Headers:** `Content-Type: application/json`
**Body (raw JSON):**
```json
{
  "email": "test@example.com",
  "password": "testpass1"
}
```

**Tests tab:**
```javascript
pm.test("200 ok", () => pm.response.to.have.status(200));
const json = pm.response.json();
pm.test("returns token", () => pm.expect(json.data.token).to.be.a("string"));
pm.collectionVariables.set("token", json.data.token);
```

> After running this request, `{{token}}` is set for the rest of the session.

---

### GET Me

**URL:** `{{baseUrl}}/api/auth/me`
**Method:** GET
**Authorization:** Inherits Bearer `{{token}}`

**Tests tab:**
```javascript
pm.test("200 ok", () => pm.response.to.have.status(200));
pm.test("has accountId", () => pm.expect(pm.response.json().data.accountId).to.be.a("string"));
```

Response shape: `{ ok: true, data: { accountId: "test@example.com" } }`

---

### DELETE Account (nuke)

**URL:** `{{baseUrl}}/api/auth/account`
**Method:** DELETE
**Authorization:** Inherits Bearer `{{token}}`

> Deletes the account and all owned data. Run last if testing full nuke flow.

---

## Part 4 — Keys folder

### POST Register Key

**URL:** `{{baseUrl}}/api/keys/register`
**Method:** POST
**Headers:** `Content-Type: application/json`
**Body (raw JSON):**
```json
{
  "publicKey": "<base64-encoded ECDH P-256 public key bytes>",
  "privateKeyJwk": "<AES-GCM encrypted JWK string — optional>"
}
```

> `ownerId` is NOT sent in the body — it is derived from the JWT. `publicKey` is raw ECDH public key bytes encoded as base64. `privateKeyJwk` is the server-side encrypted private key backup blob (optional — only sent on first key registration from the frontend).

**Tests tab:**
```javascript
pm.test("200 ok", () => pm.response.to.have.status(200));
```

---

### GET My Private Key Backup

**URL:** `{{baseUrl}}/api/keys/me/private`
**Method:** GET

Returns the encrypted private key blob uploaded at registration.

---

### GET Public Key

**URL:** `{{baseUrl}}/api/keys/{{ownerId}}`
**Method:** GET

Replace `{{ownerId}}` with an email address or Telegram user ID string.

---

## Part 5 — Messages folder

### GET Messages

**URL:** `{{baseUrl}}/api/messages`
**Method:** GET
**Query params:**

| Param | Example | Notes |
|-------|---------|-------|
| `provider` | `telegram` | Optional — `telegram` or `whatsapp` |
| `chatId` | `123456789` | Optional — filter to one conversation |
| `limit` | `40` | Optional — 1–100, default 40 |
| `since` | `2026-06-01T00:00:00Z` | Optional — ISO timestamp |

---

### POST Send Message

**URL:** `{{baseUrl}}/api/messages/send`
**Method:** POST
**Headers:** `Content-Type: application/json`
**Body (raw JSON):**
```json
{
  "provider": "telegram",
  "from": "test@example.com",
  "to": "123456789",
  "chatId": "123456789",
  "text": "Hello from Crypt",
  "encrypt": true,
  "attachments": []
}
```

> `from` is the sender's accountId (email). `to` and `chatId` are both the recipient's provider chat ID (Telegram user ID as a string). `encrypt: true` tells the backend to use the encrypted path. `encryptedText` can be passed instead of `text` if the client has already encrypted the payload (prefixed `[CRYPT:v1]...`). `attachments` is an array of `{ type: "image", url: "<cloudinary url>" }`.

---

### DELETE Conversation

**URL:** `{{baseUrl}}/api/messages/conversation`
**Method:** DELETE
**Query params:**

| Param | Example |
|-------|---------|
| `provider` | `telegram` |
| `chatId` | `123456789` |

---

### DELETE All Messages

**URL:** `{{baseUrl}}/api/messages/all`
**Method:** DELETE
**Query params:**

| Param | Example | Notes |
|-------|---------|-------|
| `provider` | `telegram` | Optional — omit to delete across all providers |

---

## Part 6 — Conversations folder

### GET Conversations

**URL:** `{{baseUrl}}/api/conversations`
**Method:** GET
**Query params:**

| Param | Example | Notes |
|-------|---------|-------|
| `provider` | `telegram` | Optional |
| `limit` | `200` | Optional — max 200 |

Response shape per item:
```json
{
  "provider": "telegram",
  "chatId": "123456789",
  "counterpart": "123456789",
  "counterpartName": "Alice",
  "messageCount": 14,
  "secureMessageCount": 10,
  "plainMessageCount": 4,
  "lastMessageAt": "2026-06-20T18:00:00Z",
  "lastDirection": "outbound",
  "lastMessagePreview": "Hey!",
  "securityState": "mixed"
}
```

---

## Part 7 — Provider Connections folder

### GET List Connections

**URL:** `{{baseUrl}}/api/provider/connections`
**Method:** GET

---

### GET Contact Search

**URL:** `{{baseUrl}}/api/provider/contact/search`
**Method:** GET
**Query params:**

| Param | Example |
|-------|---------|
| `provider` | `telegram` |
| `query` | `@username` or `+12125551234` |

Rate-limited: 30 req / 15 min.

---

### GET Resolve (admin only)

**URL:** `{{baseUrl}}/api/provider/resolve`
**Method:** GET
**Authorization:** Override — No Auth
**Headers:** `x-admin-token: {{adminToken}}`
**Query params:**

| Param | Example |
|-------|---------|
| `provider` | `telegram` |
| `chatId` | `123456789` |

---

### DELETE Connection

**URL:** `{{baseUrl}}/api/provider/connections/:id`
**Method:** DELETE

Replace `:id` with the `_id` of the connection document returned by GET List Connections.

---

## Part 8 — Link Flow folder

This is a 3-step flow. Run the requests in order.

### Step 1 — Init Link

**URL:** `{{baseUrl}}/api/provider/link/init`
**Method:** POST
**Headers:** `Content-Type: application/json`
**Body:**
```json
{ "provider": "telegram" }
```

**Tests tab** (auto-captures the code):
```javascript
pm.test("200 ok", () => pm.response.to.have.status(200));
const json = pm.response.json();
pm.test("has code", () => pm.expect(json.data.code).to.be.a("string"));
pm.collectionVariables.set("linkCode", json.data.code);
```

Response shape:
```json
{
  "ok": true,
  "data": {
    "code": "A3F9",
    "provider": "telegram",
    "deepLinkMobile": "tg://resolve?domain=YourBot&start=A3F9",
    "deepLinkWeb": "https://t.me/YourBot?start=A3F9"
  }
}
```

---

### Step 2 — Poll Link Status

**URL:** `{{baseUrl}}/api/provider/link/status/{{linkCode}}`
**Method:** GET

Response shape:
```json
{
  "ok": true,
  "data": {
    "code": "A3F9",
    "provider": "telegram",
    "completed": false
  }
}
```

Keep polling until `completed: true`. In the real flow the user sends `LINK A3F9` to the bot which triggers step 3 server-side.

---

### Step 3 — Complete Link (admin — simulates bot callback)

**URL:** `{{baseUrl}}/api/provider/link/complete`
**Method:** POST
**Authorization:** Override — No Auth
**Headers:**
```
Content-Type: application/json
x-admin-token: {{adminToken}}
```
**Body:**
```json
{
  "code": "{{linkCode}}",
  "provider": "telegram",
  "providerChatId": "123456789",
  "providerDisplayName": "Test Bot User"
}
```

After this succeeds, re-run Step 2 — `completed` should now be `true`.

---

## Part 9 — Telegram Phone Code folder

Two requests. Run in order.

### Step 1 — Request Code

**URL:** `{{baseUrl}}/api/telegram/direct/request-code`
**Method:** POST
**Headers:** `Content-Type: application/json`
**Body:**
```json
{ "phoneNumber": "+12125551234" }
```

> Phone number must be E.164 format (e.g. `+12125551234`). The code is sent to the **Telegram app** on that phone, not SMS.

Response: `{ "ok": true, "codeType": "app" }` — the `phoneCodeHash` is stored server-side; you do not need to capture it.

Rate-limited: 20 req / 15 min (`authRateLimiter`).

---

### Step 2 — Verify Code

**URL:** `{{baseUrl}}/api/telegram/direct/verify-code`
**Method:** POST
**Headers:** `Content-Type: application/json`
**Body:**
```json
{
  "code": "12345",
  "password": "your2FApassword"
}
```

> `code` is the 5-digit code from the Telegram app. `password` is optional — only required if the Telegram account has 2FA enabled. Do NOT send `phoneNumber` or `phoneCodeHash` — the server already has them from step 1.

Response on success: `{ "ok": true }` — the MTProto session is now active.

---

## Part 10 — Telegram QR Login folder

Three requests. Run in order.

### Step 1 — Request QR

**URL:** `{{baseUrl}}/api/telegram/direct/request-qr`
**Method:** POST
**Body:** _(none)_

**Tests tab** (auto-captures QR token):
```javascript
pm.test("200 ok", () => pm.response.to.have.status(200));
const json = pm.response.json();
if (json.data?.token) {
    pm.collectionVariables.set("qrToken", json.data.token);
}
```

Response shape: `{ "ok": true, "data": { "token": "tg://login?token=...", "step": "qr" } }`

> Open the `token` URL (`tg://login?token=...`) on a phone with Telegram to scan it. Or use a QR code generator to turn it into a scannable image.

---

### Step 2 — Poll QR Status

**URL:** `{{baseUrl}}/api/telegram/direct/qr-status`
**Method:** GET

Poll every 2–3 seconds until `step` changes.

Response shape:
```json
{ "ok": true, "data": { "token": "tg://login?token=...", "step": "qr" } }
```

`step` values:
| Value | Meaning |
|-------|---------|
| `idle` | No QR session started |
| `qr` | Waiting for phone scan |
| `2fa` | Phone scanned — 2FA password required |
| `done` | Logged in successfully |
| `error` | Failed — check `data.error` |

Not rate-limited (it's a polling endpoint).

---

### Step 3 — Submit 2FA (only if step = "2fa")

**URL:** `{{baseUrl}}/api/telegram/direct/qr-2fa`
**Method:** POST
**Headers:** `Content-Type: application/json`
**Body:**
```json
{ "password": "your2FApassword" }
```

After success, poll QR status again — `step` should become `done`.

---

## Part 11 — Uploads folder

### POST Base64 Upload

**URL:** `{{baseUrl}}/api/uploads/base64`
**Method:** POST
**Headers:** `Content-Type: application/json`
**Body:**
```json
{
  "dataUrl": "data:image/png;base64,iVBORw0KGgo...",
  "resourceType": "image"
}
```

> Max 10 MB. MIME allow-list: `image/png`, `image/jpeg`, `image/gif`, `image/webp`. Use `resourceType: "raw"` only for encrypted blobs (bypasses MIME check).

Response: `{ "ok": true, "data": { "url": "https://res.cloudinary.com/..." } }`

---

### POST Multipart Upload

**URL:** `{{baseUrl}}/api/uploads/formidable`
**Method:** POST
**Authorization:** Inherits Bearer `{{token}}`
**Body:** `form-data`

| Key | Type | Value |
|-----|------|-------|
| `file` | File | pick a file |
| `resourceType` | Text | `image` (or `raw` for encrypted) |

Max 10 MB.

---

## Part 12 — Admin folder

All admin routes require:
```
x-admin-token: {{adminToken}}
```
Override Authorization to **No Auth** and add the header manually on each request.

### POST Set Telegram Webhook

**URL:** `{{baseUrl}}/api/admin/telegram/set-webhook`
**Method:** POST
**Headers:** `Content-Type: application/json`, `x-admin-token: {{adminToken}}`
**Body:**
```json
{ "url": "https://your-ngrok-or-tunnel.io/api/providers/telegram/webhook" }
```

---

### POST Delete Telegram Webhook

**URL:** `{{baseUrl}}/api/admin/telegram/delete-webhook`
**Method:** POST
**Headers:** `x-admin-token: {{adminToken}}`
**Body:** _(none)_

---

### POST Test Provider Send

**URL:** `{{baseUrl}}/api/admin/providers/test`
**Method:** POST
**Headers:** `Content-Type: application/json`, `x-admin-token: {{adminToken}}`

---

## Part 13 — Providers / Webhooks folder

### GET Provider Status

**URL:** `{{baseUrl}}/api/providers/status`
**Method:** GET
**Authorization:** Inherits Bearer `{{token}}`

---

### GET Telegram Webhook Verify

**URL:** `{{baseUrl}}/api/providers/telegram/webhook`
**Method:** GET
**Authorization:** Override — No Auth
**Headers:** `X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>`

---

### POST Telegram Webhook (inbound)

**URL:** `{{baseUrl}}/api/providers/telegram/webhook`
**Method:** POST
**Authorization:** Override — No Auth
**Headers:**
```
Content-Type: application/json
X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>
```
**Body:** Paste a real Telegram update payload. Minimal example:
```json
{
  "update_id": 100000001,
  "message": {
    "message_id": 1,
    "from": { "id": 123456789, "first_name": "Alice", "username": "alice" },
    "chat": { "id": 123456789, "type": "private" },
    "text": "Hello",
    "date": 1750000000
  }
}
```

---

### GET WhatsApp Webhook Verify

**URL:** `{{baseUrl}}/api/providers/whatsapp/webhook`
**Method:** GET
**Authorization:** Override — No Auth
**Query params:**

| Param | Value |
|-------|-------|
| `hub.mode` | `subscribe` |
| `hub.verify_token` | _(your `WHATSAPP_VERIFY_TOKEN`)_ |
| `hub.challenge` | `test123` |

---

### POST WhatsApp Webhook (inbound)

**URL:** `{{baseUrl}}/api/providers/whatsapp/webhook`
**Method:** POST
**Authorization:** Override — No Auth
**Headers:** `Content-Type: application/json` + Meta HMAC signature if `WHATSAPP_APP_SECRET` is set.

---

## Part 14 — OpenAPI folder

### GET OpenAPI JSON

**URL:** `{{baseUrl}}/api/openapi.json`
**Method:** GET
**Authorization:** No Auth (local) / Bearer `{{token}}` (production)

---

### GET Swagger UI

**URL:** `{{baseUrl}}/api/docs`
**Method:** GET

Open in browser, not Postman. Gated in production.

---

## Part 15 — Honeypot folder

These routes are attacker decoys — they return convincing fake data and log every hit to the `honeypots` MongoDB collection. No auth required by design.

**To verify honeypot logging works:** hit any route below, then query `db.honeypots.find()` in Atlas.

| Route | Fake data returned |
|-------|--------------------|
| `GET /api/users` | User list with bcrypt hashes |
| `POST /api/users/login` | Fake JWT + user object |
| `GET /api/users/:id` | Single fake user |
| `GET /api/accounts` | Fake org accounts with billing info |
| `GET /api/credentials` | Fake MongoDB URIs, JWT secret, API keys, Stripe keys |
| `GET /api/env` | Fake `process.env` dump |
| `GET /api/config` | Fake feature flags + rate limit config |
| `GET /api/settings` | Fake app config with contact emails |
| `GET /api/sessions` | Fake active sessions with IPs |
| `GET /api/tokens` | Fake API token list |
| `GET /api/logs` | Fake log tail (20 lines) |
| `GET /api/db/stats` | Fake MongoDB cluster stats |
| `GET /api/analytics` | Fake usage metrics + MAU/DAU |
| `GET /api/reports` | Fake financial + security audit reports |
| `GET /api/payments` | Fake Stripe payment records |
| `GET /api/billing` | Fake billing plan + card details |
| `GET /api/export` | Fake data export status |
| `GET /api/backup` | Fake backup policy + S3 paths |
| `GET /api/system` | Fake server info (CPU, memory, disk) |
| `GET /api/debug` | Fake heap dump with credentials |
| `GET /api/internal` | Fake internal service mesh |
| `GET /api/v1/users` | Fake legacy v1 API users |

---

## Part 16 — Header reference

**Authenticated routes:**
```
Authorization: Bearer {{token}}
```

**Admin routes:**
```
x-admin-token: {{adminToken}}
```

**Telegram webhook:**
```
X-Telegram-Bot-Api-Secret-Token: <TELEGRAM_WEBHOOK_SECRET>
```

**WhatsApp webhook HMAC** (generated by Meta, not set manually in real usage):
```
X-Hub-Signature-256: sha256=<hmac>
```

---

## Part 17 — Running as a Collection Runner

For a full end-to-end smoke test, run the collection in this order:

1. **Auth → POST Login** (sets `{{token}}`)
2. **Keys → POST Register Key**
3. **Keys → GET My Private Key Backup**
4. **Messages → GET Messages**
5. **Conversations → GET Conversations**
6. **Provider Connections → GET List Connections**
7. **Link Flow → Step 1 → Step 2 → Step 3 → Step 2** (verify completed)
8. **Telegram Phone Code → Step 1 → Step 2** (requires real phone)
9. **Uploads → POST Base64 Upload**

To use the runner: click the collection → **Run** → drag requests into the order above → **Run Crypt API**.

For Telegram phone/QR flows, run those manually rather than in the runner — they require a real phone response mid-flow.
