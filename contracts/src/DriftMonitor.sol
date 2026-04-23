// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Errors } from "./lib/Errors.sol";

/// @title  DriftMonitor — Time-series ensemble accuracy from canary tests
/// @author Polyglot-Attest
/// @notice Records the result of periodic canary-test runs against a
///         specific ensemble configuration. Emits a `DriftAlert` whenever
///         a new run drops below the configured threshold compared with
///         the prior run.
contract DriftMonitor {
    // ── types ────────────────────────────────────────────────────────────────

    struct CanaryRun {
        bytes32 ensembleSetupHash; // hash of (router || base || lora || reasoning || aggregator)
        bytes32 testSuiteHash;     // version of the canary test set used
        uint16  accuracyBps;       // basis points: 9200 == 92.00 %
        uint64  runAt;
        address runner;
    }

    // ── state ────────────────────────────────────────────────────────────────

    /// @dev ensembleSetupHash → ordered list of runs (oldest first).
    mapping(bytes32 setup => CanaryRun[]) private _history;

    /// @dev ensembleSetupHash → bps threshold (default 0 == no alerting).
    mapping(bytes32 setup => uint16) public alertThreshold;

    // ── events ───────────────────────────────────────────────────────────────

    event CanaryRecorded(
        bytes32 indexed setup,
        bytes32 indexed testSuite,
        address indexed runner,
        uint16 accuracyBps,
        uint64 at
    );

    event DriftAlert(
        bytes32 indexed setup,
        uint16 prevBps,
        uint16 currBps,
        uint16 thresholdBps
    );

    event ThresholdUpdated(bytes32 indexed setup, uint16 thresholdBps);

    // ── writes ───────────────────────────────────────────────────────────────

    /// @notice Submit a new canary-test run. Anyone may submit; the runner
    ///         address is recorded so off-chain audits can filter by source.
    function submitRun(bytes32 setup, bytes32 testSuite, uint16 accuracyBps) external {
        if (accuracyBps > 10_000) revert Errors.AccuracyOutOfRange(accuracyBps);

        CanaryRun[] storage runs = _history[setup];
        uint16 threshold = alertThreshold[setup];
        if (
            runs.length > 0
            && threshold != 0
            && accuracyBps < threshold
            && runs[runs.length - 1].accuracyBps >= threshold
        ) {
            emit DriftAlert(setup, runs[runs.length - 1].accuracyBps, accuracyBps, threshold);
        }

        runs.push(CanaryRun({
            ensembleSetupHash: setup,
            testSuiteHash:     testSuite,
            accuracyBps:       accuracyBps,
            runAt:             uint64(block.timestamp),
            runner:            msg.sender
        }));

        emit CanaryRecorded(setup, testSuite, msg.sender, accuracyBps, uint64(block.timestamp));
    }

    /// @notice Configure the alerting threshold for a given ensemble setup.
    function setThreshold(bytes32 setup, uint16 thresholdBps) external {
        if (thresholdBps > 10_000) revert Errors.AccuracyOutOfRange(thresholdBps);
        alertThreshold[setup] = thresholdBps;
        emit ThresholdUpdated(setup, thresholdBps);
    }

    // ── views ────────────────────────────────────────────────────────────────

    function historyLength(bytes32 setup) external view returns (uint256) {
        return _history[setup].length;
    }

    function runAt(bytes32 setup, uint256 i) external view returns (CanaryRun memory) {
        return _history[setup][i];
    }

    function latest(bytes32 setup) external view returns (CanaryRun memory) {
        CanaryRun[] storage runs = _history[setup];
        return runs[runs.length - 1];
    }

    function getHistory(bytes32 setup) external view returns (CanaryRun[] memory) {
        return _history[setup];
    }
}
