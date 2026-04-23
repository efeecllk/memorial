# contracts/ · AI assistant brief

Foundry · Solidity 0.8.24 · 7 contracts · 72 tests · deployed on Monad.

Part of the Polyglot-Attest monorepo; see `../CLAUDE.md` for project-wide context and user conventions.

## What lives here

| Contract | Purpose |
|---|---|
| `ModelRegistry.sol` | Approved model / LoRA-adapter hashes; enforces `isLoraOfBase` relationship |
| `InferenceAttestation.sol` | Multi-LoRA ensemble attestation — the thesis's first intellectual core |
| `ConsentRegistry.sol` | Patient opt-in / revocation with expiry |
| `CredentialSBT.sol` | ERC-721 soulbound medical licence |
| `DriftMonitor.sol` | Canary accuracy time-series |
| `ConsensusVault.sol` | Cross-hospital second-opinion voting (stretch) |
| `ClinicalDecisionAttestation.sol` | **New** — doctor-side deliberation attestation, linked to an InferenceAttestation via on-chain invariants |

The key invariants a future change must not break:

- `InferenceAttestation.attest()` step 5 — `MODELS.isLoraOfBase(activeLora, base)` is the first thesis novelty. Do NOT relax this check.
- `ClinicalDecisionAttestation.attest()` steps 4–6 — inference linkage (exists, doctor match, timestamp ordering, LoRA snapshot match) is the second thesis novelty. Do NOT relax these.
- `K_ANON_MIN = 20` on aggregate-read functions. Ethical guardrail; do not reduce without governance-framework update.

## Build / test / deploy

```sh
forge build             # via_ir must remain on; attest() stack-depth depends on it
forge test              # 72 tests across 7 suites
forge test --gas-report
forge fmt

# Deploy to Monad testnet:
source .env
forge script script/Deploy.s.sol \
    --rpc-url monad_testnet \
    --private-key $PRIVATE_KEY \
    --broadcast

# Register medvision ensemble (11 models):
export MODEL_REGISTRY=0x...   # address from Deploy.s.sol output
forge script script/RegisterMedVisionModels.s.sol \
    --rpc-url monad_testnet \
    --private-key $PRIVATE_KEY \
    --broadcast
```

## Conventions

- **Custom errors** (not `require` strings) — defined in `src/lib/Errors.sol`. Every revert path must use one.
- **NatSpec** on every public / external function. Thesis committee reads this source.
- **Tests live in `test/<ContractName>.t.sol`**, extending `BaseTest` where possible for shared fixtures.
- **No upgradeability**. The immutability of attestations is what makes them valuable; bug-fix path is deploy v2 + migrate.
- **`via_ir = true`** in `foundry.toml` is load-bearing. Removing it triggers stack-too-deep in `ClinicalDecisionAttestation.attest()`.

## Testnet wallet

`.env` (gitignored) holds a throwaway deployer keypair for Monad testnet. It has no value on mainnet. To regenerate: `cast wallet new`, then update `.env` + fund at https://faucet.monad.xyz.

## Things to NOT do

- Do NOT remove `forge-cache`, `out/`, `broadcast/` from `.gitignore`.
- Do NOT commit the `lib/` directory (it's submoduled via `forge install`).
- Do NOT add a patch around `isLoraOfBase` that weakens the adapter-base relationship check.
- Do NOT change the `EnsembleAttestation` struct field order in `InferenceAttestation.sol` — the gateway ABI is generated from it, and a positional tuple is what ConsensusVault and the Python client rely on.
