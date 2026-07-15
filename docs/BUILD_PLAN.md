# Dragnet build plan

A verifiable exclusion market for secp256k1 keyspace search. Buyers pay for
proof that a key range was exhaustively scanned. Workers cannot fake coverage,
and they cannot get paid for a partial scan.

Target: Spark BuildAnything hackathon (Monad). Deadline Jul 19, 2026, 23:59 UTC.
This plan is dated Jul 15, 2026, so the working window is about 4.5 days.

> Shipped-design note. This is the original plan. The implementation simplified
> the canary commitment: coverage is proven by revealing `m` distinct in-range
> keys whose hash160 is in the committed target root, with no separate canary
> root (only findable keys are the canaries, so the count plus the target root
> is sufficient, and the buyer's post-scan open plus bond covers buyer honesty).
> The contracts and `README.md` are the authoritative description of what runs.

---

## 1. One-paragraph statement

Existing keyspace-search pools are pure trust. A worker claims it scanned a
range and the operator claims it stores any found key safely, but nobody can
verify either claim. Dragnet replaces trust with a game: the buyer seeds the
target list with `m` secret canary keys drawn uniformly from the range. A worker
cannot tell a canary from the real target, and cannot find a canary without
actually computing the keys in that part of the range. To get paid, the worker
reveals all `m` canary private keys through a commit-reveal, and the contract
verifies on-chain that each one maps to a listed address. Miss one canary and
the payout is zero. Skipping 10 percent of the range probabilistically costs a
canary, so the only profitable strategy is a full honest scan. No zero-knowledge
proofs, just secp256k1 and game theory.

## 2. What it proves, and what it does not (honest threat model)

Say this out loud in the pitch and the README, because judges reward honesty and
punish overclaiming.

- Dragnet proves **coverage**: that a range was exhaustively searched and that
  the reported "found" set is complete for the canaries. It kills coverage
  fraud, the thing every pool is lying about today.
- Dragnet does **not** solve **finder-absconds** for a cross-chain prize. If a
  worker finds the real Bitcoin puzzle key, nothing on Monad can force them to
  surrender a key that unlocks value on Bitcoin. They can walk away with the BTC.
- The two concerns are decoupled by design. Coverage is proven by revealing
  canaries (which the buyer already knows), never by revealing the real target
  key. So coverage is provable even when a finder might abscond on the real key.
- For a **Monad-native** bounty, where the prize itself sits in the contract and
  is released by the same commit-reveal, the split is enforced on-chain and the
  abscond problem goes away. That is the honest boundary of the guarantee.

## 3. Why this fits the hackathon

| Judging signal (from HACKATHON.md) | How Dragnet answers it |
|---|---|
| Practical impact beats fancy tech | It is the tool a puzzle-71 buyer needs to stop paying for unverifiable coverage. Real dollars, real fraud. |
| One real feature, clicked twice | The core loop (post bounty, scan, commit, reveal, auto-pay or auto-reject) is live on Monad, not a toast. |
| No AI slop, unique identity, fits viewport | A focused dashboard: bounty board, live coverage meter, worker reveal log. One screen, one job. |
| Started during the window | Fresh repo, first commit inside the window, commit history shows the build. |
| Monad contract address required | `DragnetMarket` deployed and verified on Monad testnet (mainnet is a config swap). |
| Most viral prize | The demo is inherently shareable: a cheat script that provably earns zero on camera. Build-in-public thread. |

## 4. Protocol design

### 4.1 Actors

- **Buyer.** Wants a range scanned. Generates canaries, posts the bounty,
  escrows payout plus bond.
- **Worker.** Scans the range, finds canary keys, proves coverage, gets paid.
- **Contract (`DragnetMarket`).** Holds escrow, verifies reveals, settles.

### 4.2 The cryptographic core: verify a private key on-chain with no ZK

The contract must check, for a revealed scalar `k`, that `hash160(pubkey(k))` is
in the committed target list. The hard part is deriving the public key
`P = k * G` on-chain, since EVM has no secp256k1 scalar-multiply. We use the
ecrecover trick.

`ecrecover(z, v, r, s)` internally returns `address( r^-1 * (s*R - z*G) )` where
`R` is the curve point whose x-coordinate is `r`. Set `R = G` (so `r = Gx`,
`v = 27` because `G.y` is even), and `z = 0`. Then the recovered value is
`address( Gx^-1 * s * G )`. Choosing `s = mulmod(k, Gx, n)` makes that exactly
`address(k * G)`. So:

```
ecrecover(0, 27, Gx, mulmod(k, Gx, n))  ==  address(k * G)  ==  keccak256(P.x || P.y)[12:]
```

secp256k1 constants (sourceRef: SEC2 / secp256k1 spec, do not retype from
memory in code, import from a constants file and cite there):

```
n  = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
Gx = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
Gy = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B4489A6855419C47D08FFB10D4B8  (even -> v = 27)
p  = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
```

The recovered value is only a 20-byte keccak address, not the raw point, and we
need the point to compute a Bitcoin hash160. So the worker also supplies the
claimed `(Px, Py)`, and the contract binds them:

```solidity
// Verify supplied point is really k*G. A forged (Px,Py) needs a 160-bit
// keccak collision with the true address, which is infeasible.
address derived = ecrecover(0, 27, bytes32(GX), bytes32(mulmod(k, GX, N)));
require(address(uint160(uint256(keccak256(abi.encodePacked(Px, Py))))) == derived, "bad point");

// Optional hardening: on-curve check y^2 == x^3 + 7 (mod p).

// Compressed pubkey -> hash160 using EVM precompiles sha256 (0x02) and ripemd160 (0x03).
bytes1 prefix = (Py & 1 == 0) ? bytes1(0x02) : bytes1(0x03);
bytes20 h160 = ripemd160(abi.encodePacked(sha256(abi.encodePacked(prefix, Px))));

// Membership in the committed target list.
require(verifyMerkle(targetRoot, leaf(h160), proof), "not listed");
```

This is a handful of precompile calls per key: cheap, deterministic, no ZK
circuit, no trusted setup. That is the whole point of the pitch.

Verification task before relying on this: deploy a one-function probe to Monad
testnet that runs `ecrecover`, `sha256`, and `ripemd160` on a known key and
checks the outputs, to confirm Monad enables precompiles 0x01 to 0x03. (EVM
equivalence says yes, but we verify, per the no-hardcode-from-memory rule.)

### 4.3 Lifecycle (state machine per bounty)

```
Open --(worker commit)--> Committed --(worker reveal all m)--> Settled/Paid
  \                                                                  
   \--(claim window elapses, no full reveal)--> Expired
        Expired --(buyer opens canaries, all in-range & listed)--> Refunded
        Expired --(buyer opens, any canary out-of-range/unlisted)--> Slashed
        Expired --(buyer never opens by final timeout)--> Slashable by a committer
```

**Post (buyer).**
- Choose range `[lo, hi]`, canary count `m`, payout `P`, bond `B`.
- Generate `m` canary private keys uniform in `[lo, hi]`, compute their
  addresses `a_i = hash160(pubkey(c_i))`.
- Target list `L = shuffle({a_1..a_m} + {realTarget})`. Commit Merkle root
  `targetRoot`.
- Commit a canary-set root `canaryRoot = merkle({ keccak256(c_i) })`. This binds
  the buyer to specific canary keys without revealing them, and lets the reveal
  step count canaries specifically (the real target is deliberately not in
  `canaryRoot`).
- Escrow `P + B`. Publish `lo, hi, m, targetRoot, canaryRoot, P, B, deadlines`.

**Commit (worker).**
- Scan `[lo, hi]`, collect the private keys whose address is in `L` (in practice
  exactly the canaries, since the real target is not findable at puzzle scale).
- Post `commitHash = keccak256(sortedKeys, workerAddr, salt)`. This binds the
  claim to `workerAddr` so a mempool watcher cannot steal the reveal.

**Reveal (worker).**
- Reveal the keys, points, and Merkle proofs.
- Per key the contract checks: `lo <= k <= hi`, `keccak256(k)` is in
  `canaryRoot`, and `hash160(pubkey(k))` is in `targetRoot` (via the 4.2
  procedure). Keys must be distinct.
- If the worker proves all `m` distinct canaries: coverage proven, pay `P` to the
  worker, return `B` to the buyer, mark Settled. First valid full reveal wins.

**Expire and open (buyer).**
- If the claim window closes with no full reveal, the buyer may open all `m`
  canaries. The contract checks each is in range and listed and matches
  `canaryRoot`.
  - All valid: the bounty was honest, just unclaimed. Refund `P + B` to buyer.
  - Any invalid (out-of-range or unlisted canary): buyer planted unfindable
    canaries to get free scanning. Slash `B` (and optionally `P`) to a worker who
    committed, or to a treasury.
- Ordering matters: the open phase is strictly after the worker claim window, so
  opening never leaks canaries to an unpaid worker.
- If the buyer never opens by a final timeout, any address that made a commit can
  trigger the slash, so a buyer cannot grief by locking funds.

### 4.4 Why each cheat fails

| Attack | Defense |
|---|---|
| Worker skips part of the range | Uniform canaries: skip fraction `1-f`, miss each canary with prob `1-f`, need all `m`, so P(paid) = `f^m`. Tuned `m` makes skipping worthless. |
| Worker brute-forces a canary from its address | hash160 preimage resistance plus a uniform key in a 2^69-plus range equals solving the puzzle. Infeasible. |
| Worker steals another worker's reveal from the mempool | Commit binds the claim to `workerAddr`; the reveal only pays the committer. |
| Worker reveals the real target instead of canaries | Real target is not in `canaryRoot`, so it does not count toward `m`. |
| Buyer plants canaries out of range so nobody can ever finish | Bond plus post-scan opening: unopenable or out-of-range canaries slash the bond to a worker. |
| Buyer clusters canaries so workers can skip the rest | Against the buyer's own interest: clustering lets workers skip and still get paid, giving the buyer less coverage. Self-enforcing uniformity. |
| Buyer learns worker secrets from the reveal | Workers only reveal canary keys, which the buyer already knows. Nothing leaks. |

## 5. Game theory and parameter tuning

Honest full scan means `f = 1`, which finds every canary with certainty, so an
honest worker is always paid. The probabilistic penalty falls only on cheaters.

P(paid) = `f^m`, which also equals the expected payout fraction for an
all-or-nothing bounty.

| coverage f | m = 10 | m = 20 | m = 50 |
|---|---|---|---|
| 0.99 | 0.904 | 0.818 | 0.605 |
| 0.95 | 0.599 | 0.358 | 0.077 |
| 0.90 | 0.349 | 0.122 | 0.0052 |
| 0.80 | 0.107 | 0.0115 | 0.000014 |

Reading it: at `m = 50`, skipping 10 percent pays out about 0.5 percent of the
time, and skipping 20 percent is about 1 in 70,000. The buyer pays for `m`
canary generations up front and the worker pays gas to reveal `m` keys, so `m`
trades security against gas. Recommended default `m = 50` for a real bounty, and
a smaller `m` for the tiny demo range so the reveal is snappy.

## 6. Architecture and repository layout

Bun workspaces monorepo. One package manager (Bun) for all JS/TS, Foundry for
Solidity. Matches SKILL_GENERAL section 4.1 (Next.js plus Bun, never Vite) and
section 1 (never two package managers).

```
dragnet/
  contracts/                 Foundry project (Solidity)
    src/DragnetMarket.sol     bounty lifecycle, escrow, settle, dispute
    src/Secp256k1Verify.sol   ecrecover trick, hash160, on-curve check
    src/MerkleLib.sol         list and canary membership
    test/                     forge tests incl. adversarial cases
    script/Deploy.s.sol
  packages/
    crypto/                  shared TS: secp256k1, hash160, canary gen, merkle
    buyer/                   CLI/lib: generate canaries, build lists, post bounty
    scanner/                 worker: range scan, canary detect, commit-reveal
    scanner-cheat/           the demo cheat variant (skips part of the range)
  apps/
    web/                     Next.js (App Router) + Bun dashboard
  docs/
    BUILD_PLAN.md            this file
  .gitignore
  README.md
```

Tech choices and the rules they satisfy:

- **Contracts:** Solidity plus Foundry (`forge build`, `forge test`). Idiomatic
  for Monad docs and matches the security doc's verify commands.
- **Crypto and clients:** TypeScript on Bun, `@noble/secp256k1` and
  `@noble/hashes` (audited, pure JS, gives scalar mult, sha256, ripemd160).
  Errors as values, no `any`, per SKILL_GENERAL section 5.
- **Chain interaction:** `viem` for typed contract calls from clients and web.
- **Frontend:** Next.js App Router (latest) plus Bun. Creating this new UI
  surface triggers the design-motion Claude Design loop (SKILL_CLAUDE_DESIGN.md):
  the color palette is an approval gate. I will propose a palette and wait before
  building the UI. Flagged here so it is not a surprise.

### 6.1 Scanner performance (an honest engineering note)

Puzzle 30 is a 2^29 to 2^30 range, about 536 million keys. A naive pure-JS
scalar-multiply per key is too slow for a live demo. The standard fix is a
sequential scan: keep a running point `P = k*G` and add `G` each step (one point
addition, not a full multiply), then hash160 and test membership against an
in-memory set with a Bloom prefilter.

For a reliable on-camera demo, size the range to what scans in under about 60
seconds on the demo machine (roughly 2^20 to 2^22 with the incremental scan in
JS). The pitch says "about puzzle 30", and we present 30 as the real target
class while the live range is tuned for snappiness. If we want true 2^30 speed,
a small Rust or WASM inner loop is the drop-in upgrade path. This is the kind of
detail technical judges respect, so it goes in the README, not hidden.

## 7. Build timeline (Jul 15 to Jul 19)

Each day ends green: it builds, its tests pass, and it is committed by the human
(the agent prints the git block, never runs git).

**Day 0, Jul 15 (today): crypto core and contract skeleton.**
- Foundry init, constants file with cited secp256k1 values.
- `Secp256k1Verify.sol`: the ecrecover trick, point binding, hash160, on-curve
  check. Unit tests against known key/address vectors.
- `MerkleLib.sol` plus tests.
- Precompile probe deployed to Monad testnet, outputs confirmed.
- `packages/crypto` TS twin (same hash160 and canary gen) so buyer and worker
  agree with the contract byte for byte. Cross-check TS against Solidity vectors.

**Day 1, Jul 16: the market contract.**
- `DragnetMarket.sol`: post, commit, reveal, settle, expire, openCanaries, slash.
  Escrow accounting, reentrancy guards, distinct-key enforcement, deadline logic.
- Adversarial forge tests: skipper reveals `m-1` and gets zero; out-of-range
  buyer canary slashes the bond; mempool reveal-steal fails; double-reveal fails.
- Deploy and verify on Monad testnet (RPC, chainId, explorer confirmed from
  docs.monad.xyz, not memory).

**Day 2, Jul 17: worker and buyer clients, end to end.**
- `packages/buyer`: generate `m` canaries, build the shuffled list and both
  roots, post the bounty.
- `packages/scanner`: incremental range scan, canary detection, commit then
  reveal, claim payout.
- `packages/scanner-cheat`: same client, skips a contiguous slice of the range.
- Full loop on testnet with a small puzzle range: honest worker paid, cheat
  worker rejected.

**Day 3, Jul 18: frontend, polish, demo capture.**
- Run the Claude Design loop for the dashboard (palette gate first). Bounty
  board, live coverage meter, reveal log, worker outcome (paid or zero).
- Wire viem to the deployed contract, read live events.
- Record the 3-minute demo. Write the build-in-public post for the viral prize.

**Day 4, Jul 19: buffer and submit.**
- Final testnet run, README finalized (triggers readme-craft), submission fields
  filled: project URL, repo, contract address, video, post. Submit well before
  23:59 UTC.

## 8. Demo script (max 3 minutes)

1. Buyer posts a bounty on a small range with `m` canaries. Show the escrow and
   the two committed roots on the explorer.
2. Two honest workers and one cheat worker start scanning the same range live.
3. Honest workers find all `m` canaries, commit, reveal. The contract verifies
   and auto-pays the first to finish. Coverage meter hits 100 percent.
4. The cheat worker (skipping about 20 percent) finds only `m-1` canaries. Its
   reveal is rejected on-chain. It earns zero, on camera.
5. One line of narration: this is proof of exhaustive search over secp256k1, no
   ZK, and it is the tool you need for puzzle 71.

Judges click twice, so every button hits the real contract. No hardcoded success
toast anywhere.

## 9. Submission checklist (maps to HACKATHON.md)

- [ ] Name: Dragnet
- [ ] Description, Problem, Solution: from sections 1 and 2
- [ ] Project URL: hosted Next.js dashboard
- [ ] GitHub repo: public, honest commit history inside the window
- [ ] Category: Monad testnet (mainnet is a config swap; if we ship both, submit
      mainnet per the rules)
- [ ] Contract address: verified `DragnetMarket` on Monad
- [ ] Demo video: 3 minutes, the cheat-earns-zero moment
- [ ] Post URL: build-in-public thread for the viral prize
- [ ] README: run and understand in 3 minutes, honest threat-model section

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Monad lacks a precompile (ripemd160) | Day-0 probe verifies 0x01 to 0x03 before we depend on them. Fallback: an in-contract ripemd160, costlier but possible. |
| Live scan too slow on camera | Size the demo range to under 60 seconds; keep a Rust/WASM inner loop as the upgrade path. |
| Reveal gas for large `m` | Small `m` in the demo; allow splitting the reveal across transactions for large `m`. |
| Time overrun before Jul 19 | Contract plus one honest and one cheat worker plus a minimal dashboard is the minimum shippable demo. Frontend polish is the last thing cut, never the on-chain verification. |
| Overclaiming in judging | The threat-model section states the abscond limit plainly. |

## 11. Open decisions (sensible defaults chosen, confirm if you disagree)

- Chain: Monad testnet for the demo (free MON, escrow works the same). Mainnet is
  a config swap if you want it.
- Payout model: first valid full reveal wins `P`. A per-worker split is a noted
  extension, not in the MVP.
- Demo puzzle: range sized to the demo machine (about 2^20 to 2^22), presented as
  the puzzle-30 class.

## 12. Immediate next step

On your go, I start Day 0: Foundry init, the cited secp256k1 constants file,
`Secp256k1Verify.sol` with the ecrecover trick and hash160, and the matching
`packages/crypto` TS module, each with tests that agree on known vectors. I will
print the git handoff block for you to run at the end of each unit of work. I do
not run git.
