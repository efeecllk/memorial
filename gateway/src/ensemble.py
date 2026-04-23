"""End-to-end ensemble orchestration: voice → image → reasoning → aggregation,
hash collection, on-chain attestation."""

from __future__ import annotations

import asyncio
import time

from src.attestation import AttestationClient, EnsembleAttestation
from src.hashing import ZERO32, attestation_id, keccak256, model_hash, text_hash, to_hex32
from src.models import (
    AggregatorClient,
    ReasoningClient,
    RouterClient,
    VisionClient,
    WhisperClient,
)
from src.schemas import (
    AttestationReceipt,
    DiagnoseRequest,
    DiagnoseResponse,
    ProvenanceModel,
    RoutingResult,
)


class Ensemble:
    """Holds one warm instance of every client and orchestrates a reply."""

    def __init__(self) -> None:
        self.whisper = WhisperClient()
        self.router = RouterClient()
        self.vision = VisionClient()
        self.reasoning = ReasoningClient()
        self.aggregator = AggregatorClient()
        self.chain = AttestationClient()

    # ── pipeline ─────────────────────────────────────────────────────────────

    async def diagnose(self, req: DiagnoseRequest, patient_context: str) -> DiagnoseResponse:
        t0 = time.time()
        import base64

        # 1. Voice → text
        transcript: str | None = None
        stt_used = False
        if req.audio_b64:
            audio_bytes = base64.b64decode(req.audio_b64)
            transcript, _ms = await self.whisper.transcribe(audio_bytes)
            stt_used = True

        # The "doctor query" used downstream is the typed text + transcript merged.
        doctor_query = "\n".join(filter(None, [req.text, transcript])) or ""
        if not doctor_query:
            raise ValueError("either text, audio_b64, or both must be supplied")

        # 2. Image → routing → vision specialist
        routing: RoutingResult | None = None
        vision_output = ""
        active_lora_hash = ZERO32
        base_hash = ZERO32
        router_hash = ZERO32
        vision_output_hash = ZERO32

        if req.image_b64:
            image_bytes = base64.b64decode(req.image_b64)
            routing = await self.router.classify(image_bytes)
            router_hash = self.router.hash

            if routing.region != "unknown":
                vision_output, lora_name = await self.vision.analyze(
                    image_bytes, routing.region, clinical_context=patient_context
                )
                base_hash = self.vision.base_hash
                active_lora_hash = self.vision.lora_hashes[routing.region]
                vision_output_hash = text_hash(vision_output)

        # 3. Reasoning specialist (always runs — text + maybe vision)
        reasoning_output = await self.reasoning.think(doctor_query, vision_output)
        reasoning_output_hash = text_hash(reasoning_output)

        # 4. Aggregator → final clinical text
        final_output = await self.aggregator.synthesize(
            doctor_query=doctor_query,
            vision_output=vision_output,
            reasoning_output=reasoning_output,
            patient_context=patient_context,
        )

        # 5. Hash collection
        # Input hash: prefer image bytes if provided, else audio bytes, else text.
        if req.image_b64:
            input_bytes = base64.b64decode(req.image_b64)
        elif req.audio_b64:
            input_bytes = base64.b64decode(req.audio_b64)
        else:
            input_bytes = (req.text or "").encode("utf-8")
        input_hash = keccak256(input_bytes)
        final_output_hash = text_hash(final_output)

        # 6. Build the on-chain struct
        att_id = attestation_id(input_hash, final_output_hash)
        ea = EnsembleAttestation(
            stt_hash=self.whisper.hash if stt_used else ZERO32,
            router_hash=router_hash,
            base_hash=base_hash,
            active_lora_hash=active_lora_hash,
            reasoning_hash=self.reasoning.hash,
            aggregator_hash=self.aggregator.hash,
            input_hash=input_hash,
            vision_output_hash=vision_output_hash,
            reasoning_output_hash=reasoning_output_hash,
            final_output_hash=final_output_hash,
            consent_ref=bytes.fromhex(req.consent_ref.removeprefix("0x")),
            doctor=req.doctor_address,
            timestamp=0,  # contract sets this
        )

        # 7. Submit to Monad
        receipt = await self.chain.submit(att_id, ea)

        # 8. Build provenance manifest for the UI
        provenance = [
            ProvenanceModel(
                role="STT",
                name=self.whisper.name,
                hash=to_hex32(self.whisper.hash),
                invoked=stt_used,
            ),
            ProvenanceModel(
                role="Router",
                name=self.router.name,
                hash=to_hex32(self.router.hash),
                invoked=routing is not None,
            ),
            ProvenanceModel(
                role="Vision base",
                name=self.vision.base_name,
                hash=to_hex32(self.vision.base_hash),
                invoked=base_hash != ZERO32,
            ),
            ProvenanceModel(
                role="Active LoRA",
                name=(
                    self.vision.lora_names[routing.region]
                    if routing and routing.region != "unknown"
                    else "none"
                ),
                hash=to_hex32(active_lora_hash),
                invoked=active_lora_hash != ZERO32,
            ),
            ProvenanceModel(
                role="Reasoning",
                name=self.reasoning.name,
                hash=to_hex32(self.reasoning.hash),
                invoked=True,
            ),
            ProvenanceModel(
                role="Aggregator",
                name=self.aggregator.name,
                hash=to_hex32(self.aggregator.hash),
                invoked=True,
            ),
        ]

        return DiagnoseResponse(
            transcript=transcript,
            routing=routing,
            vision_output=vision_output or None,
            reasoning_output=reasoning_output,
            final_output=final_output,
            provenance=provenance,
            attestation=AttestationReceipt(
                id=to_hex32(att_id),
                tx_hash=receipt["tx_hash"],
                block_number=receipt.get("block_number"),
                finality_seconds=receipt.get("finality_seconds"),
                explorer_url=receipt.get("explorer_url"),
            ),
            elapsed_ms=int((time.time() - t0) * 1000),
        )

    # ── concurrent warm-up at startup ────────────────────────────────────────

    async def warm_all(self) -> dict[str, bool]:
        """Probe each client; returns a map of role → warm bool."""
        results = await asyncio.gather(
            self.whisper.warm(),
            self.router.warm(),
            self.vision.warm(),
            self.reasoning.warm(),
            self.aggregator.warm(),
        )
        return {
            "stt": results[0],
            "router": results[1],
            "vision": results[2],
            "reasoning": results[3],
            "aggregator": results[4],
        }
