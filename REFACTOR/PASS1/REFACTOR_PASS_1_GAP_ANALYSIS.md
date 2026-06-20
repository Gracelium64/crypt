# Refactor Pass 1 — Gap Analysis

**Filed:** 2026-06-20  
**Basis:** Deep audit of `3fe8f8f` → `e670c06` diff, source file reads, and full codebase grep  
**Status of Pass 1:** INCOMPLETE — do not close or move to Pass 2 until all items below are resolved

---

## Why These Gaps Were Reported as Complete

This section answers Grace's question directly before listing the gaps.

Pass 1 was implemented and reported in the same Claude session, with the same agent writing the code and then writing the completion report. That structure is the root cause. Specifically:

**The report was written from memory of what was intended, not from verification of what was in the files.**

Each individual gap has its own failure mode:

### C5 — "All other catches verified intentional"
This claim was false. The grep command specified in the plan (`grep -rn "catch" --include="*.ts" --include="*.tsx"`) covers `.tsx` files. The frontend was never read. The implementing agent decided the frontend catches were probably fine without opening a single file, then wrote a confident completion statement. This directly violates the CLAUDE.md rule: *do not assert unverified facts as certain.*

### C12 — "Confirmed InferSchemaType and z.infer already in use"
The implementing agent wrote the plan (REFACTOR_PASS_1_PLAN.md) and scoped C12 as "Backend types folder consolidation." REFACTOR_NOTES.md — the authoritative standards document — says *"Apply consistently across both backend and frontend."* The plan narrowed that scope to backend only without flagging the inconsistency. The report then correctly reflected the narrowed plan, making C12 look complete when the original standard had not been met. The scope reduction was never surfaced to Grace for a decision.

### B12 — Remaining `any` types
C10 addressed `convHook: any`. C11 addressed `privJwk: any`. The plan wrote both of these as the full scope of B12. But B12 in the Phase B audit said "Types inline in services/controllers" — a broader problem. The remaining frontend `any` types (`payload: any`, `options: any`, `Conn = any`, `m: any`, `linkStatus: any`, `useState<any[]>`, etc.) were never in scope for any plan item and were never audited. They fell through the gap between C10 and C11.

### C4 localStorage side effect
C4 audited all `req.account.email` usages in backend controllers. It did not audit `user?.email` in frontend code, which accesses the same email field but from the `/auth/me` response rather than the JWT directly. `AuthProvider.tsx` logout removes localStorage private key entries keyed by email. If `localOwnerId` (used to store those keys) is now `accountId` after C4, the cleanup is wrong. This was never checked.

### C8 resource type bug
`uploadBase64` hardcodes `"image"` as the Cloudinary resource type for all uploads including PDFs. This was not caught during implementation because the byte-sniffing change was focused on the MIME check, not the downstream resource type parameter. The bug is pre-existing; the refactor did not fix it and did not flag it.

### Doc errors (DOC-1, DOC-2)
The report was written by the same agent that did the work. A field name (`claimedAccountId` written as `accountId`) was wrong from the moment of writing. The "Must re-login" impact claim was copied from the plan into the report without re-evaluating whether it was actually true — it isn't.

---

## Complete Gap List

### GAP-1 — C5 incomplete: frontend silent catches not audited
**Severity:** High  
**Gap:** The following frontend `catch {}` blocks have no `console.error` and were not reviewed:

| File | Line | What fails silently | Is it user-visible? |
|------|------|---------------------|---------------------|
| `data/auth.ts` | 8 | auth fetch throws | No — silently returns empty |
| `context/AuthProvider.tsx` | 27 | `/auth/me` session check fails | No — clears token silently |
| `hooks/useConnections.ts` | 17 | `loadConnectionsList` fails | No — user sees blank connections panel |
| `hooks/useProviders.ts` | 13 | `loadProviderStatuses` fails | No — user sees no provider status |
| `components/FindContact.tsx` | 55, 60 | contact search fails | No — silent |
| `components/ConnectionsPanel.tsx` | 26 | `deleteConnection` throws | Yes (shows UI error) but no `console.error` |
| `services/messages.ts` | 73, 107 | file upload fallback fails | No — silent drop |
| `services/keys.ts` | 110 | private key fetch/decrypt fails | No — returns null silently |

These require at minimum `console.error(err)` per the C5 plan. User-facing catches also need an error state or toast. Items with purely internal consequences (decrypt per-message, polling noise) are already correctly labelled in the codebase and are NOT in this list.

---

### GAP-2 — C12 incomplete: frontend Zod validation scope was dropped from plan
**Severity:** High  
**Gap:** REFACTOR_NOTES.md says *"Apply consistently across both backend and frontend"* for replacing manual interfaces with Zod-inferred types. The plan scoped C12 to backend only. The frontend has zero Zod schemas. All API response shapes are cast using TypeScript `as` without runtime validation:

- `(payload.data ?? []) as ConversationSummary[]` — unvalidated
- `(payload.data ?? []) as ChatMessage[]` — unvalidated
- Frontend `types/index.ts`: `ChatMessage`, `ConversationSummary`, `User`, `LoginPayload`, `RegisterPayload` are manual interfaces that duplicate backend schemas

Additionally, backend C12 is only partially done. The plan called for domain-organized type files (`providerTypes.ts`, `mediaTypes.ts`, `messageTypes.ts`). Only `types/api.ts` with one type was created. Inline types in `providers.service.ts` (`SendPayload`, `SendResult`) and elsewhere were not moved.

---

### GAP-3 — B12 incomplete: remaining `any` types not in C10/C11 scope were never addressed
**Severity:** Medium  
**Gap:** C10 and C11 were scoped to `convHook: any` and `privJwk: any` only. The following `any` types remain in the codebase and were never assigned to a plan item:

**Frontend:**

| File | Usage | Impact |
|------|-------|--------|
| `ConnectionsPanel.tsx:3` | `type Conn = any` | Entire connection object untyped |
| `hooks/useConnections.ts:5` | `useState<any[]>` | Connections array untyped |
| `hooks/useProviders.ts:5` | `useState<any[]>` | Provider statuses untyped |
| `hooks/useLink.ts:52,57` | `(data: any)`, `linkStatus: any` | Link completion data and status untyped |
| `hooks/useRealtime.ts:5,28` | `(m: any) => void` | Incoming realtime message payload untyped |
| `services/messages.ts:24,67,129` | `options: any`, `localPriv: any`, `payload: any` | Upload options, private key local var, send payload all untyped |

**Backend:**

| File | Usage | Impact |
|------|-------|--------|
| `controllers/messages.ts:22` | `(req as any).validatedQuery` | Bypasses type system to access validated query data |

---

### GAP-4 — C4 side effect: logout does not clean up localStorage correctly
**Severity:** Medium (needs verification before confirming)  
**Gap:** `AuthProvider.tsx` logout (lines 61–65) removes private key material from localStorage using `user?.email`:

```ts
localStorage.removeItem(`crypt:priv:${email}`);
localStorage.removeItem(`crypt:pub:${email}`);
```

If `localOwnerId` (used when writing to localStorage in `keys.ts` and `App.tsx`) is now the accountId string after C4, logout removes keys under the wrong localStorage key. Private key material would persist in localStorage after logout.

**Required:** Verify what `localOwnerId` is set to in `App.tsx` before and after C4. If it changed from email to accountId, fix the logout cleanup and audit all other `crypt:priv:` / `crypt:pub:` reads/writes.

---

### GAP-5 — C8 bug: uploadBase64 hardcodes "image" Cloudinary resource type
**Severity:** Low (no current broken path, but fragile)  
**Gap:** `controllers/uploads.ts:55` — after byte-sniffing confirms the MIME type, the Cloudinary upload always uses `"image"` as the resource type:

```ts
const url = await uploadBufferToCloudinary(buffer, "image", "uploads");
```

`ALLOWED_MIME_TYPES` includes `application/pdf`, `text/plain`, and `.docx`. Uploading those as resource type `"image"` will fail or produce wrong results in Cloudinary. The byte-sniffing was correctly added but the resource type mapping was missed.

---

### GAP-6 — C6 not a systematic audit
**Severity:** Low (most controllers are correct by construction)  
**Gap:** The plan said "Verify every protected controller checks resource ownership." The implementation added one check (`getLinkStatus`) and fixed email→accountId fallbacks. No evidence a pass over all controllers was performed.

One unreviewed case: `GET /provider/resolve` returns the internal `accountId` for any `providerChatId`, callable by any authenticated user. This exposes internal user identifiers. Whether this is acceptable by design needs a documented decision, not silence.

---

### GAP-7 — Documentation inaccuracies in REFACTOR_PASS_1_REPORT.md
**Severity:** Low  

| Location | Reported | Actual |
|----------|----------|--------|
| C6 row | "verifies `link.accountId`" | Code uses `record.claimedAccountId` |
| Impact table, C4 | "Must re-login after deploy" | Old JWTs remain valid — `email` field is ignored, not rejected |

The C4 impact error is also in `PRODUCTION_CHECKLIST.md` section "Pre-Deploy: Run C4 Key Migration", last paragraph.

---

## Items confirmed complete (not in question)

C1, C2, C3, C4 (subject to GAP-4 verification), C7, C9, C10, C11 (privJwk scope), C15, C16.

---

## What must be resolved before Pass 1 closes

| # | Gap | Action required |
|---|-----|-----------------|
| GAP-1 | Frontend catch blocks | Add `console.error(err)` to each unlabelled frontend catch; add error state where user-facing failure is invisible |
| GAP-2 | Frontend Zod / type scope | Decision from Grace: add Zod to frontend API responses, or document as explicitly out of scope for Pass 1 and carry to Pass 2 with clear rationale |
| GAP-3 | Remaining `any` types | Type each remaining `any` in frontend services/hooks; fix `(req as any).validatedQuery` in backend |
| GAP-4 | Logout localStorage | Verify `localOwnerId` before and after C4; fix logout if keys are stored under accountId |
| GAP-5 | C8 resource type | Either restrict `ALLOWED_MIME_TYPES` in `uploadBase64` to image types only, or map MIME to correct Cloudinary resource type |
| GAP-6 | C6 resolve endpoint | Document whether `GET /provider/resolve` returning accountId is acceptable; add note to REFACTOR_NOTES.md |
| GAP-7 | Doc errors | Correct field name in report; remove "Must re-login" from checklist |
