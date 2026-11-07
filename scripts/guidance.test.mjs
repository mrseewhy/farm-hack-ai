// Tests for the guidance provenance policy.
//
// Run with: npm run test:guidance
//
// These tests pin the trust boundary the roadmap requires: publishing an
// article must never imply agricultural expert review. They need no database or
// API key.

import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeProvenance,
  validatePublication,
  publicationWarnings,
  isPublishable,
  describeProvenance,
  formatGuidanceContext,
  buildGuidanceCitations,
  usableGuidanceArticles,
} from "../lib/guidance.ts";

const baseArticle = {
  problem: "Early blight",
  signs: "Dark concentric leaf spots.",
  distinguishingQuestions: "Do the spots have rings?",
  approvedActions: "Remove volunteers and rotate crops.",
};

const sourceBacked = {
  ...baseArticle,
  provenance: "source_backed",
  sourcePublisher: "University of California Statewide IPM Program",
  sourceTitle: "Early Blight - UC IPM Pest Management Guidelines: Tomato",
  sourceUrl: "https://ipm.ucanr.edu/agriculture/tomato/early-blight/",
  sourceAccessedAt: "2026-11-07",
  sourceLicense: "educational, noncommercial use with attribution",
};

const expertReviewed = {
  ...baseArticle,
  provenance: "expert_reviewed",
  reviewer: "Dr A. Agronomist",
  reviewedAt: "2026-11-05",
};

test("normalizeProvenance defaults unknown values to the weaker source_backed", () => {
  assert.equal(normalizeProvenance(undefined), "source_backed");
  assert.equal(normalizeProvenance(null), "source_backed");
  assert.equal(normalizeProvenance("expert"), "source_backed");
  assert.equal(normalizeProvenance("expert_reviewed"), "expert_reviewed");
  assert.equal(normalizeProvenance("source_backed"), "source_backed");
});

test("source-backed guidance cannot be published without a citation", () => {
  const errors = validatePublication({
    ...baseArticle,
    provenance: "source_backed",
  });
  assert.equal(errors.length, 3);
  assert.ok(errors.some((e) => /publisher/i.test(e)));
  assert.ok(errors.some((e) => /title/i.test(e)));
  assert.ok(errors.some((e) => /URL/i.test(e)));
  assert.equal(isPublishable({ ...baseArticle, provenance: "source_backed" }), false);
});

test("source-backed guidance publishes once publisher, title, and URL are present", () => {
  assert.deepEqual(validatePublication(sourceBacked), []);
  assert.equal(isPublishable(sourceBacked), true);
});

test("a non-http source URL is rejected", () => {
  const errors = validatePublication({
    ...sourceBacked,
    sourceUrl: "not-a-url",
  });
  assert.equal(errors.length, 1);
  assert.ok(/URL/i.test(errors[0]));
});

test("expert-reviewed guidance requires a reviewer and a review date", () => {
  const errors = validatePublication({
    ...baseArticle,
    provenance: "expert_reviewed",
  });
  assert.equal(errors.length, 2);
  assert.ok(errors.some((e) => /reviewer/i.test(e)));
  assert.ok(errors.some((e) => /reviewed/i.test(e)));
});

test("expert-reviewed guidance publishes with reviewer and date", () => {
  assert.deepEqual(validatePublication(expertReviewed), []);
});

test("publication warnings flag missing access date and licence without blocking", () => {
  const warnings = publicationWarnings({
    ...sourceBacked,
    sourceAccessedAt: null,
    sourceLicense: null,
  });
  assert.equal(warnings.length, 2);
  assert.equal(isPublishable({ ...sourceBacked, sourceAccessedAt: null, sourceLicense: null }), true);

  assert.deepEqual(publicationWarnings(sourceBacked), []);
  // Expert-reviewed content is not subject to the source-metadata warnings.
  assert.deepEqual(publicationWarnings(expertReviewed), []);
});

test("describeProvenance never calls source-backed content expert-reviewed", () => {
  assert.match(describeProvenance(sourceBacked), /Source-backed/);
  assert.match(describeProvenance(sourceBacked), /not expert-reviewed/i);
  assert.match(describeProvenance(expertReviewed), /Expert-reviewed by Dr A. Agronomist/);
});

test("formatGuidanceContext returns empty string when there is nothing usable", () => {
  assert.equal(formatGuidanceContext([]), "");
  assert.equal(
    formatGuidanceContext([{ ...baseArticle, problem: "", approvedActions: "" }]),
    ""
  );
});

test("formatGuidanceContext labels provenance and includes source attribution", () => {
  const context = formatGuidanceContext([sourceBacked, expertReviewed]);

  assert.match(context, /CURATED TOMATO REFERENCE/);
  assert.match(context, /provenance: source_backed/);
  assert.match(context, /provenance: expert_reviewed/);
  assert.match(context, /Source URL: https:\/\/ipm\.ucanr\.edu/);
  assert.match(context, /Source accessed: 2026-11-07/);
  assert.match(context, /Expert-reviewed by: Dr A\. Agronomist/);
  // The core safety requirement: the prompt must not present source-backed
  // guidance as expert-reviewed.
  assert.doesNotMatch(context, /EXPERT-REVIEWED TOMATO GUIDANCE/);
  assert.match(context, /NOT been reviewed by an agricultural expert/i);
  assert.match(context, /Never describe source-backed guidance as expert-reviewed/i);
});

test("formatGuidanceContext skips incomplete entries but keeps valid ones", () => {
  const context = formatGuidanceContext([
    { ...sourceBacked, problem: "" },
    expertReviewed,
  ]);
  assert.doesNotMatch(context, /provenance: source_backed/);
  assert.match(context, /provenance: expert_reviewed/);
});

test("usableGuidanceArticles drops entries missing a problem or action", () => {
  const usable = usableGuidanceArticles([
    { ...sourceBacked, problem: "" },
    { ...sourceBacked, approvedActions: "   " },
    expertReviewed,
  ]);
  assert.equal(usable.length, 1);
  assert.equal(usable[0], expertReviewed);
});

test("buildGuidanceCitations carries trusted source metadata, never model text", () => {
  const citations = buildGuidanceCitations([sourceBacked, expertReviewed]);

  assert.equal(citations.length, 2);
  assert.deepEqual(citations[0], {
    index: 1,
    problem: "Early blight",
    provenance: "source_backed",
    publisher: "University of California Statewide IPM Program",
    title: "Early Blight - UC IPM Pest Management Guidelines: Tomato",
    url: "https://ipm.ucanr.edu/agriculture/tomato/early-blight/",
    accessedAt: "2026-11-07",
    license: "educational, noncommercial use with attribution",
  });
  assert.deepEqual(citations[1], {
    index: 2,
    problem: "Early blight",
    provenance: "expert_reviewed",
    reviewer: "Dr A. Agronomist",
    reviewedAt: "2026-11-05",
  });
});

test("buildGuidanceCitations omits a non-http source URL rather than linking it", () => {
  const [citation] = buildGuidanceCitations([
    { ...sourceBacked, sourceUrl: "javascript:alert(1)" },
  ]);
  assert.equal(citation.url, undefined);
});

test("citations and prompt context agree on which entries were supplied", () => {
  const articles = [
    { ...sourceBacked, problem: "" },
    sourceBacked,
    expertReviewed,
  ];
  assert.equal(
    buildGuidanceCitations(articles).length,
    usableGuidanceArticles(articles).length
  );
  assert.equal(buildGuidanceCitations([]).length, 0);
});
