"""MedGemma-4B vision base + per-region LoRA adapter.

Three transports, picked at construction time:
  · Mock:       canned region-specific findings (MOCK_MODE=true)
  · Modal:      POST to the deployed `polyglot-vision` Modal endpoint
                (set VISION_URL — preferred for thesis demo)
  · Local vLLM: POST to a self-hosted vLLM /v1/chat/completions endpoint
                (VISION_BASE_URL — for fully air-gapped on-prem)
"""

from __future__ import annotations

import asyncio
import base64

import httpx

from src.config import settings
from src.hashing import model_hash
from src.schemas import BodyRegion


_MOCK_VISION: dict[BodyRegion, str] = {
    "abdominal_ct": (
        "11 mm dilated appendix with surrounding fat stranding, no abscess or perforation. "
        "Consistent with acute appendicitis without complication."
    ),
    "musculoskeletal": (
        "No acute osseous abnormality. Joint spaces preserved. Soft tissues unremarkable. "
        "No effusion."
    ),
    "chest_xray": (
        "Bilateral perihilar opacities with peribronchial cuffing. Cardiomegaly with "
        "cardiothoracic ratio 0.58. Kerley B lines at right base. No focal consolidation, "
        "pneumothorax, or large effusion."
    ),
    "retinal_oct": (
        "Foveal contour preserved. No subretinal fluid. Retinal nerve fibre layer within "
        "normal limits."
    ),
    "brain_mri": (
        "No acute infarct, mass effect, or intracranial haemorrhage. Mild small-vessel "
        "ischaemic change in the periventricular white matter consistent with age."
    ),
    "dermatology": (
        "Asymmetric pigmented lesion 6 mm, irregular borders, multi-tone pigmentation. "
        "Findings concerning for atypical melanocytic lesion; recommend dermoscopy and "
        "consider excisional biopsy."
    ),
}


class VisionClient:
    def __init__(self) -> None:
        self.base_name = settings.MEDGEMMA_BASE_NAME
        self.base_hash = model_hash(self.base_name)
        self.lora_hashes: dict[str, bytes] = {
            region: model_hash(name) for region, name in settings.LORA_NAMES.items()
        }
        self.lora_names: dict[str, str] = settings.LORA_NAMES

        self._mode = self._detect_mode()
        self._client: httpx.AsyncClient | None = None
        if self._mode == "modal":
            self._client = httpx.AsyncClient(base_url=settings.VISION_URL, timeout=300.0)
        elif self._mode == "local_vllm":
            self._client = httpx.AsyncClient(base_url=settings.VISION_BASE_URL, timeout=300.0)

    def _detect_mode(self) -> str:
        if settings.MOCK_MODE:
            return "mock"
        if settings.VISION_URL:
            return "modal"
        return "local_vllm"

    async def analyze(
        self,
        image_bytes: bytes,
        region: BodyRegion,
        clinical_context: str = "",
    ) -> tuple[str, str]:
        lora_name = self.lora_names.get(region, "")
        if not lora_name:
            raise ValueError(f"no LoRA registered for region: {region}")

        if self._mode == "mock":
            await asyncio.sleep(0.6)
            return _MOCK_VISION[region], lora_name

        if self._mode == "modal":
            r = await self._client.post(
                "",  # the deployed URL is the full endpoint
                json={
                    "image_b64": base64.b64encode(image_bytes).decode(),
                    "region": region,
                    "clinical_context": clinical_context,
                },
            )
            r.raise_for_status()
            data = r.json()
            if "error" in data:
                raise RuntimeError(f"vision modal error: {data['error']}")
            return data["text"].strip(), data.get("lora_used", lora_name)

        # local_vllm: OpenAI-compat chat completion
        b64 = base64.b64encode(image_bytes).decode()
        prompt_user = (
            f"Provide a structured radiographic interpretation in three sentences. "
            f"Clinical context: {clinical_context or 'none provided'}."
        )
        resp = await self._client.post(
            "/chat/completions",
            json={
                "model": lora_name,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{b64}"},
                            },
                            {"type": "text", "text": prompt_user},
                        ],
                    }
                ],
                "max_tokens": 512,
                "temperature": 0.1,
            },
        )
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"]
        return text.strip(), lora_name

    async def warm(self) -> bool:
        if self._mode == "mock":
            return True
        try:
            # HEAD on the endpoint to wake the container without burning tokens
            r = await self._client.request("HEAD", "")
            return r.status_code < 500
        except httpx.HTTPError:
            return False
