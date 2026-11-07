/**
 * Guidance provenance policy.
 *
 * FarmHack AI has no qualified agricultural expert on the team, so curated
 * guidance is normally *source-backed*: paraphrased from a cited public
 * reference. That is materially weaker than *expert-reviewed* content, and the
 * two must never be conflated — neither in the admin UI, nor in the AI prompt,
 * nor in what the model is allowed to claim to a farmer.
 *
 * This module is intentionally free of runtime imports so the dependency-free
 * test runner in `scripts/guidance.test.mjs` can execute it. It owns three
 * deterministic rules:
 *   1. what must be supplied before an article may be published;
 *   2. how provenance is labelled to a human;
 *   3. how guidance is formatted for the model prompt, with an explicit
 *      warning that source-backed material is NOT expert-reviewed.
 */

export const PROVENANCE_VALUES = ["source_backed", "expert_reviewed"] as const;

export type Provenance = (typeof PROVENANCE_VALUES)[number];

export const SOURCE_BACKED: Provenance = "source_backed";
export const EXPERT_REVIEWED: Provenance = "expert_reviewed";

/** The minimal article shape the policy needs. Keeps the module DB-agnostic. */
export type GuidanceArticle = {
  problem: string;
  signs: string;
  distinguishingQuestions: string;
  approvedActions: string;
  provenance?: string | null;
  reviewer?: string | null;
  reviewedAt?: Date | string | null;
  sourcePublisher?: string | null;
  sourceTitle?: string | null;
  sourceUrl?: string | null;
  sourceAccessedAt?: Date | string | null;
  sourceLicense?: string | null;
};

/** Coerce any stored value into a known provenance, defaulting to the weaker one. */
export function normalizeProvenance(value: unknown): Provenance {
  return PROVENANCE_VALUES.includes(value as Provenance)
    ? (value as Provenance)
    : SOURCE_BACKED;
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpUrl(value: unknown): boolean {
  if (!isNonEmpty(value)) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Reasons an article must not be published. An empty array means it may.
 *
 * Expert-reviewed guidance requires a named reviewer and a review date. A
 * source-backed article must cite a publisher, title, and resolvable URL —
 * enough for a reader to verify the claim and for us to attribute it. Missing
 * review date / licence terms are warnings (see `publicationWarnings`) rather
 * than blockers.
 */
export function validatePublication(article: GuidanceArticle): string[] {
  const errors: string[] = [];
  const provenance = normalizeProvenance(article.provenance);

  if (provenance === EXPERT_REVIEWED) {
    if (!isNonEmpty(article.reviewer)) {
      errors.push(
        "Expert-reviewed guidance requires the name of the qualified reviewer."
      );
    }
    if (!article.reviewedAt) {
      errors.push("Expert-reviewed guidance requires the date it was reviewed.");
    }
  } else {
    if (!isNonEmpty(article.sourcePublisher)) {
      errors.push("Source-backed guidance requires a source publisher.");
    }
    if (!isNonEmpty(article.sourceTitle)) {
      errors.push("Source-backed guidance requires a source title.");
    }
    if (!isHttpUrl(article.sourceUrl)) {
      errors.push("Source-backed guidance requires a valid http(s) source URL.");
    }
  }

  return errors;
}

/** Non-blocking gaps that weaken provenance but do not stop publication. */
export function publicationWarnings(article: GuidanceArticle): string[] {
  const warnings: string[] = [];
  if (normalizeProvenance(article.provenance) !== SOURCE_BACKED) {
    return warnings;
  }
  if (!article.sourceAccessedAt) {
    warnings.push("No access date recorded for the source.");
  }
  if (!isNonEmpty(article.sourceLicense)) {
    warnings.push("No licence or usage terms recorded for the source.");
  }
  return warnings;
}

export function isPublishable(article: GuidanceArticle): boolean {
  return validatePublication(article).length === 0;
}

/** Human-facing label. Never let "published" read as "expert-reviewed". */
export function describeProvenance(article: GuidanceArticle): string {
  return normalizeProvenance(article.provenance) === EXPERT_REVIEWED
    ? `Expert-reviewed by ${article.reviewer?.trim() || "an unnamed reviewer"}`
    : "Source-backed (not expert-reviewed)";
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/**
 * The subset of articles that is safe to show a farmer or send to the model:
 * it must carry a problem label and at least one approved action. Both the
 * prompt context and the farmer-facing citations use this exact filter so the
 * two never disagree about which references were provided.
 */
export function usableGuidanceArticles(
  articles: GuidanceArticle[]
): GuidanceArticle[] {
  return articles.filter(
    (article) => clean(article.problem) && clean(article.approvedActions)
  );
}

/**
 * A farmer-facing citation. Only trusted, server-owned metadata is included;
 * the model never supplies or edits these values.
 */
export type GuidanceCitation = {
  index: number;
  problem: string;
  provenance: Provenance;
  publisher?: string;
  title?: string;
  url?: string;
  accessedAt?: string;
  license?: string;
  reviewer?: string;
  reviewedAt?: string;
};

/**
 * Build the citation list for the guidance that was supplied to the model.
 *
 * This is deliberately derived from the reference material rather than from
 * free-text generated by the model, so a farmer can always inspect a real,
 * source-backed URL. The UI labels these as background references, not as a
 * confirmed diagnosis.
 */
export function buildGuidanceCitations(
  articles: GuidanceArticle[]
): GuidanceCitation[] {
  return usableGuidanceArticles(articles).map((article, index) => {
    const provenance = normalizeProvenance(article.provenance);
    const citation: GuidanceCitation = {
      index: index + 1,
      problem: clean(article.problem),
      provenance,
    };
    if (provenance === EXPERT_REVIEWED) {
      citation.reviewer = clean(article.reviewer) || undefined;
      citation.reviewedAt = formatDate(article.reviewedAt) || undefined;
    } else {
      const publisher = clean(article.sourcePublisher);
      if (publisher) citation.publisher = publisher;
      const title = clean(article.sourceTitle);
      if (title) citation.title = title;
      const url = clean(article.sourceUrl);
      if (isHttpUrl(url)) citation.url = url;
      const accessed = formatDate(article.sourceAccessedAt);
      if (accessed) citation.accessedAt = accessed;
      const license = clean(article.sourceLicense);
      if (license) citation.license = license;
    }
    return citation;
  });
}

/**
 * Render published guidance for the model prompt.
 *
 * The header states the trust boundary explicitly so the model cannot infer
 * expert review from the mere presence of curated text. Each entry carries its
 * provenance and, for source-backed entries, full attribution.
 */
export function formatGuidanceContext(
  articles: GuidanceArticle[]
): string {
  const usable = usableGuidanceArticles(articles);
  if (usable.length === 0) return "";

  const lines: string[] = [
    "",
    "CURATED PLANT REFERENCE (background only, not a diagnosis):",
    "Source-backed entries are paraphrased from a cited public source and have NOT been reviewed by an agricultural expert. Expert-reviewed entries were reviewed by a named expert. Never describe source-backed guidance as expert-reviewed, and never present any of this as a definite diagnosis.",
  ];

  usable.forEach((article, index) => {
    const provenance = normalizeProvenance(article.provenance);
    lines.push("");
    lines.push(`[${index + 1}] ${clean(article.problem)} — provenance: ${provenance}`);
    if (provenance === EXPERT_REVIEWED) {
      lines.push(
        `Expert-reviewed by: ${clean(article.reviewer) || "unnamed"}${formatDate(article.reviewedAt) ? ` on ${formatDate(article.reviewedAt)}` : ""}`
      );
    } else {
      const publisher = clean(article.sourcePublisher) || "unspecified source";
      const title = clean(article.sourceTitle);
      lines.push(`Source: ${publisher}${title ? ` — "${title}"` : ""}`);
      const url = clean(article.sourceUrl);
      if (url) lines.push(`Source URL: ${url}`);
      const accessed = formatDate(article.sourceAccessedAt);
      if (accessed) lines.push(`Source accessed: ${accessed}`);
      const license = clean(article.sourceLicense);
      if (license) lines.push(`Source terms: ${license}`);
    }
    const signs = clean(article.signs);
    if (signs) lines.push(`Signs: ${signs}`);
    const questions = clean(article.distinguishingQuestions);
    if (questions) lines.push(`Distinguishing questions: ${questions}`);
    lines.push(`Safe actions: ${clean(article.approvedActions)}`);
    lines.push("---");
  });

  lines.push("");
  lines.push(
    "Use this reference to inform your assessment, but do not treat it as a diagnosis. Only suggest actions listed here or low-risk non-chemical steps; if the evidence does not match a listed problem, say so and ask a clarifying question."
  );

  return lines.join("\n");
}
