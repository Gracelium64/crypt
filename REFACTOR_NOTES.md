# Refactor Notes

Issues to address before or after deadline. Add findings as you review.

---

## Security / Architecture

### `broadcastMessage` sends to all connected users
**File:** `backend/src/services/realtime.service.ts` line 21  
`io.emit("message:new", ...)` broadcasts every message to every connected browser tab.  
The frontend filters by `accountId` — meaning the data reaches the client, it just doesn't display.  
Acceptable for a private/demo deployment. For multi-tenant production: emit to a per-account room instead.

```ts
// Current
io.emit("message:new", payload);

// Safer
io.to(`account:${message.accountId}`).emit("message:new", payload);
// (requires clients to join their room on connect)
```

---

## Bugs

### WhatsApp `tokenOverride` ignored in request header
**File:** `backend/src/services/providers.service.ts` line 127  
`sendWhatsApp` accepts `opts.tokenOverride` and uses it for the credential check (line 95), but the actual HTTP request hardcodes `env.WHATSAPP_ACCESS_TOKEN` instead of the resolved `token` variable.

```ts
// Current (line 127) — bug: ignores tokenOverride
Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,

// Fix
Authorization: `Bearer ${token}`,
```

**Blocked:** Fix only after WhatsApp credentials are available and send functionality can be tested end-to-end.

---

---

## Code Organisation — Backend (Priority)

### Separate types into the types folder + infer from Zod schemas
Types are currently defined inline in service and controller files (e.g. `SendPayload`, `SendResult`, `ConversationSummary`).  
Move to `backend/src/types/` organised by domain (`providerTypes.ts`, `mediaTypes.ts`, `messageTypes.ts`, etc.) and re-export via barrel (`types/index.ts`).  
Improves readability and makes types reusable across controllers and services without circular imports.

Where a Zod schema already exists for the same shape, delete the manual interface and use `z.infer<typeof schema>` instead — single source of truth, no drift between runtime validation and compile-time type. Apply consistently across both backend and frontend. Any manually written interface that duplicates a Zod schema is a candidate for removal.

For Mongoose models, standardise on `InferSchemaType` (Option A) — infer the TypeScript type directly from the schema rather than defining a separate interface:

```ts
// Standard pattern for all Mongoose models:
const messageSchema = new Schema({ text: String, ... });
type IMessage = InferSchemaType<typeof messageSchema>;
export const Message = model<IMessage>("Message", messageSchema);
```

Any model currently using a manually written interface passed as a generic (`model<IMessage>`) should be migrated to `InferSchemaType`.

---

## Code Organisation — Frontend (Priority)

### Split App.css into per-page/component stylesheets
Currently all styles live in `App.css`. Move page-specific styles to a `src/styles/` folder (`chat.css`, `settings.css`, `auth.css`, etc.).  
Keep `App.css` and `index.css` for global styles only (resets, CSS variables, typography).  
Re-export via barrel or import directly in each component file.  
Reduces merge conflicts and makes it obvious where a style rule applies.

---

## TypeScript — Frontend

### `convHook: any` in `useSend`
**File:** `frontendReactJs/src/hooks/useSend.ts` line 4  
`convHook` is typed as `any`. Replace with a minimal interface covering only the two methods actually used:

```ts
interface ConvRefresher {
  loadConversations?: (provider: string) => Promise<void>;
  loadMessages?: (provider: string, chatId: string, ...args: any[]) => Promise<void>;
}
```

---

## Missing Features

### No `decryptFileForRecipient` function
**File:** `frontendReactJs/src/lib/crypto.ts`  
`encryptFileForRecipient` exists but there is no corresponding decrypt function. Encrypted file attachments cannot be decrypted on the recipient side. Decide: implement decryption, or remove file encryption and send files as plain Cloudinary URLs.

### `TelegramSession.sessionString` stored unencrypted in MongoDB
**File:** `backend/src/services/telegram-mtproto.service.ts` (session save in `completePhoneAuth`, `startQrLogin`; session read in `loadAllMTProtoSessions`)  
**Risk:** A MongoDB dump exposes live Telegram session strings. An attacker with DB access can extract a session string, plug it into gramjs, and have full authenticated access to the user's Telegram account — read messages, send as them, etc. No password needed.

**Fix:** Wire up the already-implemented `encryptText`/`decryptMarkedText` from `backend/src/services/crypto.service.ts`:
- Wrap session string in `encryptText()` before any DB write
- Wrap in `decryptMarkedText()` before passing to `TelegramClient` on read
- `decryptMarkedText` already has a passthrough for unencrypted values — existing sessions keep working with no migration needed

**Dependency:** Requires `DEMO_ENCRYPTION_KEY` env var to be set and stable. If the key rotates, all encrypted sessions break and users must re-link. Document this in the Render env var setup guide.

**Estimated change:** 3–4 lines in one file. Low risk due to passthrough behaviour.

### Loop variable `s` in `loadAllMTProtoSessions` is not descriptive
**File:** `backend/src/services/telegram-mtproto.service.ts` line 116  
Rename `s` → `session` for readability.

<!-- Add new findings below this line -->
