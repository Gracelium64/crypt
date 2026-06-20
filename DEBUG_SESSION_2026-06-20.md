# Debug Session — 2026-06-20

Post-refactor local testing. Branch: `dev/grace-refactor-debug`.

---

## 1. MongoDB auth error on startup

**Symptom:** Backend started ("Connected to MongoDB") but immediately threw:
```
MTProto session restore failed: MongoServerError: Command find requires authentication (code 13)
```

**Cause:** Local `mongod` had `security: authorization: "enabled"` in `/opt/homebrew/etc/mongod.conf`, but the connection string `mongodb://localhost:27017/shadowapp-dev` has no credentials. Mongoose establishes the TCP socket successfully, but the first query (`TelegramSession.find`) is rejected.

**Fix:** Removed the `security` block from `/opt/homebrew/etc/mongod.conf` and restarted MongoDB via `brew services restart mongodb-community`. Auth is disabled for local dev — machine is not network-exposed.

**Note:** `MONGODB_URI` lives in `backend/.env` (loaded by dotenv v17/dotenvx). The `backend/.env.development` file exists but is NOT loaded by the app — `dotenv.config()` defaults to `.env`.

---

## 2. Frontend CSS import path mismatch

**Symptom:** Vite failed to start frontend:
```
Failed to resolve import "./styles/components/app-dialogs.css" from "src/App.tsx"
```

**Cause:** `app-dialogs.css` was moved from `styles/components/` to `styles/` during the refactor, but the import in `App.tsx:3` was not updated.

**Fix:** `frontendReactJs/src/App.tsx:3`
```diff
- import "./styles/components/app-dialogs.css";
+ import "./styles/app-dialogs.css";
```

---

## 3. `validateQuery` middleware crash (Express 5)

**Symptom:** Every request through a route using `validateQuery` threw:
```
TypeError: Cannot set property query of #<IncomingMessage> which has only a getter
  at backend/src/middleware/validateQuery.ts:12
```

**Cause:** Express 5 defines `req.query` as a getter-only property on the request object. Direct assignment (`req.query = result.data`) is no longer valid.

**Fix:** `backend/src/middleware/validateQuery.ts:12`
```diff
- req.query = result.data as any;
+ Object.defineProperty(req, "query", { value: result.data, writable: true, configurable: true });
```

---

## 4. Provider status always showing "Needs setup"

**Symptom:** Settings page showed "Needs setup — add credentials" for Telegram and WhatsApp even though all env vars were confirmed SET.

**Cause:** `useProviders` hook called `apiFetch("/providers/status")` without an auth token. The current branch requires `authenticate` on that route (unlike `prod/green` which leaves it public). The request got a 401, the hook caught it silently and set `providerStatuses: []`, and the effect never re-ran after login because `loadProviderStatuses` had an empty `useCallback` dependency array.

**Fix:**

`frontendReactJs/src/hooks/useProviders.ts` — accept and forward token:
```diff
- export default function useProviders() {
+ export default function useProviders(authToken?: string | null) {
  ...
-   const loadProviderStatuses = useCallback(async () => {
+   const loadProviderStatuses = useCallback(async () => {
+     if (!authToken) { setProviderStatuses([]); return; }
-     const response = await apiFetch(`/providers/status`);
+     const response = await apiFetch(`/providers/status`, {}, authToken);
  ...
-   }, []);
+   }, [authToken]);
```

`frontendReactJs/src/App.tsx`:
```diff
- const { providerStatuses, loadProviderStatuses } = useProviders();
+ const { providerStatuses, loadProviderStatuses } = useProviders(auth.token);

- useEffect(() => { void loadProviderStatuses(); }, [loadProviderStatuses]);
+ useEffect(() => { void loadProviderStatuses(); }, [loadProviderStatuses, auth.token]);
```

**Result:** Both Telegram and WhatsApp show "Backend ready" (green) after login. ✓

---

## Telegram phone code never delivered

**Symptom:** Requesting a login code via the phone-code flow produced no code — no message arrives — for over a week across two credential sets. No error in UI or backend terminal. `isCodeViaApp: true` always returned. `auth.ResendCode` returns `SEND_CODE_UNAVAILABLE`.

**Root cause — ghost session from prod/green:** When prod/green replaced a Telegram MTProto session with a new one (QR or phone code re-login), the old client was only `disconnect()`-ed — `auth.LogOut` was never sent to Telegram's server. The old session remained authorized on Telegram's side, invisible in the Devices screen (possibly because it's been inactive a while), but still alive in Telegram's auth database. Telegram sees this ghost session and routes `sendCode` codes to it (`isCodeViaApp: true`). The ghost receives nothing because no client is connected to it. SMS delivery is blocked (`SEND_CODE_UNAVAILABLE`) because Telegram believes an app session exists.

**Confirmed via `account.GetAuthorizations`:** Found exactly 1 ghost session, hash `7560695766149812965n`.

**Code bug fixed (session replacement without `auth.LogOut`):** Three locations in `telegram-mtproto.service.ts` replaced old clients using only `client.disconnect()`. All three now call `auth.LogOut` first:
- `verifyPhoneCode` (~line 297) — phone code flow old client replacement
- QR auth completion (~line 457) — QR flow old client replacement
- `disconnectMTProtoSession` — now reconstructs client from DB session string if not in memory, ensuring `auth.LogOut` is sent even after a backend restart

**`ResendCode` fallback also added:** `requestPhoneCode` now invokes `auth.ResendCode` when `isCodeViaApp: true`, returning `codeType` to the frontend. Returns `SEND_CODE_UNAVAILABLE` for numbers with ghost sessions (no alternate channel available while ghost exists), but will work correctly on clean accounts.

**Status: IN PROGRESS — 24-hour wait required.** Telegram's `FRESH_RESET_AUTHORISATION_FORBIDDEN` (406) blocks both `auth.ResetAuthorizations` and `account.ResetAuthorization` for sessions created less than ~24 hours ago. The ghost cannot be cleared until the current QR session ages out of the freshness window.

See `TELEGRAM_PHONE_CODE_ISSUE.md` for the full investigation history and the exact steps to complete the fix tomorrow.

**Note:** GramJS `TIMEOUT` errors in the backend terminal are cosmetic/self-healing — more frequent locally due to Cloudflare tunnel latency.

---

## Mobile UI freeze (WhatsApp chats, Safari/iPhone)

**Symptom:** On iPhone Safari in a WhatsApp conversation, the UI occasionally freezes. May be caused by rapid polling interval resets triggering layout/repaint storms on low-powered devices.

**Root cause (identified):** Polling `useEffect` in `App.tsx` had `convHook.lastSync` in its dependency array. Every new message updated `lastSync`, which cleared and re-created the polling interval — causing a tight cascade loop rather than a stable interval.

**Fix:** Added `lastSyncRef` following the existing ref pattern. Removed `lastSync` from the polling effect deps so the interval is stable across messages.

```diff
  // App.tsx
+ const lastSyncRef = useRef(convHook.lastSync);
+ useEffect(() => { lastSyncRef.current = convHook.lastSync; }, [convHook.lastSync]);

  useEffect(() => {
    const interval = isRealtime ? 30_000 : 10_000;
    const timer = window.setInterval(() => {
      void loadConversations(providerRef.current);
-     void loadMessages(providerRef.current, selectedChatIdRef.current, convHook.lastSync || undefined);
+     void loadMessages(providerRef.current, selectedChatIdRef.current, lastSyncRef.current || undefined);
    }, interval);
    return () => window.clearInterval(timer);
- }, [isRealtime, loadConversations, loadMessages, convHook.lastSync]);
+ }, [isRealtime, loadConversations, loadMessages]);
```

---

## Other terminal noise (not bugs)

- `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` — express-rate-limit warning; benign for local dev, does not affect behaviour.
- `Error: Missing authorization token` — expected on page reload; frontend fires authenticated requests before JWT is restored from storage. Backend correctly returns 401 JSON.
- `Error: No private key stored` — expected on a fresh local account before keypair generation.
- `Error: Invalid credentials` — expected from intentional invalid-login test.
