// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ConsensMedVerify} from "../src/ConsensMedVerify.sol";

contract ConsensMedVerifyTest is Test {
    ConsensMedVerify internal registry;

    address internal owner = makeAddr("owner");
    address internal submitter = makeAddr("submitter");
    address internal stranger = makeAddr("stranger");

    bytes32 internal docA = keccak256("doc-a");
    bytes32 internal docB = keccak256("doc-b");
    bytes32 internal hashA = sha256("content-a");
    bytes32 internal hashB = sha256("content-b");

    event Issued(bytes32 indexed docId, bytes32 indexed contentHash, address indexed issuer, uint64 issuedAt);
    event Revoked(bytes32 indexed docId, uint8 indexed reasonCode, address indexed submitter);
    event Superseded(bytes32 indexed docId, bytes32 indexed newDocId, address indexed submitter);
    event SubmitterSet(address indexed submitter, bool allowed);

    function setUp() public {
        registry = new ConsensMedVerify(owner);
        vm.prank(owner);
        registry.setSubmitter(submitter, true);
        vm.warp(1_790_000_000);
    }

    function _issue(bytes32 docId, bytes32 contentHash) internal {
        vm.prank(submitter);
        registry.issue(docId, contentHash);
    }

    function _status(bytes32 docId, bytes32 contentHash) internal view returns (uint8) {
        return uint8(registry.verify(docId, contentHash));
    }

    function test_Constructor_SetsOwnerAndNoSubmitters() public {
        ConsensMedVerify fresh = new ConsensMedVerify(owner);
        assertEq(fresh.owner(), owner);
        assertFalse(fresh.isSubmitter(owner));
    }

    function test_SetSubmitter_RevertsWhenCallerIsNotOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        vm.prank(stranger);
        registry.setSubmitter(stranger, true);
    }

    function test_SetSubmitter_GrantsAndRevokesWithEvent() public {
        vm.expectEmit(true, false, false, true);
        emit SubmitterSet(stranger, true);
        vm.prank(owner);
        registry.setSubmitter(stranger, true);
        assertTrue(registry.isSubmitter(stranger));

        vm.expectEmit(true, false, false, true);
        emit SubmitterSet(stranger, false);
        vm.prank(owner);
        registry.setSubmitter(stranger, false);
        assertFalse(registry.isSubmitter(stranger));
    }

    function test_Issue_RevertsWhenCallerIsNotSubmitter() public {
        vm.expectRevert(abi.encodeWithSelector(ConsensMedVerify.NotSubmitter.selector, stranger));
        vm.prank(stranger);
        registry.issue(docA, hashA);
    }

    function test_Issue_RevertsAfterSubmitterIsRemoved() public {
        vm.prank(owner);
        registry.setSubmitter(submitter, false);
        vm.expectRevert(abi.encodeWithSelector(ConsensMedVerify.NotSubmitter.selector, submitter));
        vm.prank(submitter);
        registry.issue(docA, hashA);
    }

    function test_Issue_RevertsWhenDocIdIsZero() public {
        vm.expectRevert(ConsensMedVerify.ZeroValue.selector);
        vm.prank(submitter);
        registry.issue(bytes32(0), hashA);
    }

    function test_Issue_RevertsWhenContentHashIsZero() public {
        vm.expectRevert(ConsensMedVerify.ZeroValue.selector);
        vm.prank(submitter);
        registry.issue(docA, bytes32(0));
    }

    function test_Issue_RevertsWhenDocIdAlreadyIssued() public {
        _issue(docA, hashA);
        vm.expectRevert(abi.encodeWithSelector(ConsensMedVerify.DocIdAlreadyIssued.selector, docA));
        vm.prank(submitter);
        registry.issue(docA, hashB);
    }

    function test_Issue_RevertsWhenContentAlreadyIssued() public {
        _issue(docA, hashA);
        vm.expectRevert(abi.encodeWithSelector(ConsensMedVerify.ContentAlreadyIssued.selector, hashA));
        vm.prank(submitter);
        registry.issue(docB, hashA);
    }

    function test_Issue_StoresRecordAndEmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit Issued(docA, hashA, submitter, uint64(block.timestamp));
        _issue(docA, hashA);

        (bytes32 contentHash, uint64 issuedAt, ConsensMedVerify.Status status, bytes32 supersededBy, address issuer) =
            registry.record(docA);
        assertEq(contentHash, hashA);
        assertEq(issuedAt, uint64(block.timestamp));
        assertEq(uint8(status), uint8(ConsensMedVerify.Status.VALID));
        assertEq(supersededBy, bytes32(0));
        assertEq(issuer, submitter);
        assertEq(registry.docIdOf(hashA), docA);
    }

    function test_Record_IsEmptyForUnknownDocId() public view {
        (bytes32 contentHash, uint64 issuedAt, ConsensMedVerify.Status status, bytes32 supersededBy, address issuer) =
            registry.record(docA);
        assertEq(contentHash, bytes32(0));
        assertEq(issuedAt, 0);
        assertEq(uint8(status), uint8(ConsensMedVerify.Status.NOT_FOUND));
        assertEq(supersededBy, bytes32(0));
        assertEq(issuer, address(0));
    }

    function test_DocIdOf_IsZeroForUnknownContent() public view {
        assertEq(registry.docIdOf(hashA), bytes32(0));
    }

    function test_Verify_ReturnsNotFoundForUnknownDocId() public view {
        assertEq(_status(docA, hashA), uint8(ConsensMedVerify.Status.NOT_FOUND));
    }

    function test_Verify_ReturnsValidForMatchingContent() public {
        _issue(docA, hashA);
        assertEq(_status(docA, hashA), uint8(ConsensMedVerify.Status.VALID));
    }

    function test_Verify_ReturnsMismatchWhenContentDiffers() public {
        _issue(docA, hashA);
        assertEq(_status(docA, hashB), uint8(ConsensMedVerify.Status.MISMATCH));
    }

    function test_Verify_ReturnsMismatchBeforeRevokedWhenContentDiffers() public {
        _issue(docA, hashA);
        vm.prank(submitter);
        registry.revoke(docA, 1);
        assertEq(_status(docA, hashB), uint8(ConsensMedVerify.Status.MISMATCH));
    }

    function test_Revoke_RevertsWhenCallerIsNotSubmitter() public {
        _issue(docA, hashA);
        vm.expectRevert(abi.encodeWithSelector(ConsensMedVerify.NotSubmitter.selector, stranger));
        vm.prank(stranger);
        registry.revoke(docA, 1);
    }

    function test_Revoke_RevertsWhenDocIdIsUnknown() public {
        vm.expectRevert(abi.encodeWithSelector(ConsensMedVerify.NotValid.selector, docA));
        vm.prank(submitter);
        registry.revoke(docA, 1);
    }

    function test_Revoke_MovesValidToRevokedAndEmitsEvent() public {
        _issue(docA, hashA);
        vm.expectEmit(true, true, true, true);
        emit Revoked(docA, 7, submitter);
        vm.prank(submitter);
        registry.revoke(docA, 7);
        assertEq(_status(docA, hashA), uint8(ConsensMedVerify.Status.REVOKED));
    }

    function test_Revoke_RevertsWhenAlreadyRevoked() public {
        _issue(docA, hashA);
        vm.startPrank(submitter);
        registry.revoke(docA, 1);
        vm.expectRevert(abi.encodeWithSelector(ConsensMedVerify.NotValid.selector, docA));
        registry.revoke(docA, 1);
        vm.stopPrank();
    }

    function test_Revoke_RevertsWhenSuperseded() public {
        _issue(docA, hashA);
        _issue(docB, hashB);
        vm.startPrank(submitter);
        registry.supersede(docA, docB);
        vm.expectRevert(abi.encodeWithSelector(ConsensMedVerify.NotValid.selector, docA));
        registry.revoke(docA, 1);
        vm.stopPrank();
    }

    function test_Supersede_RevertsWhenCallerIsNotSubmitter() public {
        _issue(docA, hashA);
        _issue(docB, hashB);
        vm.expectRevert(abi.encodeWithSelector(ConsensMedVerify.NotSubmitter.selector, stranger));
        vm.prank(stranger);
        registry.supersede(docA, docB);
    }

    function test_Supersede_RevertsWhenOldAndNewAreTheSame() public {
        _issue(docA, hashA);
        vm.expectRevert(ConsensMedVerify.SameDocument.selector);
        vm.prank(submitter);
        registry.supersede(docA, docA);
    }

    function test_Supersede_RevertsWhenOldIsUnknown() public {
        _issue(docB, hashB);
        vm.expectRevert(abi.encodeWithSelector(ConsensMedVerify.NotValid.selector, docA));
        vm.prank(submitter);
        registry.supersede(docA, docB);
    }

    function test_Supersede_RevertsWhenOldIsRevoked() public {
        _issue(docA, hashA);
        _issue(docB, hashB);
        vm.startPrank(submitter);
        registry.revoke(docA, 1);
        vm.expectRevert(abi.encodeWithSelector(ConsensMedVerify.NotValid.selector, docA));
        registry.supersede(docA, docB);
        vm.stopPrank();
    }

    function test_Supersede_RevertsWhenNewIsNotIssued() public {
        _issue(docA, hashA);
        vm.expectRevert(abi.encodeWithSelector(ConsensMedVerify.NotValid.selector, docB));
        vm.prank(submitter);
        registry.supersede(docA, docB);
    }

    function test_Supersede_RevertsWhenNewIsRevoked() public {
        _issue(docA, hashA);
        _issue(docB, hashB);
        vm.startPrank(submitter);
        registry.revoke(docB, 1);
        vm.expectRevert(abi.encodeWithSelector(ConsensMedVerify.NotValid.selector, docB));
        registry.supersede(docA, docB);
        vm.stopPrank();
    }

    function test_Supersede_MovesOldToSupersededAndKeepsNewValid() public {
        _issue(docA, hashA);
        _issue(docB, hashB);
        vm.expectEmit(true, true, true, true);
        emit Superseded(docA, docB, submitter);
        vm.prank(submitter);
        registry.supersede(docA, docB);

        assertEq(_status(docA, hashA), uint8(ConsensMedVerify.Status.SUPERSEDED));
        assertEq(_status(docB, hashB), uint8(ConsensMedVerify.Status.VALID));
        (,, ConsensMedVerify.Status status, bytes32 supersededBy,) = registry.record(docA);
        assertEq(uint8(status), uint8(ConsensMedVerify.Status.SUPERSEDED));
        assertEq(supersededBy, docB);
    }

    function test_Supersede_RevertsWhenOldIsAlreadySuperseded() public {
        bytes32 docC = keccak256("doc-c");
        _issue(docA, hashA);
        _issue(docB, hashB);
        _issue(docC, sha256("content-c"));
        vm.startPrank(submitter);
        registry.supersede(docA, docB);
        vm.expectRevert(abi.encodeWithSelector(ConsensMedVerify.NotValid.selector, docA));
        registry.supersede(docA, docC);
        vm.stopPrank();
    }

    function testFuzz_Issue_AnyNonZeroPairBecomesValid(bytes32 docId, bytes32 contentHash) public {
        vm.assume(docId != bytes32(0) && contentHash != bytes32(0));
        _issue(docId, contentHash);
        assertEq(_status(docId, contentHash), uint8(ConsensMedVerify.Status.VALID));
        assertEq(registry.docIdOf(contentHash), docId);
    }
}
