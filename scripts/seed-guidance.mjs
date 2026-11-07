// Opt-in seed for the curated source-backed guidance collection.
//
// The prototype has no qualified agricultural expert, so this collection is
// deliberately *source-backed*: paraphrased from the cited UC IPM guidelines.
// The script refuses to publish anything that fails the provenance gate in
// `lib/guidance.ts` (publisher, title, and resolvable URL required).
//
// Usage (run from the repo root):
//   node --env-file-if-exists=.env --experimental-strip-types scripts/seed-guidance.mjs
//   node --env-file-if-exists=.env --experimental-strip-types scripts/seed-guidance.mjs --publish
//
// Without --publish the articles are inserted/updated as drafts. With it they
// are published and become available to the AI assessment pipeline.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

import { validatePublication, normalizeProvenance } from "../lib/guidance.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const collectionPath = path.resolve(here, "../content/guidance/uc-ipm-tomato.json");
const publish = process.argv.includes("--publish");

/** Join an array field into the single text column the schema uses. */
function joined(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean).join("\n");
  }
  return String(value ?? "").trim();
}

async function main() {
  const raw = JSON.parse(await readFile(collectionPath, "utf8"));
  const articles = Array.isArray(raw.articles) ? raw.articles : [];
  if (articles.length === 0) {
    throw new Error(`No articles found in ${collectionPath}`);
  }

  const prepared = articles.map((a) => ({
    crop: a.crop ?? "tomato",
    problem: String(a.problem ?? "").trim(),
    signs: joined(a.signs),
    distinguishingQuestions: joined(a.distinguishingQuestions),
    approvedActions: joined(a.approvedActions),
    version: a.version ?? "1.0",
    provenance: normalizeProvenance(a.provenance ?? raw.provenance),
    sourcePublisher: a.sourcePublisher ?? raw.publisher ?? null,
    sourceTitle: a.sourceTitle ?? null,
    sourceUrl: a.sourceUrl ?? null,
    sourceLicense: a.sourceLicense ?? raw.license ?? null,
    sourceAccessedAt: a.sourceAccessedAt ?? raw.accessedAt ?? null,
  }));

  // Pre-flight the provenance gate so a bad collection can never be published.
  if (publish) {
    for (const a of prepared) {
      const errors = validatePublication(a);
      if (errors.length > 0) {
        throw new Error(`Refusing to publish "${a.problem}": ${errors.join(" ")}`);
      }
    }
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let inserted = 0;
  let updated = 0;

  try {
    await client.query("BEGIN");

    for (const a of prepared) {
      const status = publish ? "published" : "draft";
      const existing = await client.query(
        `SELECT id FROM knowledge_articles
         WHERE crop = $1 AND problem = $2 AND version = $3
         ORDER BY id DESC LIMIT 1`,
        [a.crop, a.problem, a.version]
      );

      if (existing.rows.length > 0) {
        await client.query(
          `UPDATE knowledge_articles SET
             signs = $1,
             distinguishing_questions = $2,
             approved_actions = $3,
             status = $4,
             provenance = $5,
             source_publisher = $6,
             source_title = $7,
             source_url = $8,
             source_license = $9,
             source_accessed_at = $10,
             updated_at = now()
           WHERE id = $11`,
          [
            a.signs,
            a.distinguishingQuestions,
            a.approvedActions,
            status,
            a.provenance,
            a.sourcePublisher,
            a.sourceTitle,
            a.sourceUrl,
            a.sourceLicense,
            a.sourceAccessedAt,
            existing.rows[0].id,
          ]
        );
        updated += 1;
      } else {
        await client.query(
          `INSERT INTO knowledge_articles
             (crop, problem, signs, distinguishing_questions, approved_actions,
              status, version, provenance, source_publisher, source_title,
              source_url, source_license, source_accessed_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            a.crop,
            a.problem,
            a.signs,
            a.distinguishingQuestions,
            a.approvedActions,
            status,
            a.version,
            a.provenance,
            a.sourcePublisher,
            a.sourceTitle,
            a.sourceUrl,
            a.sourceLicense,
            a.sourceAccessedAt,
          ]
        );
        inserted += 1;
      }
    }

    await client.query("COMMIT");
    console.log(
      `Guidance seed complete: ${inserted} inserted, ${updated} updated, status=${
        publish ? "published" : "draft"
      }.`
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Guidance seed failed:", error.message);
  process.exit(1);
});
