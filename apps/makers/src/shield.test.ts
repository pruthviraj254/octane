import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_LIMITS, Shield } from "./shield.ts";

describe("Shield", () => {
  let clock: number;
  let shield: Shield;
  const pass = () => {
    clock += DEFAULT_LIMITS.minPayerGapMs + 1;
  };

  beforeEach(() => {
    clock = 1_000_000;
    shield = new Shield(DEFAULT_LIMITS, () => clock);
  });

  it("lets a normal payer through", () => {
    expect(shield.refuse("0xA")).toBeUndefined();
    pass();
    expect(shield.refuse("0xA")).toBeUndefined();
  });

  it("refuses a payer sending jobs too fast", () => {
    shield.refuse("0xA");
    expect(shield.refuse("0xA")).toMatch("too many jobs from this payer");
  });

  it("treats addresses case-insensitively", () => {
    shield.refuse("0xABC");
    expect(shield.refuse("0xabc")).toBeDefined();
  });

  it("refuses a payer after repeated failed jobs, then lets it back", () => {
    for (let index = 0; index < DEFAULT_LIMITS.strikes; index += 1) shield.strike("0xA");
    pass();
    expect(shield.refuse("0xA")).toMatch("failed jobs");
    expect(shield.refuse("0xB")).toBeUndefined();
    clock += DEFAULT_LIMITS.blockMs + 1;
    expect(shield.refuse("0xA")).toBeUndefined();
  });

  it("forgets old failures", () => {
    shield.strike("0xA");
    shield.strike("0xA");
    clock += DEFAULT_LIMITS.strikeWindowMs + 1;
    shield.strike("0xA");
    expect(shield.refuse("0xA")).toBeUndefined();
  });

  it("stops a burst from many wallets", () => {
    for (let index = 0; index < DEFAULT_LIMITS.burstLimit; index += 1) {
      expect(shield.refuse(`0x${index}`)).toBeUndefined();
    }
    expect(shield.refuse("0xNEW")).toMatch("too many jobs right now");
    clock += DEFAULT_LIMITS.burstWindowMs + 1;
    expect(shield.refuse("0xNEW")).toBeUndefined();
  });
});
