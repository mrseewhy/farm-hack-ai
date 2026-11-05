# Product requirements document (PDR)

## 1. Product summary

A multilingual crop health assistant for Nigerian farmers, with a separate administrator workspace. The first release supports tomato concerns through written chat and photo upload. It offers an informed preliminary assessment, explains uncertainty, and preserves conversation history. Admins manage reviewed guidance and monitor product quality.

## 2. Goals and non-goals

### Goals

- Make it easy to start a crop conversation on mobile or desktop.
- Help a farmer identify visible signs and decide what to inspect or do next.
- Support English, Yoruba, Hausa, and Igbo written conversations.
- Provide a reviewable history of reports and follow-ups.
- Give admins a private dashboard for guidance review and aggregate quality monitoring.

### Outside the first release

- Definitive diagnosis from a single photo.
- Voice chat, offline mode, outbreak prediction, or support for every crop.
- Automated pesticide prescriptions or dosage recommendations without expert-approved content.
- Public homepage, marketing pages, or social features.
- Public admin registration, unrestricted browsing of farmers' private chats, or automated outbreak claims.

## 3. Roles and access rules

| Role | Creation | Default destination | Access |
| --- | --- | --- | --- |
| Farmer | Public `/signup` | `/chat` | Own conversations, images, reports, and profile |
| Admin | Trusted server-side provisioning only | `/admin/dashboard` | Admin dashboard and explicitly permitted review workflows |

The role is stored and checked server-side. A public signup request always creates a farmer, even if it submits a role field. Admin routes and APIs must reject farmers and unauthenticated visitors. Admins should see aggregate counts by default; access to an individual farmer report requires a defined review purpose and an audit trail.

## 4. Primary user journey

1. A visitor opens `/` and is redirected to `/login`. A signed-in farmer goes to `/chat`; a signed-in admin goes to `/admin/dashboard`.
2. A new user opens `/signup` from the login page, creates an account, and enters the chat.
3. In the default chat view, the user sees a centred welcome prompt and composer, a `New chat` action, and chat history in the sidebar.
4. The user chooses a language, types symptoms, and can attach one or more photos.
5. On send, the user message appears, the assistant shows a loading state, and the composer moves into the bottom chat position. The latest message stays in view.
6. The assistant explains observations, possible causes, uncertainty, follow-up questions, suggested immediate actions, and when to seek local expert help.
7. The user continues the conversation or opens an earlier one from the sidebar.

Admin journey: an admin signs in through the same login page, lands on `/admin/dashboard`, reviews aggregate activity and flagged assessments, and maintains expert-reviewed tomato guidance. Admin accounts cannot be created from `/signup`.

## 5. Routes and access

| Route | Requirement |
| --- | --- |
| `/` | Redirect to `/login` without a session, `/chat` for farmers, `/admin/dashboard` for admins |
| `/login` | Login form with link to `/signup` |
| `/signup` | Signup form with link to `/login` |
| `/chat` | Protected default new-chat view |
| `/chat/[id]` | Protected saved conversation belonging to the user |
| `/admin/dashboard` | Protected admin overview; farmers receive an access-denied response or redirect to `/chat` |
| `/admin/guidance` | Admin-only list and review of tomato guidance; planned after dashboard shell |

Build route layouts and forms in the UI phase. Wire real session checks, account creation, and route protection in the backend phase. Do not deploy the UI-only auth as functioning authentication.

## 6. Functional requirements

### Authentication

- Users can sign up, log in, and log out.
- Forms show validation and actionable errors.
- Session state determines root redirect and access to chat routes.
- A user cannot read another user's chats or images.
- Public registration creates only `farmer` accounts. Admin accounts use a trusted provisioning process, and role changes are never accepted from a public client request.
- Login redirects by role. Farmer-only and admin-only pages and APIs enforce the role on the server.

### Admin area

- `/admin/dashboard` uses a distinct dashboard layout with sidebar navigation, page heading, theme toggle, account menu, and responsive mobile navigation.
- Initial overview cards show aggregate farmers, conversations, crop reports, flagged/uncertain assessments, and pending guidance reviews once data exists. UI-only mocks must be clearly sample data.
- A review queue lists assessments that need human attention without showing unrelated personal details by default.
- Admin guidance screens support draft, review, publish, and revision history for tomato advice after backend integration.
- Sensitive actions and access to individual reports are authorized and auditable. No admin bulk export is in the first release.

### Chat layout and interaction

- Desktop sidebar contains product name, `New chat`, conversation list grouped by recency, and account/theme controls.
- Mobile sidebar becomes an accessible drawer; the chat and composer use the available screen width.
- Empty chat has a vertically centred introduction and composer.
- After the first message, messages occupy a scrollable central column and the composer is anchored near the bottom with safe spacing for mobile keyboards.
- Sending by button or Enter works; Shift+Enter inserts a newline. Sending empty text with no image is disabled.
- Show pending, success, and failure states; preserve the draft after a failed send and allow retry.
- Selecting history opens that conversation; new chat starts an unsaved conversation until the first message is sent.
- Light and dark themes persist across visits and respect system preference initially.

### Crop photo handling

- Allow common phone image formats; validate size, type, and count on client and server.
- Show preview and removal before send.
- Store Cloudinary `public_id` with the owning conversation/report so photos can be removed when required.
- Provide photo tips: whole plant, affected part close-up, and good lighting.

### AI assessment

- Accept written symptoms and photos in the chosen language.
- Return structured fields: `observedSigns`, `possibleCauses`, `followUpQuestions`, `immediateActions`, `whenToSeekHelp`, and `uncertainty`.
- Separate visual observations from inferred causes. Say when the image is unclear or insufficient.
- Use reviewed tomato guidance as context. Avoid unsupported chemical or dosage instructions.
- Escalate uncertain, severe, or spreading cases to a local extension worker.
- Keep the underlying farmer input and assistant output for later review and correction.

### Languages

- Let the user select English, Yoruba, Hausa, or Igbo in the chat interface and save the preference.
- Translate fixed interface copy with reviewed strings.
- Test generated agricultural wording with native speakers before pilot release.
- Allow the farmer to switch language without losing their chat history.

## 7. Data model, initial draft

| Entity | Core fields |
| --- | --- |
| `users` | id, email, name, role (`farmer` or `admin`), preferred_language, created_at |
| `conversations` | id, user_id, title, crop, created_at, updated_at |
| `messages` | id, conversation_id, role, content, language, status, created_at |
| `message_images` | id, message_id, cloudinary_public_id, secure_url, created_at |
| `assessments` | id, conversation_id, message_id, structured_result, model, created_at |
| `knowledge_articles` | id, crop, problem, signs, distinguishing_questions, approved_actions, status, version, reviewer, reviewed_at |
| `follow_ups` | id, conversation_id, farmer_observation, outcome, created_at |
| `admin_audit_events` | id, admin_id, action, target_type, target_id, created_at |

Better Auth will own the authentication tables required by its configured database adapter. Place the role in a trusted server-managed user field or linked profile table, depending on the chosen Better Auth setup. Keep chat data separate from core auth records. Use migrations and indexes on `user_id`, `conversation_id`, and recent timestamps.

## 8. Proposed server endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /api/uploads` | Validate and upload crop photos to Cloudinary |
| `GET /api/conversations` | List the signed-in user's history |
| `POST /api/conversations` | Create a conversation when the first message is sent |
| `GET /api/conversations/[id]` | Load owned conversation and messages |
| `POST /api/conversations/[id]/messages` | Save a message and obtain the AI response |
| `POST /api/conversations/[id]/follow-ups` | Record a later outcome |
| `GET /api/admin/overview` | Admin-only aggregate dashboard data |
| `GET /api/admin/review-queue` | Admin-only flagged assessment queue |
| `/api/admin/guidance/*` | Admin-only guidance review and publishing operations |

Better Auth handles authentication endpoints. All protected app endpoints must derive the user from its server-side session, not a client-supplied user ID.

## 9. Quality and acceptance criteria

- Root redirect and login/signup navigation work; unauthenticated users cannot access chat after auth is wired.
- Signup cannot create an admin, and farmers cannot access admin pages or endpoints even by entering their URLs directly.
- An admin reaches `/admin/dashboard` after login and sees an understandable empty state before real data exists.
- At desktop and mobile sizes, the sidebar/drawer, central chat, bottom composer, and theme toggle are usable by keyboard and touch.
- A conversation persists across reloads and appears in history after backend integration.
- Photo upload errors are clear and do not lose a typed message.
- AI replies identify uncertainty, ask follow-up questions when needed, and avoid presenting a photo-based guess as certainty.
- Native speakers and an agricultural reviewer approve a pilot set of responses in all supported languages.
- Review representative healthy, symptomatic, blurry, and unrelated photos before pilot launch.

## 10. Delivery order

1. **UI first:** design system, auth screens, farmer chat shell, admin dashboard shell, responsive layouts, themes, and clearly labelled mock states.
2. **Backend foundation:** Postgres, Drizzle migrations, Better Auth, trusted admin provisioning, role authorization, persistent chats.
3. **Media:** Cloudinary uploads and image records.
4. **AI:** Gemini integration, structured outputs, reviewed tomato guidance, and error handling.
5. **Language and pilot:** translated UI, native-speaker review, expert evaluation, and small farmer pilot.

## 11. Open decisions

- Better Auth email/password configuration and email delivery method.
- PostgreSQL hosting provider and connection requirements; `DATABASE_URL` is already set locally.
- Whether photos are retained indefinitely or deleted after a defined period.
- Who reviews agricultural guidance and translations before pilot release.
- Exact Gemini model and quota, selected when implementation begins.
- Who receives the first admin account and how it is provisioned securely.
