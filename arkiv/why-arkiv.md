# Why Arkiv

Octane is an open market for gas. Its whole claim is that nobody operates it, and a database we ran would break that claim.

## What users would lose with Postgres

| With Postgres | With Arkiv |
|---|---|
| We hold the board, so we could hide a maker, reorder prices or go offline | Quotes live on a public chain. Our own UI has no special access |
| A new maker asks us for an API key | Any wallet writes a quote and it's on the board, with no signup |
| We'd run a job to clear stale prices, and users would have to trust it ran | Expiry is enforced by the chain. In our test a crashed maker's quote left the board in [29 seconds](../docs/evidence.md) |
| An admin could edit a maker's price | Only the maker's wallet can change its quote |
| A maker's reputation is our word | Fills and stats come from public data, and `pnpm recompute-fade` reproduces them |
| Agents need our API | An agent reads the market with the SDK, with no Octane server in between |

The wallet, the board, the history pages and every MCP tool read Arkiv directly. The indexer only writes.

## What a signature alone doesn't give us

Quotes are already EIP-712 signed, so why not gossip them? A signature proves a maker agreed to a price. It doesn't prove the price was published to everyone, when, or for how long the maker kept quoting. That public record is what makes uptime measurable.

## What we kept off Arkiv

| Data | Where it lives | Why |
|---|---|---|
| Private keys and payment intent | The payer's device | They should never be public |
| Settlement | Whitechain and the EF devnet | Money moves there, atomically |
| AI trading journals | Swarm | They're long files people read, not records anyone filters. Arkiv holds only the latest reference |
| Signed payment authorisations | Sent straight to the chosen maker | They're single-use and need no market |
| LLM prompts | The maker's own machine | They add nothing to the public record |

Attributes on Arkiv are public, so nothing sensitive goes there.
