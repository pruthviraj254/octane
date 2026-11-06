import { describe, expect, it } from "vitest";
import { MAX_FEE, MIN_FEE } from "./config.ts";
import { feeFor, parseControl, pastLimit, signedUntil } from "./control.ts";

describe("parseControl", () => {
  it("reads a manual price and time limit", () => {
    expect(parseControl('{"mode":"manual","fee":"70000","until":1800}')).toEqual({ mode: "manual", fee: 70_000n, until: 1_800n });
  });

  it("reads the agent's mode with no price", () => {
    expect(parseControl('{"mode":"auto"}')).toEqual({ mode: "auto" });
  });

  it.each(["", "not json", '{"mode":"yolo"}', '{"mode":"manual"}', '{"mode":"manual","fee":"lots"}'])("refuses %s", (text) => {
    expect(parseControl(text)).toBeUndefined();
  });
});

describe("feeFor", () => {
  it("uses the formula for an agent", () => {
    expect(feeFor({ mode: "auto", fee: 99_000n }, 70_000n)).toBe(70_000n);
  });

  it("uses a person's price in manual mode", () => {
    expect(feeFor({ mode: "manual", fee: 90_000n }, 70_000n)).toBe(90_000n);
  });

  it("holds a manual price inside the hard limits", () => {
    expect(feeFor({ mode: "manual", fee: 1n }, 70_000n)).toBe(MIN_FEE);
    expect(feeFor({ mode: "manual", fee: 99_000_000n }, 70_000n)).toBe(MAX_FEE);
  });
});

describe("time limits", () => {
  it("runs with no limit by default", () => {
    expect(pastLimit({ mode: "auto" }, 9_999n)).toBe(false);
  });

  it("stops at the limit", () => {
    expect(pastLimit({ mode: "manual", fee: 1n, until: 100n }, 99n)).toBe(false);
    expect(pastLimit({ mode: "manual", fee: 1n, until: 100n }, 100n)).toBe(true);
  });

  it("never signs a quote past the limit", () => {
    expect(signedUntil({ mode: "auto", until: 100n }, 205n)).toBe(100n);
    expect(signedUntil({ mode: "auto", until: 900n }, 205n)).toBe(205n);
    expect(signedUntil({ mode: "auto" }, 205n)).toBe(205n);
  });
});
