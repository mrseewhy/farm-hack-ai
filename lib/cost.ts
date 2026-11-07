/**
 * Approximate model cost accounting.
 *
 * Token counts are provider-reported. Prices are NOT discovered at runtime:
 * they come from deployment configuration so an operator can enter the rates
 * that apply to their Gemini contract. The defaults are conservative Flash
 * list prices and must be reviewed before using the dashboard as a billing
 * source. Every stored cost is therefore labelled an estimate.
 *
 * This module is dependency-free so the unit test runner can execute it.
 */

/** USD per one million input tokens. Override with GEMINI_INPUT_COST_PER_M_USD. */
export const DEFAULT_INPUT_COST_PER_MILLION_USD = 0.3;
/** USD per one million output tokens. Override with GEMINI_OUTPUT_COST_PER_M_USD. */
export const DEFAULT_OUTPUT_COST_PER_MILLION_USD = 2.5;

export type CostRates = {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
};

function positiveNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Read rates from the environment, falling back to the documented defaults. */
export function costRatesFromEnv(
  env: Record<string, string | undefined> = process.env
): CostRates {
  return {
    inputPerMillionUsd: positiveNumber(
      env.GEMINI_INPUT_COST_PER_M_USD,
      DEFAULT_INPUT_COST_PER_MILLION_USD
    ),
    outputPerMillionUsd: positiveNumber(
      env.GEMINI_OUTPUT_COST_PER_M_USD,
      DEFAULT_OUTPUT_COST_PER_MILLION_USD
    ),
  };
}

/**
 * Estimate cost in integer micro-USD (1 USD = 1,000,000 micro-USD).
 *
 * Integer storage avoids floating-point drift in aggregate reporting. Invalid
 * or negative token counts contribute zero rather than throwing; telemetry
 * must never break an assessment.
 */
export function estimateCostMicroUsd(
  inputTokens: number,
  outputTokens: number,
  rates: CostRates = costRatesFromEnv()
): number {
  const safeInput =
    Number.isFinite(inputTokens) && inputTokens > 0 ? inputTokens : 0;
  const safeOutput =
    Number.isFinite(outputTokens) && outputTokens > 0 ? outputTokens : 0;

  const usd =
    (safeInput / 1_000_000) * rates.inputPerMillionUsd +
    (safeOutput / 1_000_000) * rates.outputPerMillionUsd;

  return Math.round(usd * 1_000_000);
}

/** Format micro-USD for display, preserving tiny values instead of rounding to $0.00. */
export function formatMicroUsd(microUsd: number): string {
  const safe = Number.isFinite(microUsd) ? Math.max(0, microUsd) : 0;
  const usd = safe / 1_000_000;
  if (usd === 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(6)}`;
  return `$${usd.toFixed(2)}`;
}
