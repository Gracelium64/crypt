# C4 Key Migration — Local Testing Guide

Before running the migration against production, test it locally against a dev database.

---

## Before You Start — Point Scripts at a Dev Database

The migration scripts call `dotenv.config()` which reads `backend/.env`. **Do not run these against your production URI.** Two safe options:

**Option A — Local MongoDB via Docker (no Atlas needed):**
```bash
docker run -d -p 27017:27017 --name mongo-local mongo:7
```
Then temporarily set `MONGODB_URI=mongodb://localhost:27017/shadowapp-dev` in `backend/.env`.

**Option B — Use an Atlas dev cluster:**
Swap `MONGODB_URI` in `backend/.env` to your dev Atlas URI before running anything.

---

## Phase 1 — Seed the Dev DB with Test Data

Your dev DB needs at least 2 accounts with `email` fields, and keys where `ownerId` is set to those email addresses (the pre-migration state). Either:
- Seed via mongosh manually, or
- Register 2 test users in the running app and complete a key exchange between them

Verify the seed:
```js
// mongosh
db.keys.find({}, { ownerId: 1 }).toArray()
// Should show email strings, not ObjectIds
```

---

## Phase 2 — Run the Migration Scripts in Order

```bash
cd backend

# Step 1: backup
npm run backup:keys
# Expect: "Backed up N keys to keys_backup_pre_migration"
# Verify: db.keys_backup_pre_migration.countDocuments() matches db.keys.countDocuments()

# Step 2: dry-run check — confirm no accounts have a null email
# In mongosh:
db.accounts.find({ email: { $in: [null, ""] } }).toArray()
# Expect: empty array

# Step 3: migrate
npm run migrate:key-owner-ids
# Expect: one line per account: "user@example.com: migrated N keys", then "Migration complete."
# An account showing "migrated 0 keys" is fine — it means they never completed a key exchange

# Step 4: verify in mongosh
db.keys.find({}, { ownerId: 1 }).toArray()
# Expect: ownerId values are 24-char hex ObjectId strings, not email addresses
# Provider-mirrored keys (Telegram chat ID / phone number) should be unchanged
```

---

## Phase 3 — Test Rollback

```bash
npm run rollback:key-migration
# Expect: "Restored N keys from backup"

# Verify in mongosh
db.keys.find({}, { ownerId: 1 }).toArray()
# Expect: email strings are back

# Re-run the migration to leave the dev DB in the post-migration state
npm run migrate:key-owner-ids
```

---

## Phase 4 — Full App Smoke Test Against the Migrated Dev DB

With `MONGODB_URI` still pointing to your dev DB (now migrated):

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontendReactJs && npm run dev
```

Checklist:
- [ ] Login with an existing test account — no re-login forced
- [ ] Load a conversation — messages display correctly
- [ ] Send an encrypted message — key lookup resolves via accountId (not email)
- [ ] Open two browser tabs, send a message in one, confirm real-time arrival in the other (C9 `join:account` path)
- [ ] If Telegram is connected: receive a message via Telegram

---

## After Passing Locally

Restore `backend/.env` to the production `MONGODB_URI` before running the real migration. The production run sequence is Part 2 Steps 1–5 in `REFACTOR/PASS2/REFACTOR_PASS_2_PLAN.md`, with an Atlas snapshot taken first.
