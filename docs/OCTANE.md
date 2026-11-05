# OCTANE: the complete build file (v4.0)

> One file for the whole project: build instructions for Claude Code (Part 0) and the full plan (Part 1).
> Octane is an open gas market: AI market makers compete to pay users' gas, payers (humans in our wallet app, or AI agents via our MCP server) hold only stablecoins and repay the maker in the same transaction, and live quotes, requests, bids and ratings sit on Arkiv. AI on both sides, no operator, no shared treasury.

## How to use this file (for the human)
1. Put this file at the root of an empty repo as `OCTANE.md`, after hacking officially starts.
2. Open Claude Code in the repo and type: **"Read OCTANE.md completely. Then do Milestone M0."**
3. After each milestone, check what it shows you, then type: **"Next milestone."** (or name one: "Do M4").
4. Optional, to go faster: run 2–3 Claude Code sessions in parallel (git worktrees) and tell each one which track it owns (see 0.7), for example: **"Read OCTANE.md. You are Session 2. Do M3."**
5. When an open question gets answered (0.8), tell Claude Code; it updates this file and `CLAUDE.md`.

---

# PART 0: BUILD INSTRUCTIONS FOR CLAUDE CODE

## 0.1 How you work
- **One human builder**, acting as integrator and reviewer. Explain what you did in plain words.
- **Stop and show** at the end of every milestone: test output, admission reports, explorer links. **Never deploy or send a transaction without the human's go-ahead** in that milestone.
- **Commit at least hourly**: small commits, clear messages, no squashing (Whitechain judges steady progress).
- **Never commit keys.** Secrets live only in `.env` (gitignored). Keep `.env.example` complete. Ask the human to fill in keys; never invent or reuse published keys for staking.
- **Verify, don't guess** (see 0.5). If something can't be verified, stop, ask, and log it in `docs/open-questions.md`.
- **Part 1 is the reference.** "§14.4" means section 14.4 of Part 1. If Part 0 and Part 1 disagree, Part 0 wins; tell the human.
- **Nothing is cut.** If time runs short, ask the human which item to drop; don't decide alone. Keep all AI features.

## 0.2 Hackathon rules (non-negotiable)
- ETHGlobal Mumbai: **all project code is written during the event**. Arkiv requires "from scratch". Never paste pre-event project code. Reading or adapting open-source reference code (e.g. EF's workshop repo) is fine; credit it in the README.
- Public GitHub repo, MIT license, README with an **AI usage disclosure**.
- Prize picks: **EF Frame Transaction Alternative Mempool** (fallback: EF Anon-RPC), **Whitechain Scale**, **Arkiv Build** (+ Swarm bonus). ENS is an optional add-on, not a pick.
- Wording everywhere (UI, README, pitch): never "gas-free" or "no gas". Say **"no gas token needed; one fee in stablecoins"**.

## 0.3 Locked design decisions (don't redesign without asking)
1. **Two settlement paths, one market.** Path A: EIP-8141 frame transactions on the EF alt-mempool devnet. Path B: gasless USDT on Whitechain Sepolia (chain 1874).
2. **No shared treasury.** Path A: one `OctanePaymaster` EIP-1167 clone per maker, maker address as an immutable arg, **each clone staked**. Path B: each maker relays from its own wallet and pays WBT.
3. **Path A, Layout 1** (order per EF's PREFIX-010): [0] `expiry_verify` (VERIFY → `EXPIRY_VERIFIER`, flags 0x0, deadline = quote `validUntil`, **must be first**) · [1] `only_verify` (VERIFY sender → `APPROVE(execution)`) · [2] `pay` (VERIFY maker's clone: sender's USDC balance ≥ fee, frame 3 is `USDC.transfer(maker, fee)` via `FRAMEDATALOAD`, expiry deadline ≤ `validUntil`, quote signature valid → `APPROVE(payment)`) · [3] SENDER fee transfer · [4..n] SENDER user calls. No VERIFY frame after the prefix. **Clones must be staked** (an unstaked payer has no storage access): a maker-only `stake()` forwards value to `NaiveStakingRegistry.addStake(86400)` (> 0.01 ETH on the devnet).
   **Layout 1b (P1):** a `pre_verify` frame (DEFAULT mode, target = the clone) right before `pay` pulls the fee with the user's EIP-3009 authorisation; `pay` checks that frame's status. Test admission before relying on it.
4. **Path B:** the official test USDT supports **EIP-3009** (confirmed Nov 5). The payer signs `receiveWithAuthorization` (`to` = `OctaneRelay`) with nonce = `keccak256(quoteHash, merchant, amount, maker)`. The relay requires `msg.sender == quote.maker`, recomputes the nonce, then atomically pays the merchant and the maker fee. Merchant-pays mode requires the merchant's EIP-712 opt-in `{merchant, amount, maxFee, orderId, expiry}`.
5. **Signed Quote (EIP-712):** `{maker, chainId, settlement, token, maxGas, fee, validUntil, nonce}`; domain `{name:"Octane", version:"1", chainId, verifyingContract: settlement}`. Defined once in `contracts/src/lib/QuoteLib.sol` and once in `packages/sdk`, kept identical, with a test that a TypeScript-signed quote verifies in Solidity.
6. **Two clocks:** the Arkiv board entry lives ~30s (refreshed every ~10s); the signed `validUntil` is ~90–120s and is enforced on-chain.
7. **Arkiv entities (§14.3):** `quote` (one standing entity per maker per chain + token; update + extend every ~10s; delete on shutdown, low inventory or shock) · `request` (10s) · `bid` · `fill` (indexer-owned, 30 days) · `maker` profile (maker-owned, 7 days, transferable) · `makerStats` (**indexer-owned**, so makers can't rate themselves). The UI and MCP **read Arkiv directly**; the indexer only writes.
8. **AI decides, contracts enforce.** Fee = formula with hard caps (§14.5). The LLM only picks a bounded regime buffer (calm / spiky / shock, 0–50%) and writes journal lines. The user always signs a max fee.
9. All maker and agent display and checks go through `resolveIdentity()` in `@octane/sdk` (returns the address for now; ENS plugs in later, §18).

## 0.4 Networks and addresses
| Network | Details |
|---|---|
| **EF alt-mempool devnet** | chain **1337**, 6s blocks · execution RPC (canonical path) `https://altmempool.forshtat.com` · **mempool RPC `https://altmempool.forshtat.com/rpc`** (`eth_sendFrameTransaction`; admission report `skandha_explorer_getTransaction`) · explorer `https://explorer.altmempool.wtf/` · **no faucet**: fund your own key from the shared genesis key (sidecar repo `deploy/devnet/genesis.values.env`; EF's quickstart `step_1_check` does it); a transfer to a new account needs ≥ 204,600 gas · **USDC** `0xEFe0D421fD473564c9C9b0cDCeB194cF476D6AF5` (FiatTokenV2_2, EIP-3009 + permit; mint with the published deployer key) · **staking registry** `0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f` · `EXPIRY_VERIFIER`: the sidecar uses `0x…8141` but marks it a placeholder, so verify it · **may reset any time; addresses can change** |
| **Whitechain Sepolia** | chain **1874** · RPC `https://rpc.testnet.whitechain.io` (or Ankr; Ankr blocks filter methods, use `eth_getLogs`) · explorer `https://explorer.testnet.whitechain.io` (contracts must be verified) · faucet `https://faucet.testnet.whitechain.io` (0.1 WBT/24h; GitHub ≥ 30 days; non-zero mainnet ETH balance) · **USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`** (EIP-3009 ✅; self-minted tokens don't count) |
| **Arkiv rabdi** | chain **7794095** · `@arkiv-network/sdk` · faucet + access keys (see Arkiv docs) · Arkiv also offers an MCP server / Claude Code plugin |
| **References** | EF workshop `https://github.com/forshtat/mempool-workshop` (clone to `../ref/mempool-workshop`, outside this repo) · sidecar `https://github.com/forshtat/mempool-workshop-sidecar` · docs `https://docs.altmempool.wtf/` |

## 0.5 Verify, don't guess
- **EIP-8141:** no viem support. Encode and submit frame transactions the way EF's workshop does (`src/lib/frameTx/*` in `forshtat/mempool-workshop`). Contracts follow its `@forshtat/hegota-support` patterns (`HegotaSupport`, `approve(Scope.PAYMENT)`, `sigparam(...)`); start from its `SponsorPaymaster.sol` and `ExampleWallet.sol`. Never invent opcodes, frame modes or RPC methods.
- **Admission failures:** read the admission report (`skandha_explorer_getTransaction`). It names the violated rule and slot.
- **Arkiv SDK:** check the real API and types (create / update / extend / delete / transfer, expiry units, query, ordering, pagination) before using them.
- **Whitechain USDT:** read `decimals()` and the EIP-712 domain (`eip712Domain()` or the verified source) from chain. Never hardcode a guess.
- Token amounts are `bigint` in base units; never floats.

## 0.6 Milestones (do them in order; stop and show at each "Done when")
Hours are targets for a ~36h hackathon. Priority: **P0** = M0–M9, **P1** = M10, **P2** = M12. **Hour-14 gate** at M3.

**M0 · Setup (h 0–1)**
- Monorepo skeleton per §14.8: pnpm workspaces; `contracts/` (Foundry), `packages/sdk`, `packages/mcp`, `apps/makers`, `apps/web` (Next.js + Tailwind), `apps/indexer`, `scripts/`, `arkiv/`, `docs/`.
- `LICENSE` (MIT), `README.md` skeleton (sections: what it is, architecture, explorer links, "why onchain stablecoin settlement on Whitechain", how to run, Arkiv writer wallets + a runnable query, AI usage disclosure, credits), `.gitignore` (includes `.env`), `.env.example` listing every variable (wallet keys per role, RPC URLs, LLM API key, Arkiv keys, Swarm later).
- Create a short **`CLAUDE.md`** at the root containing 0.1–0.5 of this file plus the line "Full instructions: OCTANE.md", so future sessions load the essentials automatically.
- Create `docs/open-questions.md` from 0.8.
- **Done when:** the skeleton builds and is committed. Tell the human which keys and tokens to put in `.env` (see the table in 0.8).

**M1 · Shared quote library (h 1–2)**
- `contracts/src/lib/QuoteLib.sol`: Quote struct, EIP-712 hashing, signature verification.
- `packages/sdk/quotes`: same types, EIP-712 signing with viem, `resolveIdentity()` stub (`packages/sdk/identity`).
- Cross-compat test: a quote signed in TypeScript verifies in Solidity.
- **Done when:** tests pass.

**M2 · Path B contract and first payment (h 2–5)**
- Read the test USDT's `decimals()` and EIP-712 domain from chain 1874; record them in `docs/open-questions.md`.
- `OctaneRelay.sol` (§6, §14.4, §17.9): quote check, binding nonce, `msg.sender == quote.maker`, `receiveWithAuthorization`, atomic split to merchant and maker, merchant-pays with opt-in.
- Foundry tests: wrong maker, expired quote, reused or unbound nonce, tampered amount or recipient, merchant-pays without opt-in, happy path (mock EIP-3009 token).
- **Stop: show test results.** After the human's go-ahead: deploy and **verify** on 1874; script one real USDT payment (payer signs, maker submits); put the explorer link in the README.
- **Done when:** a verified contract and a real USDT payment explorer link exist.

**M3 · Path A spike (h 2–14, can run in parallel; HOUR-14 GATE)**
- The human first runs EF's quickstart steps 1–8 in `../ref/mempool-workshop` (funding, sponsored tx, canonical rejection, staking, alt admission).
- `OctanePaymasterFactory.sol` + `OctanePaymaster.sol` (EIP-1167 clone, maker as immutable arg, maker-only `stake()` → registry `addStake(86400)`, maker-only withdraw). Start **minimal**: approve payment only, like `SponsorPaymaster`.
- Script: deploy factory + one clone, fund it, stake it, build a Layout 1 frame transaction (expiry first) paying a tiny USDC fee from a payer, then submit it **twice**: `eth_sendRawTransaction` (canonical → expect rejection) and `eth_sendFrameTransaction` (alt mempool → expect admission). Save both results.
- **Done when:** one sponsored frame transaction is admitted, with an explorer link, plus the canonical rejection reason.
- **If not done by hour 14:** tell the human. Fallback FB1 replaces M3/M7 (§8): Path B becomes the whole product, the app's RPC reads go through Anon-RPC (`@anon-rpc/browser-harness`), and the EF pick switches to Anon-RPC.

**M4 · Arkiv board (h 5–8)**
- Check the Arkiv SDK API. Implement the `quote` entity (§14.3) with owner = maker wallet.
- Test and record: does `update` extend expiry, or is a separate `extend` needed? Expiry units? (Fallback if neither fits: a new 30s entity per refresh.)
- `apps/web` board page reading Arkiv directly: live quotes per chain, best price highlighted, countdown.
- **Done when:** a test quote appears on the board and disappears ~30s after its last refresh.

**M5 · AI makers (h 6–10)**
- `apps/makers`: pricing engine (§14.5: gas estimate × forecast basefee × (1 + buffer) × token price + spread + inventory skew, clamped); the LLM regime call (calm / spiky / shock → buffer 0–50%, strict JSON, fallback to "spiky" on error); EIP-712 quote signing; the standing-quote loop (create, update + extend every 10s, delete on shutdown, low inventory or shock); a journal line per decision.
- Three makers from config: Cautious, Aggressive, Balancer (different spreads and risk). Use the LLM API key from `.env`.
- **Done when:** three makers' prices update live on the board, with journal lines in the logs.

**M6 · Makers as Path B relayers (h 10–14)**
- `packages/sdk/pathB`: build and sign the EIP-3009 authorisation with the binding nonce for a chosen quote.
- Maker relayer endpoint: receive a signed job, simulate first (griefing shield, basic version), submit `relay(...)`, pay WBT, return the tx hash.
- Script: a payer reads the board, picks the best quote, signs, and the chosen maker relays.
- **Done when:** a payment chosen from the board settles on Whitechain end to end.

**M7 · Path A full checks (h 14–20)**
- The clone's `pay` checks: USDC balance ≥ fee, frame 3 is `USDC.transfer(maker, fee)`, expiry deadline ≤ `validUntil`, quote signature, per-transaction cost cap.
- `packages/sdk/pathA`: build Layout 1 for any quote; submit; fetch the admission report.
- **Done when:** a full-check transaction is admitted, a tampered one is rejected with a clear reason, and both are shown.

**M8 · MCP server (h 14–18)**
- `packages/mcp`: tools `get_gas_quote(chain)`, `send_sponsored(chain, to, amount)` (Whitechain first; EF devnet once M7 works), `post_gas_request` (stub until M10), per-agent spend caps (off-chain).
- Demo script: a Claude agent with only USDT pays 3 contributors 5 USDT each.
- **Done when:** the agent demo produces 3 explorer links with zero WBT in the agent wallet.

**M9 · Wallet and concierge (h 16–22)**
- `apps/web` payer flow: embedded key, no seed phrase; type "Pay Rahul 10 USDT" (Hinglish works); the concierge (LLM → structured intent) picks the best quote across makers and chains and explains it ("Fee 0.05 USDT. Maker B is cheapest."); Confirm → sign → maker relays → receipt with explorer link. Show the payer's WBT = 0 before and after.
- **Done when:** a human payment works from the UI on Whitechain (Path A too if M7 is done).

**M10 · P1, in this order (h 22–30); ask the human before skipping any**
1. Journals → Swarm (hash-linked files, `journalRef` in the maker profile; postage batch from the booth) + `arkiv/swarm.md`
2. Merchant-pays mode in the UI (the contract already supports it)
3. Griefing shield, full version (abandoners, sybil bursts, revert simulation)
4. Indexer (`fill` + `makerStats`) + `scripts/recompute-fade.ts` (§14.3)
5. Paginated fill history (maker statement, "my gas spend") + MCP `get_fill_history`
6. Agent-to-agent auctions on Arkiv (`request` / `bid` / winner, §14.4)
7. Path A Layout 1b (`pre_verify` fee pull), only if admitted on the devnet
8. Agents on Path A + batched payouts (§14.4)
9. Fade detector in the concierge
10. Maker profile transfer on key rotation

**M11 · Submission (h 30–36)**
- README complete: explorer links (Whitechain payment, EF admitted tx + canonical rejection), "why onchain", writer wallets + runnable Arkiv query, `pnpm recompute-fade` instructions, AI disclosure, credits.
- `arkiv/schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md` (map all four principles, §13.3), `swarm.md`.
- `WHITECHAIN_FEEDBACK.md`; EF design write-up (design, code, tradeoffs incl. the settle-revert risk and Layout 1b, §14.4, §14.6).
- Demo checklist for the human's video (§9): payer, maker/relayer and merchant on screen; 2–4 minutes for Whitechain.

**M12 · P2, only if time is left**
ENS add-on layers 1–2 (§18) · "wait to save" advice · maker evolution leaderboard.

## 0.7 Optional parallel sessions (git worktrees)
- **Session 1 (Path B + makers' relaying):** M1 → M2 → M6
- **Session 2 (Path A):** M3 → M7
- **Session 3 (Arkiv + AI + apps):** M4 → M5 → M8 → M9
- The human merges. M0 must be finished first. M10 and M11 go back to one session.

## 0.8 What the human must provide, and open questions
| Needed | How |
|---|---|
| Fresh test wallets: deployer, 3 makers, 1–2 payers, indexer | `cast wallet new`. Never real wallet keys. |
| WBT for deployer and makers | Whitechain faucet (limits in 0.4) |
| Test USDT for payers | ⚠ **Open:** ask Whitechain (booth or Discord) |
| EF devnet ETH | EF quickstart `step_1_check` |
| Devnet USDC for payers | Mint with the published deployer key (sidecar repo) |
| Arkiv funds / access key | Arkiv faucet and docs |
| LLM API key | Anthropic (or 0G credits) |
| Swarm postage batch (M10) | Arkiv/Swarm booth |

**Open questions** (keep `docs/open-questions.md` current):
- Whitechain: where payers get test USDT · how to verify contracts on the L2 explorer (verifier type, URL) · more WBT for makers.
- EF (test on the devnet): can a staked payer write the sender's USDC slots in a `pre_verify` pull (Layout 1b)? · exact `EXPIRY_VERIFIER` address and data format · limits for ~50 SENDER frames · Anon-RPC support for Whitechain and Arkiv (fallback only).
- Arkiv: does `update` extend expiry · reading past entity versions (for `recompute-fade`) · ordering and pagination syntax · `transfer` in the SDK · backend-sponsored writes owned by the maker wallet.
- ENS (add-on only): bonus terms · ENSv2 on Sepolia addresses.

---

# PART 1: FULL PLAN (reference)

> Plan version v3.4 (2026-11-05). Section numbers below are what Part 0 calls "§".


> **"Gas for the agent economy. AI agents pay for gas in stablecoins, and AI market makers compete to supply it, on an open trading floor (Arkiv) with no company in the middle. It works on Ethereum's next-gen frame transactions *and* on today's L2s."**
>
> The AI pitch in one line: **AI agents on both sides of the market.** The buyers are agents that hold stablecoins but no gas tokens. The sellers are AI market makers. They trade through expiring quotes and auctions on Arkiv.

**v2 change (2026-11-02):** 1inch Aqua was dropped (too hard for the team). Its replacement is **Whitechain ⚡ Scale: "Payments Nobody Notices"**, another **thin** track whose brief is almost exactly this product. Makers now just hold tokens in their own wallets and approve a small settlement contract. That's plain ERC-20 work, with no Aqua or SwapVM.

**v3 changes (2026-11-04):**
- **Prior art:** added EIP-8141's own ERC-20 sponsor example (Example 3), EF's canonical-paymaster policy and a fuller OpenGSN comparison; the claim is narrowed to "an open, multi-maker, operator-less market".
- **Path A:** one paymaster clone per maker (EIP-1167 factory); WETH removed; no shared treasury on either path.
- **Path A frames:** Layout 1 (verify → verify paymaster → settle → action) is the default; Layout 2 is marked not allowed; the settle-revert risk is stated as an explicit tradeoff.
- **Path B:** maker-bound EIP-3009 nonce against multi-relayer griefing.
- **Path B fallback:** EIP-7702 first, CREATE2 smart account second.
- **Quote timing:** two clocks: Arkiv board expiry ~30s, signed onchain validity ~90–120s.
- **AI layer:** every feature kept; clearer "load-bearing" links, precise MCP spend caps, pitch emphasis per booth.
- **Build plan:** a P0/P1/P2 priority ladder (nothing cut, only ordered).
- **Workshops, Q&A, pitch:** new workshop questions, 9 new judge Q&As (27–35), pitch slides 4 and 9 updated.
- **Fact-check:** checked against the EIP-8141 text on 2026-11-04, including its mempool rules (merged from lightclient's [EIPs PR #11415](https://github.com/ethereum/EIPs/pull/11415)).

**v3.1 (2026-11-04, review fixes):**
- **Removed** the paymaster's "own ETH deposit ≥ maxCost" check: it needed the banned `SELFBALANCE`, and the protocol already rejects an underfunded paymaster (`APPROVE(payment)` reverts → transaction invalid).
- **New:** quote expiry on Path A uses the spec's canonical **`EXPIRY_VERIFIER` frame**, because `TIMESTAMP` is banned in validation everywhere else.
- **New:** the maker's address is an **immutable argument** in the clone's bytecode, so validation does no `SLOAD` on the clone. The **only** rule-breaking read left is `USDC.balanceOf(user)`.
- **EF argument reworded precisely:** we break the "`SLOAD` only on `tx.sender`" rule by reading the USDC contract's storage. The `BALANCE` ban is about the ETH opcode, not ERC-20 balances.
- **Removed ⚠ marks** for facts now confirmed in the EIP (storage rule, banned opcodes, the pending-tx cap, PR #11415). Kept as inference: whether a canonical paymaster can check ERC-20 repayment.
- **New: merchant-pays mode** on Whitechain (`feePayer = merchant`, with the merchant's signed opt-in).
- **Fixed:** the 17.8 fallback reference, the "v2" label in the ratings, the "every track is thin" wording; added an EF checklist item for proof of public-mempool rejection.

**v3.2 (2026-11-04, Arkiv's four principles):** the Arkiv team said strong entries use their four principles: **Queryable, Time-scoped, Tamper-proof, Wallet-owned**. Section 13.3 now maps each one to something users see. Nothing is cut; every AI feature stays.
- **Standing quotes (time-scoped + wallet-owned):** each maker owns **one quote entity per chain and token**. It **updates** it in place every ~10s and **extends** its expiry to ~30s from now each time. A crashed maker's quote leaves the board within 30s with no cleanup job (expiry as a liveness signal). A maker's AI **deletes** its quote at once on clean shutdown, low inventory or a shock regime. A planned key rotation **transfers** the maker profile to the new wallet. Makers now use all four owner operations.
- **Tamper-proof reputation:** fade score, uptime and coverage can be recomputed by anyone from the quote's public write history plus onchain fills and balances (`scripts/recompute-fade.ts`). **Ownership bug fixed:** `fadeScore` used to sit in the maker-owned profile, so a maker could rate itself. Stats now live in a separate **indexer-owned `makerStats`** entity.
- **Direct reads (queryable):** the wallet board, the leaderboard and every MCP tool query Arkiv directly. Our indexer only writes. New **paginated fill history** (maker statement and "my gas spend"), plus a new MCP tool, `get_fill_history`.
- **Swarm journals moved P2 → P1**, as a hash-linked chain of unencrypted journal files. The **indexer moves P2 → P1** too, because the fill history and `makerStats` are its entities.
- **Also updated:** data loop, AI layer, demo (kill a maker live), build plan, Arkiv booth questions, checklist, schema, security, repo, Arkiv booth pitch, new judge Q&As 37–42.

**v3.3 (2026-11-05, workshop day):**
- **Renamed Indhan → Octane** everywhere, including contracts (`OctaneRelay`, `OctanePaymaster`, `OctanePaymasterFactory`, `OctaneExecutor`, `OctaneAccount`), packages (`@octane/sdk`) and the repo. If the team picks another name, one find-and-replace on "Octane"/"octane" switches it.
- **Whitechain answered (Nov 5 workshop): the official test USDT supports EIP-3009.** Path B uses `receiveWithAuthorization` as designed. The EIP-7702 and CREATE2 fallbacks stay only as contingency. Still to confirm: where payers get the test USDT, how to verify contracts on the L2 explorer, and more WBT for maker wallets.
- **EF devnet facts added** (section 19): chain ID, endpoints, workshop repo and sidecar, ERC-8421 storage and staking rules, and why to deploy our own plain ERC-20 on the devnet.
- **Agents on Path A + batched payouts** (new 14.4 subsection, P1): one frame transaction can carry about 60 payments with one maker fee.
- **ENS add-on** (new section 18, P2, not one of the three prize picks): ENS names for makers and agents, with a `resolveIdentity()` hook in the SDK from day one (P0, trivial).
- **Anon-RPC fallback detail** (section 8): the prize requires the app's RPC reads to go through Anon-RPC by default; worker support for Whitechain and Arkiv is unconfirmed.
- **Workshop table** (section 11) updated with answered and still-open questions, in the technical wording used with each team.

**v3.4 (2026-11-05, evening): solo builder + EF answers from their own docs and repos**
- **Solo build plan** (section 10): one builder running 2–3 parallel Claude Code sessions as the integrator. Nothing cut; the P1 order is set for what fits first.
- **EF answers found in docs.altmempool.wtf and the workshop/sidecar repos** (new 19.0). Key changes:
  - **The paymaster clone must be staked.** In the standard alt mempool an unstaked payer has no storage access; staked + ACTIVE can read any non-entity storage (STORAGE-032) and has no pending cap. Devnet stake: > 0.01 ETH via `NaiveStakingRegistry.addStake(86400)`, and a contract must call `addStake` itself, so each clone gets a maker-only `stake()`.
  - **Frame order fixed:** `expiry_verify` comes **first**, then the sender's `only_verify`, then the paymaster's `pay` (PREFIX-010).
  - **The settle-revert risk has a documented fix:** a `pre_verify` frame right before `pay` can pull the ERC-20 fee during validation, and the paying frame checks its status (P1 upgrade, Layout 1b).
  - **Devnet USDC is real FiatTokenV2_2** (permit + EIP-3009), mintable with the published deployer key, so Path A and Path B both use EIP-3009.
  - **Endpoints corrected:** mempool RPC `https://altmempool.forshtat.com/rpc`, execution RPC `https://altmempool.forshtat.com`. There's no faucet: fund from the shared genesis key (the workshop's `step_1_check` does it). Transfers to new accounts need ≥ 204,600 gas.

---

## 📑 Contents
- **0. Octane explained in plain words** ← start here
- 1. Ratings · 2. Prior art · 3. Problem · 4. Solution · 5. Partners (summary) · 6. Data loop · 7. AI layer · 8. Safety net · 9. Demo script · 10. Build plan · 11. Workshop questions · 12. Submission checklist
- **13. Partner deep dives** (what each one is, what it does, what it offers, why we use it)
- **14. System architecture and design** (components, contracts, data model, sequence flows, security, tech stack, repo)
- **15. Pitch deck** (12 slides with speaker notes, plus a 30-second version)
- **16. Judges' questions and answers** (42 questions)
- **17. "Isn't this what Uniswap or Jupiter already do?"** How Octane differs from UniswapX, Jupiter, CoW and paymasters
- **18. ENS add-on** (P2, outside the three prize picks)
- **19. Facts checked on Nov 5** (endpoints, rules and sources for builders)

---

## 0. Octane explained in plain words

### The analogy: a fuel market
Every blockchain action needs **fuel ("gas")**, and you can only pay for it with the chain's own **fuel coupon** (ETH on Ethereum, WBT on Whitechain). Most people, and most AI agents, hold **digital dollars** (USDT/USDC), not fuel coupons. So they're stuck.

Today the fix is like **one petrol-pump company in town**: it sells you fuel for dollars, but it sets the price, can refuse you, and if it shuts down, you're stuck again.

**Octane turns that into an open fuel market**:
- Many independent **AI-run pumps** (the "makers") post their prices on a **public board** that refreshes every few seconds.
- Prices expire on their own, so you never see a stale price. If a pump goes offline, its price disappears from the board within 30 seconds.
- Every price ever posted stays on the public record, so anyone can check which pumps are reliable. Nobody has to take our word for it.
- You pay in **the digital dollars you already have**. The cheapest pump fuels your transaction, and it's paid back in the same instant.
- No company sits in the middle, and there's no shared pot of fuel money for anyone to steal.

### Who's involved
| Role | Who | What they want |
|---|---|---|
| **Payer** | A person (through our wallet app) or an **AI agent** (through our MCP tool) holding only stablecoins | To send money or act onchain without buying a gas token |
| **Maker** | An **AI agent** with its own wallet holding ETH/WBT | To earn a small fee for supplying gas |
| **Board** | **Arkiv**, a public database chain | Holds prices ("quotes"), requests and bids, each one expiring on its own |
| **Settlement** | Smart contracts on the **EF alt-mempool devnet** (Path A) and on **Whitechain** (Path B) | Make sure the payer pays, the maker is repaid, and nobody can cheat, all in one transaction |

### One example, step by step (Path B, Whitechain)
1. Priya has **50 USDT and zero WBT**. She types "Pay Rahul 10 USDT" into the Octane app.
2. The **AI concierge** reads the board: Maker A asks 0.08 USDT, Maker B 0.05, Maker C 0.07 (expiring in 4s). It picks **B** and says: *"Fee 0.05 USDT. Maker B is cheapest."*
3. Priya taps **Confirm**. Her app signs a **gasless authorisation** ("allow 10.05 USDT to move"). It's a signature, not a transaction, so she pays no gas.
4. **Maker B's AI agent** submits it to our **OctaneRelay** contract and pays the WBT gas from its own wallet.
5. In one atomic transaction, the contract sends **10 USDT to Rahul** and **0.05 USDT to Maker B**. If anything doesn't match, everything is cancelled.
6. Priya never saw a gas token or a seed phrase, and didn't need to know which chain she was on.

**Path A (EF alt mempool)** works the same way for Ethereum's next-generation **frame transactions**: **the winning maker's own paymaster** (one small paymaster contract per maker, holding only that maker's ETH) pays the ETH gas, and the user's USDC repays that maker inside the same transaction. A paymaster that checks the user can repay in USDC, and serves many users at once, is **only accepted by the alt mempool**.

### Why it's crazy (and new)
- **AI on both sides of a market.** AI agents *buy* gas (through MCP) and AI makers *sell* it, trading through expiring quotes and agent-to-agent auctions on Arkiv.
- **No operator.** Unlike Pimlico, Coinbase or Circle, nobody owns the pump.
- **No treasury to drain.** Each maker risks only its own wallet (Path B) or its own paymaster deposit (Path A).
- **It uses tech that only became testable recently:** EIP-8141 frame transactions on the alt-mempool devnets.

---

## 1. Ratings (3 partners, crypto-native, 1–5)

| Idea | Partners | Crazy | Low crowd | Not built | Buildable | Track fit | **/25** |
|---|---|---|---|---|---|---|---|
| **⭐ Octane v3** | EF Alt Mempool 🟢🟢 · **Whitechain Scale 🟢** · Arkiv Build 🟢 | 5 | 5 | 4 | **3** | 5 | **22** |
| Octane v1 (with 1inch) | EF Alt Mempool · 1inch Aqua · Arkiv | 5 | 5 | 5 | 2 | 5 | 22, but dropped: 1inch is too hard for the team |
| Kavach | EF Alt Mempool · Arkiv · ENSv2 🟡 | 5 | 4 | 5 | 1 | 4 | 19 |
| Mandi | needs 1inch | — | — | — | — | — | dropped (depends on 1inch) |

"Not built" is 4 rather than 5 because decentralized relayer networks existed before (OpenGSN), and EIP-8141 itself sketches an ERC-20 sponsor. See section 2.

**Expect more competitors than these crowd estimates suggest:** ERC-20 paymasters are EF's own listed example, and "permit/3009 + your own relayer" is Whitechain's first listed idea. **Our differentiator is the competing-maker market**, not the paymaster or the relayer by itself.

## 2. Prior art (honest)

| What exists | How Octane differs |
|---|---|
| ERC-20 paymasters run by **one company with its own money and price API**: [Pimlico](https://docs.pimlico.io/infra/paymaster/erc20-paymaster/architecture), [Coinbase CDP](https://docs.cdp.coinbase.com/paymaster/guides/erc20-gas-payments.md), [Biconomy](https://gist.github.com/talhamalik883/d4317e90f1e4a0618d967fabb6148b97) | An **open market**: any wallet or AI agent can be a gas maker; quotes compete; no operator |
| **EIP-8141 itself** includes an ERC-20 sponsor ([Example 3](https://eips.ethereum.org/EIPS/eip-8141)): VERIFY(sender, approve execution) → VERIFY(sponsor checks the **next frame** is an ERC-20 transfer of the right size to it, then approves payment) → SENDER `transfer(sponsor, fees)` → the user's call → optional post-op. The spec notes the sponsor accepts front-running risk (the user can empty the balance before inclusion). Also discussed on [Ethereum Magicians](https://ethereum-magicians.org/t/eip-8141-frame-transaction/27617?page=5). | **"ERC-20 paymaster on frames" is not new.** Our claim is narrower: we found no **open, multi-maker, operator-less market** for it. |
| **EF's preferred public-mempool policy: the "canonical paymaster"**, from lightclient's ["Mempool Strategies for EIP-8141"](https://hackmd.io/@matt/frame-mempool) (Strategy 2), now merged into the EIP via [EIPs PR #11415](https://github.com/ethereum/EIPs/pull/11415) (*"Update EIP-8141: add mempool policy"*; it relies on a canonical paymaster contract instead of 7562-style staking and reputation). Per the note, its funds leave only via gas or a delayed withdrawal, and nodes reserve pending balance per paymaster instance. **In the EIP's mempool rules (verified):** during validation, `SLOAD` may only read **`tx.sender`'s storage**; unstable opcodes are banned (including `BALANCE`, `SELFBALANCE` and `TIMESTAMP`; `TIMESTAMP` is allowed only inside the canonical `EXPIRY_VERIFIER` frame); and a non-canonical paymaster gets at most **1 pending transaction** (`MAX_PENDING_TXS_USING_NON_CANONICAL_PAYMASTER = 1`). **Our inference (not stated in the spec):** a canonical paymaster can't check during validation that the user can repay in ERC-20. | Our per-maker paymaster reads `USDC.balanceOf(user)`. That's **another contract's storage** (the USDC contract's, not `tx.sender`'s), so it breaks the `tx.sender`-only storage rule. (The `BALANCE` ban is about the ETH-balance opcode, not ERC-20 balances; we don't rely on it.) It also needs **many** pending transactions, not 1. **So only the alt mempool admits us. This is our core EF argument.** |
| **OpenGSN** (Gas Station Network, 2019 onward): permissionless, **competing relayers and paymasters**. It largely faded; our read is that relayer economics and demand were weak. | Why it can work now: **AI-agent demand** (agents hold stablecoins and transact constantly) · **L2 gas is nearly free**, so a maker's spread is close to pure margin · **no relay-hub stake** to join, just post quotes · **expiring quotes on Arkiv** instead of an onchain relayer registry · plus frame-transaction paymasters (EIP-8141) and USDT fees. We found nothing like this at ETH hackathons. |
| **"Gas for AI agents" MCP servers**, all single-operator: [Circle USDC-gas MCP](https://app.unpkg.com/circle-mcp-server@1.0.10/files/README.md), [Universal Gas Framework](https://glama.ai/mcp/servers/TychiWallet/ugf-mcp/tree), [AgentGas](https://dev.to/devxtools/give-your-ai-agent-gas-on-any-chain-with-one-x402-call-3in4), [Pimlico for agents](https://www.pimlico.io/solutions/ai-agents.md), ZeroDev UltraRelay | **Agents paying gas in stablecoins isn't new.** What's new is that Octane's MCP routes agents to an **open, competing market** instead of one company's paymaster |
| **Agent auctions** for tasks or API calls: [Bido](https://lablab.ai/ai-hackathons/nano-payments-arc/bido/bido-arc), [SkillBid](https://lablab.ai/ai-hackathons/nano-payments-arc/codecrackers/skillbid), [Agent Auction Protocol](https://chain.link/hackathon/winners/agent-auction-protocol) (a Chainlink hackathon winner) | None auction **gas sponsorship** among competing AI relayers. That combination wasn't found anywhere. |

## 3. The problem (purely web3)
1. **"I have USDC/USDT but no ETH or WBT, so I can't do anything."** The most common onboarding failure in crypto.
2. **Today's fix is centralised:** one company's paymaster or relayer sets the price, can censor you, can go down, and keeps its own gas treasury that someone has to fund and protect from being drained.
3. **On Ethereum's next-gen frame transactions (EIP-8141)**, an ERC-20 paymaster that **checks the user can actually repay** (by reading their USDC balance) and **serves many users at once** doesn't fit the public mempool. The spec caps non-canonical paymasters at 1 pending transaction, and its mempool rules only let validation read `tx.sender`'s storage, while the user's USDC balance lives in the USDC contract's storage. Only the **alt mempool** can carry it.

## 4. The solution
**Octane is one open gas market with two settlement paths:**

| | **Path A: Ethereum next-gen** (EF alt-mempool devnet) | **Path B: today's L2s** (Whitechain Sepolia, chain 1874)| 
|---|---|---|
| User holds | USDC only, 0 ETH | USDT only, 0 WBT |
| User does | Signs a **frame transaction** | Signs a **gasless authorisation bound to one maker** (EIP-3009 `receiveWithAuthorization`, or EIP-2612 permit; fallback: EIP-7702, below) |
| Who pays gas | **The winning maker's own paymaster** (an EIP-1167 clone from `OctanePaymasterFactory`, holding only that maker's ETH) | The **winning AI maker acting as relayer**, which submits the transaction and pays the WBT gas |
| How the maker gets paid | Same transaction: a SENDER-mode settle frame sends the user's USDC → the maker | Same transaction: a USDT fee → the maker, paid by the payer (default) **or by the merchant** (`feePayer = merchant`: the fee comes out of the merchant's 10 USDT) |
| Why it needs this chain or track | Each maker's paymaster reads `USDC.balanceOf(user)` during validation and sponsors many pending transactions, so **only the alt mempool admits it** | Whitechain's brief: *"payer pays in stablecoins without holding WBT… how your relayer gets its WBT, and what stops someone from draining it"* |

**Shared across both paths:** the **Arkiv quote board**, where each AI maker keeps **one standing signed gas quote** alive, updating it every ~10s with a **rolling ~30-second expiry** (the signed onchain validity is longer, ~90–120s; see 14.3), and the **AI gas concierge** in the wallet, which picks the best quote.

## 5. Partners: exactly 3, all thin tracks

| Partner | Track | Places | Bounty language this matches | What breaks without it |
|---|---|---|---|---|
| **Ethereum Foundation** | 🧩 Frame Transaction Alternative Mempool | $2.5k / $1.5k / $1k | *"flexible state access in… paymaster (e.g. **ERC20 paymasters**)"* | Path A can't exist: the public mempool rejects it |
| **Whitechain** | ⚡ Scale: Payments Nobody Notices | $2k / $1k | *"payer… pays in stablecoins without holding WBT for gas… your own relayer… what stops someone from draining it"* | Path B can't exist. And their "drain" question gets our best answer: **there's no shared treasury to drain**, because each maker risks only its own WBT, is paid atomically per relay, and every authorisation is **bound to one maker**, so nobody can make other makers burn gas on reverts. |
| **Arkiv** | 🧩 Build on Arkiv | $3k / $1k | *"Markets: listings or offers that expire at their deadline"* | The quote book would be a company server that can censor makers and keep stale prices, and maker reputation would be our word instead of a history anyone can recompute |

**Max partner prize: $7,500** ($2.5k + $2k + $3k), plus the Swarm bonus (+$500, no extra slot; P1 since v3.2). Every track is thin, but expect copycats of the sponsor examples: about 3–8 EF alt-mempool, 6–12 Whitechain Scale and 8–18 Arkiv Build entries (estimates).

## 6. How it works (the data loop)

```
① AI GAS MAKERS (3 agents with different risk styles), each with its OWN wallet:
   • Path A (EF devnet): deposits its own ETH into its OWN paymaster clone
     (created once by OctanePaymasterFactory, EIP-1167)
   • Path B (Whitechain): holds WBT for gas; runs a tiny relayer loop
   • every ~10s: read ETH/WBT price + recent basefee + own inventory → sign a quote
     (signed onchain validity ~90–120s)
     → UPDATE its ONE standing ARKIV quote entity (per chain + token)
       {maker, chain, priceStable/ETH or feeBps, maxGas, seq, sig}, owned by the maker wallet,
       and EXTEND its expiry to ~30s from now (rolling expiry = liveness signal)
       • crash → no more updates → the quote leaves the board within ~30s
       • clean shutdown, low inventory or shock regime → the maker's AI DELETEs it at once
   • every ~5 min: batch journal lines → upload to SWARM → update its maker profile's journalRef

② USER opens the Octane wallet → the concierge queries ARKIV for the best live quote and explains it
   PATH A (frame transaction on the alt-mempool devnet), Layout 1 (order per EF's PREFIX-010):
     VERIFY  expiry          → expiry_verify FIRST (EXPIRY_VERIFIER, flags 0x0), deadline = quote.validUntil
                               (TIMESTAMP is banned in validation except in this frame)
     VERIFY  sender          → only_verify: user signature → APPROVE(execution)
     VERIFY  maker's clone   → pay: APPROVE(payment) only IF: user USDC balance ≥ fee
                               AND the first SENDER frame is USDC.transfer(maker, fee)   (FRAMEDATALOAD)
                               AND the expiry frame's deadline ≤ quote.validUntil
                               AND the quote signature is valid
                               (maker address = immutable arg in the clone's code)
                               (reads USDC storage → the clone must be STAKED → only the ALT MEMPOOL admits it;
                                if the clone's ETH can't cover gas, APPROVE reverts → tx invalid)
     SENDER  settle          → FIRST: the user's account calls USDC.transfer(maker, fee)
     SENDER  action          → the user's real call (e.g. pay a friend)
     (P1 upgrade, Layout 1b: a pre_verify frame before `pay` pulls the fee during validation; see 14.4)
   PATH B (Whitechain):
     user signs an EIP-3009 authorisation for "pay merchant 10 USDT + fee",
       with nonce = keccak256(quoteHash, merchant, amount, maker)   ← bound to ONE maker
     → only that maker can submit it to OctaneRelay (requires msg.sender == quote.maker), paying WBT gas
     → OctaneRelay atomically: 10 USDT → merchant, fee → maker; reverts if anything mismatches
   MERCHANT-PAYS MODE (feePayer = merchant): the payer authorises 10; the merchant's checkout signs an
     EIP-712 opt-in {merchant, amount, maxFee, orderId, expiry}; relay: 9.95 → merchant, 0.05 → maker

③ ARKIV board: the indexer writes `fill` entities and per-maker `makerStats`;
   anyone can recompute the stats from the public quote write history + onchain fills and balances;
   dead quotes simply disappear
```

**✅ Confirmed at the Nov 5 Whitechain workshop: the official test USDT supports EIP-3009**, so Path B uses `receiveWithAuthorization` as drawn above. Read the token's EIP-712 domain (`name`, `version`) from the contract (`eip712Domain()` or the verified source) before building signatures. The fallbacks below are kept only as contingency:
1. **EIP-7702 (preferred).** Whitechain is an OP Stack L2, so EIP-7702 may be available (⚠ confirm it's enabled on 1874). The user signs a 7702 authorisation (free), and the maker submits a type-4 transaction that delegates the user's EOA to a minimal **`OctaneExecutor`**. The executor only runs user-signed, maker-bound intents. **Same address, no funding step.**
2. **CREATE2 smart account (fallback #2).** A counterfactual `OctaneAccount`: the user signs an EIP-712 intent, and the maker calls `account.execute(intent, sig)` and pays the WBT. ⚠ Problem: if the user's USDT sits in an EOA, moving it into the account costs gas, which Whitechain says "won't place". **In the demo, the faucet funds the counterfactual address directly.**

**Safety:**
- **Path A solvency:** the settle frame runs right after validation, *before* the user's action. **Honest risk:** once `APPROVE(payment)` fires, the maker's paymaster pays gas even if the settle frame later reverts, because a VERIFY frame can't check that later frames succeeded. This is bounded by the validation-time USDC balance check, the one-pending-transaction-per-sender rule and a per-transaction cost cap, and it only ever hits **that maker's own deposit**. We state this tradeoff explicitly in the EF write-up.
- **Path B drain protection:** there's no shared treasury. Each maker spends only its own WBT, gets paid in the same transaction or the transaction reverts, and chooses which quotes it posts. **Every authorisation is bound to one maker** (binding nonce), so it can't be sprayed at many relayers to make them burn gas.

### What lives where
| Data | Where | Owner |
|---|---|---|
| Live gas quotes (signed): **one standing entity per maker** per chain + token, updated every ~10s | **Arkiv**, rolling ~30s expiry (extended on every update) | Maker's wallet |
| **Gas requests** from agent payers (auction mode) | **Arkiv**, expiring in about 10s | The payer agent's wallet |
| **Bids** from AI makers on those requests | **Arkiv**, expiring with the request | Maker's wallet |
| **AI trading journals** (why each maker priced what it did) | **Swarm**, as a hash-linked chain of files (the Arkiv maker profile holds the latest reference) | Maker |
| Maker profile (style, wallets, `journalRef`) | **Arkiv**, 7 days, extended | Maker's wallet (transferred to the new wallet on a planned key rotation) |
| Fill history (`fill`) and maker reputation (`makerStats`: fade score, uptime, coverage) | **Arkiv** | Indexer wallet, so no maker can rate itself. Anyone can recompute it with `scripts/recompute-fade.ts` |
| Maker capital | Path A: ETH deposited in **the maker's own paymaster clone** · Path B: WBT in **the maker's own wallet** | Maker |
| `OctanePaymasterFactory` + per-maker paymaster clones, Path A fills | **EF alt-mempool devnet** | Each clone: its maker |
| OctaneRelay (verified), Path B USDT payments | **Whitechain Sepolia (1874)** | — |
| User keys and intent | **User's browser** | User |

## 7. The AI layer: an agent economy for gas

> **Principle: AI decides; contracts enforce.** AI sets prices, picks quotes and places bids. Contracts enforce fee caps, expiry and atomic settlement. A maker's AI can only risk **that maker's own capital**, and no AI ever holds user funds.

```
        DEMAND SIDE (buyers)                    ARKIV (open trading floor)                 SUPPLY SIDE (sellers)
 ┌─────────────────────────────┐         ┌───────────────────────────────────┐        ┌──────────────────────────────┐
 │ * AI agents (Claude, any    │──MCP───▶│ standing QUOTES  (rolling 30s)    │◀───────│ * AI gas makers ×3           │
 │    MCP agent) holding only  │         │ gas REQUESTS         (expire 10s) │        │   "Cautious" / "Aggressive" / │
 │    USDT/USDC                │         │ BIDS on requests     (expire 10s) │        │   "Inventory-balancer"        │
 │ * Humans via the gas        │         │ FILLS + makerStats (recomputable) │        │   each with its own wallet,   │
 │    concierge (plain words)  │         └───────────────────────────────────┘        │   P&L and trading journal     │
 └─────────────────────────────┘                          │                            └──────────────────────────────┘
                                                          ▼
            settlement: per-maker paymasters on the EF alt mempool (Path A) / Whitechain relay (Path B)
```

| # | AI feature | What it does | What breaks without it | Priority |
|---|---|---|---|---|
| 1 | **🤖 AI gas makers** (the supply side) | 3 autonomous agents with different risk styles, each with its own wallet. They forecast basefee, price token volatility and inventory risk, then **update one standing quote in place** on Arkiv every ~10s, extending its expiry each time. They widen spreads in spikes and **delete their quote** when inventory is low or the regime is a shock. Each keeps a **public trading journal** ("Widened the spread 40 bps: basefee jumped 3× in 2 blocks"), published to **Swarm** every few minutes. | The market can't exist: nobody hand-refreshes 30-second quotes | **MVP** |
| 2 | **🔌 Octane MCP server** (the demand side) | Any AI agent (Claude, Cursor, any MCP agent) gets tools: `get_gas_quote`, `send_sponsored(chain, to, amount)`, `post_gas_request`, `get_fill_history(maker or payer, cursor)` (paginated spend history). **An agent with only USDT can act onchain on both chains.** Every tool reads Arkiv directly, so no Octane server sits between the agent and the board. Includes per-agent spend caps. | Agents need native gas tokens, or must trust one company's paymaster | **MVP** |
| 3 | **💬 Gas concierge** (for humans) | Plain-language actions ("Pay Rahul 10 USDT", Hinglish works too) → builds the transaction → picks the best quote across makers and chains → explains it ("Fee 0.05 USDT. Maker B is cheapest; Maker A's quote expires in 3s"). Adds **"wait to save"** advice from the basefee forecast ("wait about 90s, save about 30%"). | Users would face raw quote tables and hex | **MVP** (basic) |
| 4 | **⚡ Agent-to-agent gas auctions on Arkiv** | For bigger or batch jobs, the payer agent posts a **gas request** entity ("50 payments on Whitechain, max fee 0.5 USDT, 10s"). Maker agents post **bids** (expiring entities). The payer picks, the winner **claims** and settles. This is Arkiv's own suggested direction: *"tasks, bids and claims that agents share, query and let expire."* | Batch and agent workloads overpay on standing quotes | Phase 2 (hour 24+) |
| 5 | **🛡️ Griefing and drain shield** | Each maker's AI scores incoming jobs before taking them: wallets that request and abandon, transactions whose simulation would revert, sybil bursts. It refuses bad jobs. **This is part of the answer to Whitechain's "what stops someone from draining it?"** | Makers waste gas on griefers | Phase 2 |
| 6 | **🔍 Fade detector** (payer side) | Flags makers whose quotes fail or who can't cover what they quote. The score comes from public data anyone can recompute: **uptime** from the quote's update history, **coverage** from the maker's onchain balance while its quote was live, and **delivery** (auction wins without a fill). Failed attempts a payer saw locally also lower the score in that payer's own view. | Payers waste attempts | Phase 2 |
| 7 | **🧬 Maker evolution** | Unprofitable maker strategies retire; profitable ones spawn mutated variants. An "AI vs AI" leaderboard. | — | Stretch |

**Why AI is load-bearing here, not decoration:** take it out and there's no market (no makers), no agent customers (no MCP), and no usable product for humans (no concierge). It also matches what both partners asked for:
- **Whitechain:** *"the payer, a person **or an AI agent**, pays in stablecoins… software can pay software."*
- **Arkiv:** *"Agents: ephemeral coordination state."* Agent bids and claims on Arkiv are exactly this.
- **Whitechain's drain question:** the **griefing shield** is part of our answer, together with "no shared treasury" and maker-bound authorisations.
- **The MCP agent payer** is Whitechain's *"software can pay software"* and *"a person or an AI agent"*, made literal.
- **Arkiv's four principles:** the AI makers are what keep the time-scoped board alive (a quote exists only while its maker's AI keeps extending it), and their public journals plus recomputable stats make AI behaviour tamper-evident.

**MCP spend caps, precisely:** per-agent caps are enforced **in the MCP server** (off-chain). The onchain bound is the **maximum fee the agent signs** in each authorisation or frame transaction. Stretch goal: an onchain per-agent cap in `OctaneExecutor` (the EIP-7702 path).

**Pitch emphasis per booth (every AI feature stays in every pitch; only the lead changes):**
- **EF booth:** lead with the open market, CROPS and the DoS tradeoff. The AI makers are the reason the market has liquidity.
- **Whitechain booth:** lead with an **AI agent paying USDT with zero WBT**.
- **Arkiv booth:** lead with **agent auctions and expiring quotes**, then the four principles: kill a maker and watch its quote leave the board, then recompute its fade score from public history.

**Model provider:** any LLM (Claude, or 0G PC credits). Keep the pricing logic numeric (forecast + risk formula) and use the LLM for regime calls, explanations and the journals. That keeps quotes fast and stops a hallucination from ever setting a price outside the hard caps.

## 8. Safety net: hour-14 checkpoint
| At hour 14 | Then |
|---|---|
| ✅ One Path A frame transaction admitted on the alt-mempool devnet | Continue. Submit **EF Alt Mempool + Whitechain Scale + Arkiv**. |
| ❌ Path A not working | **Drop Path A.** Make **Path B (Whitechain) the whole product**, and route the wallet's chain reads and Arkiv queries through **Anon-RPC**, so nobody learns who is shopping for gas. Submit **EF Anon-RPC + Whitechain Scale + Arkiv**. All three are still thin tracks, and you can only win one EF prize anyway. |

**Anon-RPC prize requirement:** the app routes its RPC reads through Anon-RPC **by default** (excluding some traffic for performance is allowed if disclosed). Integration uses EF's browser harness (`@anon-rpc/browser-harness` on npm). ⚠ Unconfirmed: whether Anon-RPC already has workers for Whitechain (1874) and Arkiv's rabdi RPC. If not, building a worker for them also counts for that prize, but it's more work. Ask at the EF workshop.

## 9. Demo script (3:00; Whitechain needs 2–4 minutes showing every party)
| Time | Shot |
|---|---|
| 0:00 | *"Millions of AI agents now hold stablecoins but no gas, and so do most humans. Today one company prices their gas. We built an open market where AI agents trade gas with AI makers."* |
| 0:15 | The board: **3 AI makers** ("Cautious", "Aggressive", "Balancer"), each updating its **one standing quote** live on Arkiv. One maker's **trading journal** scrolls: *"Widened 40 bps, basefee spiking."* Click through to the journal file on Swarm from the maker's Arkiv profile (**note this timestamp for `swarm.md`**). |
| 0:40 | **AI agent as payer:** Claude, with the Octane MCP and only USDT, is told "pay our 3 open-source contributors 5 USDT each". It calls `send_sponsored` ×3 on **Whitechain**. **Zero WBT.** Explorer links. |
| 1:05 | **Relayer view:** maker agents pick up the jobs, pay WBT gas, and earn fees atomically. **Merchant/recipient view:** USDT received. Then **merchant-pays mode**: the same payment, the merchant receives 9.95 and covers the fee. |
| 1:25 | **Human via the concierge:** "Rahul ko 10 USDC bhejo" ("send Rahul 10 USDC") → the concierge explains the fee and picks Maker B → **Path A frame transaction → alt mempool admits it** (explorer link). The same transaction to the **public mempool → rejected**. |
| 1:55 | **Agent-to-agent auction** (if Phase 2 is built): the agent posts a "50 payments" gas request on Arkiv → 3 maker agents bid within 10s → the winner claims → done |
| 2:20 | **Failure paths:** a quote expires mid-flight → refused, nothing spent, re-quoted. The griefing shield rejects a request whose simulation would revert. **Kill a maker's process live** → its quote leaves the Arkiv board within 30s (sped up in the video) and its uptime in `makerStats` drops. |
| 2:45 | *"Gas for the agent economy. AI on both sides, no operator, no treasury to drain."* |

## 10. Build plan (solo builder + parallel Claude Code sessions, about 36h)
You're one person, so you act as the **integrator** and run 2–3 Claude Code sessions in parallel, each in its own folder or git worktree: **session 1** Path B + makers, **session 2** Path A, **session 3** Arkiv + UI + MCP. Review, merge and test what they produce. Nothing is cut; this is the order.

| Hours | Focus | Done when |
|---|---|---|
| 0–1 | **Setup:** repo, license, README skeleton, `.env.example`, wallets. Funding: Whitechain faucet; EF devnet from the shared genesis key (the workshop's `step_1_check` does it; new-account transfers need ≥ 204,600 gas); Arkiv faucet | All wallets funded, first commit |
| 1–5 | **Path B core** (session 1): `OctaneRelay` + Foundry tests → deploy + **verify** on 1874 → first real USDT payment. **In parallel (session 2):** EF workshop steps 1–8 in a throwaway folder outside the repo | USDT payment explorer link · you've seen a staked contract admitted |
| 5–10 | **Arkiv board + AI makers** (sessions 1 + 3): standing quote entity, live board reading Arkiv; maker loop (formula + regime call + signed quote, update + extend); then 3 makers via config | 3 makers' prices updating live |
| 5–14 | **Path A** (session 2): factory + clone with `stake()` → stake → Layout 1 with a minimal check → admitted; then the full checks | **Hour-14 gate:** one admitted Path A transaction |
| 10–16 | **Makers as relayers:** a board quote → Path B payment end to end | A payment chosen from the board |
| 14–22 | **MCP server** (`get_gas_quote`, `send_sponsored`) + Claude agent demo · **basic concierge** + wallet payer flow | Claude pays 3 people with zero WBT |
| 22–30 | **P1, in this order:** journals → Swarm (makes the AI visible + Swarm bonus) · merchant-pays (~10 lines) · griefing shield (simulate first) · indexer + `makerStats` + `recompute-fade` · auctions on Arkiv · Path A Layout 1b · agents on Path A + batching · fade detector · paginated history | As many as fit |
| 30–36 | **Submission:** demo video, README (explorer links, "why onchain", AI disclosure), 5 Arkiv docs + `swarm.md`, `WHITECHAIN_FEEDBACK.md`, EF design write-up; ENS add-on only if time is left | Submitted |

**Sleep:** take 3–4 hours somewhere around hours 16–20, after the hour-14 gate. Being exhausted at judging costs more than any P1 feature.
**Solo reality check:** P0 alone is a full day. Before hour 22, look at the P1 list and pick what matters most for your three tracks.

**Priority ladder (nothing is cut, only ordered):**
- **P0:** Path A with one maker and one admitted transaction · Path B with 3 maker-relayers and the binding nonce · Arkiv live quote board (standing quotes: update + extend, delete on shutdown; read straight from Arkiv) · MCP `send_sponsored` on Whitechain · basic concierge · `resolveIdentity()` hook in the SDK (returns the address for now; ENS plugs in later, see section 18)
- **P1:** agent auctions on Arkiv · griefing shield (simulate first) · fade detector · trading journals · merchant-pays mode (~10 lines) · indexer (`fill` + `makerStats`) · `recompute-fade` script · paginated fill history + MCP `get_fill_history` · Swarm journals · maker profile transfer on key rotation
- **P1 (added v3.3):** agents on Path A through MCP (`send_sponsored(chain = EF devnet)`) · batched payouts in one frame transaction (14.4)
- **P2:** "wait to save" · maker evolution · **ENS add-on** (section 18) (the indexer and Swarm journals moved up to P1 in v3.2)

**Arkiv fallback:** if Arkiv's update or extend semantics don't fit a rolling 30s expiry (ask at the booth), each refresh creates a new 30s quote entity instead. The board query stays the same; only the liveness story gets weaker.

3 makers on Path B and 1 on Path A is fine for the demo: the market is visible on the Arkiv board.

Commit at least hourly. Whitechain checks for steady progress through the hackathon.

## 11. ⚠ Confirm at the Nov 5 workshops (go or no-go)
| When | Who | Ask |
|---|---|---|
| **4:30 PM, Room 2** | **Whitechain** | ✅ **Answered: the test USDT supports EIP-3009.** Still open: "Where do payers get the official test USDT (`0xcedf…f55a7`)? How do we verify contracts on the L2 explorer (Foundry verifier type and URL)? Can we get more WBT for 3 maker wallets (the faucet gives 0.1 WBT/day)? Is there a testnet DEX for USDT→WBT?" |
| **5:00 PM, Room 2** | **EF alt-mempool team** (Pierre and Alex) | ✅ **The team wasn't available; most answers were found in their docs and repos (see 19.0).** Still to test on the devnet: whether a staked payer may write the sender's USDC slots in `pre_verify` (Layout 1b); the exact `EXPIRY_VERIFIER` address and data format. Original questions, for reference: ⭐ 1. "Our paymaster's VERIFY frame `STATICCALL`s `USDC.balanceOf(tx.sender)`: a read of the sender's balance slot, sender-associated storage under ERC-8421. Admitted for an *unstaked* paymaster, or only staked? Staking registry address, minimum stake, unstake delay on the devnet?" ⭐ 2. "Pending-tx allowance per paymaster: `opsAllowed` unstaked vs uncapped staked ACTIVE?" ⭐ 3. "Frames: [0] VERIFY sender → `APPROVE(execution)`; [1] `EXPIRY_VERIFIER`; [2] VERIFY paymaster (`FRAMEDATALOAD` check that [3] is `USDC.transfer(maker, fee)`, EIP-712 quote sig) → `APPROVE(payment)`; [3] SENDER fee; [4..n] SENDER calls. Valid prefix? Where and in which mode must `EXPIRY_VERIFIER` sit; can the paymaster read it via `FRAMEPARAM`/`FRAMEDATALOAD`?" ⭐ 4. "A frame-3 revert after `APPROVE(payment)` still charges the paymaster; we bound it with the balance check, 1 pending tx per sender and a `maxCost` cap. Does reputation blame the paymaster? Recommended mitigation?" ⭐ 5. "Anon-RPC workers for Whitechain 1874 and Arkiv rabdi? If not, is a new worker in scope?" Also: predeployed USDT's `balanceOf` storage (plain mapping?), EOA as `tx.sender` with default code, canonical-rejection endpoint for the demo, limits for ~50 SENDER frames, PR #6 vs ERC-8421 ruleset, reset schedule. |
| Any time | **Arkiv booth** | "Is write throughput OK for 3 makers posting quotes every 10s with a 30s expiry? Can backend-sponsored writes be owned by the maker's wallet? Is expiry set in blocks or seconds, and what's the block time? What does a write cost on rabdi, and what's the write-to-queryable latency? Does `update` reset an entity's expiry, or do we need a separate `extend`, and do they cost the same? Is `transfer` available in the SDK version we should use? What's the best way to read past versions of an updated entity (to recompute fade scores)? What's the ordering and pagination syntax (order by `fee` or `ts`, cursors)? Can you give us a Swarm postage batch and a Bee gateway?" |
| Any time (workshop was 4:00 PM, Room 1) | **ENS booth** (add-on only, section 18) | "We're keeping our three tracks. What qualifies for your bonus: ENSv2 only, and is Sepolia OK? Is ENSv2 live on Sepolia, with contract addresses? Is it fine if names are checked in our app while payments settle on Whitechain? How do we set up expiring, revocable agent subnames the parent can cancel? Any convention for spending rules in `agent-context` (ENSIP-26)? If we add ENS after winning, what's the deadline?" |

## 12. Submission checklist
- **EF Alt Mempool:** a link to an admitted transaction on the devnet explorer + code that submits it ✅ · **a screenshot or log of the same transaction rejected by the public mempool, with the rejection reason** ✅ · the team can explain the design and tradeoffs ✅
- **Whitechain Scale:** contracts on chain 1874, **verified** ✅ · a **USDT payment** in the main flow + explorer link in the README ✅ · a "why onchain stablecoin settlement on Whitechain" line ✅ · steady commits ✅ · 2–4 minute video showing **payer, merchant and relayer** ✅ · `WHITECHAIN_FEEDBACK.md` ✅ · an answer to "how the relayer gets WBT, and what stops draining" ✅
- **Arkiv:** from scratch ✅ · writes + reads that users see ✅ · README: writer wallets + one runnable query (the live board query) ✅ · `/arkiv/schema.md`, `friction.md`, `reach.md`, `why-arkiv.md`, `how-you-use-arkiv.md` ✅ · `how-you-use-arkiv.md` maps all four principles (queryable, time-scoped, tamper-proof, wallet-owned) to user-visible features ✅ · README: `pnpm recompute-fade --maker 0x…` reproduces the board's `makerStats` ✅ · OSS license + AI disclosure ✅
- **Swarm bonus (P1):** makers' trading journals on Swarm (unencrypted, hash-linked), latest reference in each maker's Arkiv profile ✅ · `/arkiv/swarm.md` with: what's on Swarm, which entity field holds the reference (`journalRef`), one example (entity key → Swarm reference → open link), postage batch ID and where it came from, upload code path, how to run it, the demo video timestamp, what got in our way ✅ · select the **Arkiv + Swarm bonus** when submitting ✅

---

# 13. Partner deep dives: what they are, what they do, why we use them

## 13.1 🧩 Ethereum Foundation: Frame Transaction Alternative Mempool

**Who they are:** The **Ethereum Foundation (EF)** is the non-profit that funds Ethereum research and development. It doesn't control Ethereum. Its **Access Layer** team works on keeping wallets and apps **CROPS**: Censorship-resistant, Open source, Private, Secure.

**The technology, in plain words:**
- **Transaction:** a signed instruction sent to the network ("send 10 USDC to Rahul").
- **Mempool:** the network's **waiting room** for transactions not yet in a block. Nodes check ("validate") each transaction before letting it in.
- **Account abstraction:** letting a wallet's *own code* decide what counts as a valid transaction: which signature scheme, spending limits, or **who pays the gas**. Today that's bolted on through ERC-4337 (a separate system). **EIP-8141 "frame transactions"** make it native.
- **Frame transaction (EIP-8141):** one transaction made of up to 64 **frames** (small steps). **VERIFY** frames run validation code, for example "is this signature valid?" or "do I, the paymaster, agree to pay the gas?". They approve using a new opcode, **`APPROVE`**. Execution frames do the actual work. So a wallet can say "my gas is paid by contract X, under conditions Y", natively.
- **Paymaster:** a contract that **pays someone else's gas**. In EIP-8141 a paymaster is just a VERIFY-frame target that calls `APPROVE` for payment.
- **Why the public mempool is strict:** validation runs **before anyone has paid a fee**. If validation could read *shared* state (another contract's balances), an attacker could make one cheap transaction that invalidates thousands of waiting ones, a free **denial-of-service (DoS)** attack. So the public mempool accepts only simple frame transactions: limited verification gas (about 100k), `SLOAD` only on `tx.sender`'s storage, and no unstable opcodes such as `BALANCE`, `SELFBALANCE` or `TIMESTAMP` (time limits go through the canonical `EXPIRY_VERIFIER` frame).
- **The alternative mempool (ERC-8421):** a second waiting room that accepts the **richer** transactions, protected by **ERC-7562-style rules**. Entities that read shared state must **stake** (lock a deposit), and get **reputation** penalties if they cause invalidations.

**What EF offers at Mumbai:** devnets running EIP-8141 with the alt mempool (with keyed nonces and recent roots live), a devnet explorer, a faucet, the workshop **sidecar** (bundler/gateway) repo, an ethrex tracer branch, and the alt-mempool team on site (Pierre and Alex).

**What the track rewards:**
- Things **only an alt mempool makes possible**: verification over 100k gas (for example post-quantum wallets), or **more flexible state access in a sender or paymaster (for example ERC-20 paymasters, daily-quota paymasters)** ← **Octane is this**
- Developer tooling, or breaking and improving the rules
- Judging: creativity · usefulness · practicality · how well it works · relation to the alt mempool. You must show an **admitted transaction** on the devnet explorer, and be able to explain the design and tradeoffs.

**Why Octane uses it:** EIP-8141's own **Example 3** already shows an ERC-20 sponsor, and EF's preferred public policy is a **canonical paymaster** (lightclient's mempool policy, merged via EIPs PR #11415). Neither is an **open market**. In Octane, **each maker runs its own paymaster clone**, which checks **the user's USDC balance** during validation (another contract's storage) and sponsors **many pending transactions** (the spec caps non-canonical paymasters at 1 in the public mempool). **So only the alt mempool admits it.** ERC-20 paymasters are literally one of EF's listed examples, so expect competitors: our edge is the competing-maker market.

**Prize:** $2.5k / $1.5k / $1k · **Crowd:** 🟢🟢 the thinnest track at the event (estimate: 3–8 serious teams) · **One EF prize per project.**

---

## 13.2 ⚡ Whitechain: "Scale · Payments Nobody Notices"

**Who they are:** **Whitechain** calls itself *"The Onchain Economy Layer"*: infrastructure for businesses to launch, operate and scale onchain. It's an **EVM Layer 2 built on the OP Stack** (Optimism's open-source blueprint for L2s), with **mainnet arriving in November 2026**. It's at Mumbai together with **Optimism**.

**The technology, in plain words:**
- **Layer 2 (L2):** a faster, cheaper chain that settles back to Ethereum. It's "plain EVM", so normal Solidity and viem/ethers work.
- **WBT:** Whitechain's gas token. Every transaction needs a little WBT, and that's exactly the problem Octane removes for payers.
- **Testnet:** **Whitechain Sepolia, chain ID 1874**, with a faucet (WBT + test USDT), an explorer for contract verification, and a free Ankr RPC for hackers.
- **Test USDT:** `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7`. Payments must use **this** token; a token you mint yourself doesn't count.
- **Gasless payment standards we can use:**
  - **EIP-3009 (`transferWithAuthorization` / `receiveWithAuthorization`):** the token holder signs an off-chain message, and **anyone** can submit it and pay the gas. With `receiveWithAuthorization`, only the receiving contract can execute it, which protects against front-running.
  - **EIP-2612 (`permit`):** a signed off-chain approval, followed by `transferFrom`.
  - ✅ **Confirmed Nov 5: the test USDT supports EIP-3009.** EIP-7702 and the CREATE2 smart account remain contingency fallbacks only.

**What the Scale track asks for:**
- A payer, **"a person or an AI agent"**, pays in stablecoins **without holding WBT, writing down a seed phrase or knowing what chain they're on**.
- Ideas they list: gasless checkout with permit or EIP-3009 and **your own relayer**; embedded wallets or smart accounts; AI agents paying per request.
- They want to see **zero crypto steps** for the payer, **how the business side pays for gas, how the relayer gets its WBT, and what stops someone from draining it**.
- **Won't place:** flows where the payer still signs a gas-costing transaction, or AI chats that never actually pay.
- **Requirements:**
  - contracts on 1874, **verified**
  - a **USDT payment** in the main flow, with the explorer link in the README
  - a "why onchain on Whitechain" line in the README
  - steady commits
  - a **2–4 minute video showing every party**
  - `WHITECHAIN_FEEDBACK.md`

**Why Octane uses it:** Path B is exactly this brief, with a twist that answers their hardest question better than a single relayer can. **There's no single relayer to drain.** Many independent **AI maker-relayers** compete, each spending only its own WBT and getting paid atomically in USDT. Each signed authorisation is **bound to one maker** (binding nonce), so it can't be used to grief other relayers. It also answers *"how the business side pays for the gas"* directly: in **merchant-pays mode** the merchant covers the fee.

**Prize:** $2k / $1k · **Crowd:** 🟢 thin (new chain, strict requirements; estimate 6–12 serious teams).

---

## 13.3 🗃️ Arkiv: "Build on Arkiv (from scratch)" + 🐝 Swarm bonus

**Who they are:** **Arkiv** is *"the Web3 database"*, an **Ethereum-aligned DB-chain** from the Golem ecosystem. Instead of storing app data on a company's server, you store it as **entities** on Arkiv.

**The technology, in plain words:**
- **Entity:** a small record (like a row) with **attributes** you can filter on, using SQL-like queries such as `type = "quote" && chain = 1874 && price < 0.06`.
- **Owner:** every entity is **owned by a wallet**. Only that wallet can update, extend, transfer or delete it, so ownership is enforced by the chain, not by our code.
- **Expiry:** every entity has an **expiration block** you choose: seconds, days or years ahead. When it arrives, the entity leaves the query surface, so there are no cleanup jobs and no stale data. You pay for the lifetime you choose. (Its history stays in the chain: expiry isn't erasure.)
- **Tamper-proof:** every write is a signed Ethereum transaction, and state is committed in a keccak Merkle-Patricia trie, so any change is evident.
- **Open by default:** anyone can read, and anyone can write their own entities, **without asking us for an API key**.
- **Testnet "rabdi":** chain ID **7794095**, RPC, explorer, indexer, faucet, **access keys**, and the `@arkiv-network/sdk`. There's also an Arkiv **MCP server and Claude Code plugin**.

**What the Build track rewards (25% each):**
- **Friction:** honest feedback in `friction.md`
- **Reach:** who it's for, can they try it today, will you keep building
- **Why Arkiv:** what users would lose with Postgres, and what you kept off Arkiv
- **How you use Arkiv:** do your filters, ownership and expiry *fit the app*, and does each feature change something users see

**Not counted:** installing the SDK but never reading from it, or using Arkiv as a write-only log. The brief's own suggested directions include *"Agents: ephemeral coordination state: tasks, bids and claims"* and *"Markets: listings or offers that expire at their deadline"*. **Octane is both.**

**Why Octane uses it:** the **open trading floor**.
- **Quotes** expire in about 30s and **requests and bids** in about 10s, so expiry *is* the market's freshness guarantee.
- Each quote is **owned by the maker's wallet**, so nobody else can fake or edit a maker's price.
- Anyone, including makers and agents we've never met, can **join without our permission**. A Postgres-backed board would make us the operator Octane exists to remove.

**Arkiv's four principles, and where each one shows up in Octane** (the Arkiv team told us strong entries use these; `how-you-use-arkiv.md` repeats this table):

| Principle | What Arkiv means | Where Octane uses it | What a user or judge sees |
|---|---|---|---|
| **Queryable** | Filter and paginate records by indexed attributes with a Web2-like query language. No external indexer | The live board (`type = "quote" && chain && validUntil > now`), open auctions, reliable makers (`makerStats`), paginated maker statements and "my gas spend". The wallet and every MCP tool query Arkiv directly; our indexer only writes | The board, leaderboard and history pages load straight from Arkiv. An agent with the SDK needs no Octane server |
| **Time-scoped** | Every entity has an expiration block; when it arrives, the entity leaves the query surface. You pay for the lifetime you choose | Standing quotes with a **rolling ~30s expiry**, extended on every update; requests and bids ~10s; fills 30 days; maker profiles 7 days, extended | A crashed maker's price vanishes within 30s with no cleanup job, and short lifetimes keep writes cheap |
| **Tamper-proof** | Every write is a signed Ethereum transaction; state is committed in a keccak Merkle-Patricia trie | Each quote update is a signed write, so the board's history is public and can't be rewritten. `scripts/recompute-fade.ts` rebuilds uptime, coverage and delivery from that history plus onchain fills and balances | Anyone can rerun one command and get the same fade scores the board shows. A maker can't deny a price it posted |
| **Wallet-owned** | Only the owner wallet can update, extend, transfer or delete an entity | The maker owns its quote, bids and profile; the payer agent owns its requests (and records the auction winner on them); the indexer owns `fill` and `makerStats`, so no maker can rate itself. Makers use **all four operations**: update and extend on every refresh, delete on shutdown, transfer the profile on a planned key rotation | Nobody can fake or edit another maker's price, and a maker's reputation survives a key rotation |

**Why tamper-proofing matters even though quotes are already EIP-712 signed:** a signature proves a maker *agreed* to a price. It doesn't prove the price was *published to everyone*, *when*, or *for how long* the maker kept quoting. Arkiv's signed write history does, and that's what turns reputation from "trust our indexer" into something anyone can recompute.

**🐝 Swarm bonus (+$500, no extra partner slot; P1 since v3.2):** **Swarm** is Ethereum's decentralized file storage (upload through a **Bee** node, paid with **postage stamps**). We store each maker's **AI trading journal** on Swarm. Every ~5 minutes a maker uploads a journal file (JSON lines: quote `seq`, regime, spread change, reason) whose header holds the previous file's reference, so the files form a **hash-linked chain**. The maker's Arkiv profile holds the latest reference in `journalRef`, so journals are found by query, not by asking us. ⚠ We need a postage batch (ask the Arkiv/Swarm booth).
⚠ An *encrypted* Swarm reference contains its own key, and Arkiv entities are public. Ours are unencrypted public journals, so that's fine.

**Prize:** $3k / $1k (+ $500 Swarm) · **Crowd:** 🟢 thin (estimate 8–18 serious teams) · **One Arkiv track prize per team; the Swarm bonus stacks on top.**

---

## 13.4 Why these three together (and not others)
| Need in Octane | Partner | Why not an alternative |
|---|---|---|
| A next-gen settlement path that *needs* a new mempool | **EF Alt Mempool** | ERC-4337 paymasters already exist everywhere (not new); the public mempool rejects ours |
| A today's-chain path with real stablecoin payments and a relayer story | **Whitechain Scale** | Hedera x402 and Arc are the most crowded tracks; Whitechain's brief matches Octane word for word |
| An open, expiring, ownerless market board with recomputable reputation | **Arkiv** | Postgres would make us the operator and maker reputation our word; ENS isn't built for fast-expiring quotes |
| (Removed) Shared maker liquidity | ~~1inch Aqua~~ | Too hard for this team. Makers now hold their own funds: WBT in their wallet (Path B) or ETH in their own paymaster clone (Path A). |

---

# 14. System architecture and design

## 14.1 High-level architecture

```
┌──────────────────────────────── CLIENTS (demand side) ────────────────────────────────┐
│  * Octane Wallet (Next.js PWA)                   * Any AI agent (Claude, Cursor…)     │
│   • embedded key in browser (no seed phrase)        • connects via the Octane MCP     │
│   • * Gas Concierge (LLM): plain-language intent   • tools: get_gas_quote,            │
│     → transaction, picks quotes, explains fees      send_sponsored, post_gas_request  │
└───────────────┬───────────────────────────────────────────────┬───────────────────────┘
                └──────────────────────┬────────────────────────┘
                                       ▼
                     ┌──────────── @octane/sdk (TypeScript) ────────────┐
                     │ quotes.ts  (Arkiv queries, best-quote selection) │
                     │ pathA.ts   (frame-transaction builder + submit)  │
                     │ pathB.ts   (EIP-3009/2612 signing, relay call)   │
                     │ auction.ts (post request, read bids, pick, claim)│
                     │ history.ts (paginated fills, makerStats)         │
                     └───────┬───────────────────┬──────────────────────┘
    market data (read/write) │                   │ settlement
                             ▼                   ▼
┌──────────── ARKIV (rabdi, 7794095) ───────┐   ┌──────── EF ALT-MEMPOOL DEVNET (Path A) ─────────┐
│ quote   (1/maker, updated, rolling 30s)   │   │ OctanePaymasterFactory → 1 clone per maker      │
│ request (payer-owned, expires 10s)        │   │ clone: maker's own ETH; checks user USDC        │
│ bid     (maker-owned, expires with req)   │   │ USDC (test) · no WETH, no shared float          │
│ fill    (indexer-owned, 30 days)          │   └─────────────────────────────────────────────────┘
│ maker   (maker-owned profile, 7 days)     │   ┌──────── WHITECHAIN SEPOLIA, 1874 (Path B) ───────┐
│ makerStats (indexer-owned, recomputable)  │   │ OctaneRelay: maker-bound auth → merchant+fee     │
└───────────────▲───────────────────────────┘   │ OctaneExecutor (7702) · Account (fallback 2)     │
                │                               │ USDT 0xcedf…f55a7                                │
┌───────────────┴────────── SUPPLY SIDE: AI maker agents ×3 (Node/TS) ──────────────────────────┐
│ pricing engine (basefee forecast + volatility + inventory → numeric quote, hard caps)         │
│ LLM layer (market regime, trading journal, explanations) · signer (EIP-712 quotes)            │
│ relayer (Path B submit + pay WBT) · bidder (auctions) · *  griefing shield (simulate first)   │
└───────────────────────────────────────────────┬───────────────────────────────────────────────┘
                                                ▼
                   * SWARM: AI trading journals (ref in each maker's Arkiv profile)
┌─────────── Indexer (Node/TS) ───────────┐
│ watches both chains → writes `fill` +   │
│ `makerStats` to Arkiv (write-only)      │
└─────────────────────────────────────────┘
```

## 14.2 Components and responsibilities
| Component | Tech | Responsibility |
|---|---|---|
| **Octane Wallet** | Next.js, viem, an embedded key (localStorage or passkey) | Payer UI with zero crypto steps; live market board; maker leaderboard and journals; paginated maker statements and "my gas spend". Every screen reads Arkiv directly |
| **Gas Concierge** | LLM + the SDK | Plain-language intent → structured action; best-quote choice; fee explanation; "wait to save" advice |
| **Octane MCP server** | `@modelcontextprotocol/sdk` + the SDK | Lets any AI agent pay with stablecoins only; per-agent spend caps; `get_fill_history` for paginated spend history. Every tool reads Arkiv directly |
| **@octane/sdk** | TypeScript | One library used by the wallet, MCP and makers: quotes, both settlement paths, auctions, history (paginated fills and `makerStats`) |
| **Maker agents ×3** | Node/TS, LLM, viem | Price and sign quotes; keep **one standing quote per chain** alive (update + extend every ~10s, delete on shutdown, low inventory or a shock regime); relay Path B jobs; bid in auctions; run the griefing shield; write journals and publish them to Swarm; transfer the profile on a planned key rotation |
| **OctanePaymasterFactory + per-maker OctanePaymaster clones** | Solidity (EF devnet), EIP-1167 minimal proxies | Path A: each maker deposits its own ETH into its own clone. The clone's VERIFY checks the user's USDC balance, the next frame (`USDC.transfer(maker, fee)`), the expiry frame and the quote signature, then calls `APPROVE(payment)`; the protocol itself rejects it if the clone's ETH can't cover gas. The maker's address is an **immutable argument** in the clone's bytecode. Each clone **stakes itself** through a maker-only `stake()` that forwards value to the staking registry's `addStake(86400)`, because the alt mempool only lets a staked payer read USDC storage. No WETH, no shared float. |
| **OctaneRelay** | Solidity (Whitechain, verified) | Path B: verify the quote + authorisation; recompute the binding nonce and require `msg.sender == quote.maker`; atomically pay the merchant and the maker fee; optional **merchant-pays mode** (`feePayer = merchant`, requires the merchant's signed opt-in) |
| **OctaneExecutor** | Solidity (Whitechain) | Fallback #1 if USDT lacks EIP-3009/2612: EIP-7702 delegate for the user's own EOA; runs only user-signed, maker-bound intents (⚠ 7702 on 1874) |
| **OctaneAccount(+Factory)** | Solidity (Whitechain) | Fallback #2: CREATE2 counterfactual smart account; in the demo the faucet funds its address directly |
| **Indexer** | Node/TS | Writes `fill` entities and per-maker `makerStats` (fade score, uptime, coverage, P&L) to Arkiv. **Write-only:** it serves no read API, so every screen reads Arkiv itself. Anyone can run their own |
| **recompute-fade script** | Node/TS, `@arkiv-network/sdk`, viem | Rebuilds any maker's `makerStats` from public data only: the quote entity's write history on Arkiv, fills on both chains, and maker balances while each quote was live. Its output should match the board |

## 14.3 Data model

**Signed quote (EIP-712)**: the core object, verified onchain by both settlement contracts:
```
Quote {
  address maker;        // who gets paid and whose funds back the quote
  uint256 chainId;      // 1874 (Whitechain) or the EF devnet chain id
  address settlement;   // OctaneRelay or the maker's paymaster clone: binds the quote to one contract
  address token;        // USDT (Path B) or USDC (Path A)
  uint256 maxGas;       // gas units covered
  uint256 fee;          // Path B: flat fee in token units | Path A: token per unit of gas cost
  uint64  validUntil;   // unix time, ~90–120s ahead; enforced ONCHAIN (Arkiv expiry is only the UX layer)
  uint256 nonce;        // per-maker; prevents replay
}
EIP-712 domain = {name:"Octane", version:"1", chainId, verifyingContract: settlement}
```

**Two clocks (deliberately different):**
- **Board freshness:** each maker updates its standing `quote` entity every ~10s, and each update extends its expiry to **~30s from now**. If the maker stops updating, its quote leaves the board within 30s. Payers only ever *see* fresh prices.
- **Signed validity:** the quote's onchain `validUntil` is **~90–120s**, long enough for a human to read and confirm, and for the maker to submit. The maker bears the token-vs-gas-token price risk inside that window and prices it into the spread.
- **Updating or deleting the board entry doesn't revoke a signed quote.** A payer holding an earlier version can still settle it until its `validUntil`. On Path A the maker's paymaster clone honours it even if the maker's process is down (it's a contract); on Path B a crashed maker can't relay, so the attempt fails and counts against it.

**Path B binding (anti-griefing):** the EIP-3009 authorisation's nonce is `keccak256(quoteHash, merchant, amount, maker)`. OctaneRelay recomputes it and requires `msg.sender == quote.maker`. For the `permit` variant, the same intent hash goes into an EIP-712 **relay intent** the user signs. In merchant-pays mode, `feePayer` is added to the hash, and the relay also requires the merchant's EIP-712 opt-in `{merchant, amount, maxFee, orderId, expiry}`.

**Path A expiry:** the quote's `validUntil` is enforced by the canonical **`EXPIRY_VERIFIER` frame** (the spec's only exception to the `TIMESTAMP` ban). The paymaster checks that this frame exists and that its timestamp is ≤ `quote.validUntil`. Path B checks `validUntil` normally in the relay's execution.

**Arkiv entities** (`/arkiv/schema.md`):
| Entity | Queryable attributes | Payload | Owner | Expires |
|---|---|---|---|---|
| `quote` (standing: one per maker per chain + token) | `type, chain, token, fee, maxGas, validUntil, maker, style, seq` | latest signed Quote JSON | maker wallet | **rolling ~30s**, extended on every update; deleted on clean shutdown |
| `request` (auction) | `type, chain, jobs, maxFee, deadline, payer, winner` | job description | payer-agent wallet (it sets `winner` when it picks a bid) | **10s** |
| `bid` | `type, requestKey, maker, fee` | signed Quote | maker wallet | with its request |
| `fill` | `type, chain, txHash, maker, payer, fee, ts, quoteHash` | receipt | indexer wallet | 30 days |
| `maker` (profile) | `type, maker, style` | wallets + Swarm `journalRef` (latest journal file) | maker wallet (transferred on a planned key rotation) | 7 days, extended |
| `makerStats` | `type, maker, fadeScore, uptime24h, coverage24h, fills24h, pnl24h, epoch` | block ranges used as inputs | indexer wallet | 1 day, updated each epoch |

**v3.2 ownership fix:** `fadeScore` used to sit in the maker-owned profile, which would let a maker rate itself. It now lives in `makerStats`, owned by the indexer wallet and recomputable by anyone.

**Standing-quote lifecycle** (wallet-owned and time-scoped working together):
```
maker starts        → CREATE its quote entity (expires in ~30s)
every ~10s          → UPDATE the payload with a freshly signed Quote (seq + 1)
                      + EXTEND the expiry to ~30s from now
low inventory or    → the maker's AI stops quoting → DELETE (leaves the board at once)
shock regime
clean shutdown      → DELETE
crash               → no more updates → the expiry arrives → leaves the board within ~30s
key rotation        → TRANSFER the `maker` profile to the new wallet; the new wallet creates new quotes
```
⚠ If `update` doesn't reset the expiry, follow it with `extend` (two writes per refresh). If neither fits, fall back to a new 30s entity per refresh (same queries; see the Arkiv fallback in section 10).
A maker that runs out of gas can still write to Arkiv (Arkiv funds are separate from ETH/WBT), so liveness alone doesn't catch it. Its own AI deletes the quote when inventory is low, and the **coverage** score catches a maker that doesn't.

Example queries (⚠ check Arkiv's exact filter, ordering and pagination syntax):
- Best live quotes on Whitechain: `type = "quote" && chain = 1874 && validUntil > now` (sorted by `fee` client-side, or by the query if Arkiv supports ordering)
- Open auctions a maker should bid on: `type = "request" && chain = 1874 && deadline > now`
- Reliable makers: `type = "makerStats" && fadeScore < 0.1 && uptime24h > 0.95`
- Maker statement (paginated): `type = "fill" && maker = "0xMakerB"`, newest first by `ts`, 20 per page with a cursor
- My gas spend (paginated, for agents and humans): `type = "fill" && payer = "0xMyAgent" && ts >= <monthStart>`

**Recomputing reputation** (`scripts/recompute-fade.ts --maker 0x… --from <block> --to <block>`):
```
1. history  = every version of the maker's quote entities (Arkiv write history, ordered by seq)
2. uptime   = share of the window with a live quote (a gap of more than 30s between versions = downtime)
3. coverage = for each live version: was the maker's onchain balance (clone ETH on Path A,
              wallet WBT on Path B) ≥ maxGas × the quoted gas price?  → share of time covered
4. fills    = `fill` entities, each checked against its onchain txHash and matched to a published
              quote version by quoteHash (a fill whose quote never appeared on the board is flagged)
5. delivery = auction requests whose `winner` points at this maker's bid, with a fill before validUntil
6. fadeScore = 1 − uptime × coverage × delivery   → compare with the board's makerStats
```
⚠ Ask the Arkiv booth for the best way to read past versions of an entity, and check whether the devnet and Whitechain RPCs can read balances at past blocks (archive access). If they can't, the indexer samples balances each epoch and the script checks those samples instead.

## 14.4 Sequence flows

**Path B: gasless USDT payment on Whitechain**
```
Payer/Agent        SDK            Arkiv           Maker B agent           OctaneRelay (1874)       USDT
    │ "pay 10"      │                │                   │                         │                 │
    │──────────────▶│ query quotes ─▶│                   │                         │                 │
    │               │◀── B: 0.05 ────│                   │                         │                 │
    │ confirm       │ sign EIP-3009 receiveWithAuthorization(from=payer, to=Relay, value=10.05)       │
    │──────────────▶│ send {auth, quoteB} ──────────────▶│ shield: simulate ok?   │                 │
    │               │                │                   │── relay(auth, quote, merchant, 10) ─────▶│
    │               │                │                   │   (pays WBT gas)        │ verify quote   │
    │               │                │                   │                         │──receiveWithAuth─▶ 10.05 → Relay
    │               │                │                   │                         │── 10 → merchant ─▶
    │               │                │                   │                         │── 0.05 → maker B▶
    │◀──────────────────────── receipt (explorer link) ──────────────────────────────│                 │
                    Indexer → Arkiv `fill` entity (+ `makerStats` each epoch); Maker B journal batch → Swarm
```
- `receiveWithAuthorization` can only be called by its `to` (the relay), so nobody can front-run the transfer outside our contract.
- **No middleman hop:** the whole Path B payment is **one transaction**. The payer only *signs* (zero gas). **Preferred, if USDT has `permit`:** the relay calls `transferFrom(payer → merchant, 10)` and `transferFrom(payer → maker, 0.05)`, so the money goes **directly** from the payer to each recipient and the contract never holds it. **With EIP-3009:** `receiveWithAuthorization` passes the USDT through the relay for a split second *inside the same transaction*, to block front-running. That's still one transaction and one gas payment. See section 17.7.
- **Each authorisation is bound to one maker:** its EIP-3009 nonce is `keccak256(quoteHash, merchant, amount, maker)`, and OctaneRelay recomputes it and requires `msg.sender == quote.maker`. Any other maker can see off-chain that it isn't bound to it, so nobody wastes gas on a revert. (Permit variant: the same intent hash goes into an EIP-712 relay intent the user signs.)

**Path A: frame transaction on the EF alt-mempool devnet**
Default: **Layout 1**, in the order EF's alt-mempool rules require (PREFIX-010: an optional `expiry_verify` first, then `only_verify`, then `pay`). Same idea as EIP-8141's own Example 3.
```
Layout 1 (DEFAULT, P0):
 F0  VERIFY  EXPIRY_VERIFIER   → expiry_verify (flags 0x0), deadline = quote.validUntil; rejected if late
 F1  VERIFY  user account      → only_verify → APPROVE(execution)
 F2  VERIFY  maker's paymaster → pay: user USDC balance ≥ fee      ← reads USDC (proxy) storage → clone must be STAKED
             clone               · F3 is USDC.transfer(maker, fee)   (FRAMEDATALOAD)
                                 · F0's deadline ≤ quote.validUntil
                                 · quote signature (maker = immutable arg)
                                 → APPROVE(payment)  (protocol rejects it if the clone's ETH is short)
 F3  SENDER  user → USDC.transfer(maker, fee)          (SETTLE FIRST)
 F4… SENDER  user's real action(s)

Layout 1b (P1 upgrade; removes the settle-revert risk): pre_verify fee pull
 F0  VERIFY  EXPIRY_VERIFIER
 F1  VERIFY  user account      → APPROVE(execution)
 F2  DEFAULT pre_verify → maker's clone: checks TXPARAM sender, pulls the fee with the user's EIP-3009
             authorisation (devnet USDC is FiatTokenV2_2) → the fee lands BEFORE approval
 F3  VERIFY  maker's clone     → pay: checks F2's status succeeded + quote → APPROVE(payment)
 F4… SENDER  user's real action(s)
 ⚠ Test on the devnet first: the pull writes the sender's USDC slots, and the docs don't spell out
   whether a staked payer may write them (STORAGE-021/033). The admission report names any violating slot.

Not allowed: any VERIFY frame after the validation prefix (PREFIX-050).
```
**Why only the alt mempool admits it:** the canonical mempool rejects any validation read outside the sender (ethrex error `StorageReadNonSender`, the same case as the workshop's step 6) and caps non-canonical paymasters at 1 pending transaction. In the standard alt mempool an **unstaked** payer has no storage access at all, so each maker's clone **stakes**: on the devnet, > 0.01 ETH via `NaiveStakingRegistry.addStake(86400)` at `0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f`, called by the clone itself. Staked and ACTIVE, it gets read access to any non-entity storage (STORAGE-032), its own storage, `BALANCE`/`SELFBALANCE`, a 1M verification-gas budget and no pending cap.
**Demo:** send the same signed transaction with `eth_sendRawTransaction` (canonical → rejected) and with `eth_sendFrameTransaction` (alt mempool → admitted), as the workshop's steps 6 and 8 do.
**Honest risk (Layout 1):** once `APPROVE(payment)` fires, the paymaster pays even if F3 reverts; a VERIFY frame can't check that later frames succeed. It's bounded by the validation-time balance check, one pending transaction per sender and the cost cap, and it only touches that maker's own deposit. **Layout 1b removes it** by collecting the fee during validation; EF's docs name exactly this ERC-20 pull as the purpose of `pre_verify`. The paying frame must check the `pre_verify` frame's status: nodes can't enforce that, so a paymaster that skips the check bears the loss.

**Batched payouts: agents on Path A (P1, added v3.3)**
AI agents use Path A exactly like humans: the MCP server builds the frame transaction through `@octane/sdk` (`pathA.ts`) and the agent's key signs it. Path A's extra trick for agents is batching:
```
F0     VERIFY  EXPIRY_VERIFIER    → quote.validUntil
F1     VERIFY  agent account      → APPROVE(execution)
F2     VERIFY  maker's paymaster  → F3 is USDC.transfer(maker, fee) · agent USDC ≥ fee · quote sig → APPROVE(payment)
F3     SENDER  agent → USDC.transfer(maker, fee)              ← ONE fee for the whole batch
F4…Fn  SENDER  agent → USDC.transfer(payee_i, amount_i)       ← up to ~60 payouts (EIP-8141 allows 64 frames)
```
- 50 payouts = **1 transaction, 1 maker fee, 1 pending transaction** for the sender, so it fits our one-pending-transaction-per-sender safety rule.
- The quote's `maxGas` must cover the whole batch, so the maker prices it as a batch job (auction requests already carry `jobs`).
- MCP: `send_sponsored` accepts a list of `(to, amount)` when `chain` is the EF devnet.
- ⚠ Confirm with EF: frame-count and per-frame gas limits for ~50 SENDER frames; whether a sender with no deployed account code can sign frame transactions on the devnet.
- Demo option (10 extra seconds): the auction's "50 payments" job settles as one batched Path A transaction.

**Auction (agent-to-agent, Phase 2)**
```
Payer agent ── post `request` (10s) ──▶ Arkiv ◀── makers query open requests
Maker agents ── post `bid` (signed Quote) ──▶ Arkiv
Payer agent ── reads bids, picks lowest reliable (makerStats) ──▶ updates its own `request` with `winner`
Payer agent ── settles via Path A or B with the winning quote   (a winner without a fill counts against that maker)
```

## 14.5 Pricing engine (AI decides within hard rules)
```
fee = gasEstimate × forecastBaseFee × (1 + volBuffer) × gasTokenPriceInStable
      + spread(style) + inventorySkew(inventory)
clamped to [minFee, maxFee];  volBuffer ∈ [0, 0.5] is chosen by the LLM regime call (calm / spiky / shock)
```
- **Numbers decide prices**, so quotes stay fast and deterministic. The **LLM** only picks the regime inside a bounded range and writes the journal line explaining it.
- **The user always signs the maximum fee**, so a bad AI decision can't charge more than the payer agreed to.

## 14.6 Security and threat model
| Threat | Defence |
|---|---|
| **Quote replay** | EIP-712 domain binds chainId + settlement contract; per-maker nonce; `validUntil` checked onchain |
| **Stale quote** | Two clocks: Arkiv board expiry ~30s (display) + onchain `validUntil` ~90–120s (enforced by the `EXPIRY_VERIFIER` frame on Path A and by the relay on Path B) |
| **User drains funds before paying (Path A)** | Settle frame right after validation (Layout 1); validation-time `USDC.balanceOf(user)` check; one pending transaction per sender. **Residual:** if the settle frame reverts after `APPROVE(payment)`, the maker's own clone pays the gas (an explicit tradeoff) |
| **Maker can't cover its quote** | Path A: the protocol rejects an underfunded paymaster (`APPROVE(payment)` reverts → transaction invalid). Path B: the maker sends the transaction itself, so no WBT means no transaction. Either way the concierge re-quotes and the fade score drops. |
| **Shared paymaster drained (Path A)** | **There is no shared paymaster.** One clone per maker, holding only that maker's ETH. This mirrors the canonical paymaster's per-instance balance reservation. The worst case hits one maker's own deposit. |
| **Relayer drained (Path B)** | **No shared treasury.** Each maker spends its own WBT, is paid atomically or the transaction reverts, and its griefing shield **simulates before submitting** |
| **Front-running the relay** | `receiveWithAuthorization` is callable only by the relay; the fee is bound to the quoted maker |
| **Multi-relayer griefing (Path B):** the same signed authorisation is handed to two makers; one succeeds, the other reverts and burns WBT | **Binding nonce:** EIP-3009 nonce = `keccak256(quoteHash, merchant, amount, maker)`; OctaneRelay recomputes it and requires `msg.sender == quote.maker`. Unbound makers see this off-chain and never submit. Permit variant: the same intent hash in an EIP-712 relay intent. |
| **Token-vs-gas-token price risk between quote and submit** | Borne by the maker; short signed validity (~90–120s) plus spread |
| **A payer forces a merchant to pay fees (merchant-pays mode)** | The relay requires the merchant's EIP-712 opt-in `{merchant, amount, maxFee, orderId, expiry}`; without it, merchant-pays is rejected |
| **Banned opcodes in validation (Path A)** | No `TIMESTAMP` (expiry via the `EXPIRY_VERIFIER` frame), no `SELFBALANCE`/`BALANCE` (the protocol checks the payer's balance at `APPROVE`), no `SLOAD` on the clone (immutable args). The only non-`tx.sender` storage read is `USDC.balanceOf(user)`, which is why we need the alt mempool. |
| **Mempool DoS from shared-state reads (Path A)** | **Per-maker clones** confine mass invalidation to that maker's own sponsored transactions; paymaster staking + reputation under the alt-mempool rules; a per-clone cap on pending sponsorships (⚠ confirm the alt-mempool stake rules with EF; per-instance reservation is how the canonical paymaster works). **We discuss this tradeoff openly.** |
| **AI hallucination** | Numeric pricing; LLM output bounded; the signed max fee is enforced by contracts |
| **Rogue agent payer** | Per-agent caps enforced in the MCP server (off-chain); the onchain bound is the max fee signed per transaction; stretch: an onchain per-agent cap in OctaneExecutor |
| **Key exposure (makers)** | Maker hot wallets hold limited inventory; a rotate-and-refill script; a planned rotation transfers the `maker` profile entity to the new wallet |
| **A maker inflates its own reputation** | Reputation lives in `makerStats`, owned by the indexer wallet, not in the maker-owned profile (fixed in v3.2). Its inputs are public signed writes, so anyone can recompute it |
| **Our indexer lies about a maker** | `scripts/recompute-fade.ts` rebuilds the same numbers from Arkiv write history and the chains; anyone can run their own indexer |
| **A dead maker's quote lingers on the board** | Rolling ~30s expiry: a crashed maker's quote leaves within 30s. A maker low on gas deletes its own quote, and the coverage score catches one that doesn't |
| **A withdrawn quote is still used** | Deleting or updating the board entry doesn't revoke a signed quote; it stays valid onchain until its `validUntil` (~90–120s). That's the two-clock design, and the maker prices it in |

## 14.7 Tech stack and environments
| Layer | Choice |
|---|---|
| Contracts | Solidity 0.8.x + Foundry (tests, deploy, `forge verify-contract` for the Whitechain explorer ⚠ check the verifier type) |
| Frame transactions | The EF sidecar repo's tooling for encoding and submitting (no viem support for EIP-8141 yet) |
| Off-chain | TypeScript (Node 20), viem, `@arkiv-network/sdk`, `@modelcontextprotocol/sdk`, `@ethersphere/bee-js` (Swarm) |
| Frontend | Next.js + Tailwind (mobile-first PWA) |
| AI | Any LLM (Claude, or 0G PC credits) for the concierge, regime calls and journals; numeric pricing in code |
| Networks | EF alt-mempool devnet (chain **1337**; endpoints in section 19) · Whitechain Sepolia **1874** · Arkiv rabdi **7794095** · (ENS add-on: Ethereum Sepolia, ENSv2) |

## 14.8 Repository layout
```
octane/
├── contracts/                 # Foundry
│   ├── src/lib/QuoteLib.sol           # EIP-712 Quote + verification
│   ├── src/pathA/OctanePaymasterFactory.sol  # EF devnet: EIP-1167 clone per maker
│   ├── src/pathA/OctanePaymaster.sol         # clone logic (immutable-args clone): VERIFY checks + APPROVE(payment); no WETH, no SLOAD
│   ├── src/pathB/OctaneRelay.sol      # Whitechain 1874
│   ├── src/pathB/OctaneExecutor.sol          # EIP-7702 delegate (fallback #1)
│   ├── src/pathB/OctaneAccount.sol + OctaneAccountFactory.sol   # CREATE2 (fallback #2)
│   └── test/
├── packages/sdk/              # @octane/sdk: quotes, pathA, pathB, auction, history (paginated fills, makerStats), identity (resolveIdentity hook)
├── packages/mcp/              # Octane MCP server for AI agents (incl. get_fill_history)
├── apps/makers/               # 3 AI maker agents (pricing, standing-quote loop: update/extend/delete, relayer, bidder, shield, journal → Swarm)
├── apps/web/                  # wallet + concierge + market board + maker statements (all read Arkiv directly)
├── apps/indexer/              # fills + makerStats → Arkiv (write-only, no read API)
├── scripts/recompute-fade.ts  # rebuild makerStats from public Arkiv history + chain data
├── arkiv/                     # schema.md, friction.md, reach.md, why-arkiv.md, how-you-use-arkiv.md, swarm.md
├── WHITECHAIN_FEEDBACK.md
└── README.md                  # setup, architecture, explorer links, "why onchain", AI usage disclosure
```

---

# 15. Pitch deck (12 slides, about 3 minutes plus Q&A)

> Design: dark background with a saffron/orange accent (fuel). Keep each slide to one big idea and a single headline of 6 words or fewer.

| # | Slide (on screen) | Speaker notes (what you say) | Time |
|---|---|---|---|
| **1** | **OCTANE: gas for the agent economy** · tagline: *"AI agents pay. AI makers compete. Nobody operates it."* · team names | "We're [team]. This is Octane: high-performance fuel for the agent economy." | 0:05 |
| **2** | **The problem:** a phone screen saying *"Insufficient ETH for gas"* next to a wallet holding *50 USDT* | "Most people, and now most AI agents, hold stablecoins, not gas tokens. So they're stuck. The number-one onboarding failure in crypto." | 0:15 |
| **3** | **Today's fix is a single pump:** logos of Pimlico, Coinbase, Circle → *one operator · sets the price · can refuse you · treasury to drain* | "Paymasters fix it, but each one is a single company. It sets your price, can censor you, and its gas treasury is a target." | 0:15 |
| **4** | **Why now:** (1) AI agents with stablecoin wallets are exploding · (2) EIP-8141 frame transactions + the alt mempool · (3) chains like Whitechain built for stablecoin payments | "Two things changed in 2026: agents became customers, and Ethereum got native account abstraction through frame transactions. If gas sponsorship ends up run by three companies, that's a censorship chokepoint for every wallet and agent." | 0:15 |
| **5** | **The solution: an open gas market** · the fuel-market diagram (payers ↔ Arkiv board ↔ AI makers) | "Octane is an open fuel market. Independent AI makers post gas prices that expire every 30 seconds. You pay in stablecoins and the cheapest maker fuels your transaction, atomically." | 0:20 |
| **6** | **AI on both sides** · left: Claude via MCP + the concierge · right: 3 maker agents with styles and journals | "AI agents buy gas through our MCP server. Humans use a plain-language concierge. AI makers sell gas, each pricing risk its own way and explaining every move in a public journal." | 0:20 |
| **7** | **🔴 LIVE DEMO** (switch screens) | Run the demo script from section 9 | 1:30 |
| **8** | **Two settlement paths, one market:** Path A (EF alt mempool, frame transactions) · Path B (Whitechain, gasless USDT via competing relayers) | "On Ethereum's next-gen transactions, an open paymaster that only the alt mempool can carry. On Whitechain today, gasless USDT through competing AI relayers." | 0:15 |
| **9** | **Why it's safe:** ✓ **per-maker paymasters** + **maker-bound authorisations** = **nothing shared to drain** ✓ quotes signed and expiring onchain ✓ atomic settlement ✓ AI bounded by signed max fees | "Every maker has its own paymaster, and every signature is bound to one maker, so there's nothing shared to drain. AI decides prices; contracts enforce the rest." | 0:15 |
| **10** | **Why these partners:** EF alt mempool → only place Path A can exist · Whitechain → payers with zero crypto steps · Arkiv → an ownerless, expiring trading floor with reputation anyone can recompute | One line each, the "what breaks without it" answers | 0:15 |
| **11** | **What's next:** a mainnet-ready Path B on Whitechain at launch · makers anyone can run (one-click maker kit) · more chains · Path A when EIP-8141 ships | "Makers earn spread, so the market funds itself. We'll ship Path B with Whitechain's mainnet." | 0:10 |
| **12** | **INDHAN** · *"Open gas. AI on both sides. No operator."* · GitHub, demo, explorer links as QR codes | "Thank you. Happy to show the transactions." | 0:05 |

**30-second elevator pitch:**
🗣️ *"Most people and AI agents hold stablecoins but no gas token, so they can't transact. Today one company's paymaster fixes that and controls your price. Octane is an open gas market: AI market makers post expiring gas quotes on Arkiv, AI agents buy gas through our MCP server, and settlement is atomic. On Ethereum's new frame transactions it's an open paymaster that only EF's alt mempool can carry; on Whitechain it's gasless USDT through competing AI relayers. AI on both sides, no operator, and no treasury to drain."*

**Booth versions (lead with that partner's part):**
- **EF booth:** lead with the **open market + CROPS + the DoS tradeoff** (14.6), then Path A: an admitted transaction and the same transaction rejected by the public mempool. The AI makers are the reason the market has liquidity.
- **Whitechain booth:** lead with **an AI agent paying USDT with zero WBT**, then the relayer and merchant views, and answer "how the relayer gets WBT, what stops draining" (no shared treasury + binding nonce + griefing shield).
- **Arkiv booth:** lead with **agent auctions and expiring quotes**: open the Arkiv explorer and show quotes appearing and expiring, an auction request with its bids and claim, maker ownership, and the query behind the board. Then the four principles, live: **kill a maker** and watch its quote leave the board within 30s (time-scoped + wallet-owned), **run `recompute-fade`** and match the board's numbers (tamper-proof), and **page through a maker's fill history** straight from Arkiv (queryable).

---

# 16. Judges' questions and answers

### General and product
| # | Question | Answer |
|---|---|---|
| 1 | "Why not just use Pimlico or Coinbase's paymaster?" | "They work, but each is one operator: it sets the price, can refuse you, and keeps a treasury that's a target. Octane makes gas a competitive market with no operator. Anyone, including an AI agent, can be a maker." |
| 2 | "Who are the makers in real life, and why would they do it?" | "Anyone with idle ETH or WBT: market makers, exchanges, or individuals running our maker kit. They earn a spread on every fill. It's market-making on gas." |
| 3 | "What's the business model?" | "Makers earn spread, so the market funds itself. A protocol could add a tiny fee later. For the hackathon, there's no fee." |
| 4 | "What if a maker posts a quote and can't honour it?" | "Path A: the protocol itself rejects an underfunded paymaster: its `APPROVE(payment)` reverts, so the transaction is invalid and never admitted. Path B: the maker sends the transaction itself, so with no WBT nothing happens. Either way nobody loses money, the concierge re-quotes, and the maker's fade score drops on Arkiv." |
| 5 | "What if the quote expires while the transaction is in flight?" | "`validUntil` is checked onchain, so the transaction is refused. In Path A it isn't admitted, so nobody pays. The concierge re-quotes automatically." |
| 6 | "Why two chains? Isn't that double-dipping?" | "It's one market with two settlement backends. Path A is where Ethereum is going (frame transactions); Path B is what works on L2s today. The quote board, makers and SDK are shared. Each partner's part works on its own." |
| 7 | "Does the user need a wallet or seed phrase?" | "No. The app holds an embedded key, so the user just taps confirm. Agents use our MCP server. No WBT, no seed phrase, no chain choice: Whitechain's 'zero crypto steps'." |
| 8 | "Is it secure? What about replay?" | "Quotes are EIP-712 signed with chainId, the settlement contract and a nonce in the domain, and `validUntil` is enforced onchain. Settlement is atomic." |

### EF: alt mempool
| # | Question | Answer |
|---|---|---|
| 9 | "Why does this *need* the alt mempool?" | "Two reasons. First, each maker's paymaster checks `USDC.balanceOf(user)` during validation. That reads the USDC contract's storage, and the EIP's mempool rules only let validation read `tx.sender`'s storage. Second, a market maker sponsors many users at once, but the spec caps non-canonical paymasters at 1 pending transaction in the public mempool. We show the same transaction admitted by the alt mempool and rejected by the public one." |
| 10 | "Reading shared state is a DoS risk. How do you handle it?" | "Right: if a maker's deposit runs out, every pending transaction it sponsored becomes invalid. That's mass invalidation. Because each maker has its own paymaster clone, the blast radius is that one maker's own transactions. On top of that: paymaster staking under the alt-mempool rules, a per-clone cap on pending sponsorships, and reputation penalties. We'd propose reserving pending sponsorships against each paymaster instance's balance, like EF's canonical paymaster." *(Shows you understand the hard part.)* |
| 11 | "Which frame layout did you use, and why?" | "The standard paymaster shape: expiry check first, then the sender's verify, then our paymaster's `pay`, then the fee transfer as the first body frame, then the user's calls. It's the same idea as EIP-8141's Example 3. No VERIFY frame may follow the prefix. The tradeoff: once the paymaster approves payment, it pays even if the fee frame reverts. We bound that with the validation-time balance check and one pending transaction per sender. Our upgrade uses a `pre_verify` frame to pull the fee during validation, so the maker is paid before it approves." (Say which layout actually shipped.) |
| 12 | "What would you change in EIP-8141 or the mempool rules?" | Use your `friction.md` notes, for example a first-class "payment receipt" frame for paymasters, or a standard ERC-20 paymaster rule set. |
| 13 | "What's the gas overhead versus a normal transfer?" | Have the number from your Foundry gas report ready. |

### Whitechain
| # | Question | Answer |
|---|---|---|
| 14 | "How does the relayer get its WBT, and what stops someone draining it?" | "Three layers. **No shared treasury:** each relayer is an independent maker using its own WBT, paid in USDT atomically or the transaction reverts. **Maker-bound authorisations:** the EIP-3009 nonce binds each signature to one maker, so a signature can't be sprayed at many relayers to make them burn gas on reverts. **AI griefing shield:** every job is simulated first, and abusive patterns are refused. Makers top up WBT by swapping USDT (stretch: via YetiTrade on Whitechain testnet)." |
| 15 | "Why does this need onchain stablecoin settlement on Whitechain?" | "Final settlement in seconds, 24/7, across borders; the fee split between merchant and maker is atomic and verifiable by everyone; and software (AI agents) can pay software. A card or bank rail can't do agent-to-agent micro-fees." |
| 16 | "Does the test USDT support EIP-3009 or 2612?" | Answer with what you found on Nov 5. If neither, show EIP-7702 delegation (if enabled on 1874) or the CREATE2 smart-account fallback. |
| 17 | "Show me each party." | Payer app → relayer (maker agent) log → merchant receipt → explorer link. |

### Arkiv
| # | Question | Answer |
|---|---|---|
| 18 | "Why Arkiv and not Postgres or Redis?" | "With Postgres we'd be the operator: we could censor makers, fake prices or go down. On Arkiv, each quote is owned by the maker's wallet, expiry is enforced by the chain, and any maker or agent can join and read without our API." |
| 19 | "What did you keep off Arkiv?" | "Keys and user intent (stay on the device), settlement (on the chains), and long AI journals (on Swarm). Arkiv holds only the live market state that needs to be open and short-lived." |
| 20 | "Doesn't 30-second expiry create lots of writes?" | Give real numbers: 3 makers × one update every 10s = 18 writes a minute, while the board itself stays at 3 live entities because each maker updates its own quote in place. Mention what you measured, and what you put in `friction.md`. |
| 21 | "Who can edit each entity?" | "Quotes, bids and maker profiles: only the maker's wallet. Requests: only the payer agent's wallet, which also records the auction winner. Fills and `makerStats`: our indexer, so no maker can rate itself, and anyone can recompute them." |

### AI
| # | Question | Answer |
|---|---|---|
| 22 | "Couldn't a formula set the prices? Why AI?" | "A formula does set the numbers. The AI picks the market regime within bounds, explains every quote in a public journal, filters griefers, and runs auctions. And AI agents are the *customers*: without the MCP side there's no agent demand." |
| 23 | "What if the AI hallucinates a crazy price?" | "It can't exceed the hard caps in code, and the payer signs a maximum fee that the contract enforces. The worst case is a maker quoting badly and losing its own spread." |
| 24 | "Isn't 'gas for AI agents' already done (Circle, Pimlico, UGF)?" | "Yes, by single operators, and we say so in our prior-art section. What's new is an open market where AI makers compete for agent demand, with agent-to-agent auctions on Arkiv." |

### Future
| # | Question | Answer |
|---|---|---|
| 25 | "What happens after the hackathon?" | "Ship Path B on Whitechain's mainnet (launching in November), publish the maker kit so anyone can run a maker, and add more L2s. Path A goes live when EIP-8141 ships." |
| 26 | "How big can this be?" | "Every wallet and agent that holds stablecoins but no gas is a potential payer. Every holder of idle native tokens is a potential maker. It's a market, not a service." |

### v3 additions
| # | Question | Answer |
|---|---|---|
| 27 | "GSN did this in 2019 and faded. Why will makers show up now?" | "GSN proved open relayers work technically; demand and relayer economics didn't. Now AI agents are a constant, programmatic source of demand; on L2s gas is nearly free, so the spread is almost pure margin; joining needs no relay-hub stake, just posting quotes on Arkiv; and frame transactions make paymasters native." |
| 28 | "Why not EF's canonical paymaster plus a USDC transfer in an exec frame?" | "That's the public-mempool-safe baseline, and it's good. But, as we read the design, the canonical paymaster can't check during validation that the user can actually repay in USDC (our inference, not a line in the spec), so its operator carries that risk, and it's one operator's instance. We add per-maker paymasters that check the user's USDC balance and compete on price, which needs the alt mempool." |
| 29 | "What does a node reserve per paymaster in your design?" | "Each maker's clone is its own paymaster instance with its own ETH deposit, so a node can reserve pending gas per clone, the same idea as the canonical paymaster's per-instance reservation. One maker running dry only affects its own pending transactions." |
| 30 | "Two makers get the same signed authorisation. Who eats the revert?" | "Nobody. The EIP-3009 nonce is `keccak256(quoteHash, merchant, amount, maker)`, and OctaneRelay requires `msg.sender == quote.maker`. Other makers can see off-chain that it isn't theirs, so they never submit." |
| 31 | "How does USDT reach the smart account without gas?" | "Preferred: EIP-7702. The user signs a delegation (free) and the maker submits a type-4 transaction, so the user's own address becomes the account, with no funding step (⚠ confirm 7702 is enabled on 1874). Fallback: a CREATE2 counterfactual address; in the demo the faucet funds it directly." |
| 32 | "Who bears the USDT-vs-WBT price risk between quote and submit?" | "The maker. The signed validity is short (~90–120s), and the spread covers it." |
| 33 | "Can a maker censor a user?" | "Individually, yes: any maker can decline. But the board is open, so censoring a user needs every maker to collude. That's the CROPS point: no single company can switch you off." |
| 34 | "Is the agent spend cap onchain?" | "Not today. Per-agent caps are enforced in our MCP server. The onchain bound is the max fee the agent signs in each authorisation. An onchain per-agent cap in the 7702 executor is our stretch goal." |
| 35 | "What's the Arkiv write cost and latency?" | *(Fill with measured numbers: cost per write on rabdi, write-to-queryable latency, writes per minute for 3 makers.)* |
| 36 | "How does the business side pay for the gas?" | "Merchant-pays mode: the merchant's checkout signs an opt-in, and the fee comes out of the merchant's amount instead of the payer's. The maker still pays the WBT gas; the merchant just covers the fee in USDT. We show both modes in the demo." |

### v3.2 additions (Arkiv's four principles)
| # | Question | Answer |
|---|---|---|
| 37 | "Quotes are already EIP-712 signed. What does Arkiv's tamper-proofing add?" | "A signature proves the maker agreed to a price. Arkiv's signed write history proves the price was published to everyone, when, and for how long the maker kept quoting. That's what lets anyone recompute uptime and fade scores instead of trusting our indexer." |
| 38 | "Why update one entity in place instead of creating a new one every 10s?" | "Ownership and expiry do the work. Only the maker can update its quote, and every update extends the expiry, so the board shows exactly one live price per maker and a crashed maker disappears within 30s. No history is lost, because every update is a signed write." |
| 39 | "What happens when a maker goes offline?" | "If it crashes, it stops updating, so its quote leaves the board within 30s with no cleanup job. On a clean shutdown or low inventory, its AI deletes the quote at once. An already-signed quote stays valid until `validUntil`: on Path A the maker's paymaster clone still honours it, because it's a contract; on Path B a crashed maker can't relay, so that attempt fails and counts against it." |
| 40 | "Can a maker fake its reputation?" | "No. Reputation sits in `makerStats`, owned by our indexer's wallet, not in the maker's profile. And the inputs are public, so `pnpm recompute-fade --maker 0x…` gives anyone the same numbers." |
| 41 | "Do you run your own indexer or API?" | "Our indexer only writes fills and stats. The wallet, the MCP tools and the leaderboard all query Arkiv directly, including paginated fill history, so an agent needs nothing from us to use the market." |
| 42 | "Why are journals on Swarm and not on Arkiv?" | "They're long files people read, not records anyone filters. Swarm stores them as a hash-linked chain; Arkiv holds the latest reference in the maker's profile, so a maker's journal is found by query." |

> **Rule for live Q&A:** if you don't know, say *"We haven't measured that yet. Here's how we would."* Never invent numbers. Keep explorer links, gas reports and the Arkiv query open in tabs.

---

# 17. "Isn't this what Uniswap or Jupiter already do?" How Octane is different

## 17.1 What they actually do (checked 2026-11-03)
| Product | How "gasless" works | Who pays the gas | Limits |
|---|---|---|---|
| **UniswapX** (Uniswap) | You sign an off-chain **swap order**; **fillers** submit it and pay the gas, **recovering it through the swap price**. On Ethereum, quoters are polled and the winner gets a short **exclusive** window; then a permissionless Dutch auction runs. ([Uniswap docs](https://docs.uniswap.org/contracts/uniswapx/auctiontypes), [UniswapX blog](https://blog.uniswap.org/uniswapx-protocol)) | Competing fillers | **Swaps only.** The first Permit2 approval can still need gas. |
| **Jupiter Ultra "Gasless Support"** (Solana) | When you have **under 0.01 SOL**, **Jupiter's own gas payer** covers the fee and **deducts it from your swap**. Only on the Metis router, minimum trade about $10. ([Jupiter docs](https://developers.jup.ag/docs/ultra/gasless)) | **Jupiter**, one operator | **Swaps only**, Solana only. The wallet adds a gasless surcharge of up to 10% ([fees](https://docs.jup.ag/user-docs/trade/terminal/fees)). |
| **JupiterZ (RFQ)** | Market makers quote and **pay the fee** for swaps routed through them | Competing market makers | **Swaps only**, Solana only |
| **CoW Swap, 1inch Fusion** | The same intent pattern: solvers or resolvers compete and pay gas out of the trade | Competing solvers | **Swaps only** |
| **ERC-4337 paymasters** (Pimlico, Coinbase, Circle) | A paymaster pays gas for **any** action, and you repay in ERC-20 | **One company** | Single operator: it sets the price, can refuse you, and has a treasury to protect |

## 17.2 The gap: one empty box
|  | **Swaps only** | **Any action** (pay a friend, pay a merchant, an AI agent calling a contract, mint, vote) |
|---|---|---|
| **One operator** | Jupiter Ultra Gasless | ERC-4337 paymasters (Pimlico, Coinbase, Circle) |
| **Open competition** | UniswapX, CoW, 1inch Fusion, JupiterZ | **⭐ Octane** (empty until now) |

**Why swap protocols can't fill that box:** their trick is to **hide the gas cost inside the swap price**: the filler keeps a bit of your output tokens. When you **send 10 USDT to Rahul**, **pay a merchant**, or an **AI agent calls a contract**, there's no swap output to take gas from. Someone has to **explicitly sell you gas**. That's the market Octane creates.

## 17.3 Five differences, in plain words
1. **Any action, not just trades.** Payments, agent tool calls, mints, governance votes: anything a wallet or agent does.
2. **Gas is the product, priced openly.** Makers compete on the price of gas itself, with a separate fee you can see before you sign. It isn't buried in a swap rate or a surcharge.
3. **Open to anyone, owned by no one.** Any wallet or AI agent can post quotes on Arkiv. No company decides who quotes, and no company holds a gas treasury.
4. **You keep your own transaction.** With intents, a filler executes the trade for you. With Octane (Path A), it's *your* frame transaction; only the gas payment is outsourced.
5. **Where it runs.** On **EIP-8141 frame transactions** (Ethereum's next-gen account abstraction, alt-mempool devnet) and **Whitechain**. UniswapX and Jupiter run on neither.

**Bonus:** AI agents are customers. Through the Octane MCP server, an agent holding only stablecoins can make **any** onchain call, not just a swap.

## 17.4 What to say to judges
🗣️ *"UniswapX and Jupiter proved people happily let a competing third party pay their gas, but only when they're swapping, because the gas hides inside the trade. Paymasters work for any action, but one company runs each one. Octane fills the empty box: open competition for gas on **any** action, for humans and AI agents."*

**Be honest about the overlap:** if someone only wants to swap, UniswapX or Jupiter already solve gas well. **Octane doesn't compete on swaps.** It serves everything else.

## 17.5 The strongest objection: "Can't the user just gasless-swap a bit of USDT into ETH on UniswapX, then pay gas normally?"
**Yes, that's a real workaround.** It's the best counter-argument judges can make, so answer it directly:

| Workaround: "swap to gas first" | Octane: "pay per action in stablecoins" |
|---|---|
| **The first step can need gas anyway.** Uniswap's docs say the initial **Permit2 approval** may still need gas. A brand-new wallet holding only a token without `permit` (USDT on Ethereum has none) is stuck before it starts. | One signature. The user never needs the gas token, not even once. |
| **Two steps:** swap, wait, then act. Two chances to fail, plus extra latency. | One step: the action and the gas payment settle together. |
| **You buy gas inventory up front:** a guess at how much you'll need, leftover dust, minimum trade sizes (Jupiter about $10), and you can run out mid-task. | Pay the exact fee per action. No dust, no inventory, nothing to run out of. |
| **AI agents** must monitor and top up ETH, WBT and so on, on every chain they use. That's operational work, and a failure point. | An agent holds **only stablecoins** and pays gas per call through MCP. |
| Only where UniswapX or Jupiter run. | Runs where they don't: Whitechain and EIP-8141 frame transactions. |

**When the workaround is fine:** a human on Ethereum, Base or Arbitrum who already holds a `permit`-capable token and is happy to keep some ETH. Say so honestly.

**Where Octane matters most:** brand-new wallets, **AI agents running across many chains**, and chains or transaction types the swap protocols don't support.

🗣️ *"You can swap into gas first, but then you're managing gas-token balances on every chain, with dust, top-ups and a chicken-and-egg first approval. Octane means you never hold a gas token at all. That matters most for AI agents running on many chains."*

## 17.6 Could Uniswap just build Octane?
**In principle, yes.** UniswapX's intent design could be extended to "deliver 10 USDT to Rahul and keep 0.05 for gas". It hasn't been, because its quoting and filler network are built for **swaps** (input token → a *different* output token), not for selling **gas as a product** for **arbitrary actions**. Say this calmly:
🗣️ *"UniswapX proved the model for swaps. We generalise it to every action, as an open market for gas itself."*

## 17.7 "Isn't Octane also two steps and two gas cuts, like the Uniswap workaround?" No.
**The worry:** "My agent sends USDT to the middleman (gas cut 1), then the middleman sends it to the final destination (gas cut 2)."
**The reality:** there's no second hop. It's **one onchain transaction**. The payer only **signs a message** (free), and the **maker** submits the transaction and pays the gas.

```
UNISWAP WORKAROUND (swap first, then pay)        INDHAN (pay per action)
 tx 0  approve Permit2          ← may need gas    —   payer signs ONE message (no gas)
 tx 1  swap USDT→ETH (UniswapX) ← cost hidden in       │
                                  the swap rate        ▼
 tx 2  send USDT to Rahul       ← YOU pay gas     tx 1 (sent by the maker, who pays the gas):
       (+ ETH dust left over)                          payer ──10 USDT────▶ Rahul     (direct)
                                                       payer ──0.05 USDT──▶ maker     (the only fee)
 = 2–3 transactions, 2–3 costs                    = 1 transaction, 1 fee, payer pays no gas
```

| | Plain transfer (you hold gas) | Uniswap workaround | **Octane** |
|---|---|---|---|
| Transactions **the payer** sends | 1 | 2–3 (approve?, swap, pay) | **0** (only a signature) |
| Total onchain transactions | 1 | 2–3 | **1** |
| Who pays network gas | You | Filler for the swap; **you** for the payment (and the approval) | **The maker**, once |
| Separate costs to the payer | 1 (gas) | 2–3 (swap spread + payment gas + approval gas) | **1** (the maker's fee, shown before you sign) |
| Need to hold a gas token? | Yes | Yes, after the swap (plus dust) | **Never** |
| Does a middleman hold your money? | No | No | **No.** Money goes payer → recipient directly in the same transaction. |

**The honest overhead:** Octane's single transaction uses **more gas units** than a plain transfer, because of the extra signature check and the extra fee transfer. Our estimate is about 1.5–2× a plain ERC-20 transfer; **measure it with `forge test --gas-report` and put the real number in the README**. The maker pays it and prices it into its fee. On an L2 like Whitechain that's cents. It's still one transaction and one fee, with no gas token needed.

🗣️ *"It's not two hops. You sign once, the maker sends one transaction, and inside it your money goes straight to the recipient while the maker takes one visible fee. The swap-first route is two or three transactions, two or three costs, and leaves you holding gas dust."*

## 17.8 "When my USDT moves, don't I get charged gas for that transfer?" Not directly. The maker pays it and your fee covers it (see 17.12).
**The rule of every EVM chain: gas is paid by whoever *sends* the transaction, not by whoever's tokens move.**

- The payer **never sends a transaction**. They only **sign a message** (EIP-712 typed data: `from, to, value, validBefore, nonce`). The wallet pop-up says **"Sign message"**, not "Confirm transaction", and there's **no gas field**. Signing happens on the device and costs nothing.
- The **maker** sends the one transaction (`OctaneRelay.relay(...)`). The maker's address is `tx.origin`, so **the maker's WBT pays the gas**.
- Inside that transaction, the USDT contract checks the payer's signature and moves the payer's tokens (to Rahul, and the fee to the maker). Moving tokens is just a state change *inside someone else's transaction*. It doesn't bill the token owner.
- This is exactly how USDC's own gasless transfers (EIP-3009, created by Circle) work.

**Analogy:** you write and sign a **cheque**, which is free. The **bank** (the maker) processes it and pays the processing cost. It deducts the small fee you agreed to on the cheque, and the money goes straight to Rahul.

**The one exception:** if a token supports **neither** EIP-3009 **nor** EIP-2612 `permit`, the payer would first have to send an `approve` *transaction*, which costs gas. That's why Octane has two fallbacks (section 6): **EIP-7702 first** (the user's own address delegates to `OctaneExecutor` through a free signature) and **a CREATE2 smart account second**. Either way, the payer never sends a transaction.
**Path A (frame transactions):** the payer signs the frame transaction, but EIP-8141 lets the transaction name a **different gas payer**. The paymaster `APPROVE`s payment, so the sender's ETH balance can be zero.

**Prove it in the demo:** show the payer's **WBT balance = 0 before and after**. Then open the transaction on the Whitechain explorer: **"From" = the maker's address, and "Transaction Fee" is paid by the maker.**

## 17.9 How exactly does my USDT move to Rahul and the maker if I never send a transaction?

### The key idea: your USDT isn't "in" your wallet
Your USDT is a **line in the USDT contract's ledger**: `balances[you] = 50`. Your wallet only holds your **private key**, the thing that proves you're you. **Moving USDT means asking the USDT contract to update its ledger.** It does that when it gets a valid instruction from you.

There are **two ways** to give that instruction:
| Way | How the USDT contract knows it's you | Who pays gas |
|---|---|---|
| **1. Normal transfer** | You send the transaction yourself (`msg.sender == you`) | **You** (so you need WBT) |
| **2. Signed authorization (EIP-3009 / permit)** | You **sign a message** with your key; the contract **checks the signature** | **Whoever delivers it**: the maker |

Octane uses **way 2**.

### Step by step
```
STEP 1 (your phone, free, offline)
  You sign: { from: YOU, to: Rahul, amount: 10 USDT, fee: 0.05 USDT to Maker B,
              valid until: 2 minutes,
              nonce: keccak256(quote, Rahul, 10, Maker B) }   ← bound to Maker B only
  → produces a SIGNATURE (a long number only your private key could have made)

STEP 2 (the maker delivers it)
  Maker B sends ONE transaction: OctaneRelay.relay(your signed message)
  → Maker B pays the WBT gas

STEP 3 (inside that transaction, the USDT contract does the work)
  checks: signed by YOU? not expired? nonce unused AND bound to Maker B (the sender)?  ✓
  then updates its ledger:
                      BEFORE       AFTER
     You            50.00 USDT   39.95 USDT
     Rahul           0.00 USDT   10.00 USDT
     Maker B         0.00 USDT    0.05 USDT   (+ Maker B spent ~0.0002 WBT on gas)
     Your WBT           0            0        ← you never needed gas
```

### What the token contract does (simplified EIP-3009)
```solidity
function transferWithAuthorization(address from, address to, uint256 value,
                                   uint256 validBefore, bytes32 nonce, bytes calldata sig) external {
    require(block.timestamp < validBefore,                    "expired");
    require(!authorizationUsed[from][nonce],                  "already used");
    require(recover(hash(from, to, value, validBefore, nonce), sig) == from, "not signed by owner");
    authorizationUsed[from][nonce] = true;
    balances[from] -= value;     // your USDT goes down
    balances[to]   += value;     // the receiver's goes up
}
// Anyone can call this. The caller (msg.sender = the maker) pays the gas.
```
**OctaneRelay (simplified): only the quoted maker can use your authorisation**
```solidity
function relay(Quote calldata q, bytes calldata quoteSig, address merchant, uint256 amount, Auth calldata a) external {
    require(msg.sender == q.maker, "not your job");                       // only the bound maker
    bytes32 bound = keccak256(abi.encode(hashQuote(q), merchant, amount, q.maker));
    require(a.nonce == bound, "authorisation not bound to this maker");
    require(block.timestamp <= q.validUntil && verifyQuote(q, quoteSig), "bad quote");
    usdt.receiveWithAuthorization(a.from, address(this), amount + q.fee,
                                  a.validAfter, a.validBefore, a.nonce, a.sig);
    usdt.transfer(merchant, amount);   // 10 → Rahul
    usdt.transfer(q.maker, q.fee);     // 0.05 → Maker B
}
```
**OctaneRelay** delivers your signed authorization(s) and makes sure **both** movements happen together: 10 to Rahul **and** 0.05 to the maker, or neither. (Implementation options: one authorization per recipient, a single `receiveWithAuthorization` that the relay splits, or `permit` + two `transferFrom`s. All of them are one transaction.)

### Why the maker can't cheat
- **It can't change the amount or recipient.** They're inside the signed message, and changing anything breaks the signature check.
- **It can't use it twice.** The nonce is marked as used.
- **No other maker can use it.** The nonce is bound to Maker B, and the relay requires the sender to be Maker B, so nobody else wastes gas trying.
- **It can't use it later.** It expires (`validBefore`).
- **It can't take more than the 0.05 fee you saw and signed.**

### Why the maker bothers
It earns **0.05 USDT** and spends about **0.0002 WBT** of gas (fractions of a cent on an L2). The AI maker only quotes when the fee is above its gas cost plus margin.

**Analogy:** a **signed cheque**. You write "Pay Rahul ₹10, and ₹0.05 to the courier", and sign it (free). The courier (the maker) carries it to the bank (the USDT contract) and pays the bus fare (gas). The bank checks your signature and moves the money from your account. The courier can't change the amount, because then the signature wouldn't match.

## 17.10 "But doesn't the transaction between me and the maker cost something?" There isn't one.
Two different things get confused here:
| | **Blockchain transaction** | **Message** |
|---|---|---|
| What | Recorded onchain, changes state | Data sent over the internet (like an API call or a WhatsApp message) |
| Cost | **Gas**, paid by whoever sends it | **Free** |
| In Octane | **Exactly one**, sent by the maker | Your signed authorisation, sent from your app to the maker |

```
YOUR PHONE ──(sign: free)──▶ INTERNET ──(message: free)──▶ MAKER ──(1 transaction; maker pays gas)──▶ BLOCKCHAIN
                                                                     inside it: you → Rahul 10
                                                                                you → maker 0.05
```
**Your total cost = the 0.05 USDT fee you saw before signing. Nothing else.** The gas for *both* movements (to Rahul and to the maker) is paid by the maker, which is why it charges the 0.05.

**Proof anyone can check:** an EVM account's **nonce** counts the transactions it has sent. **The payer's nonce stays 0**, because it never sent a transaction. The explorer shows exactly one transaction, **From = the maker**. Show both in the demo.

## 17.11 Don't misread 17.10: the USDT movement **is** onchain
Only the **permission** (your signature) is created and sent off-chain. **The money moves onchain**, inside the maker's transaction, and it's recorded publicly forever.
| Step | Where | Cost |
|---|---|---|
| 1. You sign the permission | Your phone (off-chain) | Free |
| 2. The signed message reaches the maker | Internet (off-chain) | Free |
| 3. **USDT moves: you → Rahul 10, you → maker 0.05** | **Blockchain (onchain)**, inside the maker's one transaction | Gas, **paid by the maker** |

On the Whitechain explorer, that one transaction shows **From: maker → To: OctaneRelay**, with **token transfers: You → Rahul 10 USDT, You → Maker 0.05 USDT**. Rahul's balance shows +10 with that transaction hash. What changes in Octane is **who submits** the transaction (and so who pays gas), **not where the money moves**.

## 17.12 The precise truth: **every** onchain change costs gas, including USDT transfers. Octane changes **who pays it, and in which coin**.
1. **The blockchain is a shared computer** run by thousands of nodes. **Any change to any ledger**, whether the ETH/WBT balances or the USDT contract's balances, makes every node process and store it. **Gas pays them for that work** (and stops spam). Reading is free; changing costs gas.
2. **ETH/WBT vs USDT:** both are ledgers, and both cost gas to change.
   - ETH/WBT balances are kept by the **chain itself**: a plain transfer costs about **21,000 gas units**.
   - USDT balances are kept by the **USDT contract** (a program on the chain): a transfer runs its code and updates its storage, about **35k–65k gas units**. **More**, not less.
   - Octane's transaction (signature check + 2 token movements) is roughly **~100k gas units** (estimate; measure it with `forge test --gas-report`).
3. **Gas can only be paid in the chain's native coin** (ETH on Ethereum, **WBT** on Whitechain), **never in USDT**. That's the chain's rule.
4. **Gas is paid by the account that sends the transaction.**

**So in Octane:** the gas is **still paid, in WBT, by the maker** (the sender). **You repay the maker in USDT** through the fee (0.05 USDT = the gas cost + the maker's profit). **You do pay for gas, indirectly, in USDT, without ever holding WBT.** That's the whole product.

**Analogy (fuel):** every delivery burns **petrol** (gas). The pump only accepts **fuel coupons** (WBT), not rupees (USDT). Normally you must ride yourself, with your own coupons. In Octane, a rider (the maker) **with coupons** does the ride, you pay the rider **in rupees** (the fee), and the rider uses **their** coupons for the petrol. The petrol is still burned, just not from your coupons.

**Correct pitch wording:** say *"users never need or hold a gas token; they pay one small fee in stablecoins"*. **Don't say "gas-free" or "no gas".** Gas is always paid, by the maker.

## 17.13 Honest significance check (read before pitching)
| Claim | Verdict |
|---|---|
| "Users can pay gas without holding the gas token" | **Real problem, already solved** on major chains by single-company paymasters (Circle, Pimlico, Coinbase). **Not our differentiator.** |
| "Better than swap-then-pay" | True (1 signature vs 2–3 transactions, no gas inventory, no approval trap), but **paymasters already give the same UX**. Not unique. |
| "Gas prices get cheaper through competition" | Weak. L2 gas costs fractions of a cent, so users barely feel it. Don't lead with it. |
| **"No operator: nobody can switch off or refuse your gas sponsorship"** | **New and real.** Today a few companies control gas sponsorship. |
| **"Open ERC-20 paymasters for EIP-8141 frame transactions"** | **Partly new.** The ERC-20 sponsor pattern is in EIP-8141 itself (Example 3), and EF prefers a canonical paymaster for the public mempool. **What's new is an open, multi-maker, operator-less market** of per-maker paymasters that check repayment and serve many users, which needs the alt mempool. Centralised paymasters would be a censorship chokepoint, against EF's CROPS mandate. |
| "Open relayer networks are new" | **False.** OpenGSN did it in 2019 and largely faded (our read: weak relayer economics and demand). Our answer: AI-agent demand, near-free L2 gas (spread ≈ margin), no relay-hub stake, expiring quotes on Arkiv. |
| "New chains (Whitechain) need gas abstraction" | Possibly. ⚠ Check whether any paymaster or relayer provider already supports Whitechain Sepolia or mainnet. |
| "AI agents across many chains" | Real pain, partly served by Circle and gas-for-agents MCPs. Incremental. |

**Overall:** as a startup, modest significance. As a hackathon project, a **strong fit**: each sponsor explicitly asked for its piece. Is it "just joining pieces"? Partly, but the open-market design matters most once Ethereum ships native account abstraction.

**Lead the pitch with this "why":**
🗣️ *"Ethereum is getting native account abstraction. If gas sponsorship ends up run by three companies, they become a censorship chokepoint for every wallet and AI agent. Octane is the open alternative: a permissionless gas market with no operator to switch it off."*

**Never claim:** "gas-free", "no gas", "first gasless", "first ERC-20 paymaster" (on frames or anywhere), "cheaper than Uniswap", or "nobody solves paying gas in USDC". All of these are false or easy to knock down. **Do claim:** "we found no open, multi-maker, operator-less market for gas".

---

# 18. ENS add-on (P2, outside the three prize picks)

**Context:** the ENS team advised keeping our three tracks (EF, Whitechain, Arkiv) unchanged and adding ENS where it's meaningful; they may give an ENS bonus for it (⚠ confirm the terms at their booth). We do **not** select the ENS prize, because projects get three partner picks.

**ENS prize facts, for reference:** *Best Use of ENSv2*, $7k ($3k / $2k / $1k / $1k). ENSv2 on Ethereum mainnet or Sepolia; ENSv2 features must be central, "not a cosmetic add-on"; working demo, open-source code. Their suggested directions include subname systems (expiring, revocable) and "agents modeled as namespaces with their own identity and permissions". The second ENS track is Continuity-only (not us).

**Role in Octane:** **ENS = who you are (durable identity). Arkiv = what you're offering right now (live, expiring market).** This also strengthens the Arkiv answer to "what did you keep off Arkiv?".

| # | Add-on | What users see | ENS feature | Effort (estimate) |
|---|---|---|---|---|
| 1 | **Names on the board** | Makers show as `aggressive.octane.eth`, not `0x7a3f…`; the app checks that a quote's signer equals the name's address record | ENSIP-26 agent records: `agent-context` (style, chains, Arkiv profile, Swarm journal) and `agent-endpoint[mcp]` | ~2h |
| 2 | **Pay to names** | "Rahul ko 10 USDT bhejo" resolves rahul.eth's Whitechain address | Name resolution with chain-specific address records | ~1h |
| 3 | **Agent passports with a kill switch** | Each payer agent gets an expiring subname (`payroll.acme.eth`) with its spending rules; revoke or let it expire, and every maker refuses that agent | ENSv2 subname registry (expiry, owner control) + `agent-context` | ~4–6h |
| 4 | **Locked reputation record** (post-hackathon) | A maker can edit its own profile records, but only the reputation role can write `reputation` (the chain reverts otherwise) | ENSv2 Permissioned Resolver per-key setter roles (`grantSetterRoles`; note: no per-name scoping, so one resolver per maker) | post-event |

**The hook (P0, trivial):** `resolveIdentity(addressOrName)` in `@octane/sdk`. Every place that shows or checks a maker or agent (board, concierge, MCP, makers' shield) calls it. At first it returns `{ address, label: shortAddress }`. Adding ENS later changes one file and no contracts.

**Technical limit:** ENS lives on Ethereum (Sepolia/mainnet); settlement is on Whitechain and the EF devnet, whose contracts can't read ENS. Checks happen in makers, MCP and the concierge. The on-chain bound stays the signed max fee.

**Optional:** ENSIP-25 links a name to an on-chain agent registry entry (for example ERC-8004) with the text record `agent-registration[<registry>][<agentId>]`.

**Pitch:** one line at most; details in a README section "ENS integration".

---

# 19. Facts checked on Nov 5 (for builders)

## 19.0 EF questions, answered from their own docs and repos (EF team unavailable)
| # | Question | Answer | Source |
|---|---|---|---|
| 1 | Is a paymaster that reads `USDC.balanceOf(sender)` admitted? | **Only if the paymaster is staked.** An unstaked non-sender entity gets no storage access; a staked one gets read-only access to any non-entity storage. The canonical mempool rejects it (`StorageReadNonSender`). | docs Rules → Storage (STORAGE-000/021/032); workshop `ViolatingWallet.sol` |
| 1b | How do we stake on the devnet? | `addStake(86400)` on `NaiveStakingRegistry` `0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f` with value **> 0.01 ETH** (the workshop uses 0.012). **A contract must call it itself**, so each clone needs a `stake()` forwarder. `unlockStake()` drops staked status immediately. Never stake from the shared genesis or deployer keys. | docs Guides → Stake an entity |
| 2 | Pending-transaction allowance? | Staked and ACTIVE: **no cap on pending transactions** and no sender-wide limit. Unstaked limits exist (constants on the docs' Constants page). | docs Entities and stake; LIFECYCLE-030 |
| 3 | Frame order and expiry? | Shapes: `[self_verify]`, `[deploy, self_verify]`, `[only_verify, pay]`, `[deploy, only_verify, pay]`. One optional **`expiry_verify` (VERIFY, flags 0x0) must be the first frame**. One optional `pre_verify` (DEFAULT mode, target must have code) right before each approving frame. No VERIFY after the prefix, no atomic-batch flag in the prefix; nodes drop transactions whose expiry deadline has passed. | Rules → Prefix (PREFIX-010…120); Concepts → Frame transactions |
| 4 | Settle-revert risk? | **`pre_verify` exists for this:** "a paymaster that pulls ERC-20 tokens from the sender during validation so it is reimbursed before committing to pay". The approving frame must check the `pre_verify` status, since nodes can't enforce it. Reputation blame for a later body-frame revert isn't documented. | Rules → Prefix |
| 5 | Anon-RPC for Whitechain and Arkiv? | Not in the alt-mempool resources (it's a separate prize). Check the Anon-RPC network guide. | — |
| 6 | Which token on the devnet? | **Predeployed USDC** (FiatTokenV2_2, EIP-3009 and permit); the deployer can mint. With a staked paymaster, the proxy's reads are fine. | sidecar `deployments/devnet.md` |
| 7 | Can an EOA be the sender? | **Yes.** An account with no code runs EIP-8141's default code (a "default-code entity"). | docs Entities and stake |
| 8 | How do we show the rejection? | Send the same transaction with `eth_sendRawTransaction` (canonical, forwarded to ethrex) → rejected with a reason such as `StorageReadNonSender`, and with `eth_sendFrameTransaction` → alt mempool. Admission report: `skandha_explorer_getTransaction`. | workshop steps 6 and 8; docs staking guide |
| 9 | About 50 SENDER frames? | Not documented beyond EIP-8141's 64-frame maximum; a staked entity's verification budget is 1M gas. Test it. | — |
| 10 | Ruleset and resets? | The reference implementation follows an earlier ERC-7562-derived draft with different rule IDs (see the docs' "Known differences" page). The devnet may reset at any time, and addresses can change. | docs Rules index; devnet guide |

## 19.1 EF alt-mempool devnet
- **Workshop quickstart:** `github.com/forshtat/mempool-workshop` (Node ≥ 20.12, yarn v1; `yarn step_1_check` creates a throwaway key in `.workshop-state.json`). Steps: sponsored tx via `SponsorPaymaster` (3), `ExampleWallet` (4–5), canonical-mempool rejection (6), staking (7), alt-mempool acceptance after staking (8), banned entity (10); bonus keyed nonces (12) and recent roots (13). Run it in a **separate throwaway folder**, not the project repo.
- **Sidecar:** `github.com/forshtat/mempool-workshop-sidecar`, an ERC-8421 mempool sidecar (fork of Etherspot's Skandha). Exposes `eth_sendFrameTransaction`; needs ethrex's `eip8141-tracer` branch; RPC reference in `deploy/devnet/devnet-readme.md`, canonical addresses in `deployments/devnet.md`.
- **Devnet:** chain ID **1337** (6s blocks) · execution RPC (ethrex, canonical path; `eth_*`, `debug_*`) `https://altmempool.forshtat.com` · **mempool RPC (sidecar, alt mempool) `https://altmempool.forshtat.com/rpc`** (`eth_sendFrameTransaction`; WebSocket `wss://altmempool.forshtat.com/rpc`) · second gossip-connected instance `https://altmempoolgateway.forshtat.com/rpc` · explorer `https://explorer.altmempool.wtf/` (history in memory only) · docs `https://docs.altmempool.wtf/`. **No faucet:** generate your own key and fund it once from the shared genesis key (`deploy/devnet/genesis.values.env` in the sidecar repo; the workshop's `step_1_check` does this). A transfer to a new account needs ≥ 204,600 gas (250,000 is comfortable). **It can reset at any time; addresses can change on reset.**
- **Predeployed (replayed mainnet bytecode):** **USDC** `0xEFe0D421fD473564c9C9b0cDCeB194cF476D6AF5` (FiatTokenV2_2: **permit + EIP-3009**; the deployer holds every role and can mint) · USDT `0xdb6785eB39E80a1770699C5dF8Ab7d4AC683b4D9` (6 decimals; the deployer can `issue`) · WETH9 `0x1b7d32025F7cA633943BbCC9Ec61a98ef66187b6` · Permit2, Uniswap v4, LINK, BAYC, Tornado, Railgun · **`NaiveStakingRegistry` `0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f`** (not a replay; every function only touches `msg.sender`). Full list: `deployments/devnet.md` in the sidecar repo.
- **Contracts helper library:** the workshop's contracts import `@forshtat/hegota-support` (`HegotaSupport`, `approve(Scope.PAYMENT)`, `sigparam(...)`). `SponsorPaymaster` approves payment in its fallback; `ExampleWallet` checks the protocol-verified signer via `sigparam(0, SigParam.RESOLVED_SIGNER)`; `ViolatingWallet` reads a foreign slot: canonical rejects (`StorageReadNonSender`), alt rejects while unstaked and admits once staked.
- **EXPIRY_VERIFIER:** the sidecar code uses `0x…8141` but marks it a placeholder ("verify exact EIP-8141 §Constants value"). Check the EIP text before relying on it.
- **Ruleset caveat:** the workshop pins forshtat/ERCs PR #6, which evolved into ERC-8421; the README says they "are not equivalent" (renamed rule IDs, per-entity verify gas, etc.).
- **Tooling:** no viem support for EIP-8141 yet; encode and submit with the workshop/sidecar tooling.

## 19.2 ERC-8421 rules that matter to us (draft)
- **Storage (docs, STORAGE-0xx):** restricted unless a rule allows it. STORAGE-010: `tx.sender`'s own storage is always allowed. STORAGE-021: storage **associated with `tx.sender`** in an external non-entity contract is allowed when the sender already exists (no deploy frame). **An unstaked non-sender entity, such as our paymaster, gets no storage access at all.** Staked entities: their own storage (031), **read-only access to any storage in a non-entity contract (032)**, and writes to slots associated with their own address (033). Writes happen only in `deploy` and `pre_verify` frames.
- **Default-code senders:** an account with no code runs EIP-8141's default code, is never staked and is exempt from the opcode, call and storage rules, so a plain EOA can be `tx.sender`.
- **Staking:** `MIN_STAKE_VALUE` ≈ USD 1,000 in the native token (per chain), `MIN_UNSTAKE_DELAY` = 1 day, never slashed.
- **Pending transactions:** unstaked payer `opsAllowed = 10 + inclusionRate × min(included, 10000)` (a new payer gets 10); throttled 4; **staked ACTIVE: no cap**. Unstaked sender ≤ 64 pending, ≤ 4 per (sender, nonce key).
- **Verification gas per entity:** 100k unstaked, 1M staked. `BALANCE`/`SELFBALANCE` allowed only for staked entities.
- **Solvency:** a payer's available balance, minus reservations for its other pending transactions, must cover the max cost.
- **Reputation:** seen/included counters per entity; throttled, then banned; "a payer must not lose reputation because of another entity's failure".
- **Implication:** **stake every paymaster clone** and use the **predeployed USDC** (EIP-3009, the same standard as Path B). Mint test USDC to payer wallets with the published deployer key. Staking makes the proxy's extra reads fine (STORAGE-032).

## 19.3 EIP-8141 public (canonical) mempool
Per go-ethereum PR #35814's summary: storage reads outside the sender are rejected; `TIMESTAMP` only inside the expiry verifier; a non-canonical paymaster backs at most `MAX_PENDING_TXS_USING_NON_CANONICAL_PAYMASTER` pending transactions (1 in the spec); the canonical paymaster's code isn't pinned yet (EIPs PR #12041 open).

## 19.4 Whitechain Sepolia (1874)
- **Test USDT:** `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` · **EIP-3009 ✅** (workshop, Nov 5) · check `decimals()` (likely 6) and the EIP-712 domain before signing. Self-minted tokens don't count.
- **Faucet:** `https://faucet.testnet.whitechain.io`: GitHub OAuth (account ≥ 30 days), a non-zero Ethereum **mainnet** balance as a Sybil filter, **0.1 WBT per 24h** (Standard tier).
- **RPC:** `https://rpc.testnet.whitechain.io` (public) or Ankr's free hacker RPC. On Ankr, filter and txpool methods are blocked (use `eth_getLogs`), and `debug_*`/`trace_*` need a paid plan.
- **Explorer:** `https://explorer.testnet.whitechain.io` (contracts must be verified there).

## 19.5 Anon-RPC (hour-14 fallback)
Requirement: the app routes its RPC reads through Anon-RPC by default. Links: `https://ethereum.github.io/anon-rpc/` · wallet guide `/anon-rpc/wallets/` · network guide `/anon-rpc/networks/` · `github.com/ethereum/anon-rpc` · npm `@anon-rpc/browser-harness`.

## 19.6 Sources
ETHGlobal Mumbai prizes page · forshtat/mempool-workshop README · ERC-8421 Mempool Sidecar README · ERC-8421 draft (forshtat/ERCs) · go-ethereum PR #35814 · ethpandaops frames-devnet-0 notes · Whitechain L2 docs (faucet) · Ankr Whitechain testnet changelog · ENSIP-25 (ens.domains blog) · ENSIP-26 draft · ENSv2 docs (Permissioned Resolver, Subnames).
