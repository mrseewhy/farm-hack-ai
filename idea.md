# Project idea: multilingual crop health assistant

## Purpose

Help Nigerian farmers notice crop problems early, understand possible causes, and take informed next steps. The motivating example is severe tomato loss after subtle symptoms were missed. The product must never assume that yellowing alone identifies a particular pest or disease.

## Initial audience and scope

- Farmers in Nigeria using a phone or computer.
- Start with tomatoes and written English, Yoruba, Hausa, and Igbo.
- Farmers can describe symptoms in a chat and attach crop photos.
- The assistant explains visible signs, possible causes, what to inspect next, practical actions, and when to seek an agricultural extension worker.
- Users can return to previous conversations from a sidebar.

## Product experience

There are no public marketing pages. Visiting `/` sends an unauthenticated visitor to `/login` and an authenticated user to `/chat`. Login links to signup. The signed-in default view is a simple chat interface: conversation history on the left, a centred empty-state composer, and messages that fill the conversation area while the composer settles at the bottom as the conversation grows. A light/dark theme toggle is always accessible.

## Technology choices

| Area | Choice | Role |
| --- | --- | --- |
| App | Next.js with TypeScript and App Router | UI, routing, and server endpoints |
| UI | Tailwind CSS and shadcn/ui | Accessible components and styling |
| Data | PostgreSQL and Drizzle ORM | Users, conversations, messages, crop reports, follow-ups |
| Images | Cloudinary | Crop photo upload, delivery, and deletion |
| AI | Gemini API | Multimodal chat and preliminary photo interpretation |
| Translation | Google Cloud Translation API, optional | Fallback or comparison for supported written languages after quality testing |

## APIs and services

1. **Gemini API**: Send the farmer's text, image input, selected language, and reviewed crop guidance. Request a structured answer with observations, possible causes, uncertainty, follow-up questions, and actions. Use a model with image input and check its current free-tier limits before deployment: https://ai.google.dev/gemini-api/docs/pricing and https://ai.google.dev/gemini-api/docs/image-understanding.
2. **Cloudinary Upload/Media API**: Upload crop photos through a server-controlled or signed flow; save `public_id` and delivery URL in Postgres. Keep secrets server-side: https://cloudinary.com/documentation/image_upload_api_reference.
3. **Google Cloud Translation API (optional)**: Translate or compare written Yoruba (`yo`), Hausa (`ha`), and Igbo (`ig`) output if native-speaker testing finds a need. Hausa and Igbo support is marked experimental, so do not trust it without review: https://docs.cloud.google.com/translate/docs/languages and https://cloud.google.com/products/translate/pricing.
4. **PostgreSQL**: Database service, accessed through Drizzle. Drizzle is a library, not an external API. Choose a hosted provider during backend setup; keep the connection string server-side.
5. **Authentication**: Implement email/password or a chosen auth provider during the backend phase. The login and signup UI can be built first, but real sessions, password handling, and protected routes must be complete before a live pilot.

Pl@ntNet is not needed for the tomato-only MVP. It identifies plant species, not the cause of crop damage; reconsider it when the app supports unknown crops.

## Principles

- State uncertainty and ask for another photo or more details when evidence is weak.
- Use expert-reviewed crop guidance for actionable recommendations, especially chemical treatments.
- Let farmers choose their language; validate terminology with native speakers.
- Minimize stored personal and location data, and make image retention clear.
- Build the chat UI first, then connect auth, persistence, uploads, and AI in that order.
