# Maintainer Guide

_Last updated: 2026-06-21 (after prod/blue deployment and debug session)_

## What This System Does

Crypt Companion is a secure messaging companion app that ingests provider messages (Telegram MTProto + Bot API, WhatsApp Cloud API), applies optional E2E encryption/decryption logic, stores events in MongoDB, and pushes updates to web clients in realtime. Authentication uses JWT Bearer tokens with per-account Socket.IO rooms.

## Runtime Components

- Backend API and webhook server (`backend/src/server.ts`)
- MongoDB persistence (`backend/src/models/message.model.ts`)
- Realtime transport (`backend/src/services/realtime.service.ts`)
- Encryption service (`backend/src/services/crypto.service.ts`)
- React client (`frontendReactJs/src/App.tsx`)

## Environment Variables (Backend)

Create `backend/.env` from `backend/.env.example`:

- `PORT`: API port
- `MONGODB_URI`: Mongo connection string
- `CORS_ORIGIN`: allowed frontend origin
- `DEMO_ENCRYPTION_KEY`: secret used for AES-GCM demo encryption
- `WHATSAPP_VERIFY_TOKEN`: verify token for WhatsApp webhook handshake

## API Surface

See `CRYPT_SPECS.md` for the full 30-route table. Summary:

**Public (no token):**
- `GET /health` — service health check (use this for Render health check, not `/providers/status`)
- `POST /api/auth/signup`, `POST /api/auth/login` — rate-limited
- Telegram/WhatsApp webhooks — own secret verification inside controllers

**JWT only (authenticate):**
- `GET /api/auth/me`, `DELETE /api/auth/account/nuke` — nuke deletes account + all messages, keys (including provider-mirrored), links, connections, sessions; sends `auth.LogOut` to Telegram before session deletion
- `GET /api/messages`, `GET /api/conversations`, `POST /api/messages/send`, `DELETE /api/messages/conversation`, `DELETE /api/messages/all`
- `GET /api/providers/status` — requires JWT (changed in Pass 2 Correction)
- `GET /api/provider/connections`, `GET /api/provider/contact/search`
- `GET /api/provider/link/status/:code`
- `GET /api/keys/:ownerId`
- All `/api/telegram/direct/*` routes (action routes also rate-limited)
- `POST /api/uploads/base64`, `POST /api/uploads/formidable`

**Admin token (`x-admin-token: $WEBHOOK_ADMIN_TOKEN`):**
- `POST /api/admin/telegram/set-webhook`, `POST /api/admin/telegram/delete-webhook`, `POST /api/admin/providers/test`
- `POST /api/provider/link/complete`
- `GET /api/provider/resolve`

**Conditional (JWT in production, open locally):**
- `GET /api/openapi.json`, `GET /api/docs` — gated by `NODE_ENV === "production"`

## Operational Checklist

1. Verify MongoDB connectivity before starting backend.
2. Confirm backend `CORS_ORIGIN` matches frontend host.
3. Confirm frontend points to backend through `VITE_API_BASE_URL`.
4. Validate websocket connection status in UI before demo.
5. If websocket drops, confirm polling fallback still updates the inbox and timeline.
6. For the operator flow, open Telegram Web or WhatsApp Web in a separate tab before using the inbox.

## Webhook registration (Telegram)

For a public webhook URL during development you can use `ngrok` or `localtunnel` to expose the backend `PORT`.

1. Start backend (example):

```bash
cd backend
npm run dev
```

2. Expose `PORT` with ngrok (example):

```bash
ngrok http 4000
# note the https URL returned by ngrok, e.g. https://abc123.ngrok.io
```

3. Register the Telegram webhook using the included CLI helper (requires `TELEGRAM_BOT_TOKEN`):

```bash
# set TELEGRAM_BOT_TOKEN and WEBHOOK_ADMIN_TOKEN in backend/.env
npm run set-webhook -- --url https://abc123.ngrok.io/api/providers/telegram/webhook
```

Or use the admin endpoint (protected by `x-admin-token` header):

```bash
curl -X POST https://abc123.ngrok.io/api/admin/telegram/set-webhook \
  -H "x-admin-token: $WEBHOOK_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://abc123.ngrok.io/api/providers/telegram/webhook"}'
```

4. If you configured `TELEGRAM_WEBHOOK_SECRET`, incoming Telegram webhooks will include the header `X-Telegram-Bot-Api-Secret-Token` and the backend will validate it.

Hosted linking flow

- The app supports a hosted linking flow so end users never paste tokens. Operators should run a hosted Telegram bot and WhatsApp phone number using the credentials configured in the backend env. Users then link their provider session by generating a short `LINK <code>` inside the web UI and sending that code to the hosted bot/number. The webhook listener will detect the `LINK <code>` message and bind the provider chat to the user's account.
- Operator responsibilities:
  - Provide and configure `TELEGRAM_BOT_TOKEN` and `WHATSAPP_ACCESS_TOKEN` in the backend env.
  - Ensure webhooks point to `/api/providers/telegram/webhook` and `/api/providers/whatsapp/webhook`.
  - Use the admin endpoints `POST /api/admin/telegram/set-webhook` and `POST /api/admin/providers/test` to register webhooks and validate sending.

## Media hosting (Cloudinary + Formidable)

For inbound media (WhatsApp) and client uploads, the backend downloads or receives files and uploads them to Cloudinary for stable public URLs.

Required environment variables (backend):

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Notes:

- The backend exposes a multipart upload endpoint `POST /api/uploads/formidable` which accepts a `file` form field and uploads the file to Cloudinary.
- A base64 fallback remains available: `POST /api/uploads/base64` accepts `dataUrl` and uploads to Cloudinary.
- Configure Cloudinary credentials in Render under the service environment variables when deploying.

Client uploads (dev):

- Use the multipart endpoint `POST /api/uploads/formidable` with a `file` form field for direct browser uploads (FormData).
- For privacy or large uploads you may prefer client-side encryption before uploading.

## Deployment notes (Render)

- Render is a good choice for hosting both backend and static frontend. Set the `VITE_API_BASE_URL` in the frontend service environment to point to your backend URL.
- Add the Cloudinary env vars (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) to the backend's environment in Render.
- Ensure that the backend `PORT` is set via Render's service settings (Render sets `PORT` automatically for web services). Use `process.env.PORT` as available.

## Required environment variables (quick reference)

Use `backend/.env.example` as a starting point. At minimum, set these before deploying or running in development:

- `MONGODB_URI` — MongoDB connection string (production should use a managed DB)
- `CORS_ORIGIN` — frontend origin (e.g., `https://your-frontend.example.com`)
- `DEMO_ENCRYPTION_KEY` — (development demo only) 32+ char secret used by server AES helpers
- `WHATSAPP_VERIFY_TOKEN` — token for WhatsApp webhook verification
- `TELEGRAM_BOT_TOKEN` — Telegram bot token (optional for Telegram flows)
- `TELEGRAM_WEBHOOK_SECRET` — secret to validate Telegram webhook callbacks (optional)
- `WHATSAPP_ACCESS_TOKEN` — WhatsApp Cloud API access token
- `WHATSAPP_PHONE_NUMBER_ID` — WhatsApp phone number ID for API calls
- `WEBHOOK_ADMIN_TOKEN` — short admin secret to protect webhook admin endpoints
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — Cloudinary credentials for media hosting

For development, copy `backend/.env.example` to `backend/.env` and fill values. Keep private keys and tokens out of source control.

## Running locally

Backend (development):

```bash
cd backend
cp .env.example .env  # edit .env
npm install
npm run dev
```

Backend (production build):

```bash
cd backend
npm install --production
npm run build
npm start
```

Frontend (development):

```bash
cd frontendReactJs
cp .env.example .env # set VITE_API_BASE_URL if needed
npm install
npm run dev
```

Frontend (production build for static hosting):

```bash
cd frontendReactJs
npm install
npm run build
# deploy the `dist` folder (see Render instructions below)
```

## Deploying to Render (example)

- Backend: create a new Web Service using the `backend` folder as the deploy path.
  - Build command: `npm ci --include=dev && npm run build` (the `--include=dev` flag is required when `NODE_ENV=production` is set — without it, TypeScript and `@types/*` are omitted and `tsc` fails)
  - Start command: `npm start`
  - Environment: add all required env vars from the reference above.

- Frontend: create a new Static Site (or Web Service) using the `frontendReactJs` folder.
  - Build command: `npm ci --legacy-peer-deps && npm run build`
  - Publish directory: `frontendReactJs/dist`
  - Environment: set `VITE_API_BASE_URL` to your deployed backend URL (e.g. `https://your-backend.onrender.com`)

After deploying, register Telegram/WhatsApp webhooks (see above) using your backend public URL.

If you prefer a single server deployment, the frontend build can be served from the backend; however this repo expects separate frontend/static hosting and a backend API service.

## Troubleshooting

- Web app shows no data:
  - check backend logs for DB connection errors
  - inspect `/api/messages` response in browser network tab
- Realtime status stuck in fallback:
  - verify Socket.IO origin and backend URL
  - confirm reverse proxy supports websocket upgrades
- Decryption issues:
  - ensure same `DEMO_ENCRYPTION_KEY` is used on all backend instances

## Extension Points

- Replace placeholder provider outbound behavior in `messages.route.ts` with actual API calls.
- Add attachment upload flow (cloud storage + signed URLs) instead of URL-only image attachments.
- Add richer inbox grouping if you want separate secure/standard folders per provider.
