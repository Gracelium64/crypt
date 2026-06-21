## Part 2 — DB Migration Instructions (C4 Key Migration)

These are the exact steps Grace should run before deploying Pass 1 to production. This section is the authoritative run-book.

### When to run this

Only if upgrading an existing deployment that has user data. Skip entirely for a fresh install.

### Prereqs

- [ ] A Render shell or local terminal with access to the production `MONGODB_URI`
- [ ] The new backend code is built and ready but NOT yet deployed to Render
- [ ] Atlas snapshot taken (Atlas → Backup → take on-demand snapshot) or noted the Atlas point-in-time restore window

---

### Step 1 — Backup

```bash
# From backend/ with MONGODB_URI set in environment
npm run backup:keys
```

Expected output:

```
Backed up N keys to keys_backup_pre_migration
```

**Verify:** Open Atlas → Collections → `keys_backup_pre_migration`. Confirm document count matches your Key collection count.

If you see `keys_backup_pre_migration already contains N docs` — a backup already exists. Either delete it in Atlas first, or skip this step if you're satisfied the backup is current.

---

### Step 2 — Dry-run check

Before running the migration, verify that every account has a corresponding email in the Account collection:

```js
// Run in Atlas → Data Explorer → Aggregation, or mongosh
db.accounts.find({}, { email: 1, _id: 1 }).toArray();
```

Confirm no accounts have a null or missing `email` field. If any do, the migration will skip those accounts' keys silently — check the console output for lines with `0 keys`.

---

### Step 3 — Migrate

```bash
npm run migrate:key-owner-ids
```

Expected output (one line per account):

```
user@example.com: migrated 1 keys
user2@example.com: migrated 1 keys
...
Migration complete.
```

Accounts with `0 keys` migrated are fine — they may be accounts that never completed key exchange.

---

### Step 4 — Verify

In Atlas → Collections → `keys`:

- `ownerId` fields should now be MongoDB ObjectId strings (24-char hex), not email addresses
- Provider-mirrored keys (ownerId = Telegram chat ID or phone number) should be unchanged

---

### Step 5 — Rollback (only if migration failed)

```bash
npm run rollback:key-migration
```

This deletes all current Key documents and restores from `keys_backup_pre_migration`. Only run this if the migration produced incorrect results. Do NOT run rollback after deploying the new backend — the new backend expects accountId-based ownerIds.

---

### Step 6 — Deploy (see Part 4 below)

After migration is verified, proceed to deploy in the order specified in Part 4.

---

## Part 4 — Deployment Order

This is the exact deploy sequence once the full refactor (Pass 1 + Pass 2) is approved.

### Context

- The C4 migration changes `Key.ownerId` from email to accountId
- The C9 change requires frontend to emit `join:account` before realtime messages arrive
- Both changes require coordinated frontend + backend deploy
- The old backend + new frontend: safe (join:account ignored, keys still work via old email path — but only if migration hasn't run yet)
- The new backend + old frontend: BROKEN (realtime rooms won't work; key lookups fail because frontend still sends email to `/keys/:ownerId`)

**Rule:** Run the DB migration first. Then deploy frontend and backend together as a coordinated cutover. Minimize the window between the two.

---

### Deployment Sequence

#### Pre-deploy (30 min before)

1. Take Atlas snapshot (Atlas → Backup → On-demand)
2. Run C4 key migration (Steps 1–5 in Part 3 above)
3. Build and smoke-test backend locally against prod DB:
   ```bash
   cd backend && MONGODB_URI=<prod-uri> npm run build
   ```
4. Verify TypeScript compile succeeds with no errors

#### Deploy — fresh installs

1. Deploy backend to Render, note the backend URL
2. Set `VITE_API_BASE_URL` on the frontend Render service, deploy frontend
3. Note the frontend URL, set it as `CORS_ORIGIN` in backend Render env → redeploy backend (or set env first if you can predict the URL)
4. Register Telegram webhook:
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://<render-backend-domain>/api/providers/telegram/webhook" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
   ```
5. Proceed to smoke test

#### Deploy — upgrading existing deployment

> This is the C9 / C4 sensitive path.

1. **Run DB migration first** (Part 3, Steps 1–5)
2. **Deploy frontend first** (Render static site → manual deploy)
   - The old backend ignores `join:account` events — messages still arrive (broadcast mode fallback), no messages lost during transition
   - Key lookups via `/keys/:ownerId` now use accountId — old backend uses email; lookups fail until backend is updated. Alert: users opening the app during this window won't be able to send encrypted messages. Keep this window under 5 minutes.
3. **Deploy backend immediately after** (Render web service → manual deploy)
4. Wait for both deploy statuses to show "Live"
5. Hard-reload the frontend in your test browser (Ctrl+Shift+R / Cmd+Shift+R)

#### Smoke test after deploy

- [ ] `GET https://<backend>/api/providers/status` → 200
- [ ] Register a new account
- [ ] Login with existing account — confirm no re-login is forced (JWT passthrough)
- [ ] Load conversations — messages load correctly
- [ ] Send a secure message — confirm encryption + delivery
- [ ] Confirm real-time: open two browser tabs, send message in one, observe arrival in the other without polling
- [ ] Connect Telegram (MTProto QR flow or phone auth)
- [ ] Link flow: initLink → scan → completeLink → providerConnection created
- [ ] File upload (image): verify Cloudinary URL returned, image displays

#### Rollback (if smoke test fails)

- If backend is bad: redeploy previous backend image from Render deploy history
- If DB migration was the cause: `npm run rollback:key-migration` (only safe if new backend is not live)
- If both: rollback backend first, then rollback migration

---

## Execution Order Summary

| #         | Item                 | Prereq                        |
| --------- | -------------------- | ----------------------------- |
| P2-A      | CSS refactor         | Grace supplies screenshots    |
| P2-B      | CODEBOOK.md          | **MOVED TO PASS 3**           |
| Migration | Run C4 key migration | After all code changes merged |
| Deploy    | Render deployment    | After migration complete      |
