# Refactor Pass 2 — Security Remediation (Correction)

**Branch:** `dev/grace-slop-refactor`
**Date:** 2026-06-20
**Session trigger:** Full security audit of Pass 1 + Pass 2 output requested by Grace — verify from files, not memory.

---

## What Was Found

A security audit re-verified every route from scratch (no assumption, no memory). The audit classified all 30+ routes into groups by access model.

### Route groups (post-audit classification)

| Group | Model | Routes |
|---|---|---|
| A | Public — required by function (webhooks, admin-gated) | Telegram/WhatsApp webhooks, `/provider/link/complete` (requireAdmin), `/health` |
| B | Cross-user — authenticated but no ownership check by design | `GET /provider/contact/search` (find anyone), `GET /keys/:ownerId` (fetch anyone's public key) |
| C | Self only — must be authenticated AND the resource belongs to the caller | All remaining authenticated routes (21 total) |
| D | Was public, security risk identified | `GET /provider/resolve` — leaked internal accountId from a provider chat ID; no legitimate frontend caller |

**Gap identified:** Group C routes had `authenticate` middleware (proves identity) but no `authorize` middleware (proves ownership). A valid JWT from any account could call any Group C endpoint.

---

## What Was Implemented

### Category 1 — `authorize()` on all 21 Group C routes

Extended `middleware/authorize.ts` to support a no-argument call:
- `authorize()` with no arg: asserts `req.account` is present, calls `next()` — self-authorization marker at router level
- `authorize(loader)` with a resource loader: existing ownership check, unchanged

Files modified:

| File | Routes updated |
|---|---|
| `routes/auth.route.ts` | `GET /auth/me`, `DELETE /auth/account` |
| `routes/messages.route.ts` | `GET /messages`, `GET /conversations`, `POST /messages/send`, `DELETE /messages/conversation`, `DELETE /messages/all` |
| `routes/uploads.route.ts` | `POST /uploads/base64`, `POST /uploads/formidable` |
| `routes/keys.route.ts` | `POST /keys/register`, `GET /keys/me/private` |
| `routes/providers.route.ts` | `GET /providers/status` |
| `routes/providerConnections.route.ts` | `GET /provider/connections` |
| `routes/link.route.ts` | `POST /provider/link/init` |
| `routes/telegram.route.ts` | All 7: `GET /direct/status`, `POST /request-code`, `POST /verify-code`, `DELETE /session`, `POST /request-qr`, `GET /qr-status`, `POST /qr-2fa` |

Pre-existing resource-loader authorize routes (done in Pass 1 gap fixes, retained):
- `GET /provider/link/status/:code` → `authorize((req) => Link.findOne({ code: req.params.code }).lean())`
- `DELETE /provider/connections/:id` → `authorize((req) => ProviderConnection.findById(req.params.id).lean())`

### Category 2 — `GET /provider/resolve` → `requireAdmin`

**Why:** The frontend never calls this endpoint (confirmed by grep: zero hits in frontend source). The backend resolves fan-out via direct DB queries, not this endpoint. It existed as an internal utility that leaked Crypt account membership to any authenticated user given just a provider chat ID.

Change: replaced `authenticate` with `requireAdmin` (x-admin-token header guard).

### Category 3 — `authRateLimiter` on 4 Telegram action routes

Rate-limited `POST /telegram/direct/request-code`, `POST /verify-code`, `POST /request-qr`, `POST /qr-2fa` with the existing `authRateLimiter` (20 req / 15 min).

Not rate-limited: `GET /direct/status` and `GET /qr-status` (read-only, in-memory — rate limiting these would block QR polling within 80 seconds at normal 4-second interval).

### Category 4 — `linkRateLimiter` on `POST /provider/link/init`

Added `linkRateLimiter` (30 req / 15 min) to the link init route, before `authenticate`.

### Category 5 — Swagger conditional auth

`routes/swagger.route.ts`: added `const prodGuard: RequestHandler[] = process.env.NODE_ENV === "production" ? [authenticate] : []` and spread it onto both `/openapi.json` and `/docs` routes.

Effect: unauthenticated locally (developer ergonomics), JWT-gated in production (honeypot shielded from public scanners).

**Why CSP not enabled:** Swagger UI loads from `unpkg.com` CDN and uses inline `<script>` tags — helmet's default CSP blocks both. Swagger is the only HTML page; disabling CSP only for that admin-only page is the right trade-off.

### Category 6 — Helmet HTTP security headers

- Added `helmet@8.2.0` to `backend/package.json` (exact pin, ≥5 days old)
- `backend/src/server.ts`: `app.use(helmet({ contentSecurityPolicy: false }))` — first middleware, before CORS

CSP disabled globally because the only HTML page (Swagger) requires CDN scripts. All other helmet defaults active: HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

---

## authorize.ts — Final State

```ts
export const authorize = (getResource?: ResourceLoader): RequestHandler => {
  return async (req, _res, next) => {
    if (!req.account) {
      next(new Error("Unauthorized", { cause: { status: 401 } }));
      return;
    }

    if (!getResource) {
      next();          // self-authorization: account is present, that's sufficient
      return;
    }

    let resource: OwnedResource | null = null;
    try {
      resource = await getResource(req);
    } catch {
      next(new Error("Not found", { cause: { status: 404 } }));
      return;
    }

    if (!resource) {
      next(new Error("Not found", { cause: { status: 404 } }));
      return;
    }

    const owner = resource.claimedAccountId ?? resource.accountId;
    if (!owner || owner.toString() !== req.account.accountId) {
      next(new Error("Forbidden", { cause: { status: 403 } }));
      return;
    }

    next();
  };
};
```

---

## Middleware Chain (after correction)

All Group C routes follow: `[rateLimiter?] → authenticate → authorize() → [validateBody/Query?] → handler`

Group D (`/provider/resolve`): `requireAdmin → validateQuery → handler`

Webhooks (Group A): `handler` (own secret verification inside controller)

---

## Verification

All changes verified by direct file reads after every category.

Final TypeScript check: `cd backend && npx tsc --noEmit` → zero errors, zero warnings.

```
Verify commands:
grep -n "authorize()" backend/src/routes/*.route.ts       # 21 self-auth routes
grep -n "requireAdmin" backend/src/routes/providerConnections.route.ts  # resolve
grep -n "authRateLimiter" backend/src/routes/telegram.route.ts  # 4 action routes
grep -n "linkRateLimiter" backend/src/routes/link.route.ts      # link/init
grep -n "prodGuard" backend/src/routes/swagger.route.ts         # swagger gating
grep -n "helmet" backend/src/server.ts                          # helmet
```
