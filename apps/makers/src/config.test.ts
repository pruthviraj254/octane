import { afterEach, describe, expect, it } from "vitest";
import { MAKERS, findMaker } from "./config.ts";

describe("findMaker", () => {
  afterEach(() => {
    delete process.env.MAKER_NOVA_PRIVATE_KEY;
    delete process.env.MAKER_NOVA_SPREAD;
  });

  it("finds the built-in makers", () => {
    expect(findMaker("aggressive")).toBe(MAKERS.aggressive);
  });

  it("runs a new maker from its settings alone", () => {
    process.env.MAKER_NOVA_PRIVATE_KEY = "0x01";
    process.env.MAKER_NOVA_SPREAD = "1000";
    expect(findMaker("nova")).toMatchObject({ id: "nova", envPrefix: "MAKER_NOVA", spread: 1_000n, quotesPathA: false });
  });

  it("gives a new maker a default spread", () => {
    process.env.MAKER_NOVA_PRIVATE_KEY = "0x01";
    expect(findMaker("nova")?.spread).toBe(10_000n);
  });

  it("refuses a name with no wallet", () => {
    expect(findMaker("nova")).toBeUndefined();
  });
});
