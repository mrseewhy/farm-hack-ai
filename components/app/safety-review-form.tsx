"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { recordSafetyReview } from "@/lib/data/actions/admin";

/**
 * Human review form for one flagged assessment.
 *
 * This is the human-in-the-loop counterpart to the deterministic safety filter:
 * an admin records whether a medium/high-uncertainty assessment was acceptable,
 * needs follow-up, or is unsafe. Every submission is audited server-side.
 */
export function SafetyReviewForm({ assessmentId }: { assessmentId: number }) {
  const router = useRouter();
  const [decision, setDecision] = useState("approved");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setStatus("");
        try {
          await recordSafetyReview({ assessmentId, decision, notes });
          setNotes("");
          setStatus("Review saved.");
          router.refresh();
        } catch (error) {
          setStatus(
            error instanceof Error
              ? error.message
              : "Could not save the review."
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="review-decision">Decision</Label>
        <select
          id="review-decision"
          value={decision}
          onChange={(event) => setDecision(event.target.value)}
          className="flex h-9 w-full max-w-sm rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="approved">Approved — safe and usable</option>
          <option value="needs_follow_up">Needs follow-up</option>
          <option value="unsafe">Unsafe — must not be shown</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="review-notes">Notes</Label>
        <textarea
          id="review-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          required
          minLength={3}
          maxLength={2000}
          rows={3}
          placeholder="What did you check, and what should change?"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <Button type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save review"}
      </Button>
      {status && (
        <p role="status" className="text-sm text-muted-foreground">
          {status}
        </p>
      )}
    </form>
  );
}
