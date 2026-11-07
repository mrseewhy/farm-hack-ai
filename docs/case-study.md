# Case study — FarmHack AI

## The problem

Tomato is a high-value crop across Nigeria, and smallholder growers routinely lose a large share of a harvest to diseases such as late blight, early blight, bacterial wilt, and viral infections. In practice, diagnosis is hard to get: agricultural extension officers are few and far between, telephone advice is scarce, and much of the online material is in English, assumes access to unfamiliar products, or pushes pesticide decisions a farmer cannot safely evaluate.

A farmer with a leaf problem typically has three tools: prior experience, neighbours, and a search engine. None of them is calibrated, localized, or cautious. The result is delayed treatment, over- or misuse of chemicals, and avoidable loss.

FarmHack AI asks a narrower, more honest question than "can an LLM diagnose crop disease?" It asks: **can we build a preliminary, multilingual, evidence-grounded decision-support tool that behaves safely, communicates uncertainty, and can be evaluated reproducibly — even without an expert or a labelled dataset?**

## The solution

A mobile-friendly chat that accepts text and a leaf photo in **English, Yoruba, Hausa, or Igbo** and returns a structured, cautious assessment:

- observed signs,
- possible causes,
- follow-up questions to narrow the problem,
- suggested actions,
- when to seek local help,
- an explicit uncertainty level,
- and a plain-language limitations notice.

Behind that interface is a pipeline built for safety and observability rather than confident answers: server-side evidence assembly, Zod-validated output with a repair attempt, a multilingual safety audit, a no-evidence policy, a per-user rate limit, and privacy-conscious telemetry.

An admin workspace supports the human side: usage metrics, AI telemetry, a review queue of uncertain assessments, and a guidance library whose entries must be labelled `source_backed` or `expert_reviewed` and cannot be published without provenance.

## Key engineering decisions

**1. Structured output is non-negotiable.** The model must return JSON matching a Zod schema. Invalid output is repaired once, then fails closed to a safe fallback. This turns an unpredictable text generator into a typed, inspectable component.

**2. Evidence is derived server-side.** The model never trusts client-supplied text or image URLs. The exact evidence used is reconstructed from stored records, so a caller cannot inject a diagnosis prompt or a spoofed image.

**3. Safety filtering is multilingual and fail-closed.** Pesticide names, dosages, and definite-diagnosis claims are removed or refused in all four languages, and the filtered output is audited again. Under limited human review, false positives (removing harmless content) are preferred over false negatives (letting harmful content through).

**4. Grounding is traceable, and provenance is never oversold.** Five public UC IPM tomato references are seeded as `source_backed` with publisher, title, URL, access date, and licence. The publication gate keeps `source_backed` strictly distinct from `expert_reviewed`; no article is currently expert-reviewed, and the prompt says so plainly.

**5. Evaluation comes before claims.** A 38-case synthetic harness exercises typical scenarios, safety refusals in all four languages, ambiguity, cross-language answers, diagnosis bait, out-of-scope requests, and six image-handling paths. Raw responses are recorded once and scored offline, so results are reproducible without additional model calls.

**6. Observability is built in.** Every attempt writes an `ai_events` row — model, prompt version, validation outcome, fallback/error state, latency, image-failure count, safety-flag count — with no farmer text or images. Failure modes are visible in production, not only in a terminal.

## Evidence and results

The full write-up is in [`../evaluation/report.md`](../evaluation/report.md). Highlights, with the scope warning attached:

- **38/38 synthetic cases** passed the deterministic checks under `gemini-3.5-flash-lite`.
- **17-case configuration check**: `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite` both passed all 17 shared safety/ambiguity/image cases with identical uncertainty levels; the two models phrased every assessment differently while staying inside the same contract. The full 38-case comparison was blocked by free-tier quota.
- **Image handling is evaluated end to end**: a licensed CC0 photo, a documented blurred derivative, three invalid payloads rejected before analysis, and a deterministic fetch-failure fixture.
- **Two real bugs were found and fixed** by the evaluation itself: a safety suffix whose digit caused non-English answers to collapse to English, and a Yoruba pattern that treated a statement of uncertainty as a definite diagnosis.
- **A farmer-journey test found a third bug**: the outcome-feedback form sent `yes`/`no` while the server expected `helped`/`not_helped`, so every submission failed validation. The mapping is now a tested pure function.

These are **technical and safety results**, not accuracy results. A case "passing" means the pipeline met its structural and safety contract, not that the agricultural advice was correct or locally appropriate.

## What "done" looks like, honestly

This is a **tested prototype**, not a validated product. The work distinguishes three things that are easy to conflate:

| Claim | Status |
| --- | --- |
| The pipeline is structured, safe-by-contract, observable, and reproducible on synthetic inputs. | Supported by tests and recorded runs. |
| The advice is agronomically correct or locally appropriate. | **Not established.** No expert, no labelled dataset. |
| The interface is usable and consistent in four languages. | Verified in a local farmer-journey test; wording still needs native-speaker review. |

## What a reviewer should take from this

- I built and ran a reproducible AI evaluation harness, and it found real defects — including one introduced by the safety layer penalising its own output.
- I treat trust boundaries (evidence derivation, upload validation, admin authorization) as core product behaviour, not afterthoughts.
- I separate what the system can demonstrate from what it cannot, and I write the limitations down instead of hiding them.
- I found and fixed a live farmer-facing bug by testing the actual journey, not just the happy path.

## Next steps

See [`validation-plan.md`](./validation-plan.md). In short: qualified horticultural review of the guidance and term lists, a small consented pilot, native-speaker review of the four languages, and a real (expert-labelled) image set — in that order.
