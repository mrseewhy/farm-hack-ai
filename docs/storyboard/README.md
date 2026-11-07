# Demo storyboard — live deployment

This is a **screenshot storyboard**, not a video file. The browser tooling used for
verification cannot record a screencast, so the walkthrough is documented as an ordered
set of screenshots with narration. Every screenshot below was captured from the live
Vercel deployment on **2026-11-07**, not from a local mock.

- Live application: <https://farm-hack-ai.vercel.app/>
- Database: production Neon Postgres (8 Drizzle migrations applied, 12 application tables)
- Image hosting: production Cloudinary account (`dcdychfzw`)
- Model: `gemini-3.5-flash-lite`, with configured fallbacks
- Interface language in the main farmer shots: Yoruba; language-switch shots use Hausa
- Test account: a dedicated fellowship demo farmer (not a real user)

The companion narration and preparation checklist are in
[`docs/demo-walkthrough.md`](../demo-walkthrough.md).

## Shot list

### 1. Sign in / problem framing — `01-login-landing.png`

Narration: "Smallholder tomato growers in Nigeria lose harvests to disease and cannot
easily reach an extension officer. FarmHack AI gives a preliminary, multilingual
assessment — and is explicit that it is not a diagnosis."

The landing page doubles as the sign-in screen. The sign-in journey was exercised with
the demo farmer account; authenticated admins are redirected to the admin workspace.

### 2. Sign up and language — `02-signup-yoruba.png`

Narration: "A new farmer creates an account and picks Yoruba before the first message."

The screenshot shows the signup form with **Yoruba** selected. The live account was
created through this form and landed on `/chat` with the interface in Yoruba.

### 3. Guided intake — `03-chat-guided.png`

Narration: "Rather than starting from a blank page, the farmer can tap a common sign.
The chips and the limitations notice are localized."

The empty chat state shows seven guided symptom chips in Yoruba, photo guidance, and the
notice that the answer is an AI preliminary assessment, not a diagnosis.

### 4. Text assessment and citations — `04-text-assessment.png`

Narration: "The farmer describes yellowing leaves. The answer separates observed signs,
possible causes, things to check, suggested actions, when to seek help, and uncertainty.
The five source-backed references are attached by the server, not invented by the model."

Live result: `gemini-3.5-flash-lite`, `outcome=ok`, high uncertainty, five UC IPM
citations rendered in Yoruba with publisher, title, URL, and access date.

### 5. Photo assessment — `05-image-assessment.png`

Narration: "A real photo is uploaded to Cloudinary and passed to the model. The answer
reflects the image: water-soaked spots, purple-brown lesions, white mould underneath."

Live result: a 170 KB tomato late-blight photo was uploaded to the production Cloudinary
account and assessed successfully. Telemetry event `23`: `gemini-3.5-flash-lite`,
`latency_ms=4494`, `image_total=1`, `image_failed=0`, `validation_outcome=valid`,
`outcome=ok`.

> The earlier live attempts failed after three fallback attempts because the old 20 s
> image timeout was too short for the full prompt. The fix is in `lib/ai.ts` (30 s per
> image attempt, 55 s total budget) and was verified locally and then on the live
> deployment. The two pre-fix failures remain visible in the admin telemetry as an
> honest record.

### 6. Citations and feedback prompt — `06-citations.png`

Narration: "Every assessment ends with the same source-backed block and the reminder to
consult a local extension worker. The farmer can say whether the advice helped."

The screenshot shows the citation block, the limitations notice, and the feedback prompt.

### 7. Language preference — `07-profile-yoruba.png`

Narration: "Language is saved to the account, not just the browser."

The profile page shows Yoruba as the saved preference.

### 8. Language switch — `08-profile-hausa.png`

Narration: "The farmer switches to Hausa. The confirmation is immediate and the setting
is persisted server-side."

### 9. Existing conversation keeps its language — `09-chat-hausa.png`

Narration: "The interface is now Hausa, while the earlier Yoruba message and its
assessment keep their original language."

This demonstrates that changing the interface language does not rewrite stored content.

### 10. Safety refusal — `10-safety-refusal.png`

Narration: "Asked for a specific pesticide product and dose, the assistant refuses to
provide it and redirects the farmer to a local agricultural extension worker."

The screenshot shows the request, the cautious structured answer, high uncertainty, and
the escalation. This was a live model call, not a canned response.

### 11. Admin dashboard — `11-admin-dashboard.png`

Narration: "The admin view shows farmer and conversation counts, the review queue, and
AI pipeline health."

The screenshot shows the review queue and the telemetry summary. The two errors are the
pre-fix image-assessment failures; they are shown rather than hidden. The fix is visible
as the later successful event in the database and in the review page.

### 12. Admin review — `12-admin-review.png`

Narration: "A flagged conversation opens as a read-only, audited review with the
assessment, uncertainty, and the full message history."

### 13. Guidance provenance — `13-admin-guidance.png`

Narration: "Curated guidance carries its provenance. Articles are marked source-backed,
not expert-reviewed, because no agronomist has signed them off yet."

The five published tomato articles show publisher, title, URL, access date, licence, and
the `source-backed` badge.

## Evaluation evidence (no screenshot)

The evaluation is an offline replay against recorded model responses, not a live
accuracy measurement.

- `npm run eval:replay` — **38/38** recorded cases pass structural and safety checks.
- `npm run test:eval` — scoring tests pass.
- Full comparison and the pre-fix bug findings: [`evaluation/report.md`](../../evaluation/report.md).

Narration: "These are safety and structure results on synthetic cases — not accuracy.
There is no expert-labelled dataset, so I make no accuracy claim."

## Close

Narration: "This is a tested prototype with documented limits and a validation plan:
expert review, native-speaker review, a consented pilot, and a labelled image set, in
that order."

See [`docs/validation-plan.md`](../validation-plan.md) and
[`docs/case-study.md`](../case-study.md) for the limits and next steps.

## Honesty checklist

- Do not say the app "diagnoses" disease. Say "preliminary assessment".
- Do not present the 38/38 replay pass rate as accuracy.
- State that the guidance is source-backed, not expert-reviewed.
- State that images and translations still need expert and native-speaker review.
- Show the pre-fix telemetry errors rather than hiding them.
