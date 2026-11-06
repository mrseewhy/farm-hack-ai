# Implementation tasks

Tasks are ordered so the interface is designed and demonstrated before backend services are connected. Check a task only after its stated behaviour works.

## Phase 1 — UI foundation

- [x] **Done — Create a Next.js App Router project with TypeScript and Tailwind CSS.** Done criteria: Next.js, TypeScript, and Tailwind are present and a production build succeeds.
- [x] **Done — Initialize shadcn/ui, theme tokens, icons, and theme toggle.** Done criteria: `components.json` and shadcn components exist; light/dark variables and theme control work.
- [ ] **Ongoing — Implement the colour, typography, spacing, and focus styles in `designsystem.md`.** Done criteria: Both themes use the documented palette, readable typography, spacing, and visible focus.
- [ ] **Ongoing — Add `/`, `/login`, `/signup`, `/chat`, and `/chat/[id]` route shells.** Done criteria: The public routes render, `/` redirects by session, and saved chat IDs load their conversations.
- [ ] **Ongoing — Build responsive login and signup forms with links between them and visible validation states.** Done criteria: Both forms render at phone and desktop widths, validate required fields, and cross-link.
- [ ] **Ongoing — Build the desktop sidebar with `New chat`, saved history, theme toggle, and account area.** Done criteria: New chat works, real saved history is selectable, and Profile & settings is accessible.
- [ ] **Ongoing — Build the mobile header and history drawer with accessible focus behaviour.** Done criteria: The mobile drawer opens, traps focus, and closes after navigation.
- [ ] **Ongoing — Build the empty chat state with centred introduction, language selector, photo attachment control, and composer.** Done criteria: The empty state centres the prompt and composer and exposes language and photo controls.
- [ ] **Ongoing — Build the active conversation state with user/assistant messages, bottom composer, auto-scroll behaviour, and loading/error/retry states.** Done criteria: After send, messages appear above the bottom composer; latest content stays visible and failures can be retried.
- [ ] **Todo — Add crop assessment sections for observed signs, possible causes, follow-up questions, actions, and uncertainty.** Done criteria: A real assessment displays all required fields and its uncertainty clearly.
- [ ] **Ongoing — Build `/admin/dashboard` shell with separate admin navigation, summary cards, review queue, empty/sample states, theme toggle, and responsive mobile drawer.** Done criteria: The admin dashboard renders navigation, metrics, queue, empty states, theme control, and mobile layout.
- [ ] **Ongoing — Add a basic `/admin/guidance` UI shell for draft, review, and published guidance states.** Done criteria: The guidance page displays draft, review, and published states in a usable shell.
- [ ] **Todo — Verify light/dark theme persistence, mobile keyboard layout, long translated text, keyboard navigation, and responsive widths.** Done criteria: Phone and desktop layouts, keyboard use, language wrapping, and both themes pass visual review.

- [x] **Done — Add signup language selection and Profile & settings UI.** Done criteria: Signup includes the language choice; `/profile` exposes language and password settings on desktop and mobile.

**Phase 1 done when:** the auth, chat, profile, and admin screens are coherent on desktop and phone widths in both themes. Empty states contain no invented user data.

## Phase 2 — Database and authentication

- [x] **Done — Install Drizzle ORM, Drizzle Kit, PostgreSQL driver, and Better Auth packages; set a local `DATABASE_URL`.** Done criteria: All four packages and a non-committed `DATABASE_URL` are present.
- [ ] **Todo — Confirm the Postgres host and document the required environment variables without committing secrets.** Done criteria: The Postgres host and environment variable names are recorded without credential values.
- [ ] **Todo — Configure Drizzle, schema, migrations, and database connection.** Done criteria: Drizzle can connect and run a migration against the configured database.
- [x] **Done — Configure Better Auth and implement signup, login, logout, and session persistence.** Done criteria: Better Auth can register, sign in, sign out, and restore sessions after reload; the auth migration has been applied.
- [x] **Done — Verify the Vercel production database and signup.** Done criteria: Production signup succeeds, creates a farmer with the selected language, and the record appears in the configured PostgreSQL database with all four Better Auth tables. Verified on 2026-11-06 with a temporary account that was removed afterward.
- [ ] **Ongoing — Verify the remaining production auth flow.** Done criteria: On the deployed app, a farmer can restore a session, change language and password, sign out, sign back in with the new password, and cannot access admin routes. Production requests timed out during this check.
- [x] **Done — Persist preferred language on the account and implement password changes.** Done criteria: Signup stores the choice in PostgreSQL, profile changes update it, chat loads it from the session, and the new password works after a change.
- [x] **Done — Make public signup assign the `farmer` role on the server, regardless of client input.** Done criteria: A forged `role=admin` signup request still creates a farmer.
- [ ] **Ongoing — Provision the first admin through a trusted server-side procedure; do not expose public admin registration.** Done criteria: An admin is created through the documented `auth:provision-admin` procedure on the production database, and signs in to `/admin/dashboard`.
- [ ] **Ongoing — Make `/` redirect by session role; protect `/chat`, `/chat/[id]`, `/admin/dashboard`, and admin APIs.** Done criteria: Each role reaches only its permitted routes and APIs; `/` redirects by role. Root, chat, dashboard, and guidance guards are implemented; saved chats and admin APIs remain.
- [ ] **Todo — Persist conversations and messages; replace mock history with user-owned records.** Done criteria: Chats and messages survive reload and are listed only for their owner.
- [ ] **Todo — Add authorization checks to every conversation operation and verify cross-user access is denied.** Done criteria: A second user cannot read or mutate another user’s conversation.
- [ ] **Todo — Implement admin overview data and review queue with aggregate-first data access and audit events for individual-report access.** Done criteria: Admin metrics and queue use real data; individual report access produces an audit event.
- [ ] **Todo — Add data deletion paths for conversations and linked image records.** Done criteria: Deleting a conversation removes its data and scheduled/linked media records.

**Phase 2 done when:** farmers can register and return to their chats, admins can sign in to their own dashboard, public signup cannot create admins, and neither role can access data or routes outside its permissions.

## Phase 3 — Crop images

- [ ] **Todo — Configure Cloudinary server credentials and upload method.** Done criteria: A server-controlled upload reaches Cloudinary with secrets kept server-side.
- [ ] **Todo — Validate image type, size, and count on client and server.** Done criteria: Invalid image types, sizes, and counts are rejected on client and server.
- [ ] **Todo — Support preview, removal, upload state, and upload failure recovery.** Done criteria: Preview, remove, upload progress, and retry work without losing the draft.
- [ ] **Todo — Store Cloudinary `public_id` and URL against the message; delete media when its owning record is removed.** Done criteria: Photo metadata is saved and Cloudinary media is removed on deletion.
- [ ] **Todo — Add farmer-facing photo tips and test typical phone images.** Done criteria: Photo tips are visible and representative phone photos upload successfully.

**Phase 3 done when:** a farmer can attach and revisit crop photos in a saved conversation.

## Phase 4 — AI and agricultural guidance

- [ ] **Todo — Select a Gemini model with image input and verify its current pricing/quota.** Done criteria: A chosen image-capable model and its current quota are recorded.
- [ ] **Todo — Define and validate a structured response schema for signs, possible causes, questions, actions, escalation, and uncertainty.** Done criteria: Valid model responses match the schema; malformed responses are handled safely.
- [ ] **Todo — Create a small expert-reviewed tomato guidance set and a review/update process.** Done criteria: Tomato guidance has an identified expert reviewer and a revision process.
- [ ] **Todo — Send relevant chat context, text, and photos through a server endpoint; keep API credentials server-side.** Done criteria: Text, photos, and relevant context reach the server-side AI call without exposing keys.
- [ ] **Todo — Render AI response fields in the chat and handle timeouts, malformed output, and service failures.** Done criteria: AI fields display correctly; timeout and service error states can be retried.
- [ ] **Todo — Add safeguards against unsupported pesticide names, doses, and claims of definite diagnosis.** Done criteria: Checks reject unsupported dosage and definite diagnosis language.
- [ ] **Todo — Review healthy, symptomatic, blurry, and unrelated photo examples with an agricultural expert.** Done criteria: An expert reviews healthy, symptomatic, blurry, and unrelated examples.

**Phase 4 done when:** the chat produces useful, cautious preliminary assessments and asks for more evidence when needed.

## Phase 5 — Languages and pilot

- [ ] **Todo — Add reviewed fixed UI copy for English, Yoruba, Hausa, and Igbo.** Done criteria: All fixed UI copy exists in four languages and has been reviewed.
- [ ] **Todo — Save and apply language preference in each conversation.** Done criteria: Language selection persists and the conversation uses the chosen language.
- [ ] **Todo — Evaluate AI-generated responses with native speakers and an agricultural reviewer; add Translation API only if testing shows it improves quality.** Done criteria: Native speakers and an agricultural reviewer assess outputs; translation is added only if it helps.
- [ ] **Todo — Add follow-up outcomes and feedback on whether advice helped.** Done criteria: Farmers can submit outcomes and usefulness feedback for a saved report.
- [ ] **Todo — Run a small farmer pilot; track unclear responses, wrong suggestions, and photo quality issues.** Done criteria: A pilot records issues and feedback from real farmers.
- [ ] **Todo — Refine guidance, prompts, and UI based on pilot findings before broad release.** Done criteria: Pilot findings are resolved or documented before broad release.

**Phase 5 done when:** the pilot has documented language and agricultural review, plus a clear process for correcting bad advice.

## Later options

- [ ] **Todo — Add other crops after validating crop-specific guidance.** Done criteria: A new crop has reviewed guidance and passes representative evaluation.
- [ ] **Todo — Evaluate voice input/output for the supported languages and local accents.** Done criteria: Voice works for supported languages and accents in field testing.
- [ ] **Todo — Explore regional alerts only after collecting enough reliable, consented reports and confirming the data quality.** Done criteria: Alerts use consented, reliable data and are validated before release.
