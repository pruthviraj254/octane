import type { JournalFile } from "./swarm.ts";

/** A quote that isn't refreshed leaves the board after this long. */
const QUOTE_LIFETIME_SECONDS = 30;
const BPS = 10_000n;

export interface FadeInputs {
  from: number;
  to: number;
  /** When each quote refresh was written, in seconds, oldest first. */
  quoteTimes: readonly number[];
  /** For each refresh: could the maker's wallet afford what it quoted? */
  covered: readonly boolean[];
  /** Auctions this maker won, and how many of those it then settled. */
  auctionsWon: number;
  auctionsSettled: number;
}

export interface FadeScore {
  /** All in basis points. Uptime, coverage and delivery: higher is better. Fade: lower is better. */
  uptime: bigint;
  coverage: bigint;
  delivery: bigint;
  fade: bigint;
}

/**
 * The reputation formula. It takes only numbers, so the indexer and `recompute-fade` must agree
 * whenever they read the same public journals.
 */
export function computeFade(inputs: FadeInputs): FadeScore {
  const window = inputs.to - inputs.from;
  let live = 0;
  inputs.quoteTimes.forEach((time, index) => {
    const next = inputs.quoteTimes[index + 1] ?? inputs.to;
    live += Math.min(Math.max(next - time, 0), QUOTE_LIFETIME_SECONDS);
  });

  const share = (part: number, whole: number) => (whole <= 0 ? 0n : (BigInt(Math.min(part, whole)) * BPS) / BigInt(whole));
  const uptime = share(live, window);
  const coverage = share(inputs.covered.filter(Boolean).length, inputs.covered.length);
  const delivery = inputs.auctionsWon === 0 ? BPS : share(inputs.auctionsSettled, inputs.auctionsWon);
  const fade = BPS - (uptime * coverage * delivery) / (BPS * BPS);
  return { uptime, coverage, delivery, fade };
}

interface QuotedLine {
  event: "quoted";
  ts: number;
  tx?: string;
  block?: string;
  wbt?: string;
  gasPrice?: string;
  maxGas?: string;
}

const isQuoted = (line: Record<string, unknown>): line is Record<string, unknown> & QuotedLine =>
  line.event === "quoted" && typeof line.ts === "number";

/** What a maker's public journal says about one window of time. */
export function inputsFromJournal(files: readonly JournalFile[], from: number, to: number) {
  const lines = files.flatMap((file) => file.lines).filter((line) => {
    const ts = line.ts;
    return typeof ts === "number" && ts >= from && ts <= to;
  });
  const quoted = lines.filter(isQuoted);
  const fills = lines.filter((line) => line.event === "relayed");
  const fees = fills.reduce((total, line) => total + BigInt(String(line.fee ?? 0)), 0n);

  const inputs: FadeInputs = {
    from,
    to,
    quoteTimes: quoted.map((line) => line.ts),
    covered: quoted.map((line) => {
      if (!line.wbt || !line.gasPrice || !line.maxGas) return false;
      return BigInt(line.wbt) >= BigInt(line.gasPrice) * BigInt(line.maxGas);
    }),
    auctionsWon: lines.filter((line) => line.event === "auction-won").length,
    auctionsSettled: lines.filter((line) => line.event === "auction-settled").length,
  };
  return { inputs, quoted, fills: fills.length, fees };
}
