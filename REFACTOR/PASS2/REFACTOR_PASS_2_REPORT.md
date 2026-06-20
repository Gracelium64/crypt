# Refactor Pass 2 — Final Report

**Branch:** `dev/grace-slop-refactor`  
**Date completed:** 2026-06-20  
**Scope:** P2-A CSS Architecture Refactor (carried over from Pass 1 as C13 + C14)

---

## What Was Done

### P2-A: CSS Architecture Refactor

Split the monolithic `App.css` (822 lines) into 13 scoped CSS files under `frontendReactJs/src/styles/`. Extracted all inline `style={}` props from 14 TSX files into those files.

---

## Files Created

### New CSS files (13 total)

| File | Contents |
|---|---|
| `src/styles/global.css` | Resets, CSS variables, `.app-shell`, screen containers, bottom-nav, buttons, inputs, chip, misc utilities, scrollbar; new classes: `.app-shell--centered`, `.loading-text` |
| `src/styles/app-dialogs.css` | Toast, toast-close; new classes: `.toast-text`, `.nuke-trigger`, `.nuke-backdrop`, `.nuke-dialog`, `.nuke-icon`, `.nuke-title`, `.nuke-description`, `.nuke-countdown-label`, `.nuke-count`, `.nuke-seconds`, `.nuke-progress-track`, `.nuke-progress-bar`, `.nuke-cancel` |
| `src/styles/auth.css` | Auth form, tab bar, field styles; new classes: `.auth-shell`, `.auth-card`, `.auth-title`, `.auth-tab-bar`, `.auth-tab` (+`.active`), `.auth-error`, `.auth-field`, `.auth-field-pw`, `.auth-forgot-row`, `.auth-forgot-btn`, `.auth-forgot-hint`, `.auth-field-error`, `.auth-help-btn` |
| `src/styles/chat.css` | Provider pills, conv-list, composer, file-preview; new classes: `.conv-row`, `.cv-attach-label`, `.cv-file-hidden`, `.cv-delete-confirm-row`, `.cv-delete-confirm-label`, `.cv-delete-trigger` |
| `src/styles/settings.css` | Settings screen; new classes: `.sp-key-section`, `.sp-tg-desc`, `.sp-tg-body`, `.sp-wa-body`, `.sp-toast-on`, `.sp-spacer` |
| `src/styles/components/timeline.css` | Timeline, bubble, message rules; new classes: `.message-security`, `.attach-error` |
| `src/styles/components/find-contact.css` | Find contact; new classes: `.fc-provider-tabs`, `.fc-provider-btn`, `.fc-search-row`, `.fc-search-input`, `.fc-error`, `.fc-result`, `.fc-result-name`, `.fc-result-display`, `.fc-result-chatid`, `.fc-key-info`, `.fc-fingerprint-label`, `.fc-fingerprint-mono`, `.fc-e2e-available`, `.fc-no-key`, `.fc-start-btn` |
| `src/styles/components/key-manager.css` | Fingerprint, verify-panel, key-qr; new classes: `.key-auth-hint`, `.key-confirm-warning`, `.key-confirm-actions`, `.key-error` |
| `src/styles/components/link-wizard.css` | Link card through link-actions; new classes: `.lw-btn-row`, `.lw-code-row`, `.lw-code-text`, `.lw-expiry`, `.lw-status`, `.lw-deep-row`, `.lw-deep-error`, `.lw-tip` |
| `src/styles/components/connections-panel.css` | conn-item through conn-info; new classes: `.conn-error`, `.conn-empty-text`, `.conn-unlink-row`, `.conn-unlink-label`, `.conn-refresh-row` |
| `src/styles/components/connect-telegram.css` | All new (no App.css source): `.ctg-connected-actions`, `.ctg-disconnect-label`, `.ctg-container`, `.ctg-mode-tabs`, `.ctg-error`, `.ctg-phone-row`, `.ctg-phone-input`, `.ctg-hint`, `.ctg-hint-lh`, `.ctg-action-row`, `.ctg-qr-container`, `.ctg-qr-img`, `.ctg-qr-placeholder`, `.ctg-2fa-label`, `.ctg-2fa-container`, `.ctg-bot-linked`, `.ctg-bot-linked-header`, `.ctg-bot-linked-hint`, `.ctg-bot-code-container`, `.ctg-bot-code-row`, `.ctg-bot-code-text`, `.ctg-bot-actions`, `.ctg-bot-idle-hint` |
| `src/styles/components/connect-whatsapp.css` | All new: `.cwa-container`, `.cwa-link-container`, `.cwa-code-row`, `.cwa-code-text`, `.cwa-hint`, `.cwa-deep-actions` |
| `src/styles/components/onboarding.css` | All new: `.ob-backdrop`, `.ob-sheet`, `.ob-header`, `.ob-title`, `.ob-subtitle`, `.ob-close`, `.ob-scroll`, `.ob-step`, `.ob-step-title`, `.ob-step-body` |

---

## Files Modified

### TSX files (14 total)

| File | Change |
|---|---|
| `src/App.tsx` | Import swapped (`App.css` → `global.css` + `app-dialogs.css`); 14 inline styles extracted; 1 dynamic inline style retained (see below) |
| `src/pages/AuthPage.tsx` | CSS import added; 14 inline styles extracted |
| `src/pages/ChatsPage.tsx` | CSS import added; 1 inline style extracted |
| `src/pages/ChatView.tsx` | CSS import added; 5 inline styles extracted |
| `src/pages/SettingsPage.tsx` | CSS import added; 6 inline styles extracted; conditional style converted to className toggle |
| `src/layouts/ProtectedLayout.tsx` | CSS import added; 2 inline styles extracted |
| `src/components/Timeline.tsx` | CSS import added; 2 inline styles extracted |
| `src/components/KeyManager.tsx` | CSS import added; 4 inline styles extracted |
| `src/components/ConnectionsPanel.tsx` | CSS import added; 5 inline styles extracted |
| `src/components/ConnectWhatsApp.tsx` | CSS import added; 8 inline styles extracted |
| `src/components/FindContact.tsx` | CSS import added; 15 inline styles extracted |
| `src/components/ConnectTelegram.tsx` | CSS import added; 26 inline styles extracted |
| `src/components/OnboardingModal.tsx` | CSS import added; 10 inline styles extracted; entire JSX return rewritten |
| `src/components/LinkWizard.tsx` | CSS import added; 8 inline styles extracted |

### Dead file (not deleted, not imported)

| File | Status |
|---|---|
| `src/App.css` | Orphaned — all rules distributed to the 13 new CSS files; no longer imported anywhere. Can be deleted in a later cleanup pass. |

---

## Outcome

| Metric | Before | After |
|---|---|---|
| CSS architecture | 1 monolithic App.css (822 lines) + no component CSS | 13 scoped CSS files, one per component/page |
| Inline `style={}` props | 122 across 14 TSX files | **1** (intentional — see below) |
| TypeScript errors | 0 | **0** (`npx tsc --noEmit` — clean) |
| New CSS class names introduced | 0 | ~95 classes across 13 files |

### Retained inline style

```tsx
// App.tsx:527
<div className="nuke-progress-bar" style={{ width: `${(nukeCount / 10) * 100}%` }} />
```

Width is a runtime-computed value that changes every second during the nuke countdown. A static CSS class cannot represent it. This is the single intentional exception to the "zero inline styles" goal.

---

## Visual Regression Baseline

28 screenshots taken before the refactor (15 original + 13 supplemental), covering:

- Auth page (sign-in and sign-up tabs)
- Chats list (empty and populated)
- Chat view (messages, composer, attachment states)
- Settings page (all sections: keys, Telegram, WhatsApp, toasts)
- Find Contact (idle, search result, no-key, e2e-available states)
- Key Manager (fingerprint view, confirm dialog)
- Connections Panel
- Connect Telegram (all three modes: phone, QR, bot; code entry state)
- Connect WhatsApp (link code state)
- Onboarding modal (open state)
- Link Wizard (code generated state)

**Gap:** Link wizard completion/success state not captured — linking is broken due to a pre-existing bug handled in a separate session. The CSS split for this state was done verbatim from App.css; no inline styles were present for the success state.

---

## What Was Not Done (Out of Scope for P2-A)

- DB migration (Part 2 of the plan): no code changes needed; instructions are in REFACTOR_PASS_2_PLAN.md
- Deployment order (Part 4): documented in REFACTOR_PASS_2_PLAN.md; no code changes needed
- Deleting `src/App.css`: safe to do but left for a separate cleanup commit

---

## Verification Evidence

- Final `grep -rn 'style={{' src/` → 1 result (`App.tsx:527`, intentional dynamic width)
- `npx tsc --noEmit` → no output (zero errors)
- All 13 CSS files exist under `src/styles/` and `src/styles/components/`
- All 14 TSX files import their CSS file; `App.tsx` no longer imports `App.css`
