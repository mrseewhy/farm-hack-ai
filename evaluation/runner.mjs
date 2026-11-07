// Evaluation runner for FarmHack AI crop assessments.
//
// Modes:
//   validate   Check that case files parse and their image assets resolve.
//   selfcheck  Run every case through the real pipeline with mock model
//              responses. Proves the harness plumbing works with no API calls.
//   record     Call the real model once per case and cache the raw response.
//   replay     Score cached responses offline. Repeatable and free.
//
// Usage (see package.json scripts):
//   node --env-file-if-exists=.env --import ./evaluation/loader.mjs \
//     --experimental-strip-types evaluation/runner.mjs --mode replay
//
// Runs are written to evaluation/runs/<timestamp>-<mode>-<config>.json.
// Recorded raw model responses live in evaluation/cache/<config>.json.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assessCropHealth,
  generateRawAssessment,
  MODEL_NAME,
} from "../lib/ai.ts";
import { scoreAssessment, summarize } from "./lib/scoring.mjs";

const EVAL_DIR = dirname(fileURLToPath(import.meta.url));
const CASES_DIR = join(EVAL_DIR, "cases");
const CACHE_DIR = join(EVAL_DIR, "cache");
const RUNS_DIR = join(EVAL_DIR, "runs");
const MANIFEST_PATH = join(EVAL_DIR, "images", "manifest.json");

const MODES = ["validate", "selfcheck", "record", "replay"];

function parseArgs(argv) {
  const args = { mode: "replay", config: "default", filter: null, limit: null, skipCached: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--skip-cached") {
      args.skipCached = true;
      continue;
    }
    const [flag, inlineValue] = arg.includes("=")
      ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]
      : [arg, null];
    const value = inlineValue ?? argv[++i];
    if (flag === "--mode") args.mode = value;
    else if (flag === "--config") args.config = value;
    else if (flag === "--filter") args.filter = value;
    else if (flag === "--limit") args.limit = Number(value);
  }
  return args;
}

function loadCases() {
  const files = readdirSync(CASES_DIR).filter((name) => name.endsWith(".json"));
  const cases = [];
  for (const file of files) {
    const parsed = JSON.parse(readFileSync(join(CASES_DIR, file), "utf8"));
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of list) {
      cases.push({ ...item, __file: file });
    }
  }
  return cases;
}

function loadManifest() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  return new Map((manifest.assets ?? []).map((asset) => [asset.id, asset]));
}

function extToMime(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function toDataUrl(filePath, mime) {
  const bytes = readFileSync(filePath);
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/**
 * Turn a case's image references into { secureUrl } entries. Returns the list
 * of missing asset ids so the caller can skip the case and report the gap.
 */
function buildImages(refs, assets) {
  const missing = [];
  const images = [];
  for (const ref of refs) {
    const asset = assets.get(ref.assetId);
    if (!asset || !asset.file) {
      missing.push(ref.assetId);
      continue;
    }
    const filePath = join(EVAL_DIR, asset.file);
    if (!existsSync(filePath)) {
      missing.push(`${ref.assetId} (${asset.file} not found)`);
      continue;
    }
    images.push({
      secureUrl: toDataUrl(filePath, asset.mime ?? extToMime(filePath)),
    });
  }
  return { images, missing };
}

/** A safe mock response for selfcheck mode. Not a model-quality test. */
function mockAssessment() {
  return {
    observedSigns: ["Synthetic observation for harness self-check"],
    possibleCauses: ["Synthetic possible cause"],
    followUpQuestions: ["Could you share more detail or a clearer photo?"],
    immediateActions: ["Consult a local agricultural extension worker."],
    whenToSeekHelp: "Consult a local agricultural extension worker if it spreads.",
    uncertainty: { level: "high", reason: "Synthetic self-check response." },
  };
}

function validateCases(cases, assets) {
  const problems = [];
  const seenIds = new Set();
  for (const caze of cases) {
    const where = `${caze.__file}:${caze.id ?? "(no id)"}`;
    if (!caze.id) problems.push(`${where}: missing id`);
    if (seenIds.has(caze.id)) problems.push(`${where}: duplicate id`);
    seenIds.add(caze.id);
    if (typeof caze.symptoms !== "string") {
      problems.push(`${where}: symptoms must be a string`);
    }
    if (typeof caze.language !== "string" || !caze.language) {
      problems.push(`${where}: missing language`);
    }
    if (!caze.expect || typeof caze.expect !== "object") {
      problems.push(`${where}: missing expect object`);
    }
    for (const ref of caze.images ?? []) {
      if (!assets.has(ref.assetId)) {
        problems.push(`${where}: unknown image asset "${ref.assetId}"`);
      }
    }
  }
  return problems;
}

function readCache(file) {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function printSummary(args, summary, results, runPath) {
  console.log("");
  console.log(`FarmHack AI evaluation - mode=${args.mode} config=${args.config}`);
  console.log(
    `  executed=${summary.executed} passed=${summary.passed} failed=${summary.failed} skipped=${summary.skipped} (of ${summary.total})`
  );
  for (const result of results) {
    if (result.status === "executed" && !result.passed) {
      const failed = result.checks
        .filter((check) => !check.passed)
        .map((check) => check.detail ? `${check.name} (${check.detail})` : check.name);
      console.log(`  FAIL ${result.id}: ${failed.join("; ")}`);
    }
    if (result.status === "skipped") {
      console.log(`  SKIP ${result.id}: ${result.reason}`);
    }
    if (result.status === "error") {
      console.log(`  ERROR ${result.id}: ${result.reason}`);
    }
  }
  if (Object.keys(summary.failedChecks).length > 0) {
    console.log("  failed checks:", summary.failedChecks);
  }
  if (args.mode === "selfcheck") {
    console.log("  NOTE: selfcheck uses mock responses; it validates plumbing only.");
  }
  console.log(`  run written to ${runPath}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!MODES.includes(args.mode)) {
    throw new Error(`Unknown --mode "${args.mode}". Use one of: ${MODES.join(", ")}`);
  }

  const cases = loadCases();
  const assets = loadManifest();

  if (args.mode === "validate") {
    const problems = validateCases(cases, assets);
    console.log(`Cases found: ${cases.length}`);
    console.log(`Image assets defined: ${assets.size}`);
    const withAssets = cases.filter((c) => (c.images ?? []).length > 0);
    console.log(`Cases that need image assets: ${withAssets.length}`);
    if (problems.length > 0) {
      console.log("Problems:");
      for (const problem of problems) console.log(`  - ${problem}`);
      process.exitCode = 1;
    } else {
      console.log("All case files and asset references are valid.");
    }
    return;
  }

  let selected = cases;
  if (args.filter) {
    selected = selected.filter((c) => c.id.includes(args.filter));
  }
  if (Number.isFinite(args.limit)) {
    selected = selected.slice(0, args.limit);
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(RUNS_DIR, { recursive: true });

  const cacheFile = join(CACHE_DIR, `${args.config}.json`);
  const cache = readCache(cacheFile);
  const results = [];

  for (const caze of selected) {
    const { images, missing } = buildImages(caze.images ?? [], assets);
    if (missing.length > 0) {
      results.push({
        id: caze.id,
        status: "skipped",
        reason: `missing image asset(s): ${missing.join(", ")}`,
      });
      continue;
    }

    let responder;
    let recorded = null;
    if (args.mode === "replay") {
      const cached = cache[caze.id];
      if (!cached) {
        results.push({
          id: caze.id,
          status: "skipped",
          reason: "no cached response - run --mode record first",
        });
        continue;
      }
      responder = async () => ({ text: cached.raw, model: cached.model });
    } else if (args.mode === "record") {
      if (args.skipCached && cache[caze.id]) {
        results.push({
          id: caze.id,
          status: "skipped",
          reason: "already cached",
        });
        continue;
      }
      responder = async (contents, options) => {
        const raw = await generateRawAssessment(contents, options);
        recorded = {
          caseId: caze.id,
          model: raw.model,
          raw: raw.text,
          recordedAt: new Date().toISOString(),
        };
        return raw;
      };
    } else {
      responder = async () => ({
        text: JSON.stringify(mockAssessment()),
        model: "selfcheck-mock",
      });
    }

    let outcome;
    try {
      outcome = await assessCropHealth({
        symptoms: caze.symptoms,
        images,
        language: caze.language,
        generateRaw: responder,
      });
    } catch (error) {
      results.push({
        id: caze.id,
        status: "error",
        reason: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (recorded) cache[caze.id] = recorded;
    const score = scoreAssessment(caze, outcome.assessment);
    results.push({
      id: caze.id,
      status: "executed",
      passed: score.passed,
      model: outcome.model,
      assessment: outcome.assessment,
      checks: score.checks,
    });
  }

  if (args.mode === "record") {
    writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runPath = join(RUNS_DIR, `${timestamp}-${args.mode}-${args.config}.json`);
  const summary = summarize(results);
  writeFileSync(
    runPath,
    JSON.stringify(
      {
        mode: args.mode,
        config: args.config,
        model: MODEL_NAME,
        note:
          args.mode === "selfcheck"
            ? "Self-check uses mock responses; validates harness plumbing only, not model quality."
            : undefined,
        generatedAt: new Date().toISOString(),
        summary,
        results,
      },
      null,
      2
    )
  );

  printSummary(args, summary, results, runPath);

  if (summary.failed > 0 || results.some((r) => r.status === "error")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
