# Project Status — DEADLINE220626

Last updated: 2026-06-20 (after Refactor Pass 2 Correction)

---

## Completed

### Core infrastructure
- Express + MongoDB (Atlas, `crypt` database) backend
- React + Vite frontend, mobile-first
- JWT authentication (register / login / logout)
- Socket.IO real-time message broadcasting, per-account rooms (Pass 1 C9)
- Cloudinary media hosting (image attachments)

### Encryption
- ECDH P-256 + AES-GCM E2E encryption via `crypto.subtle`
- Auto keypair generation on login (silent, no manual step)
- **Server-side encrypted private key backup** (PBKDF2 + AES-GCM, password-derived — Module 11 Bug 2)
  - New device restores private key from server blob using login password; server never holds plaintext key
  - Replaces the "offline key recovery" gap from the 2026-06-08 status
- Key mirrored from email to Telegram user ID on MTProto connect
- Refactor Pass 1 C4: email removed from JWT payload; all key lookups now use accountId

### Telegram
- Telegram Bot (CryptBot) for webhook-based message delivery
- Telegram MTProto via gramjs (`telegram@2.26.22`) for direct user-to-user messaging
- Phone auth flow: request code → verify code → optional 2FA
- QR login flow: `signInUserWithQrCode` → second device scan → optional 2FA (Module 16)
- Auto `ProviderConnection` creation from MTProto identity
- Session persistence across backend restarts (`TelegramSession` model, AES-GCM encrypted at rest — Pass 1 C1)
- Fan-out: outbound messages create inbound copy for recipient
- Ghost connection protection: account existence verified before fan-out (Module 17)
- CryptBot echo filter: bot's own messages suppressed from MTProto subscription

### WhatsApp
- Meta WhatsApp Cloud API (official REST, raw `fetch()` — no unofficial clients)
- Outbound send and inbound webhook (`POST /api/providers/whatsapp/webhook`, HMAC-verified)
- Fan-out pattern same as Telegram bot path
- `ConnectWhatsApp.tsx` and `FindContact.tsx` WhatsApp provider toggle (Module 12)
- Currently limited to Meta's shared test number with 5-recipient approval cap pending business verification

### Security & authorization (Pass 2 Correction — 2026-06-20)
- Router-level `authorize()` on all 21 owner-only (Group C) routes
- `GET /provider/resolve` restricted to `requireAdmin` (no frontend caller; prevents membership enumeration)
- Rate limiting extended to Telegram action routes (`request-code`, `verify-code`, `request-qr`, `qr-2fa`)
- `linkRateLimiter` on `POST /provider/link/init`
- Swagger/OpenAPI gated behind JWT in production (`NODE_ENV === "production"`)
- Helmet HTTP security headers (HSTS, X-Frame-Options, X-Content-Type-Options, etc.)

### Production deployment (Render)
- Backend: Web Service (Node-native, not Docker)
- Frontend: Static Site (`dist/`)
- Both live and accessible
- See `docs/PRODUCTION_CHECKLIST.md` for the full deployment guide

### CSS architecture (Pass 2)
- `App.css` (822 lines) split into 13 scoped CSS files under `src/styles/`
- 122 inline `style={}` props extracted to CSS; 1 intentional dynamic inline style retained

### User flow (current)
1. Sign up / sign in
2. Settings → Connect Telegram → enter phone → enter code from Telegram app (or QR with second device, or CryptBot link)
3. Done — conversations visible in Chats tab, messages E2E encrypted

---

## Remaining / Not Started

### WhatsApp full production access (blocked on credentials)
- Business verification and Meta App Review required to lift 5-recipient cap
- Dedicated SIM or VoIP number required (personal number cannot be used — see planning/LESSON_PLAN.md WhatsApp handoff)

### CI workflow
- `ci.yml` removed during refactor — restore if needed

### Minor / polish
- `App.css` (orphaned file, all rules distributed) — safe to delete in a cleanup pass
- WhatsApp provider status shows "Needs setup" until business credentials are added
- CODEBOOK.md (D8) deferred to Pass 3

---

## Not Required (descoped)
- Separate "Link Provider" bot-link step — replaced by MTProto direct connect and QR flow
- Manual key generation / registration UI — auto-handled on login
- `TelegramDirectSetup` component — removed (superseded by `ConnectTelegram.tsx` three-mode UI, Module 21)
