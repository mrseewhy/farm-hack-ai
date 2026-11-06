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
 * System prompt for Gemini - instructs it to be cautious, avoid definite diagnoses,
 * separate observations from inferences, and never recommend unsupported pesticides/doses.
 */
const SYSTEM_PROMPT = `
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

OUTPUT FORMAT: Return ONLY a JSON object with these exact fields:
- observedSigns: string[] - visible signs from description/photos
- possibleCauses: string[] - possible causes (not confirmed diagnoses)
- followUpQuestions: string[] - questions to narrow down the issue
- immediateActions: string[] - safe actions the farmer can take now
- whenToSeekHelp: string - when to consult an extension worker
- uncertainty: { level: "low"|"medium"|"high", reason: string }

Do not include markdown code blocks, explanations, or text outside the JSON.
`;

/**
 * Send a crop assessment request to Gemini.
 * Accepts text symptoms, image URLs (base64 or URLs), and language.
 */
export async function assessCropHealth({
  symptoms,
  images,
  language,
}: {
  symptoms: string;
  images: Array<{ secureUrl: string }>;
  language: string;
}): Promise<AssessmentResult> {
  const model = getGenAI().getGenerativeModel({ model: MODEL_NAME });

  // Build the content parts
  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];

  // Add system-like instruction as text
  parts.push({ text: SYSTEM_PROMPT });

  // Add the farmer's input
  parts.push({
    text: `Language: ${language}\nFarmer's description of symptoms:\n${symptoms}\n\nAttachments: ${images.length} image(s)`,
  });

  // Add images as inline data (Gemini supports image URLs via inline data or file URIs)
  // For simplicity, we pass image URLs as text descriptions since we can't fetch them here
  // In production, images should be downloaded and passed as base64 inline data
  if (images.length > 0) {
    parts.push({
      text: `Attached crop photos (${images.length}): ${images.map((img, i) => `Image ${i + 1}: ${img.secureUrl}`).join(", ")}`,
    });
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
  try {
    // Extract JSON from the response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    const parsed = JSON.parse(jsonStr);

    // Validate and normalize the response
    return {
      observedSigns: Array.isArray(parsed.observedSigns) ? parsed.observedSigns : [],
      possibleCauses: Array.isArray(parsed.possibleCauses) ? parsed.possibleCauses : [],
      followUpQuestions: Array.isArray(parsed.followUpQuestions) ? parsed.followUpQuestions : [],
      immediateActions: Array.isArray(parsed.immediateActions) ? parsed.immediateActions : [],
      whenToSeekHelp: typeof parsed.whenToSeekHelp === "string" ? parsed.whenToSeekHelp : "Consult a local agricultural extension worker if you are unsure.",
      uncertainty: {
        level: ["low", "medium", "high"].includes(parsed.uncertainty?.level) ? parsed.uncertainty.level : "medium",
        reason: typeof parsed.uncertainty?.reason === "string" ? parsed.uncertainty.reason : "Limited information available for assessment.",
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
}
