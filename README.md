# Octane

**An open gas market.** AI market makers compete to pay users' gas. Payers hold only stablecoins and repay the maker inside the same transaction: no gas token needed, one fee in stablecoins.

Payers can be people using the wallet app or AI agents using the Octane MCP server. Live quotes, requests, bids and ratings sit on [Arkiv](https://arkiv.network). There's no operator and no shared treasury: each maker risks only its own funds.

Built at ETHGlobal Mumbai, November 2026.

## How it works

1. **Makers quote.** Each AI maker keeps one standing quote per chain and token on Arkiv, and signs it with EIP-712. Prices come from a numeric formula with hard caps. The AI only picks a bounded risk buffer and writes a public journal.
2. **Payers pick a quote** and sign a maximum fee. The app and MCP tools read Arkiv directly, so no Octane server sits in between.
3. **Settlement is atomic.** The maker pays the gas and receives its fee in the same transaction, or the transaction fails.

### Two settlement paths, one market

| | Path A: frame transactions | Path B: gasless USDT |
|---|---|---|
| **Network** | EF alt-mempool devnet (EIP-8141, chain 1337) | Whitechain Sepolia (chain 1874) |
| **Who pays gas** | The maker's own staked paymaster clone | The maker's own wallet, acting as relayer |
| **How the payer signs** | An EIP-8141 frame transaction | An EIP-3009 `receiveWithAuthorization` bound to one maker and one quote |
| **Why this network** | The paymaster reads the sender's USDC balance during validation, which only the staked alt mempool admits | Payers hold USDT and never need WBT |

## What works today

| Piece | State |
|---|---|
| Path A: frame transactions | [Admitted and mined](https://explorer.altmempool.wtf/tx/0x4001574dfa5d5457a0bcd0bdd533af602e8a42c4f9c264d86bffb04a34435605), and rejected by the canonical mempool with `StorageReadNonSender` |
| Path B: gasless USDT | [A payment chosen from the live board](https://explorer.testnet.whitechain.io/tx/0x5badcb8b7273eb0c98923932d93d7dd640981a1a840838bfc5153b0d16656439), settled by the cheapest of three competing makers |
| Live board on Arkiv | Three AI makers refreshing every ~10s; `/board` reads Arkiv directly |
| AI agents | [Claude paid 3 people](https://explorer.testnet.whitechain.io/tx/0x456a105cd5098572fec44cf817ca0965f7efa14515573b2a46f7e8af8123273c) through the MCP server, holding zero WBT |
| People | The wallet at `/`: "Pay Rahul 10 USDT" or "Rahul ko 10 USDC bhejo" |
| Merchant-pays | [The merchant covers the fee](https://explorer.testnet.whitechain.io/tx/0x7cbd94b25ecc98eefd23fddf93f501b08fa0e34e310a2ecee2e37ded2b55f4a2) with a signed opt-in |
| Gas auctions | An agent posts a job on Arkiv, makers bid, and the [cheapest reliable bid settles](https://explorer.testnet.whitechain.io/tx/0xed2421b81b45bcf9e32bf74b2211784ac13a4f7fe9fc702a19fad7b1be80fb2e) |
| Batched payouts | [8 people paid in one frame transaction](https://explorer.altmempool.wtf/tx/0x75002521cff97269a8925500cc83ef20c4739d0b42cbd7c9ad330124f472e0e2) for one fee |
| Reputation | Fade scores from public journals; `pnpm recompute-fade` reproduces the board |
| Griefing shield | Simulates every job, refuses repeat offenders and sybil bursts |

Every result, with measured numbers, is in [`docs/evidence.md`](docs/evidence.md).

## What it costs

Measured, not estimated. Details are in [`docs/evidence.md`](docs/evidence.md).

| Action | Gas | Note |
|---|---|---|
| Whitechain payment (relay, two transfers) | 155,926 | About 2× a plain token transfer. The maker pays it and prices it into its fee |
| Path A sponsored payment | 327,023 | Five frames, with `pay` using 54,769 |
| Arkiv quote refresh (patch + extension) | 93,804 | 0.000094 tGLM |

At the base-fee floor a Whitechain payment costs the maker about 0.06 USDT in WBT, so makers quote from about 0.065 USDT, moving with the live WBT price and their own risk style.

## Proof of settlement

Explorer links for real payments go here as they happen.

| Network | Transaction |
|---|---|
| Whitechain Sepolia, USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` | [First real payment](https://explorer.testnet.whitechain.io/tx/0xc34c96fac8183934d750a8b32a5dc138c76560ce0e6e8507f29c4c7bdb1d2424): the payer held 0 WBT before and after, and sent no transaction |
| EF alt-mempool devnet | [Sponsored frame transaction](https://explorer.altmempool.wtf/tx/0x4001574dfa5d5457a0bcd0bdd533af602e8a42c4f9c264d86bffb04a34435605): the sender held 0 ETH, and the maker's staked clone paid |

## Why onchain stablecoin settlement on Whitechain

A payer here can be software. An AI agent can't open a merchant account or keep a card on file, but it can sign a message, and the payment settles in about a second, at any hour, across borders, with no intermediary able to refuse it.

A regular payment rail couldn't do three things here:

- **Split atomically.** The merchant's payment and the maker's fee move in one transaction, or neither moves. A card network settles the fee later, and someone carries that risk.
- **Let competitors settle each other's market.** Any maker can relay any payment bound to it, with no acquirer or contract between them. The only agreement is a signed quote.
- **Pay tiny amounts between machines.** A fee of a few cents, paid by an agent to another agent, doesn't fit a rail with fixed per-transaction costs and signup.

**How the business side pays for gas:** by default the payer's fee covers it. In merchant-pays mode the merchant signs an opt-in and the fee comes out of its amount.

**How a relayer gets WBT:** each maker holds its own WBT and earns USDT on every relay, which it can swap back on the testnet's Uniswap V3 pool. A maker low on WBT widens its price, then leaves the board.

**What stops someone draining it:**

1. There's no shared treasury. Each maker risks only its own wallet, and is paid in the same transaction or the transaction reverts.
2. Each authorisation is bound to one maker through its EIP-3009 nonce, so a signature can't be sprayed at many relayers to make them burn gas.
3. Every job is simulated immediately before sending. Payers with repeated failed jobs and sudden bursts are refused. A payer who races a maker can cost it at most one reverted transaction, about 90k gas.

## Architecture

```
contracts/      Foundry contracts: quote library, Path A paymaster, Path B relay
packages/sdk/   @octane/sdk: quotes, both settlement paths, Arkiv, identity
packages/mcp/   MCP server for AI agents
apps/makers/    Three AI makers: pricing, standing quotes, relayer, journal
apps/web/       Wallet, concierge and market board
apps/indexer/   Writes fills and maker stats to Arkiv
arkiv/          Schema and Arkiv track write-ups
docs/           The full plan, open questions and evidence
```

## How to run

Requires Node 22+, pnpm, Foundry and a logged-in Claude Code (the makers use it for regime calls).

```bash
pnpm install
cp .env.example .env   # then fill in your own keys
pnpm test              # SDK, makers and contracts
pnpm test:fork         # the relay against the real test USDT, nothing broadcast
pnpm makers            # three AI makers
pnpm web               # open http://localhost:3000/board
```

## Arkiv writers and a runnable query

| Writer | Wallet | Writes |
|---|---|---|
| Maker Cautious | `0x8B07DcE945641A7032BA44697Fff41ccAD2B12ea` | Quotes on both chains, profile, bids |
| Maker Aggressive | `0x4C004C0261B2848b56334f8E518b2F54ED1da9e7` | Quotes, profile, bids |
| Maker Balancer | `0x92CbA72bbeBf2b8d0388b566bB72d842daac10b4` | Quotes, profile, bids |
| Indexer | `0xb547061EE3090b42E66e2F7F9378fbEd6863FE8E` | Fills, maker stats |
| Payer agent | `0x52fbf81bAD237e818A35ab9B23864bE0287767cb` | Auction requests |

The live board, with no key and no code (makers must be running):

```bash
curl -s -X POST https://rpc.rabdi.db-chain.testnet.arkiv.network \
  -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"arkiv_query\",\"params\":[\"arkiv.schema = str('octane.quote') AND chainId = u64(1874)\",{\"select\":{\"key\":true,\"owner\":true,\"expiresAt\":true}}]}"
```

Recompute a maker's reputation from public data alone:

```bash
pnpm recompute-fade --maker 0x8B07DcE945641A7032BA44697Fff41ccAD2B12ea
```

More: [`arkiv/`](arkiv/), [`docs/ef-design.md`](docs/ef-design.md), [`WHITECHAIN_FEEDBACK.md`](WHITECHAIN_FEEDBACK.md).

## Current limitations

- Makers run on one machine with a logged-in Claude Code, on `127.0.0.1` endpoints, so the wallet must run on that machine too. Hosting would need public endpoints and an LLM API client, which isn't built.
- If Claude Code isn't available, makers still quote with a fixed 20% buffer, and the wallet falls back to a plain text parser.
- The embedded wallet keeps its key in browser storage. That's fine for testnet tokens and wrong for real money.
- A new wallet gets its first USDT by transfer, because it can't swap without WBT.
- Path A fees are a fixed 0.05 USDC, because the EF devnet has no ETH/USDC market to price from. Only Maker Cautious quotes on Path A.
- Path A ships Layout 1, so a maker can pay gas for a fee frame that later reverts. The damage is bounded, and [`docs/ef-design.md`](docs/ef-design.md) explains it and a tested fix.
- Swarm journals use a public gateway's stamps, so they can disappear without notice. See [`arkiv/swarm.md`](arkiv/swarm.md).
- Agent spend caps are enforced in the MCP server, off-chain. The onchain limit is the maximum fee signed for each payment.
- Auctions need a little tGLM in the agent's wallet, because Arkiv has no sponsored writes.
- The EF devnet can stop or reset at any time. Makers pause Path A quotes when it stops producing blocks, and `scripts/setup-devnet.ts` rebuilds Octane's side after a reset.

## AI usage disclosure

Octane was built with heavy AI assistance, by one human builder and Claude Code (Anthropic).

**The human builder** chose the product and prize tracks, set the design decisions in [`docs/OCTANE.md`](docs/OCTANE.md), decided each question that came up during the build, and approved every deployment and on-chain step.

**Claude Code** did most of the implementation, under that direction:

| Part | Files | AI's role |
|---|---|---|
| Contracts | `contracts/src`, `contracts/test`, `contracts/script` | Generated, including tests |
| SDK | `packages/sdk` | Generated |
| AI makers | `apps/makers` | Generated |
| MCP server | `packages/mcp` | Generated |
| Wallet and board | `apps/web` | Generated |
| Indexer and scripts | `apps/indexer`, `scripts` | Generated |
| Sponsor write-ups | `arkiv/`, `WHITECHAIN_FEEDBACK.md`, `docs/ef-design.md` | Drafted from measured results |
| Plan | `docs/OCTANE.md`, `docs/octane-plan.md` | AI-assisted |
| Reference material | `.claude/skills/` | Third-party docs, not project code |

**In the product:** each maker calls Claude Haiku to pick a bounded risk regime and write a journal line, and the wallet's concierge uses it to read a payment request. Code sets the prices and picks the quote. Contracts enforce the limits, and the payer always signs a maximum fee.

## Credits

- EF's [mempool-workshop](https://github.com/forshtat/mempool-workshop) and [sidecar](https://github.com/forshtat/mempool-workshop-sidecar), the references for frame transactions.
- [`@forshtat/hegota-support`](https://github.com/forshtat/hegota-support) for frame opcodes in Solidity and frame transaction encoding.
- Arkiv's SDK, plugin and MCP server; Whitechain's docs and `whitechain-dev` skill.

## License

[MIT](LICENSE)
