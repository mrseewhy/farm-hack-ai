// Tests for the per-user AI assessment limit policy.
//
// Run with: npm run test:rate-limit
//
// The policy is deliberately tiny but security-relevant: a malformed env value
// must never disable the limit, and the boundary must be inclusive.

import test from "node:test";
import assert from "node:assert/strict";

import {
  ASSESSMENT_WINDOW_MS,
  DEFAULT_DAILY_ASSESSMENT_LIMIT,
  MAX_CONFIGURABLE_LIMIT,
  assessmentWindowStart,
  dailyAssessmentLimit,
  isDailyAssessmentLimitReached,
} from "../lib/rate-limit.ts";

test("the default limit applies when the env var is absent or blank", () => {
  assert.equal(dailyAssessmentLimit({}), DEFAULT_DAILY_ASSESSMENT_LIMIT);
  assert.equal(
    dailyAssessmentLimit({ AI_MAX_ASSESSMENTS_PER_DAY: "   " }),
    DEFAULT_DAILY_ASSESSMENT_LIMIT
  );
});

test("a valid env override is used", () => {
  assert.equal(
    dailyAssessmentLimit({ AI_MAX_ASSESSMENTS_PER_DAY: "5" }),
    5
  );
});

test("malformed, zero, negative, and oversized values are clamped", () => {
  assert.equal(
    dailyAssessmentLimit({ AI_MAX_ASSESSMENTS_PER_DAY: "not-a-number" }),
    DEFAULT_DAILY_ASSESSMENT_LIMIT
  );
  assert.equal(
    dailyAssessmentLimit({ AI_MAX_ASSESSMENTS_PER_DAY: "0" }),
    1
  );
  assert.equal(
    dailyAssessmentLimit({ AI_MAX_ASSESSMENTS_PER_DAY: "-10" }),
    1
  );
  assert.equal(
    dailyAssessmentLimit({ AI_MAX_ASSESSMENTS_PER_DAY: "999999" }),
    MAX_CONFIGURABLE_LIMIT
  );
});

test("the limit is reached at the boundary, not below it", () => {
  assert.equal(isDailyAssessmentLimitReached(4, 5), false);
  assert.equal(isDailyAssessmentLimitReached(5, 5), true);
  assert.equal(isDailyAssessmentLimitReached(6, 5), true);
});

test("the rolling window starts exactly 24 hours before now", () => {
  const now = Date.UTC(2026, 10, 7, 12, 0, 0);
  assert.equal(
    assessmentWindowStart(now).getTime(),
    now - ASSESSMENT_WINDOW_MS
  );
});