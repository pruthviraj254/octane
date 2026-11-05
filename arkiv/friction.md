# Arkiv friction log

Running notes, kept from the first hour. Each entry: what we expected, what happened, how to reproduce.

## Standing quotes
- Expected an `update` that also resets expiry, because the event brief talks about updating entities. The SDK has `patchEntity`, which never moves expiry. A rolling board needs `executeBatch` with a patch and an extension together.

## RPC reliability
- At the start of hacking, about 21:05 IST, requests to the Rabdi RPC failed on and off for several minutes, with and without an access key: timeouts, then `HTTP request failed`. Expected a steady endpoint. A failed read and a failed write look the same to the caller, so each failed write has to be reconciled before anything is resent. Reproduce: send `eth_blockNumber` in a loop during a busy period.
- viem's transport errors print the full RPC URL, and the access key is part of that URL's path. Anything that logs errors leaks the key unless it redacts first. Sending the key in a header by default would avoid this.

## Docs
- The event brief and early docs say "update" and "extend" as separate ideas. It took reading the SDK source to learn that `patchEntity` never moves expiry and that `executeBatch` can do both atomically. A "rolling expiry" recipe would save that search.
- `ExecuteBatch` results don't include expiry deadlines, so a caller that wants them must read the entity back.

## Expiry and errors
- A batch that patches an expired entity reverts as a whole. Expected a clearer signal than a reverted transaction. We now read which entities are live before each refresh and recreate what's gone. Reproduce: delay one refresh past 30s.
- `arkiv_query` rejects unknown option names with a raw parser message (``unknown field `includeData` ``). Guessing option names from older docs leads here. Reproduce: send `includeData` in the options.

## Ownership and sponsorship
- Creates have no owner field, so a backend can't sponsor a write owned by someone else. An AI agent that only holds stablecoins can read the market but needs a little tGLM to post an auction request. It's the one place Octane can't honour "stablecoins only".

## History
- We wanted to recompute uptime from a quote's past versions. There's no API for past versions, old `eth_getLogs` fails, and only about 11 hours of full blocks are readable. Patch values do sit in calldata, so we list transaction hashes in each maker's journal and replay from those. A version-history read would make reputation far easier to verify.
- Expiry emits no event, so a live board has to poll every block.

## What worked well
- Atomic `executeBatch`: one transaction refreshes a maker's quotes on two chains.
- Only used gas is charged, so the recommended 1M gas limit costs nothing extra. A refresh cost 0.000094 tGLM, and 2 tGLM lasts about 59 hours at one refresh every 10s.
- A quote was visible to a query 237ms after its write confirmed.
- The Mumbai MCP server and plugin answered SDK questions faster than reading the docs.
