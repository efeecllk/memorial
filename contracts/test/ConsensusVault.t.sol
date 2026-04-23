// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { BaseTest }            from "./BaseTest.t.sol";
import { InferenceAttestation } from "../src/InferenceAttestation.sol";
import { Errors }               from "../src/lib/Errors.sol";

contract ConsensusVaultTest is BaseTest {
    bytes32 internal constant Q_ID    = keccak256("rare-case-001");
    bytes32 internal constant CONS    = keccak256("consult-cons");
    bytes32 internal constant PATIENT = keccak256("patient-pseudo");
    bytes32 internal constant INPUT   = keccak256("anonymised input");

    function _attestWithFinal(bytes32 id, bytes32 finalOut) internal {
        _recordConsent(hospital, keccak256(abi.encode(id, "c")), PATIENT);
        InferenceAttestation.EnsembleAttestation memory ea = _baseAttest(keccak256(abi.encode(id, "c")));
        ea.finalOutputHash = finalOut;

        vm.prank(doctorChen);
        attest.attest(id, ea);
    }

    function test_resolve_majorityWins() public {
        bytes32 outA = keccak256("dx-A");
        bytes32 outB = keccak256("dx-B");

        bytes32 r1 = keccak256("op1"); _attestWithFinal(r1, outA);
        bytes32 r2 = keccak256("op2"); _attestWithFinal(r2, outA);
        bytes32 r3 = keccak256("op3"); _attestWithFinal(r3, outB);

        vault.createQuery(Q_ID, INPUT);
        vault.submitOpinion(Q_ID, r1);
        vault.submitOpinion(Q_ID, r2);
        vault.submitOpinion(Q_ID, r3);
        vault.resolve(Q_ID);

        // Auto getter omits the dynamic array, returns 6 fields:
        // inputHash, createdAt, originator, majorityOutputHash, majorityVotes, resolved
        (, , , bytes32 majority, uint8 votes, bool resolved) = vault.queries(Q_ID);
        assertEq(majority, outA);
        assertEq(votes, 2);
        assertTrue(resolved);
    }

    function test_resolve_tieReturnsZero() public {
        bytes32 outA = keccak256("dx-A");
        bytes32 outB = keccak256("dx-B");

        bytes32 r1 = keccak256("op1"); _attestWithFinal(r1, outA);
        bytes32 r2 = keccak256("op2"); _attestWithFinal(r2, outB);

        vault.createQuery(Q_ID, INPUT);
        vault.submitOpinion(Q_ID, r1);
        vault.submitOpinion(Q_ID, r2);
        vault.resolve(Q_ID);

        (, , , bytes32 majority, , bool resolved) = vault.queries(Q_ID);
        assertEq(majority, bytes32(0));
        assertTrue(resolved);
    }

    function test_resolve_emptyOpinionsReverts() public {
        vault.createQuery(Q_ID, INPUT);
        vm.expectRevert(abi.encodeWithSelector(Errors.EmptyOpinionSet.selector, Q_ID));
        vault.resolve(Q_ID);
    }

    function test_resolve_doubleResolveReverts() public {
        bytes32 outA = keccak256("dx-A");
        bytes32 r1 = keccak256("op1"); _attestWithFinal(r1, outA);

        vault.createQuery(Q_ID, INPUT);
        vault.submitOpinion(Q_ID, r1);
        vault.resolve(Q_ID);

        vm.expectRevert(abi.encodeWithSelector(Errors.QueryAlreadyResolved.selector, Q_ID));
        vault.resolve(Q_ID);
    }
}
