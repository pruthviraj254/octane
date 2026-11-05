# Octane on the alt mempool: design and tradeoffs

Octane is an open market where independent makers pay users' gas and are repaid in stablecoins in the same transaction. On the EF devnet, each maker runs its own staked EIP-8141 paymaster.

## Why it needs the alt mempool

The clone's `pay` frame reads `USDC.balanceOf(sender)` during validation, and that's another contract's storage. The same signed transaction, sent to both:

| Mempool | Result |
|---|---|
| Canonical | Rejected: `Frame transaction validation-prefix simulation failed: StorageReadNonSender` |
| Alternative | [Admitted and mined](https://explorer.altmempool.wtf/tx/0x4001574dfa5d5457a0bcd0bdd533af602e8a42c4f9c264d86bffb04a34435605) |

The second reason is pending load. A market maker serves many users at once, and a staked ACTIVE paymaster has no pending cap.

## Design

Layout 1, in the order PREFIX-010 requires:

| Frame | Mode | Target | Job |
|---|---|---|---|
| 0 | VERIFY | `EXPIRY_VERIFIER` | Rejects the transaction after the deadline |
| 1 | VERIFY | Sender | Approves execution |
| 2 | VERIFY | Maker's clone | Runs `pay(quote)`, approves payment |
| 3 | SENDER | USDC | `transfer(maker, fee)` |
| 4+ | SENDER | Any | The user's calls, up to about 60 |

**One clone per maker.** Each maker has an EIP-1167 clone holding only its own ETH, so there's no shared treasury. Mass invalidation is limited to one maker's own transactions. The maker and a gas price cap sit in the clone's bytecode, so validation does no `SLOAD` on the clone.

**What `pay` checks,** at 54,769 gas with everything on, inside the sidecar's flat 100k budget:

- The quote names this maker, this clone, this chain and USDC.
- Frame 0 really is the expiry verifier, and its deadline isn't after `validUntil`.
- Frame 3 is exactly `USDC.transfer(maker, fee)`, in SENDER mode with no value, and has enough execution and state gas. Without the gas check, a user could starve the fee frame and still have its gas paid.
- The sender's USDC balance covers the fee.
- The maker signed this quote.
- The transaction's maximum cost is within the quote's cap.

**Signature check.** We planned to verify the maker's quote with `ecrecover`. The sidecar's tracer records precompile code size as 0 and `skandha_config.precompiles` is empty, so we expected that to be rejected and never shipped it. Instead the maker's signature travels as a second signature entry over the quote digest. The protocol verifies it, for 2,800 gas, and the clone reads the result with `SIGPARAM`. The same signature the maker posted to Arkiv works unchanged, so a quote from the public board is directly usable.

## Tradeoffs

**Settle-revert risk (Layout 1).** Once `APPROVE(payment)` fires, the paymaster pays even if frame 3 later reverts, because a VERIFY frame can't see the future. A user could move their USDC between validation and execution. The damage is bounded: the balance check at validation, the gas checks on frame 3, a per-transaction cost cap, and it only touches that one maker's deposit.

**Removing that risk.** We tested collecting the fee in a `pre_verify` frame. EIP-3009 can't work here, because USDC's authorisation check uses `TIMESTAMP`, which is banned even for staked entities, and its nonce write isn't sender-associated. `transferFrom` after a one-time approval does work. [It was admitted and mined](https://explorer.altmempool.wtf/tx/0x937869a23be5171336a817cb2fd40b7c45bc65045e9aab919684c2c8029d5ff2), with the fee landing on the staked paymaster and `pay` checking the frame's status. It needs that one approval transaction per sender and contract, which the market can sponsor. Octane ships Layout 1 and keeps this as the upgrade path. See [`PreVerifyProbe.sol`](../contracts/src/pathA/experiments/PreVerifyProbe.sol).

**Mass invalidation.** Reading shared state means one USDC transfer can invalidate a pending sponsored transaction. Per-maker clones keep the blast radius to one maker, staking gives the mempool reputation to act on, and the settled fee repays honest work. A paymaster-balance reservation like the canonical paymaster's would suit this design well.

**Trust in quotes.** Reading a quote off Arkiv proves nothing by itself, so clients accept a quote only if its settlement contract is a clone from our factory.

## What we'd change in the rules

- `FRAMEPARAM` and friends need one Yul helper each until Solidity supports them. A payment-receipt frame or a standard ERC-20 paymaster rule set would make this pattern much cheaper to write.
- Sidecar rejections for `pre_verify` budgets name the exact sum, which saved us real time. Other rejections return only revert data.
- ethrex's simulation reported a failed frame index for a transaction that was then admitted and mined. We trust the admission result, but the two disagreed.

## Reproduce it

```bash
pnpm --filter @octane/scripts exec tsx setup-devnet.ts        # deploy, fund, stake (safe to rerun)
pnpm --filter @octane/scripts exec tsx patha-spike.ts send    # both mempools
pnpm --filter @octane/scripts exec tsx patha-spike.ts underpay # or redirect, forged
```
