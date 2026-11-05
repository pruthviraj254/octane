# How Octane uses Arkiv

Each of Arkiv's four principles maps to something a user or judge can see.

## Queryable

| What | The query | Where you see it |
|---|---|---|
| Live board | `octane.quote` where `chainId`, `token` and `validUntil > now`, ordered by `fee` | `/board`, and the quote the wallet picks |
| Open auctions | `octane.request` where `chainId` and `deadline > now` | Makers poll this to bid |
| Bids on a request | `octane.bid` where `requestKey`, ordered by `fee` | The agent takes the cheapest |
| Maker statement | `octane.fill` where `maker`, newest first, paged | `/history?maker=0x…` |
| My gas spend | `octane.fill` where `payer`, newest first, paged | `/history?payer=0x…`, and MCP `get_fill_history` |
| Where to send a job | `octane.maker` where `maker` | Finds a maker's relayer endpoint |

No Octane server sits behind any of these. Try one yourself:

```bash
curl -s -X POST https://rpc.rabdi.db-chain.testnet.arkiv.network \
  -H 'content-type: application/json' \
  -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"arkiv_query\",\"params\":[\"arkiv.schema = str('octane.quote') AND chainId = u64(1874)\",{\"select\":{\"key\":true,\"owner\":true,\"expiresAt\":true}}]}"
```

## Time-scoped

Expiry is how the market stays honest about what's live.

- A quote lives 30 seconds and every refresh extends it. **Kill a maker and its quote disappears on its own.** We measured [29 seconds](../docs/evidence.md) after the last refresh, and no cleanup job exists.
- A maker can leave at once: it deletes its quote on clean shutdown, low inventory or a shock regime.
- Bids expire on the same block as their request.
- Fills last 30 days, profiles 7 days and stats 1 day, so each lifetime fits how long the data matters.
- The board's expiry (30s) is deliberately shorter than a signed quote's onchain validity (about 105s). The first keeps prices fresh and the second gives a person time to confirm.

## Tamper-proof

Every quote refresh is a signed transaction, so a maker can't deny a price or claim uptime it didn't have.

Each maker's journal lists its Arkiv transaction hashes and the Whitechain block and balance behind each quote. `pnpm recompute-fade --maker 0x…` reads that journal from Swarm, spot-checks it against Arkiv and Whitechain, and reproduces the board's numbers with the [same formula](../packages/sdk/src/fade.ts) the indexer uses.

## Wallet-owned

| Entity | Who can change it | What that gives users |
|---|---|---|
| Quote, bid, profile | The maker's wallet | Nobody can fake or edit a maker's price |
| Request | The payer agent's wallet | The payer alone records the auction winner, so a winner that doesn't deliver is on the public record |
| Fill, stats | The indexer's wallet | No maker can rate itself |

Makers use all four owner operations: patch and extend on each refresh, delete on shutdown, and [transfer](../docs/evidence.md) a profile to a new wallet on key rotation, keeping its journal reference.
