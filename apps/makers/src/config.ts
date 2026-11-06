import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";

/** Styles differ by how much margin they want and how they react to inventory. */
export interface MakerConfig {
  id: "cautious" | "aggressive" | "balancer";
  envPrefix: string;
  /** Margin on top of cost, in USDT base units. */
  spread: bigint;
  /** Adds up to one spread as WBT falls below target, so a thin maker quotes wider. */
  skewsInventory: boolean;
  targetWbt: bigint;
  /** Also quotes on the EF devnet through this maker's staked clone. */
  quotesPathA: boolean;
}

export const MAKERS: Record<MakerConfig["id"], MakerConfig> = {
  cautious: {
    id: "cautious",
    envPrefix: "MAKER_CAUTIOUS",
    spread: 30_000n,
    skewsInventory: false,
    targetWbt: 300_000_000_000_000_000n,
    quotesPathA: true,
  },
  aggressive: {
    id: "aggressive",
    envPrefix: "MAKER_AGGRESSIVE",
    spread: 5_000n,
    skewsInventory: false,
    targetWbt: 300_000_000_000_000_000n,
    quotesPathA: false,
  },
  balancer: {
    id: "balancer",
    envPrefix: "MAKER_BALANCER",
    spread: 15_000n,
    skewsInventory: true,
    targetWbt: 300_000_000_000_000_000n,
    quotesPathA: false,
  },
};

/** Hard limits that no LLM output can move. */
export const MIN_FEE = 65_000n; // 0.065 USDT, above cost at the base-fee floor
export const MAX_FEE = 500_000n; // 0.50 USDT
export const MIN_INVENTORY_WBT = 10_000_000_000_000_000n; // 0.01 WBT, about 13 payments
export const MAX_GAS = 200_000n;
/** Measured payments use about 156k gas; a first-time recipient costs the most. */
export const GAS_ESTIMATE = 165_000n;
export const QUOTE_VALIDITY_SECONDS = 105n;
export const REFRESH_MS = 10_000;

/** The EF devnet has no ETH/USDC market to price from, so this is a fixed, disclosed fee. */
export const PATH_A_FEE = 50_000n; // 0.05 USDC
/** Layout 1 with up to 60 user calls, the most that fit in a frame transaction. */
export const PATH_A_MAX_GAS = 12_000_000n;
/** Below this the clone can't back its quote, so the maker stops offering it. */
export const MIN_CLONE_BALANCE = 30_000_000_000_000_000n; // 0.03 ETH

/**
 * Settings come from a file read into a private map, not process.env, so private keys are
 * never inherited by the LLM child process.
 */
const envFile = new URL("../../../.env", import.meta.url);
const settings: Record<string, string | undefined> = existsSync(envFile)
  ? parseEnv(readFileSync(envFile, "utf8"))
  : {};

export function setting(name: string): string {
  const value = process.env[name] ?? settings[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function optionalSetting(name: string): string | undefined {
  return process.env[name] ?? settings[name] ?? undefined;
}

export function hexSetting(name: string): `0x${string}` {
  const value = setting(name);
  if (!value.startsWith("0x")) throw new Error(`${name} must start with 0x`);
  return value as `0x${string}`;
}
