import { ExpirationTime } from "@arkiv-network/sdk";
import { asc, eq, gt } from "@arkiv-network/sdk/query";
import { addr, bytes, key, u256, u64 } from "@arkiv-network/sdk/schema";
import { hexToString, isAddressEqual, stringToHex, type Address, type Hex } from "viem";
import type { ArkivReader } from "./arkiv/client.ts";
import { BidEntity, RequestEntity } from "./arkiv/schema.ts";
import type { ArkivWriter } from "./arkiv/writer.ts";
import { hashQuote, isSignedByMaker, type Quote } from "./quotes.ts";

/** How long makers have to bid. Rabdi's 2s blocks make a 10s window too tight to write in. */
export const AUCTION_BID_SECONDS = 15;
const REQUEST_LIFETIME = ExpirationTime.fromBlocks(30);

export interface AuctionJob {
  to: Address;
  amount: string;
}

export interface OpenRequest {
  key: Hex;
  chainId: bigint;
  payer: Address;
  maxFee: bigint;
  deadline: bigint;
  jobs: AuctionJob[];
  expiresAt: bigint;
  winner: Address | undefined;
}

export interface Bid {
  key: Hex;
  maker: Address;
  quote: Quote;
  sig: Hex;
  style: string;
}

interface BidPayload {
  quote: Record<keyof Quote, string>;
  sig: Hex;
  style: string;
}

function encodeBid(quote: Quote, sig: Hex, style: string): Hex {
  const payload = { quote, sig, style };
  return stringToHex(JSON.stringify(payload, (_, value) => (typeof value === "bigint" ? value.toString() : value)));
}

function decodeBid(data: Hex): { quote: Quote; sig: Hex; style: string } {
  const { quote, sig, style } = JSON.parse(hexToString(data)) as BidPayload;
  return {
    sig,
    style,
    quote: {
      maker: quote.maker as Address,
      chainId: BigInt(quote.chainId),
      settlement: quote.settlement as Address,
      token: quote.token as Address,
      maxGas: BigInt(quote.maxGas),
      fee: BigInt(quote.fee),
      validUntil: BigInt(quote.validUntil),
      nonce: BigInt(quote.nonce),
    },
  };
}

/** A payer asks the market to bid. Writing to Arkiv takes a little tGLM in the payer's wallet. */
export async function postRequest(
  writer: ArkivWriter,
  args: { chainId: bigint; payer: Address; maxFee: bigint; jobs: readonly AuctionJob[] },
): Promise<{ key: Hex; deadline: bigint }> {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + AUCTION_BID_SECONDS);
  const result = await writer.submit({
    creates: [
      {
        schema: RequestEntity,
        expiration: REQUEST_LIFETIME,
        values: {
          chainId: u64(args.chainId),
          payer: addr(args.payer),
          maxFee: u256(args.maxFee),
          deadline: u64(deadline),
          jobs: bytes(stringToHex(JSON.stringify(args.jobs))),
        },
      },
    ],
  });
  const created = result.status === "sent" ? result.createdEntities[0] : undefined;
  if (!created) throw new Error("couldn't post the request: an earlier write is still pending");
  return { key: created, deadline };
}

/** Requests a maker can still bid on. A request must come from its payer's own wallet. */
export async function fetchOpenRequests(reader: ArkivReader, chainId: bigint): Promise<OpenRequest[]> {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const page = await reader
    .select()
    .from(RequestEntity)
    .where(eq("chainId", u64(chainId)), gt("deadline", u64(now)))
    .limit(20)
    .fetch();
  return page.entities.flatMap((row) => {
    if (!isAddressEqual(row.$owner as Address, row.payer.value as Address)) return [];
    try {
      return [
        {
          key: row.$key as Hex,
          chainId: row.chainId.value,
          payer: row.payer.value as Address,
          maxFee: row.maxFee.value,
          deadline: row.deadline.value,
          jobs: JSON.parse(hexToString(row.jobs.value as Hex)) as AuctionJob[],
          expiresAt: row.$expiresAt as bigint,
          winner: row.winner?.value as Address | undefined,
        },
      ];
    } catch {
      return [];
    }
  });
}

export async function placeBid(
  writer: ArkivWriter,
  args: { request: OpenRequest; quote: Quote; sig: Hex; style: string },
) {
  return writer.submit({
    creates: [
      {
        schema: BidEntity,
        // A bid lives exactly as long as its request.
        expiration: ExpirationTime.atBlock(args.request.expiresAt),
        values: {
          requestKey: key(args.request.key),
          maker: addr(args.quote.maker),
          fee: u256(args.quote.fee),
          quote: bytes(encodeBid(args.quote, args.sig, args.style)),
        },
      },
    ],
  });
}

/** Bids on a request, cheapest first. A bid counts only if its maker wrote and signed it. */
export async function fetchBids(
  reader: ArkivReader,
  requestKey: Hex,
  isTrustedSettlement: (settlement: Address) => boolean | Promise<boolean>,
): Promise<Bid[]> {
  const page = await reader
    .select()
    .from(BidEntity)
    .where(eq("requestKey", key(requestKey)))
    .orderBy(asc("fee"))
    .limit(20)
    .fetch();
  const bids = await Promise.all(
    page.entities.map(async (row): Promise<Bid | undefined> => {
      try {
        const { quote, sig, style } = decodeBid(row.quote.value as Hex);
        const maker = row.maker.value as Address;
        if (!isAddressEqual(row.$owner as Address, maker) || !isAddressEqual(quote.maker, maker)) return undefined;
        if (quote.fee !== row.fee.value) return undefined;
        if (!(await isTrustedSettlement(quote.settlement))) return undefined;
        if (!(await isSignedByMaker(quote, sig))) return undefined;
        return { key: row.$key as Hex, maker, quote, sig, style };
      } catch {
        return undefined;
      }
    }),
  );
  return bids.filter((bid) => bid !== undefined);
}

/** The payer records its choice on its own request, so a winner that doesn't deliver is public. */
export async function recordWinner(writer: ArkivWriter, requestKey: Hex, winner: Address) {
  return writer.submit({ patches: [{ schema: RequestEntity, entityKey: requestKey, set: { winner: addr(winner) } }] });
}

export const bidQuoteHash = (bid: Bid) => hashQuote(bid.quote);
