# FarmHack AI: Product Improvement Roadmap

**Context:** No agricultural expert or validated agricultural dataset is currently available. The goal is to develop a reliable, testable AI decision-support prototype, not claim verified disease-diagnosis accuracy.

**Objectives:** Useful AI functionality, responsible AI engineering, measurable technical performance, practical farmer experience, and a credible path to agricultural validation.

## Phase 1: Strengthen the existing AI system

- [ ] **1. Fix assessment retry and message-linking issues.** End result: Each assessment maps reliably to the correct conversation and AI reply.
- [ ] **2. Validate AI responses with Zod.** End result: Invalid or incomplete outputs are rejected or safely recovered.
- [ ] **3. Strengthen multilingual safety filtering.** End result: Unsafe advice is blocked or escalated in English, Yoruba, Hausa, and Igbo.
- [ ] **4. Detect failed or unusable image inputs.** End result: Farmers are explicitly told when an image could not be examined.
- [ ] **5. Implement per-user AI request limits.** End result: Reduced abuse and controlled Gemini API costs.
- [ ] **6. Add structured AI error monitoring.** End result: Track failures, latency, fallback usage, and safety flags.
- [ ] **7. Add automated tests for critical workflows.** End result: Authentication, authorization, and assessment regressions are caught early.

**Phase end result:** A more secure, predictable, and resilient multimodal AI pipeline.

## Phase 2: Evaluate without an existing dataset

- [ ] **8. Create 25–40 synthetic text-based scenarios.** End result: Repeatable tests for farmer questions, ambiguous symptoms, and unsafe requests.
- [ ] **9. Assemble a small permitted image-test collection.** End result: Documented healthy, symptomatic, blurry, and unrelated images with appropriate permissions and provisional labels.
- [ ] **10. Define evaluation criteria.** End result: Clear measures for format compliance, uncertainty, safety, and image handling.
- [ ] **11. Build an automated evaluation runner.** End result: Repeatable tests across prompts and model configurations.
- [ ] **12. Store evaluation results.** End result: Every run records model, prompt version, outcome, latency, and errors.
- [ ] **13. Compare two AI configurations.** End result: Evidence of changes in measurable technical behavior.
- [ ] **14. Produce an evaluation report.** End result: Reproducible benchmark, failure examples, and explicit limitations.

**Constraint:** Synthetic cases can test technical behavior and some safety properties, but cannot establish agricultural diagnostic accuracy. Treat unverified image labels as provisional.

**Phase end result:** A repeatable AI evaluation framework without pretending to have expert-labelled data.

## Phase 3: Improve agricultural grounding

- [ ] **15. Gather public agricultural guidance from reputable sources.** End result: Traceable tomato crop-care references.
- [ ] **16. Record source metadata and licensing.** End result: Publisher, title, URL, date, and permitted usage for every reference.
- [ ] **17. Create a source-backed knowledge library.** End result: Admin-managed guidance accurately labelled as source-backed, not expert-reviewed.
- [ ] **18. Implement relevant guidance retrieval.** End result: The model receives relevant evidence rather than every stored article.
- [ ] **19. Add citations to farmer responses.** End result: Farmers can inspect sources behind suggested actions.
- [ ] **20. Add a no-evidence response policy.** End result: The assistant asks clarifying questions or recommends local help when evidence is insufficient.

**Constraint:** Without an expert, never equate administrator publication with agricultural expert approval. Keep source-backed and expert-reviewed statuses distinct.

**Phase end result:** A traceable, grounded assistant that relies less on unsupported model-generated advice.

## Phase 4: Improve the farmer experience

- [ ] **21. Add guided symptom collection.** End result: Simple questions for farmers who cannot describe symptoms in detail.
- [ ] **22. Improve photo capture guidance.** End result: Clear instructions for useful plant photos.
- [ ] **23. Display structured assessment cards.** End result: Easy-to-read observations, possible causes, actions, and uncertainty.
- [ ] **24. Add follow-up reminders within conversations.** End result: Farmers can return and report changes in symptoms.
- [ ] **25. Improve mobile performance.** End result: Usability on inexpensive smartphones and slow networks.
- [ ] **26. Improve language consistency.** End result: Interface and AI responses follow the selected language consistently.
- [ ] **27. Add a clear limitations notice.** End result: Farmers understand the advice is preliminary, not a confirmed diagnosis.

**Phase end result:** A practical farmer-facing tool rather than a generic chatbot.

## Phase 5: Monitoring and continuous improvement

- [ ] **28. Track privacy-conscious aggregate usage metrics.** End result: Visibility into adoption, successful assessments, and failures.
- [ ] **29. Create an AI quality dashboard.** End result: Monitor failures, safety flags, latency, and feedback.
- [ ] **30. Add assessment feedback.** End result: Farmers can report unhelpful or potentially incorrect recommendations.
- [ ] **31. Create an incident-review workflow.** End result: Unsafe responses can be flagged, investigated, and corrected.
- [ ] **32. Add prompt versioning.** End result: Every assessment can be associated with the instructions that generated it.
- [ ] **33. Document privacy and retention.** End result: Defined policies for storing and deleting farmer photos and conversations.

**Phase end result:** A system that can be monitored and improved as usage grows.

## Phase 6: Research and portfolio presentation

- [ ] **34. Write a technical architecture document.** End result: Clear explanation of multimodal inference, retrieval, safety, and data flow.
- [ ] **35. Create an experiment report.** End result: Hypotheses, tests, failures, improvements, and findings.
- [ ] **36. Write a project case study.** End result: A compelling, evidence-based account of the Nigerian agricultural problem and the proposed solution.
- [ ] **37. Record a demonstration video.** End result: Farmer journey, image assessment, safety handling, and admin review shown end to end.
- [ ] **38. Rewrite the GitHub README.** End result: Reviewers can quickly understand the problem, solution, architecture, evaluation, and limitations.
- [ ] **39. Document future validation requirements.** End result: A clear plan for expert review, validated datasets, and field pilots before broad agricultural deployment.

**Phase end result:** A credible applied-AI engineering case study for applications and interviews.

## Priority checklist: November 6–11, 2026

The deadline is close. Prioritize demonstrable reliability and evaluation over expanding the feature set.

- [ ] Fix assessment and image-handling issues.
- [ ] Validate structured AI responses.
- [ ] Strengthen multilingual safety.
- [ ] Create 25–40 synthetic evaluation cases.
- [ ] Build an automated evaluation runner.
- [ ] Run and document two AI configurations.
- [ ] Collect a small set of public agricultural references.
- [ ] Implement source-backed guidance with clear provenance.
- [ ] Add no-evidence handling.
- [ ] Write the technical report and README.
- [ ] Record a working product demonstration.

### Suggested schedule

| Date | Focus | Deliverable |
| --- | --- | --- |
| Nov 6–7 | Reliability and evaluation design | Critical fixes, test cases, scoring criteria |
| Nov 8 | Safety and testing | Safety tests, failure handling, automated runner |
| Nov 9 | Language and grounding | Language test results, sourced guidance |
| Nov 10 | Documentation | Evaluation report, README, architecture and limitations |
| Nov 11 | Final verification and application | Verified demo and application submission |

## Definition of a successful prototype

1. **AI engineering:** Multimodal input, structured outputs, contextual retrieval, uncertainty handling, and documented experiments.
2. **Responsible AI:** Safety checks, human escalation, traceable guidance, and clear limitations.
3. **Measurable technical performance:** Reproducible tests for safety-rule compliance, output validity, latency, and failure handling, without unsupported accuracy claims.
4. **Real-world relevance:** A mobile-friendly, multilingual assistant designed for Nigerian farmers.

## Scope and validation boundaries

- Keep **tomatoes as the only supported crop** until validation is possible.
- Do not claim clinical or agricultural diagnostic accuracy from synthetic tests or unverified image labels.
- Do not call guidance **expert-reviewed** unless an appropriately qualified expert has actually reviewed it.
- Do not present the product as a replacement for agricultural extension workers.
- Document unknowns, unsuccessful experiments, and outstanding risks honestly.
- Before real-world agricultural deployment, obtain qualified expert review, suitable labelled data, and field feedback.

**Target outcome:** A working AI prototype with reproducible experiments, defensible safeguards, documented limitations, and a clear path to real-world validation.
