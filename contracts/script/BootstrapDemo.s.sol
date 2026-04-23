// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { CredentialSBT }      from "../src/CredentialSBT.sol";
import { ConsentRegistry }    from "../src/ConsentRegistry.sol";
import { ModelRegistry }      from "../src/ModelRegistry.sol";

/// @notice One-shot demo bootstrap after Deploy.s.sol: issue one doctor SBT
///         to the deployer wallet (single-actor demo), record one consent,
///         register the full medvision ensemble in ModelRegistry.
///
/// Env:
///   SBT_ADDRESS, CONSENT_ADDRESS, MODELS_ADDRESS — written by deploy-and-wire.sh
///   PRIVATE_KEY — broadcasting key; must be both MEDICAL_BOARD and HOSPITAL_ADMIN.
contract BootstrapDemo is Script {
    function run() external {
        CredentialSBT   sbt     = CredentialSBT(vm.envAddress("SBT_ADDRESS"));
        ConsentRegistry consent = ConsentRegistry(vm.envAddress("CONSENT_ADDRESS"));
        ModelRegistry   models  = ModelRegistry(vm.envAddress("MODELS_ADDRESS"));

        address doctor = vm.envAddress("DEPLOYER_ADDRESS");

        vm.startBroadcast();

        // 1. Issue doctor licence
        sbt.issue(doctor, "DEMO-0001", "hospitalist", uint64(block.timestamp + 365 days));
        console2.log("  SBT issued to:", doctor);

        // 2. Record one demo consent — patient pseudonym is random bytes32 the
        // hospital manages off-chain; we fake one here.
        bytes32 consentRef = keccak256(abi.encode("demo-consent-001"));
        bytes32 patientPseudo = keccak256(abi.encode("demo-patient-efe"));
        consent.record(
            consentRef,
            patientPseudo,
            keccak256("template_v3"),
            uint64(block.timestamp + 90 days)
        );
        console2.log("  Consent recorded: 0xefe... (demo)");

        // 3. Register the 11-model ensemble
        _approveAll(models);

        vm.stopBroadcast();

        console2.log("");
        console2.log("== Demo bootstrap complete ==");
    }

    function _approveAll(ModelRegistry models) internal {
        // placeholder hashes — keccak256(canonical name); same scheme as gateway
        bytes32 whisper     = keccak256("openai/whisper-large-v3-turbo");
        bytes32 router      = keccak256("answerdotai/ModernBERT-base");
        bytes32 base        = keccak256("google/medgemma-4b-it");
        bytes32 reasoning   = keccak256("deepseek-ai/DeepSeek-R1-Distill-Qwen-7B");
        bytes32 aggregator  = keccak256("dmis-lab/Meerkat-7B");

        bytes32 loraAbd     = keccak256("efecelik/medgemma-abdominal-ct-lora");
        bytes32 loraMsk     = keccak256("efecelik/medgemma-musculoskeletal-lora");
        bytes32 loraChest   = keccak256("efecelik/medgemma-chest-xray-lora");
        bytes32 loraOct     = keccak256("efecelik/medgemma-retinal-oct-lora");
        bytes32 loraBrain   = keccak256("efecelik/medgemma-brain-mri-lora");
        bytes32 loraDerm    = keccak256("efecelik/medgemma-dermatology-lora");

        models.approve(whisper,    ModelRegistry.ModelKind.STT,        bytes32(0), "openai/whisper-large-v3-turbo", "ipfs://whisper");
        models.approve(router,     ModelRegistry.ModelKind.ROUTER,     bytes32(0), "answerdotai/ModernBERT-base",    "ipfs://router");
        models.approve(base,       ModelRegistry.ModelKind.BASE,       bytes32(0), "google/medgemma-4b-it",          "ipfs://base");

        models.approve(loraAbd,    ModelRegistry.ModelKind.LORA_ADAPTER, base, "efecelik/medgemma-abdominal-ct-lora",     "ipfs://abd");
        models.approve(loraMsk,    ModelRegistry.ModelKind.LORA_ADAPTER, base, "efecelik/medgemma-musculoskeletal-lora",  "ipfs://msk");
        models.approve(loraChest,  ModelRegistry.ModelKind.LORA_ADAPTER, base, "efecelik/medgemma-chest-xray-lora",       "ipfs://chest");
        models.approve(loraOct,    ModelRegistry.ModelKind.LORA_ADAPTER, base, "efecelik/medgemma-retinal-oct-lora",      "ipfs://oct");
        models.approve(loraBrain,  ModelRegistry.ModelKind.LORA_ADAPTER, base, "efecelik/medgemma-brain-mri-lora",        "ipfs://brain");
        models.approve(loraDerm,   ModelRegistry.ModelKind.LORA_ADAPTER, base, "efecelik/medgemma-dermatology-lora",      "ipfs://derm");

        models.approve(reasoning,  ModelRegistry.ModelKind.REASONING,  bytes32(0), "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B", "ipfs://r1");
        models.approve(aggregator, ModelRegistry.ModelKind.AGGREGATOR, bytes32(0), "dmis-lab/Meerkat-7B",                "ipfs://meerkat");

        console2.log("  Ensemble registered: 11 models (base + 6 LoRAs + STT + router + reasoning + aggregator)");
    }
}
