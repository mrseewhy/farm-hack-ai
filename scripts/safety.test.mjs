// Deterministic safety and image-validation tests.
//
// Run with: npm run test:safety
//
// These tests exercise the pure logic modules that back the AI pipeline. They
// need no database, network, or API key, so they can run on every commit —
// which matters because the project currently has minimal human review. The
// safety layer is fail-closed: if one of these tests fails, the pipeline may
// leak restricted content.
//
// Note: Node's type stripping only removes types; it does not resolve the
// "@/..." alias. Only import modules that avoid runtime alias imports.

import test from "node:test";
import assert from "node:assert/strict";

import {
  applyEvidencePolicy,
  applySafeguards,
  collectFlags,
  finalAudit,
  safeFallbackAssessment,
  SAFE_HELP_FALLBACK,
} from "../lib/safety.ts";
import {
  isImageContentType,
  looksLikeImage,
  sniffImageMimeType,
} from "../lib/image.ts";
import { assessmentResultSchema } from "../lib/data/validation/assessment.ts";

/** A minimal, fully-valid assessment used as a base in most tests. */
function baseAssessment(overrides = {}) {
  return {
    observedSigns: ["Yellowing leaves"],
    possibleCauses: ["Possible nutrient deficiency"],
    followUpQuestions: ["When did the yellowing start?"],
    immediateActions: ["Remove affected leaves"],
    whenToSeekHelp: "Consult an extension worker if it spreads.",
    uncertainty: { level: "low", reason: "Clear early-stage signs." },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// collectFlags
// ---------------------------------------------------------------------------

test("collectFlags detects English restricted pesticides and dosages", () => {
  const flags = collectFlags("Apply 5 ml per litre of glyphosate", "English");
  assert.ok(flags.some((f) => f.includes("glyphosate")));
  assert.ok(flags.length >= 2, `expected dose + pesticide, got ${flags}`);
});

test("collectFlags detects transliterated product names", () => {
  const flags = collectFlags("Spray with Sniper to kill pests", "English");
  assert.ok(flags.some((f) => f.toLowerCase().includes("sniper")));
});

test("collectFlags detects localized chemical terms per language", () => {
  assert.ok(
    collectFlags("Lo kemikali lori ọgbin", "Yoruba").some((f) =>
      f.toLowerCase().includes("kemikali")
    )
  );
  assert.ok(
    collectFlags("Yi amfani da sinadari", "Hausa").some((f) =>
      f.toLowerCase().includes("sinadari")
    )
  );
  assert.ok(
    collectFlags("Jiri kemikal mee ihe", "Igbo").some((f) =>
      f.toLowerCase().includes("kemikal")
    )
  );
});

test("collectFlags treats any number in a non-English response as unsafe", () => {
  const flags = collectFlags("Fi 2 ṣe é", "Yoruba");
  assert.ok(flags.some((f) => f.includes("numeric quantity")));
});

test("collectFlags does not flag plain numbers in English", () => {
  const flags = collectFlags("You have 2 plants in this bed", "English");
  assert.equal(flags.length, 0, `unexpected flags: ${flags}`);
});

test("collectFlags only checks diagnosis when asked", () => {
  const text = "The diagnosis is early blight";
  assert.equal(collectFlags(text, "English").length, 0);
  assert.ok(
    collectFlags(text, "English", { includeDiagnosis: true }).length > 0
  );
});

test("collectFlags detects localized definite-diagnosis phrasing", () => {
  assert.ok(
    collectFlags("ọrịa ahụ bụ early blight", "Igbo", {
      includeDiagnosis: true,
    }).length > 0
  );
});

test("collectFlags does not flag uncertainty-positive Yoruba phrasing", () => {
  const safe = [
    "A kò lè sọ dájú lórí ìdí rẹ̀",
    "A kò rí ìdí dídájú lórí ohun tó ń fa ìṣòro náà",
  ];
  for (const text of safe) {
    assert.equal(
      collectFlags(text, "Yoruba", { includeDiagnosis: true }).length,
      0,
      `false positive for: ${text}`
    );
  }
});

test("collectFlags still flags definite Yoruba claims", () => {
  assert.ok(
    collectFlags("Ó dájú pé àrùn náà ni", "Yoruba", {
      includeDiagnosis: true,
    }).length > 0
  );
});

// ---------------------------------------------------------------------------
// applySafeguards
// ---------------------------------------------------------------------------

test("applySafeguards removes unsafe actions and escalates uncertainty", () => {
  const result = baseAssessment({
    immediateActions: [
      "Remove affected leaves",
      "Spray glyphosate 5 ml per litre",
    ],
    uncertainty: { level: "low", reason: "Looks mild." },
  });

  const { result: safe, warnings } = applySafeguards(result, "English");

  assert.equal(safe.immediateActions.length, 1);
  assert.ok(!safe.immediateActions.join(" ").includes("glyphosate"));
  assert.ok(warnings.length > 0);
  assert.notEqual(safe.uncertainty.level, "low");
});

test("applySafeguards preserves imageIssues through the pass", () => {
  const result = baseAssessment({
    imageIssues: { total: 2, failed: 1 },
  });
  const { result: safe } = applySafeguards(result, "English");
  assert.deepEqual(safe.imageIssues, { total: 2, failed: 1 });
});

// ---------------------------------------------------------------------------
// applyEvidencePolicy
// ---------------------------------------------------------------------------

test("applyEvidencePolicy forces fallback when there is no evidence", () => {
  const result = applyEvidencePolicy(baseAssessment(), {
    hasText: false,
    hasImages: false,
  });
  assert.deepEqual(result.observedSigns, []);
  assert.deepEqual(result.possibleCauses, []);
  assert.equal(result.uncertainty.level, "high");
});

test("applyEvidencePolicy forces high uncertainty when nothing was found", () => {
  const result = applyEvidencePolicy(
    baseAssessment({
      observedSigns: [],
      possibleCauses: [],
      uncertainty: { level: "low", reason: "Nothing obvious." },
    }),
    { hasText: true, hasImages: true }
  );
  assert.equal(result.uncertainty.level, "high");
  assert.equal(result.whenToSeekHelp, SAFE_HELP_FALLBACK);
  assert.ok(result.followUpQuestions.length > 0);
});

test("applyEvidencePolicy raises low uncertainty when no signs were seen", () => {
  const result = applyEvidencePolicy(
    baseAssessment({
      observedSigns: [],
      possibleCauses: ["Possible nutrient deficiency"],
      uncertainty: { level: "low", reason: "Mild." },
    }),
    { hasText: true, hasImages: false }
  );
  assert.equal(result.uncertainty.level, "medium");
});

test("applyEvidencePolicy supplies a follow-up question when empty", () => {
  const result = applyEvidencePolicy(
    baseAssessment({ followUpQuestions: [] }),
    { hasText: true, hasImages: false }
  );
  assert.ok(result.followUpQuestions.length > 0);
});

// ---------------------------------------------------------------------------
// finalAudit
// ---------------------------------------------------------------------------

test("finalAudit passes clean results unchanged", () => {
  const clean = baseAssessment();
  const { result, warnings } = finalAudit(clean, "English");
  assert.deepEqual(result, clean);
  assert.equal(warnings.length, 0);
});

test("finalAudit replaces the whole result on any unsafe field", () => {
  const dirty = baseAssessment({
    observedSigns: ["Plant covered in glyphosate residue"],
  });
  const { result, warnings } = finalAudit(dirty, "English");
  assert.ok(warnings.length > 0);
  assert.deepEqual(result.observedSigns, []);
  assert.equal(result.uncertainty.level, "high");
});

// ---------------------------------------------------------------------------
// safeFallbackAssessment
// ---------------------------------------------------------------------------

test("safeFallbackAssessment is conservative and actionable", () => {
  const fallback = safeFallbackAssessment();
  assert.deepEqual(fallback.observedSigns, []);
  assert.deepEqual(fallback.possibleCauses, []);
  assert.equal(fallback.uncertainty.level, "high");
  assert.ok(fallback.followUpQuestions.length > 0);
  assert.ok(fallback.whenToSeekHelp.length > 0);
});

// ---------------------------------------------------------------------------
// image helpers
// ---------------------------------------------------------------------------

function bytes(prefix, length = 16) {
  const out = new Uint8Array(length);
  out.set(prefix, 0);
  return out;
}

test("sniffImageMimeType identifies JPEG, PNG, and WebP", () => {
  assert.equal(sniffImageMimeType(bytes([0xff, 0xd8, 0xff])), "image/jpeg");
  assert.equal(
    sniffImageMimeType(
      bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ),
    "image/png"
  );
  const webp = new Uint8Array(16);
  webp.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  webp.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  assert.equal(sniffImageMimeType(webp), "image/webp");
});

test("sniffImageMimeType rejects non-images and truncated buffers", () => {
  assert.equal(sniffImageMimeType(bytes([0x3c, 0x68, 0x74, 0x6d, 0x6c])), null);
  assert.equal(sniffImageMimeType(new Uint8Array([0xff, 0xd8])), null);
  assert.equal(looksLikeImage(new Uint8Array(0)), false);
});

test("looksLikeImage accepts a JPEG header and rejects HTML", () => {
  assert.equal(looksLikeImage(bytes([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(looksLikeImage(bytes([0x3c, 0x21, 0x44, 0x4f])), false);
});

test("isImageContentType handles parameters and non-image types", () => {
  assert.equal(isImageContentType("image/jpeg; charset=binary"), true);
  assert.equal(isImageContentType("IMAGE/PNG"), true);
  assert.equal(isImageContentType("text/html"), false);
  assert.equal(isImageContentType("application/json"), false);
  assert.equal(isImageContentType(null), false);
});

// ---------------------------------------------------------------------------
// Zod assessment schema
// ---------------------------------------------------------------------------

test("assessmentResultSchema accepts a valid assessment", () => {
  const parsed = assessmentResultSchema.safeParse(baseAssessment());
  assert.equal(parsed.success, true);
});

test("assessmentResultSchema accepts an optional imageIssues field", () => {
  const parsed = assessmentResultSchema.safeParse(
    baseAssessment({ imageIssues: { total: 3, failed: 1 } })
  );
  assert.equal(parsed.success, true);
});

test("assessmentResultSchema rejects missing and wrong-typed fields", () => {
  const missingArray = baseAssessment();
  delete missingArray.observedSigns;
  assert.equal(assessmentResultSchema.safeParse(missingArray).success, false);
  assert.equal(
    assessmentResultSchema.safeParse(
      baseAssessment({ observedSigns: "not an array" })
    ).success,
    false
  );
  assert.equal(
    assessmentResultSchema.safeParse(
      baseAssessment({ uncertainty: { level: "certain", reason: "x" } })
    ).success,
    false
  );
});

test("assessmentResultSchema rejects over-long arrays", () => {
  const tooMany = Array.from({ length: 21 }, (_, i) => `sign ${i}`);
  assert.equal(
    assessmentResultSchema.safeParse(
      baseAssessment({ observedSigns: tooMany })
    ).success,
    false
  );
});

// ---------------------------------------------------------------------------
// Multilingual pesticide and dosage safeguards
// ---------------------------------------------------------------------------

test("pesticide and dosage advice is removed in all four supported languages", () => {
  const cases = [
    {
      language: "English",
      unsafe: "Spray glyphosate 5 ml per litre to kill the weeds",
      forbidden: /glyphosate/i,
    },
    {
      language: "Yoruba",
      unsafe: "Lo kemikali 5 ml fun litre",
      forbidden: /kemikali/i,
    },
    {
      language: "Hausa",
      unsafe: "Yi amfani da sinadari 5 ml a cikin ruwa",
      forbidden: /sinadari/i,
    },
    {
      language: "Igbo",
      unsafe: "Jiri kemikal 5 ml mee ihe",
      forbidden: /kemikal/i,
    },
  ];

  for (const { language, unsafe, forbidden } of cases) {
    const { result, warnings } = applySafeguards(
      baseAssessment({
        immediateActions: [unsafe, "Remove affected leaves"],
        uncertainty: { level: "low", reason: "Clear early-stage signs." },
      }),
      language
    );

    assert.ok(warnings.length > 0, `${language}: expected a safety warning`);
    assert.deepEqual(
      result.immediateActions,
      ["Remove affected leaves"],
      `${language}: unsafe action should be removed`
    );
    assert.equal(
      result.uncertainty.level,
      "medium",
      `${language}: uncertainty should be escalated`
    );

    const audited = finalAudit(result, language);
    assert.equal(
      audited.warnings.length,
      0,
      `${language}: final audit should find nothing left`
    );
    assert.doesNotMatch(
      JSON.stringify(audited.result),
      forbidden,
      `${language}: restricted term survived the pipeline`
    );
    assert.match(
      audited.result.whenToSeekHelp,
      /extension worker/i,
      `${language}: human escalation must remain`
    );
  }
});
