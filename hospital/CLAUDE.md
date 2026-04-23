# hospital-mockup/ · AI assistant brief

Vite + React 18 + TypeScript · Tailwind + custom typography · Motion. High-fidelity mockup; no backend wiring yet.

Part of the Polyglot-Attest monorepo; see `../CLAUDE.md` for project-wide context and user conventions.

## The aesthetic is intentional

**Editorial medical journal** — *The Lancet* meets a Bloomberg terminal. Aged paper, serif-heavy typography, oxblood/ocean/amber/forest accent colors per department, ornamental marks (§ ◆ ○ ◇). **Not** Stripe minimalism. **Not** a Material Design dashboard. **Not** an emoji-friendly product surface.

If you find yourself about to replace serif with sans-serif "for readability", or remove the paper texture "for cleanliness", stop. It's intentional. Read `tasks/plan-clinical-decision-layer.md` §5 for why neutral copy + editorial restraint is load-bearing for the thesis's anti-surveillance posture.

## Layout

```
src/
├── App.tsx                  state-based view router
├── main.tsx
├── index.css                CSS variables, font imports, paper grain, ornamental utilities
├── lib/
│   ├── data.ts              census data, alerts, schedule
│   └── departments.ts       8 department configs — each with patient, LoRA subset, scripted chat
└── components/
    ├── Sidebar.tsx          department nav (accent-coloured, soft-clickable)
    ├── TopBar.tsx
    ├── Dashboard.tsx        census + alerts + recent imaging
    ├── PatientDetail.tsx    deep-dive with 5 tabs
    ├── Schedule.tsx         hour-by-hour timeline
    ├── DoctorConsole.tsx    chat + Whisper + ensemble console + on-chain ledger
    ├── Sparkline.tsx        hand-rolled SVG, animated path-length
    ├── VitalCard.tsx
    └── …
```

## Commands

```sh
pnpm install
pnpm dev                # http://localhost:5173
pnpm build              # type-check + Vite build — must pass before merging
```

## Key design constants

- **Fonts**: Fraunces (display), Newsreader (body), JetBrains Mono (data / hashes / tabular numbers). Google Fonts CDN is fine; self-hosting is future work.
- **Palette** (CSS vars in `index.css`):
  - `--bone`, `--cream` — paper
  - `--ink`, `--ink-soft`, `--smoke` — text
  - `--blood`, `--ocean`, `--ochre`, `--moss` — accents
  - Department overrides are hex, not tokens, because they drive one-off accent colors
- **Motion**: `motion/react` (Framer Motion's modern name), staggered mount animations only, no loops except the critical-alert pulse.

## The Doctor Console pattern

When the user clicks a department in the sidebar, the `DoctorConsole` is re-mounted with a fresh `departmentConfig` prop. Each department has:

- its own **patient** (name, MRN, vitals, meds, allergies, diagnosis)
- its own **allowedLoras** subset (Cardiology only has chest_xray; Oncology has three; Emergency has four)
- its own **department accent color** used throughout
- a **pre-loaded scripted conversation** (doctor query + AI reply with sections + provenance + attestation)
- a **followup** object that plays when the doctor sends a free-text or voice message

The voice path uses scripted transcript playback — real Whisper wiring goes to the gateway at `POST /transcribe` when MOCK_MODE=false.

## When backend wiring happens

The current `DoctorConsole.tsx` `send()` function returns a scripted response. Replacing it with a real fetch (`POST http://localhost:8000/diagnose`) is the primary integration point. Preserve the scripted fallback for demos without GPU.

## Things to NOT do

- Do NOT add a component library (shadcn/ui is OK for primitives, but if you add it, wrap it so the typography stays ours — no Inter sneaking in).
- Do NOT add emoji. Anywhere. Not even 🎉 on the commit toast.
- Do NOT change the department accent colours — they map to specific UX memory patterns.
- Do NOT remove the 10-second concordance blackout in the Doctor Console when real backend lands (see plan doc §5 for the anti-anchoring rationale).
- Do NOT switch to Next.js. User rejected it explicitly.
