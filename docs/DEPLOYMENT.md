Deployment guide

Backend (Docker)

1. Build image locally:

```bash
cd backend
docker build -t crypt-backend:latest .
```

2. Run container (set env vars):

```bash
docker run -p 4000:4000 \
  -e MONGODB_URI="your-mongo-uri" \
  -e CLOUDINARY_CLOUD_NAME=... \
  -e CLOUDINARY_API_KEY=... \
  -e CLOUDINARY_API_SECRET=... \
  -e DEMO_ENCRYPTION_KEY="your-demo-key-at-least-32" \
  crypt-backend:latest
```

Render / Static deploy

- Use the `backend` folder as a Node web service (build command `npm run build`, start `npm start`).
- Use the `frontendReactJs` folder as a static site (build `npm run build`, publish `frontendReactJs/dist`).

Notes

- Ensure `WEBHOOK_ADMIN_TOKEN` is set prior to calling any admin endpoints.
- Ensure `SE_CRETS_MASTER_KEY` is configured if you will store per-connection encrypted tokens.

Deep-link config (optional but recommended)

- `TELEGRAM_BOT_USERNAME`: (optional) the bot username (e.g. `MyBot`). When set, the link generator will produce a Telegram deep-link `https://t.me/<bot>?start=<code>` so users can open the chat and send the linking payload with one click.
- `WHATSAPP_NUMBER`: (optional) the E.164 phone number for the hosted WhatsApp connector (e.g. `+15551234567`). When set, the link generator will produce a WhatsApp URL `https://api.whatsapp.com/send?phone=<number>&text=LINK%20<code>` to prefill the linking message.

Notes

- Deep links are optional. If absent, users will be given the `LINK <code>` string to copy and paste into their provider client. When present, Crypt will attempt to open the provider client automatically and prefill the message (user must confirm/send in their provider app).
- For WhatsApp, the phone number is the end-user-facing number (E.164). The Graph API uses a separate `WHATSAPP_PHONE_NUMBER_ID` for outbound API calls; both can be present.
