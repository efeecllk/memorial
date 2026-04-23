// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";

import { CredentialSBT }              from "../src/CredentialSBT.sol";
import { ConsentRegistry }            from "../src/ConsentRegistry.sol";
import { ModelRegistry }              from "../src/ModelRegistry.sol";
import { InferenceAttestation }       from "../src/InferenceAttestation.sol";
import { DriftMonitor }               from "../src/DriftMonitor.sol";
import { ConsensusVault }             from "../src/ConsensusVault.sol";
import { ClinicalDecisionAttestation } from "../src/ClinicalDecisionAttestation.sol";

/// @notice Deploys the entire Polyglot-Attest contract suite, wires the
///         dependencies and prints the resulting addresses.
///
/// Required env vars (set as `--account` keystore is used for the broadcaster
/// signature; the addresses below are read from env so different actors can be
/// configured per network):
///
///   MEDICAL_BOARD   — address allowed to issue / suspend doctor licenses
///   HOSPITAL_ADMIN  — address allowed to approve / deactivate models
///
/// Run:
///   forge script script/Deploy.s.sol \
///       --rpc-url monad_testnet \
///       --account polyglot-deployer \
///       --broadcast
contract Deploy is Script {
    function run()
        external
        returns (
            CredentialSBT sbt,
            ConsentRegistry consent,
            ModelRegistry models,
            InferenceAttestation attest,
            DriftMonitor drift,
            ConsensusVault vault,
            ClinicalDecisionAttestation cda
        )
    {
        address medicalBoard = vm.envAddress("MEDICAL_BOARD");
        address hospitalAdmin = vm.envAddress("HOSPITAL_ADMIN");

        console2.log("Medical Board ............", medicalBoard);
        console2.log("Hospital Admin ...........", hospitalAdmin);

        vm.startBroadcast();

        sbt     = new CredentialSBT(medicalBoard);
        consent = new ConsentRegistry();
        models  = new ModelRegistry(hospitalAdmin);
        attest  = new InferenceAttestation(address(sbt), address(consent), address(models));
        drift   = new DriftMonitor();
        vault   = new ConsensusVault(address(attest));
        cda     = new ClinicalDecisionAttestation(address(attest), address(sbt), hospitalAdmin);

        vm.stopBroadcast();

        console2.log("");
        console2.log("== Polyglot-Attest deployed ==");
        console2.log("CredentialSBT             ", address(sbt));
        console2.log("ConsentRegistry           ", address(consent));
        console2.log("ModelRegistry             ", address(models));
        console2.log("InferenceAttestation      ", address(attest));
        console2.log("DriftMonitor              ", address(drift));
        console2.log("ConsensusVault            ", address(vault));
        console2.log("ClinicalDecisionAttest.   ", address(cda));
    }
}
