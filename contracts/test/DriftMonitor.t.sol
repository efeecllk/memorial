// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test }         from "forge-std/Test.sol";
import { DriftMonitor } from "../src/DriftMonitor.sol";
import { Errors }       from "../src/lib/Errors.sol";

contract DriftMonitorTest is Test {
    DriftMonitor internal drift;

    bytes32 internal constant SETUP = keccak256("ensemble_v1_chest");
    bytes32 internal constant SUITE = keccak256("medQA_canary_v1");

    function setUp() public {
        drift = new DriftMonitor();
        drift.setThreshold(SETUP, 8500); // 85.00%
    }

    function test_submitRun_recordsAndEmitsEvent() public {
        drift.submitRun(SETUP, SUITE, 9200);
        DriftMonitor.CanaryRun memory r = drift.latest(SETUP);
        assertEq(r.accuracyBps, 9200);
        assertEq(r.testSuiteHash, SUITE);
    }

    function test_submitRun_outOfRangeReverts() public {
        vm.expectRevert(abi.encodeWithSelector(Errors.AccuracyOutOfRange.selector, uint16(10_001)));
        drift.submitRun(SETUP, SUITE, 10_001);
    }

    function test_driftAlert_firesWhenCrossingThreshold() public {
        drift.submitRun(SETUP, SUITE, 9200); // above threshold

        vm.expectEmit(true, false, false, true);
        emit DriftMonitor.DriftAlert(SETUP, 9200, 8200, 8500);
        drift.submitRun(SETUP, SUITE, 8200); // crosses below 8500
    }

    function test_driftAlert_doesNotFireIfAlreadyBelow() public {
        drift.submitRun(SETUP, SUITE, 8200); // first run already below
        // No emit expected — alert only fires when *crossing* threshold.
        drift.submitRun(SETUP, SUITE, 8000);
    }

    function test_history_appendsInOrder() public {
        drift.submitRun(SETUP, SUITE, 9200);
        drift.submitRun(SETUP, SUITE, 9100);
        drift.submitRun(SETUP, SUITE, 9000);
        assertEq(drift.historyLength(SETUP), 3);
        assertEq(drift.runAt(SETUP, 0).accuracyBps, 9200);
        assertEq(drift.runAt(SETUP, 2).accuracyBps, 9000);
    }
}
