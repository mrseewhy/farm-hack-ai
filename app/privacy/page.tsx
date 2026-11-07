import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/app/brand";
import { CONSENT_POLICY_VERSION, CONSENT_PURPOSES } from "@/lib/consent";
import { retentionDaysFromEnv } from "@/lib/retention";

export const metadata: Metadata = {
  title: "Privacy and data notice — FarmHack AI",
};

/**
 * Farmer-facing privacy notice.
 *
 * The values come from the same configuration the retention worker enforces, so
 * the published policy cannot silently drift from what the scheduler does.
 */
export default function PrivacyPage() {
  const days = retentionDaysFromEnv();

  return (
    <main className="mx-auto min-h-dvh max-w-3xl px-5 py-10 sm:px-8">
      <Brand href="/" />
      <h1 className="mt-8 text-3xl font-semibold tracking-tight">
        Privacy and data notice
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Policy version {CONSENT_POLICY_VERSION}
      </p>

      <section className="mt-8 space-y-3 text-sm leading-6">
        <h2 className="text-lg font-semibold">What you agree to</h2>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          {CONSENT_PURPOSES.map((purpose) => (
            <li key={purpose}>{purpose}</li>
          ))}
        </ul>
      </section>

      <section className="mt-8 space-y-3 text-sm leading-6">
        <h2 className="text-lg font-semibold">What is stored</h2>
        <p className="text-muted-foreground">
          Your email, a securely hashed password, and your preferred language are
          stored for your account. Conversations, messages, crop photos, and
          assessments are stored so you can return to them. Operational
          telemetry records model, outcome, latency, and safety flags only — it
          never includes your text or photos.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-sm leading-6">
        <h2 className="text-lg font-semibold">How long it is kept</h2>
        <p className="text-muted-foreground">
          Conversations, messages, photos, and assessments are deleted{" "}
          {days.conversations} days after their last update by a scheduled
          cleanup job. Operational telemetry is kept for {days.telemetry} days
          and server error records for {days.errors} days. Deleting a
          conversation removes it immediately, including its stored photos.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-sm leading-6">
        <h2 className="text-lg font-semibold">Your choices</h2>
        <p className="text-muted-foreground">
          You can delete any conversation from your chat history, and you can
          download a copy of your account data from Profile &amp; settings.
        </p>
        <p className="text-muted-foreground">
          This is a prototype notice, not a legal compliance statement. It
          documents the current engineering behaviour truthfully.
        </p>
      </section>

      <div className="mt-10 flex gap-4 text-sm">
        <Link href="/signup" className="underline underline-offset-4">
          Back to sign up
        </Link>
        <Link href="/profile" className="underline underline-offset-4">
          Profile &amp; settings
        </Link>
      </div>
    </main>
  );
}
