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

## Intentional Implementation Notes (read before refactoring)

### `importPrivateJwkKey` — `"deriveKey"` in usages is intentionally kept
**File:** `frontendReactJs/src/lib/crypto.ts`  
`importPrivateJwkKey` declares `["deriveKey", "deriveBits"]` as key usages on the private ECDH key. In practice, only `deriveBits` is called on the private key — `deriveKey` is called later on the derived HKDF key, not on the private key itself.

`"deriveKey"` is kept intentionally as a learning reference: it marks the distinction between the two Web Crypto derivation APIs. `deriveBits` returns raw bytes you handle yourself (used here, piped into HKDF). `deriveKey` returns a ready-to-use `CryptoKey` directly (skips manual HKDF step but is considered weaker practice for ECDH output). Both usages are declared to keep the contrast visible in the code. Do not remove `"deriveKey"` without updating this note.

---

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
5. Add a resource-loader to the `authorize()` call on `POST /messages/send` to verify the sender's `ProviderConnection` exists before hitting the controller.

## Interview-Framing Style Summary (Optional)

You can describe this project as: a realtime companion messaging dashboard that normalizes cross-provider events, stores encrypted transport payloads, and guarantees user-visible updates through websocket-first transport with polling fallback.
