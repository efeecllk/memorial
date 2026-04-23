// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { CredentialSBT }        from "./CredentialSBT.sol";
import { InferenceAttestation } from "./InferenceAttestation.sol";
import { Errors }               from "./lib/Errors.sol";

/// @title  ClinicalDecisionAttestation — links the doctor's committed chart
///         entry to an already-attested ensemble inference, capturing
///         deliberation signals alongside cryptographic linkage.
///
/// @author Polyglot-Attest
///
/// @notice Thesis intellectual core, second layer. The existing
///         `InferenceAttestation` records what the AI ensemble produced. This
///         contract records what the doctor actually decided and wrote, and
///         how long / with how much questioning / with what rationale they
///         arrived at that decision.
///
///         The link is enforced atomically at `attest()` time — the pair
///         (inference, decision) is either both attested with a consistent
///         doctor identity and ordering, or neither is. Neither record is
///         valid in isolation.
///
/// @dev    MVP simplification: quality-board role-gated reads are guarded by
///         a `HOSPITAL_ADMIN` address rather than a separate
///         `QualityBoardSBT`. v1.1 extracts the role into a dedicated SBT
///         contract with multisig issuance; the function surface is
///         unchanged. Aggregate views enforce a k-anonymity floor
///         (`K_ANON_MIN` default 20) on any individual-level disclosure.
contract ClinicalDecisionAttestation {
    // ── types ────────────────────────────────────────────────────────────────

    /// @notice Outcome regime of the clinical decision relative to AI suggestion.
    /// Ordered by deviation magnitude.
    enum DecisionOutcome {
        AGREED_VERBATIM,    // 0 — chart entry hash-equals AI final output
        MINOR_EDITS,        // 1 — concordance >= 9000 bps, no semantic change
        MODIFIED,           // 2 — concordance 7000–8999 bps
        PARTIAL_OVERRIDE,   // 3 — concordance 3000–6999 bps
        FULL_OVERRIDE,      // 4 — concordance < 3000 bps
        ESCALATED           // 5 — routed to second opinion / ConsensusVault
    }

    struct ClinicalDecision {
        // slot 0 — linkage
        bytes32 inferenceId;
        // slot 1 — the committed chart entry (hashed off-chain from UTF-8)
        bytes32 chartEntryHash;
        // slot 2 — opaque hospital pointer (non-PHI; e.g. hashed EHR row id)
        bytes32 chartEntryRef;
        // slot 3 — hash of the free-text override reason (0x0 if none)
        bytes32 overrideReasonHash;
        // slot 4 — packed attester + clock + concordance (32 B)
        address doctor;                 // 20 B
        uint64  timestamp;              //  8 B
        uint16  concordanceBps;         //  2 B
        uint16  editDistanceBps;        //  2 B
        // slot 5 — deliberation + outcome tags (20 B used, 12 free)
        uint32  deliberationMs;         //  4 B
        uint8   followUpQuestionCount;  //  1 B
        uint8   regenerationCount;      //  1 B
        uint8   outcome;                //  1 B  (cast from DecisionOutcome)
        bytes4  overrideReasonTag;      //  4 B  (SAFE / EXPT / GUID / PT / CTX / OTHR)
        // slot 6 — LoRA snapshot (denormalized for aggregate reads)
        bytes32 activeLoraAtDecision;
        // slot 7 — department tag (for aggregate reads; e.g. keccak256("CARD"))
        bytes32 departmentHash;
    }

    // ── state ────────────────────────────────────────────────────────────────

    InferenceAttestation public immutable INFERENCE;
    CredentialSBT       public immutable SBT;

    /// @notice Role allowed to read individual-level aggregates (override rate
    ///         per doctor, deliberation stats per doctor). MVP simplification
    ///         of the v1.1 `QualityBoardSBT`.
    address public immutable HOSPITAL_ADMIN;

    /// @notice Minimum cohort size below which aggregate reads revert.
    uint256 public constant K_ANON_MIN = 20;

    /// @dev decisionId => record.
    mapping(bytes32 id => ClinicalDecision) public decisions;

    /// @dev inferenceId => list of decision ids that reference it. Supports
    ///      many-to-one for escalation / correction flows (v1.1).
    mapping(bytes32 inferenceId => bytes32[]) private _decisionsByInference;

    /// @dev doctor => list of decision ids (for self-read pagination).
    mapping(address doctor => bytes32[]) private _decisionsByDoctor;

    // ── running accumulators (for cheap aggregate reads) ─────────────────────

    struct Accum {
        uint32 count;                // total decisions
        uint32 overrideCount;        // outcome >= PARTIAL_OVERRIDE
        uint64 concordanceSum;       // sum of concordanceBps
        uint64 deliberationMsSum;    // sum of deliberationMs
    }

    mapping(bytes32 departmentHash => Accum) private _deptAccum;
    mapping(bytes32 loraHash => Accum)       private _loraAccum;
    mapping(address doctor => Accum)         private _doctorAccum;
    Accum private _systemAccum;

    mapping(uint8 outcome => uint32 count) public outcomeCount;

    // ── events ───────────────────────────────────────────────────────────────

    event DecisionAttested(
        bytes32 indexed decisionId,
        address indexed doctor,
        uint8   indexed outcome,
        bytes32 inferenceId,
        bytes32 activeLoraAtDecision,
        uint16  concordanceBps,
        uint32  deliberationMs,
        uint64  timestamp
    );

    event DecisionOverridden(
        bytes32 indexed decisionId,
        address indexed doctor,
        bytes4  indexed overrideReasonTag,
        bytes32 inferenceId,
        bytes32 overrideReasonHash
    );

    event AggregateQueried(
        address indexed caller,
        bytes32 indexed subjectHash,
        uint64 windowStart,
        uint64 windowEnd
    );

    // ── ctor ─────────────────────────────────────────────────────────────────

    constructor(address inference, address sbt, address hospitalAdmin) {
        INFERENCE = InferenceAttestation(inference);
        SBT       = CredentialSBT(sbt);
        HOSPITAL_ADMIN = hospitalAdmin;
    }

    // ── writes ───────────────────────────────────────────────────────────────

    /// @notice Attest one clinical decision against an existing inference.
    /// @dev The linking invariant is enforced by the conjunction of checks
    ///      below. Any failure reverts with a specific error.
    function attest(bytes32 decisionId, ClinicalDecision calldata d) external {
        // 1. No duplicate decisionId
        if (decisions[decisionId].doctor != address(0)) {
            revert Errors.DuplicateDecision(decisionId);
        }

        // 2. Basic structural sanity
        if (d.chartEntryHash == bytes32(0)) revert Errors.InvalidChartEntry();
        if (d.chartEntryRef  == bytes32(0)) revert Errors.InvalidChartEntry();
        if (d.concordanceBps  > 10_000) revert Errors.InvalidBps(d.concordanceBps);
        if (d.editDistanceBps > 10_000) revert Errors.InvalidBps(d.editDistanceBps);

        // 3. Doctor must hold a valid licence
        if (!SBT.hasValidLicense(msg.sender)) revert Errors.LicenseMissing(msg.sender);

        // 4. Inference must exist and belong to msg.sender
        if (!INFERENCE.exists(d.inferenceId)) revert Errors.InferenceNotFound(d.inferenceId);
        address infDoctor = INFERENCE.doctorOf(d.inferenceId);
        if (infDoctor != msg.sender) revert Errors.DoctorMismatch(msg.sender, infDoctor);

        // 5. Commit timestamp must be after the inference timestamp
        uint64 infTs = INFERENCE.timestampOf(d.inferenceId);
        if (block.timestamp <= uint256(infTs)) revert Errors.InvalidTimestamp();

        // 6. LoRA snapshot must match the canonical on-chain record
        bytes32 canonicalLora = INFERENCE.activeLoraHashOf(d.inferenceId);
        if (d.activeLoraAtDecision != canonicalLora) {
            revert Errors.LoraSnapshotMismatch(d.activeLoraAtDecision, canonicalLora);
        }

        // 7. Outcome range
        if (d.outcome > uint8(DecisionOutcome.ESCALATED)) {
            revert Errors.OutcomeConcordanceMismatch(d.outcome, d.concordanceBps);
        }

        // 8. Outcome–concordance coherence bands
        _requireOutcomeCoherent(d.outcome, d.concordanceBps);

        // 9. Override outcomes require a reason
        if (d.outcome >= uint8(DecisionOutcome.PARTIAL_OVERRIDE)
            && d.outcome <= uint8(DecisionOutcome.FULL_OVERRIDE)) {
            if (d.overrideReasonHash == bytes32(0) || d.overrideReasonTag == bytes4(0)) {
                revert Errors.OverrideReasonRequired();
            }
        }

        // Write
        ClinicalDecision memory rec = d;
        rec.doctor = msg.sender;
        rec.timestamp = uint64(block.timestamp);
        decisions[decisionId] = rec;
        _decisionsByInference[d.inferenceId].push(decisionId);
        _decisionsByDoctor[msg.sender].push(decisionId);

        // Update running accumulators
        bool isOverride = d.outcome >= uint8(DecisionOutcome.PARTIAL_OVERRIDE)
                       && d.outcome <= uint8(DecisionOutcome.FULL_OVERRIDE);

        _bump(_systemAccum,              d.concordanceBps, d.deliberationMs, isOverride);
        _bump(_deptAccum[d.departmentHash],   d.concordanceBps, d.deliberationMs, isOverride);
        if (d.activeLoraAtDecision != bytes32(0)) {
            _bump(_loraAccum[d.activeLoraAtDecision], d.concordanceBps, d.deliberationMs, isOverride);
        }
        _bump(_doctorAccum[msg.sender],       d.concordanceBps, d.deliberationMs, isOverride);
        outcomeCount[d.outcome] += 1;

        emit DecisionAttested({
            decisionId:           decisionId,
            doctor:               msg.sender,
            outcome:              d.outcome,
            inferenceId:          d.inferenceId,
            activeLoraAtDecision: d.activeLoraAtDecision,
            concordanceBps:       d.concordanceBps,
            deliberationMs:       d.deliberationMs,
            timestamp:            rec.timestamp
        });
        if (isOverride) {
            emit DecisionOverridden({
                decisionId:         decisionId,
                doctor:             msg.sender,
                overrideReasonTag:  d.overrideReasonTag,
                inferenceId:        d.inferenceId,
                overrideReasonHash: d.overrideReasonHash
            });
        }
    }

    // ── permissionless reads ─────────────────────────────────────────────────

    /// @notice Read one decision record.
    /// @dev `decisionId` is an unguessable capability in practice (content-hashed).
    function getDecision(bytes32 decisionId) external view returns (ClinicalDecision memory) {
        return decisions[decisionId];
    }

    /// @notice All decision ids linked to a given inference (usually 1).
    function decisionsByInference(bytes32 inferenceId) external view returns (bytes32[] memory) {
        return _decisionsByInference[inferenceId];
    }

    /// @notice System-wide outcome histogram. Always safe at this level.
    function systemWideOutcomeHistogram() external view returns (uint32[6] memory out) {
        for (uint8 i = 0; i <= uint8(DecisionOutcome.ESCALATED); i++) {
            out[i] = outcomeCount[i];
        }
    }

    /// @notice Count of decisions in a given LoRA's accumulator.
    function loraSampleSize(bytes32 loraHash) external view returns (uint32) {
        return _loraAccum[loraHash].count;
    }

    /// @notice Count of decisions in a department's accumulator.
    function departmentSampleSize(bytes32 deptHash) external view returns (uint32) {
        return _deptAccum[deptHash].count;
    }

    // ── self-only reads ──────────────────────────────────────────────────────

    /// @notice Paged view of the caller's own decision history.
    ///         Restricted by design to `msg.sender == caller` — there is no
    ///         doctor-address argument so callers cannot enumerate peers.
    function doctorSelfRead(uint256 offset, uint256 limit)
        external view returns (bytes32[] memory ids)
    {
        bytes32[] storage all = _decisionsByDoctor[msg.sender];
        if (offset >= all.length) return new bytes32[](0);
        uint256 end = offset + limit;
        if (end > all.length) end = all.length;
        ids = new bytes32[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            ids[i - offset] = all[i];
        }
    }

    /// @notice The caller's own aggregate record (count, override rate, avgs).
    function doctorSelfAggregate()
        external view
        returns (uint32 count, uint32 overrideCount, uint16 avgConcordanceBps, uint32 avgDeliberationMs)
    {
        Accum memory a = _doctorAccum[msg.sender];
        count = a.count;
        overrideCount = a.overrideCount;
        avgConcordanceBps  = a.count == 0 ? 0 : uint16(a.concordanceSum / a.count);
        avgDeliberationMs  = a.count == 0 ? 0 : uint32(a.deliberationMsSum / a.count);
    }

    // ── k-anonymous aggregate reads (permissionless, guarded by cohort size) ─

    /// @notice Override rate for a LoRA in basis points (0..10000).
    ///         Reverts if `n < K_ANON_MIN`.
    function overrideRateForLora(bytes32 loraHash) external view returns (uint256 bps, uint32 n) {
        Accum memory a = _loraAccum[loraHash];
        if (a.count < K_ANON_MIN) revert Errors.InsufficientSampleSize(a.count, K_ANON_MIN);
        bps = (uint256(a.overrideCount) * 10_000) / a.count;
        n = a.count;
    }

    /// @notice Override rate for a department in basis points.
    function overrideRateForDepartment(bytes32 deptHash)
        external view returns (uint256 bps, uint32 n)
    {
        Accum memory a = _deptAccum[deptHash];
        if (a.count < K_ANON_MIN) revert Errors.InsufficientSampleSize(a.count, K_ANON_MIN);
        bps = (uint256(a.overrideCount) * 10_000) / a.count;
        n = a.count;
    }

    /// @notice Average deliberation time for a department.
    function avgDeliberationMsForDepartment(bytes32 deptHash)
        external view returns (uint32 avgMs, uint32 n)
    {
        Accum memory a = _deptAccum[deptHash];
        if (a.count < K_ANON_MIN) revert Errors.InsufficientSampleSize(a.count, K_ANON_MIN);
        avgMs = uint32(a.deliberationMsSum / a.count);
        n = a.count;
    }

    // ── hospital-admin (quality-board MVP proxy) gated reads ────────────────

    modifier onlyAdmin() {
        if (msg.sender != HOSPITAL_ADMIN) revert Errors.NotQualityBoard(msg.sender);
        _;
    }

    /// @notice Per-doctor override rate — individual-level. Gated.
    ///         Emits `AggregateQueried` so the access itself is audited.
    function doctorOverrideRate(address doctor)
        external onlyAdmin returns (uint256 bps, uint32 n)
    {
        Accum memory a = _doctorAccum[doctor];
        n = a.count;
        bps = a.count == 0 ? 0 : (uint256(a.overrideCount) * 10_000) / a.count;
        emit AggregateQueried(msg.sender, keccak256(abi.encode(doctor)), 0, uint64(block.timestamp));
    }

    /// @notice Per-doctor deliberation stats. Gated + audited.
    function doctorDeliberationStats(address doctor)
        external onlyAdmin
        returns (uint32 count, uint32 avgMs)
    {
        Accum memory a = _doctorAccum[doctor];
        count = a.count;
        avgMs = a.count == 0 ? 0 : uint32(a.deliberationMsSum / a.count);
        emit AggregateQueried(msg.sender, keccak256(abi.encode(doctor)), 0, uint64(block.timestamp));
    }

    // ── internals ────────────────────────────────────────────────────────────

    function _bump(Accum storage a, uint16 concordance, uint32 deliberation, bool isOverride) internal {
        a.count += 1;
        if (isOverride) a.overrideCount += 1;
        a.concordanceSum     += concordance;
        a.deliberationMsSum  += deliberation;
    }

    function _requireOutcomeCoherent(uint8 outcome, uint16 concordance) internal pure {
        // AGREED_VERBATIM ⇒ concordance must be exactly 10000
        if (outcome == uint8(DecisionOutcome.AGREED_VERBATIM) && concordance != 10_000) {
            revert Errors.OutcomeConcordanceMismatch(outcome, concordance);
        }
        // MINOR_EDITS ⇒ concordance must be >= 9000
        if (outcome == uint8(DecisionOutcome.MINOR_EDITS) && concordance < 9_000) {
            revert Errors.OutcomeConcordanceMismatch(outcome, concordance);
        }
        // MODIFIED ⇒ 7000..8999
        if (outcome == uint8(DecisionOutcome.MODIFIED)
            && (concordance < 7_000 || concordance >= 9_000)) {
            revert Errors.OutcomeConcordanceMismatch(outcome, concordance);
        }
        // PARTIAL_OVERRIDE ⇒ 3000..6999
        if (outcome == uint8(DecisionOutcome.PARTIAL_OVERRIDE)
            && (concordance < 3_000 || concordance >= 7_000)) {
            revert Errors.OutcomeConcordanceMismatch(outcome, concordance);
        }
        // FULL_OVERRIDE ⇒ < 3000
        if (outcome == uint8(DecisionOutcome.FULL_OVERRIDE) && concordance >= 3_000) {
            revert Errors.OutcomeConcordanceMismatch(outcome, concordance);
        }
        // ESCALATED ⇒ any concordance allowed
    }
}
