# Scalability — Current State and What Real Production Scale Requires

Written 2026-06-16 as part of a full codebase audit. Reflects the architecture as deployed on Render (one backend Web Service instance, one frontend Static Site).

---

## The core structural blocker: MTProto sessions are stateful and in-process

`backend/src/services/telegram-mtproto.service.ts` keeps all live Telegram MTProto connections in module-level `Map`s:

```ts
const clients = new Map<string, TelegramClient>();   // accountId -> live connection
const pendingAuth = new Map<string, PendingAuth>();   // in-progress phone-code logins
const pendingQr = new Map<string, PendingQr>();       // in-progress QR logins
```

These live only in the memory of whichever single Node process is running. Consequences:

- **No horizontal scaling is possible today.** If you ran two backend instances behind a load balancer, a request routed to instance B could never see a client connected on instance A — `hasActiveClient(accountId)` would incorrectly return `false`, breaking message delivery for that user.
- This hasn't surfaced as a problem because Render is currently configured as a single instance. It caps you at *vertical* scaling (a bigger instance) only.
- Real horizontal scaling requires either: (a) sticky session affinity per `accountId` at the load-balancer level, or (b) splitting MTProto handling into its own dedicated stateful worker tier, separate from the stateless REST API.

This is the one item that can't be incrementally patched — it requires an architectural decision before any multi-instance deploy.

## Socket.IO has no cross-instance adapter

`backend/src/services/realtime.service.ts`'s `broadcastMessage` calls `io.emit(...)` on a single in-process Socket.IO server. If you ran multiple instances, a message could be broadcast successfully but never reach a browser socket connected to a *different* instance — silent, intermittent message loss with no error anywhere.

**Fix when needed:** add the Socket.IO Redis adapter (`@socket.io/redis-adapter`) before any multi-instance deploy. Until then, this is a hard prerequisite for the MTProto fix above to even matter — both need solving together.

## Missing index on the hottest query path

`ProviderConnection.providerChatId` (`backend/src/models/providerConnection.ts`) has no index — only `username` does. This field is looked up on **every single inbound webhook event and every outbound fan-out check** (the exact query that caused the "ghost connection" bug documented in `LESSON_PLAN.md` Module 17). Fine at current data volume; becomes a full collection scan as the `providerconnections` collection grows. Low-effort, high-value fix whenever this file is next touched: add `index: true` to that field.

## No caching layer, no job queue

Cloudinary uploads, Telegram `sendCode()` calls, and all DB writes run inline in the request/response cycle. A slow upstream call (Telegram, Meta, Cloudinary) blocks that request's event-loop turn. Fine at low concurrency. At real scale, long-running operations (especially file uploads and MTProto auth) would benefit from being offloaded to a background job queue (e.g. BullMQ) rather than held open in the HTTP request.

## No rate limiting (cross-reference: security audit)

Already flagged as a security gap, but it's equally a scalability/cost-protection one — nothing currently stops a single client from hammering the database or burning Cloudinary/WhatsApp API quota. (Addressed in this session — see `AUDIT_CHANGELOG.md`.)

## No observability

Only `console.error`/`console.log`, no APM or error-tracking service (e.g. Sentry). Diagnosing a production incident today means reading raw Render logs, which doesn't scale past "one developer who already knows the codebase."

## What scales fine as-is

- The REST API itself is stateless and scales horizontally with no changes.
- Telegram Bot API and WhatsApp Cloud API sends are plain `fetch()` calls — no persistent connection, no shared state.
- The frontend is a static build served by Render's CDN — scales independently of the backend.
- MongoDB Atlas is already a managed, scalable database tier; the index gap above is a configuration fix, not an architecture problem.

## Practical takeaway

This is production-ready for **one backend instance, moderate concurrent users** — which matches a deployed personal/demo-scale app well. Scaling meaningfully beyond that requires solving the MTProto session-affinity problem and the Socket.IO cross-instance broadcast problem *together*, since one without the other still breaks message delivery. Everything else in this document (the index, the rate limiting, the job queue, observability) is comparatively cheap and can be done incrementally without an architecture change.
