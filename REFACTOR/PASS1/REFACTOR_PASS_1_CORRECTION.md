# Refactor Pass 1 — Correction Plan

**Branch:** `dev/grace-slop-refactor`  
**Basis:** `REFACTOR_PASS_1_GAP_ANALYSIS.md`  
**Rule:** No item may be marked ✅ without running its `Verify:` command and reading the output in the same session.

---

## Pre-implementation findings (closed before work starts)

### GAP-4 — CLOSED: no C4 regression in localStorage

`localOwnerId` is set to `email` at `App.tsx:145`. All localStorage reads/writes for crypto keys use `email` consistently throughout. C4 changed only the `/keys/` API call (from email to accountId); it did not affect localStorage key naming. Logout cleanup is correct.

**Verify (already run):**
```bash
grep -n "setLocalOwnerId\|crypt:priv\|crypt:pub" frontendReactJs/src/App.tsx
# Line 145: setLocalOwnerId(email) — confirmed email-keyed throughout
```

### DECISION-1 — RESOLVED: frontend Zod → Option A (implement)

Zod `4.4.3` is already installed in `frontendReactJs/package.json`. No new dependency needed.  
CORR-6 below implements this.

### DECISION-2 — RESOLVED: C8 resource type → Option B (MIME mapping)

Add `mimeToCloudinaryResourceType` helper to `uploads.ts`. CORR-5 below implements this.

---

## C8 Clarification (DECISION-2 — awaiting Grace's call)

### What the bug is

`controllers/uploads.ts` has one `ALLOWED_MIME_TYPES` set used by both upload paths:

```ts
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf", "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
```

In `uploadFormidable`, the MIME check is skipped for `resourceType === "raw"` (encrypted uploads). PDFs/docs sent via formidable would typically use `raw` and bypass the check entirely — so those MIME types in the set have no practical effect on the formidable path.

In `uploadBase64`, the MIME check runs, but the upload call hardcodes `"image"` regardless of what was detected:

```ts
const detected = await fileTypeFromBuffer(buffer);
if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
  next(new Error("File content type not permitted", ...));
  return;
}
const url = await uploadBufferToCloudinary(buffer, "image", "uploads"); // ← always "image"
```

If a PDF passes the MIME check (detected as `application/pdf`, which is in the set), Cloudinary receives it as resource type `"image"` and will fail.

There are two additional facts that matter:

1. **`text/plain` cannot be detected by `file-type`** — plain text has no magic bytes. `fileTypeFromBuffer` returns `undefined` for `.txt` files. The check `if (!detected || ...)` rejects them. Plain text is de facto blocked regardless of the set.

2. **The frontend never sends PDFs via the base64 path.** The base64 path (`/uploads/base64`) is a fallback triggered when FormData upload fails. In `services/messages.ts`, the frontend uses `FileReader.readAsDataURL(file)` to produce the data URL — this is the only code path that calls the base64 endpoint. In practice it's only reached for images. PDFs and documents go through the formidable path.

### The decision

**Option A — Restrict `uploadBase64` to images only (recommended):**  
Remove `application/pdf`, `text/plain`, `application/msword`, `.docx` from `ALLOWED_MIME_TYPES` in `uploadBase64`. Either split the constant into `BASE64_ALLOWED_MIME_TYPES` (images only) and `FORMIDABLE_ALLOWED_MIME_TYPES` (full set), or inline the restriction. This matches actual usage and closes the bug without adding complexity. If documents via base64 are ever needed in future, the fix is to also map the MIME to the correct resource type at that point.

**Option B — Map MIME type to correct Cloudinary resource type:**  
Keep the full set but derive `resourceType` from the detected MIME before the Cloudinary call. More future-proof, slightly more code.

**Awaiting Grace's call before writing CORR-5.**

---

## Implementation Items

---

### CORR-1 — GAP-1: Frontend silent catches (C5 completion)

**What:** Add `console.error(err)` to each unlabelled frontend catch block that was missed in Pass 1.

**Changes per file:**

**`frontendReactJs/src/data/auth.ts:8`**  
`parseError` helper — catches `resp.json()` failure, returns fallback string. Intentional, no log needed.  
**No change.**

**`frontendReactJs/src/context/AuthProvider.tsx:27`**  
`/auth/me` fails → clears token, logs out. Correct behavior. Missing `console.error`.
```ts
// from:
} catch {
  localStorage.removeItem("crypt:token");
  setUser(null);
  setToken(null);
// to:
} catch (err) {
  console.error("[Auth] session check failed:", err);
  localStorage.removeItem("crypt:token");
  setUser(null);
  setToken(null);
```

**`frontendReactJs/src/hooks/useConnections.ts:17`**  
`loadConnectionsList` fails → empty array. User sees blank connections panel, no log.
```ts
// from:
} catch {
  setConnections([]);
// to:
} catch (err) {
  console.error("[Connections] loadConnectionsList failed:", err);
  setConnections([]);
```

**`frontendReactJs/src/hooks/useProviders.ts:13`**  
`loadProviderStatuses` fails → empty array. Silent.
```ts
// from:
} catch {
  setProviderStatuses([]);
// to:
} catch (err) {
  console.error("[Providers] loadProviderStatuses failed:", err);
  setProviderStatuses([]);
```

**`frontendReactJs/src/components/FindContact.tsx:55`**  
Fingerprint calculation fails → `fingerprint` stays null. Display degrades gracefully. Missing `console.error`.
```ts
// from:
} catch {
  // ignore fingerprint failure
// to:
} catch (err) {
  console.error("[FindContact] fingerprint failed:", err);
```

**`frontendReactJs/src/components/FindContact.tsx:60`**  
Outer search catch → `setError("Search failed — check your connection")`. User sees the message. Missing `console.error`.
```ts
// from:
} catch {
  setError("Search failed — check your connection");
// to:
} catch (err) {
  console.error("[FindContact] search failed:", err);
  setError("Search failed — check your connection");
```

**`frontendReactJs/src/components/ConnectionsPanel.tsx:26`**  
`deleteConnection` throws → `setUnlinkError("Failed to unlink — please try again")`. User sees the message. Missing `console.error`.
```ts
// from:
} catch {
  setUnlinkError("Failed to unlink — please try again");
// to:
} catch (err) {
  console.error("[ConnectionsPanel] deleteConnection failed:", err);
  setUnlinkError("Failed to unlink — please try again");
```

**`frontendReactJs/src/services/messages.ts:73`**  
Formidable upload fails → falls back to base64. Silent.
```ts
// from:
} catch {
// to:
} catch (uploadErr) {
  console.error("[Messages] formidable upload failed, falling back to base64:", uploadErr);
```

**`frontendReactJs/src/services/messages.ts:107`**  
Base64 fallback also fails → `finalImageUrl` stays empty, send continues without attachment. Silent.
```ts
// from:
} catch {
// to:
} catch (base64Err) {
  console.error("[Messages] base64 upload fallback failed:", base64Err);
```

**`frontendReactJs/src/services/keys.ts:110`**  
`fetchAndDecryptPrivateKey` throws → returns null. No log.
```ts
// from:
} catch {
  return null;
// to:
} catch (err) {
  console.error("[Keys] fetchAndDecryptPrivateKey failed:", err);
  return null;
```

**Verify:**
```bash
grep -rn "catch {" --include="*.ts" --include="*.tsx" frontendReactJs/src/ \
  | grep -v "ignore\|non-fatal\|jwk = null\|return msg\|/* mirror"
# Expected: zero unlabelled catches remaining
# All remaining catch {} blocks must have a comment explaining why they are intentionally silent
```

---

### CORR-2 — GAP-3: Remaining `any` types (B12 completion)

**Dependency:** CORR-6 must be planned first. New types for `Connection`, `ProviderStatus`, `LinkStatusData`, and `ChatMessage` (as a realtime payload) should be derived from Zod schemas created in CORR-6, not written as standalone interfaces. The `any` replacements below reference the schema-derived types — write CORR-6's schemas first, then apply them here.

**What:** Replace every remaining unscoped `any` in frontend services/hooks/components. Fix the backend `(req as any)` cast.

#### Frontend

**`frontendReactJs/src/components/ConnectionsPanel.tsx:3`**  
Replace `type Conn = any` with the `Connection` type derived from the Zod schema in CORR-6. Update `Props.connections: Conn[]` to `Connection[]`.

**`frontendReactJs/src/hooks/useConnections.ts:5`**  
Replace `useState<any[]>([])` with `useState<Connection[]>([])`. Import `Connection` from `types/index.ts` (which re-exports from the schema).

**`frontendReactJs/src/hooks/useProviders.ts:5`**  
Replace `useState<any[]>([])` with `useState<ProviderStatus[]>([])`. Import `ProviderStatus` from `types/index.ts`.

**`frontendReactJs/src/hooks/useLink.ts:52, 57`**  
Replace `onComplete?: (data: any)` and `useState<any | null>(null)` with `LinkStatusData` derived from its Zod schema in CORR-6.

**`frontendReactJs/src/hooks/useRealtime.ts:5, 28`**  
Replace `(m: any) => void` with `(m: ChatMessage) => void`. Import `ChatMessage` from `types/index.ts`. Update the internal `onMessage` handler type.

**`frontendReactJs/src/services/messages.ts:24`**  
Replace `options: any` with `RequestInit`:
```ts
const options: RequestInit = { method: "POST", body: form };
if (token) (options as RequestInit & { headers: Record<string, string> }).headers = { Authorization: `Bearer ${token}` };
```
Or more cleanly:
```ts
const options: RequestInit = {
  method: "POST",
  body: form,
  ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
};
```

**`frontendReactJs/src/services/messages.ts:67`**  
Replace `let localPriv: any` with `let localPriv: EcdhPrivateJwk | null` (already imported from `../lib/crypto`).

**`frontendReactJs/src/services/messages.ts:129`**  
Replace `const payload: any` with an explicit inline type matching the `sendMessageSchema` body shape:
```ts
const payload: {
  provider: string;
  from: string;
  to: string;
  chatId: string;
  attachments: Array<{ type: string; url: string }>;
  encryptedText?: string;
  encrypt?: boolean;
  text?: string;
} = { provider, from: `${provider}-web`, to: conversationTarget, chatId: selectedChatId, attachments: [] };
```

#### Backend

**`backend/src/controllers/messages.ts:22`**  
`validateQuery` does not exist (confirmed via grep pre-implementation). Delete lines 22–23 unconditionally.

#### `catch (err: any)` — narrow to `unknown` (5 instances)

These are distinct from CORR-1 (which fixes silent `catch {}` blocks). These catches log or surface errors to the UI but use `err: any`, bypassing TypeScript's safety for caught values.

**`frontendReactJs/src/components/ConnectTelegram.tsx:111, 131, 151, 173`**  
Change `catch (err: any)` → `catch (err: unknown)`. Replace each `err?.message` access with `err instanceof Error ? err.message : String(err)`. Examples:

```ts
// line 111 — from:
} catch (err: any) {
  setQrError(err?.message ?? "Failed to start QR login");
// to:
} catch (err: unknown) {
  setQrError(err instanceof Error ? err.message : "Failed to start QR login");

// line 173 — from:
} catch (err: any) {
  const msg: string = err?.message ?? "";
// to:
} catch (err: unknown) {
  const msg: string = err instanceof Error ? err.message : "";
```
Apply the same substitution at lines 131 and 151 following the same pattern.

**`backend/src/services/telegram-mtproto.service.ts:201`**  
Change `catch (err: any)` → `catch (err: unknown)`. The gramjs error object carries `errorMessage` (not the standard `Error.message`), so use an inline interface cast rather than `instanceof Error`:

```ts
// from:
} catch (err: any) {
  const msg: string = err?.errorMessage ?? err?.message ?? "";
// to:
} catch (err: unknown) {
  const e = err as { errorMessage?: string; message?: string };
  const msg: string = e?.errorMessage ?? e?.message ?? "";
```

**Verify:**
```bash
# any-type check (telegram-mtproto gramjs API boundary any usages remain — those are param-level, not catch)
grep -rn ": any\b\|= any\b\|<any>" --include="*.ts" --include="*.tsx" \
  frontendReactJs/src/ backend/src/ \
  | grep -v "node_modules\|dist/\|\.d\.ts\|vitest\|qrcode\|telegram-mtproto\|media\.service\|providers\.ts.*msg\.from"
# Expected: zero results

# catch (err: any) must be gone from all files
grep -rn "catch (err: any)" --include="*.ts" --include="*.tsx" \
  frontendReactJs/src/ backend/src/
# Expected: zero results
```

---

### CORR-3 — GAP-6: `/provider/resolve` authorization — document decision

**What:** Document the explicit decision that `GET /provider/resolve` is intentionally accessible to any authenticated user, so a future reviewer does not re-open it as a gap.

**Assessment:** The endpoint returns `accountId` (opaque MongoDB ObjectId) for a given `providerChatId`. It is used by the frontend for cross-account message fan-out routing. Restricting it would break message delivery to Crypt users. `accountId` is not PII. The risk (membership enumeration via providerChatId) is acceptable given this is a private deployment.

**Change:** Add to `REFACTOR/REFACTOR_NOTES.md` under the authorization section:
```
### GET /provider/resolve — intentional open lookup (documented decision)
Returns accountId (MongoDB ObjectId, not PII) for a given providerChatId.
Accessible to any authenticated Crypt user — required for cross-account message fan-out.
Ownership restriction would break inbound message delivery to recipients.
Accepted risk: any authenticated user can confirm whether a Telegram/WhatsApp ID
belongs to a Crypt account. Acceptable for private/closed deployment.
```

**Verify:**
```bash
grep -n "resolveContact\|provider/resolve" REFACTOR/REFACTOR_NOTES.md
# Expected: decision note present
grep -n "authenticate" backend/src/routes/providerConnections.route.ts
# Expected: route has authenticate middleware
```

---

### CORR-4 — GAP-7: Documentation corrections

**What:** Fix two factual inaccuracies left in Pass 1 docs.

**`REFACTOR/PASS1/REFACTOR_PASS_1_REPORT.md`, Phase C table, C6 row:**  
Change `link.accountId` → `link.claimedAccountId` in the description.

**`PRODUCTION_CHECKLIST.md`, section "Pre-Deploy: Run C4 Key Migration", last paragraph:**  
Remove: *"JWT tokens issued before the migration will be rejected on the new backend — all users must re-login after the deploy."*  
Replace with: *"Existing JWT tokens remain valid after deploy. The new authenticate middleware ignores the now-unused email field in old tokens. Users do not need to re-login."*

**Verify:**
```bash
grep -rn "link\.accountId\|must re-login\|will be rejected" \
  REFACTOR/PASS1/REFACTOR_PASS_1_REPORT.md PRODUCTION_CHECKLIST.md
# Expected: zero results
```

---

### CORR-5 — GAP-5: C8 `uploadBase64` Cloudinary resource type (Option B)

**File:** `backend/src/controllers/uploads.ts`

**What:** The MIME-to-resource-type mapping is missing in `uploadBase64`. After byte-sniffing confirms the MIME, the Cloudinary upload always uses `"image"` regardless of what was detected. Option B adds a helper that maps the detected MIME to the correct Cloudinary resource type before upload.

**Cloudinary resource type rules:**
- `"image"` — JPEG, PNG, GIF, WebP
- `"raw"` — PDF, plain text, Word documents, any non-image file

**Change:** Add a private helper above the route handlers, then use it in `uploadBase64`:

```ts
// Add after ALLOWED_MIME_TYPES definition:
const mimeToCloudinaryResourceType = (mime: string): "image" | "raw" =>
  mime.startsWith("image/") ? "image" : "raw";
```

In `uploadBase64`, replace the hardcoded `"image"`:
```ts
// from:
const url = await uploadBufferToCloudinary(buffer, "image", "uploads");

// to:
const resourceType = mimeToCloudinaryResourceType(detected.mime);
const url = await uploadBufferToCloudinary(buffer, resourceType, "uploads");
```

No change to `uploadFormidable` — it already derives `resourceType` from the request field and the `"raw"` path correctly bypasses MIME checking for encrypted uploads.

**Verify:**
```bash
grep -n "\"image\"" backend/src/controllers/uploads.ts
# Expected: zero results — no hardcoded "image" resource type remaining
# (the string "image" will still appear in ALLOWED_MIME_TYPES values and ALLOWED_RESOURCE_TYPES, not as a Cloudinary upload arg)

grep -n "mimeToCloudinaryResourceType" backend/src/controllers/uploads.ts
# Expected: two results — definition and call site in uploadBase64
```

---

### CORR-6 — DECISION-1 resolved: Frontend Zod schemas

**Zod version:** `4.4.3` already installed in `frontendReactJs/package.json`. No new dependency.

**What:** Create `frontendReactJs/src/schemas/` and define Zod schemas for all API response shapes. Replace manual interfaces in `types/index.ts` with `z.infer<>` derived types. Parse API responses instead of casting.

**New file: `frontendReactJs/src/schemas/index.ts`**

Schemas to define (matching backend model/response shapes):

```ts
import { z } from "zod";

export const ChatMessageSchema = z.object({
  _id: z.string().optional(),
  id: z.string().optional(),
  accountId: z.string().optional(),
  provider: z.enum(["telegram", "whatsapp"]),
  direction: z.enum(["inbound", "outbound"]),
  from: z.string(),
  to: z.string(),
  chatId: z.string(),
  encryptedText: z.string().optional(),
  attachments: z.array(z.object({ type: z.literal("image"), url: z.string() })),
  deliveryStatus: z.enum(["queued", "sent", "failed"]).optional(),
  createdAt: z.string(),
  bodyOmitted: z.boolean().optional(),
  decryptedText: z.string().optional(),
});

export const ConversationSummarySchema = z.object({
  provider: z.enum(["telegram", "whatsapp"]),
  chatId: z.string(),
  counterpart: z.string().optional(),
  counterpartName: z.string().optional(),
  lastMessagePreview: z.string().optional(),
  lastMessageAt: z.string().nullable().optional(),
  messageCount: z.number().optional(),
  secureMessageCount: z.number().optional(),
  plainMessageCount: z.number().optional(),
  securityState: z.string().optional(),
});

export const UserSchema = z.object({
  email: z.string(),
  displayName: z.string().optional(),
  id: z.string().optional(),
});

export const ConnectionSchema = z.object({
  _id: z.string(),
  provider: z.enum(["telegram", "whatsapp"]),
  providerChatId: z.string(),
  username: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
  active: z.boolean(),
});

export const ProviderStatusSchema = z.object({
  provider: z.enum(["telegram", "whatsapp"]),
  connected: z.boolean(),
  // extend as needed when /providers/status response shape is confirmed
});

export const LinkStatusDataSchema = z.object({
  completed: z.boolean(),
  providerChatId: z.string().nullable().optional(),
  providerDisplayName: z.string().nullable().optional(),
});
```

**`frontendReactJs/src/types/index.ts`** — replace manual interfaces with `z.infer<>`:
```ts
import type { z } from "zod";
import type {
  ChatMessageSchema,
  ConversationSummarySchema,
  UserSchema,
  ConnectionSchema,
  ProviderStatusSchema,
  LinkStatusDataSchema,
} from "../schemas";

export type ChatMessage = z.infer<typeof ChatMessageSchema>;
export type ConversationSummary = z.infer<typeof ConversationSummarySchema>;
export type User = z.infer<typeof UserSchema>;
export type Connection = z.infer<typeof ConnectionSchema>;
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;
export type LinkStatusData = z.infer<typeof LinkStatusDataSchema>;

export type Provider = "telegram" | "whatsapp";
export type MessageProvider = Provider;
// LoginPayload and RegisterPayload remain as manual types (no API response, no runtime parse needed)
export type LoginPayload = { email: string; password: string };
export type RegisterPayload = { email: string; password: string; displayName?: string };
```

**API response parse sites** — replace `as T[]` casts with `z.safeParse`:

`useConversations.ts` — `loadConversations`:
```ts
// from:
setConversations((payload.data ?? []) as ConversationSummary[]);
// to:
const parsed = z.array(ConversationSummarySchema).safeParse(payload.data ?? []);
if (parsed.success) setConversations(parsed.data);
else console.error("[Conversations] response shape mismatch:", parsed.error);
```

`useConversations.ts` — `loadMessages`:
```ts
// from:
const incoming = (payload.data ?? []) as ChatMessage[];
// to:
const parseResult = z.array(ChatMessageSchema).safeParse(payload.data ?? []);
if (!parseResult.success) {
  console.error("[Messages] response shape mismatch:", parseResult.error);
  return;
}
const incoming = parseResult.data;
```

`useConnections.ts` — `loadConnectionsList`:
```ts
// from:
setConnections(j.data ?? []);
// to:
const parsed = z.array(ConnectionSchema).safeParse(j.data ?? []);
if (parsed.success) setConnections(parsed.data);
else console.error("[Connections] response shape mismatch:", parsed.error);
```

`useProviders.ts` — `loadProviderStatuses`:
```ts
// from:
setProviderStatuses(payload.data ?? []);
// to:
const parsed = z.array(ProviderStatusSchema).safeParse(payload.data ?? []);
if (parsed.success) setProviderStatuses(parsed.data);
else console.error("[Providers] response shape mismatch:", parsed.error);
```

`useLink.ts` — `poll`:
```ts
// from:
setLinkStatus(j.data ?? null);
// to:
const parsed = LinkStatusDataSchema.nullable().safeParse(j.data ?? null);
if (parsed.success) setLinkStatus(parsed.data);
else console.error("[Link] status response shape mismatch:", parsed.error);
```

`data/auth.ts` — `meRequest`:
```ts
// from:
return j.data as User;
// to:
return UserSchema.parse(j.data);
// (throws on failure — meRequest already throws on !resp.ok, so a parse error here is a genuine server contract violation)
```

**Additional schemas for `schemas/index.ts`:**

```ts
export const EcdhPrivateJwkSchema = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: z.string(),
  y: z.string(),
  d: z.string(),
  key_ops: z.array(z.string()).optional(),
  ext: z.boolean().optional(),
});

export const TokenResponseSchema = z.object({ token: z.string() });

export const QrStatusSchema = z.object({
  token: z.string().optional(),
  step: z.string(),
  error: z.string().optional(),
});
```

**`frontendReactJs/src/types/index.ts`** — also export `EcdhPrivateJwk`:
```ts
export type EcdhPrivateJwk = z.infer<typeof EcdhPrivateJwkSchema>;
```
Note: this replaces (and re-exports) the existing `EcdhPrivateJwk` interface from `lib/crypto.ts`. All imports of `EcdhPrivateJwk` that currently point to `lib/crypto.ts` should be left as-is (they can stay pointing to `crypto.ts` since it still exports the interface). The Zod schema in `schemas/index.ts` is the additional parse guard; `crypto.ts` keeps its own interface as the source of truth for the crypto functions.

**`frontendReactJs/src/data/auth.ts:19, 28`** — parse token response:
```ts
// from (lines 19 and 28):
return j.data as { token: string };
// to:
return TokenResponseSchema.parse(j.data);
```
Import `TokenResponseSchema` from `../schemas`. The return type `{ token: string }` is inferred from the schema.

**`frontendReactJs/src/components/ConnectTelegram.tsx:77`** — parse QR status:
```ts
// from:
const data = j.data as { token: string; step: string; error?: string };
// to:
const parsed = QrStatusSchema.safeParse(j.data);
if (!parsed.success) { console.error("[Telegram] QR status shape mismatch:", parsed.error); return; }
const data = parsed.data;
```
Import `QrStatusSchema` from `../schemas`.

**`frontendReactJs/src/App.tsx:30`** — fix privJwk state type:
```ts
// from:
const [privJwk, setPrivJwk] = useState<unknown>(null);
// to:
const [privJwk, setPrivJwk] = useState<EcdhPrivateJwk | null>(null);
```
Import `EcdhPrivateJwk` from `./lib/crypto` (already available). On the two localStorage reads at `App.tsx:190` and `App.tsx:350`, wrap with Zod parse:
```ts
// from (wherever JSON.parse is used to load the private key):
const raw = JSON.parse(localStorage.getItem("crypt:priv:...") ?? "null");
setPrivJwk(raw);
// to:
const raw = JSON.parse(localStorage.getItem("crypt:priv:...") ?? "null");
const parsed = EcdhPrivateJwkSchema.safeParse(raw);
if (parsed.success) setPrivJwk(parsed.data);
else { console.error("[App] stored private key failed validation:", parsed.error); setPrivJwk(null); }
```
Import `EcdhPrivateJwkSchema` from `./schemas`.

**`frontendReactJs/src/pages/ChatView.tsx:17`** — fix prop type:
```ts
// from:
privJwk: unknown;
// to:
privJwk: EcdhPrivateJwk | null;
```
Import `EcdhPrivateJwk` from `../lib/crypto`.

**`frontendReactJs/src/pages/SettingsPage.tsx:18, 23, 24`** — fix prop types:
```ts
// from:
privJwk: unknown;
...
setPrivJwk: (v: unknown) => void;
connections: unknown[];
// to:
privJwk: EcdhPrivateJwk | null;
...
setPrivJwk: (v: EcdhPrivateJwk | null) => void;
connections: Connection[];
```
Import `EcdhPrivateJwk` from `../lib/crypto` and `Connection` from `../types`.

**Verify:**
```bash
# 1. No manual interfaces left in types/index.ts that duplicate schema shapes
grep -n "interface\|^type.*{" frontendReactJs/src/types/index.ts
# Expected: only LoginPayload and RegisterPayload as manual types

# 2. No unvalidated API response casts remaining for schema-covered types
grep -rn " as ChatMessage\b\| as ConversationSummary\b\| as User\b\| as Connection\b\| as { token" \
  frontendReactJs/src/ --include="*.ts" --include="*.tsx"
# Expected: zero results

# 3. No unknown privJwk types remaining
grep -rn "privJwk: unknown\|useState<unknown>" frontendReactJs/src/ --include="*.ts" --include="*.tsx"
# Expected: zero results

# 4. TypeScript compile clean
cd frontendReactJs && npx tsc --noEmit
# Expected: exit 0
```

---

## Execution Order

| # | Item | Prereq | Blocked on decision? |
|---|------|--------|----------------------|
| GAP-4 | ~~Logout localStorage~~ | — | Closed |
| CORR-4 | Doc corrections | None | No |
| CORR-3 | `/provider/resolve` decision note | None | No |
| CORR-1 | Frontend catches | None | No |
| CORR-6 | Frontend Zod schemas | DECISION-1 = Option A ✓ | No — proceed |
| CORR-2 | Remaining `any` types | CORR-6 complete first | No |
| CORR-5 | C8 resource type fix | DECISION-2 = Option B ✓ | No — proceed |

---

## Pass 1 Closure Criteria

Pass 1 is closed when all of the following pass in the same session:

```bash
# C5 frontend catches
grep -rn "catch {" --include="*.ts" --include="*.tsx" frontendReactJs/src/ \
  | grep -v "ignore\|non-fatal\|jwk = null\|return msg\|mirror"
# → zero results

# B12 remaining any types (including catch (err: any))
grep -rn ": any\b\|= any\b\|<any>" --include="*.ts" --include="*.tsx" \
  frontendReactJs/src/ backend/src/ \
  | grep -v "node_modules\|dist/\|\.d\.ts\|vitest\|qrcode\|telegram-mtproto\|media\.service\|providers\.ts.*msg\.from"
# → zero results
grep -rn "catch (err: any)" --include="*.ts" --include="*.tsx" \
  frontendReactJs/src/ backend/src/
# → zero results

# Doc corrections
grep -rn "link\.accountId\|must re-login\|will be rejected" \
  REFACTOR/PASS1/REFACTOR_PASS_1_REPORT.md PRODUCTION_CHECKLIST.md
# → zero results

# No unvalidated API casts
grep -rn " as ChatMessage\b\| as ConversationSummary\b\| as User\b\| as Connection\b\| as { token" \
  frontendReactJs/src/ --include="*.ts" --include="*.tsx"
# → zero results

# No unknown privJwk types remaining
grep -rn "privJwk: unknown\|useState<unknown>" frontendReactJs/src/ --include="*.ts" --include="*.tsx"
# → zero results

# TypeScript clean
cd backend && npm run build       # → exit 0
cd frontendReactJs && npx tsc --noEmit  # → exit 0
```
