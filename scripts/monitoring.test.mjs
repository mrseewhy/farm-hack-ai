// Tests for the AI monitoring event builder.
//
// Run with: npm run test:monitoring
//
// The event builder is the boundary between transient model behaviour and the
// metrics table, so it must never emit an unbounded, negative, or content-bearing
// record. These tests need no database or API key.

import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAiEvent,
  serializeAiEvent,
  toLogRecord,
  PROMPT_VERSION,
  logAiEvent,
} from "../lib/monitoring.ts";
import { aiEventToRow } from "../lib/data/ai-event-row.ts";

test("buildAiEvent fills defaults for an empty input", () => {
  const event = buildAiEvent();
  assert.equal(event.eventType, "assessment");
  assert.equal(event.promptVersion, PROMPT_VERSION);
  assert.equal(event.modelRequested, "unknown");
  assert.equal(event.modelUsed, null);
  assert.equal(event.fallbackUsed, false);
  assert.equal(event.fallbackAttempts, 1);
  assert.equal(event.latencyMs, 0);
  assert.equal(event.safetyFlagCount, 0);
  assert.equal(event.imageTotal, 0);
  assert.equal(event.imageFailed, 0);
  assert.equal(event.validationOutcome, "valid");
  assert.equal(event.outcome, "ok");
  assert.match(event.occurredAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("buildAiEvent clamps negative and oversized numbers", () => {
  const event = buildAiEvent({
    latencyMs: -50,
    safetyFlagCount: 999_999_999,
    fallbackAttempts: 1000,
  });
  assert.equal(event.latencyMs, 0);
  assert.equal(event.safetyFlagCount, 10_000);
  assert.equal(event.fallbackAttempts, 50);
});

test("buildAiEvent clamps non-numeric values to safe fallbacks", () => {
  const event = buildAiEvent({
    latencyMs: Number.NaN,
    safetyFlagCount: "not-a-number",
    imageTotal: undefined,
  });
  assert.equal(event.latencyMs, 0);
  assert.equal(event.safetyFlagCount, 0);
  assert.equal(event.imageTotal, 0);
});

test("buildAiEvent enforces failed images <= total images", () => {
  const event = buildAiEvent({ imageTotal: 2, imageFailed: 5 });
  assert.equal(event.imageTotal, 2);
  assert.equal(event.imageFailed, 2);
});

test("buildAiEvent infers fallbackUsed from attempts and model drift", () => {
  assert.equal(buildAiEvent({ fallbackAttempts: 1 }).fallbackUsed, false);
  assert.equal(buildAiEvent({ fallbackAttempts: 2 }).fallbackUsed, true);
  assert.equal(
    buildAiEvent({
      modelRequested: "gemini-3.8-flash",
      modelUsed: "gemini-3.5-flash-lite",
      fallbackAttempts: 1,
    }).fallbackUsed,
    true
  );
});

test("buildAiEvent honours an explicit fallbackUsed flag", () => {
  const event = buildAiEvent({ fallbackUsed: true, fallbackAttempts: 1 });
  assert.equal(event.fallbackUsed, true);
});

test("buildAiEvent rejects unknown enum values", () => {
  const event = buildAiEvent({
    outcome: "exploded",
    validationOutcome: "maybe",
  });
  assert.equal(event.outcome, "ok");
  assert.equal(event.validationOutcome, "valid");
});

test("buildAiEvent truncates and trims long labels", () => {
  const event = buildAiEvent({
    modelRequested: "  " + "x".repeat(500) + "  ",
    promptVersion: "",
  });
  assert.equal(event.modelRequested.length, 120);
  assert.equal(event.promptVersion, PROMPT_VERSION);
});

test("buildAiEvent normalises timestamps and falls back on invalid ones", () => {
  assert.equal(
    buildAiEvent({ occurredAt: "2026-01-02T03:04:05.000Z" }).occurredAt,
    "2026-01-02T03:04:05.000Z"
  );
  assert.match(buildAiEvent({ occurredAt: "nonsense" }).occurredAt, /^\d{4}-/);
});

test("serializeAiEvent round-trips without adding content", () => {
  const event = buildAiEvent({
    modelRequested: "gemini-3.8-flash",
    modelUsed: "gemini-3.6-flash",
    fallbackAttempts: 2,
    latencyMs: 1234,
    safetyFlagCount: 3,
    imageTotal: 2,
    imageFailed: 1,
    validationOutcome: "recovered",
    outcome: "filtered",
  });
  const parsed = JSON.parse(serializeAiEvent(event));
  assert.deepEqual(parsed, event);
  // No field should carry farmer text or model output.
  const keys = Object.keys(parsed);
  assert.ok(!keys.includes("symptoms"));
  assert.ok(!keys.includes("raw"));
  assert.ok(!keys.includes("content"));
});

test("toLogRecord tags events so logs can be filtered", () => {
  const record = toLogRecord(buildAiEvent({ outcome: "error" }));
  assert.equal(record.type, "ai_event");
  assert.equal(record.outcome, "error");
});

test("logAiEvent writes a single JSON line", () => {
  const originals = { log: console.log, error: console.error };
  const captured = [];
  console.log = (line) => captured.push(["log", line]);
  console.error = (line) => captured.push(["error", line]);
  try {
    logAiEvent(buildAiEvent({ outcome: "ok" }));
    logAiEvent(buildAiEvent({ outcome: "error" }));
  } finally {
    console.log = originals.log;
    console.error = originals.error;
  }
  assert.equal(captured.length, 2);
  assert.equal(captured[0][0], "log");
  assert.equal(captured[1][0], "error");
  for (const [, line] of captured) {
    const parsed = JSON.parse(line);
    assert.equal(parsed.type, "ai_event");
  }
});

test("aiEventToRow maps every field and carries no farmer content", () => {
  const event = buildAiEvent({
    modelRequested: "gemini-3.8-flash",
    modelUsed: "gemini-3.5-flash-lite",
    fallbackAttempts: 2,
    latencyMs: 1500,
    safetyFlagCount: 1,
    imageTotal: 2,
    imageFailed: 1,
    validationOutcome: "valid",
    outcome: "filtered",
  });
  const row = aiEventToRow(event, 42);
  assert.equal(row.conversationId, 42);
  assert.equal(row.eventType, "assessment");
  assert.equal(row.promptVersion, PROMPT_VERSION);
  assert.equal(row.modelRequested, "gemini-3.8-flash");
  assert.equal(row.modelUsed, "gemini-3.5-flash-lite");
  assert.equal(row.fallbackUsed, true);
  assert.equal(row.fallbackAttempts, 2);
  assert.equal(row.latencyMs, 1500);
  assert.equal(row.safetyFlagCount, 1);
  assert.equal(row.imageTotal, 2);
  assert.equal(row.imageFailed, 1);
  assert.equal(row.validationOutcome, "valid");
  assert.equal(row.outcome, "filtered");
  assert.equal(row.createdAt.toISOString(), event.occurredAt);
  assert.ok(!("symptoms" in row));
  assert.ok(!("raw" in row));
});

test("aiEventToRow accepts a null conversation id", () => {
  const row = aiEventToRow(buildAiEvent(), null);
  assert.equal(row.conversationId, null);
});
