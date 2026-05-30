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
- Provider selection (`telegram`, `whatsapp`, `mock`)
- Send outbound text with optional encryption
- Simulate inbound webhook messages for demo testing
- Full Image Attachment pipeline:
  - Frontend image upload preview, file selection & clearing.
  - S3 Direct Upload: secure direct-to-S3 browser upload using secure presigned PUT URLs, offloading backend server workload.
  - Base64 Proxy Upload: automated proxy server-side fallback if AWS credentials aren't initialized yet.
  - Inbound WhatsApp file pipeline: auto-download and store images directly on S3 from Meta callbacks.
- Telegram Webhook Admin CLI and API endpoints.

Planned next:

- real Telegram outbound adapter
- real WhatsApp outbound adapter
- production-grade auth and access control
