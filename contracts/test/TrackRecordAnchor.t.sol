// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TrackRecordAnchor} from "../TrackRecordAnchor.sol";

contract TrackRecordAnchorTest is Test {
    TrackRecordAnchor anchor;
    address owner = address(this);
    address stranger = address(0xBEEF);

    bytes32 constant DAY = keccak256("2026-06-01");
    bytes32 constant ROOT = keccak256("root");

    function setUp() public {
        anchor = new TrackRecordAnchor();
    }

    function test_OwnerIsDeployer() public view {
        assertEq(anchor.owner(), owner);
    }

    function test_AnchorStoresRoot() public {
        anchor.anchor(DAY, ROOT);
        assertEq(anchor.roots(DAY), ROOT);
    }

    function test_AnchorEmitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit TrackRecordAnchor.Anchored(DAY, ROOT, block.timestamp);
        anchor.anchor(DAY, ROOT);
    }

    function test_RevertWhen_NotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(TrackRecordAnchor.NotOwner.selector);
        anchor.anchor(DAY, ROOT);
    }

    function test_RevertWhen_AlreadyAnchored() public {
        anchor.anchor(DAY, ROOT);
        vm.expectRevert(TrackRecordAnchor.AlreadyAnchored.selector);
        anchor.anchor(DAY, keccak256("different"));
    }

    function test_RevertWhen_ZeroRoot() public {
        vm.expectRevert(TrackRecordAnchor.ZeroRoot.selector);
        anchor.anchor(DAY, bytes32(0));
    }

    function test_TransferOwnership() public {
        anchor.transferOwnership(stranger);
        assertEq(anchor.owner(), stranger);
        vm.prank(stranger);
        anchor.anchor(DAY, ROOT);
        assertEq(anchor.roots(DAY), ROOT);
    }
}
