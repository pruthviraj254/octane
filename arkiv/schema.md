# Arkiv schema

Octane stores its live market on Arkiv (Rabdi, chain 7794095). Schemas are defined in code in [`packages/sdk/src/arkiv/schema.ts`](../packages/sdk/src/arkiv/schema.ts). Only indexed columns can be filtered.

| Entity | Schema name | Indexed columns | Other columns | Owner | Lifetime |
|---|---|---|---|---|---|
| Standing quote | `octane.quote` | `chainId`, `token`, `maker`, `fee`, `maxGas`, `validUntil` | `settlement`, `nonce`, `seq`, `style`, `quoteHash`, `sig` | Maker wallet | 30s (15 blocks), extended on every refresh |
| Maker profile | `octane.maker` | `maker`, `style` | `endpoint`, `journalRef`, `journalSeq` | Maker wallet, transferable | 7 days, extended |
| Auction request | `octane.request` | `chainId`, `payer`, `maxFee`, `deadline`, `winner` | `jobs` | Payer agent wallet | 60s (30 blocks) |
| Bid | `octane.bid` | `requestKey`, `maker`, `fee` | `quote` | Maker wallet | Same block as its request |
| Fill | `octane.fill` | `chainId`, `maker`, `payer`, `txHash`, `quoteHash`, `ts` | `fee`, `receipt` | Indexer wallet, read-only | 30 days |
| Maker stats | `octane.makerStats` | `maker`, `epoch`, `fadeScore` | `uptime24h`, `coverage24h`, `fills24h`, `pnl24h`, `inputs` | Indexer wallet | 1 day, updated each epoch |

## Writes

- A quote refresh is one atomic `executeBatch` holding a patch and an extension, because `patchEntity` never moves expiry.
- Each wallet writes through one serial queue. A write that fails isn't resent, because its outcome may be unknown.
- One maker's quotes for both chains share one transaction.

## Who to trust

Anyone can write entities under these schema names, so a read must check who wrote them:

- A quote counts only if its EIP-712 signature recovers to its `maker`, its `$owner` is that same `maker`, and its `settlement` is a contract the reader recognises. The last check stops a fake maker naming its own contract to collect a payer's authorisation. See [`fetchBoard`](../packages/sdk/src/arkiv/board.ts).
- Fills and stats count only if `createdBy` is the indexer wallet.
- A bid counts only if its maker both wrote and signed it.

Expiry emits no event, so the board asks again every block.
