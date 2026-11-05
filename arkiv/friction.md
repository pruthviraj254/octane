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
