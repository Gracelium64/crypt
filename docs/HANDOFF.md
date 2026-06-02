# HANDOFF — Finish Frontend Refactor

Date: 2026-06-02

## Purpose

This file summarizes the current frontend refactor state and provides step-by-step instructions for a follow-up agent to finish the work and validate the app. Use this when handing the task to another agent or teammate.

## Quick summary of completed work

- Centralized client helpers:
  - `frontendReactJs/src/lib/api.ts` (apiFetch/apiJson)
  - `frontendReactJs/src/lib/crypto.ts` (WebCrypto helpers)
- Services and core flows added:
  - `frontendReactJs/src/services/messages.ts` (send/upload helpers)
  - `frontendReactJs/src/services/keys.ts` (key lifecycle)
- Hooks created:
  - `frontendReactJs/src/hooks/useProviders.ts`
  - `frontendReactJs/src/hooks/useConnections.ts`
  - `frontendReactJs/src/hooks/useConversations.ts`
  - `frontendReactJs/src/hooks/useLink.ts`
  - `frontendReactJs/src/hooks/useRealtime.ts` (socket lifecycle)
- Partial refactor of `App.tsx` to use the hooks above; also replaced some inline keygen/register with `services/keys` calls.
- Added a small TypeScript ambient for tests to avoid build errors: `src/types/vitest.d.ts`.
- Frontend and backend builds succeeded locally after these changes.

## Current state / known scope

- `App.tsx` was partially refactored — many responsibilities moved to hooks, but some orchestration remains in `App.tsx`:
  - The `sendMessage` orchestration (upload, encrypt, call `messages` service, refresh conversations/messages) is still in `App.tsx`.
  - The `onNewMessage` live-update handler remains implemented in `App.tsx` as a `useCallback`. This duplicates logic present in `useConversations` (which does message loading + bulk decryption).
  - UI is split into components (Composer, Timeline, ConnectionsPanel, KeyManager, OnboardingPanel, LinkWizard) but some components still rely on inline state/handlers in `App.tsx` rather than using hooks directly.

## What remains (concrete tasks)

1. Extract the send flow into a hook/service (high priority)
   - Create `frontendReactJs/src/hooks/useSend.ts` or `frontendReactJs/src/services/send.ts`.
   - Move the `sendMessage` logic out of `App.tsx` and expose a `sendMessage(...)` function that:
     - calls `sendMessageService` (already present in `services/messages.ts`),
     - refreshes conversations and messages via `convHook.loadConversations` / `convHook.loadMessages`,
     - handles local `privJwk` fallback logic and returns a success/failure result.
   - Update `App.tsx` to import and use the new hook: `const { sendMessage, busy: sendBusy } = useSend(auth.token, convHook)` and replace the inline `sendMessage` function.

2. Consolidate single-message live decryption into `useConversations`
   - Add `handleIncomingMessage(message: ChatMessage, privJwk?, localOwnerId?)` to `useConversations.ts` that:
     - Attempts to decrypt a single incoming message (same logic currently inside App's `onNewMessage`).
     - Appends it into `messages` state and updates `lastSync`.
   - Update `App.tsx` to pass the `convHook.handleIncomingMessage` into `useRealtime` (i.e. `useRealtime(convHook.handleIncomingMessage)`), and remove the `onNewMessage` callback from `App.tsx`.

3. Finish wiring and remove leftover orchestration in `App.tsx`
   - After (1) and (2), `App.tsx` should be a composition of hooks + presentational components. Remove remaining polling and duplication.
   - Extract the selected thread header/verify UI to a component `frontendReactJs/src/components/SelectedConversationPanel.tsx` and move the verify logic there (uses `apiFetch` + QR generation). That will reduce `App.tsx` size.

4. Tighten TypeScript types
   - Add `frontendReactJs/src/types.ts` and export interfaces used across hooks/components: `Provider`, `ConversationSummary`, `ChatMessage`, `ProviderStatus`, etc.
   - Replace `any` in hooks with the proper interfaces.

5. Tests and CI
   - Run `npm run test` in `frontendReactJs` and fix any failing tests. The repo contains a `crypto.test.ts` which should be runnable with `vitest`.

6. Provider verification and live flows (blocked)
   - Operator secrets required: `TELEGRAM_BOT_TOKEN`, `WHATSAPP_ACCESS_TOKEN` (or test tokens), and a public webhook URL (ngrok / deployed host) to fully validate provider send/receive.

## Exact code hints / copy-paste snippets

- Suggested `useSend.ts` (starter):

```ts
// frontendReactJs/src/hooks/useSend.ts
import { useState } from "react";
import { sendMessageService } from "../services/messages";

export default function useSend(authToken: string | null, convHook: any) {
  const [busy, setBusy] = useState(false);

  const sendMessage = async (opts: {
    provider: string;
    selectedChatId: string;
    conversationTarget: string;
    replyMode: "secure" | "plain";
    text?: string;
    file?: File | null;
    imageUrl?: string;
    privJwk?: any | null;
    localOwnerId?: string | null;
  }) => {
    setBusy(true);
    try {
      await sendMessageService({
        provider: opts.provider,
        selectedChatId: opts.selectedChatId,
        conversationTarget: opts.conversationTarget,
        replyMode: opts.replyMode,
        text: opts.text,
        file: opts.file,
        imageUrl: opts.imageUrl,
        authToken: authToken,
        privJwk: opts.privJwk,
        localOwnerId: opts.localOwnerId,
      });

      // Refresh conversations/messages using convHook passed from App
      try {
        await convHook.loadConversations(opts.provider);
        await convHook.loadMessages(
          opts.provider,
          opts.selectedChatId,
          undefined,
          opts.privJwk,
          opts.localOwnerId,
        );
      } catch (e) {
        // non-fatal refresh errors
      }

      return true;
    } catch (err) {
      console.error("sendMessage failed", err);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return { sendMessage, busy };
}
```

- Suggested `handleIncomingMessage` addition for `useConversations.ts` (append the message and try decrypt):

```ts
// inside useConversations - add this function and return it
const handleIncomingMessage = useCallback(
  async (message: any, privJwk?: any | null, localOwnerId?: string | null) => {
    // Attempt decrypt for single message (reuse logic from loadMessages)
    try {
      const ct = message.encryptedText ?? "";
      if (!isSecureCiphertext(ct)) return;
      const priv =
        privJwk ??
        (localOwnerId
          ? JSON.parse(
              localStorage.getItem(`crypt:priv:${localOwnerId}`) || "null",
            )
          : null);
      if (!priv) return;

      const ownerId =
        message.direction === "inbound" ? message.from : message.to;
      if (!ownerId) return;

      const resp = await apiFetch(`/keys/${encodeURIComponent(ownerId)}`);
      if (!resp.ok) return;
      const j = await resp.json();
      const theirPub = j?.data?.publicKey;
      if (!theirPub) return;

      const plain = await decryptFromSender(ct, priv, theirPub);
      if (plain) message.decryptedText = plain;
    } catch (err) {
      // ignore
    }

    // append message
    setMessages((current) => [...current, message]);
    setLastSync(message.createdAt);
  },
  [],
);

// return handleIncomingMessage from the hook
```

## Integration notes

- After adding `useSend` and `handleIncomingMessage`, update `App.tsx`:
  - Replace inline `sendMessage` with call to `useSend` and `await sendMessage(...)`.
  - Replace inline `onNewMessage` callback by passing `convHook.handleIncomingMessage` into `useRealtime`.

## Commands to run locally

Frontend build & test:

```bash
cd frontendReactJs
npm install
npm run build
npm run test
npm run dev
```

Backend build:

```bash
cd backend
npm install
npm run build
npm run start
```

## Blockers / required secrets

- Provider credentials (operator must provide):
  - `TELEGRAM_BOT_TOKEN`
  - `WHATSAPP_ACCESS_TOKEN` / phoneNumberId (if using WhatsApp Cloud)
- Public webhook URL for provider webhooks (ngrok or deployed host) to validate webhook flows.

## Validation checklist for the agent who continues

- [ ] Create `useSend` and remove `sendMessage` from `App.tsx`.
- [ ] Add `handleIncomingMessage` to `useConversations` and update `useRealtime` usage.
- [ ] Extract `SelectedConversationPanel` component and move verification UI.
- [ ] Add `src/types.ts` and replace `any` across hooks/components.
- [ ] Run `npm run test` and fix failures.
- [ ] With operator secrets, test provider send/receive + link flows.

## Notes

- Do not commit to git unless creating a PR. The previous changes in this workspace were applied via patches (no automated commits performed).
- The frontend and backend builds succeeded locally before creating this handoff.

If you want me to continue now, I can implement the `useSend` hook and `handleIncomingMessage` change and wire `App.tsx` to finish the refactor; otherwise hand this `docs/HANDOFF.md` to the next agent.
