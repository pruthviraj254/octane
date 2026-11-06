import { describe, expect, it } from "vitest";
import { createAiLimit } from "../src/rate-limit.ts";

function limit(perVisitor = 2, perDay = 100) {
  const clock = { time: 1_000_000 };
  return { clock, ai: createAiLimit({ perVisitor, windowMs: 60_000, perDay, now: () => clock.time }) };
}

describe("createAiLimit", () => {
  it("stops a visitor at the limit and lets others through", () => {
    const { ai } = limit();
    expect([ai.allow("a"), ai.allow("a"), ai.allow("a")]).toEqual([true, true, false]);
    expect(ai.allow("b")).toBe(true);
  });

  it("lets a visitor back in once the window passes", () => {
    const { ai, clock } = limit();
    ai.allow("a");
    ai.allow("a");
    clock.time += 60_000;
    expect(ai.allow("a")).toBe(true);
  });

  it("holds the daily total across visitors, and resets it the next day", () => {
    const { ai, clock } = limit(5, 2);
    expect([ai.allow("a"), ai.allow("b"), ai.allow("c")]).toEqual([true, true, false]);
    clock.time += 86_400_000;
    expect(ai.allow("c")).toBe(true);
  });
});
