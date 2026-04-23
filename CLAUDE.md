# Polyglot-Attest · AI assistant brief

Final-year CS thesis project for June 2026 graduation. Multi-LoRA medical AI ensemble running locally, with on-chain attestation on Monad. This file orients any AI coding assistant (Claude Code, Cursor, Codex, Aider, etc.) before it starts editing.

## What the project is, in one paragraph

A hospital workstation runs a local AI ensemble — Whisper STT, a ModernBERT image-region router, MedGemma-4B-IT with six specialty LoRA adapters (abdominal-ct, musculoskeletal, chest-xray, retinal-oct, brain-mri, dermatology) built by the author, a DeepSeek-R1-Distill-Qwen-7B reasoning model, and a Meerkat-7B clinical-writing aggregator. Every doctor query produces (i) an `InferenceAttestation` capturing the full model provenance and (ii) a follow-up `ClinicalDecisionAttestation` capturing what the doctor actually wrote plus their deliberation signals (concordance, edit distance, deliberation time, follow-up count, outcome, override reason). Both records are committed to Monad mainnet with cryptographic linkage enforced on-chain. Models live on Modal.

## Repo layout

```
kayseri/
├── contracts/           Foundry · Solidity 0.8.24 · 72 tests · via_ir enabled
│   ├── src/             7 contracts: ModelRegistry, InferenceAttestation,
│   │                    ConsentRegistry, CredentialSBT, DriftMonitor,
│   │                    ConsensusVault, ClinicalDecisionAttestation
│   ├── script/          Deploy.s.sol + RegisterMedVisionModels.s.sol
│   ├── test/            7 suites, 72 passing
│   └── lib/             forge-std, openzeppelin-contracts (submodules, ignored)
├── gateway/             Python 3.11 · FastAPI · uv · mock + modal + local-vLLM modes
│   └── src/
│       ├── main.py      public API
│       ├── ensemble.py  the orchestration pipeline
│       ├── attestation.py   web3 + Monad client
│       └── models/      5 client adapters (whisper, router, vision, reasoning, aggregator)
├── hospital/            Vite + React 18 + TypeScript · Tailwind · Motion
│   └── src/
│       ├── App.tsx      state-based view router
│       ├── components/  DoctorConsole, Sidebar, TopBar, KPICard, Sparkline, …
│       └── lib/
│           ├── data.ts
│           └── departments.ts   per-department configs (8 departments, each with
│                                  its own patient + LoRA subset + Whisper)
├── services/modal/      Consolidated polyglot_app.py (1 endpoint, 5 workers)
├── tasks/               plan-clinical-decision-layer.md, todo.md
└── docker-compose.yml   on-prem alternative to Modal
```

## User preferences — absolute

- **pnpm** for all Node projects, never npm.
- **Vite SPA** for frontend, never Next.js.
- **No `Co-Authored-By:` lines in commit messages or PR descriptions.** Only the user appears as commit author.
- **No em-dashes** in generated text. Use commas, periods, parentheses.
- **No Turkish-market-specific framing** in technical/research material (Turkish wedges are for outreach projects only, not this thesis). Everything thesis-facing targets an international English-speaking audience.
- **Autonomous workflow**: chain phases automatically, don't ask "shall I proceed" between clearly-connected steps.
- When unsure which model to use, default to the latest (Claude Opus 4.7 / 1M context was current at project start).

## Thesis conventions

- The core intellectual claim is in `InferenceAttestation.attest()` §5 (`isLoraOfBase` invariant) and `ClinicalDecisionAttestation.attest()` step 6 (LoRA-snapshot match). Do not refactor these without reading `tasks/plan-clinical-decision-layer.md`.
- Hash discipline: **only hashes go on-chain**. No PHI, no chart text, no patient identifiers, no free-text override reasons (only their keccak256). Contract tests assert this and CI tests in gateway do too. If a PR looks like it might leak something, reject it.
- Model identity: `model_hash(canonical_name) = keccak256(name)` is the MVP placeholder. Production is `keccak256(weights file bytes)`. The helper in `gateway/src/hashing.py` is the canonical implementation; contract test fixtures match.
- Ethics: clinician surveillance is the killer risk of the decision layer. Aggregate-first, cohort floor `K_ANON_MIN = 20`, HR firewall contractual + technical. See `tasks/plan-clinical-decision-layer.md` §6.

## Commands you can run

### Contracts

```sh
cd contracts
forge build            # 17 solidity files, via_ir on
forge test             # 7 suites, 72 tests
forge test --gas-report
forge script script/Deploy.s.sol \
    --rpc-url monad_testnet \
    --private-key $PRIVATE_KEY \
    --broadcast        # testnet deploy
```

`contracts/.env` (gitignored) contains the deployer key and addresses for `MEDICAL_BOARD` + `HOSPITAL_ADMIN`.

### Gateway

```sh
cd gateway
uv venv && uv pip install -e ".[dev]"
uv run pytest -v       # 11 tests, mock-mode
uv run uvicorn src.main:app --reload --port 8000
```

Default `MOCK_MODE=true` = no GPU required. Set `MOCK_MODE=false` + Modal URLs in `.env` for live serving.

### Hospital

```sh
cd hospital
pnpm install
pnpm dev               # http://localhost:5173
pnpm build             # type-check + vite build; must pass before merging
```

### Modal

```sh
cd services/modal
modal deploy polyglot_app.py
# URL: https://<user>--polyglot-fastapi-app.modal.run
# Routes: /transcribe /classify /analyze /think /synthesize /health
```

## Things to NOT do

- Do NOT `git add .` without first running `git status --porcelain | grep -iE "\.env$|\.env\.|\.key$|\.pem$|keystore|private|wallet\.json" | grep -v "\.env\.example$"`. The output must be empty.
- Do NOT commit `broadcast/` folders or `out/` / `cache/` artifacts.
- Do NOT remove `via_ir = true` from `foundry.toml` — the `attest()` functions need it.
- Do NOT replace hand-rolled serif / editorial typography in `hospital/` with Tailwind defaults or a generic component library. The aesthetic is intentional and documented in component-level comments.
- Do NOT add a Next.js migration. The user rejected it explicitly.
- Do NOT add a `.claude/` dir with settings that override user defaults; user state lives in `~/.claude/`, not per-project.

## When in doubt

Read `tasks/plan-clinical-decision-layer.md` first — it's the authoritative design synthesis from five specialist sub-agents and predates every build decision in the thesis. If a planned task conflicts with that plan, surface the conflict rather than pick.
