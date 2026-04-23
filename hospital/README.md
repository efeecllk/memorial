# Memorial General · Ward Round

A high-fidelity frontend mockup for a hospital management platform. Visual / UX only — no backend, no real data integration. Realistic placeholder content throughout (patients, vitals, medications, appointments, alerts).

## Stack

- Vite + React 18 + TypeScript
- Tailwind CSS 3
- Motion (framer-motion successor) for animation
- Lucide React for icons
- Google Fonts: Fraunces (display serif), Newsreader (body serif), JetBrains Mono (data)

## Design Direction

Editorial medical journal — *The Lancet* meets *Bloomberg Terminal*. Aged-paper background, oxblood / ocean accent palette, hero serif numbers, marginalia, ornamental dividers. Built to read like a respected publication rather than a generic SaaS dashboard.

Key choices:

- **Typography hierarchy over color hierarchy** — size, weight, italics carry meaning before colour does
- **Sparse, intentional accent colours** — oxblood reserved for critical signals only
- **Volume / Issue masthead** — clinical day numbered like a journal
- **Hand-drawn SVG sparklines** — no chart library overhead
- **Editorial dropcap, smallcaps, ornamental glyphs** (◆ ◐ ○ ◇ § ※)

## Running

```sh
pnpm install
pnpm dev
```

Opens on http://localhost:5173.

```sh
pnpm build
pnpm preview
```

## Views

Four views, switchable via the sidebar:

1. **Doctor Console** (default · `Today › 01 · ai`) — chat interface where the doctor uploads a study and the multi-LoRA medical AI ensemble (router → vision base + active LoRA → reasoning → aggregator) detects the anatomical region, analyses, and writes one cryptographic attestation per reply to Monad mainnet. Right rail shows active study, place-detection result with confidence bars, and on-chain history.
2. **Ward Round** (`Today › 02`) — KPI strip, patient census table, active signals rail, recent imaging studies
3. **Schedule** (`Today › 03`) — hour-by-hour timeline with appointments, on-call roster, daily tally
4. **Patient Record** — click any patient row in Ward Round to drill in. Vitals with sparklines, tabbed sections (Overview, Medications, Labs, Imaging, Notes)

## File Layout

```
src/
├── App.tsx                    # View router (state-based)
├── main.tsx
├── index.css                  # Tokens, fonts, paper texture, ornaments
├── lib/
│   └── data.ts                # All mock data (12 patients, alerts, schedule, meds, labs)
└── components/
    ├── Sidebar.tsx            # Crest, departments, user
    ├── TopBar.tsx             # Search, date, notifications
    ├── DoctorConsole.tsx      # Chat-with-AI doctor panel (default view)
    ├── Dashboard.tsx          # Ward Round view
    ├── PatientDetail.tsx      # Single-patient deep dive
    ├── Schedule.tsx           # Timeline view
    ├── KPICard.tsx
    ├── VitalCard.tsx          # With inline sparkline
    ├── AlertItem.tsx
    └── Sparkline.tsx          # Hand-rolled SVG, animated path-length reveal
```

## Notes

- All data is static and lives in `src/lib/data.ts`. Wire to a real backend later by replacing imports.
- Sparkline trends are deterministic pseudo-random (seeded sine).
- Animations are scoped to mount; nothing loops except the critical-signal pulse.
- Designed for desktop widths (≥ 1280 px). Mobile responsiveness is intentionally out of scope for a high-fidelity mockup.
