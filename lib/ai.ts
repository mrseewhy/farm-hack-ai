import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  assessmentResultSchema,
  type AssessmentResult,
  type GuidanceCitation,
} from "@/lib/data/validation/assessment";
import {
  applyEvidencePolicy,
  applySafeguards,
  finalAudit,
  safeFallbackAssessment,
  SAFE_HELP_FALLBACK,
} from "@/lib/safety";
import {
  isImageContentType,
  MIN_IMAGE_BYTES,
  sniffImageMimeType,
} from "@/lib/image";
import {
  PROMPT_VERSION,
  type AiEventOutcome,
  type AiValidationOutcome,
} from "@/lib/monitoring";

// Re-export the contract so server actions keep importing it from "@/lib/ai".
export type { AssessmentResult } from "@/lib/data/validation/assessment";

let genAI: GoogleGenerativeAI | null = null;

function getGenAI() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error(
        "GEMINI_API_KEY is not set. Configure it to enable AI crop assessment."
      );
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

/**
 * Gemini model used for crop assessments.
 *
 * Google retires models on a rolling basis: gemini-1.5-flash was shut down in
 * September 2025, so this must not be hardcoded to a retired model again.
 * GEMINI_MODEL lets a deployment move to a supported model without a code
 * change; the default is the current generally available Flash model.
 */
export const MODEL_NAME = process.env.GEMINI_MODEL ?? "gemini-3.8-flash";

/**
 * Fallback models tried when the primary model is overloaded (503), retired or
 * slow. Google's Flash models occasionally return "high demand" 503s, which is
 * exactly when a fallback keeps the product usable.
 */
const DEFAULT_FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];

export const MODEL_CANDIDATES = [
  ...new Set(
    [
      MODEL_NAME,
      ...(process.env.GEMINI_FALLBACK_MODELS
        ? process.env.GEMINI_FALLBACK_MODELS.split(",")
        : DEFAULT_FALLBACK_MODELS),
    ]
      .map((name) => name.trim())
      .filter(Boolean)
  ),
];

/** Maximum number of prior turns sent as conversation context. */
export const MAX_HISTORY_MESSAGES = 12;

// Timeouts and retries: a stalled model call must not hold a request open.
// One attempt per candidate: fallbacks provide the retry, and each timeout is
// bounded so a slow model cannot hold the chat open indefinitely.
const GENERATE_TIMEOUT_MS = 20_000;
const GENERATE_ATTEMPTS = 1;
const IMAGE_FETCH_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

const RETRY_DELAY_MS = 800;

/**
 * Structured crop assessment schema that Gemini must follow.
 * These fields match what the chat UI renders for farmers.
 */
export const assessmentSchema = {
  observedSigns: {
    description:
      "List of visible signs observed in the farmer's description and photos",
    type: "array",
    items: { type: "string" },
  },
  possibleCauses: {
    description:
      "List of possible causes, clearly separated from confirmed observations",
    type: "array",
    items: { type: "string" },
  },
  followUpQuestions: {
    description: "Questions to ask the farmer to narrow down the diagnosis",
    type: "array",
    items: { type: "string" },
  },
  immediateActions: {
    description: "Safe, practical actions the farmer can take right now",
    type: "array",
    items: { type: "string" },
  },
  whenToSeekHelp: {
    description: "When to consult a local agricultural extension worker",
    type: "string",
  },
  uncertainty: {
    description: "Level of uncertainty (low/medium/high) and reasoning",
    type: "object",
    properties: {
      level: { type: "string", enum: ["low", "medium", "high"] },
      reason: { type: "string" },
    },
    required: ["level", "reason"],
  },
} as const;

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ContentPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

export type Content = {
  role: "user" | "model";
  parts: ContentPart[];
};

/**
 * Build the model's system instruction with optional curated guidance.
 * The guidance text is passed in by the server action and carries its own
 * provenance labels.
 */
function buildSystemPrompt(
  language: string,
  guidanceContext: string = ""
): string {
  return `
You are an agricultural assistant for Nigerian tomato farmers. Your role is to provide
preliminary, cautious crop health assessments based on the farmer's description and photos.

CRITICAL SAFETY RULES:
1. NEVER provide a definitive diagnosis from a photo alone. Always express uncertainty.
2. NEVER recommend specific pesticide names, doses, or chemical treatments, even when
   the farmer asks. Say "consult an extension worker" instead.
3. Separate visible observations (what can be seen) from inferred causes (what might be).
4. When evidence is weak, ask follow-up questions and recommend seeking local expert help.
5. Escalate severe or spreading cases to a local agricultural extension worker.
6. Respond in the farmer's chosen language.
7. Keep responses practical and actionable for smallholder farmers.
8. If curated tomato reference material is provided below, use it only as background.
   Follow its provenance labels: source-backed material was paraphrased from a cited public
   source and was NOT reviewed by an agricultural expert. NEVER describe source-backed
   guidance as expert-reviewed or authoritative. Reference its safe actions only when
   symptoms match, and do not invent treatments.
9. If an attached photo is blurry, unrelated to a tomato plant, or otherwise cannot be
   examined, say so explicitly in observedSigns and raise uncertainty. Ask for a clearer
   photo instead of guessing from it.

${guidanceContext}

OUTPUT FORMAT: Return ONLY a JSON object with these exact fields:
- observedSigns: string[] - visible signs from description/photos
- possibleCauses: string[] - possible causes (not confirmed diagnoses)
- followUpQuestions: string[] - questions to narrow down the issue
- immediateActions: string[] - safe actions the farmer can take now
- whenToSeekHelp: string - when to consult an extension worker
- uncertainty: { level: "low"|"medium"|"high", reason: string }

Do not include markdown code blocks, explanations, or text outside the JSON.
Respond in ${language}.
`;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= GENERATE_ATTEMPTS; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt < GENERATE_ATTEMPTS) {
        await new Promise((resolve) =>
          setTimeout(resolve, RETRY_DELAY_MS * attempt)
        );
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("AI assessment request failed");
}

/**
 * Fetch an image from its URL and return it as Gemini inline data.
 * Throws if the image cannot be retrieved.
 */
async function imageToInlineData(secureUrl: string): Promise<ContentPart> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(secureUrl, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    // Reject non-image responses early. An error page or JSON payload can
    // otherwise be silently forwarded to the model as if it were a photo.
    if (!isImageContentType(response.headers.get("content-type"))) {
      throw new Error("Fetched resource is not an image");
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_IMAGE_BYTES) {
      throw new Error("Image too large for analysis");
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("Image too large for analysis");
    }
    if (buffer.byteLength < MIN_IMAGE_BYTES) {
      throw new Error("Image is too small to analyze");
    }

    const bytes = new Uint8Array(buffer);
    // Trust the bytes, not the header: send the sniffed MIME type.
    const sniffed = sniffImageMimeType(bytes);
    if (!sniffed) {
      throw new Error("Fetched file is not a valid JPEG, PNG, or WebP image");
    }

    const base64 = Buffer.from(buffer).toString("base64");
    return { inlineData: { data: base64, mimeType: sniffed } };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fill only the fields that are safe to default (missing arrays, missing
 * escalation text, missing uncertainty). Wrong-but-present types are left
 * alone so the Zod schema can still reject them.
 */
function coerceAssessment(raw: unknown): unknown {
  const record =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const uncertainty =
    typeof record.uncertainty === "object" && record.uncertainty !== null
      ? (record.uncertainty as Record<string, unknown>)
      : {};

  // Missing arrays become empty; overlong arrays are trimmed to the schema
  // limit. Non-array values are left untouched so they are still rejected.
  const asArray = (value: unknown): unknown =>
    Array.isArray(value) ? value.slice(0, 20) : (value ?? []);

  const asText = (value: unknown, fallback: string): unknown =>
    typeof value === "string" && value.trim() ? value : fallback;

  return {
    observedSigns: asArray(record.observedSigns),
    possibleCauses: asArray(record.possibleCauses),
    followUpQuestions: asArray(record.followUpQuestions),
    immediateActions: asArray(record.immediateActions),
    whenToSeekHelp: asText(record.whenToSeekHelp, SAFE_HELP_FALLBACK),
    uncertainty: {
      level: uncertainty.level ?? "medium",
      reason: asText(
        uncertainty.reason,
        "Limited information available for assessment."
      ),
    },
  };
}

/**
 * Validate one parsed model response against the assessment contract.
 * Returns null when the payload cannot be recovered; callers then use the
 * safe fallback. Every coercion is logged so malformed prompts are visible.
 * The outcome is returned so monitoring can distinguish a clean response from
 * a recovered one without re-parsing.
 */
function validateAssessment(raw: unknown): {
  result: AssessmentResult | null;
  outcome: AiValidationOutcome;
} {
  const direct = assessmentResultSchema.safeParse(raw);
  if (direct.success) return { result: direct.data, outcome: "valid" };

  console.warn(
    "AI assessment did not match the schema; attempting safe recovery:",
    direct.error.issues.map((issue) => issue.path.join(".") || "(root)")
  );

  const recovered = assessmentResultSchema.safeParse(coerceAssessment(raw));
  if (recovered.success) return { result: recovered.data, outcome: "recovered" };

  console.error(
    "AI assessment could not be recovered after coercion:",
    recovered.error.issues
  );
  return { result: null, outcome: "invalid" };
}

/**
 * Metadata-only telemetry for one assessment attempt. Contains no farmer text
 * or model output; see `lib/monitoring.ts`.
 */
export type AssessmentTelemetry = {
  eventType: "assessment";
  promptVersion: string;
  modelRequested: string;
  modelUsed: string | null;
  fallbackUsed: boolean;
  fallbackAttempts: number;
  latencyMs: number;
  safetyFlagCount: number;
  imageTotal: number;
  imageFailed: number;
  validationOutcome: AiValidationOutcome;
  outcome: AiEventOutcome;
};

/**
 * Raw model response for one assessment, before any parsing or safety work.
 * The evaluation harness records these so runs can be replayed offline.
 */
export type AssessmentRawResponse = {
  text: string;
  model: string;
  /** How many candidate models were attempted before this one answered. */
  fallbackAttempts?: number;
};

export type RawAssessmentResponder = (
  contents: Content[],
  options: { language: string; guidanceContext?: string }
) => Promise<AssessmentRawResponse>;

/**
 * Call Gemini for one assessment and return the raw model text.
 *
 * Extracted from assessCropHealth so the evaluation harness can record a real
 * response once and replay it later without duplicating the multi-model
 * fallback logic.
 */
export async function generateRawAssessment(
  contents: Content[],
  options: { language: string; guidanceContext?: string }
): Promise<AssessmentRawResponse> {
  const failures: string[] = [];
  let attempts = 0;

  for (const candidate of MODEL_CANDIDATES) {
    attempts += 1;
    try {
      const model = getGenAI().getGenerativeModel({
        model: candidate,
        systemInstruction: buildSystemPrompt(
          options.language,
          options.guidanceContext ?? ""
        ),
      });

      const result = await withRetry(() =>
        withTimeout(
          model.generateContent({
            contents,
            generationConfig: {
              temperature: 0.3,
              topP: 0.8,
              topK: 40,
              maxOutputTokens: 2048,
              // Ask for machine-readable JSON instead of relying on regex alone.
              responseMimeType: "application/json",
            },
          }),
          GENERATE_TIMEOUT_MS,
          `AI assessment (${candidate})`
        )
      );

      return { text: result.response.text(), model: candidate, fallbackAttempts: attempts };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${candidate}: ${message}`);
      console.warn(
        `AI model ${candidate} failed (${message.slice(0, 200)}); trying the next configured model.`
      );
    }
  }

  // Keep provider detail (status codes, quota links) in the server log; the
  // farmer-facing action should surface a short, actionable message.
  console.error(
    `AI assessment failed for all configured models: ${failures.join("; ")}`
  );
  throw new Error(
    "AI assessment is temporarily unavailable. Please try again in a few minutes."
  );
}

/**
 * Parse, validate, and safety-process one raw model response.
 *
 * This is the only path from model text to a farmer-facing result, so it is
 * shared by the live pipeline and the offline evaluation replay.
 */
function finalizeAssessment(
  text: string,
  model: string,
  options: {
    language: string;
    evidence: { hasText: boolean; hasImages: boolean };
    imageIssues?: { total: number; failed: number };
    fallbackAttempts?: number;
    latencyMs?: number;
  }
): { assessment: AssessmentResult; model: string; telemetry: AssessmentTelemetry } {
  const { language, evidence, imageIssues } = options;

  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed: AssessmentResult | null = null;
  let validationOutcome: AiValidationOutcome = "invalid";
  try {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;
    const validated = validateAssessment(JSON.parse(jsonStr));
    parsed = validated.result;
    validationOutcome = validated.outcome;
  } catch (parseError) {
    console.error(
      "Failed to parse Gemini response:",
      parseError,
      "Raw:",
      text
    );
  }

  const fallbackAttempts = options.fallbackAttempts ?? 1;

  if (!parsed) {
    console.error(
      `AI response from ${model} could not be validated; using the safe fallback.`
    );
    return {
      assessment: { ...safeFallbackAssessment(), imageIssues },
      model,
      telemetry: {
        eventType: "assessment",
        promptVersion: PROMPT_VERSION,
        modelRequested: MODEL_NAME,
        modelUsed: model,
        fallbackUsed: fallbackAttempts > 1,
        fallbackAttempts,
        latencyMs: options.latencyMs ?? 0,
        safetyFlagCount: 0,
        imageTotal: imageIssues?.total ?? 0,
        imageFailed: imageIssues?.failed ?? 0,
        validationOutcome,
        outcome: "fallback",
      },
    };
  }

  const { result: safeResult, warnings } = applySafeguards(parsed, language);

  // Enforce the no-evidence policy, then run a final fail-closed audit over
  // every farmer-facing string. If anything still trips a rule, the entire
  // result is replaced with the safe fallback.
  const policyResult = applyEvidencePolicy(safeResult, evidence);
  const { result: auditedResult, warnings: auditWarnings } = finalAudit(
    policyResult,
    language
  );
  const allWarnings = [...warnings, ...auditWarnings];

  if (allWarnings.length > 0) {
    console.warn("AI assessment safeguards triggered:", allWarnings);
  }

  // A failed final audit replaces the whole result with the fallback, so it
  // counts as a fallback rather than a filter that kept useful content.
  const outcome: AiEventOutcome =
    auditWarnings.length > 0
      ? "fallback"
      : allWarnings.length > 0
        ? "filtered"
        : "ok";

  return {
    assessment: {
      ...auditedResult,
      imageIssues,
    },
    model,
    telemetry: {
      eventType: "assessment",
      promptVersion: PROMPT_VERSION,
      modelRequested: MODEL_NAME,
      modelUsed: model,
      fallbackUsed: fallbackAttempts > 1,
      fallbackAttempts,
      latencyMs: options.latencyMs ?? 0,
      safetyFlagCount: allWarnings.length,
      imageTotal: imageIssues?.total ?? 0,
      imageFailed: imageIssues?.failed ?? 0,
      validationOutcome,
      outcome,
    },
  };
}

/**
 * Send a crop assessment request to Gemini.
 * Accepts text symptoms, image URLs, language, prior turns, and optional
 * guidance context. Applies safeguards before returning.
 */
export async function assessCropHealth({
  symptoms,
  images,
  language,
  guidanceContext,
  guidanceCitations,
  history = [],
  generateRaw,
}: {
  symptoms: string;
  images: Array<{ secureUrl: string }>;
  language: string;
  guidanceContext?: string;
  /**
   * Trusted, server-owned references for the guidance supplied above. Attached
   * to the result so a farmer can inspect the sources; never model-generated.
   */
  guidanceCitations?: GuidanceCitation[];
  history?: ConversationTurn[];
  /**
   * Optional model responder. The evaluation harness supplies a recorded
   * function so a case can be scored offline without another API call.
   * Production leaves this undefined and uses the real Gemini client.
   */
  generateRaw?: RawAssessmentResponder;
}): Promise<{
  assessment: AssessmentResult;
  model: string;
  telemetry: AssessmentTelemetry;
}> {
  const startedAt = Date.now();

  // Prior turns give the model the context it needs for follow-up questions.
  const contents: Content[] = history
    .slice(-MAX_HISTORY_MESSAGES)
    .map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    }));

  const parts: ContentPart[] = [
    {
      text: `Language: ${language}\nFarmer's description of symptoms:\n${symptoms}\n\nAttachments: ${images.length} image(s)`,
    },
  ];

  // Send real image bytes, not just URLs, so the model can inspect the crop.
  // Track failures so the farmer can be told explicitly when a photo was not
  // examined instead of receiving an assessment that silently ignored it.
  let failedImages = 0;
  for (const [index, img] of images.entries()) {
    try {
      parts.push(await imageToInlineData(img.secureUrl));
    } catch (error) {
      failedImages += 1;
      console.error(
        `Failed to attach image ${index + 1} for AI assessment:`,
        img.secureUrl,
        error
      );
      parts.push({
        text: `[Attached crop photo ${index + 1} could not be loaded for analysis. Tell the farmer this photo could not be examined.]`,
      });
    }
  }
  const imageIssues =
    images.length > 0
      ? { total: images.length, failed: failedImages }
      : undefined;

  contents.push({ role: "user", parts });

  const responder = generateRaw ?? generateRawAssessment;
  const raw = await responder(contents, { language, guidanceContext });

  const { assessment, model, telemetry } = finalizeAssessment(
    raw.text,
    raw.model,
    {
      language,
      evidence: {
        hasText: symptoms.trim().length > 0,
        hasImages: images.length > 0,
      },
      imageIssues,
      fallbackAttempts: raw.fallbackAttempts,
      // End-to-end latency, including image fetch: this is what the farmer
      // actually waits for, so it is the number worth monitoring.
      latencyMs: Date.now() - startedAt,
    }
  );

  // Attach the trusted citations only when the model produced the assessment.
  // A safe fallback must not imply that reference material was used when it was
  // discarded.
  if (
    guidanceCitations &&
    guidanceCitations.length > 0 &&
    telemetry.outcome !== "fallback"
  ) {
    assessment.citations = guidanceCitations;
  }

  return { assessment, model, telemetry };
}
