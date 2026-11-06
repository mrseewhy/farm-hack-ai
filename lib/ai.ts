import { GoogleGenerativeAI } from "@google/generative-ai";

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

export type AssessmentResult = {
  observedSigns: string[];
  possibleCauses: string[];
  followUpQuestions: string[];
  immediateActions: string[];
  whenToSeekHelp: string;
  uncertainty: {
    level: "low" | "medium" | "high";
    reason: string;
  };
};

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

type ContentPart =
  | { text: string }
  | { inlineData: { data: string; mimeType: string } };

type Content = {
  role: "user" | "model";
  parts: ContentPart[];
};

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
];

/** Definite-diagnosis phrasing that must never be presented as fact. */
function checkDefiniteDiagnosis(text: string): string[] {
  const definitePatterns = [
    /this is (definitely|certainly|absolutely|clearly) /i,
    /the diagnosis is /i,
    /your plant has /i,
    /it is (definitely|certainly|absolutely|clearly) /i,
    /confirmed (diagnosis|case of)/i,
    /positive for /i,
  ];

  return definitePatterns
    .filter((pattern) => pattern.test(text))
    .map((pattern) => pattern.source);
}

function checkRestrictedPesticides(text: string): string[] {
  const lowerText = text.toLowerCase();
  return RESTRICTED_PESTICIDES.filter((pesticide) =>
    lowerText.includes(pesticide.toLowerCase())
  );
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
function collectFlags(
  text: string,
  language: string,
  options: { includeDiagnosis?: boolean } = {}
): string[] {
  const flags = [
    ...checkRestrictedPesticides(text),
    ...checkDoseRecommendations(text),
  ];

  if (options.includeDiagnosis) {
    flags.push(...checkDefiniteDiagnosis(text));
  }

  if (language !== "English" && /\d/.test(text)) {
    flags.push("numeric quantity in a non-English response");
  }

  return flags;
}

const SAFE_HELP_FALLBACK =
  "Consult a local agricultural extension worker if you are unsure.";

/**
 * Apply safeguards to the AI assessment result.
 * Removes restricted pesticide names, definite diagnoses, and dose
 * recommendations from every farmer-facing field, and escalates uncertainty.
 */
function applySafeguards(
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
    const flags = checkRestrictedPesticides(sign);
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

  const uncertaintyReason =
    warnings.length > 0
      ? `${result.uncertainty.reason} Some content was filtered for safety (${warnings.length} item(s) removed).`
      : result.uncertainty.reason;

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
    },
    warnings,
  };
}

/**
 * Build the model's system instruction with optional expert-reviewed guidance.
 * The guidance text is passed in by the server action.
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
8. Use the expert-reviewed tomato guidance below as context. Reference approved actions
   when symptoms match known problems. Do not invent treatments.

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

    const contentLength = response.headers.get("content-length");
    if (contentLength && Number(contentLength) > MAX_IMAGE_BYTES) {
      throw new Error("Image too large for analysis");
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error("Image too large for analysis");
    }

    const base64 = Buffer.from(buffer).toString("base64");
    const mimeType = response.headers.get("content-type") ?? "image/jpeg";
    return { inlineData: { data: base64, mimeType } };
  } finally {
    clearTimeout(timeoutId);
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/** Normalize an arbitrary parsed object into the assessment contract. */
function normalizeAssessment(raw: unknown): AssessmentResult {
  const record =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : {};
  const uncertainty =
    typeof record.uncertainty === "object" && record.uncertainty !== null
      ? (record.uncertainty as Record<string, unknown>)
      : {};

  return {
    observedSigns: toStringArray(record.observedSigns),
    possibleCauses: toStringArray(record.possibleCauses),
    followUpQuestions: toStringArray(record.followUpQuestions),
    immediateActions: toStringArray(record.immediateActions),
    whenToSeekHelp:
      typeof record.whenToSeekHelp === "string"
        ? record.whenToSeekHelp
        : SAFE_HELP_FALLBACK,
    uncertainty: {
      level: ["low", "medium", "high"].includes(String(uncertainty.level))
        ? (uncertainty.level as "low" | "medium" | "high")
        : "medium",
      reason:
        typeof uncertainty.reason === "string"
          ? uncertainty.reason
          : "Limited information available for assessment.",
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
  history = [],
}: {
  symptoms: string;
  images: Array<{ secureUrl: string }>;
  language: string;
  guidanceContext?: string;
  history?: ConversationTurn[];
}): Promise<{ assessment: AssessmentResult; model: string }> {
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
  for (const [index, img] of images.entries()) {
    try {
      parts.push(await imageToInlineData(img.secureUrl));
    } catch (error) {
      console.error(
        `Failed to attach image ${index + 1} for AI assessment:`,
        img.secureUrl,
        error
      );
      parts.push({
        text: `[Attached crop photo ${index + 1} could not be loaded for analysis.]`,
      });
    }
  }

  contents.push({ role: "user", parts });

  const failures: string[] = [];

  for (const candidate of MODEL_CANDIDATES) {
    let text: string;

    try {
      const model = getGenAI().getGenerativeModel({
        model: candidate,
        systemInstruction: buildSystemPrompt(language, guidanceContext ?? ""),
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

      text = result.response.text();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${candidate}: ${message}`);
      console.warn(
        `AI model ${candidate} failed; trying the next configured model.`
      );
      continue;
    }

    const cleaned = text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/, "")
      .trim();

    let parsed: AssessmentResult;
    try {
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : cleaned;
      parsed = normalizeAssessment(JSON.parse(jsonStr));
    } catch (parseError) {
      console.error(
        "Failed to parse Gemini response:",
        parseError,
        "Raw:",
        text
      );
      return { assessment: fallbackAssessment(), model: candidate };
    }

    const { result: safeResult, warnings } = applySafeguards(parsed, language);

    if (warnings.length > 0) {
      console.warn("AI assessment safeguards triggered:", warnings);
    }

    return { assessment: safeResult, model: candidate };
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

/** Safe response used when the model responds but its JSON cannot be parsed. */
function fallbackAssessment(): AssessmentResult {
  return {
    observedSigns: [],
    possibleCauses: [],
    followUpQuestions: ["Could you describe the symptoms in more detail?"],
    immediateActions: [
      "Consult a local agricultural extension worker for assistance.",
    ],
    whenToSeekHelp: "Please consult a local agricultural extension worker.",
    uncertainty: {
      level: "high",
      reason:
        "Unable to process the AI assessment. Please try again or consult an expert.",
    },
  };
}
