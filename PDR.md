# Product requirements document (PDR)

## 1. Product summary

A multilingual crop health assistant for Nigerian farmers. The first release supports tomato concerns through written chat and photo upload. It offers an informed preliminary assessment, explains uncertainty, and preserves conversation history.

## 2. Goals and non-goals

### Goals

- Make it easy to start a crop conversation on mobile or desktop.
- Help a farmer identify visible signs and decide what to inspect or do next.
- Support English, Yoruba, Hausa, and Igbo written conversations.
- Provide a reviewable history of reports and follow-ups.

### Outside the first release

- Definitive diagnosis from a single photo.
- Voice chat, offline mode, outbreak prediction, or support for every crop.
- Automated pesticide prescriptions or dosage recommendations without expert-approved content.
- Public homepage, marketing pages, or social features.

## 3. Primary user journey

1. A visitor opens `/` and is redirected to `/login`. A signed-in user is redirected to `/chat`.
2. A new user opens `/signup` from the login page, creates an account, and enters the chat.
3. In the default chat view, the user sees a centred welcome prompt and composer, a `New chat` action, and chat history in the sidebar.
4. The user chooses a language, types symptoms, and can attach one or more photos.
5. On send, the user message appears, the assistant shows a loading state, and the composer moves into the bottom chat position. The latest message stays in view.
6. The assistant explains observations, possible causes, uncertainty, follow-up questions, suggested immediate actions, and when to seek local expert help.
7. The user continues the conversation or opens an earlier one from the sidebar.

## 4. Routes and access

| Route | Requirement |
| --- | --- |
| `/` | Redirect to `/login` without a session, otherwise `/chat` |
| `/login` | Login form with link to `/signup` |
| `/signup` | Signup form with link to `/login` |
| `/chat` | Protected default new-chat view |
| `/chat/[id]` | Protected saved conversation belonging to the user |

Build route layouts and forms in the UI phase. Wire real session checks, account creation, and route protection in the backend phase. Do not deploy the UI-only auth as functioning authentication.

## 5. Functional requirements

### Authentication

- Users can sign up, log in, and log out.
- Forms show validation and actionable errors.
- Session state determines root redirect and access to chat routes.
- A user cannot read another user's chats or images.

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

## 6. Data model, initial draft

| Entity | Core fields |
| --- | --- |
| `users` | id, email, name, preferred_language, created_at |
| `conversations` | id, user_id, title, crop, created_at, updated_at |
| `messages` | id, conversation_id, role, content, language, status, created_at |
| `message_images` | id, message_id, cloudinary_public_id, secure_url, created_at |
| `assessments` | id, conversation_id, message_id, structured_result, model, created_at |
| `knowledge_articles` | id, crop, problem, signs, distinguishing_questions, approved_actions, reviewer, reviewed_at |
| `follow_ups` | id, conversation_id, farmer_observation, outcome, created_at |

Exact auth tables depend on the authentication implementation selected in the backend phase. Use migrations and indexes on `user_id`, `conversation_id`, and recent timestamps.

## 7. Proposed server endpoints

| Endpoint | Purpose |
| --- | --- |
| `POST /api/uploads` | Validate and upload crop photos to Cloudinary |
| `GET /api/conversations` | List the signed-in user's history |
| `POST /api/conversations` | Create a conversation when the first message is sent |
| `GET /api/conversations/[id]` | Load owned conversation and messages |
| `POST /api/conversations/[id]/messages` | Save a message and obtain the AI response |
| `POST /api/conversations/[id]/follow-ups` | Record a later outcome |

Auth endpoints depend on the chosen auth solution. All protected endpoints must derive the user from the server-side session, not a client-supplied user ID.

## 8. Quality and acceptance criteria

- Root redirect and login/signup navigation work; unauthenticated users cannot access chat after auth is wired.
- At desktop and mobile sizes, the sidebar/drawer, central chat, bottom composer, and theme toggle are usable by keyboard and touch.
- A conversation persists across reloads and appears in history after backend integration.
- Photo upload errors are clear and do not lose a typed message.
- AI replies identify uncertainty, ask follow-up questions when needed, and avoid presenting a photo-based guess as certainty.
- Native speakers and an agricultural reviewer approve a pilot set of responses in all supported languages.
- Review representative healthy, symptomatic, blurry, and unrelated photos before pilot launch.

## 9. Delivery order

1. **UI first:** design system, auth screens, chat shell, sidebar, responsive layout, themes, mock conversations and message states.
2. **Backend foundation:** Postgres, Drizzle migrations, authentication, authorization, persistent chats.
3. **Media:** Cloudinary uploads and image records.
4. **AI:** Gemini integration, structured outputs, reviewed tomato guidance, and error handling.
5. **Language and pilot:** translated UI, native-speaker review, expert evaluation, and small farmer pilot.

## 10. Open decisions

- Authentication library/provider and email delivery method.
- PostgreSQL hosting provider.
- Whether photos are retained indefinitely or deleted after a defined period.
- Who reviews agricultural guidance and translations before pilot release.
- Exact Gemini model and quota, selected when implementation begins.
