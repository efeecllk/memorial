# services/modal/ · AI assistant brief

Serverless GPU workers for the Polyglot-Attest ensemble. Single Modal app (`polyglot`), five worker classes, one ASGI FastAPI dispatcher.

Part of the Polyglot-Attest monorepo; see `../../CLAUDE.md` for project-wide context and user conventions.

## Why a single app, not five

Modal free-tier caps **web endpoints at 8 per workspace**. Deploying five separate apps would consume five slots and leave nothing for other Modal work. `polyglot_app.py` consolidates the five workers behind one ASGI FastAPI dispatcher — one web-endpoint slot, five routes.

This is deliberate. Don't split it back out.

## Routes

After `modal deploy`:

```
https://<modal-user>--polyglot-fastapi-app.modal.run
  GET  /health
  POST /transcribe    → WhisperWorker (T4, faster-whisper-large-v3-turbo)
  POST /classify      → RouterWorker (T4, SigLIP zero-shot)
  POST /analyze       → VisionWorker (A10G, MedGemma-4B + 6 medvision LoRAs)
  POST /think         → ReasoningWorker (A10G, DeepSeek-R1-Distill-Qwen-7B)
  POST /synthesize    → AggregatorWorker (A10G, Meerkat-7B)
```

## Commands

```sh
# One-time setup
modal token set --token-id $MODAL_TOKEN_ID --token-secret $MODAL_TOKEN_SECRET
modal secret create polyglot-hf HF_TOKEN=$HF_TOKEN
# Accept MedGemma terms once at huggingface.co/google/medgemma-4b-it with the
# same HF account backing HF_TOKEN.

# Deploy
modal deploy polyglot_app.py

# Smoke
curl https://<modal-user>--polyglot-fastapi-app.modal.run/health
```

## File-loading quirk

Modal only mounts the file being deployed. Shared helper modules (e.g. a `_common.py` with image definitions) are NOT shipped into the worker container — the build fails with `ModuleNotFoundError`. Two fixes:

1. **Inline everything** in `polyglot_app.py` (current approach).
2. Use `modal.Image.add_local_file(...)` to bundle the helper explicitly.

Current code is self-contained on purpose. If you split it out, use approach 2 and add a deploy-time check.

## Cost model

`min_containers=0` = scale-to-zero, pay per second. Cold-start hit on first request (~30–60 s for vLLM apps while weights download from HF → volume cache; subsequent cold starts are 10–30 s from cache). For a live demo set `min_containers=1` on the three A10G workers — expect ≈ $1.10/hr/worker. Turn off when demo ends.

## Things to NOT do

- Do NOT re-split into five deploy targets without first verifying the workspace has ≥ 5 free web-endpoint slots. The free tier does not.
- Do NOT hard-pin `vllm==0.7.3`. The builder failed to resolve it during initial deploy; current code installs `vllm` unpinned and that works.
- Do NOT remove the `polyglot-hf` secret wiring. The MedGemma base is gated; without HF_TOKEN the vision worker 401s on first inference.
- Do NOT commit `.modal/` or any `polyglot-*.local.*` state file.
