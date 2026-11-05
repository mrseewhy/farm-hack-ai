# Design system

## Design direction

Create a calm, text-first chat interface familiar to users of modern AI chat products. Use original branding and copy. Prioritize legibility, low visual noise, and touch-friendly controls for farmers using phones in varied lighting conditions.

## Foundation

- **Framework:** Next.js, Tailwind CSS, shadcn/ui.
- **Theme:** light, dark, and system preference using CSS variables. A visible theme toggle offers light/dark selection; persist the choice.
- **Typography:** a readable sans-serif such as Geist or Inter. Use a font with reliable Yoruba diacritics and Igbo characters; verify every supported language in the actual UI.
- **Spacing:** 4px base scale. Main chat column maximum width about 768px; content may narrow on phones.
- **Radii:** medium rounding for controls and cards, larger rounding for composer; avoid excessive pill shapes.
- **Icons:** Lucide icons with text labels or accessible names.
- **Motion:** subtle transitions only; respect `prefers-reduced-motion`.

## Semantic colour tokens

Use shadcn/ui CSS-variable tokens so components work in both themes. Starting palette, subject to visual review:

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `background` | `#FFFFFF` | `#121713` | Chat canvas |
| `foreground` | `#18231B` | `#F1F5EF` | Primary text |
| `card` | `#F7F9F5` | `#1B241D` | Sidebar and surfaces |
| `muted` | `#EEF2EB` | `#273229` | Hover and secondary surfaces |
| `muted-foreground` | `#5A675D` | `#A9B7AA` | Secondary text |
| `primary` | `#236B45` | `#78C99A` | Send and active controls |
| `primary-foreground` | `#FFFFFF` | `#102016` | Text on primary |
| `border` | `#DCE5DC` | `#344237` | Dividers and inputs |
| `destructive` | `#B42318` | `#F97066` | Errors and deletion |

Meet WCAG AA contrast for actual text sizes; adjust token values if testing finds a failure. Use colour and text/icon together for states.

## Layout

### Authentication

- `/login` and `/signup` use a centred form panel on a plain background; no marketing content.
- Form width around 400px on desktop, full-width with safe padding on mobile.
- Each screen includes page title, labelled inputs, primary submit button, error area, and a clear link to the other auth screen.
- Theme toggle appears in the top-right.

### Chat, desktop

- Left sidebar around 260–280px wide, full height. Include product mark/name, `New chat`, recent conversations, theme toggle, and account/logout area.
- Main panel fills remaining width. The conversation content has a centred maximum width and ample side padding.
- Empty state places the introduction and composer around the vertical centre of the main panel.
- Active state shows message list above a sticky bottom composer. Auto-scroll to the newest message unless the user has scrolled upward.
- User and assistant messages are visually distinct without relying only on colour. Assistant replies can have structured sections for signs, possible causes, questions, and actions.

### Chat, mobile

- Sidebar becomes a drawer opened from the header. Use shadcn/ui `Sheet` with focus management.
- Header shows menu, current/new chat title, and an accessible theme control.
- Composer stays visible above mobile safe-area inset and adapts when the keyboard opens.
- Upload previews and action buttons remain touch-friendly (at least 44px targets where practical).

## Components

Use shadcn/ui components as the base, then style with project tokens:

| Component | Purpose |
| --- | --- |
| `Button` | Send, new chat, auth actions, theme control |
| `Input`, `Label`, `Form` | Auth fields and validation |
| `Textarea` | Growing chat composer |
| `Sheet` | Mobile history drawer |
| `ScrollArea` | Sidebar history and conversation scrolling where appropriate |
| `DropdownMenu` | Account actions and theme choices |
| `Select` | Language choice |
| `Avatar` | Optional sender identity |
| `Skeleton` | Loading history/messages |
| `Alert`, `Toast` | Errors, retries, and upload feedback |
| `Dialog` | Confirm destructive history/image actions |

## States and copy

- **Empty chat:** short prompt such as “What is happening with your tomato plants?” plus concise photo guidance.
- **Uploading:** visible progress or pending state; prevent duplicate submission.
- **Thinking:** non-jarring loading indicator and status text.
- **Uncertain result:** say what is visible, what is only a possibility, and what extra information would help.
- **Error:** explain what failed and offer retry without erasing the draft.
- **No history:** simple message and `New chat` action.

## Accessibility and localization

- Keyboard-operable controls, visible focus rings, form labels, descriptive upload controls, and announcement of new messages where appropriate.
- Do not force all-caps text; allow longer translated phrases to wrap.
- Verify Yoruba diacritics, Hausa spelling, Igbo characters, and line wrapping in each theme.
- Use clear plain-language labels. Avoid unexplained agronomy terms in farmer-facing copy.

## UI acceptance checklist

- Root, login, signup, empty chat, active chat, history selection, and mobile drawer look coherent in both themes.
- Composer starts centred in an empty chat and appears at the bottom after the conversation begins.
- History remains accessible on mobile and desktop.
- Theme preference persists and no flash of the wrong theme appears on load.
- UI can be demonstrated with mock data before backend integration.
