"""Image-region router.

Three transports:
  · Mock:    deterministic mapping from image hash for repeatable demos
  · Modal:   POST to deployed polyglot-router endpoint (set ROUTER_URL)
  · Local:   ModernBERT / SigLIP loaded in-process (requires GPU)
"""

from __future__ import annotations

import asyncio
import base64

import httpx

from src.config import settings
from src.hashing import keccak256, model_hash
from src.schemas import BodyRegion, RoutingResult


_MOCK_REGIONS: list[tuple[BodyRegion, float]] = [
    ("chest_xray",       0.974),
    ("brain_mri",        0.012),
    ("abdominal_ct",     0.008),
    ("musculoskeletal",  0.003),
    ("retinal_oct",      0.002),
    ("dermatology",      0.001),
]


class RouterClient:
    def __init__(self) -> None:
        self.name = settings.ROUTER_NAME
        self.hash = model_hash(self.name)

        self._mode = self._detect_mode()
        self._model = None
        self._client: httpx.AsyncClient | None = None

        if self._mode == "modal":
            self._client = httpx.AsyncClient(base_url=settings.ROUTER_URL, timeout=60.0)
        elif self._mode == "local":
            self._load_local()

    def _detect_mode(self) -> str:
        if settings.MOCK_MODE:
            return "mock"
        if settings.ROUTER_URL:
            return "modal"
        return "local"

    def _load_local(self) -> None:
        try:
            from transformers import AutoModelForSequenceClassification, AutoTokenizer
        except ImportError as exc:
            raise RuntimeError("transformers not installed; .[prod] or set ROUTER_URL") from exc

        self._processor = AutoTokenizer.from_pretrained(settings.ROUTER_MODEL_PATH)
        self._model = AutoModelForSequenceClassification.from_pretrained(settings.ROUTER_MODEL_PATH)

    async def classify(self, image_bytes: bytes) -> RoutingResult:
        if self._mode == "mock":
            await asyncio.sleep(0.04)
            digest = keccak256(image_bytes)
            primary, primary_conf = _MOCK_REGIONS[digest[0] % len(_MOCK_REGIONS)]
            alts = {r: c for r, c in _MOCK_REGIONS if r != primary}
            return RoutingResult(region=primary, confidence=primary_conf, alternatives=alts)

        if self._mode == "modal":
            r = await self._client.post(
                "",
                json={"image_b64": base64.b64encode(image_bytes).decode()},
            )
            r.raise_for_status()
            data = r.json()
            if "error" in data:
                raise RuntimeError(f"router modal error: {data['error']}")
            return RoutingResult(
                region=data["region"],
                confidence=float(data["confidence"]),
                alternatives={k: float(v) for k, v in data.get("alternatives", {}).items()},
            )

        raise NotImplementedError("local production router head not wired in this scaffold")

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
