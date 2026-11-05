# Octane

**An open gas market.** AI market makers compete to pay users' gas. Payers hold only stablecoins and repay the maker inside the same transaction: no gas token needed, one fee in stablecoins.

Payers can be people using the wallet app or AI agents using the Octane MCP server. Live quotes, requests, bids and ratings sit on [Arkiv](https://arkiv.network). There's no operator and no shared treasury: each maker risks only its own funds.

Built at ETHGlobal Mumbai, November 2026.

> **Status: in progress.** Everything below describes the design. The status table shows what actually works so far.

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

## Status

| Piece | State |
|---|---|
| Path A: one maker, one admitted transaction | Not started |
| Path B: three maker-relayers, binding nonce | Relay [deployed and verified](https://explorer.testnet.whitechain.io/address/0xc5DC3334636e5d053f0AC383722af4C05Db2a4Bf); one real payment settled; maker-relayers next |
| Arkiv live quote board | Not started |
| MCP `send_sponsored` on Whitechain | Not started |
| Basic concierge | Not started |

## Proof of settlement

Explorer links for real payments go here as they happen.

| Network | Transaction |
|---|---|
| Whitechain Sepolia, USDT `0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7` | [First real payment](https://explorer.testnet.whitechain.io/tx/0xc34c96fac8183934d750a8b32a5dc138c76560ce0e6e8507f29c4c7bdb1d2424): the payer held 0 WBT before and after, and sent no transaction |
| EF alt-mempool devnet | Pending |

## Why onchain stablecoin settlement on Whitechain

To be written from the working flow. It will say why this payment needs onchain stablecoin settlement, and what a regular payment rail couldn't do here.

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

Requires Node 22+, pnpm and Foundry.

```bash
pnpm install
cp .env.example .env   # then fill in your own keys
pnpm test
```

## Arkiv writers and a runnable query

Writer wallets and the live board query go here once the board is running.

## Current limitations

- Only the Path B relay is deployed so far. There is no way to use it yet without running scripts.

## AI usage disclosure

This project is built with AI assistance.

- **Development:** Claude Code (Anthropic) is used for planning, writing code and tests, research and documentation. One human builder directs the work, reviews it, and integrates and tests the result.
- **Agent tooling:** Claude Code runs with the official Arkiv plugin, Whitechain's `whitechain-dev` skill and docs MCP, and a local index of the EF alt-mempool docs. The files in `.claude/skills/` are third-party reference material, not project code.
- **In the product:** the makers call an LLM at runtime to choose a bounded risk buffer and write journal lines. Contracts enforce the limits, and the payer always signs a maximum fee.

## Credits

- EF's [mempool-workshop](https://github.com/forshtat/mempool-workshop) and sidecar, used as references for frame transactions.

## License

[MIT](LICENSE)
