// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

import { CredentialSBT }        from "../src/CredentialSBT.sol";
import { ConsentRegistry }      from "../src/ConsentRegistry.sol";
import { ModelRegistry }        from "../src/ModelRegistry.sol";
import { InferenceAttestation } from "../src/InferenceAttestation.sol";
import { DriftMonitor }         from "../src/DriftMonitor.sol";
import { ConsensusVault }       from "../src/ConsensusVault.sol";

/// @notice Shared test scaffolding: deploys the full Polyglot-Attest suite
///         with deterministic actors and a complete medvision LoRA roster.
abstract contract BaseTest is Test {
    // actors
    address internal medicalBoard = makeAddr("medicalBoard");
    address internal hospitalAdmin = makeAddr("hospitalAdmin");
    address internal hospital      = makeAddr("hospital");
    address internal doctorChen    = makeAddr("doctorChen");
    address internal doctorPatel   = makeAddr("doctorPatel");
    address internal stranger      = makeAddr("stranger");

    // contracts
    CredentialSBT        internal sbt;
    ConsentRegistry      internal consent;
    ModelRegistry        internal models;
    InferenceAttestation internal attest;
    DriftMonitor         internal drift;
    ConsensusVault       internal vault;

    // model hashes (placeholders deterministic from name)
    bytes32 internal whisperHash;
    bytes32 internal routerHash;
    bytes32 internal medGemmaBaseHash;
    bytes32 internal loraChestXrayHash;
    bytes32 internal loraBrainMriHash;
    bytes32 internal loraAbdominalCtHash;
    bytes32 internal loraMusculoskeletalHash;
    bytes32 internal loraRetinalOctHash;
    bytes32 internal loraDermatologyHash;
    bytes32 internal reasoningHash;
    bytes32 internal aggregatorHash;

    function setUp() public virtual {
        // 1. Deploy contracts
        sbt     = new CredentialSBT(medicalBoard);
        consent = new ConsentRegistry();
        models  = new ModelRegistry(hospitalAdmin);
        attest  = new InferenceAttestation(address(sbt), address(consent), address(models));
        drift   = new DriftMonitor();
        vault   = new ConsensusVault(address(attest));

        // 2. Compute placeholder model hashes
        whisperHash             = keccak256("openai/whisper-large-v3-turbo");
        routerHash              = keccak256("answerdotai/ModernBERT-base");
        medGemmaBaseHash        = keccak256("google/medgemma-4b-it");
        loraChestXrayHash       = keccak256("efecelik/medgemma-chest-xray-lora");
        loraBrainMriHash        = keccak256("efecelik/medgemma-brain-mri-lora");
        loraAbdominalCtHash     = keccak256("efecelik/medgemma-abdominal-ct-lora");
        loraMusculoskeletalHash = keccak256("efecelik/medgemma-musculoskeletal-lora");
        loraRetinalOctHash      = keccak256("efecelik/medgemma-retinal-oct-lora");
        loraDermatologyHash     = keccak256("efecelik/medgemma-dermatology-lora");
        reasoningHash           = keccak256("deepseek-ai/DeepSeek-R1-Distill-Qwen-7B");
        aggregatorHash          = keccak256("dmis-lab/Meerkat-7B");

        // 3. Register the full ensemble in the model registry
        vm.startPrank(hospitalAdmin);
        models.approve(whisperHash,      ModelRegistry.ModelKind.STT,        bytes32(0), "openai/whisper-large-v3-turbo",      "ipfs://whisper");
        models.approve(routerHash,       ModelRegistry.ModelKind.ROUTER,     bytes32(0), "answerdotai/ModernBERT-base",        "ipfs://modernbert");
        models.approve(medGemmaBaseHash, ModelRegistry.ModelKind.BASE,       bytes32(0), "google/medgemma-4b-it",              "ipfs://medgemma-base");
        models.approve(loraChestXrayHash,       ModelRegistry.ModelKind.LORA_ADAPTER, medGemmaBaseHash, "efecelik/medgemma-chest-xray-lora",       "ipfs://chest");
        models.approve(loraBrainMriHash,        ModelRegistry.ModelKind.LORA_ADAPTER, medGemmaBaseHash, "efecelik/medgemma-brain-mri-lora",        "ipfs://brain");
        models.approve(loraAbdominalCtHash,     ModelRegistry.ModelKind.LORA_ADAPTER, medGemmaBaseHash, "efecelik/medgemma-abdominal-ct-lora",     "ipfs://abd");
        models.approve(loraMusculoskeletalHash, ModelRegistry.ModelKind.LORA_ADAPTER, medGemmaBaseHash, "efecelik/medgemma-musculoskeletal-lora",  "ipfs://msk");
        models.approve(loraRetinalOctHash,      ModelRegistry.ModelKind.LORA_ADAPTER, medGemmaBaseHash, "efecelik/medgemma-retinal-oct-lora",      "ipfs://oct");
        models.approve(loraDermatologyHash,     ModelRegistry.ModelKind.LORA_ADAPTER, medGemmaBaseHash, "efecelik/medgemma-dermatology-lora",      "ipfs://derm");
        models.approve(reasoningHash,    ModelRegistry.ModelKind.REASONING,  bytes32(0), "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", "ipfs://r1");
        models.approve(aggregatorHash,   ModelRegistry.ModelKind.AGGREGATOR, bytes32(0), "dmis-lab/Meerkat-7B",                "ipfs://meerkat");
        vm.stopPrank();

        // 4. Issue licenses to two doctors
        vm.startPrank(medicalBoard);
        sbt.issue(doctorChen,  "ML-9442-CHE", "internal_medicine", uint64(block.timestamp + 365 days));
        sbt.issue(doctorPatel, "ML-2018-PAT", "surgery",            uint64(block.timestamp + 365 days));
        vm.stopPrank();
    }

    // helpers ----------------------------------------------------------------

    function _recordConsent(address asHospital, bytes32 ref, bytes32 patientPseudo) internal {
        vm.prank(asHospital);
        consent.record(ref, patientPseudo, keccak256("template_v3"), uint64(block.timestamp + 30 days));
    }

    function _baseAttest(bytes32 consentRef) internal view returns (InferenceAttestation.EnsembleAttestation memory) {
        return InferenceAttestation.EnsembleAttestation({
            sttHash:             bytes32(0),
            routerHash:          routerHash,
            baseHash:            medGemmaBaseHash,
            activeLoraHash:      loraChestXrayHash,
            reasoningHash:       reasoningHash,
            aggregatorHash:      aggregatorHash,
            inputHash:           keccak256("chest_xray_bytes"),
            visionOutputHash:    keccak256("vision_out"),
            reasoningOutputHash: keccak256("reasoning_out"),
            finalOutputHash:     keccak256("final_text"),
            consentRef:          consentRef,
            doctor:              address(0),  // will be overwritten by contract
            timestamp:           0            // will be overwritten by contract
        });
    }
}
