# AI Assistance Multiplier

**Context:** Flutter-strong developer moving into a full-stack TypeScript codebase (Node.js, React, MongoDB, E2E encryption, Telegram MTProto, Socket.IO). Estimating the learning + refactoring phase only — the app was already built before this phase began.

---

## Time comparison

| Phase | With AI | Without AI |
|-------|---------|------------|
| Teaching (Modules 2–23) | ~3 weeks | ~6–10 weeks |
| Refactor Passes 1 & 2 + security audit | ~4 days | ~3–5 weeks |
| Debugging sessions (Modules 11–17) | ~3 days | ~4–6 weeks |
| Documentation | ~1 day | ~1–2 weeks |
| **Total** | **~4 weeks** | **~14–24 weeks** |

**Multiplier: roughly 4–6x.**

---

## Where the gap is largest

**Cryptography (Module 5):** ECDH, HKDF, AES-GCM, PBKDF2, the two-layer crypto model — researching and correctly understanding all of this from scratch, without guided teaching and Flutter analogies, would realistically take weeks.

**Production debugging (Modules 11–17):** Ghost `ProviderConnection` records, React Strict Mode race conditions generating competing keypairs, Telegram per-number code suppression, gramjs `client.connected` vs map presence, mobile backgrounding dropping Socket.IO — each of these took hours with AI. Without it, each one is days of isolated diagnosis.

**Security audit + refactoring (Modules 21, 23):** The quality of the audit (21 routes checked, dead code verified against full import graphs, upload validation traced end-to-end through the call graph) would take weeks to replicate manually with the same confidence.

**Documentation:** `CRYPT_SPECS.md`, `POSTMAN_TESTING.md`, and supporting docs were produced in hours. Writing them manually to the same standard would take days each.
