# Octane: build brief for Claude Code

Octane is an open gas market. AI market makers compete to pay users' gas; payers (humans in our wallet app, or AI agents via our MCP server) hold only stablecoins and repay the maker inside the same transaction. Live quotes, requests, bids and ratings sit on Arkiv. No operator, no shared treasury.

**Builder:** one person (the human), acting as integrator. They may run several Claude Code sessions in parallel, each confined to its own area (see Roles). Stay in your area's folders unless asked.

**Source of truth:** `docs/OCTANE.md` (v4.0). Part 0 holds the milestones and rules; Part 1 is the plan (`docs/octane-plan.md` is the same text). This file is the short version, corrected by research on Nov 5 against the live chains and sponsor source. If this file and the docs disagree, this file's corrections win; tell the human about any new mismatch.

**Build order:** three phases, in order, with no hour targets. Phase 1: M0, M1, M2, M4, M5, M6. Phase 2: M3, M7, M8, M9. Phase 3: Swarm, merchant-pays UI, indexer + `recompute-fade`, M11; other P1 items only if the human picks them.

## Hackathon rules (non-negotiable)
- ETHGlobal Mumbai: **all project code is written during the event**. Arkiv requires "from scratch". Never paste pre-event code. Adapting open-source reference code (such as EF's workshop) is allowed if credited in the README. EF's workshop quickstart lives in a separate folder, outside this repo.
- **Commit at least hourly**: small commits, clear messages, no squashing (Whitechain judges steady progress).
- **Never commit keys.** `.env` is gitignored; keep `.env.example` current.
- Public repo, MIT license at the root. The README must include an AI usage disclosure that says which files or parts AI generated or assisted (ETHGlobal FAQ). AI assists; the human directs, reviews and must be able to explain the code.
- **Deploys and transactions need the human's go-ahead.** Each milestone ends with its evidence shown.
- Prize picks: EF Frame Transaction Alt Mempool (fallback: EF Anon-RPC), Whitechain Scale, Arkiv Build (+ Swarm bonus). ENS is an optional add-on, not a pick.

## Locked design decisions (don't redesign without asking the human)
1. Two settlement paths, one market. **Path A:** EIP-8141 frame transactions on the EF alt-mempool devnet. **Path B:** gasless USDT on Whitechain Sepolia (1874).
2. **No shared treasury.** Path A: one `OctanePaymaster` EIP-1167 clone per maker (maker address as an immutable arg; each clone is staked). Path B: each maker relays from its own wallet and pays WBT.
3. **Path A frame layout (Layout 1, order per EF's PREFIX-010):** [0] `expiry_verify`: VERIFY to `EXPIRY_VERIFIER` (`0x…8141` on the devnet), flags 0x0, 8-byte deadline = quote `validUntil` (**must be first**); [1] `only_verify`: VERIFY sender → `APPROVE(execution)`; [2] `pay`: VERIFY maker's clone checks sender's USDC balance ≥ fee, frame 3 is `USDC.transfer(maker, fee)` (`FRAMEDATALOAD`), the expiry deadline ≤ `validUntil`, maker signature valid via a second signature entry and `SIGPARAM` (not `ecrecover`), cost cap via `TXPARAM(0x06)` → `APPROVE(payment)`. `fee` is flat on both paths; [3] SENDER fee transfer; [4..n] SENDER user calls. No VERIFY after the prefix. **Every clone must be staked** (an unstaked payer has no storage access): a maker-only `stake()` forwards value to `NaiveStakingRegistry.addStake(86400)` (> 0.01 ETH on the devnet). The sidecar's validation budget is a flat 100k gas across the prefix; `pay` with every check uses 54,769. **Layout 1b with EIP-3009 is blocked** (USDC's check uses `TIMESTAMP`). A `pre_verify` `transferFrom` after a one-time approval is admitted (`PreVerifyProbe.sol`), and is the upgrade path.
4. **Path B:** the test USDT supports **EIP-3009** (confirmed Nov 5). The payer signs `receiveWithAuthorization` (`to` = `OctaneRelay`) with nonce = `keccak256(abi.encode(quoteHash, merchant, amount, maker, feePayer, salt))`, where `quoteHash` is the EIP-712 digest. The relay requires `msg.sender == quote.maker`, recomputes the nonce, then atomically pays the merchant and the maker fee. Merchant-pays mode needs the merchant's EIP-712 opt-in `{merchant, amount, maxFee, orderId, expiry}`.
5. **Signed Quote (EIP-712)** `{maker, chainId, settlement, token, maxGas, fee, validUntil, nonce}`; domain `{name:"Octane", version:"1", chainId, verifyingContract: settlement}`. One definition in `contracts/src/lib/QuoteLib.sol` and one in `packages/sdk`, kept identical. Include a test that a TS-signed quote verifies in Solidity.
6. **Two clocks:** the Arkiv board entry lives ~30s (refreshed every ~10s); the signed `validUntil` is ~90–120s and is enforced on-chain.
7. **Arkiv entities** (plan 14.3): `quote` (one standing entity per maker per chain + token; one atomic `executeBatch` of patch + extension every ~10s; delete on shutdown, low inventory or shock), `request` (10s), `bid`, `fill` (indexer-owned, 30d), `maker` profile (maker-owned, 7d, transferable; publishes the relayer `endpoint`), `makerStats` (**indexer-owned**, so makers can't rate themselves). The UI and MCP **read Arkiv directly**; the indexer only writes.
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
| Whitechain Sepolia | chain 1874 · RPC `https://rpc.testnet.whitechain.io` (or Ankr) · explorer `https://explorer.testnet.whitechain.io` · faucet `https://faucet.testnet.whitechain.io` (docs: 0.5 WBT/24h) · USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` (6 decimals; no faucet, swap on Uniswap V3 pool `0x5645101Ca8d2F7BaBC27b10359555767a1BdF999`) · viem chain `whitechainSepolia` |
| Arkiv rabdi | chain 7794095 · `@arkiv-network/sdk` |

## Verify, don't guess
- **EIP-8141:** no viem support. Encode and submit frame transactions with the tooling in `forshtat/mempool-workshop` and `forshtat/mempool-workshop-sidecar` (`eth_sendFrameTransaction`). Check opcode names, frame modes and RPC methods against the EIP-8141 text and those repos. Never invent them.
- **Devnet token:** use the predeployed USDC (EIP-3009, same as Path B); a staked clone may read its proxy storage (STORAGE-032). Contracts follow the workshop's `@forshtat/hegota-support` patterns (`HegotaSupport`, `approve(Scope.PAYMENT)`, `sigparam`). Use `contracts/src/SponsorPaymaster.sol` and `ExampleWallet.sol` in `forshtat/mempool-workshop` as the starting reference.
- **EXPIRY_VERIFIER address:** the spec address `0x81413f…` has no code on the devnet. `0x0000000000000000000000000000000000008141` does, and ethrex hardcodes it. Recheck after any devnet reset.
- **Admission problems:** read the admission report (`skandha_explorer_getTransaction`). It names the violated rule and slot. Don't guess at fixes.
- **Arkiv SDK:** check the actual API and types before using them. There is no `update`: `patchEntity` never moves expiry, so batch it with an extension. Writes come from one serial queue per wallet, never auto-resent. Clients must check EIP-712 signer == `$owner` == `maker`, because anyone can copy a schema tag.
- **Whitechain USDT:** the EIP-712 domain is `{name:"Tether USD", version:"1", chainId:1874, verifyingContract:USDT}`, with no salt. `eip712Domain()` and `version()` revert, so assert the domain against `DOMAIN_SEPARATOR()`.
- If something can't be verified, **stop and ask the human**, and log the question in `docs/open-questions.md`.

## Conventions
- pnpm workspaces, TypeScript strict, Node 22+, viem; Foundry for contracts (`forge test`, `--gas-report`); Next.js + Tailwind.
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
Live list: `docs/open-questions.md`.
- **EF:** do the frame helpers work inside a clone on the live devnet · `pre_verify` `transferFrom` admission (late spike) · limits for ~50 SENDER frames · Anon-RPC support for Whitechain and Arkiv (fallback only).
- **Whitechain:** more WBT for makers. **Answered Nov 5:** payers get the test USDT by swapping WBT on the Uniswap V3 pool `0x5645101Ca8d2F7BaBC27b10359555767a1BdF999` (WWBT/USDT, 0.3% fee) through SwapRouter02 `0xe208cC685cD95D56E8ec6DEC9816476567fc6962`; no faucet or public mint found. USDT is a proxy to verified `TetherTokenV2` (has `receiveWithAuthorization`, `DOMAIN_SEPARATOR()`, no `eip712Domain()`). Verify contracts with `forge verify-contract --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/` (the `/api/` suffix is required).
- **Arkiv:** does a 10s `request` hold up · Swarm postage batch.
