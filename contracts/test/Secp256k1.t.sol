// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Secp256k1} from "../src/Secp256k1.sol";

/// @notice Validates the ecrecover ecmul trick and hash160 derivation against
///         independently known secp256k1 vectors.
contract Secp256k1Test is Test {
    // Generator G. sourceRef: SEC 2 v2, section 2.4.1.
    uint256 internal constant GX =
        0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798;
    uint256 internal constant GY =
        0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8;

    // Point 2*G, computed independently (used to test a non-generator point).
    // sourceRef: secp256k1 doubling of G, cross-checked with @noble/secp256k1 in
    // packages/crypto/test.
    uint256 internal constant TWO_GX =
        0xC6047F9441ED7D6D3045406E95C07CD85C778E4B8CEF3CA7ABAC09B95C709EE5;
    uint256 internal constant TWO_GY =
        0x1AE168FEA63DC339A3C58419466CEAEEF7F632653266D0E1236431A950CFE52A;

    function test_DeriveAddressOfPrivKeyOne() public pure {
        // The Ethereum address of private key 1 is a widely published value.
        assertEq(Secp256k1.deriveAddress(1), 0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf);
    }

    function test_DeriveAddressOfPrivKeyTwo() public pure {
        assertEq(Secp256k1.deriveAddress(2), 0x2B5AD5c4795c026514f8317c7a215E218DcCD6cF);
    }

    function test_DeriveAddressRejectsOutOfRange() public pure {
        assertEq(Secp256k1.deriveAddress(0), address(0));
        assertEq(Secp256k1.deriveAddress(Secp256k1.N), address(0));
    }

    function test_GeneratorIsOnCurve() public pure {
        assertTrue(Secp256k1.isOnCurve(GX, GY));
        assertTrue(Secp256k1.isOnCurve(TWO_GX, TWO_GY));
    }

    function test_RejectsOffCurvePoint() public pure {
        assertFalse(Secp256k1.isOnCurve(GX, GY + 1));
        assertFalse(Secp256k1.isOnCurve(0, 0));
    }

    function test_IsPubKeyOfBindsPointToKey() public pure {
        assertTrue(Secp256k1.isPubKeyOf(1, GX, GY));
        assertTrue(Secp256k1.isPubKeyOf(2, TWO_GX, TWO_GY));
        // Wrong key for the point.
        assertFalse(Secp256k1.isPubKeyOf(2, GX, GY));
        // Right key, tampered point.
        assertFalse(Secp256k1.isPubKeyOf(1, GX, GY + 1));
    }

    function test_Hash160OfCompressedGenerator() public pure {
        // hash160 of the compressed pubkey of private key 1 (Bitcoin address
        // 1EHNa6Q4Jz2uvNExL497mE43ikXhwF6kZm). sourceRef: known puzzle-1 vector.
        bytes20 expected = bytes20(hex"751e76e8199196d454941c45d1b3a323f1433bd6");
        assertEq(Secp256k1.hash160Compressed(GX, GY), expected);
    }

    function test_RecoverHash160HappyPath() public pure {
        (bool ok, bytes20 h160) = Secp256k1.recoverHash160(1, GX, GY);
        assertTrue(ok);
        assertEq(h160, bytes20(hex"751e76e8199196d454941c45d1b3a323f1433bd6"));
    }

    function test_RecoverHash160RejectsBadPoint() public pure {
        (bool ok,) = Secp256k1.recoverHash160(1, TWO_GX, TWO_GY);
        assertFalse(ok);
    }
}
