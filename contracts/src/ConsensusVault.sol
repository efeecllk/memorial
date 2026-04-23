// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { InferenceAttestation } from "./InferenceAttestation.sol";
import { Errors }               from "./lib/Errors.sol";

/// @title  ConsensusVault — Cross-hospital "second opinion" voting
/// @author Polyglot-Attest
/// @notice (STRETCH) Coordinates multi-hospital agreement on difficult cases.
///         Each contributing hospital submits one InferenceAttestation id; the
///         vault tallies the resulting `finalOutputHash` values and resolves
///         the query to the majority (or marks unresolved on tie).
///
/// @dev    Privacy is preserved because the only data exchanged is the
///         attestation reference and the (already on-chain) finalOutputHash —
///         no PHI ever flows between hospitals.
contract ConsensusVault {
    // ── types ────────────────────────────────────────────────────────────────

    struct Query {
        bytes32   inputHash;            // hash of the anonymised clinical query
        uint64    createdAt;
        address   originator;           // hospital that opened the query
        bytes32[] attestationRefs;      // submitted opinions (refs into Attestation)
        bytes32   majorityOutputHash;   // resolved majority answer (0x0 if tied)
        uint8     majorityVotes;        // count of attestations agreeing on majority
        bool      resolved;
    }

    // ── state ────────────────────────────────────────────────────────────────

    InferenceAttestation public immutable ATTEST;

    mapping(bytes32 qId => Query) public queries;

    // ── events ───────────────────────────────────────────────────────────────

    event QueryOpened(bytes32 indexed qId, address indexed originator, bytes32 inputHash);

    event OpinionSubmitted(
        bytes32 indexed qId,
        bytes32 indexed attestationRef,
        bytes32 finalOutputHash
    );

    event QueryResolved(
        bytes32 indexed qId,
        bytes32 majorityOutputHash,
        uint8 majorityVotes,
        uint8 totalVotes
    );

    // ── ctor ─────────────────────────────────────────────────────────────────

    constructor(address attestationContract) {
        ATTEST = InferenceAttestation(attestationContract);
    }

    // ── writes ───────────────────────────────────────────────────────────────

    function createQuery(bytes32 qId, bytes32 inputHash) external {
        if (queries[qId].createdAt != 0) revert Errors.QueryAlreadyResolved(qId);
        queries[qId] = Query({
            inputHash:          inputHash,
            createdAt:          uint64(block.timestamp),
            originator:         msg.sender,
            attestationRefs:    new bytes32[](0),
            majorityOutputHash: bytes32(0),
            majorityVotes:      0,
            resolved:           false
        });
        emit QueryOpened(qId, msg.sender, inputHash);
    }

    function submitOpinion(bytes32 qId, bytes32 attestationRef) external {
        Query storage q = queries[qId];
        if (q.createdAt == 0) revert Errors.QueryNotFound(qId);
        if (q.resolved) revert Errors.QueryAlreadyResolved(qId);

        InferenceAttestation.EnsembleAttestation memory a = ATTEST.getAttestation(attestationRef);
        q.attestationRefs.push(attestationRef);
        emit OpinionSubmitted(qId, attestationRef, a.finalOutputHash);
    }

    function resolve(bytes32 qId) external {
        Query storage q = queries[qId];
        if (q.createdAt == 0) revert Errors.QueryNotFound(qId);
        if (q.resolved) revert Errors.QueryAlreadyResolved(qId);
        if (q.attestationRefs.length == 0) revert Errors.EmptyOpinionSet(qId);

        uint256 n = q.attestationRefs.length;
        bytes32 leader = bytes32(0);
        uint8 leaderCount = 0;

        // Tally each unique finalOutputHash by counting how many opinions match it.
        for (uint256 i = 0; i < n; i++) {
            bytes32 candidate = ATTEST.getAttestation(q.attestationRefs[i]).finalOutputHash;
            uint8 c = 1;
            for (uint256 j = i + 1; j < n; j++) {
                bytes32 other = ATTEST.getAttestation(q.attestationRefs[j]).finalOutputHash;
                if (other == candidate) c++;
            }
            if (c > leaderCount) {
                leader = candidate;
                leaderCount = c;
            }
        }

        // Detect a tie: any other distinct candidate matches leaderCount?
        bool tied = false;
        for (uint256 i = 0; i < n && !tied; i++) {
            bytes32 candidate = ATTEST.getAttestation(q.attestationRefs[i]).finalOutputHash;
            if (candidate == leader) continue;
            uint8 c = 1;
            for (uint256 j = i + 1; j < n; j++) {
                bytes32 other = ATTEST.getAttestation(q.attestationRefs[j]).finalOutputHash;
                if (other == candidate) c++;
            }
            if (c == leaderCount) tied = true;
        }

        q.resolved           = true;
        q.majorityVotes      = leaderCount;
        q.majorityOutputHash = tied ? bytes32(0) : leader;

        emit QueryResolved(qId, q.majorityOutputHash, leaderCount, uint8(n));
    }

    // ── views ────────────────────────────────────────────────────────────────

    function refsOf(bytes32 qId) external view returns (bytes32[] memory) {
        return queries[qId].attestationRefs;
    }
}
