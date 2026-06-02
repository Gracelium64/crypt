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
