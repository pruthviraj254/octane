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
  redactAccessKey,
  signQuote,
  whitechainSepolia,
  type Quote,
} from "@octane/sdk";
import { claudeCli, type LlmClient } from "@octane/sdk/llm";
import { createPublicClient, formatEther, formatGwei, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { estimateL1Fee } from "viem/op-stack";
import { QuoteBook, type StandingQuote } from "./book.ts";
import { whitechainClients } from "./chain.ts";
import {
  MAKERS,
  MAX_GAS,
  MIN_CLONE_BALANCE,
  MIN_INVENTORY_WBT,
  PATH_A_FEE,
  PATH_A_MAX_GAS,
  QUOTE_VALIDITY_SECONDS,
  REFRESH_MS,
  hexSetting,
  setting,
  type MakerConfig,
} from "./config.ts";
import { Journal } from "./journal.ts";
import { priceFee, wbtPriceFromSqrt, type Market } from "./pricing.ts";
import { askRegime, type Regime } from "./regime.ts";
import { startRelayer } from "./relayer.ts";

const POOL = "0x5645101Ca8d2F7BaBC27b10359555767a1BdF999";
const REGIME_INTERVAL_MS = 60_000;
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

const id = process.argv[2] as MakerConfig["id"] | undefined;
const config = id ? MAKERS[id] : undefined;
if (!config) throw new Error(`usage: maker <${Object.keys(MAKERS).join("|")}>`);

const account = privateKeyToAccount(hexSetting(`${config.envPrefix}_PRIVATE_KEY`));
const relay = hexSetting("OCTANE_RELAY");
const endpoint = setting(`${config.envPrefix}_ENDPOINT`);
const accessKey = setting("ARKIV_ACCESS_KEY");
const journal = new Journal(config.id);

const { client, wallet } = whitechainClients(
  [setting("WHITECHAIN_RPC_URL"), setting("WHITECHAIN_RPC_FALLBACK_URL")],
  account,
);

const reader = arkivReader(accessKey);
const writer = new ArkivWriter(reader, arkivWallet(accessKey, account), account.address);
const book = new QuoteBook(reader, writer, account.address);

const llm: LlmClient = claudeCli(setting("LLM_MODEL"));

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

const efClient = createPublicClient({ chain: efDevnet, transport: http(undefined, { timeout: 6_000 }) });

/** A Path A quote, if this maker offers one and its clone can back it. */
async function pathAQuote(seq: bigint): Promise<StandingQuote | undefined> {
  if (!config!.quotesPathA) return undefined;
  const clone = hexSetting("OCTANE_CLONE_CAUTIOUS");
  try {
    if ((await efClient.getBalance({ address: clone })) < MIN_CLONE_BALANCE) return undefined;
  } catch {
    // The devnet being unreachable says nothing about Whitechain, so that quote still goes out.
    return undefined;
  }
  const quote: Quote = {
    maker: account.address,
    chainId: BigInt(efDevnet.id),
    settlement: clone,
    token: EF_USDC,
    maxGas: PATH_A_MAX_GAS,
    fee: PATH_A_FEE,
    validUntil: seq + QUOTE_VALIDITY_SECONDS,
    nonce: seq,
  };
  return { quote, sig: await signQuote(account, quote), style: config!.id, seq };
}

async function tick(): Promise<void> {
  const market = await currentMarket();
  recentBaseFees.push(market.gasPrice);
  if (recentBaseFees.length > 12) recentBaseFees.shift();

  const lowInventory = market.wbtBalance < MIN_INVENTORY_WBT;
  if (lowInventory || regime.name === "shock") {
    if (onBoard) {
      await book.withdraw();
      onBoard = false;
      journal.write("withdrew", { reason: lowInventory ? "low inventory" : "shock regime", wbt: market.wbtBalance });
    }
    return;
  }

  const fee = priceFee(config!, market, regime.bufferBps);
  const seq = BigInt(Math.floor(Date.now() / 1000));
  const quote: Quote = {
    maker: account.address,
    chainId: BigInt(whitechainSepolia.id),
    settlement: relay,
    token: WHITECHAIN_USDT,
    maxGas: MAX_GAS,
    fee,
    validUntil: seq + QUOTE_VALIDITY_SECONDS,
    nonce: seq,
  };
  const entries: StandingQuote[] = [{ quote, sig: await signQuote(account, quote), style: config!.id, seq }];
  const pathA = await pathAQuote(seq);
  if (pathA) entries.push(pathA);
  const result = await book.refresh(entries);
  if (stopping) return;
  if (result.status === "sent") onBoard = true;
  journal.write(result.status === "sent" ? "quoted" : "skipped", {
    seq,
    fee,
    pathA: Boolean(pathA),
    regime: regime.name,
    bufferBps: regime.bufferBps,
    tx: result.status === "sent" ? result.txHash : undefined,
  });
}

async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
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
await publishProfile();

const server = startRelayer({
  port: Number(new URL(endpoint).port),
  relay,
  maker: account,
  client,
  wallet,
  journal,
});
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

journal.write("started", { address: account.address, endpoint, spread: config.spread });

// The regime call takes seconds, so it runs beside the quote loop rather than inside it.
void (async () => {
  while (!stopping) {
    try {
      await updateRegime(await currentMarket());
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
