# Whitechain feedback

Running notes on what worked, where we got stuck, and what the docs were missing.

## Docs
- The docs token list names `0xaa79...` as USDT. That is bridged `USDT.e`, not the prize token `0xcedf...`. Two tokens called USDT on one testnet is an easy mistake to make.
- The faucet docs say 0.5 WBT per 24h. Our claim paid 2 WBT.
- The test USDT has no faucet and no public mint. We got it by swapping WBT on the Uniswap V3 pool `0x5645...`, which we found by reading transfer history on the explorer. One line in the docs would save that search.
- `eip712Domain()` reverts on the test USDT, and `version()` too, so the domain has to be derived from the verified source and checked against `DOMAIN_SEPARATOR()`.

## What worked
- Blockscout verification with Foundry worked first time once we had the `/api/` suffix. Skipping that suffix fails with a confusing error, so the note in the docs is worth keeping.
- viem's `whitechainSepolia` chain worked out of the box, including the L1 fee estimate.
- One-second blocks make payments feel instant in a wallet.
- `eth_call`, `eth_simulateV1` and state overrides all work on the public RPC, which is what a relayer needs to simulate a job first.

## Where we got stuck
- From a busy venue network, the public RPC timed out often enough to take a maker off the board. We now fail over to Ankr's RPC. The docs say no third-party Sepolia endpoint exists, but `rpc.ankr.com/whitechain_testnet` answers.
- `debug_traceCall` isn't available, so a failed simulation gives little detail.
- `eth_getLogs` is capped at 10,000 blocks, about 2.8 hours at 1s blocks, so an indexer must page.

## What the docs were missing
- Where a hacker gets the official test USDT.
- That `viem`'s `whitechainTestnet` is chain 2625, not Sepolia 1874. The names are easy to mix up.
- A worked gasless example. The USDT supports EIP-3009, but finding the domain meant reading the verified source.
