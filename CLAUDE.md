# Octane: build brief for Claude Code

Octane is an open gas market. AI market makers compete to pay users' gas; payers (humans in our wallet app, or AI agents via our MCP server) hold only stablecoins and repay the maker inside the same transaction. Live quotes, requests, bids and ratings sit on Arkiv. No operator, no shared treasury.

**Builder:** one person (the human), acting as integrator. They may run several Claude Code sessions in parallel, each confined to its own area (see Roles). Stay in your area's folders unless asked.

**Source of truth:** `docs/octane-plan.md` (v3.4). This file is the short version. If they disagree, the plan wins; tell the human about the mismatch.

## Hackathon rules (non-negotiable)
- ETHGlobal Mumbai: **all project code is written during the event**. Arkiv requires "from scratch". Never paste pre-event code. EF's workshop quickstart lives in a separate folder, outside this repo.
- **Commit at least hourly**: small commits, clear messages, no squashing (Whitechain judges steady progress).
- **Never commit keys.** `.env` is gitignored; keep `.env.example` current.
- MIT license at the root. The README must include an AI usage disclosure.
- Prize picks: EF Frame Transaction Alt Mempool (fallback: EF Anon-RPC), Whitechain Scale, Arkiv Build (+ Swarm bonus). ENS is an optional add-on, not a pick.

## Locked design decisions (don't redesign without asking the human)
1. Two settlement paths, one market. **Path A:** EIP-8141 frame transactions on the EF alt-mempool devnet. **Path B:** gasless USDT on Whitechain Sepolia (1874).
2. **No shared treasury.** Path A: one `OctanePaymaster` EIP-1167 clone per maker (maker address as an immutable arg; each clone is staked). Path B: each maker relays from its own wallet and pays WBT.
3. **Path A frame layout (Layout 1, order per EF's PREFIX-010):** [0] `expiry_verify`: VERIFY to `EXPIRY_VERIFIER`, flags 0x0, deadline = quote `validUntil` (**must be first**); [1] `only_verify`: VERIFY sender → `APPROVE(execution)`; [2] `pay`: VERIFY maker's clone checks sender's USDC balance ≥ fee, frame 3 is `USDC.transfer(maker, fee)` (`FRAMEDATALOAD`), the expiry deadline ≤ `validUntil`, quote signature valid → `APPROVE(payment)`; [3] SENDER fee transfer; [4..n] SENDER user calls. No VERIFY after the prefix. **Every clone must be staked** (an unstaked payer has no storage access): a maker-only `stake()` forwards value to `NaiveStakingRegistry.addStake(86400)` (> 0.01 ETH on the devnet). **P1 upgrade (Layout 1b):** a `pre_verify` frame (DEFAULT mode, target = the clone) right before `pay` pulls the fee with the user's EIP-3009 authorisation; `pay` checks that frame's status. Test admission before relying on it.
4. **Path B:** the test USDT supports **EIP-3009** (confirmed Nov 5). The payer signs `receiveWithAuthorization` (`to` = `OctaneRelay`) with nonce = `keccak256(quoteHash, merchant, amount, maker)`. The relay requires `msg.sender == quote.maker`, recomputes the nonce, then atomically pays the merchant and the maker fee. Merchant-pays mode needs the merchant's EIP-712 opt-in `{merchant, amount, maxFee, orderId, expiry}`.
5. **Signed Quote (EIP-712)** `{maker, chainId, settlement, token, maxGas, fee, validUntil, nonce}`; domain `{name:"Octane", version:"1", chainId, verifyingContract: settlement}`. One definition in `contracts/src/lib/QuoteLib.sol` and one in `packages/sdk`, kept identical. Include a test that a TS-signed quote verifies in Solidity.
6. **Two clocks:** the Arkiv board entry lives ~30s (refreshed every ~10s); the signed `validUntil` is ~90–120s and is enforced on-chain.
7. **Arkiv entities** (plan 14.3): `quote` (one standing entity per maker per chain + token; update + extend every ~10s; delete on shutdown or low inventory), `request` (10s), `bid`, `fill` (indexer-owned, 30d), `maker` profile (maker-owned, 7d, transferable), `makerStats` (**indexer-owned**, so makers can't rate themselves). The UI and MCP **read Arkiv directly**; the indexer only writes.
8. **AI decides, contracts enforce.** Prices come from a numeric formula with hard caps; the LLM only picks a bounded regime buffer (calm / spiky / shock, 0–50%) and writes journal lines. The user always signs a max fee.
9. All maker/agent display and checks go through `resolveIdentity()` in the SDK (returns the address for now; ENS plugs in later).

## Priorities (plan section 10)
- **P0:** Path A with one maker and one admitted transaction · Path B with 3 maker-relayers and the binding nonce · Arkiv live board (standing quotes) · MCP `send_sponsored` on Whitechain · basic concierge · `resolveIdentity()` hook.
- **P1:** auctions on Arkiv · griefing shield (simulate first) · fade detector · journals → Swarm · merchant-pays · indexer + `makerStats` · `scripts/recompute-fade.ts` · paginated fill history + MCP `get_fill_history` · agents on Path A + batched payouts.
- **P2:** "wait to save" · maker evolution · ENS add-on (plan section 18).
- Don't start P1 work in an area until that area's P0 works end to end.
- **Checkpoints:** hour 6, a maker's quote shows on the board · hour 10, a Path B payment uses a board quote end to end · **hour 14, at least one Path A transaction admitted on the devnet**, or we drop Path A and switch EF to Anon-RPC (plan section 8).

## Repo layout
```
contracts/            Foundry: src/lib/QuoteLib.sol, src/pathA/OctanePaymasterFactory.sol + OctanePaymaster.sol,
                      src/pathB/OctaneRelay.sol (+ OctaneExecutor.sol, OctaneAccount*.sol contingency only), test/
packages/sdk/         @octane/sdk: quotes, pathA, pathB, auction, history, identity
packages/mcp/         MCP server for AI agents
apps/makers/          3 AI makers: pricing, standing-quote loop, relayer, bidder, shield, journal → Swarm
apps/web/             wallet + concierge + market board (Next.js)
apps/indexer/         fills + makerStats → Arkiv (write-only)
scripts/              recompute-fade.ts
arkiv/                schema.md, friction.md, reach.md, why-arkiv.md, how-you-use-arkiv.md, swarm.md
docs/octane-plan.md   the plan
WHITECHAIN_FEEDBACK.md, README.md, LICENSE
```

## Networks
| Network | Details |
|---|---|
| EF alt-mempool devnet | chain 1337, 6s blocks · execution RPC (canonical) `https://altmempool.forshtat.com` · **mempool RPC `https://altmempool.forshtat.com/rpc`** (`eth_sendFrameTransaction`; admission report `skandha_explorer_getTransaction`) · explorer `https://explorer.altmempool.wtf/` · **no faucet**: fund from the shared genesis key (sidecar `deploy/devnet/genesis.values.env`; new-account transfers need ≥ 204,600 gas) · USDC `0xEFe0D421fD473564c9C9b0cDCeB194cF476D6AF5` (FiatTokenV2_2, EIP-3009; deployer mints) · staking registry `0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f` · **may reset any time; addresses can change** |
| Whitechain Sepolia | chain 1874 · RPC `https://rpc.testnet.whitechain.io` (or Ankr) · explorer `https://explorer.testnet.whitechain.io` · faucet `https://faucet.testnet.whitechain.io` (0.1 WBT/24h) · USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` |
| Arkiv rabdi | chain 7794095 · `@arkiv-network/sdk` |

## Verify, don't guess
- **EIP-8141:** no viem support. Encode and submit frame transactions with the tooling in `forshtat/mempool-workshop` and `forshtat/mempool-workshop-sidecar` (`eth_sendFrameTransaction`). Check opcode names, frame modes and RPC methods against the EIP-8141 text and those repos. Never invent them.
- **Devnet token:** use the predeployed USDC (EIP-3009, same as Path B); a staked clone may read its proxy storage (STORAGE-032). Contracts follow the workshop's `@forshtat/hegota-support` patterns (`HegotaSupport`, `approve(Scope.PAYMENT)`, `sigparam`). Use `contracts/src/SponsorPaymaster.sol` and `ExampleWallet.sol` in `forshtat/mempool-workshop` as the starting reference.
- **EXPIRY_VERIFIER address:** the sidecar marks `0x…8141` as a placeholder. Confirm it against the EIP-8141 text or the workshop library before use.
- **Admission problems:** read the admission report (`skandha_explorer_getTransaction`). It names the violated rule and slot. Don't guess at fixes.
- **Arkiv SDK:** check the actual API and types for create / update / extend / delete / transfer, expiry units and query syntax before using them.
- **Whitechain USDT:** read `decimals()` and the EIP-712 domain (`eip712Domain()` or the verified source) from the chain. Never hardcode a guessed domain.
- If something can't be verified, **stop and ask the human**, and log the question in `docs/open-questions.md`.

## Conventions
- pnpm workspaces, TypeScript strict, Node 20, viem; Foundry for contracts (`forge test`, `--gas-report`); Next.js + Tailwind.
- Token amounts are `bigint` in base units, never floats.
- Every on-chain action logs its explorer link.
- Contract tests cover: wrong maker, expired quote, reused or unbound nonce, tampered amount or recipient, merchant-pays without opt-in, paymaster checks failing.
- UI/README wording: never "gas-free" or "no gas". Say "no gas token needed; one fee in stablecoins".

## Areas (the human may run one Claude Code session per area in parallel; stay in your area's folders)
Solo schedule and P1 order: plan section 10.
- **A, Path A** (`contracts/src/pathA`, `packages/sdk/pathA`): the human runs the EF quickstart outside the repo first → factory + one clone with `stake()` → stake it → Layout 1 with a minimal check → **one admitted sponsored frame transaction** (hour-14 gate) → then the full validation checks and the cost cap → later Layout 1b. Plan: 6, 13.1, 14.4, 14.6, 19.0–19.3.
- **B, Path B** (`contracts/src/pathB`, `packages/sdk/pathB`, `apps/makers` relayer): read the USDT domain → `OctaneRelay` + Foundry tests → deploy + **verify on 1874** → **first real USDT payment with explorer link** → maker relayer loop. Plan: 6, 13.2, 14.3, 14.4, 17.9, 19.4.
- **C, Arkiv + UI** (`apps/web`, `packages/sdk/quotes|history`, `arkiv/`): Arkiv hello world → standing `quote` entity → live board reading Arkiv directly → test whether `update` extends expiry. Plan: 13.3, 14.3.
- **D, AI** (`apps/makers` pricing and journal, `packages/mcp`): maker loop (formula + regime call + signed quote → Arkiv, with C) → journal lines → MCP `get_gas_quote` / `send_sponsored`. Plan: 7, 14.5.

## Open questions (update as answers arrive)
- **EF (mostly answered from their docs, plan 19.0):** still to test on the devnet: can a staked payer write the sender's USDC slots in a `pre_verify` pull (Layout 1b)? · the exact `EXPIRY_VERIFIER` address and data format · limits for ~50 SENDER frames · Anon-RPC support for Whitechain and Arkiv (hour-14 fallback).
- **Whitechain:** where payers get the test USDT · how to verify contracts on the L2 explorer · more WBT for makers.
- **Arkiv:** does `update` extend expiry · reading past entity versions · ordering and pagination syntax · `transfer` in the SDK · backend-sponsored writes owned by the maker wallet · Swarm postage batch.
