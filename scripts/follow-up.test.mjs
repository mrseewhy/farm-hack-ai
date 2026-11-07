// Tests for the follow-up feedback vocabulary mapping.
//
// Run with: npm run test:follow-up
//
// The chat UI asks a yes/no/unsure question, but the follow_ups.outcome column
// and the recordFollowUp server schema accept helped/not_helped/unsure. A
// mismatch here silently fails every submission, so pin the mapping down.

import test from "node:test";
import assert from "node:assert/strict";

import { helpfulToOutcome } from "../lib/follow-up.ts";

test("yes maps to helped", () => {
  assert.equal(helpfulToOutcome("yes"), "helped");
});

test("no maps to not_helped", () => {
  assert.equal(helpfulToOutcome("no"), "not_helped");
});

test("unsure maps to unsure", () => {
  assert.equal(helpfulToOutcome("unsure"), "unsure");
});

test("unknown answers fall back to unsure rather than an invalid value", () => {
  assert.equal(helpfulToOutcome(""), "unsure");
  assert.equal(helpfulToOutcome("maybe"), "unsure");
});

test("every mapped value is accepted by the persisted outcome vocabulary", () => {
  const allowed = new Set(["helped", "not_helped", "unsure"]);
  for (const answer of ["yes", "no", "unsure", "", "garbage"]) {
    assert.ok(allowed.has(helpfulToOutcome(answer)));
  }
});
