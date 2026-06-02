# Go-Live Guide & Estimate — crypt

## Estimated Time to Go Live (with 30% buffer)

- **Base estimate:** 6-8 hours (focused, experienced dev)
- **With 30% buffer:** 8-10.5 hours
- **Includes:**
  - Credential setup (Telegram, WhatsApp, Cloudinary)
  - Webhook registration
  - Render deployment
  - Live verification
  - Full code/database review and refactor (learning pace)
  - Bug fixes and troubleshooting

---

## Step-by-Step Go-Live Guide

### 1. Prepare Credentials

- [ ] Telegram Bot Token (from @BotFather)
- [ ] Telegram Webhook Secret (optional, for extra security)
- [ ] WhatsApp Graph API Access Token (from Facebook Developer Console)
- [ ] WhatsApp Phone Number ID
- [ ] Cloudinary cloud name
- [ ] Cloudinary API key & API secret

### 2. Configure Environment Variables

- Copy `.env.example` to `.env` (if not already present)
- Fill in all required values:
  - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`
  - `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
  - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
  - `MONGODB_URI` (your MongoDB connection string)
  - `FRONTEND_URL`, `BACKEND_URL` (for CORS)

### 3. Set Up Cloudinary

- Create a Cloudinary account (if needed)
- Note your `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`

### 4. Register Telegram Webhook

- Run the CLI script: `npm run telegram:set-webhook`
- Provide your public backend URL and webhook secret
- Confirm webhook is set via Telegram API

### 5. Register WhatsApp Webhook

- In Facebook Developer Console, set webhook URL to your backend endpoint
- Subscribe to message and media events
- Confirm webhook is receiving events

### 6. Deploy to Render (or other host)

- Push code to your repo
- Create new Render services for backend and frontend
- Set all environment variables in Render dashboard
- Deploy and monitor logs for errors

### 7. Live Verification

- Send test messages from Telegram and WhatsApp
- Upload images from frontend, confirm Cloudinary upload and media delivery
- Check MongoDB for message records
- Confirm real-time and polling updates in frontend

### 8. (Optional) Refactor Database/Code

- Review all models and code for your preferred style
- Make schema or code changes as desired
- Re-run build and tests after changes

### 9. Troubleshooting

- Check logs for errors (backend, frontend, Render)
- Use simulation endpoints for debugging
- Refer to docs/MAINTAINER_GUIDE.md and README.md for common issues

---

**Ready to proceed? Approve to start step-by-step guidance.**
