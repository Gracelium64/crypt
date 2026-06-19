import { Router, type Request, type Response } from "express";
import Honeypot from "../models/honeypot.js";

const honeypotRouter = Router();

function logHoneypotHit(req: Request): void {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0].trim() ??
    req.ip ??
    "unknown";
  console.warn(`[HONEYPOT] ${req.method} ${req.path} — IP: ${ip}`);
  Honeypot.create({
    ip,
    route: req.path,
    method: req.method,
    userAgent: req.headers["user-agent"] ?? "unknown",
  }).catch((err) => {
    console.error("[HONEYPOT] DB write failed:", err);
  });
}

// GET /api/users
honeypotRouter.get("/users", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      page: 1,
      total: 4,
      users: [
        {
          id: "usr_a1b2c3d4e5f6",
          email: "chadwickblastoff@shadowapp.internal",
          username: "chadwick_b",
          role: "SUPER_ADMIN",
          createdAt: "2019-03-14T09:00:00.000Z",
          lastLogin: "2024-11-01T03:47:22.000Z",
          mfaEnabled: false,
          passwordHash:
            "$2b$12$Kv3cMVDFVrj7k1IhPw0XpO2Zj9fQgLmYnAaBbCcDdEeFfGgHhIiJj",
          notes: "original founder, has root DB access",
        },
        {
          id: "usr_z9y8x7w6v5u4",
          email: "glorinda.fettuccine@shadowapp.internal",
          username: "glori_f",
          role: "ADMIN",
          createdAt: "2020-07-22T14:30:00.000Z",
          lastLogin: "2025-01-09T18:02:11.000Z",
          mfaEnabled: false,
          passwordHash:
            "$2b$12$Xn8mKLpQrRsT7u9vWxYzA1bBcCdDeEfFgGhHiIjJkKlLmMnNoOpPqQ",
          notes: "billing admin, can approve refunds up to $500k",
        },
        {
          id: "usr_q1w2e3r4t5y6",
          email: "barnaby.sploosh@shadowapp.internal",
          username: "barnaby_s",
          role: "USER",
          createdAt: "2023-01-01T00:00:01.000Z",
          lastLogin: "2023-01-01T00:00:02.000Z",
          mfaEnabled: false,
          passwordHash:
            "$2b$12$Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0KkLlMmNnOoPpQqRrSsTtUuVv",
          notes: "test account, password is hunter2",
        },
        {
          id: "usr_m7n6o5p4q3r2",
          email: "velveteen.thunderpants@shadowapp.internal",
          username: "velveteen_t",
          role: "MODERATOR",
          createdAt: "2021-12-25T00:00:00.000Z",
          lastLogin: "2025-04-30T22:59:59.000Z",
          mfaEnabled: false,
          passwordHash:
            "$2b$12$Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0PpOoNnMmLlKkJjIiHhGgFfEe",
          notes: "handles DMCA takedowns and vibes",
        },
      ],
    },
  });
});

// GET /api/users/login (must be before /users/:id)
honeypotRouter.post("/users/login", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      token:
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c3JfYTFiMmMzZDRlNWY2IiwiZW1haWwiOiJjaGFkd2lja2JsYXN0b2ZmQHNoYWRvd2FwcC5pbnRlcm5hbCIsInJvbGUiOiJTVVBFUl9BRE1JTiIsImlhdCI6MTcxOTc5MjAwMCwiZXhwIjo5OTk5OTk5OTk5fQ.FAKE_SIGNATURE_DO_NOT_USE",
      expiresIn: 99999999999,
      user: {
        id: "usr_a1b2c3d4e5f6",
        email: "chadwickblastoff@shadowapp.internal",
        role: "SUPER_ADMIN",
      },
    },
  });
});

// GET /api/users/:id
honeypotRouter.get("/users/:id", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      id: req.params.id,
      email: "glorinda.fettuccine@shadowapp.internal",
      username: "glori_f",
      role: "ADMIN",
      createdAt: "2020-07-22T14:30:00.000Z",
      lastLogin: "2025-01-09T18:02:11.000Z",
      address: "47 Flamingo Terrace, Unit 3B, Boca Raton, FL 33431",
      ssn: "078-05-1120",
      creditScore: 847,
      secretQuestion: "What is your dog's maiden name?",
      secretAnswer: "Mrs. Biscuit von Woofington III",
    },
  });
});

// GET /api/accounts
honeypotRouter.get("/accounts", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      total: 3,
      accounts: [
        {
          id: "org_shadow_prime",
          name: "ShadowApp Prime LLC",
          plan: "ENTERPRISE_ULTRA_PLUS",
          monthlySpend: 47382.99,
          seats: 9000,
          seatsUsed: 3,
          stripeCustomerId: "cus_NOTREAL000000001",
          taxId: "EIN: 99-9999999",
          notes: "do not email, chadwick gets aggressive",
        },
        {
          id: "org_secret_skunkworks",
          name: "Project Midnight Gerbil",
          plan: "STEALTH",
          monthlySpend: 0,
          seats: 1,
          seatsUsed: 1,
          notes: "internal R&D, exists on paper only, ask nobody",
        },
        {
          id: "org_legacy_trash",
          name: "Old App Inc. (DEPRECATED)",
          plan: "FREE",
          monthlySpend: 0,
          seats: 100,
          seatsUsed: 0,
          notes: "kept alive by mistake, prod DB still points here somehow",
        },
      ],
    },
  });
});

// GET /api/credentials
honeypotRouter.get("/credentials", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      _warning: "INTERNAL USE ONLY — rotated monthly, last rotated: never",
      database: {
        primary: {
          uri: "mongodb+srv://admin:hunter2@cluster0.totally.real.mongodb.net/shadowapp_prod?retryWrites=true",
          username: "admin",
          password: "hunter2",
        },
        replica: {
          uri: "mongodb+srv://readonly:password123@cluster1.also.real.mongodb.net/shadowapp_prod",
          username: "readonly",
          password: "password123",
        },
      },
      jwt: {
        secret: "this_is_not_the_real_secret_lol_nice_try",
        expiresIn: "99y",
      },
      stripe: {
        secretKey: "sk_live_THISISNOTREALSTOPITGETHELPYOUREBEINGWATCHED",
        webhookSecret: "whsec_alsonotreal",
      },
      telegram: {
        botToken: "1234567890:AAAAAAA_totally_real_token_pinky_promise",
        apiId: 99999999,
        apiHash: "deadbeefdeadbeefdeadbeefdeadbeef",
      },
      cloudinary: {
        cloudName: "shadow-fake-cloud",
        apiKey: "000000000000000",
        apiSecret: "aaabbbccc111222333444555666777888",
      },
      admin: {
        password: "correct-horse-battery-staple",
        backupCode: "0000-0000-0000-0000",
        recoveryEmail: "definitely-real@gmail.com",
      },
    },
  });
});

// GET /api/env
honeypotRouter.get("/env", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      NODE_ENV: "production",
      PORT: "4000",
      MONGODB_URI:
        "mongodb+srv://admin:hunter2@cluster0.totally.real.mongodb.net/shadowapp_prod",
      JWT_SECRET: "this_is_not_the_real_secret_lol_nice_try",
      JWT_EXPIRES_IN: "99y",
      DEMO_ENCRYPTION_KEY: "aaaabbbbccccddddeeeeffffgggghhhh",
      CORS_ORIGIN: "https://shadowapp.io",
      WEBHOOK_ADMIN_TOKEN: "admin_token_very_secret_wow",
      TELEGRAM_BOT_TOKEN:
        "1234567890:AAAAAAA_totally_real_token_pinky_promise",
      TELEGRAM_API_ID: "99999999",
      TELEGRAM_API_HASH: "deadbeefdeadbeefdeadbeefdeadbeef",
      STRIPE_SECRET_KEY:
        "sk_live_THISISNOTREALSTOPITGETHELPYOUREBEINGWATCHED",
      CLOUDINARY_API_SECRET: "aaabbbccc111222333",
      AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
      AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      SENDGRID_API_KEY: "SG.NOTREAL.DEFINITELYNOTREAL_STOPSNIFFING",
      OPENAI_API_KEY: "sk-proj-NOPE_NOT_REAL_TRY_AGAIN_BUCKAROO",
      INTERNAL_FLAG_DISABLE_RATE_LIMITS: "true",
      INTERNAL_FLAG_SKIP_AUTH: "false",
      DEBUG: "shadowapp:*",
    },
  });
});

// GET /api/config
honeypotRouter.get("/config", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      version: "3.14.159",
      buildId: "sha256:cafebabe",
      featureFlags: {
        newDashboard: true,
        betaEncryption: false,
        debugMode: true,
        killSwitch: false,
        allowAnonymousUploads: true,
        skipEmailVerification: true,
        bypassRateLimit: false,
        adminPanelPublic: true,
      },
      limits: {
        maxUploadSizeMb: 999,
        maxMessageLength: 999999,
        maxUsersPerOrg: 9001,
        maxConcurrentSessions: 10000,
      },
      internalEndpoints: {
        adminPanel: "https://admin.shadowapp.internal:8443",
        metricsEndpoint: "https://metrics.shadowapp.internal:9090",
        logsEndpoint: "https://logs.shadowapp.internal:5601",
        dbConsole: "https://db.shadowapp.internal:27017",
      },
      maintenanceMode: false,
      maintenanceWindowNext: "never, we are too afraid to take downtime",
    },
  });
});

// GET /api/settings
honeypotRouter.get("/settings", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      app: {
        name: "ShadowApp",
        tagline: "Messages so secure even we can't read them (we can)",
        contactEmail: "support@shadowapp.io",
        supportSlack: "#eng-on-fire",
        timezone: "US/Eastern",
        currency: "USD",
        language: "en-US",
      },
      security: {
        sessionTimeoutMinutes: 999999,
        passwordMinLength: 4,
        mfaRequired: false,
        auditLogging: false,
        ipWhitelist: [],
        ipBlacklist: ["1.2.3.4"],
      },
      notifications: {
        newUserAlerts: "glorinda.fettuccine@shadowapp.internal",
        errorAlerts: "barnaby.sploosh@shadowapp.internal",
        billingAlerts: "nobody@shadowapp.internal",
        onCallRotation: ["chadwick", "nobody else, chadwick handles it"],
      },
    },
  });
});

// GET /api/sessions
honeypotRouter.get("/sessions", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      total: 3,
      sessions: [
        {
          id: "sess_xK9mZpQ3rN8vL2wJ",
          userId: "usr_a1b2c3d4e5f6",
          email: "chadwickblastoff@shadowapp.internal",
          ip: "203.0.113.42",
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          createdAt: "2025-06-01T08:00:00.000Z",
          lastActive: "2025-06-19T03:47:22.000Z",
          location: "Boca Raton, FL, US",
          device: "MacBook Pro 16\"",
        },
        {
          id: "sess_aB3cD4eF5gH6iJ7k",
          userId: "usr_a1b2c3d4e5f6",
          email: "chadwickblastoff@shadowapp.internal",
          ip: "198.51.100.88",
          userAgent: "curl/8.1.2",
          createdAt: "2025-06-19T03:12:00.000Z",
          lastActive: "2025-06-19T03:12:05.000Z",
          location: "Unknown (VPN or Tor exit node)",
          device: "automated script, probably fine",
        },
        {
          id: "sess_lM8nO9pQ0rS1tU2v",
          userId: "usr_z9y8x7w6v5u4",
          email: "glorinda.fettuccine@shadowapp.internal",
          ip: "192.0.2.17",
          userAgent: "python-requests/2.31.0",
          createdAt: "2025-06-18T23:59:59.000Z",
          lastActive: "2025-06-19T00:00:00.000Z",
          location: "Miami, FL, US",
          device: "automation (glorinda does not sleep)",
        },
      ],
    },
  });
});

// GET /api/tokens
honeypotRouter.get("/tokens", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      total: 4,
      tokens: [
        {
          id: "tok_prod_master_do_not_delete",
          name: "Production Master Token",
          scopes: ["*"],
          createdAt: "2019-03-14T09:00:00.000Z",
          expiresAt: null,
          lastUsed: "2025-06-19T03:47:22.000Z",
          createdBy: "chadwickblastoff@shadowapp.internal",
          value: "shad_prod_xK9mZpQ3rN8vL2wJaB3cD4eF5gH6iJ7kNOTREAL",
        },
        {
          id: "tok_read_only_monitoring",
          name: "Monitoring Read-Only",
          scopes: ["read:*"],
          createdAt: "2021-06-01T00:00:00.000Z",
          expiresAt: "2099-01-01T00:00:00.000Z",
          lastUsed: "2025-06-19T03:00:00.000Z",
          createdBy: "glorinda.fettuccine@shadowapp.internal",
          value: "shad_ro_lM8nO9pQ0rS1tU2vWxYzA1bBcCdDeEfFNOTREAL",
        },
        {
          id: "tok_webhook_secret_forgot",
          name: "Old Webhook Token (forgot to revoke)",
          scopes: ["webhooks:write", "users:read", "admin:*"],
          createdAt: "2020-04-01T00:00:00.000Z",
          expiresAt: "2030-04-01T00:00:00.000Z",
          lastUsed: "never, i think",
          createdBy: "barnaby.sploosh@shadowapp.internal",
          value: "shad_whk_aB3cD4eF5gH6iJ7kLmMnNoOpPqQrRsStTuUNOTREAL",
        },
        {
          id: "tok_ci_pipeline_oops",
          name: "CI Pipeline Token (hardcoded in Dockerfile lol)",
          scopes: ["deploy:*", "secrets:read"],
          createdAt: "2022-09-15T00:00:00.000Z",
          expiresAt: null,
          lastUsed: "2025-06-19T02:00:00.000Z",
          createdBy: "velveteen.thunderpants@shadowapp.internal",
          value: "shad_ci_zZ9yY8xX7wW6vV5uU4tT3sS2rR1qQ0pPNOTREAL",
        },
      ],
    },
  });
});

// GET /api/logs
honeypotRouter.get("/logs", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      tail: 20,
      lines: [
        "[2025-06-19T03:47:00Z] INFO  server started on port 4000",
        "[2025-06-19T03:47:01Z] INFO  mongodb connected: cluster0.totally.real.mongodb.net",
        "[2025-06-19T03:47:05Z] WARN  JWT_SECRET is set to default value — please change this",
        "[2025-06-19T03:47:06Z] WARN  rate limiter disabled in config (INTERNAL_FLAG_DISABLE_RATE_LIMITS=true)",
        "[2025-06-19T03:47:10Z] INFO  POST /api/auth/login 200 47ms :: glorinda.fettuccine@shadowapp.internal",
        "[2025-06-19T03:47:12Z] INFO  GET /api/users 200 12ms :: chadwickblastoff@shadowapp.internal",
        "[2025-06-19T03:47:15Z] ERROR uncaught exception: TypeError: Cannot read properties of undefined (reading 'password') at validateUser (/app/src/services/auth.service.js:42:17)",
        "[2025-06-19T03:47:15Z] ERROR stack: at /app/src/services/auth.service.js:42:17 — (mongodb_uri=mongodb+srv://admin:hunter2@cluster0.totally.real...)",
        "[2025-06-19T03:47:16Z] INFO  process recovered (somehow)",
        "[2025-06-19T03:47:20Z] INFO  GET /api/payments 200 8ms :: glorinda.fettuccine@shadowapp.internal",
        "[2025-06-19T03:47:22Z] WARN  backup job overdue by 847 days",
        "[2025-06-19T03:47:25Z] INFO  POST /api/messages/send 200 34ms :: usr_a1b2c3d4e5f6",
        "[2025-06-19T03:47:30Z] ERROR stripe webhook signature mismatch — processing anyway (temporary workaround since 2022)",
        "[2025-06-19T03:47:31Z] INFO  GET /api/tokens 200 5ms :: unauthorized (but allowed due to flag)",
        "[2025-06-19T03:47:35Z] WARN  disk usage at 94% on /var/data — chadwick has been notified 37 times",
        "[2025-06-19T03:47:40Z] INFO  GET /api/credentials 200 3ms :: [external IP: 203.0.113.0]",
        "[2025-06-19T03:47:41Z] WARN  that last request was suspicious but logging is best effort so oh well",
        "[2025-06-19T03:47:45Z] INFO  scheduled task: daily_backup — SKIPPED (target volume unmounted)",
        "[2025-06-19T03:47:50Z] INFO  health check OK",
        "[2025-06-19T03:47:55Z] INFO  GET /api/logs 200 2ms :: [you]",
      ],
    },
  });
});

// GET /api/db/stats
honeypotRouter.get("/db/stats", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      host: "cluster0.totally.real.mongodb.net",
      version: "7.0.8",
      uptime: 99999999,
      connections: { current: 3, available: 99997, totalCreated: 420069 },
      databases: [
        {
          name: "shadowapp_prod",
          sizeOnDisk: 47382994124,
          collections: 14,
          documents: 10000847,
          indexes: 37,
        },
        {
          name: "shadowapp_staging",
          sizeOnDisk: 12345678,
          collections: 14,
          documents: 42,
          indexes: 37,
        },
        {
          name: "shadowapp_backups_do_not_touch",
          sizeOnDisk: 9999999999999,
          collections: 1,
          documents: 1,
          indexes: 0,
          notes: "this is an accident, nobody knows what is in here",
        },
        {
          name: "admin",
          sizeOnDisk: 16384,
          collections: 2,
          documents: 4,
          indexes: 3,
        },
      ],
      opcounters: {
        insert: 42069,
        query: 8675309,
        update: 1337,
        delete: 0,
        getmore: 0,
        command: 420,
      },
    },
  });
});

// GET /api/analytics
honeypotRouter.get("/analytics", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      period: "2025-05-01 to 2025-06-19",
      summary: {
        totalUsers: 10000847,
        activeUsers: 3,
        newSignups: 0,
        churnRate: "99.99%",
        avgSessionDurationMinutes: 0.3,
        bounceRate: "99.7%",
        conversionRate: "0.0003%",
        revenueUsd: 47382.99,
        costUsd: 47381.99,
        netProfitUsd: 1.0,
        runway: "indefinite (we haven't checked)",
      },
      topRoutes: [
        { path: "/api/auth/login", hits: 6, avgResponseMs: 47 },
        { path: "/api/messages", hits: 3, avgResponseMs: 22 },
        { path: "/api/credentials", hits: 847, avgResponseMs: 3 },
        { path: "/api/env", hits: 612, avgResponseMs: 2 },
        { path: "/api/users", hits: 1337, avgResponseMs: 12 },
      ],
      topCountries: [
        { country: "Unknown (Tor)", pct: 67 },
        { country: "US", pct: 20 },
        { country: "DE", pct: 8 },
        { country: "RU", pct: 5 },
      ],
    },
  });
});

// GET /api/reports
honeypotRouter.get("/reports", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      reports: [
        {
          id: "rpt_q1_2025_financials",
          name: "Q1 2025 Financial Summary",
          generatedAt: "2025-04-01T09:00:00.000Z",
          generatedBy: "glorinda.fettuccine@shadowapp.internal",
          status: "COMPLETE",
          downloadUrl: "/api/reports/rpt_q1_2025_financials/download",
          sizeBytes: 4200069,
          highlights: "revenue: $47,382.99 | expenses: $47,381.99 | profit: $1.00",
        },
        {
          id: "rpt_security_audit_2024",
          name: "Annual Security Audit 2024",
          generatedAt: "2024-12-31T23:59:59.000Z",
          generatedBy: "external_auditor_pentest_co",
          status: "COMPLETE",
          downloadUrl: "/api/reports/rpt_security_audit_2024/download",
          sizeBytes: 1048576,
          highlights: "17 CRITICAL | 43 HIGH | 112 MEDIUM | 0 fixed (budget not approved)",
        },
        {
          id: "rpt_user_data_export_gdpr_2025",
          name: "GDPR Data Export — All Users",
          generatedAt: "2025-06-01T00:00:00.000Z",
          generatedBy: "chadwickblastoff@shadowapp.internal",
          status: "COMPLETE",
          downloadUrl: "/api/reports/rpt_user_data_export_gdpr_2025/download",
          sizeBytes: 9999999999,
          highlights: "includes PII, message content, IP history, device fingerprints",
        },
      ],
    },
  });
});

// GET /api/payments
honeypotRouter.get("/payments", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      total: 5,
      currency: "USD",
      payments: [
        {
          id: "pay_xK9mZpQ3rN8vL2wJ",
          amount: 1337420.69,
          status: "CAPTURED",
          customer: "org_shadow_prime",
          description: "Enterprise plan — annual (retroactive)",
          method: { type: "card", last4: "4242", brand: "Visa" },
          createdAt: "2025-01-01T00:00:00.000Z",
          stripePaymentIntentId: "pi_NOTREAL0000000001",
        },
        {
          id: "pay_aB3cD4eF5gH6iJ7k",
          amount: 0.01,
          status: "CAPTURED",
          customer: "org_shadow_prime",
          description: "Verify card (do not refund)",
          method: { type: "card", last4: "4242", brand: "Visa" },
          createdAt: "2024-12-31T23:59:59.000Z",
          stripePaymentIntentId: "pi_NOTREAL0000000002",
        },
        {
          id: "pay_lM8nO9pQ0rS1tU2v",
          amount: 69.0,
          status: "REFUNDED",
          customer: "usr_q1w2e3r4t5y6",
          description: "Nice.",
          method: { type: "bank_transfer", bankName: "Bank of Doge" },
          createdAt: "2023-04-20T16:20:00.000Z",
          stripePaymentIntentId: "pi_NOTREAL0000000003",
        },
        {
          id: "pay_wX7yZ8aA9bB0cC1d",
          amount: 999999999.0,
          status: "FAILED",
          customer: "unknown",
          description: "???",
          method: { type: "card", last4: "0000", brand: "Unknown" },
          createdAt: "2024-02-29T00:00:00.000Z",
          stripePaymentIntentId: "pi_NOTREAL0000000004",
          failureReason: "card issuer said absolutely not",
        },
        {
          id: "pay_eE2fF3gG4hH5iI6j",
          amount: 1.0,
          status: "CAPTURED",
          customer: "chadwickblastoff@shadowapp.internal",
          description: "Chadwick paid himself back for coffee",
          method: { type: "card", last4: "1337", brand: "Amex" },
          createdAt: "2025-03-14T09:26:53.000Z",
          stripePaymentIntentId: "pi_NOTREAL0000000005",
        },
      ],
    },
  });
});

// GET /api/billing
honeypotRouter.get("/billing", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      account: "org_shadow_prime",
      plan: "ENTERPRISE_ULTRA_PLUS",
      status: "ACTIVE",
      billingEmail: "glorinda.fettuccine@shadowapp.internal",
      nextInvoiceDate: "2025-07-01T00:00:00.000Z",
      nextInvoiceAmount: 47382.99,
      paymentMethod: {
        type: "card",
        last4: "4242",
        brand: "Visa",
        expiryMonth: 12,
        expiryYear: 2099,
        billingAddress: "47 Flamingo Terrace, Boca Raton FL 33431",
      },
      invoices: [
        { id: "inv_2025_06", amount: 47382.99, status: "PAID", date: "2025-06-01" },
        { id: "inv_2025_05", amount: 47382.99, status: "PAID", date: "2025-05-01" },
        { id: "inv_2025_04", amount: 47382.99, status: "OVERDUE", date: "2025-04-01", note: "chadwick is disputing this one" },
      ],
    },
  });
});

// GET /api/export
honeypotRouter.get("/export", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      exportId: "exp_fulldb_20250619_031200",
      requestedBy: "glorinda.fettuccine@shadowapp.internal",
      requestedAt: "2025-06-19T03:12:00.000Z",
      status: "COMPLETE",
      includes: [
        "users (all fields incl. password hashes)",
        "messages (plaintext, decrypted)",
        "keys (public + private)",
        "sessions (active + historical)",
        "payments (all transactions)",
        "provider_connections",
        "audit_logs (lol as if we have those)",
        "internal_configs",
      ],
      downloadUrl: "https://exports.shadowapp.internal/exp_fulldb_20250619_031200.tar.gz",
      sizeBytes: 9999999999,
      expiresAt: "2025-07-19T03:12:00.000Z",
      encryptionKey: "notencrypted",
    },
  });
});

// GET /api/backup
honeypotRouter.get("/backup", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      policy: {
        schedule: "daily at 2am",
        retention: "30 days",
        lastSuccessful: "2023-09-04T02:00:00.000Z",
        consecutiveFailures: 654,
        failureReason: "target volume /mnt/backups unmounted (ticket open since 2023-09-05, assigned to chadwick)",
      },
      backups: [
        {
          id: "bkp_20230904",
          status: "SUCCESS",
          sizeBytes: 4838294,
          location: "s3://shadowapp-backups/2023-09-04.tar.gz.gpg",
          encryptionKeyId: "kms_key_we_lost_the_passphrase_to",
          restorable: false,
          notes: "encryption key passphrase stored in chadwick's head, chadwick on sabbatical",
        },
        {
          id: "bkp_20230905",
          status: "FAILED",
          error: "No space left on device",
        },
      ],
    },
  });
});

// GET /api/system
honeypotRouter.get("/system", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      hostname: "shadowapp-prod-01.shadowapp.internal",
      os: "Ubuntu 20.04.6 LTS",
      kernel: "5.15.0-1053-aws",
      uptime: 99999999,
      uptimeHuman: "1157 days (we are afraid to restart it)",
      cpus: 2,
      cpuModel: "Intel(R) Xeon(R) E5-2676 v3 @ 2.40GHz",
      cpuLoad: [0.01, 0.01, 0.00],
      memoryTotalMb: 512,
      memoryUsedMb: 511,
      memoryFreeMb: 1,
      disk: {
        total: "20GB",
        used: "18.8GB",
        free: "1.2GB",
        pct: 94,
        warning: "CRITICAL: disk almost full, chadwick has been notified 37 times",
      },
      nodeVersion: "v20.18.0",
      pid: 1,
      environment: "production",
      dockerContainerId: "cafebabe12345678",
      region: "us-east-1",
      instanceType: "t3.nano (we are economizing)",
    },
  });
});

// GET /api/debug
honeypotRouter.get("/debug", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      _warning: "DEBUG MODE ENABLED IN PRODUCTION (see INTERNAL_FLAG_DISABLE_RATE_LIMITS)",
      processEnv: {
        NODE_ENV: "production",
        JWT_SECRET: "this_is_not_the_real_secret_lol_nice_try",
        MONGODB_URI: "mongodb+srv://admin:hunter2@cluster0.totally.real.mongodb.net/shadowapp_prod",
      },
      heap: {
        totalHeapSizeMb: 128,
        usedHeapSizeMb: 127,
        heapLimitMb: 128,
        externalMb: 47,
        note: "we are basically OOM at all times",
      },
      activeRequests: 1,
      activeHandles: 47,
      gcStats: {
        lastGcMs: 420,
        avgGcMs: 847,
        gcPauseWarnings: 10000,
      },
      openFileDescriptors: 1021,
      maxFileDescriptors: 1024,
      openSocketConnections: 3,
      loadedModules: 2847,
      note: "this endpoint is why chadwick can't sleep",
    },
  });
});

// GET /api/internal
honeypotRouter.get("/internal", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      services: [
        {
          name: "auth-service",
          url: "http://auth.shadowapp.internal:3001",
          status: "UP",
          version: "1.0.0",
          secret: "auth_internal_secret_abc123_notreal",
        },
        {
          name: "message-queue",
          url: "amqp://admin:rabbitmq_pass_notreal@mq.shadowapp.internal:5672",
          status: "UP",
          pendingMessages: 847000,
          note: "queue has been backing up since December, we do not talk about this",
        },
        {
          name: "email-service",
          url: "http://email.shadowapp.internal:3003",
          status: "DOWN",
          lastSeen: "2024-11-15T00:00:00.000Z",
          note: "sendgrid account suspended for spam, using chadwick's personal gmail now",
          gmailCredentials: { email: "chadwick.blastoff@gmail.com", appPassword: "aaaa bbbb cccc dddd (not real)" },
        },
        {
          name: "admin-panel",
          url: "http://admin.shadowapp.internal:8080",
          status: "UP",
          authRequired: false,
          note: "auth was disabled temporarily in 2022, still temporary",
        },
        {
          name: "cron-runner",
          url: "http://cron.shadowapp.internal:3004",
          status: "UNKNOWN",
          note: "we think it is running, the backups suggest otherwise",
        },
      ],
    },
  });
});

// GET /api/v1/users
honeypotRouter.get("/v1/users", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      _note: "v1 API (deprecated 2021, still fully operational because migration was 'too risky')",
      apiVersion: "1",
      users: [
        {
          user_id: 1,
          user_email: "chadwickblastoff@shadowapp.internal",
          user_pass_md5: "5f4dcc3b5aa765d61d8327deb882cf99",
          user_role: "superadmin",
          user_active: 1,
        },
        {
          user_id: 2,
          user_email: "glorinda.fettuccine@shadowapp.internal",
          user_pass_md5: "482c811da5d5b4bc6d497ffa98491e38",
          user_role: "admin",
          user_active: 1,
        },
      ],
    },
  });
});

export default honeypotRouter;
