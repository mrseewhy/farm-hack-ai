# FarmHack AI: Product Improvement Roadmap

**Context:** No agricultural expert or validated agricultural dataset is currently available. The goal is a reliable, testable AI decision-support prototype, not a claim of verified disease-diagnosis accuracy.

**Objectives:** Useful AI functionality, responsible AI engineering, measurable technical performance, practical farmer experience, and a credible path to agricultural validation.

**Status legend:** `[x]` verified done · `[~]` partial · `[ ]` not done / blocked. Each line cites the evidence used to decide.

**Verified:** 2026-11-07. See [`evaluation/report.md`](./evaluation/report.md), [`docs/architecture.md`](./docs/architecture.md), and [`docs/validation-plan.md`](./docs/validation-plan.md).

## Phase 1: Strengthen the existing AI system

- [x] **1. Fix assessment retry and message-linking issues.** Assessments link to their source message and assistant reply (`assessments.message_id`, `assistant_message_id`), one assessment per message; failed uploads roll back the unsaved message while keeping the draft and photo. Covered by the opt-in DB integration tests. A separate feedback-vocabulary bug was found and fixed during farmer testing (see item 30).
- [x] **2. Validate AI responses with Zod.** `lib/ai.ts` validates against a Zod schema, repairs once, then fails closed to a safe fallback. Covered by the monitoring and integration tests.
- [x] **3. Strengthen multilingual safety filtering.** `lib/safety.ts` removes/refuses pesticide names, dosages, and definite-diagnosis claims in English, Yoruba, Hausa, and Igbo; `scripts/safety.test.mjs` has 27 tests including the multilingual cases.
- [x] **4. Detect failed or unusable image inputs.** `lib/image.ts` verifies file signatures; unreachable/invalid images are counted and reported. Six evaluation image cases cover clear, blurry, fetch-failure, wrong content type, fake PNG, and too-small PNG.
- [x] **5. Implement per-user AI request limits.** `lib/rate-limit.ts`; `AI_MAX_ASSESSMENTS_PER_DAY` (default 20, clamped to [1,500]); 5 tests in `scripts/rate-limit.test.mjs`.
- [x] **6. Add structured AI error monitoring.** `lib/monitoring.ts` writes `ai_events` (model, prompt version, validation outcome, fallback/error, latency, image/safety flags); 14 monitoring tests; surfaced in the admin telemetry summary.
- [x] **7. Add automated tests for critical workflows.** `npm test` runs 72 tests (safety, monitoring, guidance, rate-limit, follow-up, eval scoring); `npm run test:integration` adds two rolled-back DB tests for auth/ownership/linking.

**Phase end result:** Met. The pipeline is structured, safe by contract, observable, and tested.

## Phase 2: Evaluate without an existing dataset

- [x] **8. Create 25–40 synthetic text-based scenarios.** 38 cases in `evaluation/cases/*.json`.
- [x] **9. Assemble a small permitted image-test collection.** `evaluation/images/manifest.json` records provenance, licence (CC0 Wikimedia Commons photo by Scot Nelson), source URL, and access date for the clear photo, its blurred derivative, and the invalid/fetch-failure fixtures.
- [x] **10. Define evaluation criteria.** `evaluation/criteria.md` covers format, safety, escalation, uncertainty, follow-up, and image handling.
- [x] **11. Build an automated evaluation runner.** `evaluation/runner.mjs` with `validate`, `record`, `replay`, and `selfcheck` modes.
- [x] **12. Store evaluation results.** Runs in `evaluation/runs/*.json` record model, prompt version, outcome, latency, and errors; raw responses cached per configuration.
- [~] **13. Compare two AI configurations.** 17 shared cases compared (`gemini-3.5-flash-lite` vs `gemini-3.1-flash-lite`), both 17/17 with identical uncertainty. The full 38-case comparison was blocked by free-tier quota (3.6/3.8 returned 429). Documented in the report.
- [x] **14. Produce an evaluation report.** `evaluation/report.md` includes method, results, image evaluation, the comparison, ten findings, and explicit limitations.

**Phase end result:** Met, with the comparison explicitly scoped as a 17-case check rather than a benchmark.

## Phase 3: Improve agricultural grounding

- [x] **15. Gather public agricultural guidance from reputable sources.** Five UC IPM tomato references in `content/guidance/uc-ipm-tomato.json`.
- [x] **16. Record source metadata and licensing.** Each row records publisher, title, URL, access date, and licence.
- [x] **17. Create a source-backed knowledge library.** Admin guidance workflow with `draft → in_review → published`; `lib/guidance.ts` gates publication and keeps `source_backed` distinct from `expert_reviewed`. All published rows are `source_backed`; none are `expert_reviewed`.
- [x] **18. Implement relevant guidance retrieval.** Assessments receive only guidance matching the conversation's crop.
- [ ] **19. Add citations to farmer responses.** **Not done.** Guidance URLs are given to the model in the prompt but are not rendered as a citation block in the farmer UI. Documented as an open limitation.
- [x] **20. Add a no-evidence response policy.** `lib/safety.ts` `applyEvidencePolicy` + `safeFallbackAssessment`, with evaluation cases.

**Phase end result:** Met except farmer-facing citations (item 19).

## Phase 4: Improve the farmer experience

- [~] **21. Add guided symptom collection.** The assistant returns follow-up questions and asks clarifying questions when evidence is thin; there is no dedicated step-by-step intake wizard.
- [x] **22. Improve photo capture guidance.** Photo tips (whole plant, close-up, lighting) in all four languages.
- [x] **23. Display structured assessment cards.** `components/app/chat-screen.tsx` renders signs, causes, questions, actions, escalation, uncertainty, and the limitations notice.
- [~] **24. Add follow-up reminders within conversations.** Farmers can submit outcome feedback on an assessment (`follow_ups`) and the assistant asks follow-up questions; there is no scheduled reminder to return.
- [~] **25. Improve mobile performance.** Responsive layout, `h-dvh`, safe-area insets, and a mobile history drawer are implemented; performance is not benchmarked on a low-end device or throttled network (the browser tooling cannot emulate a device).
- [x] **26. Improve language consistency.** Fixed UI copy in four languages, persisted account preference, and chat/assessment rendering verified live for English, Yoruba, Hausa, and Igbo.
- [x] **27. Add a clear limitations notice.** `limitationsNotice` in all four languages, rendered under each assessment.

**Phase end result:** Met for the core tool; items 21, 24, and 25 remain partial and documented.

## Phase 5: Monitoring and continuous improvement

- [x] **28. Track privacy-conscious aggregate usage metrics.** `getAdminOverview` aggregates farmers, conversations, crop reports, and needs-review counts; `ai_events` carries no farmer text, prompts, output, or image URLs.
- [x] **29. Create an AI quality dashboard.** `/admin/dashboard` shows the usage metrics, the AI telemetry summary (ok/filtered/fallback/error), and the review queue.
- [x] **30. Add assessment feedback.** `follow_ups` + `recordFollowUp`; a yes/no/unsure-to-helped/not_helped/unsure mapping bug was found live and fixed, with a new `scripts/follow-up.test.mjs` (5 tests).
- [~] **31. Create an incident-review workflow.** A review queue surfaces uncertain assessments and admins can open an audited conversation review; admin actions are recorded in `admin_audit_events`. There is no explicit dedicated "unsafe flagged" triage state beyond the queue.
- [x] **32. Add prompt versioning.** `PROMPT_VERSION = "assessment-v2"` is stored on assessments and `ai_events`.
- [x] **33. Document privacy and retention.** A Privacy and retention section was added to `README.md`: what is stored, cascade-deletion and Cloudinary cleanup, telemetry scope, admin auditing, and an explicit statement that this is a prototype policy needing a formal retention period before deployment.

**Phase end result:** Met for monitoring; incident review is basic and honest about it.

## Phase 6: Research and portfolio presentation

- [x] **34. Write a technical architecture document.** `docs/architecture.md` (system diagram, request path, data model, trust boundaries, gaps).
- [x] **35. Create an experiment report.** `evaluation/report.md`.
- [x] **36. Write a project case study.** `docs/case-study.md`.
- [~] **37. Record a demonstration video.** A full shot list and narration are in `docs/demo-walkthrough.md`; no video file is committed, and the walkthrough was exercised live rather than recorded.
- [x] **38. Rewrite the GitHub README.** `README.md` now covers the problem, features, stack, architecture, AI/safety, evaluation, environment, operations, privacy, and limitations.
- [x] **39. Document future validation requirements.** `docs/validation-plan.md` (required reviews, pilot protocol, measurement, and gates).

**Phase end result:** Met except a recorded video file.

## Priority checklist: November 6–11, 2026

- [x] Fix assessment and image-handling issues.
- [x] Validate structured AI responses.
- [x] Strengthen multilingual safety.
- [x] Create 25–40 synthetic evaluation cases.
- [x] Build an automated evaluation runner.
- [~] Run and document two AI configurations (17-case check; full run quota-blocked).
- [x] Collect a small set of public agricultural references.
- [x] Implement source-backed guidance with clear provenance.
- [x] Add no-evidence handling.
- [x] Write the technical report and README.
- [~] Record a working product demonstration (script and live walkthrough; no video file).

## Definition of a successful prototype

1. **AI engineering:** Multimodal input, structured outputs, contextual retrieval, uncertainty handling, and documented experiments. ✅
2. **Responsible AI:** Safety checks, human escalation, traceable guidance, and clear limitations. ✅ (citations to the farmer still outstanding)
3. **Measurable technical performance:** Reproducible tests for safety-rule compliance, output validity, latency, and failure handling, without unsupported accuracy claims. ✅
4. **Real-world relevance:** A mobile-friendly, multilingual assistant designed for Nigerian farmers. ✅ (usability and language review still pending)

## Scope and validation boundaries

- Keep **tomatoes as the only supported crop** until validation is possible.
- Do not claim clinical or agricultural diagnostic accuracy from synthetic tests or unverified image labels.
- Do not call guidance **expert-reviewed** unless an appropriately qualified expert has actually reviewed it.
- Do not present the product as a replacement for agricultural extension workers.
- Document unknowns, unsuccessful experiments, and outstanding risks honestly.
- Before real-world agricultural deployment, obtain qualified expert review, suitable labelled data, and field feedback.

**Target outcome:** A working AI prototype with reproducible experiments, defensible safeguards, documented limitations, and a clear path to real-world validation.
