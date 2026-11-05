import { describe, expect, it } from "vitest";
import { computeFade, inputsFromJournal, type JournalFile } from "../src/index.ts";

const base = { from: 0, to: 100, auctionsWon: 0, auctionsSettled: 0 };
const every10s = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90];
const allCovered = every10s.map(() => true);

describe("computeFade", () => {
  it("gives a perfect maker a zero fade score", () => {
    const score = computeFade({ ...base, quoteTimes: every10s, covered: allCovered });
    expect(score).toEqual({ uptime: 10_000n, coverage: 10_000n, delivery: 10_000n, fade: 0n });
  });

  it("counts a gap beyond the 30s lifetime as downtime", () => {
    const score = computeFade({ ...base, quoteTimes: [0, 10, 90], covered: [true, true, true] });
    expect(score.uptime).toBe(5_000n); // 10s, then 30s of the 80s gap, then the last 10s.
  });

  it("counts time spent unable to afford the quote", () => {
    const score = computeFade({ ...base, quoteTimes: every10s, covered: [...allCovered.slice(5), false, false, false, false, false] });
    expect(score.coverage).toBe(5_000n);
    expect(score.fade).toBe(5_000n);
  });

  it("counts auctions won and never settled", () => {
    const score = computeFade({ ...base, quoteTimes: every10s, covered: allCovered, auctionsWon: 4, auctionsSettled: 1 });
    expect(score.delivery).toBe(2_500n);
    expect(score.fade).toBe(7_500n);
  });

  it("scores a maker that never quoted as fully faded", () => {
    expect(computeFade({ ...base, quoteTimes: [], covered: [] }).fade).toBe(10_000n);
  });
});

describe("inputsFromJournal", () => {
  const file: JournalFile = {
    maker: "0x0",
    seq: 1,
    prev: null,
    from: 0,
    to: 40,
    lines: [
      { event: "quoted", ts: 10, wbt: "100", gasPrice: "1", maxGas: "50" },
      { event: "quoted", ts: 20, wbt: "10", gasPrice: "1", maxGas: "50" },
      { event: "relayed", ts: 25, fee: "70000" },
      { event: "quoted", ts: 999, wbt: "100", gasPrice: "1", maxGas: "50" },
    ],
  };

  it("reads only the lines inside the window", () => {
    const { inputs, fills, fees } = inputsFromJournal([file], 0, 40);
    expect(inputs.quoteTimes).toEqual([10, 20]);
    expect(inputs.covered).toEqual([true, false]);
    expect(fills).toBe(1);
    expect(fees).toBe(70_000n);
  });
});
