import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI: GoogleGenerativeAI | null = null;

function getGenAI() {
  if (!genAI) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not set. Configure it to enable AI crop assessment.");
    }
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return genAI;
}

const MODEL_NAME = "gemini-1.5-flash";

// Fetch timeout and size cap for images sent to the model. Cloudinary images
// are already transformed to a bounded size, but a stalled or oversized
// response must not hold the request or consume unbounded memory.
const IMAGE_FETCH_TIMEOUT_MS = 20_000;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * Structured crop assessment schema that Gemini must follow.
 * These fields match what the chat UI renders for farmers.
 */
export const assessmentSchema = {
  observedSigns: {
    description: "List of visible signs observed in the farmer's description and photos",
    type: "array",
    items: { type: "string" },
  },
  possibleCauses: {
    description: "List of possible causes, clearly separated from confirmed observations",
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

/**
 * List of pesticide active ingredients that must NOT be recommended
 * without expert-reviewed guidance. This is a safeguard list.
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
];

/**
 * Check if text contains definite diagnosis language that should be avoided.
 * Returns an array of flagged phrases found.
 */
function checkDefiniteDiagnosis(text: string): string[] {
  const definitePatterns = [
    /this is (definitely|certainly|absolutely|clearly) /i,
    /the diagnosis is /i,
    /your plant has /i,
    /it is (definitely|certainly|absolutely|clearly) /i,
    /confirmed (diagnosis|case of)/i,
    /positive for /i,
  ];

  const flags: string[] = [];
  for (const pattern of definitePatterns) {
    if (pattern.test(text)) {
      flags.push(pattern.source);
    }
  }
  return flags;
}

/**
 * Check if text contains pesticide names from the restricted list.
 * Returns an array of flagged pesticide names found.
 */
function checkRestrictedPesticides(text: string): string[] {
  const found: string[] = [];
  const lowerText = text.toLowerCase();
  for (const pesticide of RESTRICTED_PESTICIDES) {
    if (lowerText.includes(pesticide.toLowerCase())) {
      found.push(pesticide);
    }
  }
  return found;
}

/**
 * Check if text contains dose/recommendation patterns that should be avoided.
 * Returns an array of flagged phrases found.
 */
function checkDoseRecommendations(text: string): string[] {
  const dosePatterns = [
    /\d+\s*(ml|liter|litre|spoon|cap|tablespoon|teaspoon|g|kg|gram|kilogram)/i,
    /(mix|dilute|spray|apply|use)\s+\d+/i,
    /\d+\s*(per|in|for)\s+(liter|litre|gal|gallon|acre|hectare)/i,
  ];

  const flags: string[] = [];
  for (const pattern of dosePatterns) {
    if (pattern.test(text)) {
      flags.push(pattern.source);
    }
  }
  return flags;
}

/**
 * Apply safeguards to the AI assessment result.
 * Removes restricted pesticide names, definite diagnoses, and dose recommendations
 * from immediateActions and possibleCauses, and escalates uncertainty.
 */
function applySafeguards(result: AssessmentResult): {
  result: AssessmentResult;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check possibleCauses for definite diagnosis language
  const safeCauses: string[] = [];
  for (const cause of result.possibleCauses) {
    const diagnosisFlags = checkDefiniteDiagnosis(cause);
    const pesticideFlags = checkRestrictedPesticides(cause);
    const doseFlags = checkDoseRecommendations(cause);

    if (diagnosisFlags.length > 0 || pesticideFlags.length > 0 || doseFlags.length > 0) {
      warnings.push(
        `Possible cause removed for safety: "${cause}" (${[
          ...diagnosisFlags,
          ...pesticideFlags,
          ...doseFlags,
        ].join(", ")})`
      );
    } else {
      safeCauses.push(cause);
    }
  }

  // Check immediateActions for pesticide names, doses, and definite diagnosis
  const safeActions: string[] = [];
  for (const action of result.immediateActions) {
    const diagnosisFlags = checkDefiniteDiagnosis(action);
    const pesticideFlags = checkRestrictedPesticides(action);
    const doseFlags = checkDoseRecommendations(action);

    if (diagnosisFlags.length > 0 || pesticideFlags.length > 0 || doseFlags.length > 0) {
      warnings.push(
        `Action removed for safety: "${action}" (${[
          ...diagnosisFlags,
          ...pesticideFlags,
          ...doseFlags,
        ].join(", ")})`
      );
    } else {
      safeActions.push(action);
    }
  }

  // Check observedSigns for pesticide names
  const safeSigns: string[] = [];
  for (const sign of result.observedSigns) {
    const pesticideFlags = checkRestrictedPesticides(sign);
    if (pesticideFlags.length > 0) {
      warnings.push(
        `Observed sign removed for safety: "${sign}" (${pesticideFlags.join(", ")})`
      );
    } else {
      safeSigns.push(sign);
    }
  }

  // If any safeguards triggered, escalate uncertainty
  let uncertaintyLevel = result.uncertainty.level;
  if (warnings.length > 0 && uncertaintyLevel === "low") {
    uncertaintyLevel = "medium";
  }
  if (warnings.length > 2 && uncertaintyLevel === "medium") {
    uncertaintyLevel = "high";
  }

  const uncertaintyReason = warnings.length > 0
    ? `${result.uncertainty.reason} Some content was filtered for safety (${warnings.length} item(s) removed).`
    : result.uncertainty.reason;

  const safeResult: AssessmentResult = {
    observedSigns: safeSigns,
    possibleCauses: safeCauses,
    followUpQuestions: result.followUpQuestions,
    immediateActions: safeActions,
    whenToSeekHelp: result.whenToSeekHelp,
    uncertainty: {
      level: uncertaintyLevel,
      reason: uncertaintyReason,
    },
  };

  return { result: safeResult, warnings };
}

/**
 * Build the system prompt with optional expert-reviewed guidance context.
 * The guidance text is passed in by the caller (server action).
 */
function buildSystemPrompt(language: string, guidanceContext: string = ""): string {
  return `
You are an agricultural assistant for Nigerian tomato farmers. Your role is to provide
preliminary, cautious crop health assessments based on the farmer's description and photos.

CRITICAL SAFETY RULES:
1. NEVER provide a definitive diagnosis from a photo alone. Always express uncertainty.
2. NEVER recommend specific pesticide names, doses, or chemical treatments without
   expert-reviewed guidance. Say "consult an extension worker" instead.
3. Separate visible observations (what can be seen) from inferred causes (what might be).
4. When evidence is weak, ask follow-up questions and recommend seeking local expert help.
5. Escalate severe or spreading cases to a local agricultural extension worker.
6. Respond in the farmer's chosen language when possible.
7. Keep responses practical and actionable for smallholder farmers.
8. Use the expert-reviewed tomato guidance above as context. Reference approved actions
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
Respond in ${language} when possible.
`;
}

/**
 * Send a crop assessment request to Gemini.
 * Accepts text symptoms, image URLs, language, and optional guidance context.
 * Applies safeguards to remove unsafe content before returning.
 */
/**
 * Fetch an image from its URL and return it as Gemini inline data (base64 + mimeType).
 * Throws if the image cannot be retrieved.
 */
async function imageToInlineData(secureUrl: string) {
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

export async function assessCropHealth({
  symptoms,
  images,
  language,
  guidanceContext,
}: {
  symptoms: string;
  images: Array<{ secureUrl: string }>;
  language: string;
  guidanceContext?: string;
}): Promise<AssessmentResult> {
  const model = getGenAI().getGenerativeModel({ model: MODEL_NAME });

  // Build the content parts
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

  // Add system-like instruction as text
  const systemPrompt = buildSystemPrompt(language, guidanceContext ?? "");
  parts.push({ text: systemPrompt });

  // Add the farmer's input
  parts.push({
    text: `Language: ${language}\nFarmer's description of symptoms:\n${symptoms}\n\nAttachments: ${images.length} image(s)`,
  });

  // Add images as real inline image data (not just URLs as text) so the model
  // receives the actual image bytes for analysis.
  if (images.length > 0) {
    for (const [index, img] of images.entries()) {
      try {
        parts.push(await imageToInlineData(img.secureUrl));
      } catch (error) {
        console.error(`Failed to attach image ${index + 1} for AI assessment:`, img.secureUrl, error);
        parts.push({
          text: `[Attached crop photo ${index + 1} could not be loaded for analysis.]`,
        });
      }
    }
  }

  const result = await model.generateContent({
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.3,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 2048,
    },
  });

  const response = result.response;
  const text = response.text();

  // Parse JSON from response
  let parsed: AssessmentResult;
  try {
    // Extract JSON from the response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    const raw = JSON.parse(jsonStr);

    // Validate and normalize the response
    parsed = {
      observedSigns: Array.isArray(raw.observedSigns) ? raw.observedSigns : [],
      possibleCauses: Array.isArray(raw.possibleCauses) ? raw.possibleCauses : [],
      followUpQuestions: Array.isArray(raw.followUpQuestions) ? raw.followUpQuestions : [],
      immediateActions: Array.isArray(raw.immediateActions) ? raw.immediateActions : [],
      whenToSeekHelp:
        typeof raw.whenToSeekHelp === "string"
          ? raw.whenToSeekHelp
          : "Consult a local agricultural extension worker if you are unsure.",
      uncertainty: {
        level: ["low", "medium", "high"].includes(raw.uncertainty?.level)
          ? raw.uncertainty.level
          : "medium",
        reason:
          typeof raw.uncertainty?.reason === "string"
            ? raw.uncertainty.reason
            : "Limited information available for assessment.",
      },
    };
  } catch (parseError) {
    console.error("Failed to parse Gemini response:", parseError, "Raw:", text);
    // Return a safe fallback response
    return {
      observedSigns: [],
      possibleCauses: [],
      followUpQuestions: ["Could you describe the symptoms in more detail?"],
      immediateActions: ["Consult a local agricultural extension worker for assistance."],
      whenToSeekHelp: "Please consult a local agricultural extension worker.",
      uncertainty: {
        level: "high",
        reason: "Unable to process the AI assessment. Please try again or consult an expert.",
      },
    };
  }

  // Apply safeguards to remove unsafe content
  const { result: safeResult, warnings } = applySafeguards(parsed);

  if (warnings.length > 0) {
    console.warn("AI assessment safeguards triggered:", warnings);
  }

  return safeResult;
}
