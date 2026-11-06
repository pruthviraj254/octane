import { ExpirationTime } from "@arkiv-network/sdk";
import { addr, str } from "@arkiv-network/sdk/schema";
import {
  ArkivWriter,
  EF_USDC,
  MakerEntity,
  WHITECHAIN_USDT,
  arkivReader,
  arkivWallet,
  assertUsdtDomain,
  efDevnet,
  fetchMakerProfile,
  fetchOpenRequests,
  hashQuote,
  placeBid,
  redactAccessKey,
  signQuote,
  whitechainSepolia,
  type Quote,
} from "@octane/sdk";
import { createLlm, type LlmClient } from "@octane/sdk/llm";
import { createPublicClient, formatEther, formatGwei, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { estimateL1Fee } from "viem/op-stack";
import { QuoteBook, type StandingQuote } from "./book.ts";
import { whitechainClients } from "./chain.ts";
import {
  MAKERS,
  MAX_GAS,
  MIN_CLONE_BALANCE,
  MIN_FEE,
  MIN_INVENTORY_WBT,
  PATH_A_FEE,
  PATH_A_MAX_GAS,
  QUOTE_VALIDITY_SECONDS,
  REFRESH_MS,
  findMaker,
  hexSetting,
  optionalSetting,
  setting,
} from "./config.ts";
import { ControlFile, claimProcess, feeFor, pastLimit, releaseProcess, signedUntil, type Control } from "./control.ts";
import { Journal } from "./journal.ts";
import { JournalPublisher } from "./publish.ts";
import { priceFee, wbtPriceFromSqrt, type Market } from "./pricing.ts";
import { askRegime, type Regime } from "./regime.ts";
import { startRelayer } from "./relayer.ts";

const POOL = "0x5645101Ca8d2F7BaBC27b10359555767a1BdF999";
const REGIME_INTERVAL_MS = 60_000;
const JOURNAL_INTERVAL_MS = 300_000;
/** A typical relay transaction's size, for the L1 data fee. */
const RELAY_CALLDATA = `0x${"ab".repeat(900)}` as const;

const SLOT0 = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

const id = process.argv[2];
const config = id ? findMaker(id) : undefined;
if (!config) throw new Error(`usage: maker <${Object.keys(MAKERS).join("|")}|a name set up with new-maker>`);

const account = privateKeyToAccount(hexSetting(`${config.envPrefix}_PRIVATE_KEY`));
const relay = hexSetting("OCTANE_RELAY");
const endpoint = setting(`${config.envPrefix}_ENDPOINT`);
const accessKey = setting("ARKIV_ACCESS_KEY");
const journal = new Journal(config.id);
const control = new ControlFile(config.id);
const cloneSetting = `OCTANE_CLONE_${config.id.toUpperCase()}`;

const { client, wallet } = whitechainClients(
  [setting("WHITECHAIN_RPC_URL"), setting("WHITECHAIN_RPC_FALLBACK_URL")],
  account,
);

const reader = arkivReader(accessKey);
const writer = new ArkivWriter(reader, arkivWallet(accessKey, account), account.address);
const book = new QuoteBook(reader, writer, account.address);

const llm: LlmClient | undefined = createLlm({
  provider: optionalSetting("LLM_PROVIDER") || undefined,
  apiKey: optionalSetting("ANTHROPIC_API_KEY") || undefined,
  apiModel: optionalSetting("ANTHROPIC_MODEL") || undefined,
  cliModel: optionalSetting("LLM_MODEL") || undefined,
});

async function readMarket(): Promise<Market> {
  const [block, tip, wbtBalance, slot0, l1Fee] = await Promise.all([
    client.getBlock(),
    client.estimateMaxPriorityFeePerGas(),
    client.getBalance({ address: account.address }),
    client.readContract({ address: POOL, abi: SLOT0, functionName: "slot0" }),
    estimateL1Fee(client, { account: account.address, to: relay, data: RELAY_CALLDATA }),
  ]);
  return {
    gasPrice: (block.baseFeePerGas ?? 0n) + tip,
    l1Fee,
    wbtPrice: wbtPriceFromSqrt(slot0[0]),
    wbtBalance,
    block: block.number,
  };
}

/**
 * A failed Whitechain read shouldn't take a maker off a healthy Arkiv board, so it keeps quoting
 * on the last good reading for a short while. Gas costs move slowly, and the signed quote only
 * lives about 105s. Past this limit the maker stops refreshing and its quote expires.
 */
const MAX_MARKET_AGE_MS = 60_000;
let lastMarket: { market: Market; at: number } | undefined;

async function currentMarket(): Promise<Market> {
  try {
    const market = await readMarket();
    lastMarket = { market, at: Date.now() };
    return market;
  } catch (error) {
    if (lastMarket && Date.now() - lastMarket.at < MAX_MARKET_AGE_MS) {
      journal.write("market-stale", { ageMs: Date.now() - lastMarket.at });
      return lastMarket.market;
    }
    throw error;
  }
}

async function publishProfile(): Promise<void> {
  const values = { maker: addr(account.address), style: str(config!.id), endpoint: str(endpoint) };
  const expiration = ExpirationTime.fromDays(7);
  const existing = await fetchMakerProfile(reader, account.address);
  const result = existing
    ? await writer.submit({
        patches: [{ schema: MakerEntity, entityKey: existing.key, set: values }],
        extensions: [{ entityKey: existing.key, expiration }],
      })
    : await writer.submit({ creates: [{ schema: MakerEntity, values, expiration }] });
  journal.write("profile", { endpoint, result: result.status });
}

let regime: Regime = {
  name: "spiky",
  bufferBps: 2_000n,
  journal: "Starting up: holding a 20% buffer until the first market read.",
  source: "fallback",
};
const recentBaseFees: bigint[] = [];

async function updateRegime(market: Market): Promise<void> {
  if (recentBaseFees.length === 0) recentBaseFees.push(market.gasPrice);
  regime = await askRegime(llm, {
    style: config!.id,
    baseFeesGwei: recentBaseFees.map((fee) => formatGwei(fee)),
    wbtPrice: formatUnits(market.wbtPrice, 6),
    wbtBalance: formatEther(market.wbtBalance),
  });
  journal.write("regime", { regime: regime.name, bufferBps: regime.bufferBps, source: regime.source, note: regime.journal });
}

let stopping = false;
let onBoard = false;

const efClient = createPublicClient({ chain: efDevnet, transport: http(undefined, { timeout: 8_000, retryCount: 0 }) });

/**
 * Whether the clone can back a Path A quote. This is checked in the background, never in the
 * quote loop: a stalled devnet must not delay this maker's Whitechain quote past its expiry.
 */
const CLONE_CHECK_MS = 30_000;
const MAX_CLONE_CHECK_AGE_MS = 300_000;
/** The devnet makes a block every 6s. Older than this and it's stopped, so a quote would be a promise it can't keep. */
const MAX_DEVNET_BLOCK_AGE_SECONDS = 120n;
let cloneBacked: { ok: boolean; at: number } | undefined;

function watchClone(): void {
  if (!config!.quotesPathA) return;
  const clone = hexSetting(cloneSetting);
  void (async () => {
    while (!stopping) {
      try {
        const [balance, block] = await Promise.all([efClient.getBalance({ address: clone }), efClient.getBlock()]);
        const blockAge = BigInt(Math.floor(Date.now() / 1000)) - block.timestamp;
        const ok = balance >= MIN_CLONE_BALANCE && blockAge < MAX_DEVNET_BLOCK_AGE_SECONDS;
        if (cloneBacked?.ok !== ok) journal.write(ok ? "path-a-resumed" : "path-a-paused", { blockAge, balance });
        cloneBacked = { ok, at: Date.now() };
      } catch {
        // Keep the last answer until it's too old to trust.
      }
      await new Promise((resolve) => setTimeout(resolve, CLONE_CHECK_MS));
    }
  })();
}

/** A Path A quote, if this maker offers one and its clone can back it. */
async function pathAQuote(seq: bigint, wanted: Control): Promise<StandingQuote | undefined> {
  if (!config!.quotesPathA) return undefined;
  if (!cloneBacked?.ok || Date.now() - cloneBacked.at > MAX_CLONE_CHECK_AGE_MS) return undefined;
  const clone = hexSetting(cloneSetting);
  const quote: Quote = {
    maker: account.address,
    chainId: BigInt(efDevnet.id),
    settlement: clone,
    token: EF_USDC,
    maxGas: PATH_A_MAX_GAS,
    fee: feeFor(wanted, PATH_A_FEE),
    validUntil: signedUntil(wanted, seq + QUOTE_VALIDITY_SECONDS),
    nonce: seq,
  };
  return { quote, sig: await signQuote(account, quote), style: config!.id, seq };
}

async function tick(): Promise<void> {
  const market = await currentMarket();
  recentBaseFees.push(market.gasPrice);
  if (recentBaseFees.length > 12) recentBaseFees.shift();

  const seq = BigInt(Math.floor(Date.now() / 1000));
  const wanted = control.read();
  const lowInventory = market.wbtBalance < MIN_INVENTORY_WBT;
  const shock = wanted.mode === "auto" && regime.name === "shock";
  const timeUp = pastLimit(wanted, seq);
  if (lowInventory || shock || timeUp) {
    if (onBoard) {
      await book.withdraw();
      onBoard = false;
      const reason = lowInventory ? "low inventory" : timeUp ? "time limit reached" : "shock regime";
      journal.write("withdrew", { reason, wbt: market.wbtBalance });
    }
    return;
  }

  const fee = feeFor(wanted, priceFee(config!, market, regime.bufferBps));
  const quote: Quote = {
    maker: account.address,
    chainId: BigInt(whitechainSepolia.id),
    settlement: relay,
    token: WHITECHAIN_USDT,
    maxGas: MAX_GAS,
    fee,
    validUntil: signedUntil(wanted, seq + QUOTE_VALIDITY_SECONDS),
    nonce: seq,
  };
  const entries: StandingQuote[] = [{ quote, sig: await signQuote(account, quote), style: config!.id, seq }];
  const pathA = await pathAQuote(seq, wanted);
  if (pathA) entries.push(pathA);
  const result = await book.refresh(entries);
  if (stopping) return;
  if (result.status === "sent") onBoard = true;
  journal.write(result.status === "sent" ? "quoted" : "skipped", {
    seq,
    fee,
    mode: wanted.mode,
    until: wanted.until,
    pathA: Boolean(pathA),
    regime: regime.name,
    bufferBps: regime.bufferBps,
    tx: result.status === "sent" ? result.txHash : undefined,
    // Public inputs to the coverage score, checkable against Whitechain at this block.
    block: market.block,
    wbt: market.wbtBalance,
    gasPrice: market.gasPrice,
    maxGas: MAX_GAS,
  });
}

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  releaseProcess(config!.id);
  server.close();
  try {
    await book.withdraw();
    journal.write("stopped", { reason: "clean shutdown, quote deleted" });
  } catch (error) {
    journal.write("stop-failed", { detail: redactAccessKey(String(error)).slice(0, 200) });
  }
  process.exit(0);
}

await assertUsdtDomain(client);
await publishProfile().catch((error: unknown) => {
  console.error(`Maker ${id} couldn't write its profile to Arkiv: ${redactAccessKey(String(error)).split("\n")[0]?.slice(0, 200)}`);
  console.error(`A new maker usually just needs funds. Check with: pnpm new-maker ${id}`);
  process.exit(1);
});

const server = startRelayer({
  port: Number(new URL(endpoint).port),
  relay,
  maker: account,
  client,
  wallet,
  journal,
  onRelayed: (quoteHash) => {
    const request = auctionQuotes.get(quoteHash);
    if (!request) return;
    if (!auctionsWon.has(request)) {
      auctionsWon.add(request);
      journal.write("auction-won", { request });
    }
    journal.write("auction-settled", { request, quoteHash });
  },
});
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

journal.write("started", { address: account.address, endpoint, spread: config.spread });
claimProcess(config.id);
watchClone();

// Auctions: bid a little under the board price, because a batch is guaranteed work.
const BID_DISCOUNT_BPS = 9_500n;
const BID_POLL_MS = 3_000;
const bidsPlaced = new Set<string>();
const auctionQuotes = new Map<string, string>();
const auctionsWon = new Set<string>();

async function bidOnAuctions(): Promise<void> {
  const market = lastMarket?.market;
  const wanted = control.read();
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const shock = wanted.mode === "auto" && regime.name === "shock";
  if (!market || shock || pastLimit(wanted, nowSeconds) || market.wbtBalance < MIN_INVENTORY_WBT) return;

  for (const request of await fetchOpenRequests(reader, BigInt(whitechainSepolia.id))) {
    if (bidsPlaced.has(request.key)) continue;
    bidsPlaced.add(request.key);

    const discounted = (priceFee(config!, market, regime.bufferBps) * BID_DISCOUNT_BPS) / 10_000n;
    const fee = feeFor(wanted, discounted < MIN_FEE ? MIN_FEE : discounted);
    if (fee > request.maxFee) {
      journal.write("auction-passed", { request: request.key, fee, maxFee: request.maxFee });
      continue;
    }
    const now = BigInt(Math.floor(Date.now() / 1000));
    const quote: Quote = {
      maker: account.address,
      chainId: request.chainId,
      settlement: relay,
      token: WHITECHAIN_USDT,
      maxGas: MAX_GAS,
      fee,
      validUntil: signedUntil(wanted, now + QUOTE_VALIDITY_SECONDS),
      nonce: now,
    };
    const result = await placeBid(writer, { request, quote, sig: await signQuote(account, quote), style: config!.id });
    auctionQuotes.set(hashQuote(quote), request.key);
    journal.write("bid", { request: request.key, fee, jobs: request.jobs.length, tx: result.status === "sent" ? result.txHash : undefined });
  }
}

const publisher = new JournalPublisher(
  account.address,
  config.id,
  endpoint,
  journal,
  reader,
  writer,
  setting("SWARM_BEE_URL"),
  setting("SWARM_BATCH_ID"),
);

void (async () => {
  while (!stopping) {
    try {
      await bidOnAuctions();
    } catch (error) {
      journal.write("bid-failed", { detail: redactAccessKey(String(error)).slice(0, 200) });
    }
    await new Promise((resolve) => setTimeout(resolve, BID_POLL_MS));
  }
})();

// Journals go to Swarm every few minutes, beside the quote loop.
void (async () => {
  while (!stopping) {
    await new Promise((resolve) => setTimeout(resolve, JOURNAL_INTERVAL_MS));
    try {
      const reference = await publisher.publish();
      if (reference) journal.write("published", { reference });
    } catch (error) {
      journal.write("publish-failed", { detail: redactAccessKey(String(error)).slice(0, 200) });
    }
  }
})();

// The regime call takes seconds, so it runs beside the quote loop rather than inside it.
void (async () => {
  while (!stopping) {
    try {
      // A person setting their own price has no use for the agent's risk call.
      if (control.read().mode === "auto") await updateRegime(await currentMarket());
    } catch (error) {
      journal.write("regime-failed", { detail: redactAccessKey(String(error)).slice(0, 200) });
    }
    await new Promise((resolve) => setTimeout(resolve, REGIME_INTERVAL_MS));
  }
})();

while (!stopping) {
  const started = Date.now();
  try {
    await tick();
  } catch (error) {
    // One bad tick isn't fatal: the entity outlives two missed refreshes.
    journal.write("tick-failed", { detail: redactAccessKey(String(error)).slice(0, 200) });
  }
  await new Promise((resolve) => setTimeout(resolve, Math.max(0, REFRESH_MS - (Date.now() - started))));
}
