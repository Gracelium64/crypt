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

## Other terminal noise (not bugs)

- `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` — express-rate-limit warning; benign for local dev, does not affect behaviour.
- `Error: Missing authorization token` — expected on page reload; frontend fires authenticated requests before JWT is restored from storage. Backend correctly returns 401 JSON.
- `Error: No private key stored` — expected on a fresh local account before keypair generation.
- `Error: Invalid credentials` — expected from intentional invalid-login test.
