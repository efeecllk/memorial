# Polyglot-Attest · Modal Workers

Five serverless GPU workers that host the medical AI ensemble. The hospital-side gateway calls these endpoints over HTTPS instead of running its own vLLM stack — fewer moving parts on the workstation, and the GPU bill is pay-per-second.

| App | Role | GPU | Image |
|---|---|---|---|
| `polyglot-whisper`    | STT (Whisper-large-v3-turbo) | T4   | faster-whisper |
| `polyglot-router`     | Image-region classifier (zero-shot SigLIP) | T4   | open_clip |
| `polyglot-vision`     | MedGemma-4B + 6 medvision LoRAs | A10G | vLLM 0.7 (multi-LoRA) |
| `polyglot-reasoning`  | DeepSeek-R1-Distill-Qwen-7B  | A10G | vLLM 0.7 |
| `polyglot-aggregator` | Meerkat-7B clinical writer  | A10G | vLLM 0.7 |

All five share the `polyglot-models` Modal Volume (HF cache survives cold starts) and the `polyglot-hf` Modal Secret (HF_TOKEN for gated MedGemma).

## Files

```
services/modal/
├── _common.py            shared image factories, volume + secret refs, LoRA repo map
├── whisper_app.py        Whisper STT
├── router_app.py         SigLIP zero-shot routing (replace with fine-tuned ModernBERT in v2)
├── vision_app.py         MedGemma-4B + 6 LoRA adapters via vLLM multi-LoRA
├── reasoning_app.py      DeepSeek-R1-Distill-Qwen-7B
├── aggregator_app.py     Meerkat-7B
├── deploy.sh             deploys all (or one) app(s)
└── README.md             this file
```

## One-time setup

```sh
# 1. Configure Modal CLI with your token
#    (token id + secret live in base-mini-docs/acestep/backend/.env)
modal token set \
    --token-id "$MODAL_TOKEN_ID" \
    --token-secret "$MODAL_TOKEN_SECRET"

# 2. Create the shared HuggingFace secret
modal secret create polyglot-hf HF_TOKEN="$HF_TOKEN"

# 3. (One-time, web UI) Accept the MedGemma terms with the same HF account
#    behind HF_TOKEN: https://huggingface.co/google/medgemma-4b-it
```

## Deploy

```sh
# All 5 apps
./services/modal/deploy.sh

# Or one at a time (faster iteration)
./services/modal/deploy.sh whisper
./services/modal/deploy.sh vision
```

After each `modal deploy …` Modal prints the public web endpoint URL. Copy them into `gateway/.env`:

```sh
# gateway/.env
MOCK_MODE=false

WHISPER_URL=https://<your-u>--polyglot-whisper-transcribe.modal.run
ROUTER_URL=https://<your-u>--polyglot-router-classify.modal.run
VISION_URL=https://<your-u>--polyglot-vision-analyze.modal.run
REASONING_URL=https://<your-u>--polyglot-reasoning-think.modal.run
AGGREGATOR_URL=https://<your-u>--polyglot-aggregator-synthesize.modal.run
```

## Cold-start and cost notes

- Default `min_containers=0` (scale-to-zero). First request to an idle app
  pays the cold start: ~ 30-60 s for vLLM apps (model download from HF
  cache + engine warm-up), ~ 15-30 s for whisper / router.
- For a live demo, switch the `min_containers=0` knob to `1` in the
  relevant `_app.py` file before redeploying. T4 idle ≈ $0.40/h, A10G idle
  ≈ $1.10/h. Three A10Gs warm 24×7 ≈ $79/day — enable for the demo window
  only.
- The `polyglot-models` Volume caches HF downloads across cold starts;
  weights only re-pull if the upstream repo's commit changes.

## Smoke tests

Each app ships with a `local_entrypoint`-style sanity check (or a `modal
run …` command) for verifying a fresh deploy:

```sh
modal run services/modal/whisper_app.py::smoke
```

For the vLLM workers, the cleanest smoke is curl against the deployed URL:

```sh
curl -X POST https://<u>--polyglot-reasoning-think.modal.run \
    -H 'content-type: application/json' \
    -d '{"doctor_query":"Test that the reasoning specialist responds."}'
```

## Switching from local vLLM to Modal

The `gateway/src/models/{vision,reasoning,aggregator}.py` adapters already
talk over HTTP. Production rewires them to point at Modal URLs by changing
the env vars listed above. Whisper and Router are in-process by default in
the gateway; to offload them too, the gateway gets two extra HTTP clients
(see `gateway/src/models/whisper.py` and `router.py` — the Modal variant
just calls the deployed endpoint with the same JSON shape).

## Privacy

Audio bytes, image bytes, and patient-context strings travel from the
workstation to Modal over TLS, are processed in container memory, and are
not persisted to any Modal volume. Only the gateway writes hashes to chain
— Modal never touches the chain.

If full air-gap is required (military hospitals, paediatric oncology
units, etc.), redeploy the same code into the on-prem
`docker-compose.yml` (already provided in the repo root) and point the
gateway at `localhost` URLs instead of Modal.
