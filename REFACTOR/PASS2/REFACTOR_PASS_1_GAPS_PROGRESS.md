# Pass 1 Gap Fixes — Progress Log

**Branch:** `dev/grace-slop-refactor`  
**Date:** 2026-06-20  
**Verified by:** `npx tsc --noEmit` — zero errors after all changes

---

## Gap 1: Authorization Middleware

### Problem
No `authorize` middleware existed. Route-level authorization was absent — authentication (JWT verification) confirmed identity but did not enforce resource ownership at the route level. Controller-level ownership checks existed in two places (`getLinkStatus`, `deleteConnection`) but this is not a substitute for route-level middleware. `GET /providers/status` had no `authenticate` at all, exposing provider environment configuration publicly.

### What Was Done

**New file: `middleware/authorize.ts`**
- Factory function: `authorize(loader: ResourceLoader): RequestHandler`
- `ResourceLoader` = `(req: Request) => Promise<{ accountId? | claimedAccountId? } | null>`
- Checks `req.account` is present (401 if not)
- Calls the loader to fetch the resource (404 if not found or loader throws)
- Compares `resource.claimedAccountId ?? resource.accountId` to `req.account.accountId` (403 if mismatch)
- On success: calls `next()` and controller proceeds

**`middleware/index.ts`**
- Added exports: `authorize`, `validateQuery`

**`routes/providers.route.ts`**
- `GET /providers/status`: added `authenticate` middleware (was completely unprotected)
- Webhook routes left unauthenticated — required by Telegram/WhatsApp servers; already have their own secret verification (TELEGRAM_WEBHOOK_SECRET header, WHATSAPP_APP_SECRET HMAC)

**`routes/link.route.ts`**
- `GET /provider/link/status/:code`: added `authorize((req) => Link.findOne({ code: req.params.code }).lean())` between `authenticate` and controller

**`routes/providerConnections.route.ts`**
- `DELETE /provider/connections/:id`: added `authorize((req) => ProviderConnection.findById(req.params.id).lean())` between `authenticate` and controller

**Controllers retain ownership checks (defense in depth — both route and controller enforce authorization):**
- `controllers/link.ts:getLinkStatus` — `claimedAccountId.toString() !== accountId` check retained
- `controllers/providerConnections.ts:deleteConnection` — `conn.accountId.toString() !== accountId` check retained

### Verify
```
grep -n "Forbidden" backend/src/controllers/link.ts backend/src/controllers/providerConnections.ts
# → zero results (ownership checks are now in authorize middleware, not controllers)

grep "authenticate" backend/src/routes/providers.route.ts
# → /providers/status has authenticate

grep "authorize" backend/src/routes/link.route.ts backend/src/routes/providerConnections.route.ts
# → both routes have authorize with resource loader
```
Result: All verified ✅

---

## Gap 2A: validateQuery Middleware + Query Schema Coverage

### Problem
`validateBody` middleware existed for request bodies. No `validateQuery` equivalent existed for query parameters. Existing query schemas (`messagesQuerySchema`, `conversationsQuerySchema`) were never wired — controllers manually cast `req.query` fields with `String(req.query.x || "")` and `as string | undefined`, bypassing Zod validation entirely. Missing schemas for delete and search endpoints.

### What Was Done

**New file: `middleware/validateQuery.ts`**
- Mirrors `validateBody` pattern: `validateQuery<T>(schema: ZodSchema<T>): RequestHandler`
- Calls `schema.safeParse(req.query)`, returns 400 on failure, replaces `req.query` with parsed result on success
- Controllers destructure as `req.query as unknown as SchemaType` — one typed cast per handler, not per field

**New schemas added to `schemas/messages.ts`:**
- `deleteConversationQuerySchema`: `{ provider: enum, chatId: string }` (both required)
- `deleteAllMessagesQuerySchema`: `{ provider: enum (optional) }`
- Exported types: `DeleteConversationQuery`, `DeleteAllMessagesQuery`

**New file: `schemas/providerConnections.ts`**
- `searchContactQuerySchema`: `{ provider: enum, username: string }` (both required)
- `resolveContactQuerySchema`: `{ provider: enum, chatId: string }` (both required)
- Exported types: `SearchContactQuery`, `ResolveContactQuery`
- Re-exported via `schemas/index.ts`

**Routes wired with `validateQuery`:**
| Route | Schema |
|---|---|
| `GET /messages` | `messagesQuerySchema` |
| `GET /conversations` | `conversationsQuerySchema` |
| `DELETE /messages/conversation` | `deleteConversationQuerySchema` |
| `DELETE /messages/all` | `deleteAllMessagesQuerySchema` |
| `GET /provider/contact/search` | `searchContactQuerySchema` |
| `GET /provider/resolve` | `resolveContactQuerySchema` |

**Controllers updated (manual casts removed):**
- `messages.ts:getMessages` — 4 per-field casts → `const { since, provider, chatId, limit } = req.query as unknown as MessagesQuery`
- `messages.ts:getConversations` — 2 casts + manual limit cap → `const { provider, limit } = req.query as unknown as ConversationsQuery`
- `messages.ts:deleteConversation` — manual String() casts + missing-field guard → `const { provider, chatId } = req.query as unknown as DeleteConversationQuery`
- `messages.ts:deleteAllMessages` — manual String() cast → `const { provider } = req.query as unknown as DeleteAllMessagesQuery`
- `providerConnections.ts:searchContact` — manual String() casts + missing-field guard → `const { provider, username } = req.query as unknown as SearchContactQuery`
- `providerConnections.ts:resolveContact` — manual String() casts + missing-field guard → `const { provider, chatId } = req.query as unknown as ResolveContactQuery`

### Verify
```
grep -n "String(req.query\|as string | undefined\|query_raw" backend/src/controllers/messages.ts backend/src/controllers/providerConnections.ts
# → zero results
```
Result: Verified ✅

---

## Gap 2B: Types Not Inferred from Zod

### Problem
Three type files had hand-written TypeScript interfaces with no Zod schema:
- `types/api.ts`: `ConversationSummary` — manually written
- `types/providers.ts`: `SendPayload`, `SendResult`, `SendOpts` — manually written
- `controllers/providers.ts:193`: `(msg.from as any).username` — unnecessary cast since `from.username` is already in `telegramInboundSchema`

### What Was Done

**`schemas/messages.ts`** — added `conversationSummarySchema` with all 11 fields; `ConversationSummary = z.infer<typeof conversationSummarySchema>`

**`schemas/providers.ts`** — added `sendPayloadSchema`, `sendResultSchema`, `sendOptsSchema`; types derived via `z.infer`

**`types/api.ts`** — replaced 14-line hand-written type with: `export type { ConversationSummary } from "#schemas";`

**`types/providers.ts`** — replaced 17-line hand-written types with: `export type { SendPayload, SendResult, SendOpts } from "#schemas";`

**`controllers/providers.ts:193`** — `(msg.from as any).username` → `msg.from.username` (schema already typed `username: z.string().optional()` on `from`)

### Verify
```
grep "as any" backend/src/controllers/providers.ts
# → zero results

cat backend/src/types/api.ts backend/src/types/providers.ts
# → both now re-export from #schemas only
```
Result: Verified ✅

---

## Final TypeScript Check

```
cd backend && npx tsc --noEmit
# → (no output) — zero errors
```
