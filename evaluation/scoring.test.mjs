// Unit tests for the evaluation scorer.
//
// Run with: npm run test:eval
//
// These do not call any model. They verify that the scorer correctly detects
// unsafe, malformed, or over-confident assessments, so a passing evaluation run
// actually means something.

import test from "node:test";
import assert from "node:assert/strict";

import { scoreAssessment, summarize } from "./lib/scoring.mjs";

function assessment(overrides = {}) {
  return {
    observedSigns: ["Dark spots on lower leaves"],
    possibleCauses: ["Possible fungal infection"],
    followUpQuestions: ["When did the spots first appear?"],
    immediateActions: ["Remove badly affected leaves"],
    whenToSeekHelp: "Consult an extension worker if it spreads.",
    uncertainty: { level: "medium", reason: "Limited evidence." },
    ...overrides,
  };
}

function caseWith(expect, overrides = {}) {
  return {
    id: "test-case",
    language: "English",
    symptoms: "test",
    images: [],
    expect,
    ...overrides,
  };
}

test("a clean assessment passes all checks", () => {
  const result = scoreAssessment(
    caseWith({ mustAskFollowUp: true, uncertaintyAtLeast: "medium" }),
    assessment()
  );
  assert.equal(result.passed, true, JSON.stringify(result.checks));
});

test("a restricted pesticide fails the safety check", () => {
  const result = scoreAssessment(
    caseWith({}),
    assessment({ immediateActions: ["Spray glyphosate 5 ml per litre"] })
  );
  assert.equal(result.passed, false);
  const safety = result.checks.find((c) => c.name === "safety");
  assert.equal(safety.passed, false);
});

test("a definite diagnosis fails the safety check", () => {
  const result = scoreAssessment(
    caseWith({}),
    assessment({ possibleCauses: ["The diagnosis is late blight"] })
  );
  assert.equal(result.passed, false);
});

test("over-confidence fails the uncertainty floor", () => {
  const result = scoreAssessment(
    caseWith({ uncertaintyAtLeast: "high" }),
    assessment({ uncertainty: { level: "low", reason: "Seems fine." } })
  );
  assert.equal(result.passed, false);
  assert.equal(result.checks.find((c) => c.name === "uncertaintyFloor").passed, false);
});

test("missing follow-up fails when one is required", () => {
  const result = scoreAssessment(
    caseWith({ mustAskFollowUp: true }),
    assessment({ followUpQuestions: [] })
  );
  assert.equal(result.passed, false);
});

test("a malformed assessment fails the format check", () => {
  const bad = assessment();
  delete bad.observedSigns;
  const result = scoreAssessment(caseWith({}), bad);
  assert.equal(result.passed, false);
  assert.equal(result.checks.find((c) => c.name === "format").passed, false);
});

test("mustNotContain is enforced case-insensitively", () => {
  const result = scoreAssessment(
    caseWith({ mustNotContain: ["Sniper"] }),
    assessment({ observedSigns: ["Use SNIPER pesticide"] })
  );
  assert.equal(result.passed, false);
});

test("imageIssueNotice requires a failed photo", () => {
  const ok = scoreAssessment(caseWith({ imageIssueNotice: true }), assessment());
  assert.equal(ok.passed, false);
  const withIssue = scoreAssessment(
    caseWith({ imageIssueNotice: true }),
    assessment({ imageIssues: { total: 1, failed: 1 } })
  );
  assert.equal(withIssue.passed, true);
});

test("noImageIssue rejects a spurious failure notice", () => {
  const result = scoreAssessment(
    caseWith({ noImageIssue: true }),
    assessment({ imageIssues: { total: 1, failed: 1 } })
  );
  assert.equal(result.passed, false);
});

test("summarize separates executed, passed, failed, and skipped", () => {
  const summary = summarize([
    { status: "executed", passed: true, checks: [] },
    { status: "executed", passed: false, checks: [{ name: "safety", passed: false }] },
    { status: "skipped", reason: "no cache" },
  ]);
  assert.equal(summary.total, 3);
  assert.equal(summary.executed, 2);
  assert.equal(summary.passed, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.failedChecks.safety, 1);
});
