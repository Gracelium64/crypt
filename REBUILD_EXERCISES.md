# Rebuild Exercises (Post-Deadline)

**Start after:** 2026-06-24 project submission  
**Goal:** Rebuild the core of this app from memory to confirm full understanding  
**Frontend target:** React Native (not React web — see Phase B below)

---

## Phase A — Backend Skeleton (Days 1-2, ~16h)

Without looking at the source, build:

1. `server.ts` — Express + CORS + `express.json()` + `/health` + all routers mounted at `/api` + Socket.IO init + DB connect in bootstrap
2. `models/message.ts` — Mongoose schema: provider, direction, from, to, chatId, encryptedText, deliveryStatus, accountId, attachments
3. `routes/messages.route.ts` — GET list (filter by accountId), POST create + broadcast
4. `routes/auth.route.ts` — register, login, logout, `/me` with JWT middleware
5. `services/crypto.service.ts` — AES-GCM encrypt/decrypt with `[CRYPT:v1]` prefix marker
6. `services/realtime.service.ts` — initRealtime + broadcastMessage

Skip MTProto and Cloudinary — those are third-party integrations. Understanding how they're called is enough.

---

## Phase B — React Native Frontend Skeleton (Days 3-4, ~16h)

Without looking. Target: React Native (Expo or bare workflow), not React web.

1. `context/AuthProvider.tsx` — user, token, checkSession, login, register, logout + useMemo on value; use `AsyncStorage` instead of `localStorage`
2. `lib/api.ts` — `apiCall(path, options)` with Bearer token from AsyncStorage; `VITE_API_BASE_URL` equiv is a constant (no Vite env in RN)
3. A screen that lists messages (polls `GET /api/messages` every 10s using `useEffect` + `setInterval`)
4. A form/screen that sends a message (`POST /api/messages`)
5. `hooks/useRealtime.ts` — connect on mount via `socket.io-client`, listen for `message:new`, disconnect on unmount; use `useRef` for the socket so it doesn't trigger re-renders
6. Protected stack: use React Navigation stack with an auth guard; redirect to auth screen if `!signedIn && !checkSession`

Note: `crypto.subtle` requires a secure context. In React Native, use `expo-crypto` or `react-native-quick-crypto` as the Web Crypto polyfill — the ECDH + AES-GCM logic in `lib/crypto.ts` needs a shim, but the algorithm and key derivation logic is identical.

---

## Phase C — Code Review (Day 5, ~8h)

Compare your rebuild to the actual source. Look for:

- Naming differences (convention awareness)
- Things you forgot (gaps in understanding)
- Things you did better (you will find some — note them)
- Edge cases the real code handles that you didn't think of

Start with: `git diff` your rebuild against the real files. For each difference, ask: "do I understand why the real code made this choice?"
