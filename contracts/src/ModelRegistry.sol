// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Errors } from "./lib/Errors.sol";

/// @title  ModelRegistry — Approved AI models and LoRA adapters
/// @author Polyglot-Attest
/// @notice Authoritative on-chain registry of every model that the hospital
///         has approved for clinical use, including their cryptographic
///         weight hashes, kind (base / LoRA / router / etc.), and the
///         relationship between LoRA adapters and their base models.
///
/// @dev    The novel property exposed for downstream attestation is
///         `isLoraOfBase(lora, base)` — InferenceAttestation enforces this
///         relationship atomically when a multi-LoRA ensemble reply is
///         submitted, preventing impossible model combinations from being
///         attested as if they were valid.
contract ModelRegistry {
    // ── types ────────────────────────────────────────────────────────────────

    /// @notice High-level role of a model in the ensemble.
    enum ModelKind {
        BASE,         // 0 — vision / language base model
        LORA_ADAPTER, // 1 — adapter on top of a BASE
        ROUTER,       // 2 — classifier that selects an adapter
        REASONING,    // 3 — thinking-mode model
        AGGREGATOR,   // 4 — final-text synthesiser
        STT,          // 5 — speech-to-text
        EMBEDDING     // 6 — embedding/encoder
    }

    struct ModelEntry {
        bytes32   weightsHash;  // == keccak256(serialised weights file)
        ModelKind kind;
        bytes32   baseRef;      // for LORA_ADAPTER, the BASE this attaches to
        string    hfReference;  // e.g. "efecelik/medgemma-chest-xray-lora@<commit>"
        string    ipfsCardURI;  // human-readable model card (ipfs:// or https://)
        uint64    approvedAt;
        address   approver;     // hospital admin / multisig that approved
        bool      active;       // approved & not deactivated
    }

    // ── state ────────────────────────────────────────────────────────────────

    /// @notice Single hospital admin / multisig that controls registry writes.
    /// @dev    For production, set this to a Safe; for thesis MVP, an EOA.
    address public immutable HOSPITAL_ADMIN;

    /// @dev Hash → entry.
    mapping(bytes32 weightsHash => ModelEntry) public models;

    /// @dev Base hash → list of registered LoRA adapter hashes (enumeration).
    mapping(bytes32 baseHash => bytes32[]) private _adaptersOfBase;

    // ── events ───────────────────────────────────────────────────────────────

    event ModelApproved(
        bytes32 indexed weightsHash,
        ModelKind indexed kind,
        bytes32 indexed baseRef,
        string hfReference
    );

    event ModelDeactivated(bytes32 indexed weightsHash, string reason);

    event ModelReactivated(bytes32 indexed weightsHash);

    // ── ctor / mod ───────────────────────────────────────────────────────────

    constructor(address hospitalAdmin) {
        HOSPITAL_ADMIN = hospitalAdmin;
    }

    modifier onlyAdmin() {
        if (msg.sender != HOSPITAL_ADMIN) revert Errors.NotHospitalAdmin(msg.sender);
        _;
    }

    // ── writes ───────────────────────────────────────────────────────────────

    /// @notice Approve a new model for clinical use.
    /// @param  weightsHash  Cryptographic hash of the model file.
    /// @param  kind         Role this model plays in the ensemble.
    /// @param  baseRef      For LORA_ADAPTER, hash of the BASE it attaches to;
    ///                      MUST be `bytes32(0)` for any other kind.
    /// @param  hfReference  HuggingFace ref (or other locator) for the artifact.
    /// @param  ipfsCardURI  Pointer to a human-readable model card.
    function approve(
        bytes32 weightsHash,
        ModelKind kind,
        bytes32 baseRef,
        string calldata hfReference,
        string calldata ipfsCardURI
    )
        external
        onlyAdmin
    {
        if (models[weightsHash].weightsHash != bytes32(0)) {
            revert Errors.ModelAlreadyRegistered(weightsHash);
        }

        if (kind == ModelKind.LORA_ADAPTER) {
            // LoRA must reference an active BASE.
            ModelEntry memory parent = models[baseRef];
            if (parent.weightsHash == bytes32(0) || !parent.active) {
                revert Errors.InvalidBaseReference(baseRef);
            }
            if (parent.kind != ModelKind.BASE) {
                revert Errors.WrongModelKind(baseRef);
            }
            _adaptersOfBase[baseRef].push(weightsHash);
        } else {
            // Non-LoRA entries must not carry a base reference.
            if (baseRef != bytes32(0)) revert Errors.InvalidBaseReference(baseRef);
        }

        models[weightsHash] = ModelEntry({
            weightsHash: weightsHash,
            kind:        kind,
            baseRef:     baseRef,
            hfReference: hfReference,
            ipfsCardURI: ipfsCardURI,
            approvedAt:  uint64(block.timestamp),
            approver:    msg.sender,
            active:      true
        });

        emit ModelApproved(weightsHash, kind, baseRef, hfReference);
    }

    /// @notice Soft-disable a model (e.g. after a discovered bias or weight
    ///         tamper). Inference attestations referencing it will revert.
    function deactivate(bytes32 weightsHash, string calldata reason) external onlyAdmin {
        if (models[weightsHash].weightsHash == bytes32(0)) {
            revert Errors.ModelNotApproved(weightsHash);
        }
        models[weightsHash].active = false;
        emit ModelDeactivated(weightsHash, reason);
    }

    /// @notice Re-enable a previously deactivated model.
    function reactivate(bytes32 weightsHash) external onlyAdmin {
        if (models[weightsHash].weightsHash == bytes32(0)) {
            revert Errors.ModelNotApproved(weightsHash);
        }
        models[weightsHash].active = true;
        emit ModelReactivated(weightsHash);
    }

    // ── views ────────────────────────────────────────────────────────────────

    /// @notice True iff the model exists and is currently approved.
    function isApproved(bytes32 weightsHash) external view returns (bool) {
        ModelEntry memory m = models[weightsHash];
        return m.weightsHash != bytes32(0) && m.active;
    }

    /// @notice True iff `lora` is a registered, active LoRA adapter for `base`.
    /// @dev    This is the relationship integrity check that the multi-LoRA
    ///         ensemble attestation schema relies on.
    function isLoraOfBase(bytes32 lora, bytes32 base) external view returns (bool) {
        ModelEntry memory m = models[lora];
        return m.active
            && m.kind == ModelKind.LORA_ADAPTER
            && m.baseRef == base;
    }

    /// @notice True iff `hash` is registered with the expected role.
    function isOfKind(bytes32 hash, ModelKind expected) external view returns (bool) {
        ModelEntry memory m = models[hash];
        return m.weightsHash != bytes32(0) && m.kind == expected;
    }

    /// @notice Enumerate all LoRA adapter hashes registered against `base`.
    function adaptersOf(bytes32 base) external view returns (bytes32[] memory) {
        return _adaptersOfBase[base];
    }
}
