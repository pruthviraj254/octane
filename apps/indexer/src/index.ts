import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { ExpirationTime } from "@arkiv-network/sdk";
import { eq } from "@arkiv-network/sdk/query";
import { addr, bytes, decFromUnits, str, u256, u64 } from "@arkiv-network/sdk/schema";
import {
  ArkivWriter,
  EF_USDC,
  FillEntity,
  MakerEntity,
  MakerStatsEntity,
  OCTANE_PAYMASTER_ABI,
  OCTANE_RELAY_ABI,
  admissionReport,
  arkivReader,
  arkivWallet,
  computeFade,
  downloadJournalChain,
  efDevnet,
  fetchMakerProfile,
  fetchMakers,
  fetchMakerStats,
  hashQuote,
  inputsFromJournal,
  redactAccessKey,
  whitechainSepolia,
  type Quote,
} from "@octane/sdk";
import { createPublicClient, decodeFunctionData, erc20Abi, http, toHex, type Address, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

/**
 * Watches both chains and writes fills and reputation to Arkiv. It serves no API: every screen
 * reads Arkiv itself, and anyone can run their own indexer from the same public data.
 */
const FILL_INTERVAL_MS = 30_000;
const STATS_INTERVAL_MS = 300_000;
const STATS_WINDOW_SECONDS = 86_400;
const MAX_LOG_RANGE = 9_000n;
const FILL_LIFETIME = ExpirationTime.fromDays(30);
const STATS_LIFETIME = ExpirationTime.fromDays(1);

const envFile = new URL("../../../.env", import.meta.url);
const settings: Record<string, string | undefined> = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")) : {};
function setting(name: string): string {
  const value = process.env[name] ?? settings[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

const dataDir = new URL("../data/", import.meta.url);
mkdirSync(dataDir, { recursive: true });
const stateFile = new URL("state.json", dataDir);

interface State {
  whitechainBlock: string;
  efBlock: string;
}
const load = (): State | undefined =>
  existsSync(stateFile) ? (JSON.parse(readFileSync(stateFile, "utf8")) as State) : undefined;

const accessKey = setting("ARKIV_ACCESS_KEY");
const account = privateKeyToAccount(setting("INDEXER_PRIVATE_KEY") as Hex);
const reader = arkivReader(accessKey);
const writer = new ArkivWriter(reader, arkivWallet(accessKey, account), account.address);

const relay = setting("OCTANE_RELAY") as Address;
const beeUrl = setting("SWARM_BEE_URL");
const builtInMakers = ["MAKER_CAUTIOUS", "MAKER_AGGRESSIVE", "MAKER_BALANCER"].map((name) => setting(`${name}_ADDRESS`) as Address);
/** Grows as new makers publish profiles, so joining needs nobody to update this indexer. */
let makers = builtInMakers;

const whitechain = createPublicClient({ chain: whitechainSepolia, transport: http(setting("WHITECHAIN_RPC_URL"), { timeout: 15_000 }) });
const devnet = createPublicClient({ chain: efDevnet, transport: http(undefined, { timeout: 15_000, retryCount: 0 }) });

const log = (event: string, fields: Record<string, unknown> = {}) =>
  console.log(redactAccessKey(JSON.stringify({ ts: Math.floor(Date.now() / 1000), event, ...fields }, (_, v) => (typeof v === "bigint" ? v.toString() : v))));

interface FillRecord {
  chainId: bigint;
  maker: Address;
  payer: Address;
  txHash: Hash;
  quoteHash: Hash;
  ts: bigint;
  fee: bigint;
  receipt: Record<string, string>;
}

async function alreadyIndexed(txHash: Hash): Promise<boolean> {
  const page = await reader.select({ $key: true }).from(FillEntity).where(eq("txHash", str(txHash))).createdBy(account.address).limit(1).fetch();
  return page.entities.length > 0;
}

async function writeFills(records: readonly FillRecord[]): Promise<void> {
  const fresh = [];
  for (const record of records) if (!(await alreadyIndexed(record.txHash))) fresh.push(record);
  if (fresh.length === 0) return;

  const result = await writer.submit({
    creates: fresh.map((record) => ({
      schema: FillEntity,
      expiration: FILL_LIFETIME,
      flags: { readonly: true },
      values: {
        chainId: u64(record.chainId),
        maker: addr(record.maker),
        payer: addr(record.payer),
        txHash: str(record.txHash),
        quoteHash: str(record.quoteHash),
        ts: u64(record.ts),
        fee: u256(record.fee),
        receipt: bytes(toHex(JSON.stringify(record.receipt))),
      },
    })),
  });
  log("fills", { count: fresh.length, result: result.status, tx: result.status === "sent" ? result.txHash : undefined });
}

async function whitechainFills(from: bigint, to: bigint): Promise<FillRecord[]> {
  const events = await whitechain.getContractEvents({ address: relay, abi: OCTANE_RELAY_ABI, eventName: "Relayed", fromBlock: from, toBlock: to });
  return Promise.all(
    events.map(async (event) => {
      const block = await whitechain.getBlock({ blockNumber: event.blockNumber });
      const { quoteHash, maker, payer, merchant, amount, fee, feePayer } = event.args;
      return {
        chainId: BigInt(whitechainSepolia.id),
        maker: maker as Address,
        payer: payer as Address,
        txHash: event.transactionHash,
        quoteHash: quoteHash as Hash,
        ts: block.timestamp,
        fee: fee ?? 0n,
        receipt: { merchant: String(merchant), amount: String(amount), feePayer: String(feePayer) },
      };
    }),
  );
}

interface AdmissionEntry {
  entry?: { tx?: { sender?: Address; frames?: { data?: Hex }[] } };
}

/** On the devnet a fill is a frame transaction whose `pay` frame carries the quote it settled. */
async function devnetFills(from: bigint, to: bigint): Promise<FillRecord[]> {
  const transfers = await devnet.getContractEvents({
    address: EF_USDC,
    abi: erc20Abi,
    eventName: "Transfer",
    args: { to: makers },
    fromBlock: from,
    toBlock: to,
  });
  const fills: FillRecord[] = [];
  for (const transfer of transfers) {
    const report = (await admissionReport(transfer.transactionHash).catch(() => undefined)) as AdmissionEntry | undefined;
    const payData = report?.entry?.tx?.frames?.[2]?.data;
    if (!payData) continue; // Not a frame transaction we can tie to a quote.
    const { args } = decodeFunctionData({ abi: OCTANE_PAYMASTER_ABI, data: payData });
    const quote = args[0] as Quote;
    const block = await devnet.getBlock({ blockNumber: transfer.blockNumber });
    fills.push({
      chainId: BigInt(efDevnet.id),
      maker: quote.maker,
      payer: transfer.args.from as Address,
      txHash: transfer.transactionHash,
      quoteHash: hashQuote(quote),
      ts: block.timestamp,
      fee: transfer.args.value ?? 0n,
      receipt: { settlement: quote.settlement },
    });
  }
  return fills;
}

async function indexFills(state: State): Promise<State> {
  const [whitechainTip, efTip] = await Promise.all([whitechain.getBlockNumber(), devnet.getBlockNumber().catch(() => undefined)]);

  const whitechainFrom = BigInt(state.whitechainBlock) + 1n;
  const whitechainTo = whitechainTip < whitechainFrom + MAX_LOG_RANGE ? whitechainTip : whitechainFrom + MAX_LOG_RANGE;
  if (whitechainFrom <= whitechainTo) await writeFills(await whitechainFills(whitechainFrom, whitechainTo));
  const next: State = { ...state, whitechainBlock: whitechainTo.toString() };

  // A devnet reset restarts its block numbers, so a saved position past the tip means start over.
  const efFrom = efTip !== undefined && BigInt(state.efBlock) > efTip ? 0n : BigInt(state.efBlock);
  if (efTip !== undefined && efFrom < efTip) {
    await writeFills(await devnetFills(efFrom + 1n, efTip));
    next.efBlock = efTip.toString();
  }
  return next;
}

async function publishStats(maker: Address): Promise<void> {
  const profile = await fetchMakerProfile(reader, maker);
  if (!profile?.journalRef) return;

  const files = await downloadJournalChain(beeUrl, profile.journalRef);
  const newest = files.at(-1);
  if (!newest) return;

  // The window ends at the newest published line, so anyone rereading these files gets this exact result.
  const to = newest.to;
  const from = to - STATS_WINDOW_SECONDS;
  const { inputs, fills, fees } = inputsFromJournal(files, Math.max(from, files[0]?.from ?? from), to);
  const score = computeFade(inputs);

  const values = {
    maker: addr(maker),
    epoch: u64(BigInt(to)),
    fadeScore: u64(score.fade),
    uptime24h: u64(score.uptime),
    coverage24h: u64(score.coverage),
    fills24h: u64(BigInt(fills)),
    pnl24h: decFromUnits(fees),
    inputs: bytes(toHex(JSON.stringify({ journalRef: profile.journalRef, from: inputs.from, to: inputs.to }))),
  };

  const existing = await fetchMakerStats(reader, { indexer: account.address, maker });
  const result = existing
    ? await writer.submit({
        patches: [{ schema: MakerStatsEntity, entityKey: existing.key, set: values }],
        extensions: [{ entityKey: existing.key, expiration: STATS_LIFETIME }],
      })
    : await writer.submit({ creates: [{ schema: MakerStatsEntity, values, expiration: STATS_LIFETIME }] });
  log("stats", { maker, fade: score.fade, uptime: score.uptime, coverage: score.coverage, fills, result: result.status });
}

let state = load();
if (!state) {
  const [whitechainTip, efTip] = await Promise.all([whitechain.getBlockNumber(), devnet.getBlockNumber()]);
  // Start far enough back to cover everything since the relay was deployed, within one RPC range.
  state = { whitechainBlock: (whitechainTip - MAX_LOG_RANGE * 2n).toString(), efBlock: (efTip - 2_000n).toString() };
}
log("started", { indexer: account.address });

let lastStats = 0;
for (;;) {
  try {
    state = await indexFills(state);
    writeFileSync(stateFile, JSON.stringify(state));
  } catch (error) {
    log("fills-failed", { detail: String(error).slice(0, 200) });
  }
  if (Date.now() - lastStats > STATS_INTERVAL_MS) {
    lastStats = Date.now();
    const found = await fetchMakers(reader).catch(() => []);
    makers = [...new Map([...builtInMakers, ...found].map((maker) => [maker.toLowerCase(), maker])).values()];
    for (const maker of makers) {
      try {
        await publishStats(maker);
      } catch (error) {
        log("stats-failed", { maker, detail: String(error).slice(0, 200) });
      }
    }
  }
  await new Promise((resolve) => setTimeout(resolve, FILL_INTERVAL_MS));
}
