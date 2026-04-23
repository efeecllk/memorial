"""Whisper STT.

Three transports:
  · Mock:    canned transcript (MOCK_MODE=true)
  · Modal:   POST to deployed polyglot-whisper endpoint (set WHISPER_URL)
  · Local:   in-process faster-whisper (CUDA on the workstation itself)
"""

from __future__ import annotations

import asyncio
import base64
import io
import time

import httpx

from src.config import settings
from src.hashing import model_hash


_MOCK_TRANSCRIPT = (
    "Patient is asking about discharge timing. Run through what we should be "
    "flagging before sending him home tomorrow."
)


class WhisperClient:
    def __init__(self) -> None:
        self.name = settings.WHISPER_NAME
        self.hash = model_hash(self.name)

        self._mode = self._detect_mode()
        self._model = None
        self._client: httpx.AsyncClient | None = None

        if self._mode == "modal":
            self._client = httpx.AsyncClient(base_url=settings.WHISPER_URL, timeout=180.0)
        elif self._mode == "local":
            self._load_local()

    def _detect_mode(self) -> str:
        if settings.MOCK_MODE:
            return "mock"
        if settings.WHISPER_URL:
            return "modal"
        return "local"

    def _load_local(self) -> None:
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise RuntimeError(
                "faster-whisper not installed. Either install with .[prod], "
                "or set WHISPER_URL to a deployed Modal endpoint."
            ) from exc

        self._model = WhisperModel(
            settings.WHISPER_MODEL_SIZE,
            device=settings.WHISPER_DEVICE,
            compute_type=settings.WHISPER_COMPUTE_TYPE,
        )

    async def transcribe(self, audio_bytes: bytes) -> tuple[str, int]:
        t0 = time.time()

        if self._mode == "mock":
            await asyncio.sleep(0.4 + 0.001 * len(audio_bytes) / 1024)
            return _MOCK_TRANSCRIPT, int((time.time() - t0) * 1000)

        if self._mode == "modal":
            r = await self._client.post(
                "",
                json={"audio_b64": base64.b64encode(audio_bytes).decode()},
            )
            r.raise_for_status()
            data = r.json()
            if "error" in data:
                raise RuntimeError(f"whisper modal error: {data['error']}")
            return data["text"], int(data.get("duration_ms", (time.time() - t0) * 1000))

        # local
        loop = asyncio.get_running_loop()
        segments, _info = await loop.run_in_executor(
            None,
            lambda: self._model.transcribe(io.BytesIO(audio_bytes), beam_size=5, vad_filter=True),
        )
        text = " ".join(seg.text for seg in segments).strip()
        return text, int((time.time() - t0) * 1000)

    async def warm(self) -> bool:
        if self._mode == "mock":
            return True
        if self._mode == "local":
            return self._model is not None
        try:
            r = await self._client.request("HEAD", "")
            return r.status_code < 500
        except httpx.HTTPError:
            return False
