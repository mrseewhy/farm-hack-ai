# Demo walkthrough (video / live script)

A ~6-minute script that shows the farmer journey, the safety behaviour, image handling, and the admin view. It is written so a live demo is repeatable and honest about what is and is not being shown.

> **Recording note.** No video file is committed to this repository. This is the shot list and narration. Every step below was exercised against a local build with an isolated PostgreSQL instance and intentionally invalid Cloudinary credentials (to prove the failure path).

## Preparation

- Local PostgreSQL running and migrated; `npm run db:seed:guidance -- --publish` has seeded the guidance.
- `GEMINI_MODEL=gemini-3.5-flash-lite` (the fully recorded evaluation model).
- A test farmer account and an admin account (provisioned with `npm run auth:provision-admin`).
- Have `npm run eval:replay` ready as the offline fallback if the network is unavailable.

## Shot 1 — Problem framing (30s)

Narration: "Smallholder tomato growers in Nigeria lose harvests to disease and can't easily reach an extension officer. FarmHack AI gives a preliminary, multilingual assessment — and is explicit that it is not a diagnosis."

## Shot 2 — Sign up and language (45s)

1. Open `/signup`, choose **Yoruba**, create an account.
2. Show the redirect to `/chat` and that the interface is in Yoruba.
3. Point out the limitations notice under the composer.

## Shot 3 — Text assessment (60s)

1. Send a Yoruba symptom message: `Ẹ jọ̀ọ́, ewé tòmátì mi ní àwọn àmì dúdú tí ó ń tàn kálẹ̀. Kí ni ó lè fa à?`
2. As it returns, name the card sections: observed signs, possible causes, questions to check, suggested actions, when to seek help, uncertainty, and the limitations notice.
3. Point out the **high uncertainty** and the escalation to a local extension worker — the no-evidence / cautious behaviour.

## Shot 4 — Safety (45s)

1. Send a request for a pesticide and a dose, in English and again in another language.
2. Show that the answer refuses the restricted content and redirects to a local extension worker.
3. Narration: "The safety layer works in all four languages and fails closed."

## Shot 5 — Photo handling (60s)

1. Attach the licensed tomato photo from `evaluation/images/` and send it.
2. Show the assessment reflects the image.
3. Attach a deliberately blurred photo; show it is acknowledged as blurry with high uncertainty and a request for a clearer shot.
4. Attach a non-image (for example `evaluation/images/not-an-image.bin`); show the client rejects it with a clear message.
5. With the local build's invalid Cloudinary credentials, attach a valid photo and send: show the upload error, that the message is rolled back, and that the draft and photo are kept for retry.

## Shot 6 — Feedback (30s)

1. On an assessment, open **Was this advice helpful?**, choose an option, add an observation, and submit.
2. Show the thank-you message. (If narrating from a terminal, show the new row in `follow_ups`.)

## Shot 7 — History and language (30s)

1. Reload the page to show the conversation persisted, then open it from the sidebar.
2. Go to `/profile`, switch to **Hausa**, show it saved and that the chat now renders in Hausa while the earlier message keeps its original language.

## Shot 8 — Admin view (45s)

1. Sign in as the admin and open `/admin/dashboard`.
2. Show the usage metrics, the AI telemetry summary (ok / filtered / fallback / error), and the review queue.
3. Open `/admin/review/[conversationId]` and show the audited conversation review.
4. Open `/admin/guidance` and show the provenance badges (`source_backed` vs `expert_reviewed`) and that no article is expert-reviewed.

## Shot 9 — Evaluation (45s)

1. Run `npm run eval:replay` and show **38/38** pass, then `npm run test:eval`.
2. Show `evaluation/report.md`: the scope warning, the 17-case configuration check, and the bug findings.
3. Narration: "These are safety and structure results on synthetic cases — not accuracy. There is no expert-labelled dataset, so I make no accuracy claim."

## Shot 10 — Close (30s)

Narration: "This is a tested prototype with documented limits and a validation plan: expert review, native-speaker review, a consented pilot, and a labelled image set, in that order."

## Honesty checklist for the presenter

- Do not say the app "diagnoses" disease. Say "preliminary assessment".
- Do not present the 38/38 pass rate as accuracy.
- Say explicitly that the images and languages still need expert/native review.
- If something fails live (for example quota), show the retry path and the fallback rather than hiding it.
