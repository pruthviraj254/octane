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

**Redesigned wallet, Nov 6, driven in headless Chrome at 390px:**
| Check | Result |
|---|---|
| [Payer pays the fee](https://explorer.testnet.whitechain.io/tx/0xc2bb507b781b71910efc35375737f6283eb4463793bae5ee75a45bca7c098d00), 0.02 USDT | Fee 0.066376 USDT to Maker Aggressive |
| [Merchant covers the fee](https://explorer.testnet.whitechain.io/tx/0xd94a6b707a2bba67e82f63cc40cea3be008141d16826e7c319a6332295bd9021), 0.20 USDT | Payer pays 0.20, merchant nets 0.133624 |
| Payer change across both | −0.286376 USDT, WBT 0, nonce 0 |
| Merchant change across both | +0.153624 USDT |
| Maker Aggressive change across both | +0.132752 USDT |

**A new maker joining with no code change, Nov 6.** Maker Nova (`0x55a77764a3ede214F222463F355C01f0aC167ca2`) started from `pnpm new-maker` with a fresh wallet and no USDT:
| Check | Result |
|---|---|
| [First payment](https://explorer.testnet.whitechain.io/tx/0xc35bd87e11adb460524fc625461c7fc7987befc3540daefdac4b0d33c3df2d44) | Sent from Nova's wallet, 0.1 USDT to the merchant, 0.065 USDT to Nova |
| Reputation | The indexer found Nova from its Arkiv profile: fade 136, uptime 9864, 1 fill. `recompute-fade` matched all four |

**Choosing a maker in the wallet, Nov 6:**
| Case | Result |
|---|---|
| [Chose Balancer over the recommended maker](https://explorer.testnet.whitechain.io/tx/0x91e06f3430b9edce649b313136cd4a646837be3d553b4a1b8b47176ebb284633) | Settled by Balancer. Its fee moved from 0.076025 to 0.07782 between review and payment, inside the signed maximum |
| Killed the chosen maker before Confirm | Payment stopped with an error. No balance changed, and no other maker was used |
| [Default, no override](https://explorer.testnet.whitechain.io/tx/0x9132fdbd8269bbb46c02446bfac0f268a7a2d9dcb5a1721e26bda8052c978723) | Settled by the recommended maker |
| [Chose Aggressive with the merchant covering the fee](https://explorer.testnet.whitechain.io/tx/0x2373129ee7e53f79ddfd47c58531589b6c7ee6588d7d54f7e3369b726e65bc35) | Payer paid 0.20, merchant netted 0.13218, Aggressive earned 0.06782 |

**Paying a pasted address in the wallet, Nov 6:**
| Case | Result |
|---|---|
| [Typed `Pay 0x461b… 0.01 USDT`](https://explorer.testnet.whitechain.io/tx/0x038fef6af0978fbf8dd2a67fd8821bbf744b4de5a75e26a7715aac82b9374e57) | Paid, with the full address on the review card |
| [Pasted only the address, then entered 0.02](https://explorer.testnet.whitechain.io/tx/0x9b63ab017510b908171da6f535ee3f793dfbf848e2da6c879317a362c25fe7ec) | Paid after an amount prompt |
| Recipient and payer change across both | +0.03 USDT and −0.16 USDT |
| One character short, one long, bad checksum, two addresses | All refused before any review |

**An agent choosing its maker, Nov 6:** [`send_sponsored` with Balancer's address](https://explorer.testnet.whitechain.io/tx/0xe60d99b70324848eb242bf05079cf2c3f1c6276d6b08b5cca1e258623b813b7d) settled through Balancer for 0.076025 USDT, though cheaper makers were live.

**Connecting a browser wallet, Nov 6.** Tested with a stand-in EIP-1193 wallet, because a headless browser can't run MetaMask. It starts on the wrong network and refuses to sign for any other chain, as MetaMask does.
| Check | Result |
|---|---|
| Connect | Added Whitechain, then switched to it |
| [Payment signed by the wallet](https://explorer.testnet.whitechain.io/tx/0x9c0b5895c02c9f61b5569e6705761574ab82c94d661a0715970073ebd1da09ea) | One `eth_signTypedData_v4`, payer −0.087845, merchant +0.01, maker +0.077845 USDT, no transaction from the payer |
| Reload | Reconnected with no popup |
| USDC while connected | Refused with the reason, because browser wallets can't sign frame transactions |

**A person running a maker from the desk, Nov 6.** Maker Orbit, driven through the page with no commands:
| Step | Result |
|---|---|
| Create, borrow funds, go live at 0.07 | On the board at 0.07, in manual mode |
| Change the rate to 0.08 | Live within one refresh |
| Add 30 minutes | The limit moved by exactly 1,800 seconds |
| [Carry a payment](https://explorer.testnet.whitechain.io/tx/0xc71bbded4de05cdce483c9b08e295c27155f1af63d939ae799e7c648ab9c5343) | Earned exactly 0.08 USDT |
| Reach the time limit | Left the board by itself, then returned when extended |
| Set up a paymaster, [carry a USDC payment](https://explorer.altmempool.wtf/tx/0x004930840d7141cd0674fe501ad5791d5df66e2ac6ad3caf01fa6d21dbe57859) | Orbit's own staked clone paid the gas, and Orbit earned 0.08 USDC |

**Who sets the price, measured on the live market, Nov 6.** Maker Orbit through the desk, sampled from its own journal:
| State | Result |
|---|---|
| No agent | 7 quotes in 62s, all exactly 0.075, with 0 AI calls, while the formula moved between 0.082786 and 0.082788 |
| Agent pricing | Quoted 0.082786, matching 0.060655 × 1.20 + 0.01 |
| Price forced over the agent | 7 quotes in 65s, all exactly 0.09, while the agent made an AI call and would have charged 0.071869 |
| Back to the agent | Returned to 0.071869 |
| Agent removed | Fixed at 0.085 |
| Machine with no AI | The desk refused an agent, and allowed a fixed rate |

## EF alt-mempool devnet

**First sponsored frame transaction, full checks on:** [transaction](https://explorer.altmempool.wtf/tx/0x97b454ac5b18523175cb171e00010a6dd90a95d825201ebb6abbe5103b07be30), mined with status success, 327,011 gas. The sender held 0 ETH and the maker's staked clone paid. In the same transaction the merchant received 0.01 USDC and the maker 0.05 USDC.

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

**Batched payout:** an agent paid 8 people in [one frame transaction](https://explorer.altmempool.wtf/tx/0x75cd006896b51874572cf7051f16ef7a707566c18ce7d58a71fa9bd3444eef68) for one 0.05 USDC fee. Each recipient's balance was checked onchain afterwards.

**Fee collected during validation (`pre_verify` spike):** [transaction](https://explorer.altmempool.wtf/tx/0x7bf47728ecfbe341db89203da3e081d1b05acc652f263de1e93710a2c6b0402b), admitted and mined. After a one-time approval, a staked paymaster pulled 0.05 USDC with `transferFrom` in a `pre_verify` frame, then approved payment after checking that frame's status. The sender held 0 ETH. EIP-3009 can't do this, because USDC's check uses `TIMESTAMP`. Octane still ships Layout 1; this is the upgrade path. Report: [`docs/evidence/preverify-spike.json`](evidence/preverify-spike.json).

**Deployed:** implementation `0x87efd04057930814ff3f5c0f7af3e4291bc6fef6`, factory `0xa8face600456e543f968e5a828f94b8ee9178d99`, Maker Cautious's clone `0xfff46438127E7DB708515fdDf46F9Aed002d6c80` (staked 0.012 ETH). The devnet can reset; `scripts/setup-devnet.ts` rebuilds all of this.

**The devnet reset on Nov 6.** It stopped at block 408262 and came back from block 0, which erased every earlier transaction. `scripts/setup-devnet.ts` rebuilt Octane in one run, and the links above are all from the new chain. Tampered transactions were also resubmitted for real, and the alternative mempool refused each one at frame 2.

**Person paying from the wallet in Hinglish:** typed "Rahul ko 0.25 USDC bhejo", confirmed, and a [Layout 1 frame transaction](https://explorer.altmempool.wtf/tx/0x4edf6ca5712f4adaa62f02c7f15774b88f31113e00417685a02d3ed6a57a52a4) mined with status success, 131,159 gas. The embedded wallet held no ETH.

**Devnet outage, Nov 6:** the EF devnet stopped producing blocks at block 408262, around 04:28 IST, and Maker Cautious went on advertising Path A quotes on a chain that couldn't settle them. Makers now check the latest block's age and pause Path A quotes when it's over 120s old.

**Rechecked with the devnet stopped at block 408262, Nov 6.** `scripts/patha-spike.ts` simulated against the deployed contracts through `ethrex_simulateFrameTransaction`, sending nothing:
| Case | Result |
|---|---|
| Valid transaction | 5 of 5 frames passed, with Cautious's clone as payer |
| Same transaction, canonical verdict | `canonicalMempoolValid: false`, `StorageReadNonSender` |
| Fee frame pays 1 unit (`underpay`) | Refused at frame 2, the paymaster's `pay` |
| Fee frame pays the merchant (`redirect`) | Refused at frame 2 |
| Quote signed by a non-maker (`forged`) | Refused at frame 2 |

The simulation in `docs/evidence/patha-simulation.json` comes from this stopped period, so its hash differs from the mined transaction above. Mining needs a moving chain, so these show validation only.

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
