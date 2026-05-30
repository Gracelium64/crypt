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

## Media hosting (WhatsApp -> S3)

For WhatsApp inbound media, the backend can download media via the Graph API and upload it to an S3 bucket so the frontend can display hosted images.

Required environment variables (backend):

- `AWS_ACCESS_KEY_ID` (optional if using instance profile)
- `AWS_SECRET_ACCESS_KEY` (optional)
- `AWS_REGION` (default: `us-east-1`)
- `S3_BUCKET` (name of bucket used to host media)

Notes:

- The S3 bucket should allow object uploads from the service account and either be public-read for demo simplicity or use signed URLs for access control.
- Configure these secrets in Render under the service environment variables when deploying.

When running locally, set these variables in `backend/.env` and ensure the AWS credentials have permissions to `s3:PutObject` on the target bucket.

Client uploads (dev):

- A simple helper endpoint is available for demos: `POST /api/uploads/base64` accepts a JSON body with `dataUrl` (data:<mime>;base64,<data>) and returns a hosted `url` after uploading to S3. Use this for quick frontend prototyping without implementing multipart upload.
- For better UX and scale, the backend also exposes a presign endpoint: `POST /api/uploads/presign` which returns a signed `uploadUrl` (PUT) and the final `objectUrl`. The frontend can PUT directly to S3 using the signed URL and avoid proxying bytes through the backend.

S3 CORS example (set on the bucket to allow browser PUTs and GETs):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://your-frontend.example.com"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Note: replace `AllowedOrigins` with your frontend origin(s). For production, prefer private buckets with signed access rather than `public-read` ACLs.

## Deployment notes (Render)

- Render is a good choice for hosting both backend and static frontend. Set the `VITE_API_BASE_URL` in the frontend service environment to point to your backend URL.
- Add the AWS env vars and `S3_BUCKET` to the backend's environment in Render.
- Ensure that the backend `PORT` is set via Render's service settings (Render sets `PORT` automatically for web services). Use `process.env.PORT` as available.

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
