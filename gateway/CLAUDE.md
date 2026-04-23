# gateway/ · AI assistant brief

Python 3.11 · FastAPI · `uv` · `httpx` + `web3.py` · three operating modes (mock / Modal / local vLLM).

Part of the Polyglot-Attest monorepo; see `../CLAUDE.md` for project-wide context and user conventions.

## What this does

Hospital-side orchestrator. Receives a doctor query, routes it through the multi-SLM ensemble (Whisper → Router → MedGemma+LoRA → Reasoning → Aggregator), collects per-stage hashes, signs an `EnsembleAttestation`, submits it to Monad, returns the doctor-visible reply plus provenance manifest plus on-chain receipt.

## Architecture

```
src/
├── main.py           FastAPI app — POST /diagnose, POST /transcribe, GET /health, GET /models
├── config.py         pydantic-settings — MOCK_MODE, Modal URLs, Monad RPC, contract addrs
├── schemas.py        request / response pydantic models
├── hashing.py        keccak256 helpers — MUST match Solidity-side byte-for-byte
├── ensemble.py       the orchestration pipeline
├── attestation.py    web3.py + Monad client
├── abi/              Solidity ABIs — InferenceAttestation at minimum
└── models/           5 client adapters with mock + modal + local-vllm modes
    ├── whisper.py
    ├── router.py
    ├── vision.py
    ├── reasoning.py
    └── aggregator.py
```

Every model client has three transport modes, selected by env vars:

- **Mock**: returns canned deterministic output. Zero GPU. Default.
- **Modal**: POST to `<something>.modal.run`. Production default for the thesis demo.
- **Local vLLM**: POST to `http://…:8001/v1/chat/completions` (OpenAI-compatible). Full air-gap alternative.

## Commands

```sh
uv venv && uv pip install -e ".[dev]"
cp .env.example .env       # edit MOCK_MODE and URLs as needed

uv run pytest -v           # 11 tests in mock mode
uv run uvicorn src.main:app --reload --port 8000
```

## Two non-negotiable invariants

- `keccak256` helpers in `src/hashing.py` must produce identical bytes to `keccak256(...)` in Solidity. If the gateway computes a hash that the contract rejects, the gateway is wrong — fix `hashing.py`, not the contract. A unit test (`test_hashing.py::test_keccak256_known_vector`) pins this.
- **No PHI or raw chart text in outgoing network traffic from the gateway**, except to the model-serving layer itself (Modal or local vLLM). In particular: never send anything other than a `bytes32` hash to Monad. A CI test sketch in the plan doc asserts this across all responses.

## Modes cheatsheet

| `MOCK_MODE` | Model URLs | Uses |
|---|---|---|
| `true` | ignored | laptop dev, demos, tests |
| `false` + `*_URL` set | Modal endpoints | thesis demo default |
| `false` + `*_URL` empty | `VISION_BASE_URL` etc. | on-prem vLLM (docker-compose) |

## Things to NOT do

- Do NOT change mock outputs without running the ensemble tests in `tests/test_ensemble.py` — the test assertions fold specific tokens/words.
- Do NOT add a third-party LLM / embedding model for concordance computation (thesis committee will ask why; recursive attestation problem). Token-Levenshtein only, per the thesis plan doc.
- Do NOT remove `MOCK_MODE` as a first-class code path. Thesis demo depends on laptop-only operation.
