# FarmHack AI

FarmHack AI is a multilingual crop-guidance assistant for smallholder farmers in Nigeria. A farmer describes a problem with their **tomato** crop in English, Yoruba, Hausa, or Igbo, optionally attaches a leaf photo, and receives a structured, cautious preliminary assessment: observed signs, possible causes, questions to check, suggested actions, when to seek local help, and an explicit uncertainty level.

The project is deliberately framed as **preliminary AI guidance, not a confirmed diagnosis**. No agricultural expert or expert-labelled dataset was available, so the emphasis is on responsible AI engineering: structured outputs, multilanguage safety filtering, traceable public guidance, reproducible evaluation, and honest limitations.

## What is here

- **Farmer app** (`/chat`, `/chat/[id]`, `/profile`) — a mobile-friendly chat with photo upload, a structured assessment card, language switch, and outcome feedback.
- **Admin workspace** (`/admin/dashboard`, `/admin/guidance`, `/admin/review/[conversationId]`) — usage metrics, AI telemetry, a review queue for uncertain assessments, and a guidance library with explicit provenance.
- **AI pipeline** — Gemini multimodal call → Zod validation with one repair attempt → multilingual safety audit → no-evidence policy → persisted assessment.
- **Evaluation harness** (`evaluation/`) — 38 synthetic cases (text + image) and a replay/record runner that produces reproducible JSON results.

See the roadmap and per-item evidence in [`more-tasks.md`](./more-tasks.md) and the evaluation write-up in [`evaluation/report.md`](./evaluation/report.md).

## Live deployment

The prototype is deployed at **<https://farm-hack-ai.vercel.app/>** (Vercel, production
Neon Postgres, production Cloudinary, live Gemini). It was verified end to end on
**2026-11-07**:

- Signup, login, language selection, chat, photo upload, text assessment, image
  assessment, conversation history, and the admin dashboard/review/guidance pages.
- The farmer journey was exercised in Yoruba, then switched to Hausa while the stored
  Yoruba conversation kept its original language.
- A real tomato photo was uploaded to Cloudinary and assessed successfully
  (`gemini-3.5-flash-lite`, `outcome=ok`, `image_total=1`, `image_failed=0`).
- Production database: 8 Drizzle migrations, all 12 application tables, and 5 published
  source-backed guidance articles.
- Final checks: TypeScript, ESLint, production build, **90/90** unit tests, and **2/2**
  database integration tests.

The ordered screenshot storyboard is in [`docs/storyboard/`](./docs/storyboard/README.md).
It records the live deployment, including the two pre-fix image-assessment failures that
remain visible in admin telemetry.

## Tech stack

- **Next.js** (App Router, React Server Components) + **TypeScript** + **Tailwind CSS** + shadcn/ui
- **PostgreSQL** via **Drizzle ORM**
- **Better Auth** for sessions, roles (`farmer` / `admin`), and password changes
- **Google Gemini** via `@google/generative-ai`
- **Cloudinary** for crop photo storage
- **Zod** for structured AI output validation and server-action input validation
- **Resend** utility, currently unused because email verification is disabled

## Getting started

Requirements: Node.js 20+, a PostgreSQL database, and (for AI features) a Gemini API key.

```bash
npm install
# Create a local .env with the variables listed below (it is git-ignored).
npm run db:generate    # only after changing lib/data/dal/schema.ts
npm run db:migrate
npm run db:seed:guidance
npm run dev
```

Open <http://localhost:3000>. `/` redirects by session role.

### Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Safety, monitoring, guidance, rate-limit, follow-up, reminders, error-sanitization, and eval-scoring tests |
| `npm run test:integration` | Opt-in PostgreSQL integration tests (set `RUN_DB_INTEGRATION=1`; all rows rolled back) |
| `npm run eval:validate` | Validate evaluation case files and fixtures |
| `npm run eval:replay` | Replay the recorded evaluation results and check them against current scoring rules |
| `npm run eval:record` | Call the live model and record new results (needs `GEMINI_API_KEY`) |
| `npm run db:check:auth` | Report the configured database host/schema and auth table status |
| `npm run typecheck` | Generate route types and run `tsc --noEmit` |
| `npm run test:e2e` | Playwright farmer, upload, auth, export, and admin journeys (needs a PostgreSQL database) |
| `npm run test:ops` | Cost, retry-queue, alert, retention, cron-auth, header, and consent tests |
| `npm run test:redteam` | Deterministic safety red-team regression set |

## Engineering and operations

These are the engineering controls around the product, not features. Local
verification on 2026-11-07: **117 unit tests**, **7 Playwright journeys** against
local PostgreSQL, TypeScript, ESLint, and a production build all pass. The
GitHub Actions workflow itself has not yet run on a hosted runner.

- **CI.** [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) runs four jobs:
  typecheck/lint/unit tests/production build; PostgreSQL migration gate plus the
  rolled-back database integration tests; Playwright journeys; and a production
  dependency audit with a gitleaks secret scan. The migration gate regenerates
  Drizzle migrations and fails if `drizzle/` changes, so code and the deployed
  schema cannot drift.
- **End-to-end tests.** [`playwright.config.ts`](./playwright.config.ts) and
  [`e2e/`](./e2e) cover signup, consent rejection, chat, text and photo
  assessments, reload persistence, farmer admin-route denial, data export, the
  admin dashboard, and a persisted human safety review. `E2E_MODE=1` replaces
  the model with a deterministic fixture and stores uploads under
  `public/e2e-uploads`; `lib/e2e.ts` refuses that mode outside development. The
  suite needs a real (preferably local) PostgreSQL database:
  `DATABASE_URL=postgresql://… BETTER_AUTH_SECRET=… npm run test:e2e`
  (see `.env.e2e.local`, git-ignored, for a local example).
- **Error tracking and alerting.** `instrumentation.ts` records bounded server
  errors (route shape, message, digest, stack hash — never bodies or cookies) in
  `error_events`. The protected `/api/cron/health` route evaluates error rate,
  p95 latency, quota failures, degraded runs, server-error spikes, and retry
  backlog every 10 minutes, deduplicates alerts for 30 minutes, and delivers to
  `ALERT_WEBHOOK_URL` and/or Resend email. Delivery failures are stored on the
  alert row rather than swallowed.
- **Cost and percentile reporting.** `ai_events` now stores provider token
  counts and an estimated integer micro-USD cost at configured rates. The admin
  dashboard shows p50/p95 latency, cost per assessment, quota failures, queue
  depth, image byte savings, and a 14-day cost/error/latency trend.
- **Asynchronous retry path.** If every provider candidate fails, the farmer's
  message stays saved and an `assessment_jobs` row is queued. The protected
  `/api/cron/retry-assessments` worker claims due jobs with
  `FOR UPDATE SKIP LOCKED`, retries with 1 min → 6 h backoff, and marks exhausted
  jobs dead (which raises an alert). The first attempt is still synchronous.
- **Pre-model image optimisation.** Uploaded photos are fetched with a timeout,
  signature-checked, auto-rotated, checked for minimum size and sane aspect
  ratio, downscaled to a 1280 px long edge, and re-encoded as JPEG at quality 82
  with metadata stripped. Telemetry records original and sent bytes.
- **Security headers.** `next.config.ts` applies CSP, HSTS, `X-Frame-Options`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, and
  `Permissions-Policy` to every route. The CSP still allows inline scripts
  because Next.js and the theme initialiser inject them; a nonce-based policy is
  a documented next step, not a claim of a strict CSP.
- **Human safety loop.** Medium/high-uncertainty assessments appear in the
  admin review queue, where an admin records `approved`, `needs_follow_up`, or
  `unsafe` in `safety_reviews` (audited). `scripts/red-team.test.mjs` pins
  adversarial pesticide, dosage, diagnosis, and localized-language cases plus a
  benign false-positive guard.
- **Retention, consent, and export.** A daily `/api/cron/retention` job deletes
  expired conversations (stored media first, then rows) and old telemetry and
  error records. Signup requires the current consent policy version and writes an
  append-only record; `/privacy` publishes the enforced retention values; and
  Profile & settings downloads the farmer's own data as JSON.

### Scheduled routes

[`vercel.json`](./vercel.json) schedules the workers:

| Route | Schedule | Purpose |
| --- | --- | --- |
| `/api/cron/retry-assessments` | every 5 minutes | Retry queued assessments |
| `/api/cron/health` | every 10 minutes | Evaluate thresholds and deliver alerts |
| `/api/cron/retention` | daily at 03:00 | Enforce retention |

All three require `Authorization: Bearer $CRON_SECRET`; without the secret they
return 503 rather than exposing destructive work. Vercel sends that header when
`CRON_SECRET` is set on the project. Vercel's Hobby plan limits cron frequency,
so the 5- and 10-minute schedules require a plan that supports them; otherwise
the workers can be triggered by any external scheduler.

## Architecture

```
Browser (React)
   │  server actions (lib/data/actions/*)
   ▼
Next.js server ── Better Auth session + role ── PostgreSQL (Drizzle)
   │
   ├── Gemini multimodal assessment (lib/ai.ts)
   │       └── Zod validation → repair → safety audit → evidence policy
   │
   └── Cloudinary image upload (server-controlled; secrets stay server-side)
```

Data access is split into `lib/data/dal/` (Drizzle schema, queries, connection) and `lib/data/actions/` (server actions). Route handlers under `app/api/` are used only for Better Auth (`app/api/auth/[...all]/route.ts`); all other data operations go through server actions. Validation schemas live in `lib/data/validation/`.

The request proxy (`proxy.ts`) and the route-group layouts (`app/(farmer)/layout.tsx`, `app/admin/layout.tsx`) both enforce authentication and role, and every admin server action re-checks `role === "admin"`. A fuller description is in [`docs/architecture.md`](./docs/architecture.md).

## AI pipeline and safety

1. **Server-derived evidence.** Text and image URLs are read from the stored message and its attachments, never trusted from the client.
2. **Structured output.** The model must return a JSON assessment matching a Zod schema (observed signs, possible causes, follow-up questions, actions, escalation, uncertainty). One repair attempt is made; otherwise the request fails closed.
3. **Image checks.** The file signature is verified (`lib/image.ts`) so a renamed non-image cannot reach the model; failed or unreadable images are reported to the farmer rather than silently ignored.
4. **Multilingual safety audit.** `lib/safety.ts` removes or refuses pesticide names, dosages, and definite-diagnosis claims in all four supported languages and forces escalation where needed.
5. **No-evidence policy.** With no text and no image, or with no findings, the assistant returns a safe fallback that asks for more evidence or local help.
6. **Per-user limit.** A rolling 24-hour cap (default 20, `AI_MAX_ASSESSMENTS_PER_DAY`) limits cost and abuse.
7. **Monitoring.** Every attempt writes an `ai_events` row (model, prompt version, validation outcome, fallback/error, latency, safety flags) visible in the admin telemetry summary.

## Evaluation

The harness in `evaluation/` runs a fixed set of synthetic cases against a configured model and records structured results.

- `evaluation/cases/` — text and image cases, including unsafe requests, ambiguous symptoms, and image failure modes.
- `evaluation/criteria.md` — the scoring rules (format compliance, uncertainty handling, safety, image handling).
- `evaluation/report.md` — results, the two-configuration comparison, failure examples, and limitations.
- `evaluation/images/manifest.json` — provenance and licence for every test image.

Recorded runs live in `evaluation/runs/`. Synthetic cases measure **technical** behaviour and some safety properties; they cannot establish agricultural diagnostic accuracy, and image labels are provisional. See the report for the current numbers and the quota-related gaps.

## Environment variables

Never commit `.env`. Required unless noted.

| Variable | Purpose | Required |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `BETTER_AUTH_URL` | App origin (e.g. `http://localhost:3000`) | Yes |
| `BETTER_AUTH_SECRET` | Secret for session signing | Yes |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name for photo uploads | Yes (for photos) |
| `CLOUDINARY_API_KEY` | Cloudinary API key | Yes (for photos) |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | Yes (for photos) |
| `GEMINI_API_KEY` | Gemini API key for crop assessment | Yes (for AI features) |
| `GEMINI_MODEL` | Primary model id; defaults to `gemini-3.8-flash` | No |
| `GEMINI_FALLBACK_MODELS` | Comma-separated fallbacks tried in order on overload/quota; defaults to `gemini-3.6-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite` | No |
| `AI_MAX_ASSESSMENTS_PER_DAY` | Rolling per-user assessment cap; defaults to `20`, clamped to `[1, 500]` | No |
| `AI_FOLLOW_UP_REMINDER_HOURS` | Hours before an assessment becomes a follow-up reminder; defaults to `48`, clamped to `[1, 720]` | No |
| `CRON_SECRET` | Bearer secret for the scheduled routes; without it they return 503 | Yes (for scheduled jobs) |
| `ALERT_WEBHOOK_URL` | Slack/Discord/PagerDuty-compatible webhook for operational alerts | No |
| `ALERT_EMAIL_TO` | Comma-separated alert recipients (uses `RESEND_API_KEY` and `EMAIL_FROM`) | No |
| `GEMINI_INPUT_COST_PER_M_USD` | USD per million input tokens for the cost estimate; default `0.3` | No |
| `GEMINI_OUTPUT_COST_PER_M_USD` | USD per million output tokens for the cost estimate; default `2.5` | No |
| `RETENTION_CONVERSATION_DAYS` | Days after last activity before a conversation is deleted; default `365` | No |
| `RETENTION_TELEMETRY_DAYS` | Days before telemetry and alert rows are deleted; default `400` | No |
| `RETENTION_ERROR_DAYS` | Days before server error records are deleted; default `90` | No |
| `E2E_MODE` | Local/CI Playwright only: replaces the model and stores uploads locally; refused outside development | No |
| `RESEND_API_KEY` | Resend API key for email verification | No (disabled) |
| `EMAIL_FROM` | From address for emails | No (disabled) |

> Gemini's free tier historically allowed only **20 generate-content requests per day per model**, which is not enough for a pilot. Enable billing on the Google AI project, or point `GEMINI_API_KEY` at a billed project, before launch. When a model is overloaded or out of quota, the app tries `GEMINI_FALLBACK_MODELS` in order and offers the farmer a retry action; provider details stay in the server log.

## Better Auth database setup

The app needs the `user`, `session`, `account`, and `verification` tables in the **same PostgreSQL database and schema used by the deployment**. The initial SQL migration is in `better-auth_migrations/`.

```bash
npm run db:check:auth
```

For a Vercel production deployment, pull its environment variables into an ignored local file, inspect the reported database host and schema, then apply the initial migration if the tables are absent:

```bash
npx vercel env pull .env.production.local --environment=production
FARMHACK_ENV_FILE=.env.production.local npm run db:check:auth
FARMHACK_ENV_FILE=.env.production.local npm run db:migrate:auth
FARMHACK_ENV_FILE=.env.production.local npm run db:check:auth
```

Run those commands from a linked Vercel project with permission to read its production environment. Do not paste the database URL into chat or commit the environment file. The migration creates the initial auth tables only when none exist and stops if it finds a partial schema; it is safe to rerun. If the check reports an unexpected host, database, or schema, correct the deployment's `DATABASE_URL` instead of migrating the wrong database. Also set `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` in Vercel, then redeploy.

## Provision an admin

Only farmers can register in the app. To create an admin, register the account normally, verify the target database, then promote that existing account through the trusted local CLI:

```bash
FARMHACK_ENV_FILE=.env.production.local npm run db:check:auth
FARMHACK_ENV_FILE=.env.production.local npm run auth:provision-admin -- admin@example.com
```

The script accepts a single email, changes only an existing farmer account, and revokes its sessions. Public registration never accepts the admin role. The person signs in again to reach `/admin/dashboard`.

## Guidance library

Published guidance lives in `content/guidance/` (currently `uc-ipm-tomato.json`, five articles sourced from the University of California IPM tomato pest-management program). Each row records publisher, title, URL, access date, licence, and provenance. The admin guidance screen moves articles through `draft → in_review → published`. A publication gate (`lib/guidance.ts`) blocks publication unless provenance, source metadata, and review fields are present, and keeps `source_backed` distinct from `expert_reviewed`. No article is currently `expert_reviewed`.

Retrieval is crop-scoped: an assessment receives only guidance matching the conversation's crop.

## Privacy and retention

- **Account data.** Email, hashed password (managed by Better Auth), and the preferred language are stored for the account's lifetime.
- **Conversations, messages, photos, and assessments.** Stored so a farmer can revisit their history. A farmer can delete a conversation; deletion cascades to its messages, assessments, and follow-ups, and server-side code deletes the associated Cloudinary media before removing database rows. Deleting a message also removes its attached image record.
- **AI telemetry.** `ai_events` records model, prompt version, validation outcome, latency, and safety flags for monitoring. These rows carry no image data and are not used for diagnosis.
- **Admin access.** Admin actions are recorded in `admin_audit_events`. Admins can view conversations only through the audited review flow.
- **Enforcement.** The daily retention worker deletes conversations past their configured retention window (media first, then rows) plus expired telemetry, alerts, and error records, in bounded batches, and writes an audit row per run.
- **Consent.** Signup requires the current consent policy version, and the auth hook writes an append-only `user_consents` record. The published notice at `/privacy` uses the same enforced retention values.
- **Export.** Profile & settings downloads the farmer's own conversations, messages, images, assessments, and feedback as JSON.
- No location data is collected. This is a prototype policy enforced by the code above, not a legal compliance statement; define a formal data-deletion request process and obtain legal review before any real deployment.

## Email verification (currently disabled)

Email verification is temporarily disabled: new accounts can sign up and sign in immediately. To enable it later:

1. Purchase and verify a domain in [Resend](https://resend.com).
2. Add `RESEND_API_KEY` and `EMAIL_FROM` to `.env` (never commit it).
3. Uncomment the `emailVerification` block in `lib/auth.ts`.
4. Redeploy.

`lib/email.ts` contains the Resend utility ready to be wired in.

## Limitations

- **No agricultural expert or validated dataset.** Assessments are preliminary and unverified; use them only as decision support.
- **Tomato only.** Other crops are intentionally unsupported until validated.
- **Synthetic evaluation.** Tests measure technical behaviour and safety rules, not diagnostic accuracy.
- **Citations are source-backed, not expert-reviewed.** Each assessment lists the guidance it used, with a real URL and provenance. No article has been expert-reviewed yet.
- **Guided intake is suggestion-based.** Common-sign chips help a farmer start; they are not a validated clinical questionnaire.
- **Follow-up reminders are time-based and in-app only.** A configurable window (default 48h) triggers a prompt; there is no SMS, email, or push delivery.
- **Mobile performance is measured on desktop/dev.** Images use `next/image`, and Lighthouse accessibility/best-practices/SEO are 1.0, but low-end device and throttled-network profiling is not possible with the current tooling.
- **Provider quotas** can limit live evaluation and pilot volume on the free tier.

See [`docs/validation-plan.md`](./docs/validation-plan.md) for the path to real-world use.
