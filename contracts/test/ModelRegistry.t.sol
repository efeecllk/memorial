// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { BaseTest }     from "./BaseTest.t.sol";
import { ModelRegistry } from "../src/ModelRegistry.sol";
import { Errors }        from "../src/lib/Errors.sol";

contract ModelRegistryTest is BaseTest {
    function test_setUp_registersFullEnsemble() public view {
        assertTrue(models.isApproved(whisperHash));
        assertTrue(models.isApproved(medGemmaBaseHash));
        assertTrue(models.isApproved(loraChestXrayHash));
        assertEq(models.adaptersOf(medGemmaBaseHash).length, 6);
    }

    function test_isLoraOfBase_truePositive() public view {
        assertTrue(models.isLoraOfBase(loraChestXrayHash, medGemmaBaseHash));
        assertTrue(models.isLoraOfBase(loraBrainMriHash,  medGemmaBaseHash));
    }

    function test_isLoraOfBase_falseForWrongBase() public view {
        bytes32 fakeBase = keccak256("fake_base");
        assertFalse(models.isLoraOfBase(loraChestXrayHash, fakeBase));
    }

    function test_isLoraOfBase_falseForNonLoraEntry() public view {
        // The reasoning model is REASONING kind, not LORA_ADAPTER.
        assertFalse(models.isLoraOfBase(reasoningHash, medGemmaBaseHash));
    }

    function test_approve_doubleRegistrationReverts() public {
        vm.prank(hospitalAdmin);
        vm.expectRevert(abi.encodeWithSelector(Errors.ModelAlreadyRegistered.selector, whisperHash));
        models.approve(whisperHash, ModelRegistry.ModelKind.STT, bytes32(0), "x", "y");
    }

    function test_approve_onlyAdmin() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Errors.NotHospitalAdmin.selector, stranger));
        models.approve(keccak256("anything"), ModelRegistry.ModelKind.STT, bytes32(0), "", "");
    }

    function test_approve_loraRequiresValidBase() public {
        vm.prank(hospitalAdmin);
        bytes32 unknownBase = keccak256("not_a_base");
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidBaseReference.selector, unknownBase));
        models.approve(keccak256("fake_lora"), ModelRegistry.ModelKind.LORA_ADAPTER, unknownBase, "", "");
    }

    function test_approve_baseMustBeBaseKind() public {
        vm.prank(hospitalAdmin);
        // Try to register a LoRA pointing at the REASONING model (wrong kind).
        vm.expectRevert(abi.encodeWithSelector(Errors.WrongModelKind.selector, reasoningHash));
        models.approve(keccak256("bad_lora"), ModelRegistry.ModelKind.LORA_ADAPTER, reasoningHash, "", "");
    }

    function test_approve_nonLoraMustNotCarryBaseRef() public {
        vm.prank(hospitalAdmin);
        bytes32 someRef = keccak256("dangling");
        vm.expectRevert(abi.encodeWithSelector(Errors.InvalidBaseReference.selector, someRef));
        models.approve(keccak256("new_router"), ModelRegistry.ModelKind.ROUTER, someRef, "", "");
    }

    function test_deactivate_marksInactive() public {
        vm.prank(hospitalAdmin);
        models.deactivate(loraChestXrayHash, "weight tampering suspected");
        assertFalse(models.isApproved(loraChestXrayHash));
        assertFalse(models.isLoraOfBase(loraChestXrayHash, medGemmaBaseHash));
    }

    function test_reactivate_restoresApproval() public {
        vm.startPrank(hospitalAdmin);
        models.deactivate(loraChestXrayHash, "x");
        models.reactivate(loraChestXrayHash);
        vm.stopPrank();
        assertTrue(models.isApproved(loraChestXrayHash));
    }
}
