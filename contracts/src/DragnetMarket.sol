// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Secp256k1} from "./Secp256k1.sol";
import {MerkleProof} from "./MerkleProof.sol";

/// @title DragnetMarket
/// @notice A verifiable exclusion market for secp256k1 keyspace search. A buyer
///         escrows a payout plus an honesty bond and commits a Merkle root over a
///         target list of hash160 addresses. The list mixes the real target(s)
///         with `m` canary addresses whose private keys the buyer secretly drew
///         uniformly from the range [lo, hi]. A worker who scans the range finds
///         the canary keys and, through commit then reveal, proves on-chain that
///         it holds `m` distinct in-range keys mapping to listed addresses. Only a
///         near-complete scan finds every canary, so partial coverage earns zero.
///
/// @dev    Reverts (not returned error values) are the correct atomic-abort
///         mechanism for a contract that moves funds: a failed check must roll the
///         whole call back. Each failure has a distinct custom error so callers can
///         tell them apart (sourceRef: REFERENCE_SECURITY_AUDIT.md, distinct errors).
///         Funds use a pull-payment pattern: settlement credits balances and each
///         party withdraws, so one reverting recipient cannot block another's funds.
contract DragnetMarket {
    using MerkleProof for bytes32[];

    // Upper bound on canary count, to cap the gas of a reveal loop.
    uint32 internal constant MAX_M = 256;
    // Upper bound on each deadline window, to avoid locking escrow for absurd spans.
    uint64 internal constant MAX_WINDOW = 365 days;

    enum Status {
        None, // 0: never posted
        Open, // 1: accepting commits/reveals, or awaiting buyer open
        Paid, // 2: a worker proved coverage and was paid
        Refunded, // 3: unclaimed; buyer opened honestly and reclaimed escrow
        Slashed // 4: buyer failed to open; a committer took the escrow
    }

    struct Bounty {
        address buyer;
        Status status;
        uint32 m; // required distinct canary reveals
        uint64 claimDeadline; // last timestamp a worker may reveal
        uint64 openDeadline; // last timestamp before a committer may slash
        uint256 lo; // inclusive range start
        uint256 hi; // inclusive range end
        bytes32 targetRoot; // Merkle root over keccak256(hash160) leaves
        uint256 payout; // escrow paid to the winning worker
        uint256 bond; // escrow returned to an honest buyer, else slashed
        address winner; // worker paid, or committer who slashed
    }

    struct Commit {
        bytes32 hash; // keccak256(abi.encode(keys, worker, salt))
        uint64 blockNumber; // reveal must land in a strictly later block
    }

    uint256 public bountyCount;
    mapping(uint256 bountyId => Bounty) public bounties;
    mapping(uint256 bountyId => mapping(address worker => Commit)) public commits;
    mapping(address account => uint256 amount) public pendingWithdrawals;

    // Minimal non-reentrancy guard. sourceRef: openzeppelin-contracts ReentrancyGuard.
    uint256 private _lock = 1;

    modifier nonReentrant() {
        if (_lock != 1) revert Reentrancy();
        _lock = 2;
        _;
        _lock = 1;
    }

    event BountyPosted(
        uint256 indexed bountyId,
        address indexed buyer,
        uint256 lo,
        uint256 hi,
        uint32 m,
        bytes32 targetRoot,
        uint256 payout,
        uint256 bond,
        uint64 claimDeadline,
        uint64 openDeadline,
        bytes targetList
    );
    event Committed(uint256 indexed bountyId, address indexed worker);
    event Paid(uint256 indexed bountyId, address indexed worker, uint256 payout);
    event Refunded(uint256 indexed bountyId, address indexed buyer, uint256 amount);
    event Slashed(uint256 indexed bountyId, address indexed committer, uint256 amount);
    event Withdrawn(address indexed account, uint256 amount);

    error RangeInvalid();
    error RangeTooSmall();
    error CountInvalid();
    error RootZero();
    error PayoutZero();
    error BondZero();
    error ValueMismatch();
    error WindowInvalid();
    error UnknownBounty();
    error BountyNotOpen();
    error ClaimWindowClosed();
    error ClaimWindowOpen();
    error OpenWindowOpen();
    error EmptyCommit();
    error NotCommitted();
    error RevealTooSoon();
    error LengthMismatch();
    error CommitMismatch();
    error KeysNotAscending();
    error KeyOutOfRange();
    error BadPublicKey();
    error NotListed();
    error NotBuyer();
    error NothingToWithdraw();
    error WithdrawFailed();
    error Reentrancy();

    /// @notice Post a bounty. Escrows `payout + bond`; `msg.value` must equal it.
    /// @param  lo Inclusive start of the private-key range.
    /// @param  hi Inclusive end of the private-key range.
    /// @param  m Number of distinct canary keys a worker must reveal.
    /// @param  targetRoot Merkle root over keccak256(hash160) leaves of the list.
    /// @param  payout Amount paid to the first worker that proves coverage.
    /// @param  bond Amount returned to the buyer on honest open, else slashable.
    /// @param  claimWindow Seconds workers have to reveal, from now.
    /// @param  openWindow Seconds the buyer has to open, after the claim window.
    /// @param  targetList Concatenated 20-byte hash160 leaves, emitted so workers
    ///         can rebuild the tree. The on-chain root is authoritative; workers
    ///         must verify this list hashes to it before scanning.
    function postBounty(
        uint256 lo,
        uint256 hi,
        uint32 m,
        bytes32 targetRoot,
        uint256 payout,
        uint256 bond,
        uint64 claimWindow,
        uint64 openWindow,
        bytes calldata targetList
    ) external payable returns (uint256 bountyId) {
        // Valid private keys live in [1, N-1]; a range outside that can never be
        // proven, since deriveAddress rejects keys of 0 or >= N. sourceRef:
        // Secp256k1.sol deriveAddress bounds.
        if (lo == 0 || hi <= lo || hi >= Secp256k1.N) revert RangeInvalid();
        if (m == 0 || m > MAX_M) revert CountInvalid();
        // m distinct strictly-ascending keys must fit inside [lo, hi]. The bounds
        // above make hi - lo + 1 safe from overflow. sourceRef: _verifyKeys.
        if (hi - lo + 1 < m) revert RangeTooSmall();
        if (targetRoot == bytes32(0)) revert RootZero();
        if (payout == 0) revert PayoutZero();
        if (bond == 0) revert BondZero();
        if (msg.value != payout + bond) revert ValueMismatch();
        if (claimWindow == 0 || claimWindow > MAX_WINDOW) revert WindowInvalid();
        if (openWindow == 0 || openWindow > MAX_WINDOW) revert WindowInvalid();

        uint64 claimDeadline = uint64(block.timestamp) + claimWindow;
        uint64 openDeadline = claimDeadline + openWindow;

        bountyId = ++bountyCount;
        bounties[bountyId] = Bounty({
            buyer: msg.sender,
            status: Status.Open,
            m: m,
            claimDeadline: claimDeadline,
            openDeadline: openDeadline,
            lo: lo,
            hi: hi,
            targetRoot: targetRoot,
            payout: payout,
            bond: bond,
            winner: address(0)
        });

        emit BountyPosted(
            bountyId, msg.sender, lo, hi, m, targetRoot, payout, bond, claimDeadline, openDeadline, targetList
        );
    }

    /// @notice Commit to a set of found keys. The hash binds the reveal to the
    ///         caller so a mempool observer cannot steal it, and the recorded block
    ///         number forces the reveal into a later block (same-block front-run
    ///         defense). Re-committing before reveal is allowed.
    function commit(uint256 bountyId, bytes32 commitHash) external {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.status == Status.None) revert UnknownBounty();
        if (bounty.status != Status.Open) revert BountyNotOpen();
        if (block.timestamp > bounty.claimDeadline) revert ClaimWindowClosed();
        if (commitHash == bytes32(0)) revert EmptyCommit();

        commits[bountyId][msg.sender] = Commit({hash: commitHash, blockNumber: uint64(block.number)});
        emit Committed(bountyId, msg.sender);
    }

    /// @notice Reveal `m` distinct in-range keys that map to listed addresses. On
    ///         success the caller is paid `payout` and the buyer's `bond` is
    ///         returned; both via pull-payment. The first valid reveal wins.
    /// @param  keys Strictly ascending private keys (ascending guarantees distinct).
    /// @param  px,py The public-key coordinates for each key (px[i], py[i]) = keys[i]*G.
    /// @param  proofs Merkle proof for each key's hash160 leaf against targetRoot.
    /// @param  salt The salt used in the commit.
    function reveal(
        uint256 bountyId,
        uint256[] calldata keys,
        uint256[] calldata px,
        uint256[] calldata py,
        bytes32[][] calldata proofs,
        bytes32 salt
    ) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.status == Status.None) revert UnknownBounty();
        if (bounty.status != Status.Open) revert BountyNotOpen();
        if (block.timestamp > bounty.claimDeadline) revert ClaimWindowClosed();

        Commit storage workerCommit = commits[bountyId][msg.sender];
        if (workerCommit.hash == bytes32(0)) revert NotCommitted();
        if (block.number <= workerCommit.blockNumber) revert RevealTooSoon();

        uint256 count = bounty.m;
        if (
            keys.length != count || px.length != count || py.length != count
                || proofs.length != count
        ) revert LengthMismatch();

        bytes32 expected = keccak256(abi.encode(keys, msg.sender, salt));
        if (expected != workerCommit.hash) revert CommitMismatch();

        _verifyKeys(bounty.lo, bounty.hi, bounty.targetRoot, keys, px, py, proofs);

        // Effects before interaction: mark paid and credit balances.
        bounty.status = Status.Paid;
        bounty.winner = msg.sender;
        pendingWithdrawals[msg.sender] += bounty.payout;
        pendingWithdrawals[bounty.buyer] += bounty.bond;

        emit Paid(bountyId, msg.sender, bounty.payout);
    }

    /// @notice After the claim window, an unclaimed bounty's buyer opens it by
    ///         revealing `m` valid in-range listed keys, proving the canaries were
    ///         findable. On success the buyer reclaims payout + bond. Callable while
    ///         the bounty is still Open (even past openDeadline, as long as no
    ///         committer has slashed it), so an honest buyer with no worker is safe.
    /// @dev    Availability assumption: after openDeadline both this function and
    ///         `slash` are callable, so whichever transaction lands first wins. A
    ///         buyer that plants findable canaries but goes offline past the open
    ///         window can be slashed by a committer. The system assumes the buyer
    ///         stays available to open unclaimed bounties within the open window.
    function openBounty(
        uint256 bountyId,
        uint256[] calldata keys,
        uint256[] calldata px,
        uint256[] calldata py,
        bytes32[][] calldata proofs
    ) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.status == Status.None) revert UnknownBounty();
        if (bounty.status != Status.Open) revert BountyNotOpen();
        if (msg.sender != bounty.buyer) revert NotBuyer();
        if (block.timestamp <= bounty.claimDeadline) revert ClaimWindowOpen();

        uint256 count = bounty.m;
        if (
            keys.length != count || px.length != count || py.length != count
                || proofs.length != count
        ) revert LengthMismatch();

        _verifyKeys(bounty.lo, bounty.hi, bounty.targetRoot, keys, px, py, proofs);

        bounty.status = Status.Refunded;
        uint256 amount = bounty.payout + bounty.bond;
        pendingWithdrawals[bounty.buyer] += amount;

        emit Refunded(bountyId, bounty.buyer, amount);
    }

    /// @notice If the buyer never opens by openDeadline, a worker that committed
    ///         (proving it scanned) takes payout + bond. This is what deters a buyer
    ///         from planting unfindable, out-of-range canaries to get free scanning.
    /// @dev    A commit carries no proof of work, so this is a liveness race with
    ///         the buyer's `openBounty` after openDeadline (see openBounty dev note),
    ///         not a proof the canaries were unfindable. The honest buyer defends by
    ///         opening in time; a rational worker with full coverage reveals during
    ///         the claim window for the guaranteed payout rather than gambling here.
    function slash(uint256 bountyId) external nonReentrant {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.status == Status.None) revert UnknownBounty();
        if (bounty.status != Status.Open) revert BountyNotOpen();
        if (block.timestamp <= bounty.openDeadline) revert OpenWindowOpen();
        if (commits[bountyId][msg.sender].hash == bytes32(0)) revert NotCommitted();

        bounty.status = Status.Slashed;
        bounty.winner = msg.sender;
        uint256 amount = bounty.payout + bounty.bond;
        pendingWithdrawals[msg.sender] += amount;

        emit Slashed(bountyId, msg.sender, amount);
    }

    /// @notice Withdraw all credited funds. Pull-payment: effect (zeroing the
    ///         balance) precedes the interaction, and the guard blocks reentry.
    function withdraw() external nonReentrant {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        (bool sent,) = msg.sender.call{value: amount}("");
        if (!sent) revert WithdrawFailed();
        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Read a bounty struct.
    function getBounty(uint256 bountyId) external view returns (Bounty memory) {
        return bounties[bountyId];
    }

    /// @dev Verifies that `keys` are strictly ascending, each in [lo, hi], each a
    ///      valid public key (px, py), and each hash160 present in `targetRoot`.
    ///      Reverts with a distinct error on the first failure.
    function _verifyKeys(
        uint256 lo,
        uint256 hi,
        bytes32 targetRoot,
        uint256[] calldata keys,
        uint256[] calldata px,
        uint256[] calldata py,
        bytes32[][] calldata proofs
    ) private pure {
        uint256 previous = 0;
        uint256 length = keys.length;
        for (uint256 index = 0; index < length; index++) {
            uint256 key = keys[index];
            if (index != 0 && key <= previous) revert KeysNotAscending();
            previous = key;
            if (key < lo || key > hi) revert KeyOutOfRange();

            (bool ok, bytes20 h160) = Secp256k1.recoverHash160(key, px[index], py[index]);
            if (!ok) revert BadPublicKey();

            bytes32 leaf = keccak256(abi.encodePacked(h160));
            if (!proofs[index].verify(targetRoot, leaf)) revert NotListed();
        }
    }
}
