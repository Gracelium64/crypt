# Crypt Companion — Functionality & User Flows

This document summarizes the current functionality implemented in the repository and the primary user flows for the live demo.

Core features

- Account sign up / sign in (JWT-based session token)
- Local E2E key generation (ECDH P-256), public-key directory registration
- Provider linking — three modes:
  - **Phone code** (MTProto direct): user enters phone number, receives code in Telegram app, full MTProto session established
  - **QR code** (MTProto direct): user scans QR on second device, session established without entering a phone number
  - **Via CryptBot** (`LINK <code>` flow): sends a link code to the bot, routes messages through the bot rather than direct user-to-user
- Provider connections (store encrypted provider tokens server-side)
- Compose and send messages (plain or secure). Secure messages: client-side ECDH → HKDF → AES-GCM, ciphertexts are prefixed with `[CRYPT:v1]`.
- Attachment handling: multipart upload via Formidable + Cloudinary hosting; encrypted attachments are uploaded as raw encrypted blobs and marked as `?crypt=1`.
- Realtime: Socket.IO push for new messages via per-account rooms (`join:account`); polling fallback (10s when disconnected, 30s safety net when connected).
- Unread indicators: blue dot and bold name per conversation in the chat list; blue dot on provider pill when the non-active provider has unread messages. Indicators clear immediately on conversation open (optimistic local update, no server round-trip).
- Account deletion (`DELETE /api/auth/account/nuke`): complete erasure — fan-out message copies in other accounts, provider-mirrored keys, links by providerChatId, and a proper `auth.LogOut` to Telegram before session deletion.

Primary user flows

1. Sign up / Sign in
   - User creates an account via `/api/auth/signup` (email + password + displayName).
   - User receives a JWT token used for authenticated API calls.

2. Key generation & registration
   - From Key Manager, user generates an ECDH P-256 keypair in-browser.
   - Public key is exported (raw → base64) and registered to the public directory via `/api/keys/register`.
   - Private key: stored in browser localStorage under `crypt:priv:<ownerId>` AND backed up server-side as an encrypted blob (`Key.privateKeyJwk`) — encrypted via PBKDF2+AES-GCM using the user's login password. New devices restore the private key from this server-side blob on login, without ever sending the plaintext key to the server.

3. Provider link (LINK <code>)
   - User requests a link code from the web UI (`/api/provider/link/init`).
   - UI copies `LINK <code>` to clipboard and attempts to open provider deep link.
   - The provider (telegram/whatsapp) side must send the `LINK <code>` message or the operator can complete the link via the admin webhook. The backend exposes `/api/provider/link/status/:code` for polling (requires JWT auth).

4. Provider credentials & connections
   - Admin or account owner can store provider credentials via `/api/provider/connections/:id/credentials`. Server encrypts provider tokens with `DEMO_ENCRYPTION_KEY` or `SE_CRETS_MASTER_KEY`.

5. Sending messages
   - Compose message in the Composer UI; choose `secure` or `plain`.
   - For `secure`: frontend fetches recipient public key, derives AES-GCM key, encrypts plaintext as `[CRYPT:v1]<base64>`, and optionally encrypts attachments before upload.
   - The client uploads attachments (multipart Formidable) to `/api/uploads/formidable`; encrypted attachments are uploaded as `raw` blobs and timeline shows an `Open encrypted attachment` action.
   - Client POSTs `/api/messages/send` with either plaintext (encrypt=false) or ciphertext (encrypt=true, encryptedText provided). Server validates that the account has a ProviderConnection for the selected provider.
   - Server calls provider adapter (`sendToProvider`) which sends to Telegram or WhatsApp using stored/overridden tokens.

6. Receiving messages
   - Provider inbound webhooks (Telegram/WhatsApp) must be set up to deliver incoming messages to the backend; inbound messages are stored as `inbound` and broadcast via Socket.IO to connected frontends.
   - On receive, the frontend attempts client-side decryption with locally stored private key and the sender's public key from the directory.

CSS Architecture Note

> **Refactor Pass 2 (2026-06-20) complete.** `App.css` was split into 13 scoped CSS files under `frontendReactJs/src/styles/`. 122 inline `style={}` props extracted. The visual design is unchanged — this was a structural refactor only.

> **Loading states (2026-06-21):** All async operations show a rotating spinner. Shared `.spinner` / `.spinner--lg` classes live in `global.css`, which is loaded from `main.tsx` (before authentication) so it is available on the login page. Per-component CSS files no longer need to redeclare animation keyframes.

Limitations / Notes

- Public provider webhooks and real provider credentials are required for full end-to-end integration. Local runs can be exercised via the provided smoke-test script, but true receive/send requires live credentials. See planning/DEADLINE220626.md for details.

**Authorization note:** All non-public routes require `Authorization: Bearer <token>`. Owner-only routes also enforce router-level `authorize()` middleware (Pass 2 Correction, 2026-06-20). The only routes accessible without a JWT are: `/health`, `/api/auth/signup`, `/api/auth/login`, provider webhooks, and `/api/openapi.json`/`/api/docs` (in non-production environments).
