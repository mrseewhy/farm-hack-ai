import { betterAuth } from "better-auth";
import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Fail predictably instead of holding a request open forever when the
  // database is unreachable or a query stalls. Serverless instances are
  // short-lived, so a small pool is enough.
  max: 10,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  statement_timeout: 30_000,
  query_timeout: 30_000,
});

export const auth = betterAuth({
  database: pool,
  emailAndPassword: { enabled: true },
  // IP-based rate limiting to prevent auth endpoint spam
  rateLimit: {
    enabled: true,
    window: 60,
    max: 30,
  },
  // emailVerification: {
  //   enabled: true,
  //   sendVerificationEmail,
  // },
  // Email verification is temporarily disabled pending a permanent domain name
  // and Resend configuration. Re-enable when RESEND_API_KEY and EMAIL_FROM
  // are configured in .env.
  user: {
    additionalFields: {
      role: {
        type: ["farmer", "admin"],
        required: false,
        defaultValue: "farmer",
        input: false,
      },
      preferredLanguage: {
        type: ["English", "Yoruba", "Hausa", "Igbo"],
        required: false,
        defaultValue: "English",
        input: true,
      },
    },
  },
});
