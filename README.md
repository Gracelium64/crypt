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
- Optional image URL attachment in messages

Planned next:

- real Telegram outbound adapter
- real WhatsApp outbound adapter
- production-grade auth and access control
