# Memorial

Memorial is a thesis project for trustworthy medical AI in hospitals. It combines a local multi-model clinical workstation, specialist LoRA routing, and on-chain provenance on Monad testnet so a hospital can later prove what model stack produced a response, under which consent context, and with which registered specialist adapter.

This repository contains the full system:

- a React hospital workstation demo
- a FastAPI gateway that orchestrates the model pipeline
- Solidity contracts for attestation, consent, credentials, drift, and decision tracking
- Modal deployment code for serverless GPU inference
- a presentation site and public demo site

## Live links

- Main site: https://memorial-two-gilt.vercel.app/
- Presentation: https://memorial-two-gilt.vercel.app/presentation/
- Demo: https://memorial-two-gilt.vercel.app/demo/
- GitHub: https://github.com/efeecllk/memorial

## The idea

Most medical AI demos stop at "the model answered." That is not enough for real clinical use.

What actually matters in a hospital is:

1. Which exact model stack produced the output?
2. Which specialist adapter was active for that case?
3. Was the adapter actually approved for that base model?
4. Was valid patient consent in force at the time?
5. Can the hospital prove provenance later without leaking PHI on-chain?
6. Can the system eventually measure how clinicians respond to AI assistance instead of only logging what the AI said?

Memorial is built around that gap.

The core claim is not "put medical AI on blockchain."

The core claim is:

> A hospital can run medical AI locally, keep raw patient data off-chain, and still produce a cryptographically auditable record of which ensemble configuration generated each reply, including which LoRA adapter was paired with which base model at attestation time.

That is the point of the project.

## What makes it novel

Single-model attestation is not enough for modern medical AI systems. Real deployments increasingly use pipelines:

- speech-to-text
- region routing
- a base vision-language model
- a specialty-specific LoRA adapter
- a reasoning model
- a final clinical writing model

Memorial attests the whole ensemble, not a single checkpoint.

The most important invariant is enforced on-chain:

- if an `activeLoraHash` is present, it must be a registered LoRA of the declared `baseHash`
- if the LoRA is unregistered, inactive, or paired with the wrong base, the attestation reverts

That turns specialist routing from a UI claim into a cryptographically checkable claim.

The second layer of the idea is the clinician decision layer:

- `InferenceAttestation` captures what the AI stack produced
- `ClinicalDecisionAttestation` captures what the doctor actually decided, plus deliberation signals

That contract already exists in this repository. It extends the system from pure provenance into a socio-technical audit layer for automation bias, override behavior, and clinician review quality.

## Product overview

Memorial looks like a hospital workstation, but under the surface it is a provenance system.

### 1. Doctor workstation

The frontend is a Vite + React application styled like an editorial clinical console rather than a generic SaaS dashboard.

Main views:

- Doctor Console
- Ward Round
- Schedule
- Patient Record

The Doctor Console is the primary product surface:

- the doctor types or dictates a query
- a study can be attached
- the system routes the case to the appropriate specialist path
- the AI response returns with provenance metadata
- the UI shows chain activity and model history in context

### 2. Gateway orchestration

The gateway is the hospital-side FastAPI service. It coordinates the full model pipeline:

- Whisper STT
- ModernBERT region router
- MedGemma-4B vision base
- six specialist LoRAs
- DeepSeek-R1-Distill-Qwen-7B reasoning
- Meerkat-7B aggregation

It also:

- hashes the relevant inputs and outputs
- builds the ensemble attestation payload
- submits the attestation to Monad testnet
- returns a doctor-visible response plus provenance receipt

### 3. Smart contract layer

The contracts enforce the trust model:

- `ModelRegistry` stores approved models and LoRA/base relationships
- `ConsentRegistry` stores patient consent references without PHI
- `CredentialSBT` proves clinician credential status
- `InferenceAttestation` commits full ensemble provenance
- `DriftMonitor` tracks canary-style quality drift
- `ConsensusVault` supports future multi-hospital or second-opinion workflows
- `ClinicalDecisionAttestation` links the eventual doctor decision back to the inference

### 4. GPU inference layer

The model-serving layer can run in two ways:

- local / on-prem style deployment via Docker and vLLM
- remote serverless GPU workers via Modal

That gives the project two stories at once:

- thesis/research credibility through a full architecture
- demo practicality through remote GPU hosting

## Core features

### Local-first medical AI workflow

Memorial is designed around the hospital workstation as the trust boundary.

Raw clinical data should stay local whenever possible:

- raw text does not go on-chain
- patient identifiers do not go on-chain
- free-text override reasons do not go on-chain
- only hashes, addresses, timestamps, and consent references go on-chain

### Specialist LoRA routing

The system does not pretend one generic model is enough for every case.

It supports a MedGemma base plus six specialist LoRAs:

- abdominal CT
- musculoskeletal
- chest X-ray
- retinal OCT
- brain MRI
- dermatology

This is important because the project is making a stronger claim than "AI helped":

- which specialist path was used matters
- proving that path matters
- proving that the adapter was valid for the base model matters

### Atomic ensemble attestation

Every response can be represented as a single attestation covering:

- input hash
- STT stage hash
- router hash
- base model hash
- active LoRA hash
- reasoning hash
- aggregator hash
- intermediate output hashes
- final output hash
- consent reference
- attesting doctor
- contract-side timestamp

That allows downstream auditing without ever exposing raw chart contents on-chain.

### Future-facing clinician decision attestation

This repository already includes the contract design for the next step:

- concordance with AI output
- edit distance style surface-change signals
- deliberation time
- follow-up count
- outcome type
- override reason hash

That is what upgrades the project from a model provenance demo into a clinician deliberation study platform.

### Privacy-first chain model

The system is intentionally hostile to casual PHI leakage.

Key rule:

> Hashes only on-chain.

No chart text, no patient names, no free-text reasoning payloads, no raw image data.

### Demo-ready product surfaces

The repository also ships with:

- a landing page
- a thesis/investor presentation
- a public static demo build

So the project can be understood as:

- a research artifact
- a systems architecture
- a product concept
- a live demo

## End-to-end flow

This is the intended path for a real inference:

1. A doctor opens the Memorial workstation.
2. The doctor enters text, voice, or an imaging-assisted question.
3. If voice is used, Whisper transcribes locally or through the configured service.
4. If an image is used, the router selects the relevant body region.
5. The vision stack runs MedGemma with the correct specialist LoRA.
6. The reasoning model interprets the case context.
7. The aggregator turns all intermediate outputs into a clinician-facing answer.
8. The gateway hashes the used artifacts and model identities.
9. The gateway submits an `InferenceAttestation` to Monad testnet.
10. The UI receives the answer plus a provenance receipt.
11. In the extended design, the doctor's eventual action is committed through `ClinicalDecisionAttestation`.

## Why Monad testnet

The chain layer is currently positioned on Monad testnet.

Why use chain infrastructure at all?

- immutable provenance
- third-party verifiability
- strong separation between hospital-local PHI and public audit artifacts
- easier external review than internal log files
- cleaner trust story for model provenance and consent linkage

Why Monad specifically?

- EVM compatibility
- high-throughput target
- low enough overhead for frequent attestation writes
- a good fit for proving clinical provenance without turning chain gas into the main story

The blockchain is not the product. It is the audit substrate.

## Architecture

```text
Doctor UI (React)
    |
    v
Gateway (FastAPI)
    |
    +--> Whisper
    +--> ModernBERT Router
    +--> MedGemma-4B + specialist LoRA
    +--> DeepSeek-R1-Distill-Qwen-7B
    +--> Meerkat-7B
    |
    v
Hashing + provenance manifest
    |
    v
InferenceAttestation on Monad testnet
    |
    v
Future: ClinicalDecisionAttestation
```

## Repository structure

```text
.
├── contracts/      Solidity contracts and Foundry tests
├── gateway/        FastAPI orchestration layer
├── hospital/       React workstation UI
├── services/modal/ Modal GPU serving code
├── landing/        landing page source
├── presentation/   public presentation route
├── demo/           public static demo route
├── pitch/          source slide deck HTML
├── tasks/          research and implementation planning docs
└── index.html      root entry that forwards to landing
```

### `contracts/`

This folder holds the formal trust layer of the project.

Important files:

- `contracts/src/InferenceAttestation.sol`
- `contracts/src/ClinicalDecisionAttestation.sol`
- `contracts/src/ModelRegistry.sol`
- `contracts/src/ConsentRegistry.sol`

### `gateway/`

This is the system brain for orchestration, hashing, and chain submission.

Important files:

- `gateway/src/main.py`
- `gateway/src/ensemble.py`
- `gateway/src/attestation.py`
- `gateway/src/hashing.py`

### `hospital/`

This is the product surface people actually interact with.

Important files:

- `hospital/src/App.tsx`
- `hospital/src/components/DoctorConsole.tsx`
- `hospital/src/components/Dashboard.tsx`
- `hospital/src/lib/departments.ts`

### `services/modal/`

This folder contains the remote GPU inference deployment path.

## Current implementation status

What already exists in this repository:

- complete React workstation mockup
- live public landing/demo/presentation deployment
- FastAPI gateway with mock and live-serving modes
- hashing and attestation plumbing
- Solidity contracts for inference provenance
- Solidity contract for clinician decision attestation
- Modal deployment code
- GitHub repository and Vercel deployment

What is partly implemented or staged for the next phase:

- full decision-layer UI integration
- richer governance surfaces around clinician deliberation metrics
- stronger institution-level access control around sensitive aggregates
- production-grade HSM-backed signing flow
- tighter live wiring between all layers in non-mock mode

## Privacy and safety principles

This project is built around several non-negotiable rules:

### 1. No PHI on-chain

Only opaque references and hashes belong on-chain.

### 2. The model must never be able to self-certify without registry constraints

That is why `ModelRegistry` and the LoRA/base relationship matter.

### 3. Clinical care must not depend on chain liveness

Attestation is an audit layer, not a gate for patient treatment.

### 4. The system should measure clinician interaction carefully

The decision layer is valuable, but it can also become surveillance if designed badly. The project explicitly recognizes that risk.

### 5. Automation bias is part of the problem definition

The project is not trying to maximize blind acceptance of AI outputs. It is trying to measure and improve how clinicians engage with AI support.

## Research contribution

This project sits at the intersection of:

- trustworthy AI
- medical AI systems
- human-AI interaction
- healthcare privacy engineering
- blockchain-based auditability

The contribution is stronger than a normal full-stack demo because it proposes a specific, falsifiable systems claim:

- specialist-adapter provenance can be enforced on-chain
- clinician response to AI can also be captured as an auditable layer
- both can be done without putting sensitive patient data on-chain

That gives the project both engineering depth and publishable research shape.

## Running locally

### Frontend

```sh
cd hospital
pnpm install
pnpm dev
```

### Gateway

```sh
cd gateway
uv venv
uv pip install -e ".[dev]"
uv run uvicorn src.main:app --reload --port 8000
```

### Contracts

```sh
cd contracts
forge build
forge test
```

### Modal

```sh
cd services/modal
modal deploy polyglot_app.py
```

## Tests

At a high level, the repository already includes:

- Foundry contract tests
- gateway tests for hashing and pipeline behavior
- a static demo build for shareable UI review

The assistant brief in this repo currently references:

- 72 passing Solidity tests
- 11 gateway tests in mock mode

## Legacy naming note

This codebase started with the internal working name `Polyglot-Attest`, and the local folder name is still `kayseri`.

Current public-facing naming is:

- product name: `Memorial`
- GitHub repository: `efeecllk/memorial`
- public Vercel site: `memorial-two-gilt.vercel.app`

If you see `Polyglot-Attest` or `kayseri` in older docs or config, treat those as legacy names, not the current product brand.

## If you want the shortest summary

Memorial is a medical AI workstation that tries to answer a harder question than "can AI help with diagnosis?"

It asks:

> Can a hospital prove which specialist model path produced a clinical suggestion, keep patient data private, and later study how doctors responded to that suggestion with cryptographic integrity?

This repository is the first full version of that answer.
