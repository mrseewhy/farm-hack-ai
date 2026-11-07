# Fellowship application — FarmHack AI

**Applicant:** Olusegun Adeyemi
**Project:** FarmHack AI — multilingual, evidence-grounded crop guidance for smallholder tomato farmers
**Live application:** <https://farm-hack-ai.vercel.app/>
**Source code:** <https://github.com/mrseewhy/farm-hack-ai>
**Date:** 2026-11-07

## Summary

FarmHack AI is a working prototype that lets a smallholder tomato farmer describe a
problem in English, Yoruba, Hausa, or Igbo, optionally attach a leaf photo, and receive a
structured preliminary assessment: observed signs, possible causes, questions to check,
suggested actions, when to seek local help, and an explicit uncertainty level. Every
answer is labelled as AI guidance rather than a diagnosis, grounded in curated public
guidance with visible provenance, and checked by a multilingual safety layer.

I built and deployed the full stack, created a 38-case evaluation harness, ran a
two-configuration comparison, verified the farmer and admin journeys against the live
deployment, and documented the limits honestly. The project is deliberately a **tested
prototype**, not a claim of diagnostic accuracy: there is no agricultural expert or
expert-labelled dataset behind it yet.

## The problem

Tomato is a high-value crop across Nigeria, and smallholder growers routinely lose a
large share of a harvest to diseases such as late blight, early blight, bacterial wilt,
and viral infections. Getting a timely, trustworthy answer is hard:

- Agricultural extension officers are few and geographically spread out.
- Much of the available online material is in English, assumes products or inputs a
  farmer may not have, or pushes pesticide decisions a farmer cannot safely evaluate.
- A farmer's usual tools — prior experience, neighbours, and a search engine — are not
  calibrated, localised, or cautious.

The result is delayed treatment, over- or misuse of chemicals, and avoidable loss. The
problem is not simply "can a language model name a disease?" It is whether a system can
give **useful, safe, multilingual guidance under uncertainty**, and whether its behaviour
can be evaluated reproducibly without pretending to have ground truth it does not have.

## The solution

FarmHack AI is a mobile-friendly chat with three parts:

1. **Farmer experience.** A farmer signs up, chooses a language, and describes the
   problem. The empty state offers tappable common-sign chips (yellowing, dark spots,
   wilting, holes, insects, leaf curl, fruit rot) in all four languages. A photo can be
   attached from the device. Each assessment is rendered as a structured card with
   observed signs, possible causes, things to check, suggested actions, when to seek
   help, uncertainty, a limitations notice, and a **Sources** block. The farmer can
   revisit conversations, change language, and say whether the advice helped.
2. **Safety and grounding.** The model must return JSON matching a Zod schema. A
   multilingual safety audit removes or refuses pesticide names, dosages, and definite
   diagnosis claims, then audits its own output again. When evidence is thin, the system
   escalates to a local extension worker instead of guessing. Published guidance is
   clearly marked `source_backed` or `expert_reviewed`; no article is currently
   expert-reviewed, and the interface says so.
3. **Admin workspace.** Admins see farmer/conversation counts, AI telemetry, a review
   queue of uncertain assessments, and the guidance library. The review page is a
   read-only, audited view of the conversation, assessment, and uncertainty. Admin
   actions are recorded in an audit table.

## Technical approach

The application is a Next.js App Router project written in TypeScript, deployed on
Vercel. PostgreSQL (Neon in production) is accessed through Drizzle ORM; Better Auth
handles sessions and the `farmer` / `admin` roles. Photos are uploaded server-side to
Cloudinary. Gemini provides the multimodal assessment.

The request path is designed around trust boundaries:

- **Server-derived evidence.** The model receives text and image URLs read from the
  stored message and its attachments, never from the request body.
- **Structured output with a repair step.** The response is validated with Zod. One
  repair attempt is made; if that fails, the request fails closed to a safe fallback.
- **Image checks.** The file signature is verified before Cloudinary upload, so a renamed
  non-image cannot reach the model. Invalid, unreachable, or oversized images are dropped,
  counted, and shown to the farmer rather than silently ignored.
- **Multilingual safety.** English, Yoruba, Hausa, and Igbo pesticide/dosage and
  definite-diagnosis patterns are filtered, with a conservative bias toward false
  positives. A final audit checks the filtered output.
- **No-evidence policy.** No text and no image, or no findings, produces a safe fallback
  that asks for more evidence or local help.
- **Per-user limit and telemetry.** A rolling 24-hour assessment cap limits cost and
  abuse. Every attempt writes an `ai_events` row — model, prompt version, validation
  outcome, fallback/error, latency, image-failure count, safety-flag count — with no
  farmer text, prompts, model output, or image URLs.
- **Model resilience.** `gemini-3.5-flash-lite` is the primary model with configured
  fallbacks. Text turns use a 20 s per-attempt timeout inside a 45 s total budget; image
  turns use 30 s per attempt inside a 55 s budget. The capped budget keeps a slow provider
  from holding the chat open indefinitely.

## Experiments

I evaluated technical and safety behaviour, not agricultural accuracy.

**Synthetic case suite.** The harness defines **38 cases**: 10 typical tomato scenarios,
7 pesticide/dose safety requests across four languages, 4 ambiguity/weak-evidence cases,
4 cross-language cases, 4 diagnosis-bait cases, 3 out-of-scope requests, and 6 image
paths (clear photo, blurred derivative, fetch failure, wrong content type, fake PNG,
too-small PNG). Raw model responses are recorded once and replayed offline, so scoring is
repeatable without additional model calls.

**Two configurations.** All 38 cases were recorded and replayed under
`gemini-3.5-flash-lite` and `gemini-3.1-flash-lite`. That is a configuration check, not a
benchmark: it tests whether both satisfy the same deterministic contract, not which gives
better agricultural advice.

**Live deployment check.** I exercised the deployed application against production Neon
Postgres, production Cloudinary, and live Gemini: signup, login, Yoruba interface, guided
intake, text assessment, real photo upload and image assessment, conversation history,
Hausa switch, safety refusal, and the admin dashboard/review/guidance pages. I also
checked the production database migration state, available Gemini models, and Cloudinary
account access.

**Automated checks.** TypeScript, ESLint, production build, 90 unit tests, and 2
database integration tests.

## Results

- **38/38 synthetic cases passed** the deterministic structural and safety checks under
  both configurations.
- The two models passed the same checks, agreed on uncertainty in **36/38** cases, and
  produced **0/38** byte-identical assessments. This is evidence of contract compliance,
  not a quality ranking.
- **Live farmer journey passed.** A Yoruba text assessment returned all five UC IPM
  citations with publisher, title, URL, and access date. A real 170 KB tomato photo was
  uploaded to Cloudinary and assessed successfully: telemetry event `23`,
  `gemini-3.5-flash-lite`, `latency_ms=4494`, `image_total=1`, `image_failed=0`,
  `validation_outcome=valid`, `outcome=ok`.
- **Admin journey passed** on the live deployment. The dashboard showed real usage and
  telemetry, the review page rendered the audited conversation, and the guidance page
  showed five published source-backed articles.
- **Production configuration passed.** 8 Drizzle migrations applied, all 12 application
  tables present, 5 published guidance articles, the configured Gemini model and
  fallbacks available, and Cloudinary returning HTTP 200.
- **Automated checks passed:** 90/90 unit tests, 2/2 integration tests, clean TypeScript
  and ESLint, and a successful production build.

The evaluation also found real defects, which I fixed and re-tested:

1. A safety suffix containing a digit caused non-English answers to collapse to English.
2. A Yoruba pattern treated a statement of uncertainty as a definite diagnosis.
3. The farmer feedback form sent values the server did not accept, so submissions failed.
4. Live image assessments timed out under the original 20 s limit; the fix (30 s per
   image attempt, 55 s total budget) was re-verified live.

## Limitations

- **No agricultural expert or expert-labelled dataset.** Assessments are preliminary and
  unverified. The project makes no accuracy, sensitivity, or specificity claim.
- **Tomato only.** Other crops are intentionally unsupported until validated.
- **Synthetic evaluation.** The 38/38 result measures structural and safety behaviour on
  synthetic inputs, not diagnostic quality.
- **Guidance is source-backed, not expert-reviewed.** The articles are paraphrased from
  public UC IPM material; no agronomist has signed them off.
- **Translations need native-speaker review.** The four-language interface and term lists
  are functional, but wording and local appropriateness are not validated.
- **Image evidence is thin.** One licensed clear photo and one blurred derivative test
  pipeline behaviour, not disease recognition.
- **Provider quotas** can limit live evaluation and pilot volume on the free tier.
- **Follow-up reminders are in-app only** and time-based, with no SMS, email, or push.
- **Mobile performance** is measured on desktop/dev; low-end device and throttled-network
  profiling remains outstanding.

## What I would do with the fellowship

The next step is not more prompting. It is validation, in this order:

1. **Qualified horticultural review** of the five guidance articles and the safety term
   lists.
2. **Native-speaker review** of the Yoruba, Hausa, and Igbo interface and assessment
   wording.
3. **A small, consented pilot** with farmers, measuring comprehension, usefulness, and
   escalation behaviour — with a clear data-retention and deletion policy.
4. **A properly labelled image set**, reviewed by an agronomist, before any claim about
   image-based recognition.

A fellowship would give me the time, expert access, and field feedback to turn a
technically solid prototype into something that can be evaluated against real farmer
needs — and to publish the results, including the failures, in a form other builders can
reuse.

## Links

- Live application: <https://farm-hack-ai.vercel.app/>
- Repository: <https://github.com/mrseewhy/farm-hack-ai>
- Evaluation report: [`evaluation/report.md`](../evaluation/report.md)
- Technical architecture: [`docs/architecture.md`](architecture.md)
- Case study: [`docs/case-study.md`](case-study.md)
- Screenshot storyboard: [`docs/storyboard/`](storyboard/README.md)
- Validation plan: [`docs/validation-plan.md`](validation-plan.md)
