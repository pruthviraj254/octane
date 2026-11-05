import { ExpirationTime } from "@arkiv-network/sdk";
import { asc, eq, gt } from "@arkiv-network/sdk/query";
import { addr, bytes, str, u256, u64 } from "@arkiv-network/sdk/schema";
import { isAddressEqual, type Address, type Hash, type Hex } from "viem";
import { hashQuote, isSignedByMaker, type Quote } from "../quotes.ts";
import type { ArkivReader } from "./client.ts";
import { MakerEntity, QuoteEntity } from "./schema.ts";

/** 15 blocks at 2s is the 30s board lifetime. A maker that stops refreshing is gone in 30s. */
export const QUOTE_LIFETIME = ExpirationTime.fromBlocks(15);

export interface BoardQuote {
  key: Hex;
  quote: Quote;
  sig: Hex;
  quoteHash: Hash;
  style: string;
  seq: bigint;
  /** The Arkiv block where this board entry disappears. */
  expiresAt: bigint;
}

export interface MakerProfile {
  key: Hex;
  maker: Address;
  style: string;
  endpoint: string;
  journalRef: string | undefined;
}

/** The columns a standing quote writes. Used for both the first create and each refresh. */
export function quoteValues(quote: Quote, sig: Hex, style: string, seq: bigint) {
  return {
    chainId: u64(quote.chainId),
    token: addr(quote.token),
    maker: addr(quote.maker),
    fee: u256(quote.fee),
    maxGas: u64(quote.maxGas),
    validUntil: u64(quote.validUntil),
    settlement: addr(quote.settlement),
    nonce: u256(quote.nonce),
    seq: u64(seq),
    style: str(style),
    quoteHash: str(hashQuote(quote)),
    sig: bytes(sig),
  };
}

/**
 * Reads the live board: cheapest first, and only quotes a payer can safely use.
 *
 * Anyone can write entities under our schema name, so nothing here is trusted for being on
 * Arkiv. A quote must be signed by its own maker, written by that maker's wallet, and name a
 * settlement contract the caller recognises. The last check matters most: without it, a fake
 * maker could name its own contract and collect the payer's authorisation.
 */
export async function fetchBoard(
  reader: ArkivReader,
  args: {
    chainId: bigint;
    token: Address;
    now: bigint;
    isTrustedSettlement: (settlement: Address) => boolean | Promise<boolean>;
  },
): Promise<{ quotes: BoardQuote[]; blockNumber: bigint }> {
  const page = await reader
    .select()
    .from(QuoteEntity)
    .where(eq("chainId", u64(args.chainId)), eq("token", addr(args.token)), gt("validUntil", u64(args.now)))
    .orderBy(asc("fee"))
    .limit(50)
    .fetch();

  const checked = await Promise.all(
    page.entities.map(async (row): Promise<BoardQuote | undefined> => {
      const quote: Quote = {
        maker: row.maker.value as Address,
        chainId: row.chainId.value,
        settlement: row.settlement.value as Address,
        token: row.token.value as Address,
        maxGas: row.maxGas.value,
        fee: row.fee.value,
        validUntil: row.validUntil.value,
        nonce: row.nonce.value,
      };
      const sig = row.sig.value as Hex;
      if (!isAddressEqual(row.$owner as Address, quote.maker)) return undefined;
      if (!(await args.isTrustedSettlement(quote.settlement))) return undefined;
      if (!(await isSignedByMaker(quote, sig))) return undefined;
      return {
        key: row.$key as Hex,
        quote,
        sig,
        quoteHash: hashQuote(quote),
        style: row.style.value,
        seq: row.seq.value,
        expiresAt: row.$expiresAt as bigint,
      };
    }),
  );
  return { quotes: checked.filter((entry) => entry !== undefined), blockNumber: page.blockNumber };
}

/** Finds where to send a signed job. The profile must be written by the maker itself. */
export async function fetchMakerProfile(reader: ArkivReader, maker: Address): Promise<MakerProfile | undefined> {
  const page = await reader.select().from(MakerEntity).where(eq("maker", addr(maker))).ownedBy(maker).limit(1).fetch();
  const row = page.entities[0];
  if (!row) return undefined;
  return {
    key: row.$key as Hex,
    maker,
    style: row.style.value,
    endpoint: row.endpoint.value,
    journalRef: row.journalRef?.value,
  };
}
