import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import type { BoardQuote } from "../src/arkiv/board.ts";
import { eligibleQuotes } from "../src/pay.ts";

const CHEAP = "0x1111111111111111111111111111111111111111" as Address;
const MIDDLE = "0x2222222222222222222222222222222222222222" as Address;
const DEAR = "0x3333333333333333333333333333333333333333" as Address;

const quoteFrom = (maker: Address, fee: bigint) =>
  ({ key: maker as Hex, style: maker, quote: { maker, fee } }) as unknown as BoardQuote;

const quotes = [quoteFrom(CHEAP, 65_000n), quoteFrom(MIDDLE, 77_000n), quoteFrom(DEAR, 92_000n)];
const makers = (entries: BoardQuote[]) => entries.map((entry) => entry.quote.maker);

describe("eligibleQuotes", () => {
  it("keeps every affordable maker in price order, so the default can fall back", () => {
    expect(makers(eligibleQuotes(quotes, { maxFee: 80_000n, avoid: [] }))).toEqual([CHEAP, MIDDLE]);
  });

  it("passes over a maker with a poor record by default", () => {
    expect(makers(eligibleQuotes(quotes, { maxFee: 100_000n, avoid: [CHEAP] }))).toEqual([MIDDLE, DEAR]);
  });

  it("gives a chosen maker no fallback", () => {
    expect(makers(eligibleQuotes(quotes, { maxFee: 100_000n, avoid: [], maker: MIDDLE }))).toEqual([MIDDLE]);
  });

  it("lets a payer choose a maker the wallet would pass over", () => {
    expect(makers(eligibleQuotes(quotes, { maxFee: 100_000n, avoid: [DEAR], maker: DEAR }))).toEqual([DEAR]);
  });

  it("stops if the chosen maker has left the board", () => {
    const gone = "0x4444444444444444444444444444444444444444" as Address;
    expect(() => eligibleQuotes(quotes, { maxFee: 100_000n, avoid: [], maker: gone })).toThrow("isn't quoting");
  });

  it("stops if the chosen maker's fee is above the maximum", () => {
    expect(() => eligibleQuotes(quotes, { maxFee: 70_000n, avoid: [], maker: DEAR })).toThrow("above your maximum");
  });
});
