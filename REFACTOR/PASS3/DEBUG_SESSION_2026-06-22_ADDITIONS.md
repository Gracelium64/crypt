# Debug Session 2026-06-22 — Additions (items 6, 7 + security audit)

This file holds content from the 2026-06-22 debug session that could not be appended to
`REFACTOR/PASS2/DEBUG_SESSION_2026-06-22.md` or `DEBUG_SESSIONS_SUMMARY.md` without those
tracked files being committed with security vulnerability details.

---

## Item 6 — Unread dot reappears after switching provider tabs

**Symptom:** Read a message → unread dot disappears → switch to the other provider tab → switch back → dot reappears, even though no new message arrived.

**Root cause:** `markConversationRead` only set `lastDirection: undefined` in local React state. The next `loadConversations` call (poll or tab switch) fetched fresh data from the server and overwrote that local state, restoring the `lastDirection: "inbound"` value and re-lighting the dot.

**Fix (`frontendReactJs/src/App.tsx`):** Added a `readTimestamps` ref (`Map<chatId, lastMessageAt>`) that records the `lastMessageAt` timestamp of a conversation at the moment it is opened. At render time, before passing conversations to `ChatsPage`, the dot is suppressed for any conversation whose `lastMessageAt` matches the recorded read timestamp — meaning no genuinely new message has arrived since it was read. If a new message arrives (different `lastMessageAt`), the dot correctly re-lights.

```typescript
const readTimestamps = useRef<Map<string, string | undefined>>(new Map());

// In openConversation:
const conv = conversationsRef.current.find((c) => c.chatId === chatId);
readTimestamps.current.set(chatId, conv?.lastMessageAt);

// At render time:
const readAt = readTimestamps.current.get(c.chatId);
const isRead =
  (chatOpen && c.chatId === selectedChatId) ||
  (readTimestamps.current.has(c.chatId) && readAt === c.lastMessageAt);
return isRead ? { ...c, lastDirection: undefined } : c;
```

Also added `conversationsRef` (`useRef` mirroring `convHook.conversations`) so `openConversation` can read the current conversation list without a stale closure.

---

## Item 7 — Telegram/WhatsApp loading state asymmetry and race condition

**Symptom:** Switching provider tabs showed a spinner for Telegram (which triggered a fresh load on tab switch) but WhatsApp often skipped the spinner because its data was already cached. Shared `conversationsLoading` boolean was also vulnerable to a race condition: if both providers loaded concurrently, the first to finish would set `conversationsLoading = false`, clearing the spinner before the second had completed.

**Root cause:** `conversationsLoading` was a single `boolean` shared across all providers. It could only represent one loading state at a time.

**Desired behaviour:** spinner shows only when loading AND no cached data exists for the current provider; refreshing (poll, tab switch) must not disrupt already-displayed conversations; "No chats yet" appears only when genuinely empty and not loading.

**Fix (`frontendReactJs/src/App.tsx`):** Replaced `const [conversationsLoading, setConversationsLoading] = useState(false)` with `const [loadingProviders, setLoadingProviders] = useState<Set<Provider>>(new Set())`. The `loadConversations` wrapper always adds the provider to the set on start and removes it on finish (creating a new `Set` instance each time for React state detection). `ChatsPage` receives `conversationsLoading={loadingProviders.has(provider)}`.

The existing ChatsPage condition `conversationsLoading && conversations.length === 0` now correctly handles all four cases without any additional changes:
- Loading + no cached data → spinner
- Loading + cached data → no spinner, existing conversations stay visible
- Not loading + empty → "No chats yet"
- Not loading + data → conversation list

The `showLoading` parameter on `loadConversations` was removed entirely — it was the wrong abstraction. The visual is now driven purely by whether data is present, not by how the load was initiated.

---

## Security audit — 2026-06-22

Full audit of every MongoDB write path to determine what lands in plain text.

**Correctly protected (no action needed):**
- `Account.passwordHash` — bcrypt (cost 10) ✓
- `Key.privateKeyJwk` — encrypted client-side with PBKDF2 (310k iterations, SHA-256, random salt) + AES-GCM-256 before transmission; backend stores only the ciphertext string ✓
- `TelegramSession.sessionString` — server-side AES-256-GCM (`encryptText`) ✓

**Plain-text findings (mitigation plan: `REFACTOR_PASS_3_PLAN.md`):**

| Severity | Field | Issue |
|---|---|---|
| HIGH | `TelegramSession.phoneNumber` | Phone number plain next to an encrypted session string |
| HIGH | `ProviderConnection.providerChatId` | Telegram user IDs and WhatsApp phone numbers, indexed |
| MEDIUM | `ProviderConnection.username` | Telegram @usernames, indexed and searchable |
| MEDIUM | `Account.email` | Email addresses, unique index |
| MEDIUM | `Message.from / to / chatId` | Provider IDs per message |
| MEDIUM | `Message.encryptedText` | Inbound messages from non-crypt users stored plain |

Groups 1+2 are code fixes; Group 3 fields cannot be encrypted without breaking core functionality and are mitigated via Atlas access control instead.

---

## Additional files changed (items 6, 7, security audit)

| File | Change |
|---|---|
| `frontendReactJs/src/App.tsx` | `readTimestamps` ref for unread dot persistence; per-provider `Set<Provider>` loading state replacing shared boolean; removed `showLoading` parameter |
| `REFACTOR/PASS3/REFACTOR_PASS_3_PLAN.md` | Created — security mitigation plan for plain-text PII findings |

---

## Summary additions to DEBUG_SESSIONS_SUMMARY.md

### Item 21 — Unread dot reappears after switching provider tabs
**Root cause:** `markConversationRead` set `lastDirection: undefined` in local React state only. The next `loadConversations` (poll or tab switch) fetched fresh server data and restored `lastDirection: "inbound"`, re-lighting the dot even though no new message had arrived.
**Fix:** `App.tsx` — added `readTimestamps` ref (`Map<chatId, lastMessageAt>`). On `openConversation`, records the conversation's `lastMessageAt` at read time. At render time, suppresses the dot for any conversation whose current `lastMessageAt` matches the recorded value. If a genuinely new message arrives (different `lastMessageAt`), the dot correctly re-lights. Also added `conversationsRef` (useRef mirror of `convHook.conversations`) to give `openConversation` access to current data without a stale closure.

### Item 22 — Telegram/WhatsApp loading state asymmetry and race condition
**Root cause:** `conversationsLoading` was a single shared boolean. Concurrent loads for both providers created a race: whichever finished first cleared the shared boolean, ending the spinner prematurely for the other.
**Fix:** `App.tsx` — replaced the boolean with `const [loadingProviders, setLoadingProviders] = useState<Set<Provider>>(new Set())`. Per-provider tracking; spinner only when loading AND no cached data present. `showLoading` parameter removed (wrong abstraction).

### New recurring patterns
| Local state overwritten by next server fetch | 21 |
| Shared boolean inadequate for independent concurrent operations | 22 |
