"""Runtime configuration via environment variables (.env)."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Settings loaded from .env at startup."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # operating mode
    MOCK_MODE: bool = True
    # When true + MOCK_MODE true, models stay canned but attestations go on-chain
    # for a fast end-to-end demo that still produces a real Monad tx.
    FORCE_REAL_CHAIN: bool = False

    # ── Modal endpoint URLs (production) ────────────────────────────────────
    # Each is the public URL printed by `modal deploy services/modal/<role>_app.py`.
    # Empty string = endpoint not configured (will fall back to local vLLM URLs
    # below if those are set, otherwise raise).
    WHISPER_URL: str = ""
    ROUTER_URL: str = ""
    VISION_URL: str = ""
    REASONING_URL: str = ""
    AGGREGATOR_URL: str = ""

    # ── Local vLLM URLs (alternative production deployment, on-prem) ────────
    VISION_BASE_URL: str = "http://localhost:8001/v1"
    REASONING_BASE_URL: str = "http://localhost:8002/v1"
    AGGREGATOR_BASE_URL: str = "http://localhost:8003/v1"

    # local-loaded model knobs
    WHISPER_MODEL_SIZE: str = "large-v3-turbo"
    WHISPER_DEVICE: str = "cuda"
    WHISPER_COMPUTE_TYPE: str = "float16"
    ROUTER_MODEL_PATH: str = "answerdotai/ModernBERT-base"
    ROUTER_DEVICE: str = "cuda"

    # canonical model identifiers — keccak256(name) becomes the on-chain hash
    WHISPER_NAME: str = "openai/whisper-large-v3-turbo"
    ROUTER_NAME: str = "answerdotai/ModernBERT-base"
    MEDGEMMA_BASE_NAME: str = "google/medgemma-4b-it"
    REASONING_NAME: str = "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B"
    AGGREGATOR_NAME: str = "dmis-lab/Meerkat-7B"

    # 6 LoRA adapters (efecelik/medvision-models collection)
    LORA_NAMES: dict[str, str] = Field(
        default_factory=lambda: {
            "abdominal_ct":     "efecelik/medgemma-abdominal-ct-lora",
            "musculoskeletal":  "efecelik/medgemma-musculoskeletal-lora",
            "chest_xray":       "efecelik/medgemma-chest-xray-lora",
            "retinal_oct":      "efecelik/medgemma-retinal-oct-lora",
            "brain_mri":        "efecelik/medgemma-brain-mri-lora",
            "dermatology":      "efecelik/medgemma-dermatology-lora",
        }
    )

    # chain
    MONAD_RPC_URL: str = "https://testnet-rpc.monad.xyz"
    MONAD_CHAIN_ID: int = 20143

    INFERENCE_ATTESTATION_ADDRESS: str = "0x0000000000000000000000000000000000000000"
    CONSENT_REGISTRY_ADDRESS: str = "0x0000000000000000000000000000000000000000"
    MODEL_REGISTRY_ADDRESS: str = "0x0000000000000000000000000000000000000000"
    CREDENTIAL_SBT_ADDRESS: str = "0x0000000000000000000000000000000000000000"

    HOSPITAL_PRIVATE_KEY: str = "0x" + "00" * 32

    # api
    GATEWAY_HOST: str = "0.0.0.0"
    GATEWAY_PORT: int = 8000
    CORS_ORIGINS: str = "http://localhost:5173"


settings = Settings()
