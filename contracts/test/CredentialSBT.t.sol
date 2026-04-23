// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { BaseTest }      from "./BaseTest.t.sol";
import { CredentialSBT } from "../src/CredentialSBT.sol";
import { Errors }        from "../src/lib/Errors.sol";

contract CredentialSBTTest is BaseTest {
    function test_issue_setsValidLicense() public view {
        assertTrue(sbt.hasValidLicense(doctorChen));
        assertTrue(sbt.hasValidLicense(doctorPatel));
        assertFalse(sbt.hasValidLicense(stranger));
    }

    function test_issue_doubleIssuanceReverts() public {
        vm.prank(medicalBoard);
        vm.expectRevert(abi.encodeWithSelector(Errors.LicenseAlreadyIssued.selector, doctorChen));
        sbt.issue(doctorChen, "DUPE", "anything", uint64(block.timestamp + 1 days));
    }

    function test_issue_onlyBoardCanCall() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Errors.NotMedicalBoard.selector, stranger));
        sbt.issue(stranger, "FAKE", "fake", uint64(block.timestamp + 1 days));
    }

    function test_issue_expiredAtCreationReverts() public {
        vm.prank(medicalBoard);
        vm.expectRevert(abi.encodeWithSelector(Errors.LicenseExpired.selector, stranger, uint64(block.timestamp)));
        sbt.issue(stranger, "X", "y", uint64(block.timestamp));
    }

    function test_suspend_invalidatesLicense() public {
        uint256 tokenId = sbt.doctorTokenId(doctorChen);
        vm.prank(medicalBoard);
        sbt.suspend(tokenId, "investigation pending");
        assertFalse(sbt.hasValidLicense(doctorChen));
    }

    function test_reinstate_restoresValidity() public {
        uint256 tokenId = sbt.doctorTokenId(doctorChen);
        vm.startPrank(medicalBoard);
        sbt.suspend(tokenId, "investigation");
        sbt.reinstate(tokenId);
        vm.stopPrank();
        assertTrue(sbt.hasValidLicense(doctorChen));
    }

    function test_expiry_invalidatesAfterTime() public {
        skip(366 days);
        assertFalse(sbt.hasValidLicense(doctorChen));
    }

    function test_soulbound_transferReverts() public {
        uint256 tokenId = sbt.doctorTokenId(doctorChen);
        vm.prank(doctorChen);
        vm.expectRevert(Errors.SoulboundTransferDisallowed.selector);
        sbt.transferFrom(doctorChen, stranger, tokenId);
    }

    function test_soulbound_approveReverts() public {
        uint256 tokenId = sbt.doctorTokenId(doctorChen);
        vm.prank(doctorChen);
        vm.expectRevert(Errors.SoulboundTransferDisallowed.selector);
        sbt.approve(stranger, tokenId);
    }

    function test_soulbound_approveForAllReverts() public {
        vm.prank(doctorChen);
        vm.expectRevert(Errors.SoulboundTransferDisallowed.selector);
        sbt.setApprovalForAll(stranger, true);
    }
}
