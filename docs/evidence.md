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

**Agent-to-agent auction on Arkiv:** an agent posted a job for two payments and three AI makers bid within the 15s window: Aggressive 0.065, Balancer 0.072873, Cautious 0.087123 USDT. The agent took the cheapest and both payments settled: [1](https://explorer.testnet.whitechain.io/tx/0xed2421b81b45bcf9e32bf74b2211784ac13a4f7fe9fc702a19fad7b1be80fb2e), [2](https://explorer.testnet.whitechain.io/tx/0x0bceb7b0f64a3a1ea1a5fe3d81d819421a6c377594c71d887f12fac45088a068).

**Merchant-pays from the wallet:** [transaction](https://explorer.testnet.whitechain.io/tx/0x7cbd94b25ecc98eefd23fddf93f501b08fa0e34e310a2ecee2e37ded2b55f4a2). The payer paid exactly 0.2 USDT and the merchant covered the 0.067314 USDT fee.

**Full retest, Nov 6, in a new browser profile at phone width.** Exact onchain balances before and after each payment:

| Payment | Wallet | Merchant | Maker |
|---|---|---|---|
| [Pay Rahul 0.5 USDT](https://explorer.testnet.whitechain.io/tx/0xa9c1c48ae4cf7a5363dc62abd94542fa1800bb0dbd3c718edff89700470e7d80) | −0.577207 | +0.5 | +0.077207 |
| [Same, merchant covers the fee](https://explorer.testnet.whitechain.io/tx/0x1ded0d7be42bd70ed2c1893a5de0e8f795065d23ff9596741f1643dec70187f9) | −0.5 | +0.433624 | +0.066376 |

The wallet's WBT, ETH and transaction count stayed at 0 throughout.

**Attacks on the live system (`scripts/attack-tests.ts`):** all 11 checks passed. Fake quotes written to Arkiv never reached the board, and makers refused malformed, expired, tampered and other makers' jobs. A payer with no funds was refused by simulation at no gas cost, and repeat offenders were blocked.

**Soak test, 30 minutes:** all three makers live for about 97.7% of the time. At least one was live for about 98.8%. The worst gap was 22s, during an Arkiv RPC outage.

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

**Batched payout:** an agent paid 8 people in [one frame transaction](https://explorer.altmempool.wtf/tx/0x75002521cff97269a8925500cc83ef20c4739d0b42cbd7c9ad330124f472e0e2) for one 0.05 USDC fee. Each recipient's balance was checked onchain afterwards.

**Fee collected during validation (`pre_verify` spike):** [transaction](https://explorer.altmempool.wtf/tx/0x937869a23be5171336a817cb2fd40b7c45bc65045e9aab919684c2c8029d5ff2), admitted and mined. After a one-time approval, a staked paymaster pulled 0.05 USDC with `transferFrom` in a `pre_verify` frame, then approved payment after checking that frame's status. The sender held 0 ETH. EIP-3009 can't do this, because USDC's check uses `TIMESTAMP`. Octane still ships Layout 1; this is the upgrade path. Report: [`docs/evidence/preverify-spike.json`](evidence/preverify-spike.json).

**Deployed:** implementation `0xa8face600456e543f968e5a828f94b8ee9178d99`, factory `0xa8de82d087393dd10ff4e9af22ded8926d48dbe2`, Maker Cautious's clone `0xD31E030E11B4687e1B3EA2C4f7326f4C589C7b58` (staked 0.012 ETH). The devnet can reset; `scripts/setup-devnet.ts` rebuilds all of this.

**Person paying from the wallet in Hinglish:** typed "Rahul ko 0.25 USDC bhejo", confirmed, and a [Layout 1 frame transaction](https://explorer.altmempool.wtf/tx/0x70c66d4c0048d93ed4dbfce1e60bce89e721ef4f5251f10b77686e31b70ce73b) mined with status success, 131,159 gas. The embedded wallet held no ETH.

**Devnet outage, Nov 6:** the EF devnet stopped producing blocks at block 408262, around 04:28 IST, and Maker Cautious went on advertising Path A quotes on a chain that couldn't settle them. Makers now check the latest block's age and pause Path A quotes when it's over 120s old.

## Arkiv (Rabdi)

**Reputation recomputed from public data alone (`pnpm recompute-fade`):** fade, uptime, coverage and fills all matched the board for Maker Aggressive, and the journal passed spot checks against 5 Arkiv writes and 5 Whitechain balances.

**Maker key rotation:** a throwaway profile moved to a new wallet with [`changeOwnership`](https://rabdi.explorer.arkiv.network/tx/0xf2102f7d9ea53220928b755c20c76527f7e6e45e87e3d18bf1d753cc7e127255). The new wallet kept the journal reference, and the old wallet could no longer touch it. `scripts/rotate-profile-demo.ts`.

**Probe on real Rabdi, `scripts/arkiv-probe.ts`:**
| Measure | Result |
|---|---|
| Create a quote | 195,864 gas, [transaction](https://rabdi.explorer.arkiv.network/tx/0x4c9bcd68b052f65afd9d23442c35ceadc4f4da4d73e145a34972703efde8987a) |
| Refresh (patch + extension in one batch) | 93,804 gas, 0.000093804 tGLM, [transaction](https://rabdi.explorer.arkiv.network/tx/0x502840a864d05ace61de05808176f9aa3c3bf01e25fed597ec54c967f1669226) |
| Visible to a query after the create confirmed | 237ms |
| Left the board after the last refresh | 29s |

Only used gas was charged, even with a 1M gas limit. At one refresh every 10s, 2 tGLM lasts about 59 hours.
