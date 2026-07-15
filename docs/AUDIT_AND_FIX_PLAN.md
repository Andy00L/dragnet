# Dragnet: Source-Verified Audit and Fix Plan

Target executor: Opus 4.8 (or a human). Every finding below was verified by
reading the actual source in this repository, with exact file and line numbers.
Nothing here is from memory. Where a claim needs a runtime check that could not
be done in the audit environment, it is labelled so.

Audience note: this document is written to be executed mechanically. Each finding
gives the exact location, why it is real, whether an outside attacker can reach
it, the precise fix (Solidity plus the matching TypeScript where parity matters),
and the test that proves the fix. Work top to bottom.

---

## 0. Scope, method, and honesty note

- Audited commit state: the working tree at `/home/drew/dragnet` on 2026-07-15.
- Method: full read of every Solidity and TypeScript source file, the tests, the
  build config, and the gitignore. Files read in full:
  `contracts/src/DragnetMarket.sol`, `contracts/src/Secp256k1.sol`,
  `contracts/src/MerkleProof.sol`, `contracts/script/Deploy.s.sol`, all three
  contract test files, `packages/crypto/src/*` (all), `packages/scanner/src/*`
  (all), `packages/buyer/src/*` (all), `packages/sdk/src/*` (config, chains,
  market), the CLIs, `foundry.toml`, `tsconfig.base.json`, `.gitignore`.
- IMPORTANT honesty note: `forge` and `bun` are NOT installed in the audit
  environment (`which forge bun` returned nothing; only `node` is present). The
  test suite was therefore NOT run during this audit. Every finding is from
  static reading. The first action in the fix plan (Phase 0) is to install the
  toolchain and run the suite to establish the real baseline before changing
  anything. The README claims 51 passing tests (31 forge, 17 crypto, 3 e2e); that
  claim was not re-verified here.

### The headline result

The core design is sound and the contract is genuinely well built. The on-chain
money paths, the commit-reveal binding, the reentrancy guard, the pull-payment
withdraw with checks-effects-interactions, and the canary CSPRNG are all correct
in source. There are NO critical findings and NO high findings that an outside
attacker can turn into stolen or lost third-party funds.

What remains is a set of medium and low items: validation gaps on the posting
entry point, one missing client-side safety check that the contract's own
documentation says should exist, one incomplete tooling path, and hardening and
hygiene items. They are worth fixing before deploying anything that holds value,
and they are all small.

---

## 0.5 Execution status (applied 2026-07-15)

This plan was written by a read-only pass in an environment without `forge`/`bun`.
It has since been executed in a session where the toolchain was present. The real
baseline before any change was green: 31 Foundry + 17 crypto + 3 e2e = 51 tests.
After the fixes below it is 37 Foundry + 18 crypto + 4 e2e = 59 tests, all passing,
`bunx tsc --build` clean, and the standards greps (dashes, suppressions, storage,
banned words) return zero hits.

Applied in this pass: M1, M2, M3, M4, M5 (new, see below), L1, L2, L3, L6, I2, I5
(new), plus the L4 NatSpec on the contract. Two follow-ups are deliberately NOT
applied and left as decisions for the maintainer:

- L4 README honesty line: the code-level disclosure (NatSpec on `openBounty` and
  `slash`) is in place; adding the matching README bullet should run the
  readme-craft workflow and is left for that pass.
- L5 `via_ir = false` trial: `_verifyKeys` was not refactored, so `via_ir` must
  stay `true`; the `isOnCurve` pre-filter comment note is folded into the code.

The slash economics (paying the committer `payout + bond` rather than only `bond`,
discussed under L4) is an economic-design choice, not a defect, and was left
unchanged; changing who receives the payout is a product decision for the
maintainer, not an audit fix.

New tests added: TA1 (`lo == 0`, `hi >= N`, `hi == N - 1`), TA2 (`RangeTooSmall`),
TA3 (`targetListMatchesRoot` unit), TA4 (slash e2e, which also covers TA6), a
market-level point-binding revert (valid on-curve point for the wrong key), and an
escrow-conservation test that drives one bounty through each terminal state and
asserts the contract balance is fully accounted for and drains to zero.

---

## 1. Correction of the earlier from-memory audit

A previous pass produced findings from memory, before the source was re-read.
Several of those were wrong. Opus must NOT act on the earlier list. Corrections,
verified against source:

| Earlier claim | Reality in source | Evidence |
| ------------- | ----------------- | -------- |
| "Reveal may not require a prior commit (front-run void)" | Reveal requires a stored commit and a strictly later block | `DragnetMarket.sol:208-210` |
| "Production canaries may use a seeded PRNG" | Default RNG is the platform CSPRNG; the seed is test-only | `canary.ts:11-15`, `post.ts:42` |
| "openDeadline may be computed from block.timestamp, making the open window empty" | openDeadline is `claimDeadline + openWindow` | `DragnetMarket.sol:151` |
| "postBounty may allow m == 0" | `m == 0` reverts CountInvalid | `DragnetMarket.sol:142` |
| "Canary sampling may have modulo bias" | Uses rejection sampling | `canary.ts:17-28` |
| "Events may be missing" | All state transitions emit indexed events; targetList is emitted | `DragnetMarket.sol:73-90,168-170` |
| "withdraw may not zero balance before the call" | Zeroes then calls then checks, guarded | `DragnetMarket.sol:285-292` |
| "slash may allow double-slash or non-committer" | Status gate plus committer gate present | `DragnetMarket.sol:271-273` |

The one earlier claim that IS real is the worker not verifying the target list
against the on-chain root. It appears below as finding M1.

---

## 2. Verified correct: do NOT "fix" these

Changing any of these would add risk for no gain. Listed so Opus does not
manufacture edits.

1. Commit-reveal binding. `reveal` recomputes
   `keccak256(abi.encode(keys, msg.sender, salt))` and compares to the caller's
   stored commit, and requires `block.number > commit.blockNumber`.
   `DragnetMarket.sol:208-219`. The TypeScript twin matches:
   `commit.ts:7-13` uses `encodeAbiParameters([uint256[], address, bytes32])`.
2. Reentrancy. `nonReentrant` guard on `reveal`, `openBounty`, `slash`,
   `withdraw`. `DragnetMarket.sol:64-71`. Value leaves only through `withdraw`,
   which is the sole `call{value:}` in the contract, and it follows
   checks-effects-interactions. `DragnetMarket.sol:285-292`.
3. Pull payments. Settlement credits `pendingWithdrawals`; no push transfers.
   `DragnetMarket.sol:226-227,260,278`.
4. The ecrecover ecmul trick and the point-to-key binding. `deriveAddress` uses
   `ecrecover(0, 27, GX, mulmod(k, GX, N))`; `isPubKeyOf` binds the supplied
   `(px, py)` to that address with keccak256; `isOnCurve` checks
   `y^2 = x^3 + 7`. `Secp256k1.sol:38-96`. Fake-point and off-curve rejection is
   tested. `DragnetMarket.t.sol:182-206`.
5. Canary randomness. Default `secureRandomBytes` is
   `globalThis.crypto.getRandomValues`. `canary.ts:11-15`. `randomBelow` is
   unbiased rejection sampling. `canary.ts:17-28`.
6. Merkle parity. TypeScript leaf `keccak256(hash160)` equals the contract's
   `keccak256(abi.encodePacked(bytes20))`; sorted-pair order matches.
   `merkle.ts:7-20` versus `MerkleProof.sol:19-27` and `DragnetMarket.sol:322`.
7. Deadline math and windows. `claimDeadline = now + claimWindow`,
   `openDeadline = claimDeadline + openWindow`, both windows in
   `(0, MAX_WINDOW]`. `DragnetMarket.sol:147-151`.
8. Secret hygiene at the ignore level. `.env`, `.env.*` (keeping `.env.example`),
   and `.dragnet/` (canary private keys) are gitignored. `.gitignore` bottom.
9. Config resolution. `PRIVATE_KEY` is validated as 32-byte hex; the market
   address is validated; no silent fallback to a wrong network.
   `config.ts:38-52`.

---

## 3. Severity and confidence legend

- Critical: third-party funds can be lost, stolen, or locked; or the core claim
  (only an exhaustive scan gets paid) is defeated. NONE found.
- High: an outside party can grief an honest party out of funds, or a validation
  gap is remotely exploitable. NONE found.
- Medium: a validation gap on a fund-holding entry point, a missing client-side
  safety check, or an incomplete path in the shipped tooling. Fix before a
  value-bearing deployment.
- Low: hardening, hygiene, efficiency, documentation.
- Info: a design property to document, not a defect.

Confidence is CONFIRMED for every code finding below (each was read in source).
Where exploitability depends on a runtime fact that could not be checked here, it
says so.

---

## 4. Executive summary

| ID | Sev | Title | Location |
| -- | --- | ----- | -------- |
| M1 | Medium | Worker does not verify the fetched target list against the on-chain root | `scanner/src/worker.ts:53,68,82`; `sdk/src/market.ts:144-156` |
| M2 | Medium | postBounty does not enforce `lo >= 1` and `hi < N` | `DragnetMarket.sol:141` |
| M3 | Medium | postBounty does not enforce the range can hold `m` distinct keys | `DragnetMarket.sol:141-142` |
| M4 | Medium | No CLI path to `slash`, so the anti-buyer-cheat deterrent is not operable end to end | `scanner/src/cli.ts`; `buyer/src/cli.ts`; `scanner/src/worker.ts:104-109` |
| M5 | Medium | `postBounty` records the simulated `bountyId`, not the one from the on-chain event | `sdk/src/market.ts:158-181` |
| L1 | Low | Canary-secret file written world-readable (no file mode) | `buyer/src/cli.ts:50-52` |
| L2 | Low | Saved-secret validation is shallow; malformed file can throw late | `buyer/src/cli.ts:56-69,140-141` |
| L3 | Low | Worker sends a doomed reveal when it found fewer than `m` keys | `scanner/src/worker.ts:82-109` |
| L4 | Low | `openBounty` never bounds against `openDeadline`; document the slash race | `DragnetMarket.sol:237-263` |
| L5 | Low | Redundant on-curve check (minor gas), and try building without `via_ir` | `Secp256k1.sol:89-92`; `foundry.toml:15` |
| L6 | Low | `bytesToAddresses` accepts a target list of any multiple of 20 including zero | `crypto/src/targetlist.ts:16-26` |
| I5 | Info | `realTargets` is safe only for out-of-range (exclusion) targets; an in-range target can leak the real key | `crypto/src/canary.ts`; `buyer/src/post.ts` |
| I1 | Info | Coverage is probabilistic (`f^m`), not a hard proof | design |
| I2 | Info | Merkle second-preimage is mitigated by leaf/node length separation; state it | `MerkleProof.sol`; `merkle.ts` |
| I3 | Info | Monad precompile availability (0x01/0x02/0x03) and `shanghai` are runtime assumptions | `foundry.toml:10` |
| I4 | Info | Finder-absconds is out of scope across chains (already in README) | design |

---

## 5. Findings in detail

### M1. Worker does not verify the fetched target list against the on-chain root

Severity: Medium. Confidence: CONFIRMED.

Locations:
- `packages/scanner/src/worker.ts:53` fetches the list:
  `const addresses = await market.fetchTargetList(options.bountyId);`
- It then scans with it (`:68`) and builds the reveal from it (`:82`) without ever
  comparing a rebuilt root to `bounty.targetRoot`.
- `packages/sdk/src/market.ts:144-156` `fetchTargetList` reads the
  `BountyPosted` event's `targetList` bytes and decodes them. It does not check
  them against the root either.
- The contract's own NatSpec says this check must happen:
  `DragnetMarket.sol:127-129`: "The on-chain root is authoritative; workers must
  verify this list hashes to it before scanning."

Why it is real: the contract stores only `targetRoot`; the `targetList` bytes are
event data, which the buyer supplies and the contract does not check against the
root at post time (and cannot cheaply). A buyer can emit a `targetList` that does
not hash to `targetRoot`. A worker that trusts the event then scans for the wrong
addresses and either finds nothing that lands in the real root, or finds keys
whose leaves are not under the real root, so the reveal reverts `NotListed`. The
worker has burned its scan for nothing.

Exploitability: this is a griefing and wasted-work vector against workers, not a
theft of funds (a worker holds no escrow). But it violates a documented invariant
and undermines the trust story ("a worker can check everything"). The same
unchecked-list pattern is in the buyer's `open` path (`buyer/src/open.ts:12-15`),
where it is lower risk because the buyer trusts its own list, but the fix should
cover both for consistency.

Fix (reuse-first): add one shared helper in the crypto package, then call it in
both the worker and the buyer-open flow.

1. In `packages/crypto/src/merkle.ts`, add a helper that rebuilds the root from
   the published addresses and compares it. `leafForHash160` and `buildTree`
   already live in this file.

```typescript
/// True iff the published hash160 list rebuilds to `expectedRoot`. Workers and
/// the buyer call this before trusting a target list read back from an event:
/// the on-chain root is authoritative (see DragnetMarket NatSpec).
export function targetListMatchesRoot(addresses: Hex[], expectedRoot: Hex): boolean {
  const tree = buildTree(addresses.map(leafForHash160));
  if (!tree.ok) {
    return false;
  }
  return tree.value.root.toLowerCase() === expectedRoot.toLowerCase();
}
```

   It is exported automatically (`crypto/src/index.ts:3` re-exports `./merkle.js`).

2. In `packages/scanner/src/worker.ts`, after fetching the list (after line 57),
   before scanning, add the check. `bounty.targetRoot` is on `OnChainBounty`
   already (`sdk/src/market.ts:33`) and `bounty` was fetched at `worker.ts:39`.

```typescript
if (!targetListMatchesRoot(addresses.value, bounty.targetRoot)) {
  say("published target list does not hash to the on-chain root; refusing to scan");
  return outcome;
}
```

   Add `targetListMatchesRoot` to the existing import from `@dragnet/crypto` at
   `worker.ts:2`.

3. In `packages/buyer/src/open.ts`, after `fetchTargetList` (after line 13), add
   the same guard against the bounty's root (fetch the bounty first with
   `market.getBounty(bountyId)` to get `targetRoot`), so the buyer also refuses a
   tampered list.

Test to add (see Tests section): a worker run against a bounty whose emitted
list is altered so it no longer hashes to the root must return without scanning
and must not commit.

---

### M2. postBounty does not enforce `lo >= 1` and `hi < N`

Severity: Medium. Confidence: CONFIRMED.

Location: `contracts/src/DragnetMarket.sol:141`:
`if (hi <= lo) revert RangeInvalid();` is the only range check. `lo` may be 0 and
`hi` may be at or above the secp256k1 group order `N`.

Why it is real: valid private keys are exactly `[1, N-1]`. With `lo == 0`, a
uniformly drawn canary can be `0`, whose "public key" is the point at infinity;
`deriveAddress(0)` returns `address(0)` (`Secp256k1.sol:39-41`), so a reveal or
open carrying key `0` reverts `BadPublicKey`. With `hi >= N`, drawn keys at or
above `N` are invalid the same way. Either misconfiguration can produce a bounty
that no one can ever complete or open.

Exploitability: NOT reachable by a third party, and the crypto layer blocks the
common path: a TypeScript buyer that draws an out-of-range canary fails locally
in `buildTargetList` (`canary.ts:92-93` calls `hash160ForKey`, which rejects keys
outside `[1, N)` via `isValidKey`, `secp256k1.ts:14-16,38-44`), so the post never
reaches the chain. The gap is that the contract itself does not enforce the bound,
so a non-TypeScript or buggy client can create a self-defeating bounty. This is
defense in depth on a fund-holding entry point, and the fix is one line.

Fix: the library exposes `N` as `Secp256k1.N` (internal constant, visible to the
importing contract). Tighten the check.

```solidity
// Valid private keys live in [1, N-1]; a range outside that can never be proven.
if (lo == 0 || hi <= lo || hi >= Secp256k1.N) revert RangeInvalid();
```

TypeScript parity (clear early error, optional but recommended): in
`packages/crypto/src/canary.ts` `generateCanaries`, add, after the `hi <= lo`
check (`:53-55`):

```typescript
if (lo < 1n) {
  return err(`lo must be at least 1, got ${lo}`);
}
if (hi >= N) {
  return err(`hi must be below the group order N, got ${hi}`);
}
```

   `N` is already exported from `./secp256k1.js`; import it in `canary.ts`.

Test to add: `postBounty` with `lo == 0` reverts `RangeInvalid`; with
`hi == Secp256k1.N` reverts `RangeInvalid`; with `hi == Secp256k1.N - 1` and a
valid small `m` succeeds.

---

### M3. postBounty does not enforce that the range can hold `m` distinct keys

Severity: Medium. Confidence: CONFIRMED.

Location: `contracts/src/DragnetMarket.sol:141-142`. There is no check that
`hi - lo + 1 >= m`.

Why it is real: a reveal or open must present `m` strictly ascending in-range
keys (`_verifyKeys`, `DragnetMarket.sol:311-324`). If the range holds fewer than
`m` integers, that is impossible. The bounty can then never be revealed and never
be opened. Its escrow can leave only through `slash`, which needs a committer; if
no worker ever commits (and none would, the bounty is unsolvable), the escrow is
locked permanently.

Exploitability: self-inflicted by the buyer, not third-party reachable. The
TypeScript path already blocks it: `generateCanaries` returns an error when
`rangeSize < count` (`canary.ts:59-62`), so a TypeScript buyer cannot post such a
bounty. As with M2, the contract itself should still enforce it so a non-TS
client cannot lock its own escrow.

Fix: add a distinct error and a check in `postBounty`, after the count check.

```solidity
// Add to the error list near DragnetMarket.sol:92-116:
error RangeTooSmall();

// In postBounty, after the m bounds check (after :142):
// m distinct ascending keys must fit inside [lo, hi].
if (hi - lo + 1 < m) revert RangeTooSmall();
```

Because M2 already guarantees `lo >= 1` and `hi < N`, `hi - lo + 1` cannot
overflow here.

Test to add: `postBounty` with `lo = 1, hi = 3, m = 5` reverts `RangeTooSmall`.

---

### M4. No CLI path to slash, so the anti-buyer-cheat deterrent is not operable end to end

Severity: Medium. Confidence: CONFIRMED.

Locations: `MarketClient.slash` exists in the SDK
(`packages/sdk/src/market.ts:225-237`), but nothing in the shipped tooling calls
it. `packages/scanner/src/cli.ts` handles only scan or cheat. `runWorker`
(`worker.ts:31-131`) commits and reveals and then returns on a reverted reveal
(`:104-109`); it never slashes. `packages/buyer/src/cli.ts` handles only `post`
and `open`. A repo-wide grep confirms `slash` appears only in the contract,
the tests, and the SDK method, never in a CLI or a worker flow.

Why it matters: the README states the mechanism keeps a buyer honest, "a buyer
that plants unfindable canaries is slashed" (README "What it does" and the
contract test `test_CommitterSlashesBuyerWhoNeverOpens`,
`DragnetMarket.t.sol:327-345`). The mechanism is correct on-chain and tested, but
a worker who scanned a cheating buyer's bounty has no shipped command to actually
collect the slash. The economic deterrent depends on rational workers being able
to slash cheaply. Right now that requires hand-writing a script against the SDK.

Note the precondition, which is already satisfied by the code: a worker that
finds fewer than `m` keys still commits, because `buildReveal` returns a short
payload rather than an error for a short key set (`reveal.ts:9-49`, it never
checks against `m`), and `runWorker` commits from that payload (`worker.ts:88-93`)
before the reveal reverts. So the committer gate on `slash`
(`DragnetMarket.sol:273`) can be met. The missing piece is purely the client
action to call `slash` after `openDeadline`.

Fix (smallest correct version): add a `slash` subcommand to the scanner CLI that
loads config, builds a `MarketClient`, and calls `market.slash(bountyId)`,
printing the distinct revert reason on failure (for example `OpenWindowOpen`
before the deadline, `NotCommitted` if this worker never committed). Mirror the
existing command parsing in `scanner/src/cli.ts:18-55` and the config and signer
guards in `runPost`/`runOpen` (`buyer/src/cli.ts:71-80`). Optionally, have
`runWorker` return enough state (it already sets `committed` and `revertReason`)
for a caller to decide to slash later; do not auto-slash inside `runWorker`,
since the deadline has not passed at reveal time.

Test to add (TypeScript e2e or a unit against a live anvil): a worker commits,
the buyer never opens, time is warped past `openDeadline`, the worker's `slash`
command credits `payout + bond` to the worker. The contract-level behavior is
already covered by `test_CommitterSlashesBuyerWhoNeverOpens`; this test covers the
client path.

---

### M5. postBounty records the simulated bountyId, not the on-chain event value

Severity: Medium. Confidence: CONFIRMED. (Found in this execution pass; the
read-only pass missed it.)

Location: `packages/sdk/src/market.ts`, `postBounty`. Before the fix it read
`const { request, result } = await simulateContract(...)` and returned
`{ bountyId: result }`. `result` is the function's return value as simulated
against current state, i.e. `bountyCount + 1` at simulate time.

Why it is real: `simulateContract` runs against the state at call time. If another
`postBounty` from anyone is mined between the simulate and this transaction landing,
the real assigned id is higher than `result`. The client would then return the
wrong id. The buyer CLI persists canary keys under that id
(`buyer/src/cli.ts` `saveSecret`), and a later `open <id>` would load the wrong
secrets file or fetch a different bounty's list. The scanner would target the wrong
bounty. For a single-actor demo there is no concurrency and it is correct; on a
live shared network it races.

Exploitability: not a theft; a correctness bug under concurrent posting that
corrupts the buyer's own bookkeeping. Severity Medium because it silently binds
secrets to the wrong id.

Fix (applied): read the authoritative id from the `BountyPosted` event in the
transaction receipt (the `bountyId` is indexed), filtering the receipt logs to this
contract's address, and fall back to the simulated `result` only if the event is
absent.

```typescript
const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
const marketLogs = receipt.logs.filter(
  (entry) => entry.address.toLowerCase() === this.address.toLowerCase(),
);
const posted = parseEventLogs({ abi: dragnetMarketAbi, eventName: "BountyPosted", logs: marketLogs });
const emitted = posted[0];
const bountyId = emitted !== undefined ? emitted.args.bountyId : result;
return { bountyId, txHash };
```

Covered by the existing e2e (all three flows post and then act on the returned id);
the fix keeps the happy path and makes the id correct under concurrency.

---

### L1. Canary-secret file is written world-readable

Severity: Low. Confidence: CONFIRMED.

Location: `packages/buyer/src/cli.ts:50-52`. `mkdirSync(SECRETS_DIR, {recursive:
true})` and `writeFileSync(path, ...)` are called with no `mode`, so the
directory and file take the process umask default (commonly `0o755` and `0o644`),
leaving canary private keys readable by other local users.

Why it matters: `.dragnet/bounty-*.json` holds the canary private keys in plain
text (`cli.ts:110-116`). They are gitignored (good), but on a shared host any
local user could read them. The security model treats these as secret until the
buyer chooses to open.

Fix: create the directory and file with owner-only permissions.

```typescript
mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
writeFileSync(path, JSON.stringify(record, null, 2), { mode: 0o600 });
```

Note: `writeFileSync` `mode` applies on create; if the file may already exist
with looser bits, add an explicit `chmodSync(path, 0o600)` after writing. No log
line prints the keys today (`cli.ts:118-121` prints only the path); keep it that
way.

Test to add: after `post`, assert the saved file's mode is `0o600` (Node
`statSync(path).mode & 0o777`).

---

### L2. Saved-secret validation is shallow

Severity: Low. Confidence: CONFIRMED.

Location: `packages/buyer/src/cli.ts:56-69`. `loadSecret` checks only that the
parsed object has a `canaryKeys` array, then returns `parsed as SavedBounty`. It
does not check that the elements are strings, nor that `bountyId/lo/hi/m` exist.
`runOpen` then does `saved.canaryKeys.map((key) => BigInt(key))`
(`cli.ts:140-141`), which throws a raw error if an element is not a valid
integer string.

Why it matters: a corrupted or hand-edited secrets file produces an unhandled
throw instead of a distinct, actionable message. This is the errors-as-values
rule (SKILL_GENERAL section 5) at a trust-ish boundary (reading persisted state).

Fix: validate element types and wrap the `BigInt` conversion, returning a clear
message. Minimal version: check every entry is a string of digits before
converting, and on failure print
`[dragnet-buyer] <path> has a malformed canaryKeys entry` and exit non-zero.

Test to add: `loadSecret` on a file whose `canaryKeys` contains a non-numeric
string exits with a distinct message, not a raw `SyntaxError`.

---

### L3. Worker sends a doomed reveal when it found fewer than `m` keys

Severity: Low. Confidence: CONFIRMED.

Location: `packages/scanner/src/worker.ts:82-109`. When the scan found fewer than
`bounty.m` keys, `buildReveal` still returns a short payload (`reveal.ts` never
compares to `m`), the worker commits it (needed to preserve the slash right,
which is fine), then submits a reveal that is guaranteed to revert
`LengthMismatch`. That is one wasted transaction and one wasted gas payment every
time coverage is incomplete.

Why it is only Low: for the demo, the reverting reveal is the visible proof that
the cheat earns zero, so in that context it is intentional. For a real worker it
is wasteful. The commit should stay (it keeps `slash` available); only the
certain-to-fail reveal should be skipped.

Fix: after the scan, if `scan.value.foundKeys.length < bounty.m`, log that
coverage is incomplete, keep the commit if you want the slash option, and return
without calling `reveal`. Gate the current reveal call (`worker.ts:104`) on
`outcome.found === bounty.m`. Preserve the demo behavior by keeping a flag (for
example an option `revealEvenIfShort` defaulting to false) so `demo.ts` can still
show the reverting reveal.

Test to add: a worker that finds `m - 1` keys does not send a reveal transaction
(assert `revealTx` is undefined and `revertReason` is unset), while still having
committed.

---

### L4. openBounty is unbounded in time; document the slash race and the offline-buyer assumption

Severity: Low (documentation and one optional guard). Confidence: CONFIRMED.

Location: `DragnetMarket.sol:237-263`. `openBounty` is callable by the buyer any
time while the bounty is `Open` and `block.timestamp > claimDeadline`, with no
upper bound. After `openDeadline`, `slash` is also callable by a committer
(`:268-281`). So after `openDeadline` there is a race: whichever of the buyer's
`openBounty` and a committer's `slash` lands first wins.

Two properties to write down (both are acceptable design, not bugs):
1. An honest buyer who goes offline after posting can be slashed by a committer
   after `openDeadline`, losing `payout + bond`, even though the canaries were
   findable. The system assumes the buyer stays available to open unclaimed
   bounties within the open window.
2. A worker that found all canaries during the claim window could, in principle,
   decline to reveal and instead wait to `slash` after `openDeadline` for
   `payout + bond` rather than reveal for `payout`. An active buyer defeats this
   by opening during the open window, so a rational worker reveals during the
   claim window for the guaranteed payout. This holds only while the buyer is
   active (property 1).

Fix: no code change is required. Add a NatSpec paragraph on `openBounty` and
`slash` stating the availability assumption, and add it to the README honesty
section ("What is real and what is not"). If a stronger guarantee is wanted
later, a design change (for example a grace period where only the buyer may act
for a window after `openDeadline`) is a feature, not a fix; do not add it without
the maintainer deciding.

---

### L5. Redundant on-curve check, and try building without via_ir

Severity: Low. Confidence: CONFIRMED.

Locations:
- `Secp256k1.sol:84-96` `recoverHash160` calls `isOnCurve` (`:89`) and then
  `isPubKeyOf` (`:92`). `isPubKeyOf` already pins `(px, py)` to `k*G` via the
  address binding, and `k*G` is always on the curve, so `isOnCurve` is redundant
  for correctness. It is cheap defense in depth (it rejects a nonsense point
  before the keccak binding) and can stay; note it so a reader does not think it
  is load-bearing.
- `foundry.toml:15` `via_ir = true` was needed to avoid stack-too-deep in the
  multi-argument verify path. After any refactor of `_verifyKeys`, try compiling
  with `via_ir = false`; if it compiles, the non-IR pipeline is a smaller trust
  surface. If it still hits stack-too-deep, keep `via_ir = true` and leave the
  existing comment.

Fix: optional. If keeping `isOnCurve`, add a one-line comment that it is a cheap
pre-filter, not the security check (the binding in `isPubKeyOf` is). Do not remove
it without re-running the fake-point test (`DragnetMarket.t.sol:182-206`).

---

### L6. bytesToAddresses accepts any multiple of 20, including an empty list

Severity: Low. Confidence: CONFIRMED.

Location: `packages/crypto/src/targetlist.ts:16-26`. `bytesToAddresses` accepts
any byte length that is a multiple of 20, including 0 (returns an empty array).
`fetchTargetList` (`market.ts:155`) passes the event bytes straight in. A bounty
posted with an empty `targetList` (allowed by the contract, which does not check
the list at all) would decode to zero addresses. A worker would then build a tree
from zero leaves; `buildTree` returns an error for zero leaves (`merkle.ts:30-32`),
so the worker fails cleanly, but the message ("cannot build a Merkle tree with
zero leaves") is less clear than it could be.

Why it is Low: not exploitable; the M1 root check (once added) already rejects a
list that does not match the root, and an empty list cannot match a nonzero root
(the contract rejects a zero root at `DragnetMarket.sol:143`). This is a clarity
item.

Fix: in `bytesToAddresses`, return a distinct error for a zero-length list
(`target list is empty`) so the failure reads clearly. Keep the multiple-of-20
check.

---

### I1. Coverage is probabilistic, not a hard proof

Info. The claim proven on-chain is that the worker holds `m` in-range keys mapping
to listed addresses. Finding all `m` uniform canaries is strong probabilistic
evidence of near-complete coverage (`P(paid) = f^m`), not a mathematical proof
that every key was tested. The README states this correctly ("probabilistically",
coverage table). No change; keep the honest framing in any new docs.

### I2. Merkle second-preimage is mitigated by length separation; state it

Info. Leaves are `keccak256` of a 20-byte hash160; internal nodes are `keccak256`
of 64 bytes (`MerkleProof.sol:23-25`, `DragnetMarket.sol:322`). The differing
preimage lengths mean an internal node cannot be presented as a leaf, which is the
standard mitigation for the sorted-pair second-preimage concern. The contract also
never accepts a raw 32-byte value as a leaf: the leaf is always
`keccak256(abi.encodePacked(h160))` for a `bytes20 h160`. Add a one-line comment
in both `MerkleProof.sol` and `merkle.ts` recording this, so a future reader does
not "harden" it into a double-hash and break parity by accident. If a double-hash
is ever adopted, both sides change together and every CrossCheck fixture must be
regenerated.

### I3. Monad precompile and EVM-version assumptions

Info. The proof relies on precompiles ecrecover (0x01), sha256 (0x02), and
ripemd160 (0x03), and the build targets `evm_version = "shanghai"`
(`foundry.toml:10`). These are standard and Monad targets EVM equivalence, but the
audit environment cannot reach Monad. Verify on Monad testnet after deploy that a
real reveal succeeds (the deploy plus one honest reveal is the check). This is
already implied by the README's "not yet deployed" note; make it an explicit
post-deploy smoke test.

### I4. Finder-absconds is out of scope across chains

Info. Dragnet proves coverage; it does not force a worker who finds the real
cross-chain key to surrender it. The README documents this. No change.

### I5. realTargets is safe only for out-of-range (exclusion) targets

Info (design footgun, documented in this pass). The buyer can mix real target
hash160s into the published list via `realTargets`
(`post.ts` `PostOptions.realTargets`, `canary.ts` `buildTargetList`). This is safe
only when the real target's private key is NOT inside `[lo, hi]`, which is the
exclusion use the README describes.

If a real target's key IS in range, a worker that scans fully finds `m + 1` keys:
the `m` canaries plus the target. The contract requires exactly `m` keys in the
reveal, so either the reveal reverts `LengthMismatch` (a full-coverage worker goes
unpaid), or, if the worker trims to `m` by dropping one of the indistinguishable
keys, it may drop a canary and publish the real target's private key on-chain. The
contract cannot detect or prevent this because it never learns the target's key.

No code change enforces it (the contract cannot); the safety note was added to
`buildTargetList` and to `PostOptions.realTargets`. If a stronger guarantee is
wanted, the buyer tooling could require an attestation that realTargets are
out-of-range, but that is a product decision, not a fix.

---

## 6. Existing test coverage (do not duplicate)

Verified present in `contracts/test/DragnetMarket.t.sol`:

- Posting: stores and escrows (`:98`), value mismatch (`:109`), bad range
  `hi <= lo` (`:115`), zero count (`:121`).
- Happy path: honest worker paid, buyer bond returned, withdraw (`:129`).
- Cheat: missing canary reverts `LengthMismatch` (`:156`); fake off-curve point
  reverts `BadPublicKey` (`:182`).
- Commit-reveal: reveal without commit reverts `NotCommitted` (`:210`); same-block
  reveal reverts `RevealTooSoon` (`:220`); front-runner cannot steal (`:232`);
  second reveal after paid reverts `BountyNotOpen` (`:258`); reveal after claim
  deadline reverts `ClaimWindowClosed` (`:277`).
- Open: buyer reclaims payout plus bond (`:292`); before claim deadline reverts
  `ClaimWindowOpen` (`:306`); non-buyer reverts `NotBuyer` (`:315`).
- Slash: committer slashes after both windows (`:327`); before open deadline
  reverts `OpenWindowOpen` (`:347`); non-committer reverts `NotCommitted` (`:360`).
- Withdraw: nothing owed reverts `NothingToWithdraw` (`:370`).

`contracts/test/Secp256k1.t.sol` covers known-vector crypto (keys 1 and 2,
hash160 vector). `contracts/test/CrossCheck.t.sol` proves TypeScript-built roots
and proofs verify in Solidity. `packages/crypto/test/crypto.test.ts` covers the
TS crypto twin. `packages/demo/test/e2e.test.ts` covers honest-paid,
cheat-earns-zero, and buyer-refund against a live anvil.

## 7. Tests to add (only the genuinely missing ones)

- TA1 (M2): `postBounty` reverts `RangeInvalid` for `lo == 0` and for
  `hi == Secp256k1.N`; succeeds for `hi == Secp256k1.N - 1`.
- TA2 (M3): `postBounty` reverts `RangeTooSmall` for `lo = 1, hi = 3, m = 5`.
- TA3 (M1): a worker run whose emitted target list is altered so it no longer
  hashes to the root returns without scanning and without committing. Unit-test
  the new `targetListMatchesRoot` in `packages/crypto/test` with a matching list
  (true) and a one-address-swapped list (false).
- TA4 (M4): TypeScript e2e, worker commits, buyer never opens, time warped past
  `openDeadline`, the worker's slash command credits `payout + bond`.
- TA5 (L1): saved secret file mode is `0o600` after `post`.
- TA6 (L3): a worker that finds `m - 1` keys sends no reveal transaction but has
  committed.
- TA7 (point-binding, hardening): a reveal with a valid key but an on-curve point
  that is not `k*G` reverts `BadPublicKey`. The existing fake-point test uses an
  off-curve point; this one exercises the `isPubKeyOf` binding specifically. Pick
  a real point (for example `2*G`) paired with key `1`.
- TA8 (invariant, recommended before value-bearing deploy): a Foundry invariant
  test asserting `sum(pendingWithdrawals) + sum(escrow of Open bounties) ==
  address(this).balance` across arbitrary sequences of the entry points. This is
  the single highest-value test for an escrow contract.

## 8. Phased fix plan

Do the phases in order. After each phase, run the full suite (Section 9). Do not
advance while red.

### Phase 0: baseline (no code changes)
- [ ] Install the toolchain: Foundry (`forge`, `anvil`) and Bun. Confirm
      `forge --version` and `bun --version`.
- [ ] `bun install`; `bun run setup:contracts` (vendors forge-std by tarball).
- [ ] Run `cd contracts && forge test`, `bun test packages/crypto`, and the
      demo e2e. Record the real pass counts. If anything is red before any
      change, stop and report; the rest of this plan assumes a green baseline.
- [ ] Re-read `DragnetMarket.sol`, `Secp256k1.sol`, `worker.ts`, `canary.ts`,
      `cli.ts` in full (they are cited below; read before edit).

### Phase 1: medium findings
- [ ] M2: tighten the range check (`DragnetMarket.sol:141`); add TS early errors
      in `canary.ts`. Add TA1.
- [ ] M3: add `RangeTooSmall` and the range-size check. Add TA2.
- [ ] M1: add `targetListMatchesRoot` to `merkle.ts`; call it in `worker.ts` and
      `open.ts`. Add TA3.
- [ ] M4: add a `slash` subcommand to the scanner CLI. Add TA4.
- [ ] Full suite green.

### Phase 2: low findings
- [ ] L1: file mode `0o600`, dir `0o700` in `buyer/src/cli.ts`. Add TA5.
- [ ] L2: validate saved-secret element types; distinct error message.
- [ ] L3: skip the doomed reveal when `found < m` (keep the demo flag). Add TA6.
- [ ] L6: distinct empty-list error in `bytesToAddresses`.
- [ ] Full suite green.

### Phase 3: documentation and hardening
- [ ] L4: NatSpec on `openBounty`/`slash` plus a README honesty line about the
      buyer-availability assumption.
- [ ] L5: comment that `isOnCurve` is a pre-filter; try `via_ir = false` and keep
      whichever compiles, noting the result.
- [ ] I2: one-line comment in `MerkleProof.sol` and `merkle.ts` on leaf/node
      length separation.
- [ ] I3: add a post-deploy smoke-test note (one honest reveal on Monad testnet).
- [ ] TA7 (point-binding) and TA8 (invariant) tests added and green.

### Phase 4: verify and hand off
- [ ] Full suite green including the new tests.
- [ ] `bun run typecheck` clean.
- [ ] Run the final-check greps from SKILL_GENERAL on every touched file
      (dashes, type suppressions, storage, banned words). Expect zero hits.
- [ ] Produce the files-affected report and the git handoff blocks (Section 10).

## 9. Verification run order (after every phase)

```bash
# 1. Contracts
cd contracts && forge build && forge test

# 2. TypeScript types, all packages, strict
cd .. && bun run typecheck

# 3. Crypto parity and canary tests
bun test packages/crypto

# 4. Live end to end (start a node first)
anvil --block-time 1 &                          # background
DRAGNET_TEST_RPC=http://127.0.0.1:8545 bun test packages/demo
```

Foundry fuzz and invariant depth for TA8 (add to `foundry.toml` if you add the
invariant test):

```toml
[fuzz]
runs = 512
[invariant]
runs = 256
depth = 32
```

## 10. Handoff templates (the human runs git; the agent never does)

Fill these in after the fixes land. List every touched file explicitly; never
`git add .` or `-A`; never stage `.env` or `.dragnet`.

Files-affected report (example shape, replace with the real list):

```
contracts/src/DragnetMarket.sol      modified  (M2 range bound, M3 range-size, L4 NatSpec)
contracts/test/DragnetMarket.t.sol   modified  (TA1, TA2, TA7, TA8)
packages/crypto/src/merkle.ts        modified  (M1 targetListMatchesRoot, I2 comment)
packages/crypto/src/canary.ts        modified  (M2 early errors)
packages/crypto/src/targetlist.ts    modified  (L6 empty-list error)
packages/crypto/test/crypto.test.ts  modified  (TA3 unit)
packages/scanner/src/worker.ts       modified  (M1 root check, L3 skip doomed reveal)
packages/scanner/src/cli.ts          modified  (M4 slash subcommand)
packages/buyer/src/cli.ts            modified  (L1 file mode, L2 validation)
packages/buyer/src/open.ts           modified  (M1 root check)
packages/demo/test/e2e.test.ts       modified  (TA4 slash e2e)
foundry.toml                          modified  (fuzz/invariant config; via_ir trial)
docs/AUDIT_AND_FIX_PLAN.md            added     (this document)
```

Git handoff (one block per logical group; the human runs them):

```bash
git add contracts/src/DragnetMarket.sol contracts/test/DragnetMarket.t.sol
git commit -m "fix(contract): enforce key-range bounds and range-size; add invariant and point-binding tests"
git push

git add packages/crypto/src/merkle.ts packages/scanner/src/worker.ts packages/buyer/src/open.ts packages/crypto/test/crypto.test.ts
git commit -m "fix(client): verify published target list hashes to the on-chain root before scanning"
git push

git add packages/scanner/src/cli.ts packages/demo/test/e2e.test.ts
git commit -m "feat(scanner): add slash subcommand so a committer can collect after openDeadline"
git push

git add packages/buyer/src/cli.ts
git commit -m "fix(buyer): write canary secrets 0600 and validate the saved file"
git push

git add docs/AUDIT_AND_FIX_PLAN.md
git commit -m "docs: add source-verified audit and fix plan"
git push
```

## 11. Appendix A: constants to re-verify against known vectors

A single transposed hex digit here is a silent, total break (this class of bug was
caught during the original build in `GY`). Keep these as literal expected values in
`Secp256k1.t.sol`, and keep using `bytes20(hex"...")` for hash160 so the compiler
does not read a bare 20-byte hex as a checksummed address.

- privkey 1 gives Ethereum address `0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf`.
- hash160 of the compressed pubkey for key 1 is
  `0x751e76e8199196d454941c45d1b3a323f1433bd6`.
- `N  = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141`
- `P  = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F`
- `GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798`
- `GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8`
- `B  = 7`

Current source matches all of these (`Secp256k1.sol:17-30`).

## 12. Appendix B: the ecmul trick, so a reviewer can check the code

The EVM cannot multiply a scalar by the secp256k1 generator, so the contract uses
ecrecover:

```
ecrecover(0, 27, GX, mulmod(k, GX, N)) == address(k * G)
```

With message hash `z = 0`, `r = GX` (so the recovered point `R = G`),
`s = k * GX mod N`, and `v = 27` (because `GY` is even), ecrecover returns the
address of `r^-1 * (s * R - z * G) = k * G`. `isPubKeyOf` then binds the supplied
`(px, py)` to that address with keccak256, `isOnCurve` checks `y^2 = x^3 + 7`, and
`hash160Compressed` hashes the compressed point with sha256 then ripemd160. Each
step is a precompile, which is why no zero-knowledge circuit is needed. Confirm in
source that `v = 27`, `z = 0`, `r = GX` (`Secp256k1.sol:42-46`).

## 13. Appendix C: what this audit did not cover

- Running the test suite (toolchain absent in the audit environment; Phase 0
  runs it).
- On-chain behavior on Monad (no network access; verify with a post-deploy
  smoke test).
- Economic parameter modelling (bond-to-payout ratio is a product choice, not a
  code defect; the `f^m` table itself is sound).
- Native or GPU scanner performance (the contract and proof are independent of
  scanner speed; the TypeScript scanner is demo-scale by design, documented in
  the README).
- Gas benchmarking of a large-`m` reveal (bounded by `MAX_M = 256`; measure on a
  real node if large bounties are expected).
