// Tests for error sanitization.
//
// Run with: npm run test:errors
//
// A malformed server-action payload must never surface a raw Zod issue list,
// JSON dump, or stack frame to a farmer. These tests pin both halves of the
// policy: the server-side parse wrapper and the client-side display guard.

import test from "node:test";
import assert from "node:assert/strict";

import {
  parseInput,
  isUnsafeErrorMessage,
  safeErrorMessage,
} from "../lib/errors.ts";

// A tiny stand-in for a Zod schema, so the test needs no dependency.
const schema = {
  parse(input) {
    if (typeof input !== "string" || !input.length) {
      const error = new Error(
        JSON.stringify([{ code: "too_small", path: ["input"], minimum: 1 }])
      );
      throw error;
    }
    return input.trim();
  },
};

test("parseInput returns the parsed value on success", () => {
  assert.equal(parseInput(schema, "  hello  ", "Nope"), "hello");
});

test("parseInput converts a validation failure into the friendly message", () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.throws(
      () => parseInput(schema, "", "Could not save your message. Please try again."),
      (error) => {
        assert.equal(error.message, "Could not save your message. Please try again.");
        // The raw issue dump must not survive into the thrown error.
        assert.doesNotMatch(error.message, /too_small/);
        assert.doesNotMatch(error.message, /\{/);
        return true;
      }
    );
  } finally {
    console.error = originalError;
  }
});

test("safeErrorMessage strips raw Zod validation text", () => {
  const raw = new Error(
    '[\n  {\n    "code": "invalid_type",\n    "expected": "string",\n    "received": "number"\n  }\n]'
  );
  assert.equal(safeErrorMessage(raw, "Something went wrong."), "Something went wrong.");
});

test("safeErrorMessage strips stack frames and schema jargon", () => {
  assert.equal(
    safeErrorMessage(new Error("ZodError: invalid input"), "Fallback"),
    "Fallback"
  );
  assert.equal(
    safeErrorMessage(
      new Error("TypeError: boom\n    at Object.<anonymous> (/app/lib/x.ts:1:2)"),
      "Fallback"
    ),
    "Fallback"
  );
  assert.equal(
    safeErrorMessage(
      new Error("An error occurred in the Server Components render. The specific message is omitted in production."),
      "Fallback"
    ),
    "Fallback"
  );
});

test("safeErrorMessage keeps short, friendly product copy", () => {
  assert.equal(
    safeErrorMessage(
      new Error("Daily AI assessment limit reached. Please try again later."),
      "Fallback"
    ),
    "Daily AI assessment limit reached. Please try again later."
  );
  assert.equal(
    safeErrorMessage("Could not save your message. Please try again.", "Fallback"),
    "Could not save your message. Please try again."
  );
});

test("safeErrorMessage falls back for empty, non-error, and oversized values", () => {
  assert.equal(safeErrorMessage(undefined, "Fallback"), "Fallback");
  assert.equal(safeErrorMessage(new Error(""), "Fallback"), "Fallback");
  assert.equal(safeErrorMessage("x".repeat(400), "Fallback"), "Fallback");
});

test("isUnsafeErrorMessage treats long strings as internal", () => {
  assert.equal(isUnsafeErrorMessage(""), true);
  assert.equal(isUnsafeErrorMessage("All good."), false);
  assert.equal(isUnsafeErrorMessage("a".repeat(301)), true);
});
