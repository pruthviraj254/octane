import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { MAX_FEE, MIN_FEE } from "./config.ts";

export type MarketName = "whitechain" | "ef-devnet";

/** What the person running a maker has asked for. The desk page writes this file. */
export interface Control {
  /** `auto` uses the formula. `manual` holds a person's price, which never moves by itself. */
  mode: "auto" | "manual";
  /** USDT base units, used in manual mode. */
  fee?: bigint;
  /** This maker has an AI agent. In manual mode that means the person is overriding it. */
  agent?: boolean;
  /** Where it quotes. Unset means everywhere it's able to. */
  markets?: MarketName[];
  /** Unix seconds. Past this, the maker takes its quote off the board. */
  until?: bigint;
}

const dataDir = new URL("../data/", import.meta.url);

export function parseControl(text: string): Control | undefined {
  try {
    const raw = JSON.parse(text) as { mode?: unknown; fee?: unknown; until?: unknown; agent?: unknown; markets?: unknown };
    if (raw.mode !== "auto" && raw.mode !== "manual") return undefined;
    const fee = raw.fee === undefined ? undefined : BigInt(String(raw.fee));
    const until = raw.until === undefined ? undefined : BigInt(String(raw.until));
    if (raw.mode === "manual" && fee === undefined) return undefined;
    return {
      mode: raw.mode,
      ...(fee === undefined ? {} : { fee }),
      ...(until === undefined ? {} : { until }),
      ...(typeof raw.agent === "boolean" ? { agent: raw.agent } : {}),
      ...(Array.isArray(raw.markets) ? { markets: raw.markets.filter((market): market is MarketName => market === "whitechain" || market === "ef-devnet") } : {}),
    };
  } catch {
    return undefined;
  }
}

/** Read on every tick, so a change on the desk reaches the board within one refresh. */
export class ControlFile {
  private readonly file: URL;
  private last: Control = { mode: "auto" };

  constructor(maker: string) {
    this.file = new URL(`${maker}.control.json`, dataDir);
  }

  read(): Control {
    if (!existsSync(this.file)) {
      this.last = { mode: "auto" };
      return this.last;
    }
    // A bad read keeps the last good choice, so a person's price never silently becomes the formula's.
    this.last = parseControl(readFileSync(this.file, "utf8")) ?? this.last;
    return this.last;
  }
}

/** The hard limits hold for people too: a manual price can't undercut the cost of relaying. */
export function feeFor(control: Control, formula: bigint): bigint {
  if (control.mode !== "manual" || control.fee === undefined) return formula;
  if (control.fee < MIN_FEE) return MIN_FEE;
  if (control.fee > MAX_FEE) return MAX_FEE;
  return control.fee;
}

export function quotesOn(control: Control, market: MarketName): boolean {
  return control.markets === undefined || control.markets.includes(market);
}

/** An overridden agent keeps thinking, so its owner can see what it would charge. */
export function agentActive(control: Control): boolean {
  return control.mode === "auto" || control.agent === true;
}

export function pastLimit(control: Control, now: bigint): boolean {
  return control.until !== undefined && now >= control.until;
}

/** A signed quote must not outlive the time limit its maker chose. */
export function signedUntil(control: Control, validUntil: bigint): bigint {
  return control.until !== undefined && control.until < validUntil ? control.until : validUntil;
}

/** Lets the desk page see and stop this process. */
export function claimProcess(maker: string): void {
  writeFileSync(new URL(`${maker}.pid`, dataDir), String(process.pid));
}

export function releaseProcess(maker: string): void {
  rmSync(new URL(`${maker}.pid`, dataDir), { force: true });
}

/**
 * Counts failed ticks in a row. A maker can get stuck with a healthy network, so past the limit
 * it's worth checking whether a restart would help.
 */
export class TickWatchdog {
  private failures = 0;

  constructor(private readonly limit: number) {}

  succeeded(): void {
    this.failures = 0;
  }

  /** True once the failures have reached the limit. */
  failed(): boolean {
    this.failures += 1;
    return this.failures >= this.limit;
  }
}
