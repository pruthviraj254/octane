import type { LlmClient } from "@octane/sdk/llm";
import { z } from "zod";

export type RegimeName = "calm" | "spiky" | "shock";

export interface Regime {
  name: RegimeName;
  bufferBps: bigint;
  journal: string;
  source: "llm" | "fallback";
}

export interface RegimeInputs {
  style: string;
  baseFeesGwei: readonly string[];
  wbtPrice: string;
  wbtBalance: string;
}

/** Buffers each regime may use, in percent. An LLM answer outside its band is clamped to it. */
const BANDS: Record<RegimeName, readonly [number, number]> = {
  calm: [0, 10],
  spiky: [10, 30],
  shock: [30, 50],
};

/** When the LLM can't be trusted or reached, assume a choppy market rather than a calm one. */
const FALLBACK = (reason: string): Regime => ({
  name: "spiky",
  bufferBps: 2_000n,
  journal: `Regime call failed (${reason}), holding a 20% buffer until it recovers.`,
  source: "fallback",
});

const Answer = z.object({
  regime: z.enum(["calm", "spiky", "shock"]),
  bufferPct: z.number().finite(),
  journal: z.string().min(1).max(200),
});

const SYSTEM = `You set the risk regime for an automated gas market maker. You never set prices.
Reply with one JSON object and nothing else:
{"regime":"calm"|"spiky"|"shock","bufferPct":<number>,"journal":"<one short sentence explaining the call>"}
calm is 0-10, spiky 10-30, shock 30-50. Use shock only for a violent, sustained move.`;

/** Parses and bounds an LLM answer. Anything malformed becomes the fallback. */
export function parseRegime(text: string): Regime {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return FALLBACK("no JSON in the reply");

  let parsed;
  try {
    parsed = Answer.safeParse(JSON.parse(text.slice(start, end + 1)));
  } catch {
    return FALLBACK("invalid JSON");
  }
  if (!parsed.success) return FALLBACK("unexpected shape");

  const { regime, bufferPct, journal } = parsed.data;
  const [low, high] = BANDS[regime];
  const bounded = Math.min(Math.max(bufferPct, low), high);
  return { name: regime, bufferBps: BigInt(Math.round(bounded * 100)), journal, source: "llm" };
}

export async function askRegime(llm: LlmClient, inputs: RegimeInputs): Promise<Regime> {
  const prompt = `Maker style: ${inputs.style}
Recent base fees in gwei, oldest first: ${inputs.baseFeesGwei.join(", ")}
WBT price: ${inputs.wbtPrice} USDT
Maker's WBT balance: ${inputs.wbtBalance}`;
  try {
    return parseRegime(await llm.complete(SYSTEM, prompt));
  } catch {
    return FALLBACK("LLM unavailable");
  }
}
