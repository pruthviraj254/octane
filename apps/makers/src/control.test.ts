import { describe, expect, it } from "vitest";
import { MAX_FEE, MIN_FEE } from "./config.ts";
import { TickWatchdog, agentActive, feeFor, parseControl, pastLimit, quotesOn, signedUntil } from "./control.ts";

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

describe("quotesOn", () => {
  it("quotes everywhere it can by default", () => {
    expect([quotesOn({ mode: "auto" }, "whitechain"), quotesOn({ mode: "auto" }, "ef-devnet")]).toEqual([true, true]);
  });

  it("stays on the markets its owner chose", () => {
    const control = parseControl('{"mode":"manual","fee":"70000","markets":["ef-devnet"]}');
    expect(control && [quotesOn(control, "whitechain"), quotesOn(control, "ef-devnet")]).toEqual([false, true]);
  });

  it("drops a market it doesn't know", () => {
    expect(parseControl('{"mode":"auto","markets":["whitechain","moon"]}')?.markets).toEqual(["whitechain"]);
  });
});

describe("agentActive", () => {
  it("runs for an agent that's pricing", () => {
    expect(agentActive({ mode: "auto" })).toBe(true);
  });

  it("keeps running while a person overrides it", () => {
    expect(agentActive(parseControl('{"mode":"manual","fee":"90000","agent":true}') as never)).toBe(true);
  });

  it("never runs for a maker with no agent", () => {
    expect(agentActive(parseControl('{"mode":"manual","fee":"90000"}') as never)).toBe(false);
    expect(agentActive(parseControl('{"mode":"manual","fee":"90000","agent":false}') as never)).toBe(false);
  });
});

describe("feeFor", () => {
  it("uses the formula for an agent", () => {
    expect(feeFor({ mode: "auto", fee: 99_000n }, 70_000n)).toBe(70_000n);
  });

  it("ignores a moving formula in manual mode", () => {
    const control = { mode: "manual", fee: 70_000n } as const;
    expect([feeFor(control, 66_000n), feeFor(control, 120_000n), feeFor(control, 400_000n)]).toEqual([70_000n, 70_000n, 70_000n]);
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

describe("TickWatchdog", () => {
  it("waits for the limit", () => {
    const watchdog = new TickWatchdog(3);
    expect([watchdog.failed(), watchdog.failed(), watchdog.failed()]).toEqual([false, false, true]);
  });

  it("forgives failures once a tick succeeds", () => {
    const watchdog = new TickWatchdog(2);
    watchdog.failed();
    watchdog.succeeded();
    expect(watchdog.failed()).toBe(false);
  });

  it("keeps saying so while failures continue", () => {
    const watchdog = new TickWatchdog(1);
    expect([watchdog.failed(), watchdog.failed()]).toEqual([true, true]);
  });
});
