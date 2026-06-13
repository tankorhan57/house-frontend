## Goal
Rebuild the frontend UX of the House app to the supplied spec: a first-login profile modal, a redesigned "Health Profile" dashboard with a grey→teal completeness ring + component bars + insight cards, a richer document detail page, an upload flow that redirects to the new document, trimmed navigation, and a consistent medical-professional aesthetic. No backend/API changes — this is presentation work against the existing endpoints.

## 1. Design tokens (`src/styles.css`)
- Add a `--teal` token (e.g. `oklch(0.72 0.11 190)`) and a muted grey track token for the ring, plus `--color-teal` mapping in `@theme inline`. The ring uses grey→teal **only** (never red/amber/green) since it's a completeness meter.
- Add severity tokens for insight badges: info=blue (reuse accent), watch=amber (reuse `--soon`), urgent=red (reuse `--urgent`).

## 2. Score ring (`src/components/score-ring.tsx`)
- Remove the health-band color logic (red/amber/green). Ring always renders a grey track filling with teal as the score rises.
- Keep the number centered inside. Add an optional `label` under the number is not needed — the card supplies the "Health Profile" heading.

## 3. New onboarding modal (`src/components/onboarding-modal.tsx`)
- Uses shadcn `Dialog`. Title "Complete your Health Profile."
- Six optional fields mirroring the profile form: age (number), sex (Select: Male / Female / Prefer not to say / Other), chronic conditions, current medications, allergies (multi-line text), lifestyle notes (textarea).
- Buttons: "Save Profile" → `PUT /profile` (apiClient.saveProfile), "Skip for now" → just close.
- Shown once: after save OR skip, set a per-user `localStorage` flag (`house:onboarding:<userId>`) so it never reappears.
- Mounted in the authenticated layout (`route.tsx`), which already has the user. It queries `GET /profile`; if it resolves null/empty AND the flag isn't set, open the modal.

## 4. Dashboard redesign (`src/routes/_authenticated/index.tsx`)
- **Top — Health Profile widget** (rename card heading to "Health Profile", never "Health Score"):
  - Grey→teal `ScoreRing` showing the 0–100 score from `GET /score`.
  - Below the ring, 5 component bars from the score response `breakdown`: Documents (0–30), Biomarkers (0–20), Profile (0–20), Recency (0–20), Follow-ups (0–10). Each bar shows label, points earned / max, and a teal fill proportional to its max.
  - **Empty state** (no documents): grey ring at 0 + prominent CTA "Upload your first document to start building your health profile" linking to `/upload`.
- **Insights** from `GET /insights`: each card shows biomarker name, plain-language message, a severity badge (info=blue, watch=amber, urgent=red), and a dismiss button (`POST /insights/dismiss`, optimistic — already implemented). Empty state copy: "Upload 3+ documents with the same biomarker to see trends."
- **Recent documents** list below insights (reuse existing DocumentCard grid).

## 5. Document detail redesign (`src/routes/_authenticated/document.$id.tsx`)
- Render `interpretation` as markdown. Replace the hand-rolled parser with `react-markdown` + `remark-gfm` for reliable rendering, styled with a `prose`-like wrapper using design tokens.
- `key_findings` as a bulleted list (existing).
- `abnormal_values` table with columns **Name, Value, Unit, Reference Range, Status** (add a Status column derived from `direction`: e.g. High / Low / Normal with a subtle badge — no alarming colors beyond the existing urgency tokens).
- Append the required line "Please discuss this with your healthcare provider" to the AI interpretation section (in addition to the existing global Disclaimer).

## 6. Upload flow (`src/routes/_authenticated/upload.tsx`)
- On successful upload + process of a single file, show a success toast and **redirect to `/document/$id`** using `presign.documentId` (the id the document will have).
- While processing show a spinner with "Analyzing your document…". If processing exceeds 30s, swap the message to "Still analyzing — this can take up to a minute for complex documents." (timer started when status enters `processing`).
- Keep multi-file behavior working; redirect only applies to the single-file happy path.

## 7. Navigation (`src/routes/_authenticated/route.tsx`)
- Final nav set: **Documents** (`/`), **Upload**, **Profile**, **Settings**, **Sign out**. Remove the **Trends** entry from both the top nav and the mobile bottom nav (now a 4-item grid). The `/trends` route file stays in place but is no longer linked.

## 8. API types (`src/lib/api.ts`)
- Extend `ScoreResponse` with a `breakdown` shape covering the five components. To stay resilient to exact backend key names, read `breakdown` defensively (object keyed by component, or array of `{ label, value, max }`) and normalize to the five fixed buckets with their max points. No request/response behavior changes.

## Technical notes
- Add dependency: `react-markdown` and `remark-gfm` (used only on the document detail page).
- The exact key names inside the score `breakdown` are unknown from the frontend; the normalizer maps common variants (e.g. `documents`/`docs`, `biomarkers`, `profile`, `recency`, `follow_ups`/`followups`) to the five labeled bars with fixed maxes (30/20/20/20/10) and clamps values, so the bars render correctly regardless of casing.
- Design stays clean/medical: white card surfaces, `--shadow-card`, existing Inter typography, semantic tokens only (no hardcoded colors).
- Onboarding "show once" is client-side via localStorage keyed by user id, per the spec ("appears once — after saving or skipping, don't show again").

## Out of scope
- The separate `/process` backend failure (the "Failed to process document" error) is a server-side Lambda issue and is not addressed by this UX rebuild; the upload flow changes here are presentational.
