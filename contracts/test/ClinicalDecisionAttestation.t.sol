// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { BaseTest }                  from "./BaseTest.t.sol";
import { ClinicalDecisionAttestation } from "../src/ClinicalDecisionAttestation.sol";
import { InferenceAttestation }        from "../src/InferenceAttestation.sol";
import { Errors }                      from "../src/lib/Errors.sol";

contract ClinicalDecisionAttestationTest is BaseTest {
    ClinicalDecisionAttestation internal cda;

    bytes32 internal constant INF_ID = keccak256("att-1");
    bytes32 internal constant DEC_ID = keccak256("dec-1");
    bytes32 internal constant CONS_REF = keccak256("efe-cons-1");
    bytes32 internal constant PATIENT = keccak256("efe-pseudo");
    bytes32 internal constant DEPT_INT_MED = keccak256("INTERNAL_MEDICINE");
    bytes32 internal constant CHART_HASH = keccak256("final chart entry text");
    bytes32 internal constant CHART_REF  = keccak256("ehr-row-abcd1234");

    function setUp() public override {
        super.setUp();
        cda = new ClinicalDecisionAttestation(address(attest), address(sbt), hospitalAdmin);
        _setupConsentAndInference();
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    function _setupConsentAndInference() internal {
        _recordConsent(hospital, CONS_REF, PATIENT);
        InferenceAttestation.EnsembleAttestation memory ea = _baseAttest(CONS_REF);
        vm.prank(doctorChen);
        attest.attest(INF_ID, ea);
        skip(10); // 10 seconds between inference and decision
    }

    function _baseDecision() internal view returns (ClinicalDecisionAttestation.ClinicalDecision memory) {
        return ClinicalDecisionAttestation.ClinicalDecision({
            inferenceId:          INF_ID,
            chartEntryHash:       CHART_HASH,
            chartEntryRef:        CHART_REF,
            overrideReasonHash:   bytes32(0),
            doctor:               address(0),
            timestamp:            0,
            concordanceBps:       9500,                 // MINOR_EDITS band
            editDistanceBps:      500,
            deliberationMs:       45_000,
            followUpQuestionCount: 1,
            regenerationCount:    0,
            outcome:              uint8(ClinicalDecisionAttestation.DecisionOutcome.MINOR_EDITS),
            overrideReasonTag:    bytes4(0),
            activeLoraAtDecision: loraChestXrayHash,    // matches _baseAttest
            departmentHash:       DEPT_INT_MED
        });
    }

    function _override(uint8 outcome, uint16 concordance) internal view returns (ClinicalDecisionAttestation.ClinicalDecision memory d) {
        d = _baseDecision();
        d.outcome = outcome;
        d.concordanceBps = concordance;
        d.overrideReasonHash = keccak256("Patient declined contrast; went with non-contrast.");
        d.overrideReasonTag  = bytes4("PT  ");
    }

    // ── happy paths ──────────────────────────────────────────────────────────

    function test_attest_happyPath_minorEdits() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
        vm.prank(doctorChen);
        cda.attest(DEC_ID, d);

        ClinicalDecisionAttestation.ClinicalDecision memory stored = cda.getDecision(DEC_ID);
        assertEq(stored.doctor, doctorChen);
        assertEq(stored.inferenceId, INF_ID);
        assertEq(stored.concordanceBps, 9500);
        assertEq(stored.timestamp, uint64(block.timestamp));

        bytes32[] memory links = cda.decisionsByInference(INF_ID);
        assertEq(links.length, 1);
        assertEq(links[0], DEC_ID);
    }

    function test_attest_happyPath_fullOverride() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d =
            _override(uint8(ClinicalDecisionAttestation.DecisionOutcome.FULL_OVERRIDE), 2000);

        vm.prank(doctorChen);
        cda.attest(DEC_ID, d);

        assertEq(cda.outcomeCount(uint8(ClinicalDecisionAttestation.DecisionOutcome.FULL_OVERRIDE)), 1);
    }

    function test_attest_happyPath_agreedVerbatim() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
        d.outcome = uint8(ClinicalDecisionAttestation.DecisionOutcome.AGREED_VERBATIM);
        d.concordanceBps = 10_000;
        d.editDistanceBps = 0;

        vm.prank(doctorChen);
        cda.attest(DEC_ID, d);

        assertEq(cda.outcomeCount(uint8(ClinicalDecisionAttestation.DecisionOutcome.AGREED_VERBATIM)), 1);
    }

    // ── linking invariant: the thesis's atomic check ────────────────────────

    function test_attest_reverts_inferenceNotFound() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
        d.inferenceId = keccak256("does-not-exist");
        vm.prank(doctorChen);
        vm.expectRevert(abi.encodeWithSelector(Errors.InferenceNotFound.selector, d.inferenceId));
        cda.attest(DEC_ID, d);
    }

    function test_attest_reverts_doctorMismatch() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
        vm.prank(doctorPatel); // different licensed doctor
        vm.expectRevert(abi.encodeWithSelector(Errors.DoctorMismatch.selector, doctorPatel, doctorChen));
        cda.attest(DEC_ID, d);
    }

    function test_attest_reverts_loraSnapshotMismatch() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
        d.activeLoraAtDecision = loraBrainMriHash; // wrong LoRA claimed
        vm.prank(doctorChen);
        vm.expectRevert(
            abi.encodeWithSelector(Errors.LoraSnapshotMismatch.selector, loraBrainMriHash, loraChestXrayHash)
        );
        cda.attest(DEC_ID, d);
    }

    function test_attest_reverts_licenseMissing() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
        vm.prank(stranger);
        // stranger has no SBT — InferenceNotFound can't fire because stranger isn't even
        // the inference doctor — but LicenseMissing is checked first.
        vm.expectRevert(abi.encodeWithSelector(Errors.LicenseMissing.selector, stranger));
        cda.attest(DEC_ID, d);
    }

    // ── validation-rule reverts ─────────────────────────────────────────────

    function test_attest_reverts_emptyChartEntryHash() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
        d.chartEntryHash = bytes32(0);
        vm.prank(doctorChen);
        vm.expectRevert(Errors.InvalidChartEntry.selector);
        cda.attest(DEC_ID, d);
    }

    function test_attest_reverts_emptyChartEntryRef() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
        d.chartEntryRef = bytes32(0);
        vm.prank(doctorChen);
        vm.expectRevert(Errors.InvalidChartEntry.selector);
        cda.attest(DEC_ID, d);
    }

    function test_attest_reverts_concordanceOutOfBounds() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
        d.concordanceBps = 10_001;
        vm.prank(doctorChen);
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidBps.selector, uint16(10_001)));
        cda.attest(DEC_ID, d);
    }

    function test_attest_reverts_editDistanceOutOfBounds() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
        d.editDistanceBps = 10_001;
        vm.prank(doctorChen);
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidBps.selector, uint16(10_001)));
        cda.attest(DEC_ID, d);
    }

    function test_attest_reverts_duplicateDecisionId() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
        vm.prank(doctorChen);
        cda.attest(DEC_ID, d);
        vm.prank(doctorChen);
        vm.expectRevert(abi.encodeWithSelector(Errors.DuplicateDecision.selector, DEC_ID));
        cda.attest(DEC_ID, d);
    }

    function test_attest_reverts_overrideWithoutReason() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d =
            _override(uint8(ClinicalDecisionAttestation.DecisionOutcome.FULL_OVERRIDE), 2000);
        d.overrideReasonHash = bytes32(0); // clear it
        vm.prank(doctorChen);
        vm.expectRevert(Errors.OverrideReasonRequired.selector);
        cda.attest(DEC_ID, d);
    }

    function test_attest_reverts_overrideWithoutTag() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d =
            _override(uint8(ClinicalDecisionAttestation.DecisionOutcome.PARTIAL_OVERRIDE), 5000);
        d.overrideReasonTag = bytes4(0);
        vm.prank(doctorChen);
        vm.expectRevert(Errors.OverrideReasonRequired.selector);
        cda.attest(DEC_ID, d);
    }

    // ── outcome–concordance coherence ───────────────────────────────────────

    function test_attest_reverts_agreedVerbatimConcordanceNot10000() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
        d.outcome = uint8(ClinicalDecisionAttestation.DecisionOutcome.AGREED_VERBATIM);
        d.concordanceBps = 9_998; // not exactly 10000
        vm.prank(doctorChen);
        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.OutcomeConcordanceMismatch.selector,
                uint8(ClinicalDecisionAttestation.DecisionOutcome.AGREED_VERBATIM),
                uint16(9_998)
            )
        );
        cda.attest(DEC_ID, d);
    }

    function test_attest_reverts_fullOverrideWithHighConcordance() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d =
            _override(uint8(ClinicalDecisionAttestation.DecisionOutcome.FULL_OVERRIDE), 8_000);
        vm.prank(doctorChen);
        vm.expectRevert(
            abi.encodeWithSelector(
                Errors.OutcomeConcordanceMismatch.selector,
                uint8(ClinicalDecisionAttestation.DecisionOutcome.FULL_OVERRIDE),
                uint16(8_000)
            )
        );
        cda.attest(DEC_ID, d);
    }

    // ── aggregates ───────────────────────────────────────────────────────────

    function test_aggregate_departmentOverrideRate_computesCorrectly() public {
        // Seed 25 decisions against different inferences — 10 overrides, 15 non-override.
        // Need 25 distinct inferences; register them first.
        for (uint256 i = 0; i < 25; i++) {
            bytes32 infId  = keccak256(abi.encode("bulk-inf", i));
            bytes32 consRef = keccak256(abi.encode("bulk-cons", i));
            bytes32 patient = keccak256(abi.encode("bulk-p", i));
            _recordConsent(hospital, consRef, patient);
            InferenceAttestation.EnsembleAttestation memory ea = _baseAttest(consRef);
            vm.prank(doctorChen);
            attest.attest(infId, ea);
        }
        skip(5);

        for (uint256 i = 0; i < 25; i++) {
            bytes32 infId  = keccak256(abi.encode("bulk-inf", i));
            bytes32 decId  = keccak256(abi.encode("bulk-dec", i));
            ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
            d.inferenceId = infId;
            d.chartEntryRef = keccak256(abi.encode("ref", i));

            if (i < 10) {
                d.outcome = uint8(ClinicalDecisionAttestation.DecisionOutcome.FULL_OVERRIDE);
                d.concordanceBps = 2_000;
                d.overrideReasonHash = keccak256("bulk override");
                d.overrideReasonTag  = bytes4("EXPT");
            }
            vm.prank(doctorChen);
            cda.attest(decId, d);
        }

        (uint256 bps, uint32 n) = cda.overrideRateForDepartment(DEPT_INT_MED);
        assertEq(n, 25);
        assertEq(bps, 4_000); // 10 of 25 = 40.00%
    }

    function test_aggregate_belowKAnonReverts() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
        vm.prank(doctorChen);
        cda.attest(DEC_ID, d);
        // only 1 decision — well below K_ANON_MIN of 20
        vm.expectRevert(
            abi.encodeWithSelector(Errors.InsufficientSampleSize.selector, uint256(1), cda.K_ANON_MIN())
        );
        cda.overrideRateForDepartment(DEPT_INT_MED);
    }

    function test_selfRead_onlyOwnDecisions() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
        vm.prank(doctorChen);
        cda.attest(DEC_ID, d);

        vm.prank(doctorChen);
        bytes32[] memory my = cda.doctorSelfRead(0, 10);
        assertEq(my.length, 1);
        assertEq(my[0], DEC_ID);

        vm.prank(doctorPatel);
        bytes32[] memory theirs = cda.doctorSelfRead(0, 10);
        assertEq(theirs.length, 0);
    }

    function test_adminRead_gated() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
        vm.prank(doctorChen);
        cda.attest(DEC_ID, d);

        // hospitalAdmin is allowed
        vm.prank(hospitalAdmin);
        (uint256 bps, uint32 n) = cda.doctorOverrideRate(doctorChen);
        assertEq(n, 1);
        assertEq(bps, 0);

        // stranger is not
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Errors.NotQualityBoard.selector, stranger));
        cda.doctorOverrideRate(doctorChen);
    }

    // ── system-wide histogram ───────────────────────────────────────────────

    function test_systemHistogram_countsCorrectly() public {
        ClinicalDecisionAttestation.ClinicalDecision memory d = _baseDecision();
        vm.prank(doctorChen);
        cda.attest(DEC_ID, d);

        uint32[6] memory h = cda.systemWideOutcomeHistogram();
        assertEq(h[uint8(ClinicalDecisionAttestation.DecisionOutcome.MINOR_EDITS)], 1);
        assertEq(h[uint8(ClinicalDecisionAttestation.DecisionOutcome.FULL_OVERRIDE)], 0);
    }
}
