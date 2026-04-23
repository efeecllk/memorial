# Polyglot-Attest Gateway

Hospital-side orchestrator. Routes a doctor query through the multi-LoRA medical AI ensemble (Whisper STT, ModernBERT router, MedGemma + 6 LoRA adapters, DeepSeek-R1-Distill reasoning, Meerkat aggregator), collects per-stage hashes, and writes one atomic attestation per reply to Monad.

## What runs where

| Component | Where it runs |
|---|---|
| Doctor UI (React) | Doctor's workstation browser |
| **Gateway (this project)** | **Hospital workstation, FastAPI process** |
| Whisper-large-v3-turbo | Inside the gateway process (faster-whisper, CTranslate2) |
| ModernBERT router | Inside the gateway process (transformers) |
| MedGemma-4B + 6 medvision LoRAs | Sibling vLLM container (`vllm-medgemma`) |
| DeepSeek-R1-Distill-Qwen-7B | Sibling vLLM container (`vllm-reasoning`) |
| Meerkat-7B | Sibling vLLM container (`vllm-aggregator`) |
| Monad RPC | Off-workstation (testnet or mainnet) |
| HSM signer | YubiHSM2 USB or local keystore |

Audio bytes, raw images, patient identifiers and full clinical text never leave the workstation. Only `bytes32` hashes, signatures and consent references reach Monad.

## Two operating modes

`MOCK_MODE=true` (default) — the gateway returns canned ensemble outputs but still computes real keccak256 hashes and submits real attestations. Use it on a laptop without a GPU for demo and integration testing.

`MOCK_MODE=false` (production) — the gateway loads Whisper + ModernBERT into its own process and proxies the three vLLM endpoints over HTTP. Requires the docker-compose stack (or equivalent local vLLM instances).

## Quick start (mock mode)

```sh
cd gateway

# 1. Python deps
uv venv
uv pip install -e .

# 2. Config
cp .env.example .env

# 3. Run
uv run uvicorn src.main:app --reload --port 8000
```

```sh
# 4. Verify
curl http://localhost:8000/health | jq
curl -X POST http://localhost:8000/diagnose \
  -H 'content-type: application/json' \
  -d '{
    "text": "Quick check on Efe. POD1, vitals stable. New right shoulder discomfort overnight — referred from the procedure?",
    "consent_ref": "0x'"$(printf '%064s' '' | tr ' ' a)"'",
    "doctor_address": "0x000000000000000000000000000000000000beef"
  }' | jq
```

## Production stack (full GPU)

The full stack lives in `../docker-compose.yml`. It brings up the gateway plus three vLLM instances plus Langfuse for tracing.

```sh
# From repo root
cp gateway/.env.example gateway/.env   # then edit MOCK_MODE=false + addresses
docker compose up -d
docker compose logs -f gateway
```

VRAM budget on RTX 4090 24 GB:

```
vllm-medgemma   (MedGemma-4B + 6 LoRAs Q4)        ~  4.0 GB
vllm-reasoning  (DeepSeek-R1-Distill-Qwen-7B AWQ) ~  4.5 GB
vllm-aggregator (Meerkat-7B AWQ)                  ~  4.5 GB
whisper         (in-process, large-v3-turbo)      ~  1.6 GB
modernbert      (in-process)                      ~  0.3 GB
KV cache pool   (paged, shared via vLLM)          ~  6.0 GB
driver / CUDA overhead                            ~  1.0 GB
                                                  ─────────
                                                  ~ 21.9 GB → fits
```

## End-to-end pipeline

```
POST /diagnose
   │
   ▼
ensemble.diagnose()
   │
   ├─ if audio_b64:
   │      WhisperClient.transcribe()        → transcript
   │
   ├─ if image_b64:
   │      RouterClient.classify()           → BodyRegion + confidence
   │      VisionClient.analyze(region)      → uses matched LoRA
   │
   ├─ ReasoningClient.think(query, vision)  → chain-of-thought + interp
   │
   ├─ AggregatorClient.synthesize(...)      → doctor-visible Markdown
   │
   ├─ collect 11 hashes
   │
   ├─ AttestationClient.submit(id, struct)  → Monad tx
   │
   └─ return DiagnoseResponse with provenance + receipt
```

## Tests

```sh
uv run pytest -v
```

Tests cover:

- keccak256 helpers (known vectors + bytes32 padding)
- Text-only follow-up: only reasoning + aggregator invoked
- Image flow: router → LoRA → vision → reasoning → aggregator
- Voice flow: STT invoked, transcript present
- Provenance: every entry well-formed `0x` bytes32 hex

All tests run in `MOCK_MODE=true` — no GPU or RPC required.

## Refreshing contract ABIs

After changing Solidity:

```sh
gateway/scripts/extract_abis.sh
```

Reads `contracts/out/<Contract>.sol/<Contract>.json`, extracts the ABI, writes to `gateway/src/abi/<Contract>.json`.

## Layout

```
gateway/
├── pyproject.toml
├── Dockerfile
├── .env.example
├── README.md
├── scripts/
│   └── extract_abis.sh
├── src/
│   ├── main.py              # FastAPI app
│   ├── config.py            # pydantic-settings
│   ├── schemas.py           # request / response models
│   ├── hashing.py           # keccak256 helpers
│   ├── ensemble.py          # full-pipeline orchestration
│   ├── attestation.py       # web3 + Monad client
│   ├── abi/
│   │   └── InferenceAttestation.json
│   └── models/
│       ├── whisper.py       # STT (in-process)
│       ├── router.py        # ModernBERT classifier
│       ├── vision.py        # MedGemma + LoRA via vLLM
│       ├── reasoning.py     # DeepSeek R1 Distill via vLLM
│       └── aggregator.py    # Meerkat via vLLM
└── tests/
    ├── test_hashing.py
    └── test_ensemble.py
```

## Privacy guarantees baked into the code

1. **No PHI ever crosses the docker network boundary** — all intermediate text stays in process memory; only `bytes32` hashes are passed to `web3.py`.
2. **No model output is stored to disk** — outputs are hashed, returned, and discarded after the JSON response is sent.
3. **Audio bytes are processed via `io.BytesIO`** — never written to a temp file.
4. **HSM-style signing** — `HOSPITAL_PRIVATE_KEY` env var is the dev shortcut; production replaces with a YubiHSM2 PKCS#11 backend (drop-in via `eth-account`).
