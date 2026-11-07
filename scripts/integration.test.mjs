// Integration test: assessment telemetry end to end.
//
// Run with: npm run test:integration
//
// This is opt-in and never runs as part of `npm test`, because it talks to the
// real database configured by DATABASE_URL. It is skipped unless
// RUN_DB_INTEGRATION=1 is set, so an ordinary test run cannot touch data.
//
// What it proves:
//   - the real `assessCropHealth` pipeline produces the expected telemetry
//     (clean vs. safety-filtered) with no network call;
//   - the shared `aiEventToRow` mapping inserts cleanly into the real
//     `ai_events` table through Drizzle;
//   - the exact aggregate query used by `getAiTelemetrySummary` reads the
//     expected deltas back;
//   - a conversation, its user message, assistant reply, assessment link, and
//     AI event behave correctly under the real constraints (unique assessment
//     per message, owner-scoped reads, cascade delete, and telemetry
//     `on delete set null`);
//   - the whole thing runs inside a transaction that is rolled back, so no
//     rows are left behind.
//
// It does NOT drive the auth-gated `runAssessment` server action: a
// `"use server"` module must not export an injectable helper, so the row
// mapping was extracted to a shared module precisely so it can be tested here
// without weakening the action's access control.

import test from "node:test";
import assert from "node:assert/strict";

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { assessCropHealth } from "@/lib/ai";
import { buildAiEvent } from "@/lib/monitoring";
import { aiEventToRow } from "@/lib/data/ai-event-row";
import {
  aiEvents,
  assessments,
  conversations,
  messages,
} from "@/lib/data/dal/schema";

const ENABLED = process.env.RUN_DB_INTEGRATION === "1";
const HAS_DB = Boolean(process.env.DATABASE_URL);
const SKIP = !ENABLED
  ? "set RUN_DB_INTEGRATION=1 to run this database integration test"
  : !HAS_DB
    ? "DATABASE_URL is not set"
    : false;

function cleanRawResponse() {
  return JSON.stringify({
    observedSigns: ["Lower leaves are turning yellow"],
    possibleCauses: ["Possible nutrient deficiency"],
    followUpQuestions: ["When did the yellowing start?"],
    immediateActions: ["Remove the most affected leaves"],
    whenToSeekHelp: "Consult an extension worker if it spreads.",
    uncertainty: { level: "low", reason: "Clear early-stage signs." },
  });
}

function filteredRawResponse() {
  return JSON.stringify({
    observedSigns: ["Whiteflies on the undersides of leaves"],
    possibleCauses: ["Possible whitefly infestation"],
    followUpQuestions: ["Are the insects on the tops or undersides of the leaves?"],
    // "Sniper" is on the restricted list, so the safety layer must remove this.
    immediateActions: ["Spray Sniper to kill the whiteflies."],
    whenToSeekHelp: "Consult an extension worker if it spreads.",
    uncertainty: { level: "low", reason: "Insects are visible." },
  });
}

async function runPipeline(rawText) {
  return assessCropHealth({
    symptoms: "There are small insects on my tomato leaves.",
    images: [],
    language: "English",
    generateRaw: async () => ({ text: rawText, model: "integration-test-model" }),
  });
}

async function aggregate(executor) {
  const result = await executor.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE outcome = 'ok')::int AS ok,
      count(*) FILTER (WHERE outcome = 'filtered')::int AS filtered,
      count(*) FILTER (WHERE outcome = 'fallback')::int AS fallback,
      count(*) FILTER (WHERE outcome = 'error')::int AS error,
      coalesce(sum(safety_flag_count), 0)::int AS safety_flag_total,
      coalesce(sum(image_failed), 0)::int AS image_failure_total
    FROM ai_events
  `);
  const row = result.rows[0];
  const num = (value) => Number(value ?? 0);
  return {
    total: num(row.total),
    ok: num(row.ok),
    filtered: num(row.filtered),
    fallback: num(row.fallback),
    error: num(row.error),
    safetyFlagTotal: num(row.safety_flag_total),
    imageFailureTotal: num(row.image_failure_total),
  };
}

test(
  "assessment telemetry persists and is queryable, then rolls back",
  { skip: SKIP },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle(pool);
    let insertedIds = [];

    try {
      // 1. Run the real pipeline (no network) and check the telemetry contract.
      const clean = await runPipeline(cleanRawResponse());
      assert.equal(clean.telemetry.outcome, "ok");
      assert.equal(clean.telemetry.validationOutcome, "valid");
      assert.equal(clean.telemetry.safetyFlagCount, 0);

      const filtered = await runPipeline(filteredRawResponse());
      assert.equal(filtered.telemetry.outcome, "filtered");
      assert.equal(filtered.telemetry.validationOutcome, "valid");
      assert.ok(
        filtered.telemetry.safetyFlagCount >= 1,
        "restricted pesticide text should raise at least one safety flag"
      );

      // 2. Build the three event kinds and map them exactly as production does.
      const events = [
        buildAiEvent(clean.telemetry),
        buildAiEvent({
          ...filtered.telemetry,
          imageTotal: 1,
          imageFailed: 1,
        }),
        buildAiEvent({
          eventType: "assessment",
          modelRequested: "gemini-3.8-flash",
          modelUsed: null,
          fallbackAttempts: 3,
          fallbackUsed: true,
          latencyMs: 4000,
          validationOutcome: "invalid",
          outcome: "error",
        }),
      ];
      const rows = events.map((event) => aiEventToRow(event, null));

      // 3. Persist and query inside a transaction, then deliberately roll back.
      const SENTINEL = new Error("intentional rollback");
      let txError;
      try {
        await db.transaction(async (tx) => {
          const before = await aggregate(tx);

          const inserted = await tx
            .insert(aiEvents)
            .values(rows)
            .returning({ id: aiEvents.id });
          insertedIds = inserted.map((row) => row.id);
          assert.equal(insertedIds.length, 3);

          const after = await aggregate(tx);
          assert.equal(after.total - before.total, 3);
          assert.equal(after.ok - before.ok, 1);
          assert.equal(after.filtered - before.filtered, 1);
          assert.equal(after.error - before.error, 1);
          assert.equal(after.fallback - before.fallback, 0);
          assert.equal(after.safetyFlagTotal - before.safetyFlagTotal, 1);
          assert.equal(after.imageFailureTotal - before.imageFailureTotal, 1);

          // Round-trip one row to prove the schema stores what we mapped.
          const [stored] = await tx
            .select()
            .from(aiEvents)
            .where(eq(aiEvents.id, insertedIds[1]))
            .limit(1);
          assert.equal(stored.outcome, "filtered");
          assert.equal(stored.safetyFlagCount, 1);
          assert.equal(stored.imageFailed, 1);
          assert.equal(stored.imageTotal, 1);
          assert.equal(stored.modelUsed, "integration-test-model");

          // The admin "recent issues" query must surface our non-clean rows.
          const recent = await tx
            .select({ id: aiEvents.id })
            .from(aiEvents)
            .where(ne(aiEvents.outcome, "ok"))
            .orderBy(desc(aiEvents.createdAt))
            .limit(10);
          const recentIds = new Set(recent.map((row) => row.id));
          assert.ok(recentIds.has(insertedIds[1]));
          assert.ok(recentIds.has(insertedIds[2]));

          throw SENTINEL;
        });
      } catch (error) {
        txError = error;
      }

      if (txError !== SENTINEL) {
        if (txError) throw txError;
        throw new Error("transaction did not roll back: sentinel was not thrown");
      }

      // 4. Confirm the rollback left nothing behind.
      const leftover = await db
        .select({ id: aiEvents.id })
        .from(aiEvents)
        .where(inArray(aiEvents.id, insertedIds));
      assert.equal(leftover.length, 0, "rolled-back rows must not persist");
    } finally {
      await pool.end();
    }
  }
);

test(
  "assessment links, ownership scoping, and cascades hold, then roll back",
  { skip: SKIP },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const db = drizzle(pool);

    try {
      const SENTINEL = new Error("intentional rollback");
      let txError;

      try {
        await db.transaction(async (tx) => {
          const [conversation] = await tx
            .insert(conversations)
            .values({
              userId: "integration-owner-a",
              title: "Integration conversation",
              language: "English",
            })
            .returning();

          const [otherConversation] = await tx
            .insert(conversations)
            .values({
              userId: "integration-owner-b",
              title: "Another farmer",
              language: "Yoruba",
            })
            .returning();

          const [question] = await tx
            .insert(messages)
            .values({
              conversationId: conversation.id,
              role: "user",
              content: "My tomato leaves have dark spots.",
              language: "English",
              status: "sent",
            })
            .returning();

          const [reply] = await tx
            .insert(messages)
            .values({
              conversationId: conversation.id,
              role: "assistant",
              content: "Possible early blight; consult an extension worker.",
              language: "English",
              status: "sent",
            })
            .returning();

          const [assessment] = await tx
            .insert(assessments)
            .values({
              conversationId: conversation.id,
              messageId: question.id,
              assistantMessageId: reply.id,
              structuredResult: JSON.stringify({
                observedSigns: [],
                possibleCauses: [],
                followUpQuestions: [],
                immediateActions: [],
                whenToSeekHelp: "Consult an extension worker.",
                uncertainty: { level: "high", reason: "Integration test." },
              }),
              model: "integration-test-model",
            })
            .returning();

          // The explicit link is stored and readable.
          const [stored] = await tx
            .select()
            .from(assessments)
            .where(eq(assessments.id, assessment.id))
            .limit(1);
          assert.equal(stored.assistantMessageId, reply.id);
          assert.equal(stored.messageId, question.id);

          // Owner-scoped reads cannot see another farmer's conversation.
          const owned = await tx
            .select({ id: conversations.id })
            .from(conversations)
            .where(
              and(
                eq(conversations.id, conversation.id),
                eq(conversations.userId, "integration-owner-a")
              )
            );
          assert.equal(owned.length, 1);

          const notOwned = await tx
            .select({ id: conversations.id })
            .from(conversations)
            .where(
              and(
                eq(conversations.id, conversation.id),
                eq(conversations.userId, "integration-owner-b")
              )
            );
          assert.equal(notOwned.length, 0);
          assert.notEqual(otherConversation.id, conversation.id);

          // The one-assessment-per-message constraint is enforced. Use a
          // savepoint so the failed insert does not abort the outer transaction.
          await assert.rejects(
            tx.transaction(async (savepoint) => {
              await savepoint.insert(assessments).values({
                conversationId: conversation.id,
                messageId: question.id,
                assistantMessageId: reply.id,
                structuredResult: "{}",
                model: "duplicate-test",
              });
            }),
            (error) => {
              const candidate = error;
              return (
                candidate?.code === "23505" ||
                candidate?.cause?.code === "23505"
              );
            }
          );

          // Telemetry survives conversation deletion with a null link.
          const [event] = await tx
            .insert(aiEvents)
            .values({
              conversationId: conversation.id,
              promptVersion: "integration",
              modelRequested: "integration-test-model",
            })
            .returning();

          // Deleting the conversation cascades to messages and assessments.
          await tx
            .delete(conversations)
            .where(eq(conversations.id, conversation.id));

          const leftoverMessages = await tx
            .select({ id: messages.id })
            .from(messages)
            .where(eq(messages.conversationId, conversation.id));
          assert.equal(leftoverMessages.length, 0);

          const leftoverAssessments = await tx
            .select({ id: assessments.id })
            .from(assessments)
            .where(eq(assessments.conversationId, conversation.id));
          assert.equal(leftoverAssessments.length, 0);

          const [survivingEvent] = await tx
            .select()
            .from(aiEvents)
            .where(eq(aiEvents.id, event.id))
            .limit(1);
          assert.equal(survivingEvent.conversationId, null);

          throw SENTINEL;
        });
      } catch (error) {
        txError = error;
      }

      if (txError !== SENTINEL) {
        if (txError) throw txError;
        throw new Error("transaction did not roll back: sentinel was not thrown");
      }
    } finally {
      await pool.end();
    }
  }
);
