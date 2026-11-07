/**
 * Follow-up feedback vocabulary.
 *
 * The UI asks the farmer a yes/no/unsure question, but the `follow_ups.outcome`
 * column stores helped/not_helped/unsure. These two vocabularies previously
 * drifted apart, so the mapping lives here where it can be unit tested.
 */

/** The farmer's answer to "was this advice helpful?". */
export type HelpfulAnswer = "yes" | "no" | "unsure";

/** The value persisted to the `follow_ups.outcome` column. */
export type FollowUpOutcome = "helped" | "not_helped" | "unsure";

/** Map a UI helpful answer onto the persisted outcome value. */
export function helpfulToOutcome(helpful: string): FollowUpOutcome {
  if (helpful === "yes") return "helped";
  if (helpful === "no") return "not_helped";
  return "unsure";
}
