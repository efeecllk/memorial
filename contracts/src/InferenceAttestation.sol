// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { CredentialSBT }   from "./CredentialSBT.sol";
import { ConsentRegistry } from "./ConsentRegistry.sol";
import { ModelRegistry }   from "./ModelRegistry.sol";
import { Errors }          from "./lib/Errors.sol";

/// @title  InferenceAttestation — Multi-LoRA ensemble attestation schema
/// @author Polyglot-Attest
/// @notice The intellectual core of the project. Records every clinical AI
///         reply as a single, atomic, cryptographically integral provenance
///         record on Monad.
///
/// @dev    The schema captures every model that participated in producing a
///         reply: optionally an STT model (for voice input), a routing model
///         (for image classification), a vision base + active LoRA adapter
///         (for image analysis), a reasoning model, and a final aggregator,
///         plus the input / per-stage / final output hashes, the patient
///         consent reference, the attesting doctor and the timestamp.
///
///         The novelty:
///         the contract atomically enforces, at attest-time, that
///         `activeLoraHash` (when non-zero) is a registered LoRA adapter of
///         `baseHash`. This makes it impossible to attest to an inference
///         that combined an unregistered or mismatched adapter with a base.
///
///         Fields that were not used in a particular reply (e.g. the LoRA
///         field for a text-only follow-up) are simply set to `bytes32(0)`.
contract InferenceAttestation {
    // ── types ────────────────────────────────────────────────────────────────

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
        address doctor;              // attesting doctor (must equal msg.sender)
        uint64  timestamp;           // set by contract; clients pass 0
    }

    // ── state ────────────────────────────────────────────────────────────────

    CredentialSBT   public immutable SBT;
    ConsentRegistry public immutable CONSENT;
    ModelRegistry   public immutable MODELS;

    /// @dev `id` → attestation. `id` is supplied by the client; typical
    /// construction is keccak256(input || finalOutput || timestamp || nonce).
    mapping(bytes32 id => EnsembleAttestation) public attestations;

    // ── events ───────────────────────────────────────────────────────────────

    /// @dev `activeLoraHash` is indexed so that off-chain dashboards can
    ///       answer "what LoRA was used most this week?" in one filter.
    event Attested(
        bytes32 indexed id,
        address indexed doctor,
        bytes32 indexed activeLoraHash,
        bytes32 baseHash,
        bytes32 reasoningHash,
        bytes32 aggregatorHash,
        bytes32 inputHash,
        bytes32 finalOutputHash,
        bytes32 consentRef,
        uint64  timestamp
    );

    // ── ctor ─────────────────────────────────────────────────────────────────

    constructor(address sbt, address consent, address models) {
        SBT     = CredentialSBT(sbt);
        CONSENT = ConsentRegistry(consent);
        MODELS  = ModelRegistry(models);
    }

    // ── writes ───────────────────────────────────────────────────────────────

    /// @notice Submit one ensemble attestation.
    /// @param  id  Client-chosen unique id (typically a content hash).
    /// @param  ea  The full attestation tuple. `timestamp` and `doctor` are
    ///             overwritten by the contract; the client should pass 0 / 0x0
    ///             but the values are accepted for ergonomic reasons.
    function attest(bytes32 id, EnsembleAttestation calldata ea) external {
        // ── 1. structural sanity ─────────────────────────────────────────────
        if (attestations[id].timestamp != 0) revert Errors.AttestationAlreadyExists(id);

        if (ea.aggregatorHash  == bytes32(0)) revert Errors.MissingRequiredHash("aggregator");
        if (ea.inputHash       == bytes32(0)) revert Errors.MissingRequiredHash("input");
        if (ea.finalOutputHash == bytes32(0)) revert Errors.MissingRequiredHash("finalOutput");
        if (ea.consentRef      == bytes32(0)) revert Errors.MissingRequiredHash("consentRef");

        // ── 2. doctor identity ───────────────────────────────────────────────
        if (!SBT.hasValidLicense(msg.sender)) revert Errors.LicenseMissing(msg.sender);

        // ── 3. consent freshness ─────────────────────────────────────────────
        if (!CONSENT.isActive(ea.consentRef)) revert Errors.ConsentRevoked(ea.consentRef);

        // ── 4. model integrity ───────────────────────────────────────────────
        // Aggregator is mandatory; the rest are checked iff non-zero.
        _requireApproved(ea.aggregatorHash);
        if (ea.sttHash        != bytes32(0)) _requireApproved(ea.sttHash);
        if (ea.routerHash     != bytes32(0)) _requireApproved(ea.routerHash);
        if (ea.baseHash       != bytes32(0)) _requireApproved(ea.baseHash);
        if (ea.activeLoraHash != bytes32(0)) _requireApproved(ea.activeLoraHash);
        if (ea.reasoningHash  != bytes32(0)) _requireApproved(ea.reasoningHash);

        // ── 5. multi-LoRA novelty: relationship integrity ────────────────────
        // If a LoRA participated, it MUST be a registered LoRA of the declared
        // base. This is the contract-enforced invariant that distinguishes
        // ensemble attestation from naive single-model schemes.
        if (ea.activeLoraHash != bytes32(0)) {
            if (ea.baseHash == bytes32(0)) {
                revert Errors.MissingRequiredHash("baseHash (LoRA requires base)");
            }
            if (!MODELS.isLoraOfBase(ea.activeLoraHash, ea.baseHash)) {
                revert Errors.LoraBaseMismatch(ea.activeLoraHash, ea.baseHash);
            }
        }

        // ── 6. write ─────────────────────────────────────────────────────────
        EnsembleAttestation memory rec = ea;
        rec.doctor    = msg.sender;
        rec.timestamp = uint64(block.timestamp);
        attestations[id] = rec;

        emit Attested({
            id:              id,
            doctor:          msg.sender,
            activeLoraHash:  ea.activeLoraHash,
            baseHash:        ea.baseHash,
            reasoningHash:   ea.reasoningHash,
            aggregatorHash:  ea.aggregatorHash,
            inputHash:       ea.inputHash,
            finalOutputHash: ea.finalOutputHash,
            consentRef:      ea.consentRef,
            timestamp:       rec.timestamp
        });
    }

    // ── views ────────────────────────────────────────────────────────────────

    /// @notice Quick verifier: does the recorded attestation match the
    ///         expected input/output hashes a third party recomputed?
    function verify(bytes32 id, bytes32 expectedInputHash, bytes32 expectedFinalOutputHash)
        external
        view
        returns (bool)
    {
        EnsembleAttestation memory a = attestations[id];
        return a.timestamp != 0
            && a.inputHash == expectedInputHash
            && a.finalOutputHash == expectedFinalOutputHash;
    }

    /// @notice Explicit struct getter (the auto-generated one from the
    ///         `attestations` mapping returns a positional tuple, which is
    ///         fragile across schema evolutions).
    function getAttestation(bytes32 id) external view returns (EnsembleAttestation memory) {
        return attestations[id];
    }

    // ── thin single-field getters (consumed by ClinicalDecisionAttestation) ──

    /// @notice True iff an attestation with this id exists.
    function exists(bytes32 id) external view returns (bool) {
        return attestations[id].timestamp != 0;
    }

    /// @notice Doctor address on the referenced attestation, or address(0) if none.
    function doctorOf(bytes32 id) external view returns (address) {
        return attestations[id].doctor;
    }

    /// @notice Timestamp of the referenced attestation, or 0 if none.
    function timestampOf(bytes32 id) external view returns (uint64) {
        return attestations[id].timestamp;
    }

    /// @notice Active LoRA hash of the referenced attestation, or 0x0 if none or
    ///         if the ensemble did not invoke a LoRA (text-only follow-up).
    function activeLoraHashOf(bytes32 id) external view returns (bytes32) {
        return attestations[id].activeLoraHash;
    }

    /// @notice Number-of-models snapshot for a given attestation; useful for
    ///         off-chain dashboards (e.g. "this reply used 5 of 6 ensemble
    ///         components").
    function ensembleSize(bytes32 id) external view returns (uint8 invoked) {
        EnsembleAttestation memory a = attestations[id];
        if (a.timestamp == 0) return 0;
        if (a.sttHash        != bytes32(0)) invoked++;
        if (a.routerHash     != bytes32(0)) invoked++;
        if (a.baseHash       != bytes32(0)) invoked++;
        if (a.activeLoraHash != bytes32(0)) invoked++;
        if (a.reasoningHash  != bytes32(0)) invoked++;
        if (a.aggregatorHash != bytes32(0)) invoked++;
    }

    // ── internals ────────────────────────────────────────────────────────────

    function _requireApproved(bytes32 hash) internal view {
        if (!MODELS.isApproved(hash)) revert Errors.ModelNotApproved(hash);
    }
}
