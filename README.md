# FarmHack AI

FarmHack AI is a multilingual crop-diagnosis assistant for smallholder farmers in Nigeria. A farmer describes a problem with their **tomato** crop in English, Yoruba, Hausa, or Igbo, optionally attaches a leaf photo, and receives a structured, cautious preliminary assessment: observed signs, possible causes, questions to check, suggested actions, when to seek local help, and an explicit uncertainty level.

The project is deliberately framed as **preliminary AI guidance, not a confirmed diagnosis**. No agricultural expert or expert-labelled dataset was available, so the emphasis is on responsible AI engineering: structured outputs, multilanguage safety filtering, traceable public guidance, reproducible evaluation, and honest limitations.

## What is here

- **Farmer app** (`/chat`, `/chat/[id]`, `/profile`) — a mobile-friendly chat with photo upload, a structured assessment card, language switch, and outcome feedback.
- **Admin workspace** (`/admin/dashboard`, `/admin/guidance`, `/admin/review/[conversationId]`) — usage metrics, AI telemetry, a review queue for uncertain assessments, and a guidance library with explicit provenance.
- **AI pipeline** — Gemini multimodal call → Zod validation with one repair attempt → multilingual safety audit → no-evidence policy → persisted assessment.
- **Evaluation harness** (`evaluation/`) — 38 synthetic cases (text + image) and a replay/record runner that produces reproducible JSON results.

See the roadmap and per-item evidence in [`more-tasks.md`](./more-tasks.md) and the evaluation write-up in [`evaluation/report.md`](./evaluation/report.md).

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
| `npm test` | Safety, monitoring, guidance, rate-limit, follow-up, and eval-scoring tests |
| `npm run test:integration` | Opt-in PostgreSQL integration tests (set `RUN_DB_INTEGRATION=1`; all rows rolled back) |
| `npm run eval:validate` | Validate evaluation case files and fixtures |
| `npm run eval:replay` | Replay the recorded evaluation results and check them against current scoring rules |
| `npm run eval:record` | Call the live model and record new results (needs `GEMINI_API_KEY`) |
| `npm run db:check:auth` | Report the configured database host/schema and auth table status |

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
- No location data is collected. This is a prototype policy, not a legal compliance statement; define a formal retention period and a data-deletion request process before any real deployment.

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
- **Sources are not yet cited in the farmer UI.** Guidance URLs are given to the model in the prompt but are not rendered as a citation block in the response.
- **Guided symptom collection and follow-up reminders are basic.** The assistant asks follow-up questions and records outcome feedback, but there is no dedicated intake wizard or scheduled reminder.
- **Mobile performance is not benchmarked** on low-end devices or throttled networks.
- **Provider quotas** can limit live evaluation and pilot volume on the free tier.

See [`docs/validation-plan.md`](./docs/validation-plan.md) for the path to real-world use.
