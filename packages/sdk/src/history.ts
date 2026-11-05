import { desc, eq } from "@arkiv-network/sdk/query";
import { addr } from "@arkiv-network/sdk/schema";
import type { Address, Hash, Hex } from "viem";
import type { ArkivReader } from "./arkiv/client.ts";
import { FillEntity, MakerStatsEntity } from "./arkiv/schema.ts";

export const FILL_PAGE_SIZE = 20;

export interface Fill {
  key: Hex;
  chainId: bigint;
  maker: Address;
  payer: Address;
  txHash: Hash;
  quoteHash: Hash;
  ts: bigint;
  fee: bigint;
}

export interface FillPage {
  fills: Fill[];
  /** Pass this back for the next page. Undefined on the last page. */
  nextCursor: number | undefined;
  total: bigint;
}

/**
 * One page of settled payments, newest first, read straight from Arkiv. Only the indexer's own
 * entities count: anyone can write under this schema name, but only it can write as itself.
 */
export async function fetchFills(
  reader: ArkivReader,
  args: { indexer: Address; maker?: Address; payer?: Address; cursor?: number; pageSize?: number },
): Promise<FillPage> {
  const pageSize = args.pageSize ?? FILL_PAGE_SIZE;
  const offset = args.cursor ?? 0;
  const filters = [
    ...(args.maker ? [eq("maker", addr(args.maker))] : []),
    ...(args.payer ? [eq("payer", addr(args.payer))] : []),
  ];
  const query = reader.select().from(FillEntity);
  const page = await (filters.length > 0 ? query.where(...filters) : query)
    .createdBy(args.indexer)
    .orderBy(desc("ts"))
    .limit(pageSize)
    .offset(offset)
    .withCount()
    .fetch();

  const fills = page.entities.map((row) => ({
    key: row.$key as Hex,
    chainId: row.chainId.value,
    maker: row.maker.value as Address,
    payer: row.payer.value as Address,
    txHash: row.txHash.value as Hash,
    quoteHash: row.quoteHash.value as Hash,
    ts: row.ts.value,
    fee: row.fee.value,
  }));
  const seen = offset + page.entities.length + page.skipped;
  return { fills, nextCursor: BigInt(seen) < page.count ? seen : undefined, total: page.count };
}

export interface MakerStats {
  key: Hex;
  maker: Address;
  epoch: bigint;
  fadeScore: bigint;
  uptime: bigint;
  coverage: bigint;
  fills: bigint;
  inputs: Hex;
}

/** A maker's latest reputation, as written by the indexer. */
export async function fetchMakerStats(
  reader: ArkivReader,
  args: { indexer: Address; maker: Address },
): Promise<MakerStats | undefined> {
  const page = await reader
    .select()
    .from(MakerStatsEntity)
    .where(eq("maker", addr(args.maker)))
    .createdBy(args.indexer)
    .orderBy(desc("epoch"))
    .limit(1)
    .fetch();
  const row = page.entities[0];
  if (!row) return undefined;
  return {
    key: row.$key as Hex,
    maker: args.maker,
    epoch: row.epoch.value,
    fadeScore: row.fadeScore.value,
    uptime: row.uptime24h.value,
    coverage: row.coverage24h.value,
    fills: row.fills24h.value,
    inputs: row.inputs.value as Hex,
  };
}

/** A fade score above this means a maker often fails to deliver. Basis points. */
export const UNRELIABLE_FADE = 3_000n;

/** Each maker's fade score, for the makers that have one. */
export async function fetchFadeScores(
  reader: ArkivReader,
  args: { indexer: Address; makers: readonly Address[] },
): Promise<Map<Address, bigint>> {
  const scores = await Promise.all(
    args.makers.map(async (maker) => [maker, await fetchMakerStats(reader, { indexer: args.indexer, maker })] as const),
  );
  return new Map(scores.flatMap(([maker, stats]) => (stats ? [[maker, stats.fadeScore] as const] : [])));
}
