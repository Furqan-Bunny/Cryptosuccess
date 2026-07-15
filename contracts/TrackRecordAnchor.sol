// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TrackRecordAnchor
/// @notice Immutable, owner-only registry of daily Merkle roots for the
/// CryptoSuccess signal track record. Holds NO funds. Each UTC day can be
/// anchored exactly once; the root can never be changed afterwards, so a
/// published win-rate cannot be retroactively edited. Anyone can read `roots`
/// to verify an inclusion proof off-chain.
contract TrackRecordAnchor {
    address public owner;

    /// @dev keccak256("YYYY-MM-DD") => Merkle root of that day's finalized signals.
    mapping(bytes32 => bytes32) public roots;

    event Anchored(bytes32 indexed dayKey, bytes32 root, uint256 timestamp);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error AlreadyAnchored();
    error ZeroRoot();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    /// @notice Anchor a day's Merkle root. One-shot per day (immutable once set).
    function anchor(bytes32 dayKey, bytes32 root) external onlyOwner {
        if (root == bytes32(0)) revert ZeroRoot();
        if (roots[dayKey] != bytes32(0)) revert AlreadyAnchored();
        roots[dayKey] = root;
        emit Anchored(dayKey, root, block.timestamp);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
