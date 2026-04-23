// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Errors } from "./lib/Errors.sol";

/// @title  ConsentRegistry — Patient opt-in records for AI-assisted care
/// @author Polyglot-Attest
/// @notice Records the existence and status (active / revoked / expired) of a
///         patient's consent for AI-assisted analysis. The patient is referred
///         to via an opaque `bytes32 patientPseudonym` that the hospital
///         generates locally — the chain never sees the real identity.
///
/// @dev    A consent record is identified by a `bytes32 ref`. The hospital
///         issues this ref when the patient signs, then carries it through
///         every downstream attestation. Revocation is irreversible — once
///         revoked, the ref must be re-recorded (with a new ref) for new care.
contract ConsentRegistry {
    // ── types ────────────────────────────────────────────────────────────────

    struct Consent {
        bytes32 patientPseudonym;  // opaque per-hospital random id
        address hospital;          // hospital wallet that recorded this consent
        bytes32 templateHash;      // hash of the consent form text version
        uint64  signedAt;
        uint64  expiresAt;
        bool    revoked;
    }

    // ── state ────────────────────────────────────────────────────────────────

    /// @dev `ref` → consent record. `ref` is the unique identifier used by
    /// downstream contracts (InferenceAttestation, etc.) to reference consent
    /// without exposing patient pseudonyms in their own storage.
    mapping(bytes32 ref => Consent) public consents;

    // ── events ───────────────────────────────────────────────────────────────

    event ConsentRecorded(
        bytes32 indexed ref,
        address indexed hospital,
        bytes32 indexed patientPseudonym,
        bytes32 templateHash,
        uint64 expiresAt
    );

    event ConsentRevoked(bytes32 indexed ref, uint64 revokedAt);

    // ── writes ───────────────────────────────────────────────────────────────

    /// @notice Record a new consent. `msg.sender` is captured as the hospital.
    /// @param  ref               Unique identifier the hospital generated.
    /// @param  patientPseudonym  Opaque hospital-internal patient id.
    /// @param  templateHash      Hash of the signed consent form template.
    /// @param  expiresAt         Unix seconds when consent ceases to be valid.
    function record(
        bytes32 ref,
        bytes32 patientPseudonym,
        bytes32 templateHash,
        uint64 expiresAt
    )
        external
    {
        if (consents[ref].signedAt != 0) revert Errors.ConsentAlreadyExists(ref);
        if (expiresAt <= block.timestamp) revert Errors.ConsentExpired(ref, expiresAt);

        consents[ref] = Consent({
            patientPseudonym: patientPseudonym,
            hospital:         msg.sender,
            templateHash:     templateHash,
            signedAt:         uint64(block.timestamp),
            expiresAt:        expiresAt,
            revoked:          false
        });

        emit ConsentRecorded(ref, msg.sender, patientPseudonym, templateHash, expiresAt);
    }

    /// @notice Revoke an active consent. Only the hospital that recorded it
    ///         can revoke (acting on the patient's behalf via off-chain auth).
    function revoke(bytes32 ref) external {
        Consent storage c = consents[ref];
        if (c.signedAt == 0) revert Errors.ConsentNotFound(ref);
        if (c.hospital != msg.sender) revert Errors.NotAuthorized(msg.sender);

        c.revoked = true;
        emit ConsentRevoked(ref, uint64(block.timestamp));
    }

    // ── views ────────────────────────────────────────────────────────────────

    /// @notice Hospital-affiliation-aware check (callers that enforce that
    ///         the attesting doctor belongs to the recording hospital).
    function isValid(bytes32 ref, address hospital) external view returns (bool ok) {
        Consent memory c = consents[ref];
        if (c.signedAt == 0) return false;
        if (c.hospital != hospital) return false;
        if (c.revoked) return false;
        if (block.timestamp > c.expiresAt) return false;
        return true;
    }

    /// @notice Affiliation-agnostic check used by InferenceAttestation in MVP.
    ///         Confirms the consent exists, is not revoked, has not expired.
    ///         Hospital-affiliation enforcement is left to a future
    ///         HospitalAffiliationRegistry (out of scope for the thesis MVP).
    function isActive(bytes32 ref) external view returns (bool) {
        Consent memory c = consents[ref];
        if (c.signedAt == 0) return false;
        if (c.revoked) return false;
        if (block.timestamp > c.expiresAt) return false;
        return true;
    }

    /// @notice Hospital that recorded a given consent.
    function hospitalOf(bytes32 ref) external view returns (address) {
        return consents[ref].hospital;
    }

    /// @notice Detail-rich variant of `isValid` for off-chain auditors.
    function status(bytes32 ref)
        external
        view
        returns (bool exists, bool revoked, bool expired, address hospital)
    {
        Consent memory c = consents[ref];
        exists   = c.signedAt != 0;
        revoked  = c.revoked;
        expired  = exists && block.timestamp > c.expiresAt;
        hospital = c.hospital;
    }
}
