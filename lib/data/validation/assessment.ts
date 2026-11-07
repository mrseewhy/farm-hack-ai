import { z } from "zod";

/**
 * Validation contract for structured AI crop assessments.
 *
 * The model is instructed to return this shape, but models occasionally omit
 * fields, return the wrong type, or wrap the JSON. Every model response is run
 * through this schema before it reaches the database or a farmer. Invalid
 * output is either safely recovered (missing arrays defaults to []) or replaced
 * with a safe fallback by the AI layer.
 */

export const uncertaintySchema = z.object({
  level: z.enum(["low", "medium", "high"]),
  reason: z.string().min(1).max(2000),
});

export const imageIssuesSchema = z.object({
  total: z.number().int().min(0).max(50),
  failed: z.number().int().min(0).max(50),
});

export const assessmentResultSchema = z.object({
  observedSigns: z.array(z.string().min(1)).max(20),
  possibleCauses: z.array(z.string().min(1)).max(20),
  followUpQuestions: z.array(z.string().min(1)).max(20),
  immediateActions: z.array(z.string().min(1)).max(20),
  whenToSeekHelp: z.string().min(1).max(2000),
  uncertainty: uncertaintySchema,
  // Added server-side, never supplied by the model. Persisted with the
  // assessment so saved chats can still explain a failed photo upload.
  imageIssues: imageIssuesSchema.optional(),
});

export type AssessmentResult = z.infer<typeof assessmentResultSchema>;
export type ImageIssues = z.infer<typeof imageIssuesSchema>;