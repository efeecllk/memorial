"""DeepSeek-R1-Distill-Qwen-7B reasoning specialist.

Three transports: Mock / Modal (POST to polyglot-reasoning) / Local vLLM."""

from __future__ import annotations

import asyncio

import httpx

from src.config import settings
from src.hashing import model_hash


_MOCK_REASONING = (
    "<think>The patient is post-op day 1 from laparoscopic appendectomy. New right shoulder "
    "discomfort overnight. Differential for post-laparoscopic shoulder pain: (1) referred "
    "phrenic-nerve irritation from residual CO2 — most common, self-limiting; (2) wound or "
    "intra-abdominal collection; (3) DVT/PE; (4) cardiac.</think>\n\n"
    "Referred shoulder pain after laparoscopy is well described and typically benign. "
    "It is caused by residual peritoneal CO2 irritating the diaphragm; the phrenic nerve "
    "refers this stimulus to the C3-C5 dermatomes. Onset 12-48 h post-op, resolution in "
    "2-4 days. Encourage ambulation, position changes, and gentle breathing exercises to "
    "accelerate CO2 reabsorption. Workup is only indicated if features such as dyspnoea, "
    "wound erythema, fever, calf swelling, or chest-pain phenotype emerge."
)


class ReasoningClient:
    def __init__(self) -> None:
        self.name = settings.REASONING_NAME
        self.hash = model_hash(self.name)

        self._mode = self._detect_mode()
        self._client: httpx.AsyncClient | None = None
        if self._mode == "modal":
            self._client = httpx.AsyncClient(base_url=settings.REASONING_URL, timeout=300.0)
        elif self._mode == "local_vllm":
            self._client = httpx.AsyncClient(base_url=settings.REASONING_BASE_URL, timeout=300.0)

    def _detect_mode(self) -> str:
        if settings.MOCK_MODE:
            return "mock"
        if settings.REASONING_URL:
            return "modal"
        return "local_vllm"

    async def think(self, doctor_query: str, vision_output: str = "") -> str:
        if self._mode == "mock":
            await asyncio.sleep(1.4)
            return _MOCK_REASONING

        if self._mode == "modal":
            r = await self._client.post(
                "",
                json={
                    "doctor_query": doctor_query,
                    "vision_output": vision_output,
                },
            )
            r.raise_for_status()
            data = r.json()
            if "error" in data:
                raise RuntimeError(f"reasoning modal error: {data['error']}")
            return data["text"].strip()

        # local_vllm: OpenAI-compat
        sys = (
            "You are a clinical reasoning specialist. Think step by step inside <think>...</think> "
            "tags, then give a concise clinical interpretation. Do not make a final diagnosis."
        )
        user_lines = [f"Doctor query: {doctor_query}"]
        if vision_output:
            user_lines.append(f"Vision specialist findings: {vision_output}")
        resp = await self._client.post(
            "/chat/completions",
            json={
                "model": self.name,
                "messages": [
                    {"role": "system", "content": sys},
                    {"role": "user", "content": "\n\n".join(user_lines)},
                ],
                "max_tokens": 16_000,
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
