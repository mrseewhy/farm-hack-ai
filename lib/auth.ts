import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { Pool } from "pg";
import {
  CONSENT_HEADER,
  CONSENT_POLICY_VERSION,
  isAcceptedConsentVersion,
} from "@/lib/consent";
import { isE2eMode } from "@/lib/e2e";

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
  // IP-based rate limiting to prevent auth endpoint spam. Better Auth applies
  // its own 3-per-10s rule to /sign-up, which the global max cannot raise, so
  // the local E2E suite (several accounts from one IP) gets an explicit rule.
  // `isE2eMode()` is false outside local development/E2E.
  rateLimit: {
    enabled: true,
    window: 60,
    max: isE2eMode() ? 200 : 30,
    ...(isE2eMode()
      ? { customRules: { "/sign-up/email": { window: 60, max: 200 } } }
      : {}),
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
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;

      // Consent is enforced server-side: a signup without the current policy
      // version is rejected before an account is created.
      const headerValue = ctx.headers?.get?.(CONSENT_HEADER) ?? null;
      const bodyValue =
        (ctx.body as { consentPolicyVersion?: string } | undefined)
          ?.consentPolicyVersion ?? null;

      if (!isAcceptedConsentVersion(headerValue ?? bodyValue)) {
        throw new APIError("BAD_REQUEST", {
          message:
            "Please accept the privacy and data-processing notice to create an account.",
        });
      }
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;

      const email = (ctx.body as { email?: string } | undefined)?.email;
      if (!email) return;

      try {
        const { rows } = await pool.query<{ id: string }>(
          'select id from "user" where email = $1 limit 1',
          [email]
        );
        const userId = rows[0]?.id;
        if (!userId) return;

        // Append-only consent record. The account and the consent row are the
        // auditable pair this policy promises.
        await pool.query(
          `insert into user_consents (user_id, consent_key, policy_version, source)
           values ($1, 'data_processing', $2, 'signup')`,
          [userId, CONSENT_POLICY_VERSION]
        );

        // Playwright cannot run the trusted admin CLI, so a test-only domain is
        // promoted here. `isE2eMode()` is false in production builds.
        if (isE2eMode() && email.endsWith("@admin.e2e.test")) {
          await pool.query('update "user" set role = $1 where id = $2', [
            "admin",
            userId,
          ]);
        }
      } catch (error) {
        // Never fail a completed signup because audit bookkeeping failed, but
        // make the gap visible in server logs.
        console.error("Failed to record signup consent or E2E role:", error);
      }
    }),
  },
});
