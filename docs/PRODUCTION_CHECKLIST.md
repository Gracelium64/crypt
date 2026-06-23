# Production Checklist — Render Deployment

---

## 1. MongoDB Atlas

- [ ] Verify database is named `crypt` (connection string: `.../crypt?appName=...`)
- [ ] In Atlas → Network Access: add `0.0.0.0/0` (allow all IPs) or Render's static outbound IPs
- [ ] In Atlas → Database Access: confirm the user has `readWrite` on the `crypt` database
- [ ] Take a backup / snapshot before going live (Atlas → Backup)

---

## 2. Cloudinary

- [ ] Confirm `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` are correct
- [ ] In Cloudinary → Settings → Security: set allowed upload origins to your Render domain

---

## 3. Telegram

- [ ] `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` set (from my.telegram.org) — required for MTProto
- [ ] `TELEGRAM_BOT_TOKEN` set (from @BotFather)
- [ ] Update Telegram webhook to point at the Render URL:
  ```
  curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
    -d "url=https://<your-render-domain>/api/providers/telegram/webhook" \
    -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
  ```
- [ ] Verify webhook: `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`

---

## 4. Backend — Render Web Service

**Service settings:**
- Root directory: `backend`
- Build command: `npm ci --include=dev && npm run build`
- Start command: `node dist/server.js`
- Environment: `Node`
- Instance type: at least Starter (512 MB RAM — gramjs needs headroom)

**Environment variables to set in Render dashboard:**

| Variable | Value |
|----------|-------|
| `NODE_ENV` | `production` |
| `PORT` | `4000` (Render sets `PORT` automatically — verify your server reads `process.env.PORT`) |
| `MONGODB_URI` | Full Atlas URI with `/crypt` database name |
| `JWT_SECRET` | Long random string — generate with `openssl rand -hex 32` |
| `CORS_ORIGIN` | Your Render frontend URL (e.g. `https://crypt-app.onrender.com`) |
| `TELEGRAM_BOT_TOKEN` | From BotFather |
| `TELEGRAM_BOT_USERNAME` | Bot username |
| `TELEGRAM_WEBHOOK_SECRET` | Random string |
| `TELEGRAM_API_ID` | From my.telegram.org |
| `TELEGRAM_API_HASH` | From my.telegram.org |
| `WHATSAPP_ACCESS_TOKEN` | When available |
| `WHATSAPP_PHONE_NUMBER_ID` | When available |
| `WHATSAPP_VERIFY_TOKEN` | Random string |
| `CLOUDINARY_CLOUD_NAME` | — |
| `CLOUDINARY_API_KEY` | — |
| `CLOUDINARY_API_SECRET` | — |
| `DEMO_ENCRYPTION_KEY` | 32-char hex — rotate from the dev value |
| `WEBHOOK_ADMIN_TOKEN` | Random string (optional) |

**Health check:**
- Set health check path to `/health` (returns 200 with no auth) — **not** `/api/providers/status`, which now requires JWT (Pass 2 Correction)

---

## 5. Frontend — Render Static Site

**Service settings:**
- Root directory: `frontendReactJs`
- Build command: `npm ci && npm run build`
- Publish directory: `frontendReactJs/dist`

> **npm overrides in place (2026-06-21):** `frontendReactJs/package.json` contains overrides for `@aashutoshrathi/word-wrap` (yanked from registry, replaced by `word-wrap@1.2.5`) and `esbuild`. `backend/package.json` overrides `es6-symbol@3.1.4` (drops the broken `es5-ext` transitive dep). These overrides are committed — `npm ci` resolves correctly without `--legacy-peer-deps`.

**Environment variables:**

| Variable | Value |
|----------|-------|
| `VITE_API_BASE_URL` | `https://<your-backend-render-domain>` |

> Check `frontendReactJs/vite.config.ts` — the proxy target must point at the backend Render URL in production, or `VITE_API_BASE_URL` must be wired into `src/lib/api.ts` as the base for all API calls.

**Rewrite rule** (for React Router / SPA):
- Add a redirect: `/* → /index.html` with status `200` (Render: add a `_redirects` file in `public/` or configure in Render dashboard)

---

## 6. HTTPS / Secure Context

`crypto.subtle` requires HTTPS. Render provides TLS automatically on all services — no extra steps. Verify the frontend URL is `https://` before testing key generation on mobile.

---

## 7. Socket.IO

- [ ] Confirm `CORS_ORIGIN` in backend env includes the exact frontend origin (no trailing slash)
- [ ] Socket.IO with Render: Render's default load balancer may not support WebSocket sticky sessions. Set the transport to `["polling", "websocket"]` with `transports` option in the Socket.IO client, or enable sticky sessions in Render (available on paid plans)

---

## 8. gramjs MTProto on Render

- [ ] gramjs keeps active connections in memory — Render's free tier sleeps after inactivity. Use at least the Starter instance to avoid session drops.
- [ ] On cold start, `loadAllMTProtoSessions()` reconnects all stored sessions automatically — no manual action needed.
- [ ] If Render restarts the service, users may need to re-verify their Telegram session if the gramjs session string expires (rare — Telegram sessions are long-lived).

---

## 9. Security Hardening (before go-live)

- [ ] Rotate `JWT_SECRET` from any dev value
- [ ] Rotate `DEMO_ENCRYPTION_KEY` from the hardcoded dev value (`0123456789abcdef...`)
- [ ] Rotate `WEBHOOK_ADMIN_TOKEN`
- [x] **Swagger UI gated in production** — `NODE_ENV === "production"` gates `/api/openapi.json` and `/api/docs` behind `authenticate`. Set `NODE_ENV=production` in Render env vars (already listed in Section 4). No extra step needed. (Pass 2 Correction, 2026-06-20)
- [x] **Helmet HTTP headers installed** — `helmet@8.2.0` wired in `server.ts` as first middleware. CSP disabled (Swagger page uses CDN). All other defaults active. (Pass 2 Correction, 2026-06-20)
- [x] **Server-side at-rest encryption installed** — all plain-text `Message.encryptedText` and `TelegramSession.phoneNumber` encrypted with AES-256-GCM (`[SRV:v1]` prefix) before storage. `DEMO_ENCRYPTION_KEY` must be stable across all backend instances — rotating this key breaks existing encrypted rows and forces users to re-link Telegram. (Refactor Pass 3, 2026-06-23)
- [ ] Confirm MongoDB Atlas IP allowlist is not wider than necessary
- [ ] Review CORS_ORIGIN — must not be `*` in production

---

## 10. Smoke Test After Deploy

- [ ] `GET https://<backend>/api/providers/status` returns 200 (with JWT)
- [ ] Register a new account via the frontend
- [ ] Connect Telegram via phone code — verify code arrives in Telegram app; verify Settings shows "Active"
- [ ] Send a plain message — verify delivery and receipt; confirm the timeline shows readable text (not `[SRV:v1]...` ciphertext — backend must decrypt before returning to frontend)
- [ ] Send a secure message — verify `[CRYPT:v1]` ciphertext in DB and decrypted text on both devices
- [ ] Receive a message — verify blue unread dot appears in conversation list; verify dot clears on open
- [ ] Attach an image — verify Cloudinary upload URL appears in message *(WhatsApp skip for MVP)*
- [ ] Delete a conversation — verify spinner shows during delete, conversation removed from list
- [ ] Nuke account — verify account + all associated messages, keys, links, connections deleted; verify Telegram session terminated

---

## Pre-Deploy: Run C4 Key Migration (upgrading an existing deployment only)

If upgrading from a pre-refactor backend (not a fresh install), run this **before** deploying the new backend:

```bash
cd backend
npm run backup-keys          # creates timestamped JSON backup in scripts/
npm run migrate:key-owner-ids # rewrites Key.ownerId from email → accountId
```

After migration, `Key.ownerId` values are accountIds. Existing JWT tokens remain valid after deploy — the new authenticate middleware ignores the now-unused email field in old tokens. Users do not need to re-login.

Skip this section entirely for fresh installs.

---

## Render Deploy Order

> **C9 upgrade note:** If deploying a Refactor Pass 1 backend to an existing deployment,
> deploy the **frontend first**, then the backend. The new backend emits to per-account
> Socket.IO rooms (`join:account`); the old frontend (without `join:account`) would miss
> all realtime events until it's also updated.

1. Deploy backend first (fresh installs only — see C9 note above for upgrades)
2. Note the backend URL
3. Set `VITE_API_BASE_URL` and deploy frontend
4. Note the frontend URL, set it as `CORS_ORIGIN` in backend env → redeploy backend
5. Register Telegram webhook with the backend URL
