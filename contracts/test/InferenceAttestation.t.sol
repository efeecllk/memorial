// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { BaseTest }            from "./BaseTest.t.sol";
import { InferenceAttestation } from "../src/InferenceAttestation.sol";
import { ModelRegistry }        from "../src/ModelRegistry.sol";
import { Errors }               from "../src/lib/Errors.sol";

contract InferenceAttestationTest is BaseTest {
    bytes32 internal constant ATT_ID    = keccak256("att-1");
    bytes32 internal constant CONS_REF  = keccak256("efe-cons-1");
    bytes32 internal constant PATIENT   = keccak256("efe-pseudo");

    function _setupConsent() internal {
        _recordConsent(hospital, CONS_REF, PATIENT);
    }

    // ── happy paths ──────────────────────────────────────────────────────────

    function test_attest_fullEnsembleSucceeds() public {
        _setupConsent();
        InferenceAttestation.EnsembleAttestation memory ea = _baseAttest(CONS_REF);

        vm.prank(doctorChen);
        attest.attest(ATT_ID, ea);

        InferenceAttestation.EnsembleAttestation memory stored = attest.getAttestation(ATT_ID);
        assertEq(stored.activeLoraHash, loraChestXrayHash);
        assertEq(stored.doctor, doctorChen);
        assertEq(stored.timestamp, uint64(block.timestamp));
        assertEq(attest.ensembleSize(ATT_ID), 5); // router + base + lora + reasoning + aggregator
    }

    function test_attest_textOnlyFollowupSucceeds() public {
        _setupConsent();
        InferenceAttestation.EnsembleAttestation memory ea = InferenceAttestation.EnsembleAttestation({
            sttHash:             bytes32(0),
            routerHash:          bytes32(0),
            baseHash:            bytes32(0),
            activeLoraHash:      bytes32(0),
            reasoningHash:       reasoningHash,
            aggregatorHash:      aggregatorHash,
            inputHash:           keccak256("text question"),
            visionOutputHash:    bytes32(0),
            reasoningOutputHash: keccak256("reasoning out"),
            finalOutputHash:     keccak256("text answer"),
            consentRef:          CONS_REF,
            doctor:              address(0),
            timestamp:           0
        });

        vm.prank(doctorChen);
        attest.attest(ATT_ID, ea);
        assertEq(attest.ensembleSize(ATT_ID), 2); // reasoning + aggregator only
    }

    function test_attest_voiceFollowupWithSTT() public {
        _setupConsent();
        InferenceAttestation.EnsembleAttestation memory ea = InferenceAttestation.EnsembleAttestation({
            sttHash:             whisperHash,
            routerHash:          bytes32(0),
            baseHash:            bytes32(0),
            activeLoraHash:      bytes32(0),
            reasoningHash:       reasoningHash,
            aggregatorHash:      aggregatorHash,
            inputHash:           keccak256("audio"),
            visionOutputHash:    bytes32(0),
            reasoningOutputHash: keccak256("reasoning out"),
            finalOutputHash:     keccak256("answer"),
            consentRef:          CONS_REF,
            doctor:              address(0),
            timestamp:           0
        });

        vm.prank(doctorChen);
        attest.attest(ATT_ID, ea);
        assertEq(attest.ensembleSize(ATT_ID), 3); // stt + reasoning + aggregator
    }

    // ── novelty: LoRA-base relationship integrity ────────────────────────────

    /// @dev THE KEY TEST. The contract MUST refuse an attestation that pairs
    /// an unregistered LoRA hash with a real base, even though the base is
    /// approved. This is the multi-LoRA invariant the schema enforces.
    function test_attest_unregisteredLoraIsRejected() public {
        _setupConsent();
        bytes32 fakeLora = keccak256("hand-rolled-lora-by-attacker");

        InferenceAttestation.EnsembleAttestation memory ea = _baseAttest(CONS_REF);
        ea.activeLoraHash = fakeLora;

        vm.prank(doctorChen);
        vm.expectRevert(abi.encodeWithSelector(Errors.ModelNotApproved.selector, fakeLora));
        attest.attest(ATT_ID, ea);
    }

    /// @dev The contract MUST refuse an attestation whose base + LoRA are
    /// each individually registered but whose relationship is impossible
    /// (e.g. the chest-xray LoRA paired with a different, unrelated base).
    /// This is the `isLoraOfBase` enforcement.
    function test_attest_loraBaseMismatchIsRejected() public {
        _setupConsent();

        // Register a second, unrelated base model.
        bytes32 secondBase = keccak256("microsoft/phi-4-multimodal");
        vm.prank(hospitalAdmin);
        models.approve(
            secondBase,
            ModelRegistry.ModelKind.BASE,
            bytes32(0),
            "microsoft/phi-4-multimodal",
            "ipfs://phi4mm"
        );

        // Now attest declaring base=secondBase but LoRA=chestXray (which is
        // registered against medGemmaBaseHash, not secondBase).
        InferenceAttestation.EnsembleAttestation memory ea = _baseAttest(CONS_REF);
        ea.baseHash       = secondBase;
        ea.activeLoraHash = loraChestXrayHash;

        vm.prank(doctorChen);
        vm.expectRevert(
            abi.encodeWithSelector(Errors.LoraBaseMismatch.selector, loraChestXrayHash, secondBase)
        );
        attest.attest(ATT_ID, ea);
    }

    /// @dev If a LoRA is supplied, the base hash field must also be present.
    function test_attest_loraWithoutBaseIsRejected() public {
        _setupConsent();
        InferenceAttestation.EnsembleAttestation memory ea = _baseAttest(CONS_REF);
        ea.baseHash = bytes32(0);
        // activeLoraHash stays set
        vm.prank(doctorChen);
        vm.expectRevert();
        attest.attest(ATT_ID, ea);
    }

    // ── access / state errors ────────────────────────────────────────────────

    function test_attest_doubleAttestReverts() public {
        _setupConsent();
        InferenceAttestation.EnsembleAttestation memory ea = _baseAttest(CONS_REF);

        vm.prank(doctorChen);
        attest.attest(ATT_ID, ea);

        vm.prank(doctorChen);
        vm.expectRevert(abi.encodeWithSelector(Errors.AttestationAlreadyExists.selector, ATT_ID));
        attest.attest(ATT_ID, ea);
    }

    function test_attest_unlicensedDoctorReverts() public {
        _setupConsent();
        InferenceAttestation.EnsembleAttestation memory ea = _baseAttest(CONS_REF);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Errors.LicenseMissing.selector, stranger));
        attest.attest(ATT_ID, ea);
    }

    function test_attest_revokedConsentReverts() public {
        _setupConsent();
        vm.prank(hospital);
        consent.revoke(CONS_REF);

        InferenceAttestation.EnsembleAttestation memory ea = _baseAttest(CONS_REF);
        vm.prank(doctorChen);
        vm.expectRevert(abi.encodeWithSelector(Errors.ConsentRevoked.selector, CONS_REF));
        attest.attest(ATT_ID, ea);
    }

    function test_attest_deactivatedModelReverts() public {
        _setupConsent();
        vm.prank(hospitalAdmin);
        models.deactivate(loraChestXrayHash, "tampering");

        InferenceAttestation.EnsembleAttestation memory ea = _baseAttest(CONS_REF);
        vm.prank(doctorChen);
        vm.expectRevert(abi.encodeWithSelector(Errors.ModelNotApproved.selector, loraChestXrayHash));
        attest.attest(ATT_ID, ea);
    }

    function test_attest_missingAggregatorReverts() public {
        _setupConsent();
        InferenceAttestation.EnsembleAttestation memory ea = _baseAttest(CONS_REF);
        ea.aggregatorHash = bytes32(0);
        vm.prank(doctorChen);
        vm.expectRevert();
        attest.attest(ATT_ID, ea);
    }

    function test_attest_missingConsentRefReverts() public {
        _setupConsent();
        InferenceAttestation.EnsembleAttestation memory ea = _baseAttest(CONS_REF);
        ea.consentRef = bytes32(0);
        vm.prank(doctorChen);
        vm.expectRevert();
        attest.attest(ATT_ID, ea);
    }

    // ── verification ─────────────────────────────────────────────────────────

    function test_verify_returnsTrueOnMatch() public {
        _setupConsent();
        InferenceAttestation.EnsembleAttestation memory ea = _baseAttest(CONS_REF);

        vm.prank(doctorChen);
        attest.attest(ATT_ID, ea);

        assertTrue(attest.verify(ATT_ID, ea.inputHash, ea.finalOutputHash));
        assertFalse(attest.verify(ATT_ID, ea.inputHash, keccak256("tampered")));
    }
}
