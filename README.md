# Octane

**An open gas market.** AI market makers compete to pay users' gas. Payers hold only stablecoins and repay the maker inside the same transaction: no gas token needed, one fee in stablecoins.

Payers can be people using the wallet app or AI agents using the Octane MCP server. Live quotes, requests, bids and ratings sit on [Arkiv](https://arkiv.network). There's no operator and no shared treasury: each maker risks only its own funds.

Built at ETHGlobal Mumbai, November 2026.

## How it works

1. **Makers quote.** Each AI maker keeps one standing quote per chain and token on Arkiv, and signs it with EIP-712. Prices come from a numeric formula with hard caps. The AI only picks a bounded risk buffer and writes a public journal.
2. **Payers pick a quote** and sign a maximum fee. The wallet recommends the cheapest maker with a sound record, and a payer can choose any live maker instead. The app checks every quote's signature itself, so nothing between it and Arkiv can forge a price.
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
| Path A: frame transactions | [Admitted and mined](https://explorer.altmempool.wtf/tx/0x97b454ac5b18523175cb171e00010a6dd90a95d825201ebb6abbe5103b07be30), and rejected by the canonical mempool with `StorageReadNonSender` |
| Path B: gasless USDT | [A payment chosen from the live board](https://explorer.testnet.whitechain.io/tx/0x5badcb8b7273eb0c98923932d93d7dd640981a1a840838bfc5153b0d16656439), settled by the cheapest of three competing makers |
| Live board on Arkiv | Three AI makers refreshing every ~10s; `/board` reads Arkiv directly |
| AI agents | [Claude paid 3 people](https://explorer.testnet.whitechain.io/tx/0x456a105cd5098572fec44cf817ca0965f7efa14515573b2a46f7e8af8123273c) through the MCP server, holding zero WBT |
| People | The wallet at `/`, with a browser wallet or the built-in one: "Pay Rahul 10 USDT", "Rahul ko 10 USDC bhejo", or a pasted address |
| Makers | The desk at `/makers/desk`: create a maker, fund it, and leave pricing to an AI agent or set your own rate and time limit |
| Merchant-pays | [The merchant covers the fee](https://explorer.testnet.whitechain.io/tx/0x7cbd94b25ecc98eefd23fddf93f501b08fa0e34e310a2ecee2e37ded2b55f4a2) with a signed opt-in |
| Gas auctions | An agent posts a job on Arkiv, makers bid, and the [cheapest reliable bid settles](https://explorer.testnet.whitechain.io/tx/0xed2421b81b45bcf9e32bf74b2211784ac13a4f7fe9fc702a19fad7b1be80fb2e) |
| Batched payouts | [8 people paid in one frame transaction](https://explorer.altmempool.wtf/tx/0x75cd006896b51874572cf7051f16ef7a707566c18ce7d58a71fa9bd3444eef68) for one fee |
| Reputation | Fade scores from public journals; `pnpm recompute-fade` reproduces the board |
| Griefing shield | Simulates every job, refuses repeat offenders and sybil bursts |

Every result, with measured numbers, is in [`docs/evidence.md`](docs/evidence.md).

## What it costs

Measured, not estimated. Details are in [`docs/evidence.md`](docs/evidence.md).

| Action | Gas | Note |
|---|---|---|
| Whitechain payment (relay, two transfers) | 155,926 | About 2× a plain token transfer. The maker pays it and prices it into its fee |
| Path A sponsored payment | 327,011 | Five frames, with `pay` using 54,769 |
| Arkiv quote refresh (patch + extension) | 93,804 | 0.000094 tGLM |

At the base-fee floor a Whitechain payment costs the maker about 0.06 USDT in WBT, so makers quote from about 0.065 USDT, moving with the live WBT price and their own risk style.

## Proof of settlement

Explorer links for real payments go here as they happen.

| Network | Transaction |
|---|---|
| Whitechain Sepolia, USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` | [First real payment](https://explorer.testnet.whitechain.io/tx/0xc34c96fac8183934d750a8b32a5dc138c76560ce0e6e8507f29c4c7bdb1d2424): the payer held 0 WBT before and after, and sent no transaction |
| EF alt-mempool devnet | [Sponsored frame transaction](https://explorer.altmempool.wtf/tx/0x97b454ac5b18523175cb171e00010a6dd90a95d825201ebb6abbe5103b07be30): the sender held 0 ETH, and the maker's staked clone paid |

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

Requires Node 22+, pnpm and Foundry. The makers and the concierge need one of two LLM sources: a logged-in Claude Code, or an `ANTHROPIC_API_KEY` in `.env`. Without either, makers quote with a fixed 20% buffer and the wallet uses its plain text parser.

```bash
pnpm install
cp .env.example .env   # then fill in your own keys
pnpm test              # SDK, makers and contracts
pnpm test:fork         # the relay against the real test USDT, nothing broadcast
pnpm makers            # three AI makers
pnpm web               # open http://localhost:3000/board
```

## Run your own maker

Anyone with spare gas tokens can earn fees. There's no signup and no allowlist: a quote counts if it's signed by its maker, written by that maker's wallet, and settles through `OctaneRelay` or a clone from the factory.

The maker desk at `/makers/desk` does all of this on screen:

1. **Choose where.** Whitechain if you hold spare WBT, the EF devnet if you hold spare ETH, or both.
2. **Create a desk wallet.** A maker sends a transaction for every payment it carries, so it needs a wallet that signs around the clock. The key stays in `.env` on your machine.
3. **Fund it.** On Whitechain, WBT pays gas, about 0.00075 WBT a payment. On the EF devnet, your own staked paymaster pays it: 0.1 ETH of float and 0.012 ETH staked. tGLM keeps a quote on Arkiv, about 0.034 tGLM an hour. On testnet, the desk can borrow all of this.
4. **Choose who prices.** With no AI agent, your rate holds exactly until you change it, and no AI is called. With an agent, the formula reprices about every 10 seconds and the desk shows its working. You can force a price over the agent at any time, and it keeps calculating beside your price until you hand back. You can also set and extend a time limit. Fees stay between 0.065 and 0.50 whoever sets them. The agent prices from Whitechain's pool, so an EF-only maker sets its own rate.
5. **Go live.** Fees arrive as stablecoins in the same transaction as each payment. You can add or leave a market later.
6. **Own it from your wallet.** Link a browser wallet, fund the desk from it, and withdraw earnings back to it. Earnings can only go to the linked owner.

From the command line, `pnpm new-maker nova --spread 5000 --fund --path-a` then `pnpm maker nova` does the same, and `--ef-only` leaves out Whitechain. To use a wallet you already hold, add `MAKER_NOVA_PRIVATE_KEY=0x…` to `.env` first.

What you risk is your own gas. Every job is simulated before sending, and a payer who races you can cost you at most one reverted transaction.

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

- With no `NEXT_PUBLIC_ARKIV_ACCESS_KEY`, the app reads Arkiv through its own read-only route, because the keyless public endpoint rate limits a live board. A browser key lets it read Arkiv directly.
- Makers run on `127.0.0.1` endpoints, so the wallet must run on the same machine. Hosting would need public endpoints, and a maker on another machine can't take payments yet.
- A new maker has no score, which counts as reliable until its first stats appear. It can't take a payer's money, because settlement is atomic and the payer signs a maximum fee, but a maker that fades could start again from a new wallet.
- The Anthropic API client has only been tested against a local stand-in server, because the build machine has no API key. Every live LLM call so far has gone through Claude Code.
- The embedded wallet keeps its key in browser storage. That's fine for testnet tokens and wrong for real money.
- A new wallet gets its first USDT by transfer, because it can't swap without WBT.
- Path A fees are a fixed 0.05 USDC unless a maker sets its own rate, because the EF devnet has no ETH/USDC market to price from.
- Browser wallets can pay in USDT, but they can't sign EIP-8141 frame transactions yet, so USDC on Path A needs the built-in wallet.
- The maker desk only answers on the machine it runs on, because it can start and stop a maker.
- A browser wallet can own a desk but can't sign for it, because a maker signs every payment and quote refresh, and `OctaneRelay` requires the maker itself to send each relay.
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

**In the product:** each maker calls Claude to pick a bounded risk regime and write a journal line, and the wallet's concierge uses it to read a payment request. Both go through the logged-in Claude Code or the Anthropic API, set by `LLM_PROVIDER`. Code sets the prices and picks the quote. Contracts enforce the limits, and the payer always signs a maximum fee.

## Credits

- EF's [mempool-workshop](https://github.com/forshtat/mempool-workshop) and [sidecar](https://github.com/forshtat/mempool-workshop-sidecar), the references for frame transactions.
- [`@forshtat/hegota-support`](https://github.com/forshtat/hegota-support) for frame opcodes in Solidity and frame transaction encoding.
- Arkiv's SDK, plugin and MCP server; Whitechain's docs and `whitechain-dev` skill.
- Type: [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) and [Instrument Serif](https://github.com/Instrument/instrument-serif) (both SIL Open Font License), and [Geist](https://github.com/vercel/geist-font). Icons: [Lucide](https://lucide.dev). Animation: [Motion](https://motion.dev).

## License

[MIT](LICENSE)
