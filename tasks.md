# Implementation tasks

Tasks are ordered so the interface is designed and demonstrated before backend services are connected. Check a task only after its stated behaviour works.

## Phase 1 — UI foundation

- [x] Create a Next.js App Router project with TypeScript and Tailwind CSS.
- [ ] Initialize shadcn/ui, CSS-variable themes, icon set, and a system/light/dark theme provider. Confirm shadcn/ui initialization by adding `components.json` and the first component; it is not yet visible in the project files.
- [ ] Implement the colour, typography, spacing, and focus styles in `designsystem.md`.
- [ ] Add `/`, `/login`, `/signup`, `/chat`, and `/chat/[id]` route shells. During the UI-only phase, use a clearly labelled mock session or local preview route; wire actual redirect/session rules in Phase 2.
- [ ] Build responsive login and signup forms with links between them and visible validation states.
- [ ] Build the desktop sidebar with `New chat`, grouped mock history, selected-chat state, theme toggle, and account area.
- [ ] Build the mobile header and history drawer with accessible focus behaviour.
- [ ] Build the empty chat state with centred introduction, language selector, photo attachment control, and composer.
- [ ] Build the active conversation state with user/assistant messages, bottom composer, auto-scroll behaviour, and loading/error/retry states.
- [ ] Add mock crop assessment cards or sections for observed signs, possible causes, follow-up questions, actions, and uncertainty.
- [ ] Verify light/dark theme persistence, mobile keyboard layout, long translated text, keyboard navigation, and responsive widths.

**Phase 1 done when:** a reviewer can navigate auth screens and demonstrate the complete chat flow with mock history and messages on desktop and phone widths, in both themes.

## Phase 2 — Database and authentication

- [x] Install Drizzle ORM, Drizzle Kit, PostgreSQL driver, and Better Auth packages; set a local `DATABASE_URL`.
- [ ] Confirm the Postgres host and document the required environment variables without committing secrets.
- [ ] Configure Drizzle, schema, migrations, and database connection.
- [ ] Configure Better Auth with the database adapter and implement signup, login, logout, and session persistence.
- [ ] Make `/` redirect by session state; protect `/chat` and `/chat/[id]`.
- [ ] Persist conversations and messages; replace mock history with user-owned records.
- [ ] Add authorization checks to every conversation operation and verify cross-user access is denied.
- [ ] Add data deletion paths for conversations and linked image records.

**Phase 2 done when:** a user can create an account, return to saved chats after reload, and cannot access another user's data.

## Phase 3 — Crop images

- [ ] Configure Cloudinary server credentials and upload method.
- [ ] Validate image type, size, and count on client and server.
- [ ] Support preview, removal, upload state, and upload failure recovery.
- [ ] Store Cloudinary `public_id` and URL against the message; delete media when its owning record is removed.
- [ ] Add farmer-facing photo tips and test typical phone images.

**Phase 3 done when:** a farmer can attach and revisit crop photos in a saved conversation.

## Phase 4 — AI and agricultural guidance

- [ ] Select a Gemini model with image input and verify its current pricing/quota.
- [ ] Define and validate a structured response schema for signs, possible causes, questions, actions, escalation, and uncertainty.
- [ ] Create a small expert-reviewed tomato guidance set and a review/update process.
- [ ] Send relevant chat context, text, and photos through a server endpoint; keep API credentials server-side.
- [ ] Render AI response fields in the chat and handle timeouts, malformed output, and service failures.
- [ ] Add safeguards against unsupported pesticide names, doses, and claims of definite diagnosis.
- [ ] Review healthy, symptomatic, blurry, and unrelated photo examples with an agricultural expert.

**Phase 4 done when:** the chat produces useful, cautious preliminary assessments and asks for more evidence when needed.

## Phase 5 — Languages and pilot

- [ ] Add reviewed fixed UI copy for English, Yoruba, Hausa, and Igbo.
- [ ] Save and apply language preference in each conversation.
- [ ] Evaluate AI-generated responses with native speakers and an agricultural reviewer; add Translation API only if testing shows it improves quality.
- [ ] Add follow-up outcomes and feedback on whether advice helped.
- [ ] Run a small farmer pilot; track unclear responses, wrong suggestions, and photo quality issues.
- [ ] Refine guidance, prompts, and UI based on pilot findings before broad release.

**Phase 5 done when:** the pilot has documented language and agricultural review, plus a clear process for correcting bad advice.

## Later options

- [ ] Add other crops after validating crop-specific guidance.
- [ ] Evaluate voice input/output for the supported languages and local accents.
- [ ] Explore regional alerts only after collecting enough reliable, consented reports and confirming the data quality.
