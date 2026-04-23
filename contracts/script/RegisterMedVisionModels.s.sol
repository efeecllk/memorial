// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { ModelRegistry }    from "../src/ModelRegistry.sol";

/// @notice Approves the full Polyglot-Attest ensemble in an already-deployed
///         ModelRegistry. The placeholder hashes below are deterministic
///         keccak256(name) values; replace them with the real
///         keccak256(weights-file) hashes when the actual model files are
///         downloaded for production.
///
/// Required env vars:
///   MODEL_REGISTRY  — address of a deployed ModelRegistry
///
/// Run as the registry's HOSPITAL_ADMIN:
///   forge script script/RegisterMedVisionModels.s.sol \
///       --rpc-url monad_testnet \
///       --account polyglot-deployer \
///       --broadcast
contract RegisterMedVisionModels is Script {
    function run() external {
        ModelRegistry models = ModelRegistry(vm.envAddress("MODEL_REGISTRY"));
        console2.log("Registering ensemble in ModelRegistry @", address(models));

        // Placeholder hashes — REPLACE with real keccak256(weights file) hashes
        // when the actual safetensors files are downloaded.
        bytes32 whisperHash             = keccak256("openai/whisper-large-v3-turbo");
        bytes32 routerHash              = keccak256("answerdotai/ModernBERT-base");
        bytes32 medGemmaBaseHash        = keccak256("google/medgemma-4b-it");
        bytes32 loraAbdominalCtHash     = keccak256("efecelik/medgemma-abdominal-ct-lora");
        bytes32 loraMusculoskeletalHash = keccak256("efecelik/medgemma-musculoskeletal-lora");
        bytes32 loraChestXrayHash       = keccak256("efecelik/medgemma-chest-xray-lora");
        bytes32 loraRetinalOctHash      = keccak256("efecelik/medgemma-retinal-oct-lora");
        bytes32 loraBrainMriHash        = keccak256("efecelik/medgemma-brain-mri-lora");
        bytes32 loraDermatologyHash     = keccak256("efecelik/medgemma-dermatology-lora");
        bytes32 reasoningHash           = keccak256("deepseek-ai/DeepSeek-R1-Distill-Qwen-7B");
        bytes32 aggregatorHash          = keccak256("dmis-lab/Meerkat-7B");

        vm.startBroadcast();

        // STT (Whisper)
        models.approve(
            whisperHash,
            ModelRegistry.ModelKind.STT,
            bytes32(0),
            "openai/whisper-large-v3-turbo",
            "ipfs://placeholder/whisper-card"
        );

        // Router (ModernBERT)
        models.approve(
            routerHash,
            ModelRegistry.ModelKind.ROUTER,
            bytes32(0),
            "answerdotai/ModernBERT-base",
            "ipfs://placeholder/modernbert-card"
        );

        // Vision base (MedGemma)
        models.approve(
            medGemmaBaseHash,
            ModelRegistry.ModelKind.BASE,
            bytes32(0),
            "google/medgemma-4b-it",
            "ipfs://placeholder/medgemma-base-card"
        );

        // 6 medvision LoRA adapters — Efe's published collection
        _approveLora(models, loraAbdominalCtHash,     medGemmaBaseHash, "efecelik/medgemma-abdominal-ct-lora",     "ipfs://placeholder/abdominal-ct");
        _approveLora(models, loraMusculoskeletalHash, medGemmaBaseHash, "efecelik/medgemma-musculoskeletal-lora",  "ipfs://placeholder/musculoskeletal");
        _approveLora(models, loraChestXrayHash,       medGemmaBaseHash, "efecelik/medgemma-chest-xray-lora",       "ipfs://placeholder/chest-xray");
        _approveLora(models, loraRetinalOctHash,      medGemmaBaseHash, "efecelik/medgemma-retinal-oct-lora",      "ipfs://placeholder/retinal-oct");
        _approveLora(models, loraBrainMriHash,        medGemmaBaseHash, "efecelik/medgemma-brain-mri-lora",        "ipfs://placeholder/brain-mri");
        _approveLora(models, loraDermatologyHash,     medGemmaBaseHash, "efecelik/medgemma-dermatology-lora",      "ipfs://placeholder/dermatology");

        // Reasoning (DeepSeek-R1-Distill)
        models.approve(
            reasoningHash,
            ModelRegistry.ModelKind.REASONING,
            bytes32(0),
            "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B",
            "ipfs://placeholder/r1-distill-card"
        );

        // Aggregator (Meerkat)
        models.approve(
            aggregatorHash,
            ModelRegistry.ModelKind.AGGREGATOR,
            bytes32(0),
            "dmis-lab/Meerkat-7B",
            "ipfs://placeholder/meerkat-card"
        );

        vm.stopBroadcast();

        console2.log("");
        console2.log("== Ensemble registered ==");
        console2.log("STT        ", vm.toString(whisperHash));
        console2.log("Router     ", vm.toString(routerHash));
        console2.log("Base       ", vm.toString(medGemmaBaseHash));
        console2.log("LoRA chest ", vm.toString(loraChestXrayHash));
        console2.log("LoRA brain ", vm.toString(loraBrainMriHash));
        console2.log("LoRA abd   ", vm.toString(loraAbdominalCtHash));
        console2.log("LoRA msk   ", vm.toString(loraMusculoskeletalHash));
        console2.log("LoRA oct   ", vm.toString(loraRetinalOctHash));
        console2.log("LoRA derm  ", vm.toString(loraDermatologyHash));
        console2.log("Reasoning  ", vm.toString(reasoningHash));
        console2.log("Aggregator ", vm.toString(aggregatorHash));
    }

    function _approveLora(
        ModelRegistry models,
        bytes32 hash,
        bytes32 base,
        string memory hfRef,
        string memory ipfsCard
    ) internal {
        models.approve(hash, ModelRegistry.ModelKind.LORA_ADAPTER, base, hfRef, ipfsCard);
    }
}
