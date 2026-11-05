# Evidence

Real results only: transaction links, admission reports, measured gas and latency. Nothing here is estimated.

## Whitechain Sepolia

**Fork test against the real USDT** (`pnpm test:fork`, nothing broadcast): the relay settled a payer-pays and a merchant-pays payment using the live `0xcedf...55a7` contract. The payer's WBT balance and nonce stayed at 0, and repeating the authorisation reverted. A first payment measured 181,552 gas inside the test.

**OctaneRelay:** [`0xc5DC3334636e5d053f0AC383722af4C05Db2a4Bf`](https://explorer.testnet.whitechain.io/address/0xc5DC3334636e5d053f0AC383722af4C05Db2a4Bf), verified on Blockscout. [Deploy transaction](https://explorer.testnet.whitechain.io/tx/0xc3be2903848269bff98eb381637bf9fa1168997f92f5569048885f6f8343b113).

**First real USDT payment:** [transaction](https://explorer.testnet.whitechain.io/tx/0xc34c96fac8183934d750a8b32a5dc138c76560ce0e6e8507f29c4c7bdb1d2424), 155,926 gas. Payer 19.094026 → 19.074026 USDT; merchant +0.01; maker +0.01. Payer WBT 0, payer transactions sent 0.

**First payment chosen from the live board:** [transaction](https://explorer.testnet.whitechain.io/tx/0x5badcb8b7273eb0c98923932d93d7dd640981a1a840838bfc5153b0d16656439). Three makers were quoting (Aggressive 0.068807, Balancer 0.078807, Cautious 0.099884 USDT). The payer picked the cheapest, signed, and Maker Aggressive settled it from its own wallet.

**Failure tests on the live board:**
- Crash: `kill -9` on Maker Balancer. Its quote left the board about 25s later, with no cleanup job.
- Public RPC outage: Whitechain's RPC timed out repeatedly from the venue, and Maker Cautious dropped off a healthy Arkiv board. Makers now fail over to a second RPC and quote on the last good market reading for up to 60s.

**AI agent paying with zero WBT (`mcp__octane` tools, Claude Haiku):** told to pay 3 contributors 5 USDT each. It read the market, chose nothing by hand, and three payments settled through the cheapest maker: [1](https://explorer.testnet.whitechain.io/tx/0x456a105cd5098572fec44cf817ca0965f7efa14515573b2a46f7e8af8123273c), [2](https://explorer.testnet.whitechain.io/tx/0x69ac0adafb926640950d87aa2be7665d42b0a985e33c78edaf859966518e489e), [3](https://explorer.testnet.whitechain.io/tx/0x6bb413f7960ddfdc5f902cee8efc4463778c26fe00444a03f2b880b4b4cff400). Fees 0.066729, 0.066729 and 0.067334 USDT. Agent run cost $0.0088. The agent's WBT balance and transaction count stayed at 0.

**Person paying from the wallet in a real browser:** typed "Pay Rahul 0.5 USDT", confirmed, and got a [receipt](https://explorer.testnet.whitechain.io/tx/0x2456a582f275750a52e5dde74d8dd4112b06d2d03743304fa27af078e7ea4270). The embedded wallet showed 0 gas tokens and 0 transactions sent.

## EF alt-mempool devnet

**First sponsored frame transaction, full checks on:** [transaction](https://explorer.altmempool.wtf/tx/0x4001574dfa5d5457a0bcd0bdd533af602e8a42c4f9c264d86bffb04a34435605), mined with status success, 327,023 gas. The sender held 0 ETH and the maker's staked clone paid. In the same transaction the merchant received 0.01 USDC and the maker 0.05 USDC.

The same signed transaction went to both mempools:
| Mempool | Result |
|---|---|
| Canonical (`eth_sendRawTransaction`) | Rejected: `Frame transaction validation-prefix simulation failed: StorageReadNonSender` |
| Alternative (`eth_sendFrameTransaction`) | Admitted and mined |

Admission report: [`docs/evidence/patha-admission.json`](evidence/patha-admission.json). Canonical rejection: [`docs/evidence/patha-canonical-rejection.txt`](evidence/patha-canonical-rejection.txt).

**Validation gas:** expiry 3,051 · sender 100 · `pay` 54,769, inside the sidecar's flat 100k budget.

**Tampered transactions, each with a valid sender signature, all rejected by the clone before anything was spent:**
| Tamper | Rejected with |
|---|---|
| Fee frame pays the maker 1 base unit | `0x590a777c` `BadFeeFrame()` |
| Fee frame pays someone else | `0x590a777c` `BadFeeFrame()` |
| Quote signature from another key | `0x35abf5ae` `BadMakerSignature()` |

**Deployed:** implementation `0xa8face600456e543f968e5a828f94b8ee9178d99`, factory `0xa8de82d087393dd10ff4e9af22ded8926d48dbe2`, Maker Cautious's clone `0xD31E030E11B4687e1B3EA2C4f7326f4C589C7b58` (staked 0.012 ETH). The devnet can reset; `scripts/setup-devnet.ts` rebuilds all of this.

## Arkiv (Rabdi)

**Probe on real Rabdi, `scripts/arkiv-probe.ts`:**
| Measure | Result |
|---|---|
| Create a quote | 195,864 gas, [transaction](https://rabdi.explorer.arkiv.network/tx/0x4c9bcd68b052f65afd9d23442c35ceadc4f4da4d73e145a34972703efde8987a) |
| Refresh (patch + extension in one batch) | 93,804 gas, 0.000093804 tGLM, [transaction](https://rabdi.explorer.arkiv.network/tx/0x502840a864d05ace61de05808176f9aa3c3bf01e25fed597ec54c967f1669226) |
| Visible to a query after the create confirmed | 237ms |
| Left the board after the last refresh | 29s |

Only used gas was charged, even with a 1M gas limit. At one refresh every 10s, 2 tGLM lasts about 59 hours.
