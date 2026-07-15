// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title Secp256k1
/// @notice On-chain verification that a revealed private key maps to a listed
///         Bitcoin-style address (hash160 of the compressed public key), with no
///         zero-knowledge proof. The EVM cannot multiply a scalar by the curve
///         generator natively, so we recover `privKey * G` through the ecrecover
///         precompile (the "ecrecover ecmul" trick), bind the caller-supplied
///         point to that result, then hash it with the sha256 and ripemd160
///         precompiles exactly as Bitcoin does.
/// @dev    All functions are pure: they read no state and call only the
///         stateless precompiles ecrecover (0x01), sha256 (0x02), ripemd160 (0x03).
library Secp256k1 {
    // secp256k1 domain parameters. sourceRef: SEC 2 v2, section 2.4.1.
    // Order of the base point G.
    uint256 internal constant N =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
    // Field prime.
    uint256 internal constant P =
        0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F;
    // x-coordinate of the generator G.
    uint256 internal constant GX =
        0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798;
    // y-coordinate of the generator G. Its parity is even, so R = G is recovered
    // with v = 27 (v = 28 would select the odd-y point).
    uint256 internal constant GY =
        0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8;
    // Curve constant b in y^2 = x^3 + b (a = 0 for secp256k1).
    uint256 internal constant B = 7;

    /// @notice Ethereum-style address of the point `privKey * G`.
    /// @dev    ecrecover(0, 27, r, s) returns address( r^-1 * (s*R - 0) ) where R
    ///         is the point with x-coordinate r. With r = GX (so R = G) and
    ///         s = privKey * GX (mod N), the argument reduces to privKey * G, so
    ///         the precompile returns keccak256(P.x || P.y)[12:] for P = privKey*G.
    ///         Returns address(0) for out-of-range keys, which callers must reject.
    function deriveAddress(uint256 privKey) internal pure returns (address) {
        if (privKey == 0 || privKey >= N) {
            return address(0);
        }
        uint256 s = mulmod(privKey, GX, N);
        if (s == 0) {
            return address(0);
        }
        return ecrecover(bytes32(0), 27, bytes32(GX), bytes32(s));
    }

    /// @notice True iff (px, py) lies on secp256k1.
    function isOnCurve(uint256 px, uint256 py) internal pure returns (bool) {
        if (px >= P || py >= P || (px == 0 && py == 0)) {
            return false;
        }
        uint256 lhs = mulmod(py, py, P);
        uint256 rhs = addmod(mulmod(mulmod(px, px, P), px, P), B, P);
        return lhs == rhs;
    }

    /// @notice True iff (px, py) equals `privKey * G`.
    /// @dev    Binds the caller-supplied point to the ecrecover result. A point
    ///         that is not privKey*G could pass only by producing a 160-bit
    ///         keccak collision with the true address, which is infeasible.
    function isPubKeyOf(uint256 privKey, uint256 px, uint256 py) internal pure returns (bool) {
        address derived = deriveAddress(privKey);
        if (derived == address(0)) {
            return false;
        }
        address fromPoint = address(uint160(uint256(keccak256(abi.encodePacked(px, py)))));
        return derived == fromPoint;
    }

    /// @notice Bitcoin hash160 of the compressed public key for point (px, py):
    ///         RIPEMD160(SHA256(0x02|0x03 || px)). Does not check the point; callers
    ///         must have verified it with isPubKeyOf first.
    function hash160Compressed(uint256 px, uint256 py) internal pure returns (bytes20) {
        bytes1 prefix = (py & 1 == 0) ? bytes1(0x02) : bytes1(0x03);
        bytes32 sha = sha256(abi.encodePacked(prefix, bytes32(px)));
        return ripemd160(abi.encodePacked(sha));
    }

    /// @notice Full check: (px, py) is on-curve and equals privKey*G; if so returns
    ///         its hash160. `ok` is false when any check fails, and callers must not
    ///         use `h160` in that case.
    function recoverHash160(uint256 privKey, uint256 px, uint256 py)
        internal
        pure
        returns (bool ok, bytes20 h160)
    {
        if (!isOnCurve(px, py)) {
            return (false, bytes20(0));
        }
        if (!isPubKeyOf(privKey, px, py)) {
            return (false, bytes20(0));
        }
        return (true, hash160Compressed(px, py));
    }
}
