# Polyglot-Attest · Smart Contracts

On-chain trust primitives for the Polyglot-Attest medical AI ensemble. Six contracts on Monad mainnet that enforce model integrity, doctor credentials, patient consent, and the **multi-LoRA ensemble attestation schema** that is the project's intellectual contribution.

## What's deployed

| Contract | Role |
|---|---|
| `ModelRegistry` | Approved model & LoRA-adapter hashes; enforces `isLoraOfBase(lora, base)` relationship integrity |
| `ConsentRegistry` | Patient opt-in / revocation, expiry, no PHI |
| `CredentialSBT` | ERC-721 soulbound medical license issued by a Medical Board |
| `InferenceAttestation` | The centerpiece. Multi-LoRA ensemble schema (STT + router + base + LoRA + reasoning + aggregator) committed atomically per reply |
| `DriftMonitor` | Time-series of canary-test accuracy, alerts on threshold breach |
| `ConsensusVault` | (Stretch) cross-hospital second-opinion voting on difficult cases |

## The novelty

Single-model attestation exists in literature. The novel claim of this thesis is:

> **The contract atomically enforces that an ensemble's `activeLoraHash` (when non-zero) is a registered LoRA adapter of `baseHash` at the moment of attestation.** This makes it cryptographically impossible to attest to an ensemble inference whose adapter was either unregistered, deactivated, or paired with a different base than the one it was trained against.

The check is `MODELS.isLoraOfBase(activeLoraHash, baseHash)`, called inside `InferenceAttestation.attest`. See `src/InferenceAttestation.sol` § 5 for the exact line, and `test/InferenceAttestation.t.sol :: test_attest_loraBaseMismatchIsRejected` for the proof-by-test.

## Schema

```solidity
struct EnsembleAttestation {
    bytes32 sttHash;             // 0x0 if voice was not used
    bytes32 routerHash;          // 0x0 if no routing was performed
    bytes32 baseHash;            // 0x0 if no vision call
    bytes32 activeLoraHash;      // 0x0 if no LoRA was activated
    bytes32 reasoningHash;       // 0x0 if reasoning was not invoked
    bytes32 aggregatorHash;      // ALWAYS required
    bytes32 inputHash;           // ALWAYS required
    bytes32 visionOutputHash;    // 0x0 if no vision step
    bytes32 reasoningOutputHash; // 0x0 if no reasoning step
    bytes32 finalOutputHash;     // ALWAYS required
    bytes32 consentRef;          // ALWAYS required
    address doctor;              // attesting doctor (set by contract)
    uint64  timestamp;           // set by contract
}
```

Voice-only follow-up uses `sttHash` and zeroes `routerHash`/`baseHash`/`activeLoraHash`. Pure text follow-up zeroes everything except `reasoningHash`, `aggregatorHash`, and the mandatory output triplet. The contract validates whatever was used.

## The medvision ensemble

`script/RegisterMedVisionModels.s.sol` registers the 11 models that make up the production ensemble:

| Role | Model |
|---|---|
| STT | `openai/whisper-large-v3-turbo` |
| Router | `answerdotai/ModernBERT-base` |
| Vision base | `google/medgemma-4b-it` |
| LoRA · abdominal CT | `efecelik/medgemma-abdominal-ct-lora` |
| LoRA · musculoskeletal | `efecelik/medgemma-musculoskeletal-lora` |
| LoRA · chest X-ray | `efecelik/medgemma-chest-xray-lora` |
| LoRA · retinal OCT | `efecelik/medgemma-retinal-oct-lora` |
| LoRA · brain MRI | `efecelik/medgemma-brain-mri-lora` |
| LoRA · dermatology | `efecelik/medgemma-dermatology-lora` |
| Reasoning | `deepseek-ai/DeepSeek-R1-Distill-Qwen-7B` |
| Aggregator | `dmis-lab/Meerkat-7B` |

All hashes in the deploy script are `keccak256(name)` placeholders. Replace with `keccak256(weights file bytes)` before mainnet deployment.

## Build, test, deploy

```sh
# One-off setup
forge install OpenZeppelin/openzeppelin-contracts --shallow
forge install foundry-rs/forge-std --shallow

# Build (compiles 26 Solidity files via solc 0.8.24)
forge build

# Test (51 tests across 6 contracts — all passing)
forge test -vv

# Gas snapshot
forge test --gas-report

# Deploy to Monad testnet
export MEDICAL_BOARD=0x...
export HOSPITAL_ADMIN=0x...
cast wallet import polyglot-deployer --interactive   # safer than raw private key
forge script script/Deploy.s.sol \
    --rpc-url monad_testnet \
    --account polyglot-deployer \
    --broadcast

# Register medvision ensemble in the just-deployed registry
export MODEL_REGISTRY=0x...   # address printed by Deploy.s.sol
forge script script/RegisterMedVisionModels.s.sol \
    --rpc-url monad_testnet \
    --account polyglot-deployer \
    --broadcast
```

Same commands with `--rpc-url monad_mainnet` deploy to mainnet (Monad mainnet has been live since 24 Nov 2025; March 2026 hard fork added the reserve-balance precompile and linear EVM memory model — neither is a hard dependency of this project).

## Test summary

```
Ran 6 test suites: 51 tests passed, 0 failed
  - CredentialSBT       (10 tests) — issuance, suspension, expiry, soulbound enforcement
  - ConsentRegistry     ( 8 tests) — record / revoke / expiry / status
  - ModelRegistry       (11 tests) — approval, LoRA-base relationship, deactivation
  - InferenceAttestation(13 tests) — full / text-only / voice / mismatch / errors
  - DriftMonitor        ( 5 tests) — runs, thresholds, alerts
  - ConsensusVault      ( 4 tests) — majority, ties, errors
```

Critical novelty tests:

- `test_attest_unregisteredLoraIsRejected` — attestation with hand-rolled LoRA hash reverts.
- `test_attest_loraBaseMismatchIsRejected` — even with two registered base models and one valid LoRA, declaring the wrong base reverts.
- `test_attest_loraWithoutBaseIsRejected` — supplying a LoRA without a base reverts.

## Gas snapshot (key entry points)

```
attest()         min  29.4k   avg 241k   max 396k    ($ trivial on Monad)
verify()         26k                                   (view, free)
issue() (SBT)    73k                                   (one-shot per doctor)
record() consent 105k                                  (once per patient encounter)
approve() model  200k avg                              (once per ensemble change)
```

A busy hospital writing 1 000 attestations / day pays ≈ 0.4 MON / day at current testnet pricing — operationally trivial.

## Design decisions

- **Solidity 0.8.24**, Cancun EVM, optimizer 800 runs — matches Monad's supported toolchain.
- **Custom errors** (not `require` strings) for gas + richer revert data.
- **No upgradeability**. The immutable promise is what makes attestations valuable; bug-fix path is deploy v2 + migrate.
- **Doctor = msg.sender**. SBT-bearing wallet signs directly. Production would use ERC-4337 / meta-tx so the hospital sponsors gas; this is documented as future work.
- **Hospital affiliation enforcement** is out-of-scope MVP. Any active SBT holder can attest using any active consent. A `HospitalAffiliationRegistry` is future work.
- **PHI never on-chain**. Only `bytes32` hashes, addresses, opaque pseudonyms.
- **Patient pseudonym** is a per-hospital random `bytes32`. Hospital DB stores the patient ↔ pseudonym mapping locally.

## Anti-patterns deliberately avoided

- Patient-held wallets (UX dead, anti-pattern in healthcare blockchain literature).
- On-chain raw outputs (re-identification risk through embedded PHI).
- Smart contract making clinical decisions (legally invalid in every relevant jurisdiction).
- Token economics / governance.
- Real-time chain liveness as a hard dependency for clinical care (attestations queue locally and submit asynchronously).

## Layout

```
contracts/
├── foundry.toml
├── lib/                              # forge dependencies (gitignored)
├── src/
│   ├── ModelRegistry.sol
│   ├── ConsentRegistry.sol
│   ├── CredentialSBT.sol
│   ├── InferenceAttestation.sol      # ← thesis core
│   ├── DriftMonitor.sol
│   ├── ConsensusVault.sol
│   └── lib/
│       └── Errors.sol
├── script/
│   ├── Deploy.s.sol
│   └── RegisterMedVisionModels.s.sol
└── test/
    ├── BaseTest.t.sol
    ├── CredentialSBT.t.sol
    ├── ConsentRegistry.t.sol
    ├── ModelRegistry.t.sol
    ├── InferenceAttestation.t.sol
    ├── DriftMonitor.t.sol
    └── ConsensusVault.t.sol
```
