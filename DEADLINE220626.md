# Remaining External Tasks & Timeline (DEADLINE220626)

This file lists tasks that require operator / external intervention (credentials, webhooks, devices) and provides conservative time estimates including a 30% buffer for troubleshooting and errors.

NOTE: I will not modify your live environment or commit changes — these steps require you to provide secrets or perform provider-side actions.

1. Provide provider credentials and secrets (required)
   - `TELEGRAM_BOT_TOKEN` (and optionally `TELEGRAM_BOT_USERNAME`) — used for Telegram outbound sends and webhook configuration.
   - `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_NUMBER` — used for WhatsApp Cloud API sends and deep links.
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` — optional but required for production media hosting.
   - `WEBHOOK_ADMIN_TOKEN` — admin secret for completing LINK codes programmatically.
   - `SE_CRETS_MASTER_KEY` or `DEMO_ENCRYPTION_KEY` — master key for server-side secret encryption (DEMO key exists but rotate for production).

Estimated operator time: 15–45 minutes to gather credentials and copy them into `backend/.env` or your host environment.

# Remaining External Tasks & Timeline (DEADLINE220626)

This document now reflects work completed by the developer and the remaining tasks that require operator action. It includes conservative time estimates with a 30% buffer for troubleshooting.

NOTE: I will not modify your live environment or commit secrets — the operator must provide credentials or perform provider-side actions.

Developer work completed (no action required from you):

- Swagger UI and minimal OpenAPI spec added (`/api/docs`, `/api/openapi.json`).
- Centralized network helpers (`frontendReactJs/src/lib/api.ts`).
- Client WebCrypto helpers centralized (`frontendReactJs/src/lib/crypto.ts`).
- `sendMessage` logic extracted to `frontendReactJs/src/services/messages.ts`.
- Basic E2E unit test for crypto added (`frontendReactJs/src/lib/crypto.test.ts`).
- CI workflow added to build backend & frontend and run frontend tests (`.github/workflows/ci.yml`).

Remaining operator tasks (requires your help)

1. Provide provider credentials and secrets (required)
   - `TELEGRAM_BOT_TOKEN` (and optionally `TELEGRAM_BOT_USERNAME`)
   - `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_NUMBER`
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (optional for media hosting)
   - `WEBHOOK_ADMIN_TOKEN` (admin secret used for link completion / testing)
   - `SE_CRETS_MASTER_KEY` or `DEMO_ENCRYPTION_KEY` (master key for server-side encrypted provider tokens)

Estimated operator time: 15–45 minutes to gather credentials and add them to `backend/.env` or your host environment.

2. Provide test targets / device readiness
   - One or more provider-side test accounts or chat IDs (Telegram chat ID/username, WhatsApp test number in E.164).
   - Optionally provide a public webhook URL (or run an `ngrok` tunnel) so the backend can receive provider webhooks.

Estimated operator time: 10–30 minutes to collect test IDs and start ngrok (if needed).

3. Webhook registration / provider console actions
   - Configure Telegram webhook to point at `https://<public-host>/api/providers/telegram/webhook` (set webhook secret if used).
   - Configure WhatsApp webhook to point at `https://<public-host>/api/providers/whatsapp/webhook` and subscribe to message/media events.

Estimated operator time: 15–60 minutes (depends on provider console familiarity).

What I will do after you provide the above

- Configure the backend locally (no git commits) with your credentials.
- Run the smoke-test script and complete link flows (admin token required for programmatic completion if you prefer automation).
- Validate send/receive flows and attachments; fix adapter issues if provider APIs require header/auth tweaks.

Developer work remaining (I can run these without your input)

- Verify provider flows and finalize adapter tweaks (requires credentials) — performed after you provide secrets.

Conservative time estimate to finish end-to-end verification (developer + operator)

- Operator prep (provide credentials, start ngrok): 0.25–1.0 hours
- Developer verification & fixes (after creds): 2.0–4.0 hours (base)

Applying a 30% troubleshooting buffer increases the developer window to ~2.6–5.2 hours and the overall operator+developer window to roughly 3–6 hours.

Recommended planning: allocate one working day (8 hours) to allow for unexpected provider issues, deployment, and final verification.

Quick checklist you can act on now

- [ ] Collect and paste credentials into a local `backend/.env` (do not commit)
- [ ] Provide one test chat ID / phone number for Telegram or WhatsApp
- [ ] Provide a public webhook URL or run `ngrok http 4000` and share the forwarding URL
- [ ] Share `WEBHOOK_ADMIN_TOKEN` if you want programmatic link completion during verification

If you provide credentials and a public URL, I will run the verification steps and report results (no commits will be made). Otherwise I can provide a ready-to-run checklist with exact commands for you to execute locally.
