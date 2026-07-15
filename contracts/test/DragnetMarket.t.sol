// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {DragnetMarket} from "../src/DragnetMarket.sol";
import {Secp256k1} from "../src/Secp256k1.sol";

/// @notice Full lifecycle and adversarial tests for the market. Fixtures use
///         private keys 1 and 2, whose public-key points are known, so hash160
///         leaves and the Merkle tree are built at test time with no external data.
contract DragnetMarketTest is Test {
    DragnetMarket internal market;

    // Generator G (= 1*G) and 2*G. sourceRef: Secp256k1.t.sol, cross-checked there.
    uint256 internal constant GX =
        0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798;
    uint256 internal constant GY =
        0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8;
    uint256 internal constant TWO_GX =
        0xC6047F9441ED7D6D3045406E95C07CD85C778E4B8CEF3CA7ABAC09B95C709EE5;
    uint256 internal constant TWO_GY =
        0x1AE168FEA63DC339A3C58419466CEAEEF7F632653266D0E1236431A950CFE52A;

    uint256 internal constant PAYOUT = 5 ether;
    uint256 internal constant BOND = 3 ether;
    uint64 internal constant CLAIM_WINDOW = 1 hours;
    uint64 internal constant OPEN_WINDOW = 1 hours;
    uint256 internal constant LO = 1;
    uint256 internal constant HI = 1_000_000;
    bytes32 internal constant SALT = keccak256("worker-salt");

    address internal buyer = makeAddr("buyer");
    address internal workerA = makeAddr("workerA");
    address internal workerB = makeAddr("workerB");

    // Two-canary Merkle fixture (keys 1 and 2).
    bytes32 internal leaf1;
    bytes32 internal leaf2;
    bytes32 internal root2;

    function setUp() public {
        market = new DragnetMarket();
        vm.deal(buyer, 100 ether);

        leaf1 = keccak256(abi.encodePacked(Secp256k1.hash160Compressed(GX, GY)));
        leaf2 = keccak256(abi.encodePacked(Secp256k1.hash160Compressed(TWO_GX, TWO_GY)));
        root2 = leaf1 <= leaf2
            ? keccak256(abi.encodePacked(leaf1, leaf2))
            : keccak256(abi.encodePacked(leaf2, leaf1));
    }

    // --- helpers ---

    function _postTwoCanaryBounty() internal returns (uint256 bountyId) {
        bytes memory list = abi.encodePacked(
            Secp256k1.hash160Compressed(GX, GY), Secp256k1.hash160Compressed(TWO_GX, TWO_GY)
        );
        vm.prank(buyer);
        bountyId = market.postBounty{value: PAYOUT + BOND}(
            LO, HI, 2, root2, PAYOUT, BOND, CLAIM_WINDOW, OPEN_WINDOW, list
        );
    }

    /// @dev The two revealed keys, in ascending order (1 then 2), with matching
    ///      points and Merkle proofs.
    function _twoKeyReveal()
        internal
        view
        returns (
            uint256[] memory keys,
            uint256[] memory px,
            uint256[] memory py,
            bytes32[][] memory proofs
        )
    {
        keys = new uint256[](2);
        keys[0] = 1;
        keys[1] = 2;
        px = new uint256[](2);
        px[0] = GX;
        px[1] = TWO_GX;
        py = new uint256[](2);
        py[0] = GY;
        py[1] = TWO_GY;
        proofs = new bytes32[][](2);
        proofs[0] = new bytes32[](1);
        proofs[0][0] = leaf2; // sibling of leaf1
        proofs[1] = new bytes32[](1);
        proofs[1][0] = leaf1; // sibling of leaf2
    }

    function _commitHash(uint256[] memory keys, address worker) internal pure returns (bytes32) {
        return keccak256(abi.encode(keys, worker, SALT));
    }

    // --- posting ---

    function test_PostBountyStoresAndEscrows() public {
        uint256 id = _postTwoCanaryBounty();
        DragnetMarket.Bounty memory bounty = market.getBounty(id);
        assertEq(bounty.buyer, buyer);
        assertEq(uint8(bounty.status), uint8(DragnetMarket.Status.Open));
        assertEq(bounty.m, 2);
        assertEq(bounty.payout, PAYOUT);
        assertEq(bounty.bond, BOND);
        assertEq(address(market).balance, PAYOUT + BOND);
    }

    function test_PostRevertsOnValueMismatch() public {
        vm.prank(buyer);
        vm.expectRevert(DragnetMarket.ValueMismatch.selector);
        market.postBounty{value: PAYOUT}(LO, HI, 2, root2, PAYOUT, BOND, CLAIM_WINDOW, OPEN_WINDOW, "");
    }

    function test_PostRevertsOnBadRange() public {
        vm.prank(buyer);
        vm.expectRevert(DragnetMarket.RangeInvalid.selector);
        market.postBounty{value: PAYOUT + BOND}(HI, LO, 2, root2, PAYOUT, BOND, CLAIM_WINDOW, OPEN_WINDOW, "");
    }

    function test_PostRevertsOnZeroCount() public {
        vm.prank(buyer);
        vm.expectRevert(DragnetMarket.CountInvalid.selector);
        market.postBounty{value: PAYOUT + BOND}(LO, HI, 0, root2, PAYOUT, BOND, CLAIM_WINDOW, OPEN_WINDOW, "");
    }

    function test_PostRevertsOnZeroLo() public {
        // lo == 0 would let a canary be key 0, whose derived address is address(0).
        vm.prank(buyer);
        vm.expectRevert(DragnetMarket.RangeInvalid.selector);
        market.postBounty{value: PAYOUT + BOND}(0, HI, 2, root2, PAYOUT, BOND, CLAIM_WINDOW, OPEN_WINDOW, "");
    }

    function test_PostRevertsWhenHiAtOrAboveGroupOrder() public {
        // hi >= N admits keys that are not valid private keys.
        vm.prank(buyer);
        vm.expectRevert(DragnetMarket.RangeInvalid.selector);
        market.postBounty{value: PAYOUT + BOND}(1, Secp256k1.N, 2, root2, PAYOUT, BOND, CLAIM_WINDOW, OPEN_WINDOW, "");
    }

    function test_PostAcceptsHiAtGroupOrderMinusOne() public {
        // The largest valid range end is N - 1.
        vm.prank(buyer);
        uint256 id = market.postBounty{value: PAYOUT + BOND}(
            1, Secp256k1.N - 1, 2, root2, PAYOUT, BOND, CLAIM_WINDOW, OPEN_WINDOW, ""
        );
        assertEq(uint8(market.getBounty(id).status), uint8(DragnetMarket.Status.Open));
    }

    function test_PostRevertsWhenRangeTooSmallForCount() public {
        // [1, 3] holds 3 integers but m = 5 asks for 5 distinct keys.
        vm.prank(buyer);
        vm.expectRevert(DragnetMarket.RangeTooSmall.selector);
        market.postBounty{value: PAYOUT + BOND}(1, 3, 5, root2, PAYOUT, BOND, CLAIM_WINDOW, OPEN_WINDOW, "");
    }

    // --- happy path ---

    function test_HonestWorkerProvesCoverageAndIsPaid() public {
        uint256 id = _postTwoCanaryBounty();
        (uint256[] memory keys, uint256[] memory px, uint256[] memory py, bytes32[][] memory proofs) =
            _twoKeyReveal();

        vm.prank(workerA);
        market.commit(id, _commitHash(keys, workerA));

        vm.roll(block.number + 1); // reveal must be a later block than the commit
        vm.prank(workerA);
        market.reveal(id, keys, px, py, proofs, SALT);

        DragnetMarket.Bounty memory bounty = market.getBounty(id);
        assertEq(uint8(bounty.status), uint8(DragnetMarket.Status.Paid));
        assertEq(bounty.winner, workerA);
        assertEq(market.pendingWithdrawals(workerA), PAYOUT);
        assertEq(market.pendingWithdrawals(buyer), BOND); // honest buyer gets bond back

        uint256 before = workerA.balance;
        vm.prank(workerA);
        market.withdraw();
        assertEq(workerA.balance - before, PAYOUT);
        assertEq(market.pendingWithdrawals(workerA), 0);
    }

    // --- the showcase: a cheat that skipped part of the range earns zero ---

    function test_CheatWithMissingCanaryEarnsZero() public {
        uint256 id = _postTwoCanaryBounty();

        // The cheat scanned ~90% and found only key 1 (key 2 was in the skipped slice).
        uint256[] memory keys = new uint256[](1);
        keys[0] = 1;
        uint256[] memory px = new uint256[](1);
        px[0] = GX;
        uint256[] memory py = new uint256[](1);
        py[0] = GY;
        bytes32[][] memory proofs = new bytes32[][](1);
        proofs[0] = new bytes32[](1);
        proofs[0][0] = leaf2;

        vm.prank(workerB);
        market.commit(id, _commitHash(keys, workerB));
        vm.roll(block.number + 1);

        // m is 2 but only 1 key is supplied: the reveal cannot even be formed.
        vm.prank(workerB);
        vm.expectRevert(DragnetMarket.LengthMismatch.selector);
        market.reveal(id, keys, px, py, proofs, SALT);

        assertEq(market.pendingWithdrawals(workerB), 0);
    }

    function test_CheatPaddingWithFakeKeyEarnsZero() public {
        uint256 id = _postTwoCanaryBounty();

        // The cheat pads the missing canary with a made-up key/point.
        uint256[] memory keys = new uint256[](2);
        keys[0] = 1;
        keys[1] = 2;
        uint256[] memory px = new uint256[](2);
        px[0] = GX;
        px[1] = 12345; // not a real point
        uint256[] memory py = new uint256[](2);
        py[0] = GY;
        py[1] = 67890;
        (,, , bytes32[][] memory proofs) = _twoKeyReveal();

        vm.prank(workerB);
        market.commit(id, _commitHash(keys, workerB));
        vm.roll(block.number + 1);

        vm.prank(workerB);
        vm.expectRevert(DragnetMarket.BadPublicKey.selector);
        market.reveal(id, keys, px, py, proofs, SALT);

        assertEq(market.pendingWithdrawals(workerB), 0);
    }

    function test_CheatWithValidPointForWrongKeyEarnsZero() public {
        uint256 id = _postTwoCanaryBounty();

        // The second point is G (a real on-curve point) but paired with key 2, so it
        // is not key 2's public key. This exercises the isPubKeyOf binding rather
        // than the off-curve check that test_CheatPaddingWithFakeKeyEarnsZero hits.
        uint256[] memory keys = new uint256[](2);
        keys[0] = 1;
        keys[1] = 2;
        uint256[] memory px = new uint256[](2);
        px[0] = GX;
        px[1] = GX; // 1*G, not 2*G
        uint256[] memory py = new uint256[](2);
        py[0] = GY;
        py[1] = GY;
        (,,, bytes32[][] memory proofs) = _twoKeyReveal();

        vm.prank(workerB);
        market.commit(id, _commitHash(keys, workerB));
        vm.roll(block.number + 1);

        vm.prank(workerB);
        vm.expectRevert(DragnetMarket.BadPublicKey.selector);
        market.reveal(id, keys, px, py, proofs, SALT);

        assertEq(market.pendingWithdrawals(workerB), 0);
    }

    // --- commit-reveal integrity ---

    function test_RevealRevertsWithoutCommit() public {
        uint256 id = _postTwoCanaryBounty();
        (uint256[] memory keys, uint256[] memory px, uint256[] memory py, bytes32[][] memory proofs) =
            _twoKeyReveal();
        vm.roll(block.number + 1);
        vm.prank(workerA);
        vm.expectRevert(DragnetMarket.NotCommitted.selector);
        market.reveal(id, keys, px, py, proofs, SALT);
    }

    function test_RevealRevertsInSameBlockAsCommit() public {
        uint256 id = _postTwoCanaryBounty();
        (uint256[] memory keys, uint256[] memory px, uint256[] memory py, bytes32[][] memory proofs) =
            _twoKeyReveal();
        vm.prank(workerA);
        market.commit(id, _commitHash(keys, workerA));
        // No vm.roll: same block as the commit.
        vm.prank(workerA);
        vm.expectRevert(DragnetMarket.RevealTooSoon.selector);
        market.reveal(id, keys, px, py, proofs, SALT);
    }

    function test_FrontRunnerCannotStealReveal() public {
        uint256 id = _postTwoCanaryBounty();
        (uint256[] memory keys, uint256[] memory px, uint256[] memory py, bytes32[][] memory proofs) =
            _twoKeyReveal();

        // workerA commits their claim.
        vm.prank(workerA);
        market.commit(id, _commitHash(keys, workerA));

        // workerB sees the keys in the mempool and commits them under B in the next
        // block, but B's commit lands no earlier than the reveal it is copying, and
        // the reveal is bound to A's address anyway. B tries to reveal same block as
        // their own commit: blocked by the later-block rule.
        vm.roll(block.number + 1);
        vm.prank(workerB);
        market.commit(id, _commitHash(keys, workerB));
        vm.prank(workerB);
        vm.expectRevert(DragnetMarket.RevealTooSoon.selector);
        market.reveal(id, keys, px, py, proofs, SALT);

        // A reveals normally and is paid.
        vm.prank(workerA);
        market.reveal(id, keys, px, py, proofs, SALT);
        assertEq(market.getBounty(id).winner, workerA);
    }

    function test_SecondRevealRevertsAfterPaid() public {
        uint256 id = _postTwoCanaryBounty();
        (uint256[] memory keys, uint256[] memory px, uint256[] memory py, bytes32[][] memory proofs) =
            _twoKeyReveal();

        vm.prank(workerA);
        market.commit(id, _commitHash(keys, workerA));
        vm.prank(workerB);
        market.commit(id, _commitHash(keys, workerB));
        vm.roll(block.number + 1);

        vm.prank(workerA);
        market.reveal(id, keys, px, py, proofs, SALT);

        vm.prank(workerB);
        vm.expectRevert(DragnetMarket.BountyNotOpen.selector);
        market.reveal(id, keys, px, py, proofs, SALT);
    }

    function test_RevealRevertsAfterClaimDeadline() public {
        uint256 id = _postTwoCanaryBounty();
        (uint256[] memory keys, uint256[] memory px, uint256[] memory py, bytes32[][] memory proofs) =
            _twoKeyReveal();
        vm.prank(workerA);
        market.commit(id, _commitHash(keys, workerA));
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + CLAIM_WINDOW + 1);
        vm.prank(workerA);
        vm.expectRevert(DragnetMarket.ClaimWindowClosed.selector);
        market.reveal(id, keys, px, py, proofs, SALT);
    }

    // --- buyer open / refund ---

    function test_BuyerOpensUnclaimedBountyAndReclaims() public {
        uint256 id = _postTwoCanaryBounty();
        (uint256[] memory keys, uint256[] memory px, uint256[] memory py, bytes32[][] memory proofs) =
            _twoKeyReveal();

        vm.warp(block.timestamp + CLAIM_WINDOW + 1); // claim window elapsed
        vm.prank(buyer);
        market.openBounty(id, keys, px, py, proofs);

        DragnetMarket.Bounty memory bounty = market.getBounty(id);
        assertEq(uint8(bounty.status), uint8(DragnetMarket.Status.Refunded));
        assertEq(market.pendingWithdrawals(buyer), PAYOUT + BOND);
    }

    function test_OpenRevertsBeforeClaimDeadline() public {
        uint256 id = _postTwoCanaryBounty();
        (uint256[] memory keys, uint256[] memory px, uint256[] memory py, bytes32[][] memory proofs) =
            _twoKeyReveal();
        vm.prank(buyer);
        vm.expectRevert(DragnetMarket.ClaimWindowOpen.selector);
        market.openBounty(id, keys, px, py, proofs);
    }

    function test_OpenRevertsForNonBuyer() public {
        uint256 id = _postTwoCanaryBounty();
        (uint256[] memory keys, uint256[] memory px, uint256[] memory py, bytes32[][] memory proofs) =
            _twoKeyReveal();
        vm.warp(block.timestamp + CLAIM_WINDOW + 1);
        vm.prank(workerA);
        vm.expectRevert(DragnetMarket.NotBuyer.selector);
        market.openBounty(id, keys, px, py, proofs);
    }

    // --- slash a dishonest buyer ---

    function test_CommitterSlashesBuyerWhoNeverOpens() public {
        // Buyer posts but (say) planted an unfindable canary, so no worker can
        // reveal and the buyer cannot open. A committer slashes after openDeadline.
        uint256 id = _postTwoCanaryBounty();

        uint256[] memory keys = new uint256[](2);
        keys[0] = 1;
        keys[1] = 2;
        vm.prank(workerA);
        market.commit(id, _commitHash(keys, workerA));

        vm.warp(block.timestamp + CLAIM_WINDOW + OPEN_WINDOW + 1); // both windows elapsed
        vm.prank(workerA);
        market.slash(id);

        DragnetMarket.Bounty memory bounty = market.getBounty(id);
        assertEq(uint8(bounty.status), uint8(DragnetMarket.Status.Slashed));
        assertEq(market.pendingWithdrawals(workerA), PAYOUT + BOND);
    }

    function test_SlashRevertsBeforeOpenDeadline() public {
        uint256 id = _postTwoCanaryBounty();
        uint256[] memory keys = new uint256[](2);
        keys[0] = 1;
        keys[1] = 2;
        vm.prank(workerA);
        market.commit(id, _commitHash(keys, workerA));
        vm.warp(block.timestamp + CLAIM_WINDOW + 1); // open window still open
        vm.prank(workerA);
        vm.expectRevert(DragnetMarket.OpenWindowOpen.selector);
        market.slash(id);
    }

    function test_SlashRevertsForNonCommitter() public {
        uint256 id = _postTwoCanaryBounty();
        vm.warp(block.timestamp + CLAIM_WINDOW + OPEN_WINDOW + 1);
        vm.prank(workerB); // never committed
        vm.expectRevert(DragnetMarket.NotCommitted.selector);
        market.slash(id);
    }

    // --- withdraw ---

    function test_WithdrawRevertsWhenNothingOwed() public {
        vm.prank(workerA);
        vm.expectRevert(DragnetMarket.NothingToWithdraw.selector);
        market.withdraw();
    }

    // --- escrow conservation across every terminal state ---

    /// @dev The contract's balance must always equal the escrow still held by Open
    ///      bounties plus everything credited but not yet withdrawn. This drives one
    ///      bounty through each terminal path (reveal, open, slash) and checks that
    ///      no wei is created or destroyed, then that withdrawals drain it to zero.
    function test_EscrowIsConservedThroughRevealOpenAndSlash() public {
        (uint256[] memory keys, uint256[] memory px, uint256[] memory py, bytes32[][] memory proofs) =
            _twoKeyReveal();

        uint256 paidBounty = _postTwoCanaryBounty();
        uint256 openedBounty = _postTwoCanaryBounty();
        uint256 slashedBounty = _postTwoCanaryBounty();

        uint256 totalEscrow = 3 * (PAYOUT + BOND);
        // Nothing settled yet: the whole balance is Open-bounty escrow.
        assertEq(address(market).balance, totalEscrow);
        assertEq(market.pendingWithdrawals(buyer), 0);

        // Path 1: an honest worker reveals within the claim window.
        vm.prank(workerA);
        market.commit(paidBounty, _commitHash(keys, workerA));
        // Path 3 precondition: the slasher must commit before the claim deadline.
        vm.prank(workerB);
        market.commit(slashedBounty, _commitHash(keys, workerB));
        vm.roll(block.number + 1);
        vm.prank(workerA);
        market.reveal(paidBounty, keys, px, py, proofs, SALT);

        // Path 2 and 3 happen after both windows elapse.
        vm.warp(block.timestamp + CLAIM_WINDOW + OPEN_WINDOW + 1);
        vm.prank(buyer);
        market.openBounty(openedBounty, keys, px, py, proofs);
        vm.prank(workerB);
        market.slash(slashedBounty);

        // Every bounty is now terminal, so the balance is entirely credited funds.
        uint256 totalCredited = market.pendingWithdrawals(workerA)
            + market.pendingWithdrawals(workerB) + market.pendingWithdrawals(buyer);
        assertEq(totalCredited, totalEscrow);
        assertEq(address(market).balance, totalCredited);

        // Withdrawals drain the contract to exactly zero.
        vm.prank(workerA);
        market.withdraw();
        vm.prank(workerB);
        market.withdraw();
        vm.prank(buyer);
        market.withdraw();
        assertEq(address(market).balance, 0);
    }
}
