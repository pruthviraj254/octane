import {
  arkivReader,
  computeFade,
  downloadJournalChain,
  explorerTx,
  fetchMakerStats,
  inputsFromJournal,
  ARKIV_CHAIN_ID,
  whitechainSepolia,
} from "@octane/sdk";
import { createPublicClient, hexToString, http, isAddress, type Address, type Hash } from "viem";
import { run } from "./lib/env.ts";

/**
 * Rebuilds a maker's reputation from public data alone: its Swarm journal, checked against
 * Arkiv and Whitechain. It uses the same formula as the indexer, so the numbers must match the
 * board. Usage: pnpm recompute-fade --maker 0x...
 *
 * It needs no .env and no keys, so anyone can check the board from a clean clone.
 */
const SAMPLE = 5;
const PUBLIC_INDEXER: Address = "0xb547061EE3090b42E66e2F7F9378fbEd6863FE8E";
const PUBLIC_SWARM_GATEWAY = "https://bzz.limo";

function pick<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const step = items.length / count;
  return Array.from({ length: count }, (_, index) => items[Math.floor(index * step)] as T);
}

await run(async () => {
  const flag = process.argv.indexOf("--maker");
  const maker = (flag >= 0 ? process.argv[flag + 1] : undefined) as Address | undefined;
  if (!maker || !isAddress(maker)) throw new Error("usage: recompute-fade --maker 0x...");

  // An empty key selects Arkiv's keyless public endpoint.
  const reader = arkivReader(process.env.ARKIV_ACCESS_KEY || "");
  const indexer = (process.env.INDEXER_ADDRESS || PUBLIC_INDEXER) as Address;
  const stats = await fetchMakerStats(reader, { indexer, maker });
  if (!stats) throw new Error("the indexer has published no stats for this maker yet");

  const { journalRef, from, to } = JSON.parse(hexToString(stats.inputs)) as { journalRef: string; from: number; to: number };
  console.log(`journal ${journalRef}, window ${from} to ${to}`);

  const files = await downloadJournalChain(process.env.SWARM_BEE_URL || PUBLIC_SWARM_GATEWAY, journalRef);
  console.log(`read ${files.length} journal file(s) from Swarm`);
  const { inputs, quoted, fills } = inputsFromJournal(files, from, to);
  const score = computeFade(inputs);

  // Spot checks that the journal is telling the truth.
  const whitechain = createPublicClient({ chain: whitechainSepolia, transport: http(process.env.WHITECHAIN_RPC_URL || undefined, { timeout: 15_000 }) });
  let writesChecked = 0;
  for (const line of pick(quoted.filter((entry) => entry.tx), SAMPLE)) {
    const tx = await reader.getTransaction({ hash: line.tx as Hash }).catch(() => undefined);
    if (!tx) continue;
    if (tx.from.toLowerCase() !== maker.toLowerCase()) throw new Error(`journal lies: ${explorerTx(ARKIV_CHAIN_ID, line.tx as string)} isn't from this maker`);
    writesChecked += 1;
  }
  let balancesChecked = 0;
  for (const line of pick(quoted.filter((entry) => entry.block && entry.wbt), SAMPLE)) {
    const onchain = await whitechain.getBalance({ address: maker, blockNumber: BigInt(line.block as string) });
    if (onchain.toString() !== line.wbt) throw new Error(`journal lies about its balance at block ${line.block}`);
    balancesChecked += 1;
  }

  const row = (name: string, recomputed: bigint, board: bigint) =>
    console.log(`${name.padEnd(10)} recomputed ${recomputed}  board ${board}  ${recomputed === board ? "match" : "DIFFERENT"}`);
  row("fade", score.fade, stats.fadeScore);
  row("uptime", score.uptime, stats.uptime);
  row("coverage", score.coverage, stats.coverage);
  row("fills", BigInt(fills), stats.fills);
  console.log(`checked ${writesChecked} Arkiv writes and ${balancesChecked} Whitechain balances against the journal`);
  if (score.fade !== stats.fadeScore) process.exitCode = 1;
});
