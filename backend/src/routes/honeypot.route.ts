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
      totalPages: 1,
      total: 4,
      users: [
        {
          _id: "63ff8a1c4e2b7d09a5c3f012",
          email: "amanda.ripley@crypt.io",
          username: "aripley",
          role: "OWNER",
          createdAt: "2022-03-01T11:24:07.000Z",
          lastLogin: "2025-06-18T09:41:33.000Z",
          mfaEnabled: true,
          passwordHash: "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtgD0sRmQoLx2nNz6q5P8VKuHJfe",
          verified: true,
        },
        {
          _id: "641a2b3c4d5e6f708192a3b4",
          email: "sarah.connor@crypt.io",
          username: "sconnor",
          role: "ADMIN",
          createdAt: "2022-03-15T08:50:19.000Z",
          lastLogin: "2025-06-19T01:12:44.000Z",
          mfaEnabled: true,
          passwordHash: "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW",
          verified: true,
        },
        {
          _id: "641f3d2a9c8b7e6f5a4b3c2d",
          email: "amy.inara@crypt.io",
          username: "ainara",
          role: "DEVELOPER",
          createdAt: "2023-01-10T14:03:55.000Z",
          lastLogin: "2025-06-17T16:28:09.000Z",
          mfaEnabled: false,
          passwordHash: "$2b$12$7GE0n9GqJHwTQ0pWqfnKuOX8Hc.3K1pPL8HZ9J3D5mBNmK7NnTe6S",
          verified: true,
        },
        {
          _id: "64b5c7d8e9f0a1b2c3d4e5f6",
          email: "anne.summers@crypt.io",
          username: "asummers",
          role: "SUPPORT",
          createdAt: "2023-06-20T09:17:42.000Z",
          lastLogin: "2025-06-18T14:55:31.000Z",
          mfaEnabled: false,
          passwordHash: "$2b$12$K.MzHXMM1eK0PcqQ7Iw8yueX2bH3Q9VXqYJBrT.kWZ8R1pL5EsP9m",
          verified: true,
        },
      ],
    },
  });
});

// POST /api/users/login (must be before /users/:id)
honeypotRouter.post("/users/login", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2M2ZmOGExYzRlMmI3ZDA5YTVjM2YwMTIiLCJlbWFpbCI6ImFsZXgubWVyY2VyQGNyeXB0LmlvIiwicm9sZSI6Ik9XTkVSIiwiaWF0IjoxNzUwMjk4MDAwLCJleHAiOjE3NTAzODQ0MDB9.mK7Np2Qr9Lv5wZ3Fy8Dc6sB1eT4xH0jXpYnRsQu8fg",
      expiresIn: 86400,
      user: {
        _id: "63ff8a1c4e2b7d09a5c3f012",
        email: "amanda.ripley@crypt.io",
        role: "OWNER",
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
      _id: req.params.id,
      email: "sarah.connor@crypt.io",
      username: "sconnor",
      role: "ADMIN",
      createdAt: "2022-03-15T08:50:19.000Z",
      updatedAt: "2025-06-19T01:12:44.000Z",
      lastLogin: "2025-06-19T01:12:44.000Z",
      mfaEnabled: true,
      verified: true,
      passwordHash: "$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW",
    },
  });
});

// GET /api/accounts
honeypotRouter.get("/accounts", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      total: 2,
      accounts: [
        {
          _id: "org_63ff8a2d5e1b4c09a7d2f034",
          name: "Crypt Technologies Inc.",
          plan: "ENTERPRISE",
          status: "ACTIVE",
          monthlySpend: 1840.00,
          seats: 50,
          seatsUsed: 4,
          stripeCustomerId: "cus_Qk7mNp3xL9rZ2vW",
          taxId: "EIN: 47-3829104",
          createdAt: "2022-03-01T00:00:00.000Z",
          billingEmail: "sarah.connor@crypt.io",
        },
        {
          _id: "org_641a3b4c5d6e7f809192a3b5",
          name: "Crypt Staging Org",
          plan: "DEVELOPER",
          status: "ACTIVE",
          monthlySpend: 29.00,
          seats: 5,
          seatsUsed: 3,
          stripeCustomerId: "cus_Rn8pLq4yM0sA3xV",
          taxId: null,
          createdAt: "2022-04-10T00:00:00.000Z",
          billingEmail: "amy.inara@crypt.io",
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
      database: {
        primary: {
          uri: "mongodb+srv://cryptadmin:Mx9pK3nQ7rL2vZ4w@crypt-prod-cluster.ab1cd.mongodb.net/cryptapp?retryWrites=true&w=majority",
          username: "cryptadmin",
          password: "Mx9pK3nQ7rL2vZ4w",
        },
        readonly: {
          uri: "mongodb+srv://cryptread:Pz6nJ1mR8kW3xQ5v@crypt-prod-cluster.ab1cd.mongodb.net/cryptapp?retryWrites=false",
          username: "cryptread",
          password: "Pz6nJ1mR8kW3xQ5v",
        },
      },
      jwt: {
        secret: "j8Kp2mN5qR7tX9vZ3wA6cF4hB1eD0sLy",
        expiresIn: "24h",
      },
      stripe: {
        secretKey: "sk-live-51Nq3xK9mZpQrN8vLw2JaB3cD4eF5gH6",
        webhookSecret: "whsec-xK9mZpQ3rN8vL2wJaB3cD4eF5gH6iJ7k",
        publishableKey: "pk-live-51Nq3xK9mZpQrN8vLw2JaB3",
      },
      telegram: {
        botToken: "7234891056:AAGk9mZpQ3rN8vL2wJaB3cD4eF5gH6iJfake",
        apiId: 24681357,
        apiHash: "a1b2c3d4e5f6789012345678deadbeef",
      },
      cloudinary: {
        cloudName: "crypt-prod-media",
        apiKey: "874521309841726",
        apiSecret: "nQ7rL2vZ4wMx9pK3B1eD0sL8Kp2mN5q",
      },
      sendgrid: {
        apiKey: "SG-nQ7rL2vZ4wMx9pK3B1eD0sL8Kp2mN5qR7tX9vZ3wA6cF4hB1eD0",
      },
      internalAdminToken: "at_7Xk9Nm3pQr5Lv2wZ8Fy4Dc1sB6Tj0Hq",
      encryptionKey: "nQ7rL2vZ4wMx9pK3B1eD0sL8Kp2mN5q",
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
      MONGODB_URI: "mongodb+srv://cryptadmin:Mx9pK3nQ7rL2vZ4w@crypt-prod-cluster.ab1cd.mongodb.net/cryptapp?retryWrites=true&w=majority",
      JWT_SECRET: "j8Kp2mN5qR7tX9vZ3wA6cF4hB1eD0sLy",
      JWT_EXPIRES_IN: "24h",
      APP_ENCRYPTION_KEY: "nQ7rL2vZ4wMx9pK3B1eD0sL8Kp2mN5q",
      CORS_ORIGIN: "https://app.crypt.io",
      INTERNAL_ADMIN_TOKEN: "at_7Xk9Nm3pQr5Lv2wZ8Fy4Dc1sB6Tj0Hq",
      TELEGRAM_BOT_TOKEN: "7234891056:AAGk9mZpQ3rN8vL2wJaB3cD4eF5gH6iJfake",
      TELEGRAM_API_ID: "24681357",
      TELEGRAM_API_HASH: "a1b2c3d4e5f6789012345678deadbeef",
      STRIPE_SECRET_KEY: "sk-live-51Nq3xK9mZpQrN8vLw2JaB3cD4eF5gH6",
      STRIPE_WEBHOOK_SECRET: "whsec-xK9mZpQ3rN8vL2wJaB3cD4eF5gH6iJ7k",
      CLOUDINARY_CLOUD_NAME: "crypt-prod-media",
      CLOUDINARY_API_KEY: "874521309841726",
      CLOUDINARY_API_SECRET: "nQ7rL2vZ4wMx9pK3B1eD0sL8Kp2mN5q",
      SENDGRID_API_KEY: "SG-nQ7rL2vZ4wMx9pK3B1eD0sL8Kp2mN5qR7tX9vZ3wA6cF4hB1eD0",
      AWS_ACCESS_KEY_ID: "AKIAIOSFODNN7EXAMPLE",
      AWS_SECRET_ACCESS_KEY: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      AWS_REGION: "us-east-1",
      AWS_S3_BUCKET: "crypt-prod-uploads-us-east-1",
    },
  });
});

// GET /api/config
honeypotRouter.get("/config", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      version: "2.4.1",
      buildId: "sha256:3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
      featureFlags: {
        newMessagingEngine: true,
        betaGroupConversations: false,
        debugMode: false,
        maintenanceMode: false,
        allowAnonymousUploads: false,
        requireEmailVerification: true,
      },
      limits: {
        maxUploadSizeMb: 25,
        maxMessageLength: 4096,
        maxUsersPerOrg: 50,
        maxConcurrentSessions: 5,
        rateLimitWindowMs: 900000,
        rateLimitMaxRequests: 100,
      },
      internalEndpoints: {
        adminPanel: "https://admin.internal.crypt.io",
        metricsEndpoint: "https://metrics.internal.crypt.io:9090",
        logsEndpoint: "https://logs.internal.crypt.io:5601",
      },
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
        name: "Crypt",
        contactEmail: "support@crypt.io",
        timezone: "UTC",
        currency: "USD",
        language: "en-US",
      },
      security: {
        sessionTimeoutMinutes: 1440,
        passwordMinLength: 12,
        mfaRequired: false,
        auditLogging: true,
        ipWhitelist: [],
      },
      notifications: {
        errorAlerts: "amanda.ripley@crypt.io",
        billingAlerts: "sarah.connor@crypt.io",
        securityAlerts: "amanda.ripley@crypt.io",
        onCallRotation: ["amanda.ripley@crypt.io", "sarah.connor@crypt.io"],
      },
      smtp: {
        host: "smtp.sendgrid.net",
        port: 587,
        user: "apikey",
        fromEmail: "no-reply@crypt.io",
        fromName: "Crypt",
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
          id: "sess_7Xk9Nm3pQr5Lv2wZ8Fy4Dc",
          userId: "63ff8a1c4e2b7d09a5c3f012",
          email: "amanda.ripley@crypt.io",
          ip: "104.28.34.171",
          userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          createdAt: "2025-06-18T09:41:33.000Z",
          lastActive: "2025-06-19T02:17:08.000Z",
          location: "San Francisco, CA, US",
        },
        {
          id: "sess_4Dc1sB6Tj0HqXpYnRsQu8fg",
          userId: "641a2b3c4d5e6f708192a3b4",
          email: "sarah.connor@crypt.io",
          ip: "67.183.92.45",
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          createdAt: "2025-06-19T01:12:44.000Z",
          lastActive: "2025-06-19T01:58:22.000Z",
          location: "Seattle, WA, US",
        },
        {
          id: "sess_9Lv5wZ3Fy8Dc6sB1eT4xH0j",
          userId: "64b5c7d8e9f0a1b2c3d4e5f6",
          email: "anne.summers@crypt.io",
          ip: "82.117.204.9",
          userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
          createdAt: "2025-06-18T14:55:31.000Z",
          lastActive: "2025-06-18T17:43:19.000Z",
          location: "London, GB",
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
          id: "tok_63ff8a2d5e1b4c09a7d2f034",
          name: "Production API Token",
          scopes: ["messages:read", "messages:write", "users:read"],
          createdAt: "2022-09-01T10:00:00.000Z",
          expiresAt: null,
          lastUsed: "2025-06-19T02:17:08.000Z",
          createdBy: "amanda.ripley@crypt.io",
          value: "crypt_prod_7Xk9Nm3pQr5Lv2wZ8Fy4Dc1sB6Tj0HqXpYnRsQu8fg4mK",
        },
        {
          id: "tok_641a3b4c5d6e7f809192a3b5",
          name: "Monitoring Read-Only",
          scopes: ["metrics:read", "logs:read"],
          createdAt: "2023-02-14T09:00:00.000Z",
          expiresAt: "2026-02-14T09:00:00.000Z",
          lastUsed: "2025-06-19T03:00:00.000Z",
          createdBy: "sarah.connor@crypt.io",
          value: "crypt_ro_4Dc1sB6Tj0HqXpYnRsQu8fg9Lv5wZ3Fy8Dc6sB1eT4xH0j",
        },
        {
          id: "tok_641f3d2a9c8b7e6f5a4b3c2d",
          name: "CI/CD Pipeline",
          scopes: ["deploy:write", "config:read"],
          createdAt: "2023-04-20T00:00:00.000Z",
          expiresAt: "2026-04-20T00:00:00.000Z",
          lastUsed: "2025-06-19T00:01:32.000Z",
          createdBy: "amy.inara@crypt.io",
          value: "crypt_ci_9Lv5wZ3Fy8Dc6sB1eT4xH0jmK7Np2Qr9Lv5wZ3Fy8Dc6sB",
        },
        {
          id: "tok_64b5c7d8e9f0a1b2c3d4e5f6",
          name: "Webhook Receiver",
          scopes: ["webhooks:write"],
          createdAt: "2023-08-01T12:00:00.000Z",
          expiresAt: null,
          lastUsed: "2025-06-18T23:47:11.000Z",
          createdBy: "amanda.ripley@crypt.io",
          value: "crypt_whk_mK7Np2Qr9Lv5wZ3Fy8Dc6sB1eT4xH0jXpYnRsQu8fg4Dc",
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
        "[2025-06-19T03:41:00Z] INFO  server started on port 4000",
        "[2025-06-19T03:41:01Z] INFO  mongodb connected: crypt-prod-cluster.ab1cd.mongodb.net",
        "[2025-06-19T03:41:02Z] INFO  MTProto sessions loaded: 2",
        "[2025-06-19T03:41:03Z] INFO  realtime socket server initialized",
        "[2025-06-19T03:43:17Z] INFO  POST /api/v2/signin 200 52ms ip=67.183.92.45",
        "[2025-06-19T03:43:18Z] INFO  GET /api/inbox 200 18ms userId=641a2b3c4d5e6f708192a3b4",
        "[2025-06-19T03:44:05Z] INFO  POST /api/inbox/send 200 31ms userId=641a2b3c4d5e6f708192a3b4",
        "[2025-06-19T03:45:30Z] INFO  GET /api/integrations 200 9ms userId=63ff8a1c4e2b7d09a5c3f012",
        "[2025-06-19T03:46:00Z] INFO  POST /api/v2/signin 200 48ms ip=104.28.34.171",
        "[2025-06-19T03:46:12Z] WARN  rate limit approaching for ip=185.220.101.47 (87/100 in window)",
        "[2025-06-19T03:46:13Z] INFO  GET /api/pubkeys/63ff8a1c4e2b7d09a5c3f012 200 6ms",
        "[2025-06-19T03:47:00Z] INFO  GET /api/channels/tg/status 200 14ms userId=63ff8a1c4e2b7d09a5c3f012",
        "[2025-06-19T03:47:22Z] INFO  POST /api/media/upload 200 203ms userId=641a2b3c4d5e6f708192a3b4",
        "[2025-06-19T03:48:09Z] INFO  DELETE /api/inbox/thread 200 11ms userId=64b5c7d8e9f0a1b2c3d4e5f6",
        "[2025-06-19T03:49:00Z] INFO  scheduled task: session-cleanup completed (3 expired sessions removed)",
        "[2025-06-19T03:49:01Z] INFO  scheduled task: metrics-flush completed",
        "[2025-06-19T03:50:00Z] INFO  GET /health 200 1ms",
        "[2025-06-19T03:51:14Z] INFO  POST /api/v2/signin 401 44ms ip=185.220.101.47 reason=invalid_credentials",
        "[2025-06-19T03:51:15Z] WARN  rate limit exceeded for ip=185.220.101.47 — 429 returned",
        "[2025-06-19T03:52:00Z] INFO  GET /health 200 1ms",
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
      host: "crypt-prod-cluster.ab1cd.mongodb.net",
      version: "7.0.12",
      uptimeSeconds: 15638400,
      connections: { current: 7, available: 493, totalCreated: 18247 },
      databases: [
        {
          name: "cryptapp",
          sizeOnDisk: 2847392819,
          collections: 11,
          documents: 284719,
          indexes: 28,
        },
        {
          name: "cryptapp_staging",
          sizeOnDisk: 94371840,
          collections: 11,
          documents: 4203,
          indexes: 28,
        },
        {
          name: "admin",
          sizeOnDisk: 16384,
          collections: 2,
          documents: 3,
          indexes: 3,
        },
      ],
      opcounters: {
        insert: 284719,
        query: 3847201,
        update: 192047,
        delete: 8341,
        getmore: 1204,
        command: 921847,
      },
      replication: {
        setName: "atlas-ab1cd-shard-0",
        primary: "crypt-prod-cluster-shard-00-00.ab1cd.mongodb.net:27017",
        hosts: [
          "crypt-prod-cluster-shard-00-00.ab1cd.mongodb.net:27017",
          "crypt-prod-cluster-shard-00-01.ab1cd.mongodb.net:27017",
          "crypt-prod-cluster-shard-00-02.ab1cd.mongodb.net:27017",
        ],
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
        totalUsers: 4218,
        mau: 847,
        dau: 203,
        newSignups: 312,
        churnRate: "3.2%",
        avgSessionDurationMinutes: 14.7,
        messagesExchanged: 198204,
        revenueUsd: 18400.00,
        mrr: 18400.00,
        arr: 220800.00,
      },
      topRoutes: [
        { path: "/api/v2/signin", hits: 14203, avgResponseMs: 49 },
        { path: "/api/inbox", hits: 98241, avgResponseMs: 17 },
        { path: "/api/inbox/send", hits: 72819, avgResponseMs: 33 },
        { path: "/api/integrations", hits: 12047, avgResponseMs: 11 },
        { path: "/api/channels/tg/status", hits: 9834, avgResponseMs: 14 },
      ],
      topCountries: [
        { country: "US", pct: 41 },
        { country: "DE", pct: 14 },
        { country: "GB", pct: 11 },
        { country: "FR", pct: 8 },
        { country: "CA", pct: 6 },
        { country: "Other", pct: 20 },
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
          generatedAt: "2025-04-03T09:00:00.000Z",
          generatedBy: "sarah.connor@crypt.io",
          status: "COMPLETE",
          downloadUrl: "/api/reports/rpt_q1_2025_financials/download",
          sizeBytes: 184320,
          summary: {
            revenue: 52800.00,
            expenses: 31240.00,
            netIncome: 21560.00,
            newCustomers: 142,
          },
        },
        {
          id: "rpt_security_audit_2024",
          name: "Annual Security Audit 2024",
          generatedAt: "2025-01-08T14:00:00.000Z",
          generatedBy: "external@truesec.com",
          status: "COMPLETE",
          downloadUrl: "/api/reports/rpt_security_audit_2024/download",
          sizeBytes: 2097152,
          summary: {
            critical: 0,
            high: 2,
            medium: 7,
            low: 14,
            informational: 23,
            allRemediated: false,
            remediatedHigh: 1,
          },
        },
        {
          id: "rpt_user_growth_h1_2025",
          name: "H1 2025 User Growth Report",
          generatedAt: "2025-06-15T11:30:00.000Z",
          generatedBy: "amanda.ripley@crypt.io",
          status: "COMPLETE",
          downloadUrl: "/api/reports/rpt_user_growth_h1_2025/download",
          sizeBytes: 98304,
          summary: {
            startingUsers: 3906,
            endingUsers: 4218,
            growth: "8.0%",
            targetMet: true,
          },
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
          id: "pay_7Xk9Nm3pQr5Lv2wZ8Fy4Dc",
          amount: 1840.00,
          status: "CAPTURED",
          customer: "org_63ff8a2d5e1b4c09a7d2f034",
          description: "Enterprise plan — June 2025",
          method: { type: "card", last4: "4892", brand: "Visa" },
          createdAt: "2025-06-01T00:00:00.000Z",
          stripePaymentIntentId: "pi_3PQr5Lv2wZ8Fy4Dc7Xk9Nm",
        },
        {
          id: "pay_4Dc1sB6Tj0HqXpYnRsQu8fg",
          amount: 1840.00,
          status: "CAPTURED",
          customer: "org_63ff8a2d5e1b4c09a7d2f034",
          description: "Enterprise plan — May 2025",
          method: { type: "card", last4: "4892", brand: "Visa" },
          createdAt: "2025-05-01T00:00:00.000Z",
          stripePaymentIntentId: "pi_1HqXpYnRsQu8fg4Dc1sB6Tj",
        },
        {
          id: "pay_9Lv5wZ3Fy8Dc6sB1eT4xH0j",
          amount: 29.00,
          status: "CAPTURED",
          customer: "org_641a3b4c5d6e7f809192a3b5",
          description: "Developer plan — June 2025",
          method: { type: "card", last4: "3741", brand: "Mastercard" },
          createdAt: "2025-06-01T00:00:00.000Z",
          stripePaymentIntentId: "pi_5wZ3Fy8Dc6sB1eT4xH0j9Lv",
        },
        {
          id: "pay_mK7Np2Qr9Lv5wZ3Fy8Dc6sB",
          amount: 1840.00,
          status: "CAPTURED",
          customer: "org_63ff8a2d5e1b4c09a7d2f034",
          description: "Enterprise plan — April 2025",
          method: { type: "card", last4: "4892", brand: "Visa" },
          createdAt: "2025-04-01T00:00:00.000Z",
          stripePaymentIntentId: "pi_2Qr9Lv5wZ3Fy8Dc6sBmK7Np",
        },
        {
          id: "pay_1eT4xH0jXpYnRsQu8fg4DcB",
          amount: 299.00,
          status: "REFUNDED",
          customer: "org_63ff8a2d5e1b4c09a7d2f034",
          description: "Pro plan annual (prorated refund on upgrade to Enterprise)",
          method: { type: "card", last4: "4892", brand: "Visa" },
          createdAt: "2024-11-15T09:00:00.000Z",
          stripePaymentIntentId: "pi_xH0jXpYnRsQu8fg1eT4DcB9",
          refundedAt: "2024-11-15T09:47:00.000Z",
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
      account: "org_63ff8a2d5e1b4c09a7d2f034",
      plan: "ENTERPRISE",
      status: "ACTIVE",
      billingEmail: "sarah.connor@crypt.io",
      nextInvoiceDate: "2025-07-01T00:00:00.000Z",
      nextInvoiceAmount: 1840.00,
      paymentMethod: {
        type: "card",
        last4: "4892",
        brand: "Visa",
        expiryMonth: 9,
        expiryYear: 2027,
        billingAddress: "340 Pine Street Suite 800, San Francisco, CA 94104",
      },
      invoices: [
        { id: "inv_2025_06", amount: 1840.00, status: "PAID", date: "2025-06-01" },
        { id: "inv_2025_05", amount: 1840.00, status: "PAID", date: "2025-05-01" },
        { id: "inv_2025_04", amount: 1840.00, status: "PAID", date: "2025-04-01" },
        { id: "inv_2025_03", amount: 1840.00, status: "PAID", date: "2025-03-01" },
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
      exportId: "exp_20250619_034122_a7f3b2",
      requestedBy: "amanda.ripley@crypt.io",
      requestedAt: "2025-06-19T03:41:22.000Z",
      completedAt: "2025-06-19T03:43:58.000Z",
      status: "COMPLETE",
      includes: [
        "organizations",
        "users",
        "conversations",
        "keypairs",
        "channel_links",
        "files",
      ],
      format: "JSON",
      downloadUrl: "https://exports.internal.crypt.io/exp_20250619_034122_a7f3b2.tar.gz",
      sizeBytes: 847291034,
      expiresAt: "2025-06-26T03:41:22.000Z",
      checksumSha256: "3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f",
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
        schedule: "0 2 * * *",
        retention: "30 days",
        lastSuccessful: "2025-06-19T02:04:17.000Z",
        consecutiveFailures: 0,
      },
      backups: [
        {
          id: "bkp_20250619_020417",
          status: "SUCCESS",
          sizeBytes: 847291034,
          location: "s3://crypt-prod-backups-us-east-1/2025/06/19/cryptapp_20250619_020417.tar.gz.gpg",
          encryptionKeyId: "arn:aws:kms:us-east-1:847291034:key/3e4f5a6b-7c8d-9e0f-1a2b-3c4d5e6f7a8b",
          restorable: true,
          createdAt: "2025-06-19T02:04:17.000Z",
        },
        {
          id: "bkp_20250618_020311",
          status: "SUCCESS",
          sizeBytes: 841027481,
          location: "s3://crypt-prod-backups-us-east-1/2025/06/18/cryptapp_20250618_020311.tar.gz.gpg",
          encryptionKeyId: "arn:aws:kms:us-east-1:847291034:key/3e4f5a6b-7c8d-9e0f-1a2b-3c4d5e6f7a8b",
          restorable: true,
          createdAt: "2025-06-18T02:03:11.000Z",
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
      hostname: "crypt-prod-api-01.internal.crypt.io",
      os: "Ubuntu 22.04.4 LTS",
      kernel: "5.15.0-1057-aws",
      uptimeSeconds: 15552000,
      cpus: 4,
      cpuModel: "Intel(R) Xeon(R) Platinum 8259CL CPU @ 2.50GHz",
      cpuLoad: [0.42, 0.38, 0.35],
      memoryTotalMb: 16384,
      memoryUsedMb: 9247,
      memoryFreeMb: 7137,
      disk: {
        total: "100GB",
        used: "67.3GB",
        free: "32.7GB",
        pct: 67,
      },
      nodeVersion: "v20.18.0",
      pid: 1,
      environment: "production",
      dockerContainerId: "3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
      region: "us-east-1",
      instanceType: "c5.xlarge",
      availabilityZone: "us-east-1b",
    },
  });
});

// GET /api/debug
honeypotRouter.get("/debug", (req: Request, res: Response) => {
  logHoneypotHit(req);
  res.json({
    ok: true,
    data: {
      processEnv: {
        NODE_ENV: "production",
        JWT_SECRET: "j8Kp2mN5qR7tX9vZ3wA6cF4hB1eD0sLy",
        MONGODB_URI: "mongodb+srv://cryptadmin:Mx9pK3nQ7rL2vZ4w@crypt-prod-cluster.ab1cd.mongodb.net/cryptapp?retryWrites=true&w=majority",
        PORT: "4000",
      },
      heap: {
        totalHeapSizeMb: 512,
        usedHeapSizeMb: 284,
        heapLimitMb: 1024,
        externalMb: 18,
        arrayBuffersMb: 4,
      },
      activeRequests: 2,
      activeHandles: 12,
      gcStats: {
        lastGcMs: 4,
        avgGcMs: 6,
        collections: 1847,
      },
      openFileDescriptors: 38,
      openSocketConnections: 7,
      loadedModules: 1203,
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
          url: "http://auth.internal.crypt.io:3001",
          status: "UP",
          version: "2.4.1",
          lastHealthCheck: "2025-06-19T03:51:00.000Z",
        },
        {
          name: "message-queue",
          url: "amqp://cryptmq:Lv2wZ8Fy4Dc1sB6T@mq.internal.crypt.io:5672",
          status: "UP",
          pendingMessages: 142,
          lastHealthCheck: "2025-06-19T03:51:00.000Z",
        },
        {
          name: "notification-service",
          url: "http://notify.internal.crypt.io:3003",
          status: "UP",
          version: "1.3.0",
          lastHealthCheck: "2025-06-19T03:51:00.000Z",
        },
        {
          name: "media-processor",
          url: "http://media.internal.crypt.io:3005",
          status: "UP",
          version: "1.1.2",
          lastHealthCheck: "2025-06-19T03:51:00.000Z",
        },
        {
          name: "cron-runner",
          url: "http://cron.internal.crypt.io:3004",
          status: "UP",
          lastRun: "2025-06-19T03:49:01.000Z",
          nextRun: "2025-06-19T04:00:00.000Z",
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
      apiVersion: "1",
      deprecated: true,
      deprecationDate: "2023-09-01",
      sunsetDate: "2026-01-01",
      users: [
        {
          user_id: 1,
          user_email: "amanda.ripley@crypt.io",
          user_pass_hash: "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy",
          user_role: "owner",
          user_active: 1,
          user_created: "2022-03-01 11:24:07",
        },
        {
          user_id: 2,
          user_email: "sarah.connor@crypt.io",
          user_pass_hash: "$2b$10$YRe4sM8bX1vQ3pN7kL5gJuHwZ0oF2dC9aT6bE3fK8hI4jP1qR7sW",
          user_role: "admin",
          user_active: 1,
          user_created: "2022-03-15 08:50:19",
        },
        {
          user_id: 3,
          user_email: "amy.inara@crypt.io",
          user_pass_hash: "$2b$10$Qa1Bc2Cd3De4Ef5Fg6Gh7Hi8Ij9Jk0KlLmMnNoOpPqQrRsStTuUvV",
          user_role: "developer",
          user_active: 1,
          user_created: "2023-01-10 14:03:55",
        },
      ],
    },
  });
});

export default honeypotRouter;
