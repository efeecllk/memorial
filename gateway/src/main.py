"""FastAPI app — the public face of the Polyglot-Attest gateway."""

from __future__ import annotations

import base64
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from src.config import settings
from src.ensemble import Ensemble
from src.hashing import to_hex32
from src.schemas import (
    DiagnoseRequest,
    DiagnoseResponse,
    HealthResponse,
    ModelStatus,
    TranscribeRequest,
    TranscribeResponse,
)


# ── lifespan: warm models at startup ─────────────────────────────────────────

ensemble: Ensemble | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global ensemble
    ensemble = Ensemble()
    statuses = await ensemble.warm_all()
    print(f"[gateway] warm: {statuses}  (mock_mode={settings.MOCK_MODE})")
    yield


# ── app ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="Polyglot-Attest Gateway",
    version="0.1.0",
    description=(
        "Hospital-side orchestrator. Routes a doctor query through the multi-LoRA "
        "medical AI ensemble (Whisper STT, ModernBERT router, MedGemma+LoRA, "
        "DeepSeek-R1-Distill reasoning, Meerkat aggregator) and writes one "
        "atomic attestation per reply to Monad."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── endpoints ────────────────────────────────────────────────────────────────


@app.post("/diagnose", response_model=DiagnoseResponse)
async def diagnose(req: DiagnoseRequest, patient_context: str = "") -> DiagnoseResponse:
    """Run the full ensemble + write one attestation. Returns the doctor-visible
    reply, the ordered provenance manifest, and the on-chain receipt."""
    if not (req.text or req.audio_b64):
        raise HTTPException(400, "must supply at least one of text / audio_b64")
    try:
        return await ensemble.diagnose(req, patient_context=patient_context)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(req: TranscribeRequest) -> TranscribeResponse:
    """Standalone STT — used by the live-dictation UI before the doctor finalises."""
    audio = base64.b64decode(req.audio_b64)
    text, ms = await ensemble.whisper.transcribe(audio)
    return TranscribeResponse(
        text=text,
        duration_ms=ms,
        model_name=ensemble.whisper.name,
        model_hash=to_hex32(ensemble.whisper.hash),
    )


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    statuses = await ensemble.warm_all()
    chain = await ensemble.chain.chain_status()

    return HealthResponse(
        mock_mode=settings.MOCK_MODE,
        chain_connected=chain["connected"],
        chain_id=chain["chain_id"],
        block_number=chain.get("block_number"),
        models=[
            ModelStatus(
                role="STT",
                name=ensemble.whisper.name,
                hash=to_hex32(ensemble.whisper.hash),
                warm=statuses["stt"],
                vram_gb=1.6,
            ),
            ModelStatus(
                role="Router",
                name=ensemble.router.name,
                hash=to_hex32(ensemble.router.hash),
                warm=statuses["router"],
                vram_gb=0.3,
            ),
            ModelStatus(
                role="Vision base",
                name=ensemble.vision.base_name,
                hash=to_hex32(ensemble.vision.base_hash),
                warm=statuses["vision"],
                vram_gb=3.0,
            ),
            ModelStatus(
                role="Reasoning",
                name=ensemble.reasoning.name,
                hash=to_hex32(ensemble.reasoning.hash),
                warm=statuses["reasoning"],
                vram_gb=4.5,
            ),
            ModelStatus(
                role="Aggregator",
                name=ensemble.aggregator.name,
                hash=to_hex32(ensemble.aggregator.hash),
                warm=statuses["aggregator"],
                vram_gb=4.5,
            ),
        ],
    )


@app.get("/models")
async def models() -> dict:
    """Full ensemble manifest with hashes — what gets registered on-chain via
    the `RegisterMedVisionModels.s.sol` Foundry script."""
    return {
        "stt":          {"name": ensemble.whisper.name,    "hash": to_hex32(ensemble.whisper.hash)},
        "router":       {"name": ensemble.router.name,     "hash": to_hex32(ensemble.router.hash)},
        "vision_base":  {"name": ensemble.vision.base_name, "hash": to_hex32(ensemble.vision.base_hash)},
        "loras": {
            region: {"name": name, "hash": to_hex32(ensemble.vision.lora_hashes[region])}
            for region, name in ensemble.vision.lora_names.items()
        },
        "reasoning":    {"name": ensemble.reasoning.name,  "hash": to_hex32(ensemble.reasoning.hash)},
        "aggregator":   {"name": ensemble.aggregator.name, "hash": to_hex32(ensemble.aggregator.hash)},
    }


@app.get("/")
async def root():
    return {
        "service": "polyglot-attest-gateway",
        "mock_mode": settings.MOCK_MODE,
        "started_at": int(time.time()),
        "endpoints": ["/diagnose", "/transcribe", "/health", "/models", "/docs"],
    }
