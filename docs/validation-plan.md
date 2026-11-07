# Validation plan — from prototype to responsible field use

FarmHack AI is a prototype. Nothing in this repository justifies using it as a diagnostic or treatment authority in the field. This document states what must be true before that changes, in the order the work should happen.

## What the prototype does and does not demonstrate

**Demonstrated (technical / safety):**
- the pipeline returns a structured, validated assessment or fails closed;
- restricted pesticide/dosage and definite-diagnosis language is refused in English, Yoruba, Hausa, and Igbo;
- weak or missing evidence yields high uncertainty and human escalation;
- image pipelines detect and report unreadable, failed, or invalid images;
- guidance can only be published with recorded provenance;
- the same input set reproduces the same scored results offline.

**Not demonstrated:**
- that the advice is agronomically correct, complete, or locally appropriate;
- that the system recognises diseases from photos;
- that the Yoruba/Hausa/Igbo wording and safety term lists are linguistically correct;
- real-world usability, trust, or outcomes.

Synthetic cases can test behaviour. Only people and field data can test usefulness.

## Required before any field pilot

1. **Qualified agricultural review.** A named, qualified tomato/plant-pathology expert reviews:
   - the five seeded UC IPM summaries and any others added;
   - the suggested-action and escalation logic;
   - the multilingual safety term lists.
   Reviewed items become `expert_reviewed` with a named reviewer and date; anything else stays `source_backed`.
2. **Native-speaker review of all four languages.** A fluent speaker per language checks the fixed UI copy, the model prompts, and the safety term lists for correctness and register, and signs off or files corrections.
3. **A consented pilot cohort and protocol.** Recruit a small, informed, consenting group of farmers; define what data is stored and for how long; include a way to report harm and to withdraw.
4. **An incident process.** Adopt the review queue as a triage inbox: define who reviews flagged/uncertain assessments, how quickly, and how corrections reach the guidance library and prompt.
5. **A real image set.** Assemble expert-labelled, consented, in-field photos (healthy, diseased, blurry, poor-light, unrelated) and measure image behaviour against them. Until then, image evaluation is pipeline coverage only.

## Measurement for the pilot

- **Safety:** count of restricted-content refusals and any that escaped; target zero escapes.
- **Uncertainty calibration:** how often `low` uncertainty advice later proved wrong; this is the key accuracy proxy until labelled data exists.
- **Escalation:** share of cases correctly routed to a local extension worker.
- **Language quality:** reviewer rating per language, and rate of English leakage into localized answers.
- **Farmer outcome:** self-reported improvement or failure via the existing follow-up feedback.
- **Reliability:** fallback/error rate, latency, and image-failure rate from `ai_events`.

Do **not** report a pass rate on the synthetic set as an accuracy figure.

## Gates

| Gate | Required to pass |
| --- | --- |
| Guidance published to farmers | Expert review of every published article; provenance fields complete |
| Broader pilot | Native-speaker sign-off on the four languages; consented protocol; incident process live |
| Any accuracy claim | Expert-labelled image/text set and a measured, pre-registered evaluation |
| Expansion beyond tomato | Crop-specific reviewed guidance and a passing crop-specific evaluation |

## Open limitations carried forward

- Guidance citations are rendered as source-backed references, not expert review; every published article still needs qualified review.
- Guided intake is suggestion-based, and reminders are in-app only; neither replaces a clinical intake or a reminder channel.
- Mobile performance is measured on desktop/dev; low-end device and throttled-network profiling is still required.
- Free-tier model quota constrains live evaluation and pilot volume; billing is required for scale.
