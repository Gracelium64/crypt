# Telegram Phone Code Non-Delivery — Investigation & Resolution

**Branch:** `dev/grace-refactor-debug`
**Date opened:** 2026-06-20
**Status:** Waiting on Telegram freshness window (~24h from QR login on 2026-06-20 ~19:42 UTC+2)

---

## The Problem

Phone code login via `requestPhoneCode` always returns `isCodeViaApp: true`. No code arrives anywhere. `auth.ResendCode` returns `SEND_CODE_UNAVAILABLE`. This has persisted for over a week across two credential sets.

Affected number: `+49 1522 4337813`

---

## Root Cause

A **ghost session** from prod/green exists in Telegram's auth database for this number.

When prod/green replaced an MTProto session (during re-login via QR or phone code), it called `client.disconnect()` without first calling `auth.LogOut`. Telegram's server kept the old session as authorized. The session is not visible in the Telegram Devices screen (likely because it has been inactive long enough to drop off the UI list) but is still present in Telegram's auth database and receives code routing.

When `auth.sendCode` is called for this number, Telegram sees the ghost session and routes the code there (`isCodeViaApp: true`). The ghost has no active TCP connection, so the code is never received anywhere. Telegram refuses SMS fallback (`SEND_CODE_UNAVAILABLE`) because it believes an app session exists.

**Confirmed:** `account.GetAuthorizations` returned exactly 1 other session:
- Hash: `7560695766149812965n`
- Not the current session, not visible in Telegram Devices UI

---

## What Was Tried

| Attempt | Result |
|---|---|
| `auth.ResendCode` after `isCodeViaApp: true` | `SEND_CODE_UNAVAILABLE` — no alternate channel available |
| QR login → `auth.ResetAuthorizations` (bulk) | `FRESH_RESET_AUTHORISATION_FORBIDDEN` — session too new |
| QR login → `account.ResetAuthorization` (by hash) | `FRESH_RESET_AUTHORISATION_FORBIDDEN` — same restriction on individual call |

Telegram applies `FRESH_RESET_AUTHORISATION_FORBIDDEN` to both bulk and individual session termination for sessions created within ~24 hours.

---

## Code Bugs Fixed (This Session)

**1. Session replacement without `auth.LogOut`** — the root cause of ghost sessions accumulating.

Three locations in `backend/src/services/telegram-mtproto.service.ts` replaced old clients with only `disconnect()`. All now call `auth.LogOut` first:

- `verifyPhoneCode` — phone code flow (before replacing old client with new authenticated one)
- QR auth completion — QR flow (same pattern)
- `disconnectMTProtoSession` — now reconstructs the client from the saved DB session string if the client is not in the in-memory `clients` map (e.g. after backend restart), then calls `auth.LogOut` before clearing the session string from MongoDB

**2. New endpoint: `POST /api/telegram/direct/reset-sessions`**

Uses `account.GetAuthorizations` to list all other sessions, then calls `account.ResetAuthorization` for each. Visible in the ConnectTelegram UI as "Reset other sessions" button (appears when connected).

**3. `requestPhoneCode` now returns `codeType`**

When `isCodeViaApp: true`, attempts `auth.ResendCode` and returns the delivery channel (`"sms"`, `"call"`, `"app"`, `"other"`). Frontend shows the appropriate hint. Falls back gracefully when `ResendCode` fails.

---

## Steps to Complete the Fix (~24 Hours from Now)

The current QR session for `+49 1522 4337813` was created at approximately **19:42 UTC+2 on 2026-06-20**. It becomes non-fresh at approximately **19:42 UTC+2 on 2026-06-21**.

**Prerequisites:**
- The QR session must be active and connected in Crypt dev (status shows "Active" in settings)
- If the session was disconnected (via the Disconnect button), re-do step 1 first

**Steps:**

1. Open Crypt dev on the Samsung → Settings → Connect Telegram
2. If not showing "Active": use **QR code** tab → Generate QR code → scan with the Samsung's Telegram app for `+49 1522 4337813` → wait for auth complete
3. Once showing "Active" and the clock reads after **19:42 on 2026-06-21**: click **"Reset other sessions"** → confirm
4. Backend log should show:
   ```
   [MTProto] found 1 other session(s) to clear for <accountId>
   [MTProto] cleared 1 of 1 other sessions for <accountId>
   ```
5. Click **Disconnect** — this sends a proper `auth.LogOut` for the current QR session
6. Go to **Phone code** tab → enter `+49 1522 4337813` → Continue
7. Backend log should now show `isCodeViaApp: false` (no ghost = no app session to route to)
8. Code arrives via SMS

**If step 3 still returns `FRESH_RESET_AUTHORISATION_FORBIDDEN`:** the 24h window has not elapsed. Wait longer and retry. Do not disconnect between attempts.

**If step 7 still shows `isCodeViaApp: true`:** there may be a second ghost session. Repeat steps 3–6 for each session found.

---

## UI Cleanup Required Before Production

The "Reset other sessions" button added to `ConnectTelegram.tsx` is a debug tool for this specific fix. **Remove it before deploying to production.**

Revert the following changes in `frontendReactJs/src/components/ConnectTelegram.tsx`:
- Remove `resetConfirm`, `resetDone`, `resetError` state declarations
- Remove the `resetOtherSessions` function
- Remove the `{resetError && ...}` error display from the connected view
- Return the connected view's action row to its original state (only the Disconnect button with its confirm flow)

The backend endpoint (`POST /api/telegram/direct/reset-sessions`) and service function (`resetOtherSessions`) can remain — they are correct behaviour and may be useful for future admin tooling. Only the frontend exposure needs to be removed.

---

## After the Fix

Once phone code delivery is confirmed working:

1. Update this file status to `RESOLVED`
2. Test the full phone code → verify code → MTProto session flow end to end
3. Switch Telegram bot webhook back to production:
   ```
   npm run set-webhook -- --url https://crypt-backend-s14y.onrender.com/api/providers/telegram/webhook
   ```
4. Switch WhatsApp webhook back to production via Meta Developer Console

---

## Prevention Going Forward

The `auth.LogOut` fix is in place in this branch. Before deploying to production, verify that the same fix is applied to prod/green's session management, or that the prod/green deployment is replaced by this branch.
