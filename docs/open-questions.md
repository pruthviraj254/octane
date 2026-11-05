# Open questions

Log anything that can't be verified. Move items to Answered with the source.

## Open
- EF: can a `pre_verify` `transferFrom` pull be admitted after a one-time approval? (late spike)
- EF: limits for about 50 SENDER frames.
- EF: Anon-RPC support for Whitechain and Arkiv (only needed if we take fallback FB1).
- Arkiv: does a 10s `request` (5 blocks) work reliably, or does it need 20s?
- Arkiv: does the indexed-column count change write gas?
- Swarm: postage batch and Bee URL (booth).
- Whitechain: more WBT for makers, if the 0.4 each runs low.
- ENS (add-on only): bonus terms, ENSv2 addresses on Sepolia.

## Answered
- EF, helpers inside a clone: `TXPARAM`, `FRAMEPARAM`, `FRAMEDATALOAD`, `SIGPARAM` and `APPROVE` all work through an EIP-1167 clone on the live devnet. See `docs/evidence.md`.
- EF, `pay` gas: 54,769 with every check on, so the sidecar's 100k budget is enough.
- EF, deploy gas: the paymaster implementation used 8.6M gas; 6M runs out.
- Whitechain, test USDT: swap WBT on Uniswap V3 pool `0x5645101Ca8d2F7BaBC27b10359555767a1BdF999` through SwapRouter02 `0xe208cC685cD95D56E8ec6DEC9816476567fc6962`. No faucet or public mint.
- Whitechain, verification: `forge verify-contract --verifier blockscout --verifier-url https://explorer.testnet.whitechain.io/api/`. The `/api/` suffix is required.
- Whitechain, USDT domain: `{name:"Tether USD", version:"1", chainId:1874, verifyingContract:USDT}`. `eip712Domain()` and `version()` revert; assert against `DOMAIN_SEPARATOR()`.
- Whitechain, EIP-3009: `receiveWithAuthorization` has `v,r,s` and `bytes` overloads; requires `to == msg.sender`; `validAfter < now < validBefore`.
- EF, `EXPIRY_VERIFIER`: the spec address has no code on the devnet; use `0x0000000000000000000000000000000000008141`. Data is 8 bytes big-endian.
- EF, validation budget: the sidecar uses a flat 100,000 gas across the prefix, not 1M per staked entity.
- EF, quote signature: `ecrecover` is expected to be rejected in `pay`; use a signature entry and `SIGPARAM`.
- EF, Layout 1b with EIP-3009: blocked, because USDC's authorisation check uses `TIMESTAMP`.
- Arkiv, `update` and expiry: there is no `update`; `patchEntity` never moves expiry. Use `executeBatch` with `patches` and `extensions`.
- Arkiv, past versions: no API. Patch values remain in transaction calldata, about 11h of full blocks are readable.
- Arkiv, ordering and pagination: `orderBy(asc(...))`, `limit`, `offset`; stable paging on `$key`. 100 rows per page.
- Arkiv, `transfer`: `changeOwnership`.
- Arkiv, sponsored writes: not available; each writer funds its own wallet.
