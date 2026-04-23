# Polyglot-Attest: Project Plan

Multi-LoRA medical AI ensemble on MedGemma-4B-IT base + 6 specialty adapters, with Monad on-chain attestation layer for clinical trust.

## Project Overview

**Vision**: Doctors run a multi-specialist medical vision AI on a single consumer GPU. Every inference's full provenance (which base, which LoRA adapter, which reasoning model, which input, which output, which doctor, which patient consent) is committed atomically to Monad mainnet via a custom ensemble attestation schema.

**Thesis novelty**: Multi-LoRA ensemble attestation schema. Single-model attestation exists in literature; LoRA-aware ensemble schema does not.

**Hardware target**: RTX 4090 24GB (used, ~$1300-1600) OR Mac Studio M4 Max 64GB (~$2500).

**Chain**: Monad (mainnet live since November 24, 2025; March 2026 hard fork active). Testnet during development, mainnet for final demo.

## Six Trust Primitives (Use Cases)

1. **ModelRegistry**: base + LoRA hashes on-chain, integrity check at boot
2. **InferenceAttestation**: ensemble schema with router + base + active LoRA + reasoning + aggregator
3. **ConsentRegistry**: patient opt-in / revocation with expiry
5. **ConsensusVault** (stretch): cross-hospital second-opinion voting
6. **CredentialSBT**: doctor licenses as soulbound NFTs
7. **DriftMonitor**: weekly canary tests, accuracy time-series, alert on drop

## Multi-SLM Ensemble Architecture

```
Image upload
    │
    v
[Pre-flight Gates - on-chain reads]
    ├─ CredentialSBT.hasValidLicense(doctor)
    ├─ ConsentRegistry.isValid(consentRef)
    └─ ModelRegistry.isApproved(loaded_models)
    │
    v
Router: ModernBERT-base (150M, fine-tuned)
    │ classifies image type
    v
MedGemma-4B-IT base + active LoRA adapter:
    ├─ medgemma-abdominal-ct-lora
    ├─ medgemma-musculoskeletal-lora
    ├─ medgemma-chest-xray-lora
    ├─ medgemma-retinal-oct-lora
    ├─ medgemma-brain-mri-lora
    └─ medgemma-dermatology-lora
    │
    v
Reasoning: DeepSeek-R1-Distill-Qwen-7B
    │ differential diagnosis
    v
Aggregator: Meerkat-7B (or Phi-4-mini-reasoning)
    │ final clinical text
    v
Hash collection + HSM signature
    │
    v
[InferenceAttestation.attest() on Monad]
    │
    v
Doctor sees: diagnosis + verified tx link
```

### VRAM Budget (RTX 4090 24GB)

| Component | VRAM (Q4) |
|-----------|-----------|
| MedGemma-4B-IT base | ~3.0 GB |
| 6 LoRA adapters | ~0.9 GB |
| ModernBERT router | ~0.3 GB |
| DeepSeek-R1-Distill-Qwen-7B | ~4.5 GB |
| Meerkat-7B aggregator | ~4.5 GB |
| KV cache pool (vLLM paged) | ~6.0 GB |
| Driver / CUDA overhead | ~1.0 GB |
| **Total** | **~20.2 GB** (fits with ~4 GB buffer) |

## Tech Stack (Locked In)

| Layer | Choice |
|-------|--------|
| Inference engine | vLLM 0.8+ with multi-LoRA support |
| Fallback engine | Ollama for quick model spot-checks |
| Router model | ModernBERT-base (150M), fine-tuned classifier |
| Vision base | MedGemma-4B-IT |
| Reasoning specialist | DeepSeek-R1-Distill-Qwen-7B |
| Aggregator | Meerkat-7B |
| Backend | FastAPI (Python 3.11) |
| Frontend (doctor + verifier + auditor) | React 18 + Vite + TypeScript + viem/wagmi |
| Smart contracts | Solidity 0.8.24 + Foundry |
| Chain | Monad testnet → Monad mainnet |
| Observability | Langfuse v3 + Prometheus + Grafana |
| Evaluation | Promptfoo + lm-evaluation-harness |
| HSM (dev) | Local keystore via `cast wallet import` |
| HSM (prod path) | YubiHSM2 |

## Smart Contracts to Implement

### ModelRegistry.sol

```solidity
contract ModelRegistry {
    enum ModelKind { BASE, LORA_ADAPTER, EMBEDDING, ROUTER }

    struct ModelEntry {
        bytes32 weightsHash;
        ModelKind kind;
        bytes32 baseRef;
        string  hfReference;
        string  ipfsCardURI;
        uint64  approvedAt;
        address approver;
        bool    active;
    }

    mapping(bytes32 => ModelEntry) public models;
    mapping(bytes32 => bytes32[]) public adaptersForBase;
    address public immutable HOSPITAL_MULTISIG;

    function approve(bytes32 hash, ModelKind kind, bytes32 baseRef,
                     string calldata hfRef, string calldata ipfsCard) external onlyMultisig;
    function deactivate(bytes32 hash, string calldata reason) external onlyMultisig;
    function isApproved(bytes32 hash) external view returns (bool);
    function isLoraOfBase(bytes32 lora, bytes32 base) external view returns (bool);
}
```

### InferenceAttestation.sol (the thesis core)

```solidity
contract InferenceAttestation {
    struct EnsembleAttestation {
        bytes32 routerHash;
        bytes32 baseHash;
        bytes32 activeLoraHash;        // KEY: which of 6 LoRAs
        bytes32 reasoningHash;
        bytes32 aggregatorHash;
        bytes32 inputHash;
        bytes32 visionOutputHash;
        bytes32 reasoningOutputHash;
        bytes32 finalOutputHash;
        bytes32 consentRef;
        address doctor;
        uint64  timestamp;
    }

    mapping(bytes32 => EnsembleAttestation) public attestations;

    function attest(bytes32 id, EnsembleAttestation calldata ea) external;
    function verify(bytes32 id, bytes32 inputHash, bytes32 finalOutputHash)
        external view returns (bool);
}
```

### ConsentRegistry.sol

```solidity
contract ConsentRegistry {
    struct Consent {
        bytes32 patientPseudonymHash;
        address hospital;
        bytes32 templateHash;
        uint64  signedAt;
        uint64  expiresAt;
        bool    revoked;
    }

    mapping(bytes32 => Consent) public consents;

    function record(bytes32 ref, bytes32 patientPseudonymHash,
                    bytes32 templateHash, uint64 expiresAt) external;
    function revoke(bytes32 ref) external;
    function isValid(bytes32 ref, address hospital) external view returns (bool);
}
```

### CredentialSBT.sol

```solidity
contract CredentialSBT is ERC721 {
    struct License {
        string  licenseNumber;
        string  specialty;
        uint64  issuedAt;
        uint64  expiresAt;
        address issuer;
        bool    suspended;
    }

    mapping(uint256 => License) public licenses;
    mapping(address => uint256) public doctorTokenId;
    address public immutable MEDICAL_BOARD;

    // Soulbound: only mint or burn allowed
    function _update(address to, uint256 tokenId, address auth)
        internal override returns (address);

    function issue(address doctor, string calldata licenseNum,
                   string calldata specialty, uint64 expiresAt) external returns (uint256);
    function suspend(uint256 tokenId, string calldata reason) external;
    function hasValidLicense(address doctor) external view returns (bool);
}
```

### DriftMonitor.sol

```solidity
contract DriftMonitor {
    struct CanaryRun {
        bytes32 ensembleSetupHash;
        bytes32 testSuiteHash;
        uint16  accuracyBps;
        uint64  runAt;
        address runner;
    }

    mapping(bytes32 => CanaryRun[]) public history;
    mapping(bytes32 => uint16) public alertThreshold;

    function submitRun(bytes32 setup, bytes32 testSuite, uint16 accBps) external;
    function setThreshold(bytes32 setup, uint16 bps) external;
    function getHistory(bytes32 setup) external view returns (CanaryRun[] memory);
}
```

### ConsensusVault.sol (stretch)

```solidity
contract ConsensusVault {
    struct ConsensusQuery {
        bytes32 inputHash;
        uint256 createdAt;
        address originator;
        bytes32[] attestationRefs;
        bytes32 majorityOutputHash;
        bool    resolved;
    }

    function createQuery(bytes32 qId, bytes32 inputHash) external;
    function submitOpinion(bytes32 qId, bytes32 attestationRef) external;
    function resolve(bytes32 qId) external;
}
```

## Repo Structure

```
polyglot-attest/
├── contracts/
│   ├── src/
│   │   ├── ModelRegistry.sol
│   │   ├── InferenceAttestation.sol
│   │   ├── ConsentRegistry.sol
│   │   ├── CredentialSBT.sol
│   │   ├── DriftMonitor.sol
│   │   └── ConsensusVault.sol
│   ├── script/
│   │   ├── Deploy.s.sol
│   │   └── RegisterMedVisionModels.s.sol
│   ├── test/
│   └── foundry.toml
├── gateway/
│   ├── main.py                  # FastAPI entry
│   ├── ensemble.py              # Multi-LoRA orchestration
│   ├── router.py                # ModernBERT classifier
│   ├── attestation.py           # Hash + sign + submit
│   ├── verifier.py              # Pre-flight gates
│   └── requirements.txt
├── ui/
│   ├── doctor/                  # Clinical UI
│   ├── verifier/                # Public /verify/:id
│   └── auditor/                 # Compliance view
├── canary/
│   ├── test_set.json
│   └── runner.py
├── models/
│   └── README.md                # Links to medvision collection
├── docker-compose.yml
└── README.md
```

---

## Tasks

### Setup & Infrastructure

- [ ] Create `polyglot-attest` GitHub repo (monorepo structure above)
- [ ] Install Foundry: `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- [ ] Clone Monad starter template: `git clone https://github.com/monad-developers/foundry-monad`
- [ ] Install OpenZeppelin contracts: `forge install OpenZeppelin/openzeppelin-contracts`
- [ ] Configure `foundry.toml` with Monad testnet + mainnet RPC endpoints
- [ ] Create Monad deployer keystore: `cast wallet import polyglot-deployer --interactive`
- [ ] Get testnet MON tokens from faucet (https://faucet.monad.xyz)
- [ ] Install Ollama, pull `medgemma:4b-it`
- [ ] Install vLLM 0.8+ (CUDA 12.6+ required)
- [ ] Set up Python 3.11 environment with uv: `uv venv && uv pip install fastapi uvicorn vllm transformers peft`
- [ ] Set up Docker + docker-compose for local stack
- [ ] Deploy Langfuse v3 self-hosted instance
- [ ] Deploy Prometheus + Grafana for metrics

### Multi-LoRA Ensemble

- [ ] Download MedGemma-4B-IT base model locally
- [ ] Download all 6 medvision LoRA adapters from HuggingFace
- [ ] Verify each LoRA loads correctly via `peft.PeftModel.from_pretrained()`
- [ ] Test base + chest-xray LoRA inference on sample image
- [ ] Test base + brain-mri LoRA inference on sample image
- [ ] Test all 6 LoRAs sequentially on respective sample images
- [ ] Configure vLLM with `--enable-lora --max-loras 8 --max-lora-rank 64`
- [ ] Benchmark LoRA swap latency (target: <50ms warm cache)
- [ ] Download DeepSeek-R1-Distill-Qwen-7B (Q4_K_M GGUF)
- [ ] Download Meerkat-7B aggregator model
- [ ] Verify total VRAM usage with all models hot loaded
- [ ] Implement Python ensemble orchestrator: image → router → LoRA swap → vision → reasoning → aggregator → output

### Router Classifier

- [ ] Collect 500-1000 medical image samples across 6 body regions (label = LoRA target)
- [ ] Fine-tune ModernBERT-base as classifier on image embeddings (use SigLIP encoder for image features)
- [ ] Achieve >92% routing accuracy on held-out test set
- [ ] Add `unsure` class with confidence threshold for fallback to general MedGemma
- [ ] Integrate router into ensemble pipeline
- [ ] Log routing decisions for observability

### FastAPI Gateway

- [ ] Implement `POST /diagnose` endpoint accepting image + patient_pseudonym + doctor_address
- [ ] Implement pre-flight gate: `CredentialSBT.hasValidLicense()` check
- [ ] Implement pre-flight gate: `ConsentRegistry.isValid()` check
- [ ] Implement pre-flight gate: `ModelRegistry.isApproved()` for all loaded models
- [ ] Implement hash computation: `keccak256(image_bytes)`, output hashes
- [ ] Implement HSM signing layer (dev: local keystore)
- [ ] Implement attestation submission to Monad with retry/backoff
- [ ] Implement local queue for failed/pending attestations
- [ ] Add Langfuse tracing per request

### ModelRegistry Contract

- [ ] Write `ModelRegistry.sol` with BASE / LORA_ADAPTER / ROUTER kinds
- [ ] Write Foundry tests covering: approve, deactivate, isApproved, isLoraOfBase
- [ ] Test edge case: LoRA registration must reference active base
- [ ] Deploy to Monad testnet
- [ ] Verify contract on Monad explorer (Sourcify)
- [ ] Write `RegisterMedVisionModels.s.sol` deployment script
- [ ] Compute and register hashes for: MedGemma-4B-IT base, 6 LoRA adapters, ModernBERT router, DeepSeek-R1-Distill-Qwen-7B, Meerkat-7B
- [ ] Confirm all 10 model entries are queryable on-chain
- [ ] Upload model cards to IPFS, link in registry entries

### InferenceAttestation Contract

- [ ] Write `InferenceAttestation.sol` with full ensemble schema
- [ ] Write Foundry tests covering: valid attestation, invalid LoRA-base mismatch, missing license, expired consent, double-attest prevention
- [ ] Implement gas optimization: pack struct fields to minimize storage slots
- [ ] Deploy to Monad testnet (after dependencies: ModelRegistry, ConsentRegistry, CredentialSBT)
- [ ] Submit first end-to-end attestation from gateway
- [ ] Verify attestation queryable via `attestations(id)` and `verify(id, inputHash, outputHash)`
- [ ] Measure on-chain confirmation latency (target: <1.5s)
- [ ] Measure tx cost (should be sub-cent)

### ConsentRegistry Contract

- [ ] Write `ConsentRegistry.sol`
- [ ] Write Foundry tests: record, revoke, isValid (with expiry edge cases)
- [ ] Deploy to Monad testnet
- [ ] Build consent UI: simple form, hospital signs on patient's behalf
- [ ] Test revocation flow end-to-end
- [ ] Verify expired consents fail attestation

### CredentialSBT Contract

- [ ] Write `CredentialSBT.sol` extending ERC721 with soulbound semantics
- [ ] Override `_update` to prevent transfers (mint/burn only)
- [ ] Write Foundry tests: issue, suspend, transfer rejection, hasValidLicense
- [ ] Deploy to Monad testnet with student as `MEDICAL_BOARD` for dev
- [ ] Mint test license SBT to dev wallet
- [ ] Confirm gateway pre-flight gate uses SBT correctly

### DriftMonitor Contract

- [ ] Write `DriftMonitor.sol`
- [ ] Write Foundry tests: submitRun, setThreshold, drift alert event
- [ ] Deploy to Monad testnet
- [ ] Build canary test set: 100 medical Q&A pairs, 1 per body region (use MedQA + radiology samples)
- [ ] Implement weekly cron runner script
- [ ] Submit first run, verify event emission
- [ ] Set initial threshold (e.g., 85% bps = 8500)
- [ ] Build Grafana panel: time-series accuracy chart from `getHistory()` event log

### ConsensusVault Contract (Stretch)

- [ ] Write `ConsensusVault.sol`
- [ ] Write Foundry tests: createQuery, submitOpinion, resolve majority
- [ ] Deploy to Monad testnet
- [ ] Simulate 3 virtual hospitals (same code, different keystore wallets, different ports)
- [ ] Run cross-hospital consensus on 1 difficult case
- [ ] Verify majority output hash on-chain matches expected

### Doctor UI

- [ ] Scaffold React + Vite + TypeScript app in `ui/doctor/`
- [ ] Install Tailwind + shadcn/ui
- [ ] Implement image upload component with preview
- [ ] Implement patient pseudonym input (or fetch from local DB)
- [ ] Connect to FastAPI `POST /diagnose`
- [ ] Display ensemble output: vision interpretation + reasoning + final recommendation
- [ ] Show "attestation queued" → "✓ verified on Monad" status
- [ ] Display tx hash with link to Monad explorer
- [ ] Add error states: gate failures (no license, no consent, model not approved)

### Patient Verifier UI

- [ ] Scaffold separate React app in `ui/verifier/`
- [ ] Implement `/verify/:attestationId` route
- [ ] Read attestation from Monad via viem
- [ ] Display human-readable summary: which models, when, by whom
- [ ] Allow user to upload original image to verify input hash matches
- [ ] Deploy to Vercel (public, no auth needed)

### Auditor UI

- [ ] Scaffold React app in `ui/auditor/`
- [ ] Implement filtered attestation list (by doctor, by date range, by LoRA used)
- [ ] Display drift history per ensemble setup
- [ ] Display consent records per patient pseudonym
- [ ] Export to CSV for compliance reports

### Evaluation & Benchmarking

- [ ] Build evaluation harness: 100 test cases per body region (600 total)
- [ ] Measure baseline: MedGemma-4B alone (no LoRA) on each region
- [ ] Measure ensemble: MedGemma-4B + correct LoRA on each region
- [ ] Measure full pipeline: router + LoRA + reasoning + aggregator
- [ ] Compute routing accuracy (which LoRA was picked)
- [ ] Compute end-to-end accuracy (LLM-as-judge with GPT-4 reference)
- [ ] Measure latency: P50, P95, P99 per pipeline stage
- [ ] Measure on-chain attestation overhead (median + tail)
- [ ] Generate Pareto chart: accuracy vs latency vs VRAM
- [ ] Compare with/without attestation overhead
- [ ] Compare ensemble vs single-model baselines

### Mainnet Migration

- [ ] Audit contracts (use Slither + manual review)
- [ ] Fund deployer wallet with mainnet MON
- [ ] Deploy all contracts to Monad mainnet
- [ ] Re-register all 10 models on mainnet
- [ ] Issue mainnet test license SBT
- [ ] Record mainnet consent for demo patient pseudonym
- [ ] Submit first mainnet attestation
- [ ] Update gateway config to mainnet RPC

### Polish & Thesis

- [ ] Record 3-minute demo video showing end-to-end flow
- [ ] Write README with architecture diagram, model list, setup instructions
- [ ] Add badges: tests passing, license, Monad-deployed
- [ ] Pin all model versions and dependency versions
- [ ] Write thesis Chapter 1: Background (SLM-first agentic AI, Apple Intelligence pattern)
- [ ] Write thesis Chapter 2: Multi-LoRA medical AI ensembles
- [ ] Write thesis Chapter 3: On-chain attestation primitives for clinical AI
- [ ] Write thesis Chapter 4: System implementation
- [ ] Write thesis Chapter 5: Evaluation results and ablations
- [ ] Write thesis Chapter 6: Limitations and future work (proof-of-inference gap, ZK-ML, TEE)
- [ ] Write dev.to / Medium blog post: "Multi-LoRA Medical AI with On-Chain Attestation on Monad"
- [ ] Submit to relevant workshop (MLSys, EMNLP Industry, ICLR Workshop)

---

## Acceptance Criteria

The project is "done" when all of these hold:

- [ ] `docker-compose up` brings up the entire stack on a fresh machine
- [ ] Doctor UI: upload chest X-ray → see diagnosis + tx link in under 8 seconds
- [ ] Patient verifier UI: paste attestation ID → see verified record from Monad mainnet
- [ ] All 10 models registered and queryable on Monad mainnet
- [ ] Pre-flight gate failures (no license, no consent, tampered model) correctly reject inference
- [ ] Drift monitor has at least 4 weeks of canary data on-chain
- [ ] At least one cross-hospital consensus query resolved on-chain (if stretch completed)
- [ ] All Foundry tests passing (`forge test`)
- [ ] Test coverage > 80% on contracts
- [ ] Demo video published
- [ ] Thesis submitted

---

## Risk Register

| Risk | Mitigation |
|------|------------|
| RTX 4090 24GB tight with 5 models hot loaded | Aggressive Q4 quantization, lazy-load reasoning model |
| Monad testnet reset mid-development | Contracts chain-agnostic; redeploy via single script |
| LoRA swap latency too high | Pre-warm top-3 most-used LoRAs based on routing logs |
| Router accuracy < 90% | Add `unsure` class, fall back to general MedGemma without LoRA |
| Attestation tx fails (network) | Local queue + exponential backoff retry, doctor sees "pending" |
| Thesis committee: "this is engineering, not research" | Frame contribution around novel ensemble attestation schema |
| Scope creep into RAG, fine-tuning, agents | Strict: only the 6 trust primitives + ensemble. Nothing else. |
| Proof-of-inference gap (no ZK-ML for 4B+ VLM today) | Honest framing: "social trust via HSM signing; ZK-ML future work" |

---

## Anti-Patterns (Do Not Do)

- Put PHI on-chain in any form, even encrypted
- Have patients hold their own crypto wallets
- Use smart contracts to make clinical decisions (advisory only)
- Make clinical care depend on chain liveness
- Add features beyond the 6 trust primitives during MVP
- Ignore HSM signing (cryptographic chain-of-custody is core)
- Skip the canary test set ("we'll measure later" never happens)

---

## Pre-Built Assets (Already Exist)

HuggingFace collection: https://huggingface.co/collections/efecelik/medvision-models

| Model | Base | Body region |
|-------|------|-------------|
| `efecelik/medgemma-abdominal-ct-lora` | MedGemma-4B-IT | Abdominal CT |
| `efecelik/medgemma-musculoskeletal-lora` | MedGemma-4B-IT | Musculoskeletal |
| `efecelik/medgemma-chest-xray-lora` | MedGemma-4B-IT | Chest X-ray |
| `efecelik/medgemma-retinal-oct-lora` | MedGemma-4B-IT | Retinal OCT |
| `efecelik/medgemma-brain-mri-lora` | MedGemma-4B-IT | Brain MRI |
| `efecelik/medgemma-dermatology-lora` | MedGemma-4B-IT | Dermatology |

These are the centerpiece of the project, not theoretical specifications.

---

## Key References

- NVIDIA: "Small Language Models are the Future of Agentic AI" (arXiv:2506.02153)
- DeepSeek-R1: arXiv:2501.12948
- Apple Intelligence Foundation Models: machinelearning.apple.com/research/introducing-apple-foundation-models
- Monad Developer Docs: docs.monad.xyz
- vLLM Multi-LoRA: docs.vllm.ai
- Meerkat medical SLM: nature.com/articles/s41746-025-01653-8

---

## Review Section

(To be filled after each phase completion: what worked, what changed from plan, what to update next.)
