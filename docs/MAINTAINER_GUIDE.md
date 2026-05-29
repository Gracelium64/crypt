# Maintainer Guide

## What This System Does

Crypt Companion is a web companion app demo that ingests provider messages, applies optional encryption/decryption logic, stores events in MongoDB, and pushes updates to web clients in realtime.

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

- `GET /health`: service health
- `GET /api/messages`: message query (supports `provider`, `chatId`, `since`, `limit`)
- `POST /api/messages/send`: creates outbound event and emits realtime update
- `POST /api/messages/mock-inbound`: creates inbound event for demo simulation
- `POST /api/providers/telegram/webhook`: Telegram inbound webhook
- `GET /api/providers/whatsapp/webhook`: WhatsApp verification endpoint
- `POST /api/providers/whatsapp/webhook`: WhatsApp inbound webhook

## Operational Checklist

1. Verify MongoDB connectivity before starting backend.
2. Confirm backend `CORS_ORIGIN` matches frontend host.
3. Confirm frontend points to backend through `VITE_API_BASE_URL`.
4. Validate websocket connection status in UI before demo.
5. If websocket drops, confirm polling fallback still updates timeline.

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
- Add auth middleware and chat ownership checks before enabling multi-user access.
