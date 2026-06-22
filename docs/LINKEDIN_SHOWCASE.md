# Crypt

> Encrypted cross-platform messaging

---

## Full-stack TypeScript

Node.js · Express · React · MongoDB Atlas · Socket.IO · Deployed on Render

---

## End-to-end encryption

Built from scratch using the Web Crypto API.

ECDH P-256 key exchange → HKDF-SHA256 → AES-GCM 256-bit

Private keys never touch the server in plaintext.

---

## Three messaging integrations

- **Telegram MTProto** — sends and receives as the user's own account
- **Telegram Bot API** — webhook-based fallback + account linking
- **WhatsApp Cloud API** — official Meta REST API, HMAC-verified inbound

---

## Security

JWT auth · login lockout · per-route authorization · rate limiting · Helmet headers

Honeypot routes that log attacker probes and return convincing fake credentials.

---

## Real-time

Socket.IO with per-account rooms · polling fallback

---
