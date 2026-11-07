import type { AssessmentResult } from "@/lib/data/validation/assessment";

/**
 * Deterministic safety layer for AI crop assessments.
 *
 * This module is intentionally free of runtime imports so it can be executed by
 * the dependency-free test runner in `scripts/safety.test.mjs`. It provides the
 * last line of defence when a model (or a translation) cannot be trusted.
 */

/**
 * Pesticide active ingredients that must NOT be recommended without
 * expert-reviewed guidance. This is a deterministic safeguard list.
 */
const RESTRICTED_PESTICIDES = [
  "glyphosate",
  "chlorpyrifos",
  "imidacloprid",
  "lambda-cyhalothrin",
  "acetamiprid",
  "thiamethoxam",
  "clothianidin",
  "cypermethrin",
  "deltamethrin",
  "malathion",
  "carbaryl",
  "mancozeb",
  "chlorothalonil",
  "copper oxychloride",
  "paraquat",
  "dichlorvos",
  "profenofos",
  "carbendazim",
  // Common product/transliterated names encountered in Nigeria. They often
  // appear without the active-ingredient name and bypass a pure INN list.
  "lindane",
  "endosulfan",
  "ddt",
  "sniper",
  "gammalin",
  "dursban",
  "vetox",
  "karate",
];

/**
 * Localized markers for chemical treatment or dosage. These are intentionally
 * narrow (chemical/insecticide words rather than generic words like "medicine")
 * to limit false positives. They are draft terms and require native-speaker
 * review before a pilot, matching the language-review requirement in PDR §6.
 */
const LOCALIZED_UNSAFE_TERMS: Record<string, string[]> = {
  Yoruba: [
    "kẹmikali",
    "kemikali",
    "oògùn ipaniyan",
    "oogun ipaniyan",
    "oògùn apakokoro",
    "oogun apakokoro",
    "ìwọ̀n oògùn",
    "iwon oogun",
  ],
  Hausa: [
    "sinadari",
    "magungunan kashe kwari",
    "maganin kashe kwari",
    "ma'auni",
    "ma’auni",
    "feshi",
  ],
  Igbo: [
    "kemikal",
    "ọgwụ igbu ahụhụ",
    "ogwu igbu ahu ahu",
    "ọgwụ igbu ụmụ ahụhụ",
    "nha ọgwụ",
    "nha ogwu",
  ],
};

/** A few definite-diagnosis markers in the supported local languages. */
const LOCALIZED_DIAGNOSIS_PATTERNS: Record<string, RegExp[]> = {
  // Avoid \b around accented terms: JavaScript word boundaries are ASCII-only
  // without the u flag, so accented endings can fail to match.
  //
  // Match definite claims ("dájú pé" = "it is certain that"), not the noun
  // "dídájú" or the uncertainty-positive "kò dájú" ("not certain"). The bare
  // word was a false positive on safe, uncertainty-expressing sentences.
  Yoruba: [/dájú\s+(ni|pé)/i, /\bdaju\s+(ni|pe)\b/i, /àrùn náà ni/i, /arun naa ni/i],
  Hausa: [/\btabbata\b/i, /cutar (ita|shi) ce/i, /tabbacin cuta/i],
  Igbo: [/n'ezie/i, /ọrịa ahụ bụ/i, /oria ahu bu/i],
};

export const SAFE_HELP_FALLBACK =
  "Consult a local agricultural extension worker if you are unsure.";

/** Definite-diagnosis phrasing that must never be presented as fact. */
function checkDefiniteDiagnosis(text: string, language: string): string[] {
  const definitePatterns = [
    /this is (definitely|certainly|absolutely|clearly) /i,
    /the diagnosis is /i,
    /your plant has /i,
    /it is (definitely|certainly|absolutely|clearly) /i,
    /confirmed (diagnosis|case of)/i,
    /positive for /i,
  ];
  const localized = LOCALIZED_DIAGNOSIS_PATTERNS[language] ?? [];

  return [...definitePatterns, ...localized]
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source || "localized definite-diagnosis phrasing");
}

function checkRestrictedPesticides(text: string, language: string): string[] {
  const lowerText = text.toLowerCase();
  const terms = [
    ...RESTRICTED_PESTICIDES,
    ...(LOCALIZED_UNSAFE_TERMS[language] ?? []),
  ];
  return terms.filter((term) => lowerText.includes(term.toLowerCase()));
}

/** Dose/quantity phrasing that must not reach a farmer without expert review. */
function checkDoseRecommendations(text: string): string[] {
  const dosePatterns = [
    /\d+\s*(ml|liter|litre|lita|litre|spoon|cap|sachet|tablespoon|teaspoon|g|kg|gram|kilogram|mg)\b/i,
    /(mix|dilute|spray|apply|use)\s+\d+/i,
    /\d+\s*(per|in|for)\s+(liter|litre|gal|gallon|acre|hectare|plot)\b/i,
  ];

  return dosePatterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);
}

/**
 * Collect every deterministic safety flag for one field.
 *
 * The phrase lists above only cover English, so any explicit numeric quantity
 * in a non-English response is treated as unsafe: dosage instructions are the
 * highest-risk output and cannot be pattern-checked reliably in Yoruba, Hausa
 * or Igbo. This is deliberately conservative.
 */
export function collectFlags(
  text: string,
  language: string,
  options: { includeDiagnosis?: boolean } = {}
): string[] {
  const flags = [
    ...checkRestrictedPesticides(text, language),
    ...checkDoseRecommendations(text),
  ];

  if (options.includeDiagnosis) {
    flags.push(...checkDefiniteDiagnosis(text, language));
  }

  if (language !== "English" && /\d/.test(text)) {
    flags.push("numeric quantity in a non-English response");
  }

  return flags;
}

/**
 * Apply safeguards to the AI assessment result.
 * Removes restricted pesticide names, definite diagnoses, and dose
 * recommendations from every farmer-facing field, and escalates uncertainty.
 */
export function applySafeguards(
  result: AssessmentResult,
  language: string
): {
  result: AssessmentResult;
  warnings: string[];
} {
  const warnings: string[] = [];

  const safeCauses: string[] = [];
  for (const cause of result.possibleCauses) {
    const flags = collectFlags(cause, language, { includeDiagnosis: true });
    if (flags.length > 0) {
      warnings.push(
        `Possible cause removed for safety: "${cause}" (${flags.join(", ")})`
      );
    } else {
      safeCauses.push(cause);
    }
  }

  const safeActions: string[] = [];
  for (const action of result.immediateActions) {
    const flags = collectFlags(action, language, { includeDiagnosis: true });
    if (flags.length > 0) {
      warnings.push(
        `Action removed for safety: "${action}" (${flags.join(", ")})`
      );
    } else {
      safeActions.push(action);
    }
  }

  const safeSigns: string[] = [];
  for (const sign of result.observedSigns) {
    const flags = collectFlags(sign, language);
    if (flags.length > 0) {
      warnings.push(
        `Observed sign removed for safety: "${sign}" (${flags.join(", ")})`
      );
    } else {
      safeSigns.push(sign);
    }
  }

  const safeQuestions: string[] = [];
  for (const question of result.followUpQuestions) {
    const flags = collectFlags(question, language);
    if (flags.length > 0) {
      warnings.push(
        `Follow-up question removed for safety: "${question}" (${flags.join(", ")})`
      );
    } else {
      safeQuestions.push(question);
    }
  }

  let whenToSeekHelp = result.whenToSeekHelp;
  const helpFlags = collectFlags(whenToSeekHelp, language);
  if (helpFlags.length > 0) {
    warnings.push(
      `Escalation advice replaced for safety (${helpFlags.join(", ")})`
    );
    whenToSeekHelp = SAFE_HELP_FALLBACK;
  }

  // If any safeguards triggered, escalate uncertainty.
  let uncertaintyLevel = result.uncertainty.level;
  if (warnings.length > 0 && uncertaintyLevel === "low") {
    uncertaintyLevel = "medium";
  }
  if (warnings.length > 2 && uncertaintyLevel === "medium") {
    uncertaintyLevel = "high";
  }

  // The uncertainty reason is farmer-facing too, so it gets the same scan.
  let uncertaintyReasonBase = result.uncertainty.reason;
  const reasonFlags = collectFlags(uncertaintyReasonBase, language, {
    includeDiagnosis: true,
  });
  if (reasonFlags.length > 0) {
    warnings.push(
      `Uncertainty reason replaced for safety (${reasonFlags.join(", ")})`
    );
    uncertaintyReasonBase =
      "Some details were withheld for safety. Consult a local agricultural extension worker if you are unsure.";
  }

  // Do not include a count here. The final audit treats any digit in a
  // non-English response as a possible dosage leak, so our own diagnostic
  // suffix would otherwise force the whole safe result back to the fallback.
  // The count is still logged server-side via `warnings`.
  const uncertaintyReason =
    warnings.length > 0
      ? `${uncertaintyReasonBase} Some content was filtered for safety.`
      : uncertaintyReasonBase;

  return {
    result: {
      observedSigns: safeSigns,
      possibleCauses: safeCauses,
      followUpQuestions: safeQuestions,
      immediateActions: safeActions,
      whenToSeekHelp,
      uncertainty: {
        level: uncertaintyLevel,
        reason: uncertaintyReason,
      },
      // Preserve the server-computed photo status through the safety pass.
      imageIssues: result.imageIssues,
    },
    warnings,
  };
}

/**
 * A conservative result used whenever evidence is missing, the model output is
 * unusable, or a safety audit fails. It never contains a diagnosis or a
 * treatment and always escalates to a human.
 */
export function safeFallbackAssessment(): AssessmentResult {
  return {
    observedSigns: [],
    possibleCauses: [],
    followUpQuestions: [
      "Could you describe the symptoms in more detail or share a clearer photo?",
    ],
    immediateActions: [
      "Consult a local agricultural extension worker for assistance.",
    ],
    whenToSeekHelp: "Please consult a local agricultural extension worker.",
    uncertainty: {
      level: "high",
      reason:
        "There is not enough evidence to assess this crop safely. Please provide more detail or a clearer photo.",
    },
  };
}

/**
 * Enforce an explicit no-evidence policy before a result can be shown:
 * - no text and no images => safe fallback;
 * - no observed signs and no possible causes => high uncertainty + escalation;
 * - no observed signs but some causes => at least medium uncertainty;
 * - an empty follow-up list always gets a clarifying question.
 */
export function applyEvidencePolicy(
  result: AssessmentResult,
  evidence: { hasText: boolean; hasImages: boolean }
): AssessmentResult {
  if (!evidence.hasText && !evidence.hasImages) {
    return safeFallbackAssessment();
  }

  const noFindings =
    result.observedSigns.length === 0 && result.possibleCauses.length === 0;

  let level: AssessmentResult["uncertainty"]["level"] =
    result.uncertainty.level;
  let reason = result.uncertainty.reason;

  if (result.observedSigns.length === 0 && level === "low") {
    level = "medium";
    reason = `No visible signs were identified from the evidence provided. ${reason}`;
  }

  if (noFindings) {
    level = "high";
    reason = `Not enough evidence was provided to assess this crop safely. ${reason}`;
  }

  return {
    ...result,
    followUpQuestions:
      result.followUpQuestions.length > 0
        ? result.followUpQuestions
        : [
            "Can you describe the symptoms in more detail or share a clearer photo?",
          ],
    whenToSeekHelp: noFindings ? SAFE_HELP_FALLBACK : result.whenToSeekHelp,
    uncertainty: { level, reason },
  };
}

/**
 * Final fail-closed audit. Every farmer-facing string is scanned one more time.
 * If anything still trips a safety rule, the whole assessment is replaced with
 * the safe fallback rather than shipping filtered-but-uncertain content.
 */
export function finalAudit(
  result: AssessmentResult,
  language: string
): { result: AssessmentResult; warnings: string[] } {
  const warnings: string[] = [];
  const fields: Array<[string, string]> = [
    ...result.observedSigns.map((value, index): [string, string] => [
      `observedSigns[${index}]`,
      value,
    ]),
    ...result.possibleCauses.map((value, index): [string, string] => [
      `possibleCauses[${index}]`,
      value,
    ]),
    ...result.followUpQuestions.map((value, index): [string, string] => [
      `followUpQuestions[${index}]`,
      value,
    ]),
    ...result.immediateActions.map((value, index): [string, string] => [
      `immediateActions[${index}]`,
      value,
    ]),
    ["whenToSeekHelp", result.whenToSeekHelp],
    ["uncertainty.reason", result.uncertainty.reason],
  ];

  for (const [name, text] of fields) {
    const flags = collectFlags(text, language, { includeDiagnosis: true });
    if (flags.length > 0) {
      warnings.push(
        `Final audit rejected ${name} (${flags.join(", ")})`
      );
    }
  }

  if (warnings.length > 0) {
    return { result: safeFallbackAssessment(), warnings };
  }

  return { result, warnings };
}