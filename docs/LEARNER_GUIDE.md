# Learner Guide

## Learning Goal

Build a live messaging demo with two key patterns:

1. event-driven updates (webhooks + realtime sockets)
2. fallback resilience (polling when realtime disconnects)

## How Data Flows

1. A message enters through send endpoint or provider webhook.
2. Backend normalizes and stores it in MongoDB.
3. Backend emits `message:new` over Socket.IO.
4. React app appends it instantly.
5. If socket disconnects, React polls `/api/messages` every 10 seconds.

## File-By-File Tour

- `backend/src/server.ts`
  - app bootstrap, middleware, routers, Socket.IO initialization.
- `backend/src/routes/messages.route.ts`
- read messages, send outbound, inbound handled via provider webhooks.
- `backend/src/routes/providers.route.ts`
  - Telegram and WhatsApp webhook handlers.
- `backend/src/routes/admin.route.ts` & `backend/src/scripts/telegram-set-webhook.ts`
  - safe admin routes and CLI tool to register webhooks.
  - `backend/src/routes/uploads.route.ts` & `backend/src/services/media.service.ts`
  - Cloudinary media uploads (Formidable multipart and base64 proxy fallbacks) for hosting media attachments.
- `backend/src/services/crypto.service.ts`
  - AES-GCM encrypt/decrypt with marker prefix.
- `frontendReactJs/src/App.tsx`
  - UI, socket lifecycle, polling fallback, send/simulate actions.

## Why These Choices

- Socket.IO makes the demo visibly live.
- Polling fallback avoids demo failure when websocket transport is blocked.
- MongoDB gives flexible storage while message schema evolves.
- TypeScript helps prevent route and payload shape mistakes.
  - Using Cloudinary offloads hosting; Formidable-based multipart endpoint accepts browser FormData uploads.
  - Base64 upload API fallback ensures front-end developers can test image pipelines without Cloudinary credentials in dev.

## Common Mistakes To Avoid

- Forgetting to set backend env values before running dev server.
- Mismatch between frontend API base URL and backend origin.
- Assuming browser app can intercept native app notifications.
- Treating encryption key as optional; wrong key breaks decryption.

## Practice Exercises

1. Add a filter for only inbound messages in the UI.
2. Add delivery status field (`queued`, `sent`, `failed`) to message schema and render it.
3. Add simple retry endpoint for failed outbound provider sends.
4. Replace the demo simulation with one real Telegram test webhook flow.

## Interview-Framing Style Summary (Optional)

You can describe this project as: a realtime companion messaging dashboard that normalizes cross-provider events, stores encrypted transport payloads, and guarantees user-visible updates through websocket-first transport with polling fallback.
