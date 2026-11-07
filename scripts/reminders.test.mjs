// Tests for the follow-up reminder policy.
//
// Run with: npm run test:reminders
//
// The reminder window is a policy decision with explicit bounds. These tests
// pin the default, the clamping behaviour, and the due calculation so a
// misconfigured environment cannot silently disable or spam reminders.

import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_FOLLOW_UP_REMINDER_HOURS,
  MIN_FOLLOW_UP_REMINDER_HOURS,
  MAX_FOLLOW_UP_REMINDER_HOURS,
  parseReminderHours,
  followUpReminderHours,
  reminderCutoff,
  isReminderDue,
  reminderDaysElapsed,
} from "../lib/reminders.ts";

test("the default window is 48 hours", () => {
  assert.equal(DEFAULT_FOLLOW_UP_REMINDER_HOURS, 48);
});

test("parseReminderHours falls back to the default for missing or junk values", () => {
  assert.equal(parseReminderHours(undefined), DEFAULT_FOLLOW_UP_REMINDER_HOURS);
  assert.equal(parseReminderHours(""), DEFAULT_FOLLOW_UP_REMINDER_HOURS);
  assert.equal(parseReminderHours("not-a-number"), DEFAULT_FOLLOW_UP_REMINDER_HOURS);
  assert.equal(parseReminderHours(NaN), DEFAULT_FOLLOW_UP_REMINDER_HOURS);
  assert.equal(parseReminderHours(Infinity), DEFAULT_FOLLOW_UP_REMINDER_HOURS);
});

test("parseReminderHours reads strings and clamps to the safe range", () => {
  assert.equal(parseReminderHours("72"), 72);
  assert.equal(parseReminderHours(1.4), 1);
  assert.equal(parseReminderHours(0), MIN_FOLLOW_UP_REMINDER_HOURS);
  assert.equal(parseReminderHours(-5), MIN_FOLLOW_UP_REMINDER_HOURS);
  assert.equal(parseReminderHours(10 ** 6), MAX_FOLLOW_UP_REMINDER_HOURS);
});

test("followUpReminderHours reads AI_FOLLOW_UP_REMINDER_HOURS", () => {
  assert.equal(followUpReminderHours({}), DEFAULT_FOLLOW_UP_REMINDER_HOURS);
  assert.equal(
    followUpReminderHours({ AI_FOLLOW_UP_REMINDER_HOURS: "24" }),
    24
  );
});

test("reminderCutoff subtracts whole hours", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");
  assert.equal(
    reminderCutoff(now, 48).toISOString(),
    "2026-11-05T12:00:00.000Z"
  );
});

test("isReminderDue only fires once the assessment is older than the window", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");
  assert.equal(isReminderDue(new Date("2026-11-07T00:00:00.000Z"), now, 48), false);
  assert.equal(isReminderDue(new Date("2026-11-05T12:00:00.000Z"), now, 48), true);
  assert.equal(isReminderDue(new Date("2026-11-01T12:00:00.000Z"), now, 48), true);
});

test("reminderDaysElapsed is floored and never negative", () => {
  const now = new Date("2026-11-07T12:00:00.000Z");
  assert.equal(reminderDaysElapsed(new Date("2026-11-05T12:00:00.000Z"), now), 2);
  assert.equal(reminderDaysElapsed(new Date("2026-11-07T06:00:00.000Z"), now), 0);
  assert.equal(reminderDaysElapsed(new Date("2026-11-08T12:00:00.000Z"), now), 0);
});
