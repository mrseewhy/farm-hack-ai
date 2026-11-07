# Evaluation harness

A repeatable, offline-scorable way to check that FarmHack AI behaves safely and
honestly on synthetic inputs. It is **not** a measure of diagnostic accuracy —
see [`criteria.md`](./criteria.md) and the "What this rubric does not measure"
section.

## Layout

```
evaluation/
  cases/          Synthetic scenarios (30+), grouped by category
  images/         Permitted image assets + manifest.json with provenance
  criteria.md     The scoring rubric
  lib/scoring.mjs Pure scoring logic (also unit-tested)
  scoring.test.mjs Unit tests for the scorer
  runner.mjs      Drives lib/ai.ts through the real pipeline
  cache/          Recorded raw model responses (record mode)
  runs/           Timestamped run results (JSON)
  loader.mjs      Registers the "@/..." alias for Node
  alias-loader.mjs
```

## Modes

| Mode | Network | Caches | Purpose |
|---|---|---|---|
| `validate` | no | no | Check case files and image asset references |
| `selfcheck` | no | no | Run every case through the pipeline with mock responses (plumbing only) |
| `record` | **yes** | writes | Call the real model once per case, cache the raw response |
| `replay` | no | reads | Score cached responses offline, repeatably |

`replay` is the default. It never calls the model, so it is free and
deterministic — ideal for CI and for reviewers without an API key.

## Commands

```bash
npm run eval:validate   # case + asset sanity check
npm run eval:check      # offline plumbing self-check (mock responses)
npm run eval:record     # call the real model (~1 call per case; mind quota)
npm run eval:replay     # score whatever has been recorded
npm run test:eval       # unit tests for the scoring logic
```

Record a small subset first to respect the model quota. Use `--skip-cached` to
avoid re-spending quota on cases that already have a recorded response:

```bash
npm run eval:record -- --limit 3 --filter safety
npm run eval:record -- --filter typical --skip-cached
```

Compare two configurations (task 13) by recording under different `--config`
names, then diffing the run files:

```bash
GEMINI_MODEL=gemini-3.8-flash npm run eval:record -- --config flash
GEMINI_MODEL=gemini-3.6-flash npm run eval:record -- --config flash-old
npm run eval:replay -- --config flash
npm run eval:replay -- --config flash-old
```

## Quota warning

The Gemini free tier is roughly 20 requests per day per model. A full run of
30+ cases will exhaust it. Record in small batches, or run against a billed
key. The cache makes each recorded response reusable, so quota is spent once.

## Adding cases

Add a JSON object (or array) under `cases/`. Required fields:

```json
{
  "id": "typical-late-blight-en",
  "category": "typical",
  "language": "English",
  "symptoms": "...",
  "images": [],
  "expect": {
    "mustAskFollowUp": true,
    "uncertaintyAtLeast": "medium",
    "mustNotContain": ["glyphosate"],
    "mustContainAny": [],
    "imageIssueNotice": false,
    "noImageIssue": true
  }
}
```

Image cases reference an asset id, never a raw path:

```json
"images": [{ "assetId": "tomato-clear-01" }]
```

The runner resolves ids through `images/manifest.json`. If an asset's `file` is
`null` or missing, the case is **skipped** and the gap is reported — it is never
silently counted as a pass.

## Honesty rules for this harness

- Synthetic results never establish diagnostic accuracy.
- Only call an asset "expert-reviewed" if a qualified expert actually reviewed
  it; otherwise record it as `source-backed` and say so.
- Do not treat a passing run as external validation.
- Record provenance (`source`, `url`, `license`, `accessedAt`) for every image.
