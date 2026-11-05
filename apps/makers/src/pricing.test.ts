import { describe, expect, it } from "vitest";
import { MAKERS, MAX_FEE, MIN_FEE } from "./config.ts";
import { gasCost, priceFee, wbtPriceFromSqrt, type Market } from "./pricing.ts";

const market: Market = {
  gasPrice: 5_001_000_000n,
  l1Fee: 5_000n,
  wbtPrice: 76_590_000n,
  wbtBalance: 400_000_000_000_000_000n,
};

describe("pricing", () => {
  it("costs about 0.063 USDT at the base-fee floor", () => {
    expect(gasCost(market)).toBe(63_200n);
  });

  it("charges more for a wider spread", () => {
    expect(priceFee(MAKERS.cautious, market, 0n)).toBeGreaterThan(priceFee(MAKERS.aggressive, market, 0n));
  });

  it("charges more for a bigger buffer", () => {
    expect(priceFee(MAKERS.cautious, market, 3_000n)).toBeGreaterThan(priceFee(MAKERS.cautious, market, 0n));
  });

  it("never quotes below the floor, even if gas were free", () => {
    const free = { ...market, gasPrice: 0n, l1Fee: 0n };
    expect(priceFee(MAKERS.aggressive, free, 0n)).toBe(MIN_FEE);
  });

  it("never quotes above the cap, whatever the market does", () => {
    const wild = { ...market, gasPrice: 10n ** 12n };
    expect(priceFee(MAKERS.cautious, wild, 5_000n)).toBe(MAX_FEE);
  });

  it("widens the balancer's quote as its inventory falls", () => {
    const thin = { ...market, wbtBalance: 100_000_000_000_000_000n };
    expect(priceFee(MAKERS.balancer, thin, 0n)).toBeGreaterThan(priceFee(MAKERS.balancer, market, 0n));
  });

  it("leaves other styles alone when inventory falls", () => {
    const thin = { ...market, wbtBalance: 100_000_000_000_000_000n };
    expect(priceFee(MAKERS.cautious, thin, 0n)).toBe(priceFee(MAKERS.cautious, market, 0n));
  });

  it("reads the live pool price from its sqrt price", () => {
    const sqrtPrice = 693_454_237_201_783_550_516_657n;
    const price = wbtPriceFromSqrt(sqrtPrice);
    expect(price).toBeGreaterThan(76_000_000n);
    expect(price).toBeLessThan(77_000_000n);
  });
});
