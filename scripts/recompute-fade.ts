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
import { env, envHex, run } from "./lib/env.ts";

/**
 * Rebuilds a maker's reputation from public data alone: its Swarm journal, checked against
 * Arkiv and Whitechain. It uses the same formula as the indexer, so the numbers must match the
 * board. Usage: pnpm recompute-fade --maker 0x...
 */
const SAMPLE = 5;

function pick<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  const step = items.length / count;
  return Array.from({ length: count }, (_, index) => items[Math.floor(index * step)] as T);
}

await run(async () => {
  const flag = process.argv.indexOf("--maker");
  const maker = (flag >= 0 ? process.argv[flag + 1] : undefined) as Address | undefined;
  if (!maker || !isAddress(maker)) throw new Error("usage: recompute-fade --maker 0x...");

  const reader = arkivReader(env("ARKIV_ACCESS_KEY"));
  const stats = await fetchMakerStats(reader, { indexer: envHex("INDEXER_ADDRESS"), maker });
  if (!stats) throw new Error("the indexer has published no stats for this maker yet");

  const { journalRef, from, to } = JSON.parse(hexToString(stats.inputs)) as { journalRef: string; from: number; to: number };
  console.log(`journal ${journalRef}, window ${from} to ${to}`);

  const files = await downloadJournalChain(env("SWARM_BEE_URL"), journalRef);
  console.log(`read ${files.length} journal file(s) from Swarm`);
  const { inputs, quoted, fills } = inputsFromJournal(files, from, to);
  const score = computeFade(inputs);

  // Spot checks that the journal is telling the truth.
  const whitechain = createPublicClient({ chain: whitechainSepolia, transport: http(env("WHITECHAIN_RPC_URL"), { timeout: 15_000 }) });
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
