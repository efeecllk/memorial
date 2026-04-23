"""End-to-end ensemble in MOCK_MODE — no GPU, no chain RPC required."""

from __future__ import annotations

import base64

import pytest

from src.ensemble import Ensemble
from src.hashing import to_hex32
from src.schemas import DiagnoseRequest


@pytest.fixture
def ensemble() -> Ensemble:
    return Ensemble()


@pytest.mark.asyncio
async def test_text_only_followup(ensemble: Ensemble) -> None:
    req = DiagnoseRequest(
        text="Quick check: post-op day 1, any new red flags before discharge?",
        consent_ref="0x" + "ab" * 32,
        doctor_address="0x000000000000000000000000000000000000beef",
    )
    resp = await ensemble.diagnose(req, patient_context="Efe Çelik · POD1 lap appy")

    # Text-only follow-up: no STT, no routing, no vision/lora.
    assert resp.transcript is None
    assert resp.routing is None
    assert resp.vision_output is None

    # Reasoning + aggregator must always be present.
    assert resp.reasoning_output
    assert resp.final_output

    # Provenance: 6 entries; only reasoning + aggregator invoked.
    invoked = [p for p in resp.provenance if p.invoked]
    assert {p.role for p in invoked} == {"Reasoning", "Aggregator"}

    # Attestation receipt is present (mock returns synthetic but valid hex).
    assert resp.attestation.id.startswith("0x") and len(resp.attestation.id) == 66
    assert resp.attestation.tx_hash.startswith("0x")


@pytest.mark.asyncio
async def test_image_routes_to_lora(ensemble: Ensemble) -> None:
    fake_image = bytes(range(256)) * 4  # deterministic payload
    req = DiagnoseRequest(
        text="Analyse this study.",
        image_b64=base64.b64encode(fake_image).decode(),
        consent_ref="0x" + "cd" * 32,
        doctor_address="0x000000000000000000000000000000000000c0de",
    )
    resp = await ensemble.diagnose(req, patient_context="POD1 demo")

    assert resp.routing is not None
    assert resp.routing.region in {
        "abdominal_ct", "musculoskeletal", "chest_xray",
        "retinal_oct", "brain_mri", "dermatology",
    }
    assert resp.vision_output  # the matched mock canned text

    invoked_roles = {p.role for p in resp.provenance if p.invoked}
    # Image flow invokes router + vision base + active LoRA + reasoning + aggregator.
    assert invoked_roles == {"Router", "Vision base", "Active LoRA", "Reasoning", "Aggregator"}


@pytest.mark.asyncio
async def test_voice_intake_invokes_stt(ensemble: Ensemble) -> None:
    fake_audio = b"\x00\x01\x02\x03" * 4096
    req = DiagnoseRequest(
        audio_b64=base64.b64encode(fake_audio).decode(),
        consent_ref="0x" + "de" * 32,
        doctor_address="0x000000000000000000000000000000000000face",
    )
    resp = await ensemble.diagnose(req, patient_context="POD1 demo")

    assert resp.transcript  # whisper produced text
    invoked_roles = {p.role for p in resp.provenance if p.invoked}
    assert "STT" in invoked_roles


@pytest.mark.asyncio
async def test_provenance_hashes_are_well_formed(ensemble: Ensemble) -> None:
    req = DiagnoseRequest(
        text="hello",
        consent_ref="0x" + "ee" * 32,
        doctor_address="0x000000000000000000000000000000000000d00d",
    )
    resp = await ensemble.diagnose(req, patient_context="ctx")
    for p in resp.provenance:
        assert p.hash.startswith("0x")
        assert len(p.hash) == 66
