// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title MerkleProof
/// @notice Membership check against a sorted-pair keccak256 Merkle root.
/// @dev    Mirrors the canonical OpenZeppelin implementation (sourceRef:
///         openzeppelin-contracts v5, utils/cryptography/MerkleProof.sol). Kept
///         in-repo so `forge build` needs no external dependency install, which
///         keeps the build reproducible for reviewers. Pairs are ordered by value
///         before hashing, so a proof is a list of sibling hashes with no
///         left/right flags. Leaves must be hashed by the caller (see
///         DragnetMarket, which uses keccak256 of the 20-byte hash160).
library MerkleProof {
    function verify(bytes32[] calldata proof, bytes32 root, bytes32 leaf)
        internal
        pure
        returns (bool)
    {
        bytes32 computed = leaf;
        uint256 length = proof.length;
        for (uint256 index = 0; index < length; index++) {
            bytes32 sibling = proof[index];
            computed = computed <= sibling
                ? keccak256(abi.encodePacked(computed, sibling))
                : keccak256(abi.encodePacked(sibling, computed));
        }
        return computed == root;
    }
}
