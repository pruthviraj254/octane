# Evidence

Real results only: transaction links, admission reports, measured gas and latency. Nothing here is estimated.

## Whitechain Sepolia

**Fork test against the real USDT** (`pnpm test:fork`, nothing broadcast): the relay settled a payer-pays and a merchant-pays payment using the live `0xcedf...55a7` contract. The payer's WBT balance and nonce stayed at 0, and repeating the authorisation reverted. A first payment measured 181,552 gas inside the test.

**OctaneRelay:** [`0xc5DC3334636e5d053f0AC383722af4C05Db2a4Bf`](https://explorer.testnet.whitechain.io/address/0xc5DC3334636e5d053f0AC383722af4C05Db2a4Bf), verified on Blockscout. [Deploy transaction](https://explorer.testnet.whitechain.io/tx/0xc3be2903848269bff98eb381637bf9fa1168997f92f5569048885f6f8343b113).

**First real USDT payment:** [transaction](https://explorer.testnet.whitechain.io/tx/0xc34c96fac8183934d750a8b32a5dc138c76560ce0e6e8507f29c4c7bdb1d2424), 155,926 gas. Payer 19.094026 → 19.074026 USDT; merchant +0.01; maker +0.01. Payer WBT 0, payer transactions sent 0.

## EF alt-mempool devnet

## Arkiv (Rabdi)
