# AGENTS.md

This repository uses `CLAUDE.md` as the canonical AI-assistant brief. Any agent using the `AGENTS.md` convention (OpenAI Codex CLI, Aider, Cursor, Continue, etc.) should read `CLAUDE.md` first — the content is tool-agnostic and applies equally.

Critical constraints (duplicated here in case only this file is loaded):

- Only the user is the commit author. No `Co-Authored-By:` lines.
- pnpm, not npm. Vite SPA, not Next.js.
- No em-dashes in generated text.
- Gateway / contracts / frontend each have their own `.gitignore` — never commit `.env`, `keystore/`, `broadcast/`, `*.pem`, or `wallet.json`.
- Hashes only on-chain. No PHI. See `contracts/src/ClinicalDecisionAttestation.sol` for the privacy invariants the schema enforces.
- Autonomous: chain phases, don't ask to proceed between clearly-connected steps.

See `CLAUDE.md` for the full context.
