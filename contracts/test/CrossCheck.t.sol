// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Secp256k1} from "../src/Secp256k1.sol";
import {MerkleProof} from "../src/MerkleProof.sol";

/// @notice Proves the TypeScript client (@dragnet/crypto) and the contract agree
///         on the exact values that cross the chain boundary: leaf encoding, Merkle
///         proofs, and the commit hash. The constants below are produced by the
///         crypto package (keys [1,2,3] for the tree, keys [1,2] for the commit);
///         regenerate them if that code changes. This is the parity check the live
///         end-to-end test also exercises, kept runnable without a node.
contract CrossCheckTest is Test {
    uint256 internal constant GX =
        0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798;
    uint256 internal constant GY =
        0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8;

    // From packages/crypto: keccak256(hash160(key 1)) and the 3-leaf tree over keys 1,2,3.
    bytes32 internal constant TS_LEAF0 =
        0xdf37668dfbedcda0829e4869226b5e6c776901fec77c42b3b2f24880ba723632;
    bytes32 internal constant TS_ROOT =
        0x7ce7f97fe73000feed7d982265f004fc335dacc35355fb6a9f72532154d6fd4d;
    bytes32 internal constant TS_PROOF0_A =
        0xf656b06a086f14c3883836dabdcfe833e2fdd16b46aae4ad4e77c3b061321a2d;
    bytes32 internal constant TS_PROOF0_B =
        0x6002dddba0b2592a38f3e3a66ba271c1621ad24e96876391fb9d536f81ef8fe7;
    // From packages/crypto: commitHash([1,2], 0x..dEaD, 0x11..11).
    bytes32 internal constant TS_COMMIT =
        0x54ebfb588c27fc9a4bdd91555e2817661d13ca15c39b24ca98ad9fcc870b54c3;

    function verifyExternal(bytes32[] calldata proof, bytes32 root, bytes32 leaf)
        external
        pure
        returns (bool)
    {
        return MerkleProof.verify(proof, root, leaf);
    }

    function test_TsLeafEncodingMatchesSolidity() public pure {
        bytes20 h160 = Secp256k1.hash160Compressed(GX, GY);
        assertEq(keccak256(abi.encodePacked(h160)), TS_LEAF0);
    }

    function test_TsMerkleProofVerifiesInSolidity() public view {
        bytes32[] memory proof = new bytes32[](2);
        proof[0] = TS_PROOF0_A;
        proof[1] = TS_PROOF0_B;
        assertTrue(this.verifyExternal(proof, TS_ROOT, TS_LEAF0));
    }

    function test_TsCommitHashMatchesSolidity() public pure {
        uint256[] memory keys = new uint256[](2);
        keys[0] = 1;
        keys[1] = 2;
        address worker = address(uint160(0xdEaD));
        bytes32 salt = bytes32(uint256(0x1111111111111111111111111111111111111111111111111111111111111111));
        assertEq(keccak256(abi.encode(keys, worker, salt)), TS_COMMIT);
    }
}
