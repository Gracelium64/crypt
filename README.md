# Crypt Companion

## This project was conducted as a AI Assisted Development project for a WBS bootcamp.

Meaning:

- The project was planned and orchestrated by Grace
- Execution was done mostly with AI Coding Agent
- Main take from this process is that although speed for producing a working prototype was highly improved, intensive code review is still pending completion for after the project's deadline
- In addition to the code review, understanding of project elements that were not taught during the bootcamp is underway
- As a teaching exercise this project will be rebuilt to a React Native app in a process of self learning to bridge the knowledge gap from ReactJS to React Native

#

MVP demo stack:

- Backend: Node.js + TypeScript + Express + MongoDB + Socket.IO
- Frontend: React + TypeScript (Vite)

## Project Structure

- `backend/`: API, provider webhooks, encryption service, realtime events
- `frontendReactJs/`: web companion app UI
- `frontendReactNative/`: phase 2 placeholder
- `frontendFlutter/`: phase 2 placeholder
- `docs/`: maintainer and learner guides
- `CRYPT_SPECS.md`: full technical spec (stack, routes, encryption, env vars)
- `SCALABILITY.md`: current scaling limits and what real production scale requires
- `AUDIT_CHANGELOG.md`: dated log of security/cleanup changes with restoration notes — check this first when debugging something unexpected
- `LESSON_PLAN.md`: guided codebase walkthrough

## Quick Start

### 1) Backend

```bash
cd backend
cp env.example .env
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
cp backend/env.example backend/.env
```

Key variables in `backend/.env`:

- `MONGODB_URI` — MongoDB connection string (required)
- `JWT_SECRET` — required JWT signing secret, min 32 chars (`openssl rand -hex 32`)
- `DEMO_ENCRYPTION_KEY` — required, min 32 chars (encrypts Telegram session strings at rest; also available as a general server-side AES helper — see `CRYPT_SPECS.md`)
- `CORS_ORIGIN` — origin for frontend during development (default `http://localhost:5173`)
- `SE_CRETS_MASTER_KEY` — optional real master key for AES-GCM secret encryption (currently no callers; reserved for a future secrets vault feature)

Full variable list with required/optional status: `CRYPT_SPECS.md`.

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
# password: 8–24 chars; displayName is optional
curl -s -X POST http://localhost:4000/api/auth/signup -H "Content-Type: application/json" -d '{"email":"alice@example.com","password":"password1","displayName":"Alice"}' | jq
curl -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{"email":"alice@example.com","password":"password1"}' | jq
```

- Generate keypair (frontend Key Manager) and `Register Public Key` (or POST `/api/keys/register` with `Authorization: Bearer <token>`)

- Create a LINK code in-app (Provider Link), open deep link or copy code into provider web client to complete linking

- Send a secure message from the web UI (compose → select `secure`), verify it appears in the timeline and can be decrypted by the recipient key

If you want, I can attempt these checks from this environment — I can compile and build (already done), but I cannot fully run integration checks that require a running MongoDB unless you provide a reachable `MONGODB_URI` or allow me to start a local Mongo instance.

## MVP Feature Flags

Implemented now:

- Realtime updates through Socket.IO with 30 s keep-alive polling and reconnect catch-up flush
- Polling fallback every 10 seconds when socket disconnects
- Provider sidebar navigation for Telegram and WhatsApp
- Conversation inbox derived from stored messages
- Secure and plain reply modes for each selected thread
- Full Image Attachment pipeline (Formidable multipart + Cloudinary hosting + inbound WhatsApp media)
- Telegram MTProto direct connection: phone-code login, QR-code login, and CryptBot fallback
- WhatsApp Business API integration (Cloud API webhook + fan-out delivery)
- E2E encryption: ECDH P-256 key exchange, AES-GCM per-message encryption, cross-device key sync via PBKDF2-wrapped private key stored server-side
- Fan-out message copy system: both parties see every message in Crypt regardless of delivery path
- Ghost-connection guard: ProviderConnection accountId is verified against the accounts collection before fan-out to prevent deleted accounts intercepting messages
- Key fallback resolution: `getKey` resolves via ProviderConnection → Account → email if a direct lookup misses
- Deployed to Render (backend Web Service + frontend Static Site)
- Rate limiting on auth and link/contact-lookup endpoints (`express-rate-limit`)
- Login lockout after 8 consecutive failed attempts (15-minute lockout)
- Upload validation: 10MB size cap and a MIME allow-list on plain (unencrypted) attachments — encrypted attachments are exempt since they're ciphertext, not a real file type
