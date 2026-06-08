# Project Status — DEADLINE220626

Last updated: 2026-06-08

---

## Completed

### Core infrastructure
- Express + MongoDB (Atlas, `crypt` database) backend
- React + Vite frontend, mobile-first
- JWT authentication (register / login / logout)
- Socket.IO real-time message broadcasting
- Cloudinary media hosting (image attachments)

### Encryption
- ECDH P-256 + AES-GCM E2E encryption via `crypto.subtle`
- Auto keypair generation on login (silent, no manual step)
- Key stored in `localStorage`, public key registered to server
- Key patched in-place on re-login to fix `key_ops` compatibility (iOS/Android)
- Re-decrypt effect handles race condition when messages load before key is ready
- Key mirrored from email to Telegram user ID on MTProto connect

### Telegram
- Telegram Bot (CryptBot) for webhook-based message delivery
- Telegram MTProto via gramjs (`telegram@2.26.22`) for direct user-to-user messaging
- Phone auth flow: request code → verify code → optional 2FA
- Auto ProviderConnection creation from MTProto identity (no separate bot-link step)
- Session persistence across backend restarts (`TelegramSession` model)
- Fan-out: outbound messages create inbound copy for recipient so both parties see the message in Crypt
- Process-level crash guards for gramjs errors

### User flow (current, simplified)
1. Sign up / sign in
2. Settings → Connect Telegram → enter phone → enter code from Telegram app
3. Done — conversations visible in Chats tab, messages E2E encrypted

### UI
- Mobile-first shell with Chats / Find / Settings tabs
- Auto-scroll to bottom on new message
- Toast notifications (dismissible, togglable)
- Connected status chip + disconnect button in Settings
- Security & Keys section (auto-managed, visible for advanced users)
- Conversation list with security state badge

---

## Remaining

### WhatsApp (blocked on credentials)
- `whatsapp-web.js` or `@whiskeysockets/baileys` integration for direct messaging
- Equivalent MTProto-style phone auth flow for WhatsApp
- Fan-out and ProviderConnection auto-creation (same pattern as Telegram)
- **Blocked:** waiting for WhatsApp Business API credentials

### Offline key recovery (identified, not started)
- See `CLAUDE_HANDOFF_OFFLINE.md`
- Private key lost when localStorage is cleared → old messages unreadable after re-link
- Recommended fix: server-side encrypted key backup (PBKDF2 + AES-GCM, password-derived)

### Production deployment
- See `PRODUCTION_CHECKLIST.md`
- Not yet deployed to Render

### Minor / polish
- CI workflow (`ci.yml`) was removed during refactor — restore if needed
- WhatsApp provider status shows "Needs setup" (expected until credentials added)
- `KeyManager` component visible in Settings — can be collapsed into an Advanced section once key backup is implemented and users no longer need to think about keys

---

## Not Required (descoped)
- Separate "Link Provider" bot-link step — replaced by MTProto direct connect
- Manual key generation / registration UI (auto-handled on login)
- `TelegramDirectSetup` component — replaced by `ConnectTelegram`

---

## Time Estimate for Remaining Work

| Item | Estimate |
|------|----------|
| WhatsApp integration (after credentials) | 4–8 hours |
| Offline key backup | 3–5 hours |
| Production deployment (Render) | 1–2 hours |
| Testing + polish | 2–4 hours |
| **Total with 30% buffer** | **13–25 hours** |
