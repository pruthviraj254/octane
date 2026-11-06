# Demo video checklist

Whitechain requires 2 to 4 minutes showing every party, with zero crypto steps visible.

**Before recording**
- Start a clean reputation record. Stop the makers, then run `mkdir -p apps/makers/data/dev-archive && mv apps/makers/data/*.jsonl apps/makers/data/*.publish.json apps/makers/data/dev-archive/`. Otherwise time the laptop was asleep counts as downtime.
- Check the EF devnet is moving: run `cast block-number --rpc-url https://altmempool.forshtat.com` twice, 10 seconds apart. If it's stopped, show the recorded Path A links instead.
- Use a phone hotspot. The venue Wi-Fi drops DNS and HTTPS for minutes at a time.
- Run `pnpm makers`, `pnpm indexer` and `pnpm web` a few minutes early, so all three makers are on the board.
- Open tabs: `/board`, `/makers`, `/makers/desk`, `/merchant`, the wallet at `/`, the Whitechain and EF explorers.
- Connect your browser wallet in the pitch browser, and fund it with `scripts/fund-wallet.ts <address> 5 0`. USDC needs the built-in wallet, so fund that too with `scripts/fund-wallet.ts <built-in address> 0 2`.
- Check the agent has at least 16 USDT (`scripts/topup-payer.ts`).
- Take any test makers offline on the desk, or show them on purpose. A new maker has no score, so it's recommended over makers with a poor one.

**Shots, in order**
1. **The board** (`/board`): three makers refreshing. Say that this is read straight from Arkiv.
2. **A maker's journal** (`/makers`): a regime note, then open the Swarm journal link. Note this timestamp for `arkiv/swarm.md`.
3. **AI agent paying** (Claude Code with the Octane MCP): "Pay our 3 open-source contributors 5 USDT each." Show the explorer links and zero WBT.
4. **Relayer view** (`/makers`): "Relayed … earned …" lines. On the explorer, From is the maker.
5. **Merchant view** (`/merchant`): the payments arriving.
6. **Person in the wallet**: press Connect wallet first. "Pay Rahul 1 USDT", sign in the wallet, receipt. Point out that the wallet only signed.
7. **Merchant-pays**: the same payment with "Rahul offers to cover the fee" ticked.
8. **Path A**: "Rahul ko 1 USDC bhejo", then the rejection in `docs/evidence/patha-canonical-rejection.txt` beside the admitted transaction. If the devnet has stopped, run `pnpm --filter @octane/scripts exec tsx patha-spike.ts simulate` instead, plus the same command with `underpay dry`, and show the recorded links.
9. **Auction**: ask the agent to run a gas auction. Show the three bids.
10. **Failure**: kill a maker (`pkill -9 -f "src/index.ts balancer"`) and watch its quote leave the board within 30s.
11. **Reputation**: `pnpm recompute-fade --maker 0x…` matching the board.
12. **A person becoming a maker** (`/makers/desk`): Become a maker, borrow funds, set your own rate, Go live. Change the rate, extend the time, and show the yellow note explaining how agents price.
13. **Forcing a price over an agent**: Turn on AI agent and show its working. Press Override AI price, then show the agent still calculating beside your price. Press Back to AI price.
14. **No gas token in the wallet**: the Your funds panel shows WBT 0 and ETH 0. Open **Check on the explorer** for outside proof.
15. **The data** (`/arkiv`): live counts for every entity, with the query behind each.

**Wording:** say "no gas token needed; one fee in stablecoins". Never "gas-free" or "no gas".
