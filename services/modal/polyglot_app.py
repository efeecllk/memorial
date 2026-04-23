"""Polyglot-Attest — consolidated Modal deployment.

Five worker classes (whisper · router · vision · reasoning · aggregator)
each with their own GPU/image, all invoked through a single ASGI FastAPI
dispatcher. Spends ONE web-endpoint slot against the workspace quota
instead of five (the free tier caps at 8).

Deploy:  modal deploy services/modal/polyglot_app.py
URL:     https://<modal-username>--polyglot-fastapi-app.modal.run
Routes:  /transcribe /classify /analyze /think /synthesize /health
"""

import base64
import io
import time

import modal

# ─── Shared infra (inlined so Modal ships a single-file deploy) ─────────────

MODEL_VOLUME = modal.Volume.from_name("polyglot-models", create_if_missing=True)
MODEL_CACHE_PATH = "/models"
HF_CACHE_PATH = f"{MODEL_CACHE_PATH}/.huggingface"

HF_SECRET = modal.Secret.from_name("polyglot-hf")

LORA_REPOS: dict[str, str] = {
    "abdominal_ct":     "efecelik/medgemma-abdominal-ct-lora",
    "musculoskeletal":  "efecelik/medgemma-musculoskeletal-lora",
    "chest_xray":       "efecelik/medgemma-chest-xray-lora",
    "retinal_oct":      "efecelik/medgemma-retinal-oct-lora",
    "brain_mri":        "efecelik/medgemma-brain-mri-lora",
    "dermatology":      "efecelik/medgemma-dermatology-lora",
}

_HF_ENV = {
    "HF_HOME": HF_CACHE_PATH,
    "HF_HUB_CACHE": HF_CACHE_PATH,
    "HF_HUB_ENABLE_HF_TRANSFER": "1",
}

VLLM_IMAGE = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("git", "wget", "curl")
    .pip_install("vllm", "huggingface_hub[hf_transfer]", "fastapi", "pillow")
    .env({**_HF_ENV, "VLLM_DO_NOT_TRACK": "1"})
)

WHISPER_IMAGE = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("faster-whisper", "huggingface_hub[hf_transfer]", "fastapi")
    .env(_HF_ENV)
)

ROUTER_IMAGE = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "transformers",
        "torch",
        "Pillow",
        "open_clip_torch",
        "huggingface_hub[hf_transfer]",
        "fastapi",
    )
    .env(_HF_ENV)
)

DISPATCHER_IMAGE = (
    modal.Image.debian_slim(python_version="3.11").pip_install("fastapi", "pydantic")
)

app = modal.App("polyglot")

# ─── STT worker ─────────────────────────────────────────────────────────────

WHISPER_MODEL = "deepdml/faster-whisper-large-v3-turbo-ct2"


@app.cls(
    image=WHISPER_IMAGE,
    gpu="T4",
    volumes={MODEL_CACHE_PATH: MODEL_VOLUME},
    secrets=[HF_SECRET],
    timeout=300,
    scaledown_window=300,
)
class WhisperWorker:
    @modal.enter()
    def load(self):
        from faster_whisper import WhisperModel

        print(f"[whisper] loading {WHISPER_MODEL}")
        self.model = WhisperModel(
            WHISPER_MODEL,
            device="cuda",
            compute_type="float16",
            download_root=MODEL_CACHE_PATH,
        )
        MODEL_VOLUME.commit()

    @modal.method()
    def transcribe(self, audio_b64: str, language: str | None = None) -> dict:
        audio_bytes = base64.b64decode(audio_b64)
        t0 = time.time()
        segments, _info = self.model.transcribe(
            io.BytesIO(audio_bytes),
            beam_size=5,
            language=language,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        text = " ".join(seg.text for seg in segments).strip()
        return {
            "text": text,
            "duration_ms": int((time.time() - t0) * 1000),
            "model_name": WHISPER_MODEL,
        }


# ─── Router worker ──────────────────────────────────────────────────────────

REGION_PROMPTS = {
    "abdominal_ct":     "a CT scan of the abdomen",
    "musculoskeletal":  "an x-ray of bones and joints",
    "chest_xray":       "a chest x-ray",
    "retinal_oct":      "an optical coherence tomography scan of the retina",
    "brain_mri":        "an MRI scan of the brain",
    "dermatology":      "a close-up photograph of skin",
}


@app.cls(
    image=ROUTER_IMAGE,
    gpu="T4",
    volumes={MODEL_CACHE_PATH: MODEL_VOLUME},
    secrets=[HF_SECRET],
    timeout=120,
    scaledown_window=300,
)
class RouterWorker:
    @modal.enter()
    def load(self):
        import open_clip
        import torch

        print("[router] loading SigLIP ViT-SO400M-14 …")
        self.model, _, self.preprocess = open_clip.create_model_and_transforms(
            "ViT-SO400M-14-SigLIP-384",
            pretrained="webli",
            cache_dir=MODEL_CACHE_PATH,
        )
        self.tokenizer = open_clip.get_tokenizer("ViT-SO400M-14-SigLIP-384")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = self.model.to(self.device)
        self.model.train(False)
        with torch.no_grad():
            tok = self.tokenizer(list(REGION_PROMPTS.values())).to(self.device)
            self.text_features = self.model.encode_text(tok)
            self.text_features /= self.text_features.norm(dim=-1, keepdim=True)
            self.region_keys = list(REGION_PROMPTS.keys())
        MODEL_VOLUME.commit()

    @modal.method()
    def classify(self, image_b64: str) -> dict:
        import torch
        from PIL import Image

        img = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert("RGB")
        with torch.no_grad():
            x = self.preprocess(img).unsqueeze(0).to(self.device)
            feats = self.model.encode_image(x)
            feats /= feats.norm(dim=-1, keepdim=True)
            sims = (feats @ self.text_features.T).softmax(dim=-1).squeeze(0).cpu().tolist()
        scored = sorted(zip(self.region_keys, sims), key=lambda kv: kv[1], reverse=True)
        primary, primary_conf = scored[0]
        return {
            "region": primary,
            "confidence": round(primary_conf, 4),
            "alternatives": {k: round(v, 4) for k, v in scored[1:]},
            "model_name": "ViT-SO400M-14-SigLIP-384 (zero-shot)",
        }


# ─── Vision worker (MedGemma + 6 LoRAs) ─────────────────────────────────────

BASE_MODEL = "google/medgemma-4b-it"


@app.cls(
    image=VLLM_IMAGE,
    gpu="A10G",
    volumes={MODEL_CACHE_PATH: MODEL_VOLUME},
    secrets=[HF_SECRET],
    timeout=600,
    scaledown_window=600,
)
class VisionWorker:
    @modal.enter()
    def load(self):
        from huggingface_hub import snapshot_download
        from vllm import LLM

        print(f"[vision] downloading base {BASE_MODEL}")
        snapshot_download(BASE_MODEL, cache_dir=HF_CACHE_PATH)
        print("[vision] downloading 6 LoRA adapters")
        self.lora_paths = {
            region: snapshot_download(repo, cache_dir=HF_CACHE_PATH)
            for region, repo in LORA_REPOS.items()
        }
        MODEL_VOLUME.commit()

        self.llm = LLM(
            model=BASE_MODEL,
            dtype="float16",
            enable_lora=True,
            max_loras=8,
            max_lora_rank=64,
            max_model_len=4096,
            gpu_memory_utilization=0.85,
            trust_remote_code=True,
        )
        self.lora_ids = {region: i + 1 for i, region in enumerate(LORA_REPOS.keys())}
        print(f"[vision] ready · {len(self.lora_paths)} LoRAs hot")

    @modal.method()
    def analyze(
        self,
        image_b64: str,
        region: str,
        clinical_context: str = "",
        max_tokens: int = 512,
    ) -> dict:
        from PIL import Image
        from vllm import SamplingParams
        from vllm.lora.request import LoRARequest

        if region not in self.lora_paths:
            return {"error": f"unknown region: {region}"}

        image = Image.open(io.BytesIO(base64.b64decode(image_b64))).convert("RGB")
        prompt = (
            "<start_of_turn>user\n"
            f"<image>\nProvide a structured radiographic interpretation in 3-4 sentences. "
            f"Clinical context: {clinical_context or 'none provided'}.<end_of_turn>\n"
            "<start_of_turn>model\n"
        )
        lora = LoRARequest(
            lora_name=region,
            lora_int_id=self.lora_ids[region],
            lora_path=self.lora_paths[region],
        )
        outputs = self.llm.generate(
            {"prompt": prompt, "multi_modal_data": {"image": image}},
            SamplingParams(temperature=0.1, max_tokens=max_tokens),
            lora_request=lora,
        )
        return {
            "text": outputs[0].outputs[0].text.strip(),
            "lora_used": LORA_REPOS[region],
            "model_name": BASE_MODEL,
        }


# ─── Reasoning worker ───────────────────────────────────────────────────────

REASONING_MODEL = "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B"


@app.cls(
    image=VLLM_IMAGE,
    gpu="A10G",
    volumes={MODEL_CACHE_PATH: MODEL_VOLUME},
    secrets=[HF_SECRET],
    timeout=600,
    scaledown_window=600,
)
class ReasoningWorker:
    @modal.enter()
    def load(self):
        from huggingface_hub import snapshot_download
        from vllm import LLM

        print(f"[reasoning] downloading {REASONING_MODEL}")
        snapshot_download(REASONING_MODEL, cache_dir=HF_CACHE_PATH)
        MODEL_VOLUME.commit()
        self.llm = LLM(
            model=REASONING_MODEL,
            dtype="float16",
            max_model_len=16_384,
            gpu_memory_utilization=0.85,
            trust_remote_code=True,
        )
        print("[reasoning] ready")

    @modal.method()
    def think(self, doctor_query: str, vision_output: str = "", max_tokens: int = 8192) -> dict:
        from vllm import SamplingParams

        sys = (
            "You are a clinical reasoning specialist. Think step by step inside "
            "<think>...</think> tags, then give a concise clinical interpretation. "
            "Do not make a final diagnosis."
        )
        user = f"Doctor query: {doctor_query}"
        if vision_output:
            user += f"\n\nVision specialist findings: {vision_output}"
        prompt = (
            f"<|im_start|>system\n{sys}<|im_end|>\n"
            f"<|im_start|>user\n{user}<|im_end|>\n"
            f"<|im_start|>assistant\n"
        )
        outputs = self.llm.generate(
            prompt,
            SamplingParams(temperature=0.2, top_p=0.9, max_tokens=max_tokens),
        )
        return {
            "text": outputs[0].outputs[0].text.strip(),
            "model_name": REASONING_MODEL,
        }


# ─── Aggregator worker ─────────────────────────────────────────────────────

AGGREGATOR_MODEL = "dmis-lab/meerkat-7b-v1.0"


@app.cls(
    image=VLLM_IMAGE,
    gpu="A10G",
    volumes={MODEL_CACHE_PATH: MODEL_VOLUME},
    secrets=[HF_SECRET],
    timeout=300,
    scaledown_window=600,
)
class AggregatorWorker:
    @modal.enter()
    def load(self):
        from huggingface_hub import snapshot_download
        from vllm import LLM

        print(f"[aggregator] downloading {AGGREGATOR_MODEL}")
        snapshot_download(AGGREGATOR_MODEL, cache_dir=HF_CACHE_PATH)
        MODEL_VOLUME.commit()
        self.llm = LLM(
            model=AGGREGATOR_MODEL,
            dtype="float16",
            max_model_len=4096,
            gpu_memory_utilization=0.85,
            trust_remote_code=True,
        )
        print("[aggregator] ready")

    @modal.method()
    def synthesize(
        self,
        doctor_query: str,
        vision_output: str = "",
        reasoning_output: str = "",
        patient_context: str = "",
        max_tokens: int = 1024,
    ) -> dict:
        from vllm import SamplingParams

        if not (doctor_query and reasoning_output):
            return {"error": "doctor_query and reasoning_output required"}

        sys = (
            "You are a clinical writing aggregator. Combine the patient context, the "
            "doctor's question, the vision specialist's findings (if any), and the "
            "reasoning specialist's analysis into one focused, well-structured Markdown "
            "reply for the attending. Strip <think>...</think> tags. Do not invent facts."
        )
        user = "\n\n".join(
            [
                f"PATIENT CONTEXT:\n{patient_context or '(none provided)'}",
                f"DOCTOR QUERY:\n{doctor_query}",
                f"VISION SPECIALIST OUTPUT:\n{vision_output or '(no image provided)'}",
                f"REASONING SPECIALIST OUTPUT:\n{reasoning_output}",
            ]
        )
        prompt = f"<s>[INST] {sys}\n\n{user} [/INST]"
        outputs = self.llm.generate(
            prompt,
            SamplingParams(temperature=0.2, top_p=0.9, max_tokens=max_tokens),
        )
        return {
            "text": outputs[0].outputs[0].text.strip(),
            "model_name": AGGREGATOR_MODEL,
        }


# ─── ASGI dispatcher — the only public endpoint ─────────────────────────────


@app.function(image=DISPATCHER_IMAGE, timeout=900)
@modal.asgi_app()
def fastapi_app():
    from fastapi import Body, FastAPI

    web = FastAPI(
        title="Polyglot-Attest",
        version="0.1.0",
        description="Unified dispatcher for the Polyglot-Attest medical AI ensemble.",
    )

    @web.get("/health")
    async def health():
        return {
            "ok": True,
            "service": "polyglot-attest",
            "routes": ["/transcribe", "/classify", "/analyze", "/think", "/synthesize"],
        }

    @web.post("/transcribe")
    async def transcribe(payload: dict = Body(...)):
        return await WhisperWorker().transcribe.remote.aio(
            audio_b64=payload["audio_b64"],
            language=payload.get("language"),
        )

    @web.post("/classify")
    async def classify(payload: dict = Body(...)):
        return await RouterWorker().classify.remote.aio(image_b64=payload["image_b64"])

    @web.post("/analyze")
    async def analyze(payload: dict = Body(...)):
        return await VisionWorker().analyze.remote.aio(
            image_b64=payload["image_b64"],
            region=payload["region"],
            clinical_context=payload.get("clinical_context", ""),
            max_tokens=int(payload.get("max_tokens", 512)),
        )

    @web.post("/think")
    async def think(payload: dict = Body(...)):
        return await ReasoningWorker().think.remote.aio(
            doctor_query=payload["doctor_query"],
            vision_output=payload.get("vision_output", ""),
            max_tokens=int(payload.get("max_tokens", 8192)),
        )

    @web.post("/synthesize")
    async def synthesize(payload: dict = Body(...)):
        return await AggregatorWorker().synthesize.remote.aio(
            doctor_query=payload["doctor_query"],
            vision_output=payload.get("vision_output", ""),
            reasoning_output=payload["reasoning_output"],
            patient_context=payload.get("patient_context", ""),
            max_tokens=int(payload.get("max_tokens", 1024)),
        )

    return web
