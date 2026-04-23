"""Meerkat-7B aggregator — synthesises the doctor-facing reply.

Three transports: Mock / Modal (POST to polyglot-aggregator) / Local vLLM."""

from __future__ import annotations

import asyncio

import httpx

from src.config import settings
from src.hashing import model_hash


_MOCK_AGGREGATED = (
    "**Clinical assessment.** The patient is post-op day 1 from an uncomplicated "
    "laparoscopic appendectomy and now reports right shoulder discomfort. The most likely "
    "explanation is referred pain from residual CO₂ insufflation irritating the "
    "diaphragm via the phrenic nerve, a benign and self-limiting phenomenon that typically "
    "resolves over 2 – 4 days.\n\n"
    "**Recommendation.** Reassure the patient, continue current analgesia, and encourage "
    "ambulation and gentle breathing exercises. No additional imaging or workup is required "
    "at this time. Re-evaluate at the evening round; escalate if dyspnoea, fever, wound "
    "changes, or asymmetric leg findings develop."
)


class AggregatorClient:
    def __init__(self) -> None:
        self.name = settings.AGGREGATOR_NAME
        self.hash = model_hash(self.name)

        self._mode = self._detect_mode()
        self._client: httpx.AsyncClient | None = None
        if self._mode == "modal":
            self._client = httpx.AsyncClient(base_url=settings.AGGREGATOR_URL, timeout=180.0)
        elif self._mode == "local_vllm":
            self._client = httpx.AsyncClient(base_url=settings.AGGREGATOR_BASE_URL, timeout=180.0)

    def _detect_mode(self) -> str:
        if settings.MOCK_MODE:
            return "mock"
        if settings.AGGREGATOR_URL:
            return "modal"
        return "local_vllm"

    async def synthesize(
        self,
        doctor_query: str,
        vision_output: str,
        reasoning_output: str,
        patient_context: str,
    ) -> str:
        if self._mode == "mock":
            await asyncio.sleep(0.7)
            return _MOCK_AGGREGATED

        if self._mode == "modal":
            r = await self._client.post(
                "",
                json={
                    "doctor_query": doctor_query,
                    "vision_output": vision_output,
                    "reasoning_output": reasoning_output,
                    "patient_context": patient_context,
                },
            )
            r.raise_for_status()
            data = r.json()
            if "error" in data:
                raise RuntimeError(f"aggregator modal error: {data['error']}")
            return data["text"].strip()

        # local_vllm: OpenAI-compat
        sys = (
            "You are a clinical writing aggregator. Combine the patient context, the "
            "doctor's question, the vision specialist's findings (if any), and the "
            "reasoning specialist's analysis into one focused, well-structured Markdown "
            "reply. Strip <think>...</think> tags. Do not invent facts."
        )
        user_block = "\n\n".join(
            [
                f"PATIENT CONTEXT:\n{patient_context}",
                f"DOCTOR QUERY:\n{doctor_query}",
                f"VISION SPECIALIST OUTPUT:\n{vision_output or '(no image provided)'}",
                f"REASONING SPECIALIST OUTPUT:\n{reasoning_output}",
            ]
        )
        resp = await self._client.post(
            "/chat/completions",
            json={
                "model": self.name,
                "messages": [
                    {"role": "system", "content": sys},
                    {"role": "user", "content": user_block},
                ],
                "max_tokens": 1024,
                "temperature": 0.2,
            },
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()

    async def warm(self) -> bool:
        if self._mode == "mock":
            return True
        try:
            r = await self._client.request("HEAD", "")
            return r.status_code < 500
        except httpx.HTTPError:
            return False
