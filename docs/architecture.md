# FarmHack AI — Technical architecture

This document explains how a farmer's message becomes a cautious, structured crop assessment, and where the trust and safety boundaries sit. It complements the operational detail in [`../README.md`](../README.md) and the measured results in [`../evaluation/report.md`](../evaluation/report.md).

## Goals and constraints

- **Useful** multimodal crop guidance (text + photo) for tomato farmers in four languages.
- **Safe** by default: no unsupported pesticide/dosage advice, no definite diagnosis, escalation when evidence is thin.
- **Grounded** in traceable public guidance rather than unverifiable model memory.
- **Honest**: no claim of agricultural accuracy; everything measurable is measured, everything unknown is documented.

The prototype is deployed at <https://farm-hack-ai.vercel.app/> (Vercel + production
Neon Postgres + Cloudinary + Gemini), but it is not validated for real-world field use.
The design targets a credible, testable prototype.

## System diagram

```mermaid
flowchart TB
  subgraph Client["Browser — React (Next.js App Router)"]
    Chat["/chat · /chat/[id]"]
    Profile["/profile"]
    Admin["/admin/*"]
  end

  subgraph Edge["Request proxy — proxy.ts"]
    AuthGate["Session + role gate\n(unauthenticated → /login)"]
  end

  subgraph Server["Next.js server"]
    SA["Server actions\nlib/data/actions/*"]
    AI["Assessment pipeline\nlib/ai.ts"]
    Safe["Safety + evidence policy\nlib/safety.ts, lib/image.ts"]
    Guide["Guidance policy\nlib/guidance.ts"]
    Mon["Monitoring\nlib/monitoring.ts"]
  end

  DB[("PostgreSQL\n(Drizzle ORM)")]
  Gemini["Google Gemini\nmultimodal model"]
  Cloud["Cloudinary\nphoto storage"]

  Chat -->|server action| AuthGate --> SA
  Admin --> AuthGate
  SA --> DB
  SA -->|text + image URLs| AI
  AI --> Gemini
  AI --> Safe
  SA --> Guide --> DB
  AI --> Mon --> DB
  SA -->|server-side upload| Cloud
```

## Request path (a farmer sends a message)

1. **Route guard.** `proxy.ts` matches every non-API path. Unauthenticated users on `/chat` or `/admin` are redirected to `/login`; roles are checked and unknown roles are signed out. The route-group layouts (`app/(farmer)/layout.tsx`, `app/admin/layout.tsx`) repeat the check server-side.
2. **Server action.** The client calls a server action (for example `createMessage`, `runAssessment`, `uploadCropImage`). Inputs are validated with Zod. The acting user comes from the Better Auth session, never from client input.
3. **Ownership scoping.** Every conversation, message, assessment, and follow-up query is filtered by `conversations.userId = session.user.id`, so one farmer cannot read or mutate another's data. Admin-only actions call `getCurrentAdmin()`, which throws unless `role === "admin"`.
4. **Photo upload.** `uploadCropImage` validates MIME type and size, then verifies the **file signature** (`looksLikeImage`) so a renamed non-image cannot reach Cloudinary. It confirms conversation ownership and that the target message belongs to that conversation *before* uploading, so a failed access check cannot leave an orphaned file. If binding the upload to the database fails, the Cloudinary asset is deleted.
5. **Evidence assembly.** Text and image URLs are read from the stored message and its attachments, not from the request body. Unreachable or unusable images are dropped and counted.
6. **Model call.** `assessCropHealth` builds a prompt that includes the crop-scoped guidance block, sends the text and inline images to Gemini, and requests a JSON object matching the assessment schema. If the primary model is overloaded or out of quota, `GEMINI_FALLBACK_MODELS` are tried in order. Text turns allow 20 s per attempt inside a 45 s total budget; image turns allow 30 s per attempt inside a 55 s total budget, because the full image prompt is materially slower. The capped budget keeps a slow provider from holding the chat open indefinitely.
7. **Validation.** The response is parsed with Zod. On failure, one repair attempt is made with the validation errors attached; if that also fails, the request fails closed to a safe fallback and is recorded as `validation_outcome = invalid`, `outcome = fallback`.
8. **Safety audit.** `lib/safety.ts` removes or refuses restricted content (pesticide names, dosages, definite-diagnosis language) in all four languages, forcing escalation where required. The post-filter output is audited again so the filter cannot reintroduce unsafe text.
9. **Evidence policy.** `applyEvidencePolicy` enforces the no-evidence rules: no text and no image → safe fallback; no findings → high uncertainty plus escalation; empty follow-up list → a clarifying question is added.
10. **Persistence and monitoring.** The assessment is stored against the message (one assessment per message) with the model and `PROMPT_VERSION`. An `ai_events` row records model, prompt version, validation outcome, fallback/error state, latency, image-failure count, and safety-flag count. Telemetry is best-effort and outside the assessment transaction, so it can never block a farmer.
11. **Rendering.** The client renders the structured assessment card: observed signs, possible causes, questions to check, suggested actions, when to seek help, uncertainty, and a limitations notice. The farmer can submit outcome feedback.

## Data model

```mermaid
erDiagram
  user ||--o{ conversations : owns
  user ||--o{ session : has
  user ||--o{ admin_audit_events : acts
  conversations ||--o{ messages : contains
  conversations ||--o{ assessments : contains
  conversations ||--o{ follow_ups : contains
  messages ||--o{ message_images : has
  messages ||--o| assessments : "assessed from"
  messages ||--o{ assessments : "assistant reply"
  messages ||--o{ follow_ups : "feedback on"
  knowledge_articles }o--|| assessments : "guidance used"
```

- `user`, `session`, `account`, `verification` — Better Auth.
- `conversations` — owner, title, crop, language.
- `messages` — role (`user`/`assistant`), content, language.
- `message_images` — Cloudinary `public_id` and secure URL, linked to a message.
- `assessments` — structured result JSON, model, prompt version, and the source/assistant message ids. A unique constraint allows one assessment per source message.
- `follow_ups` — farmer outcome feedback (`outcome`, `helpful`, free-text observation).
- `knowledge_articles` — guidance with provenance (`source_backed` / `expert_reviewed`) and source metadata.
- `ai_events` — privacy-conscious telemetry (no farmer text, prompts, model output, or image URLs), including token counts, estimated cost, and image byte savings.
- `assessment_jobs` — retry-later queue with attempts, availability, and dead-letter state.
- `safety_reviews` — human decisions on flagged assessments.
- `error_events` — bounded server errors from `onRequestError` (no bodies, cookies, query strings, or raw stacks).
- `operational_alerts` — fired alerts, including delivery outcome.
- `retention_runs` — audit trail for scheduled deletion.
- `user_consents` — append-only consent records with policy version.
- `admin_audit_events` — admin actions.

Deletions cascade: removing a conversation removes its messages, assessments, and follow-ups; removing a message removes its images; Cloudinary media is deleted before database rows.

## Trust boundaries

| Boundary | Trusted side | What crosses it |
| --- | --- | --- |
| Browser → server | Server | Text, a file upload, and ids. Evidence for the model is re-derived server-side. |
| Server → Gemini | Server | Crop text, inline image data, guidance snippets. Provider errors stay in the server log. |
| Server → Cloudinary | Server | Image bytes; secrets never leave the server. |
| Admin UI → server | Server | Every admin action re-checks the admin role. |

## Operational and enforcement layer

| Concern | Implementation |
| --- | --- |
| Scheduled retries | `/api/cron/retry-assessments` claims `assessment_jobs` with `FOR UPDATE SKIP LOCKED` and uses bounded backoff; exhausted jobs become dead and raise an alert. |
| Alerting | `/api/cron/health` evaluates error rate, p95 latency, quota failures, degraded rate, server-error spikes, and queue depth, with a 30-minute per-alert cooldown, then delivers to a webhook and/or email. |
| Error tracking | `instrumentation.ts` records a bounded message, route shape, digest, and stack hash. No request body or cookie is stored. |
| Cost/percentiles | `ai_events` carries provider tokens and estimated micro-USD; the admin summary computes p50/p95 and cost per assessment in SQL. |
| Image handling | The model receives a downscaled JPEG (1280 px long edge, q82) after quality checks, not the original asset. |
| Headers | CSP, HSTS, framing, referrer, permissions, and content-type policies are applied in `next.config.ts`. |
| Retention | The daily retention worker deletes media before rows and audits each batch in `retention_runs`. |
| Consent | Signup is rejected without the current policy version; the auth hook writes `user_consents`. Farmers can export their data from Profile. |

All scheduled routes require `Authorization: Bearer $CRON_SECRET` and return 503 when the secret is absent.

## Known gaps

- The GitHub Actions workflow has not yet run on a hosted runner; its commands were executed locally.
- The CSP still allows inline scripts; a per-request nonce policy is outstanding.
- Alert thresholds are sensible defaults, not tuned against production traffic.
- Cost is an estimate at configured rates, not a billing record.
- Guidance is source-backed, not expert-reviewed; citations are rendered in the farmer UI so this is visible.
- Guided intake is suggestion-based; there is no validated step-by-step questionnaire.
- Follow-up reminders are in-app only (no SMS/email/push) and time-based rather than outcome-driven.
- Mobile performance is measured in desktop/dev; low-end device and throttled-network profiling remains outstanding.

See [`../evaluation/report.md`](../evaluation/report.md) for the evaluation design and [`validation-plan.md`](./validation-plan.md) for the route to real-world validation.
