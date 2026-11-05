# Whitechain feedback

Running notes on what worked, where we got stuck, and what the docs were missing.

## Docs
- The docs token list names `0xaa79...` as USDT. That is bridged `USDT.e`, not the prize token `0xcedf...`. Two tokens called USDT on one testnet is an easy mistake to make.
- The faucet docs say 0.5 WBT per 24h. Our claim paid 2 WBT.
- The test USDT has no faucet and no public mint. We got it by swapping WBT on the Uniswap V3 pool `0x5645...`, which we found by reading transfer history on the explorer. One line in the docs would save that search.
- `eip712Domain()` reverts on the test USDT, and `version()` too, so the domain has to be derived from the verified source and checked against `DOMAIN_SEPARATOR()`.
