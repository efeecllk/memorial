"""Pydantic schemas for the gateway API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


# ── enums / constants ────────────────────────────────────────────────────────

BodyRegion = Literal[
    "abdominal_ct",
    "musculoskeletal",
    "chest_xray",
    "retinal_oct",
    "brain_mri",
    "dermatology",
    "unknown",
]


# ── request / response models ────────────────────────────────────────────────


class DiagnoseRequest(BaseModel):
    """Run the full ensemble + write one attestation to chain."""

    text: str | None = None
    audio_b64: str | None = None
    image_b64: str | None = None

    consent_ref: str = Field(..., description="0x-prefixed bytes32 from ConsentRegistry")
    doctor_address: str = Field(..., description="0x-prefixed eth address (must hold valid SBT)")


class ProvenanceModel(BaseModel):
    role: str
    name: str
    hash: str
    invoked: bool


class RoutingResult(BaseModel):
    region: BodyRegion
    confidence: float
    alternatives: dict[str, float]


class AttestationReceipt(BaseModel):
    id: str
    tx_hash: str
    block_number: int | None = None
    finality_seconds: float | None = None
    explorer_url: str | None = None


class DiagnoseResponse(BaseModel):
    transcript: str | None = None
    routing: RoutingResult | None = None
    vision_output: str | None = None
    reasoning_output: str | None = None
    final_output: str
    provenance: list[ProvenanceModel]
    attestation: AttestationReceipt
    elapsed_ms: int


class TranscribeRequest(BaseModel):
    audio_b64: str


class TranscribeResponse(BaseModel):
    text: str
    duration_ms: int
    model_name: str
    model_hash: str


class ModelStatus(BaseModel):
    role: str
    name: str
    hash: str
    warm: bool
    vram_gb: float | None = None


class HealthResponse(BaseModel):
    mock_mode: bool
    chain_connected: bool
    chain_id: int
    block_number: int | None = None
    models: list[ModelStatus]
