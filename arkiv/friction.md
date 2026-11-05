# Arkiv friction log

Running notes, kept from the first hour. Each entry: what we expected, what happened, how to reproduce.

## Standing quotes
- Expected an `update` that also resets expiry, because the event brief talks about updating entities. The SDK has `patchEntity`, which never moves expiry. A rolling board needs `executeBatch` with a patch and an extension together.
