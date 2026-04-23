// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { BaseTest }       from "./BaseTest.t.sol";
import { ConsentRegistry } from "../src/ConsentRegistry.sol";
import { Errors }          from "../src/lib/Errors.sol";

contract ConsentRegistryTest is BaseTest {
    bytes32 internal constant CONSENT_REF = keccak256("efe-2026-04-23");
    bytes32 internal constant PATIENT     = keccak256("efe-pseudonym");
    bytes32 internal constant TEMPLATE    = keccak256("template_v3");

    function test_record_andIsActive() public {
        _recordConsent(hospital, CONSENT_REF, PATIENT);
        assertTrue(consent.isActive(CONSENT_REF));
        assertTrue(consent.isValid(CONSENT_REF, hospital));
        assertFalse(consent.isValid(CONSENT_REF, stranger));
    }

    function test_record_doubleRecordReverts() public {
        _recordConsent(hospital, CONSENT_REF, PATIENT);
        vm.prank(hospital);
        vm.expectRevert(abi.encodeWithSelector(Errors.ConsentAlreadyExists.selector, CONSENT_REF));
        consent.record(CONSENT_REF, PATIENT, TEMPLATE, uint64(block.timestamp + 1 days));
    }

    function test_record_alreadyExpiredReverts() public {
        vm.prank(hospital);
        vm.expectRevert(
            abi.encodeWithSelector(Errors.ConsentExpired.selector, CONSENT_REF, uint64(block.timestamp))
        );
        consent.record(CONSENT_REF, PATIENT, TEMPLATE, uint64(block.timestamp));
    }

    function test_revoke_invalidatesConsent() public {
        _recordConsent(hospital, CONSENT_REF, PATIENT);
        vm.prank(hospital);
        consent.revoke(CONSENT_REF);
        assertFalse(consent.isActive(CONSENT_REF));
    }

    function test_revoke_onlyRecordingHospital() public {
        _recordConsent(hospital, CONSENT_REF, PATIENT);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Errors.NotAuthorized.selector, stranger));
        consent.revoke(CONSENT_REF);
    }

    function test_revoke_unknownRefReverts() public {
        bytes32 unknown = keccak256("nope");
        vm.prank(hospital);
        vm.expectRevert(abi.encodeWithSelector(Errors.ConsentNotFound.selector, unknown));
        consent.revoke(unknown);
    }

    function test_expiry_invalidatesAfterTime() public {
        _recordConsent(hospital, CONSENT_REF, PATIENT);
        skip(31 days);
        assertFalse(consent.isActive(CONSENT_REF));
    }

    function test_status_returnsRichDetail() public {
        _recordConsent(hospital, CONSENT_REF, PATIENT);
        (bool exists, bool revoked, bool expired, address h) = consent.status(CONSENT_REF);
        assertTrue(exists);
        assertFalse(revoked);
        assertFalse(expired);
        assertEq(h, hospital);
    }
}
