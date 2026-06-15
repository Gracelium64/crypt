# Crypt Companion
 
MVP demo stack:

- Backend: Node.js + TypeScript + Express + MongoDB + Socket.IO
- Frontend: React + TypeScript (Vite)

## Project Structure

- `backend/`: API, provider webhooks, encryption service, realtime events
- `frontendReactJs/`: web companion app UI
- `frontendReactNative/`: phase 2 placeholder
- `frontendFlutter/`: phase 2 placeholder
- `docs/`: maintainer and learner guides

## Quick Start

### 1) Backend

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

### 2) Frontend

```bash
cd frontendReactJs
npm install
npm run dev
```

By default:

- backend: `http://localhost:4000`
- frontend: `http://localhost:5173`

If needed, set `VITE_API_BASE_URL` in frontend to point to deployed backend.

## Environment

Copy the example env into the backend folder before starting the server:

```bash
cp .env.example backend/.env
```

Key variables in `backend/.env`:

- `MONGODB_URI` — MongoDB connection string (required)
- `DEMO_ENCRYPTION_KEY` — local master key for encrypting provider secrets (min 32 chars)
- `CORS_ORIGIN` — origin for frontend during development (default `http://localhost:5173`)
- `JWT_SECRET` — optional JWT signing secret for auth flows
- `SE_CRETS_MASTER_KEY` — optional real master key for AES-GCM secret encryption

Frontend override (optional):

- `VITE_API_BASE_URL` — backend base URL (e.g. `http://localhost:4000`)

## Smoke-test checklist (local)

Run these steps to validate core flows locally. Some steps require a running MongoDB instance and valid env vars in `backend/.env`.

1. Build backend TypeScript (compilation check):

```bash
cd backend
npm install
npm run build
```

2. Build frontend (already used by dev or for production assets):

```bash
cd frontendReactJs
npm install
npm run build
```

3. Start the backend dev server (requires `MONGODB_URI`):

```bash
cd backend
npm run dev
```

4. Start the frontend dev server:

```bash
cd frontendReactJs
npm run dev
```

5. Manual integration checks (with backend running):

- Health check:

```bash
curl -s http://localhost:4000/health | jq
```

- Signup & login (returns JWT):

```bash
curl -s -X POST http://localhost:4000/api/auth/signup -H "Content-Type: application/json" -d '{"email":"alice@example.com","password":"password"}' | jq
curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"alice@example.com","password":"password"}' | jq
```

- Generate keypair (frontend Key Manager) and `Register Public Key` (or POST `/api/keys/register` with `Authorization: Bearer <token>`)

- Create a LINK code in-app (Provider Link), open deep link or copy code into provider web client to complete linking

- Send a secure message from the web UI (compose → select `secure`), verify it appears in the timeline and can be decrypted by the recipient key

If you want, I can attempt these checks from this environment — I can compile and build (already done), but I cannot fully run integration checks that require a running MongoDB unless you provide a reachable `MONGODB_URI` or allow me to start a local Mongo instance.

## MVP Feature Flags

Implemented now:

- Realtime updates through Socket.IO
- Polling fallback every 10 seconds when socket disconnects
- Provider sidebar navigation for Telegram and WhatsApp
- Provider web sign-in links to the official web clients
- Conversation inbox derived from stored messages
- Secure and plain reply modes for each selected thread
- Full Image Attachment pipeline:
  - Frontend image upload preview, file selection & clearing.
  - Formidable multipart upload: browser uploads files to the backend which processes them with `formidable`.
  - Cloudinary hosting: backend uploads media to Cloudinary for stable public URLs (proxy and base64 upload fallback supported).
  - Inbound WhatsApp file pipeline: auto-download and store images in Cloudinary from Meta callbacks.
- Telegram Webhook Admin CLI and API endpoints.

Notes:

- Telegram and WhatsApp web clients are used for browser sign-in and operator access.
- The backend still uses Telegram bot credentials and WhatsApp Cloud API credentials for message delivery and inbound webhook handling.

Planned next:

- real Telegram outbound adapter
- real WhatsApp outbound adapter
- production-grade auth and access control
