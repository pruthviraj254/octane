import { describe, expect, it } from "vitest";
import { askRegime, parseRegime } from "./regime.ts";

describe("parseRegime", () => {
  it("accepts a well-formed answer", () => {
    const regime = parseRegime('{"regime":"calm","bufferPct":8,"journal":"Flat fees."}');
    expect(regime).toMatchObject({ name: "calm", bufferBps: 800n, source: "llm" });
  });

  it("finds the JSON inside a chatty reply", () => {
    expect(parseRegime('```json\n{"regime":"spiky","bufferPct":15,"journal":"Choppy."}\n```').name).toBe("spiky");
  });

  it("clamps a buffer to its regime's band", () => {
    expect(parseRegime('{"regime":"calm","bufferPct":45,"journal":"x"}').bufferBps).toBe(1_000n);
    expect(parseRegime('{"regime":"shock","bufferPct":500,"journal":"x"}').bufferBps).toBe(5_000n);
    expect(parseRegime('{"regime":"spiky","bufferPct":-20,"journal":"x"}').bufferBps).toBe(1_000n);
  });

  it.each(["", "no json here", "{broken", '{"regime":"panic","bufferPct":10,"journal":"x"}', '{"regime":"calm"}'])(
    "falls back to spiky on %j",
    (reply) => {
      expect(parseRegime(reply)).toMatchObject({ name: "spiky", source: "fallback" });
    },
  );
});

describe("askRegime", () => {
  const inputs = { style: "cautious", baseFeesGwei: ["5"], wbtPrice: "76", wbtBalance: "0.4" };

  it("falls back to spiky when the LLM is down", async () => {
    const regime = await askRegime({ complete: () => Promise.reject(new Error("down")) }, inputs);
    expect(regime).toMatchObject({ name: "spiky", bufferBps: 2_000n, source: "fallback" });
  });
});
