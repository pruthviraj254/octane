import { formatUnits } from "viem";

/** Token amounts in base units, with at least two decimals and no rounding. */
export function money(value: bigint, decimals = 6): string {
  const [whole = "0", fraction = ""] = formatUnits(value, decimals).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function timeAgo(seconds: number): string {
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - seconds);
  if (elapsed < 60) return `${elapsed}s ago`;
  if (elapsed < 3_600) return `${Math.floor(elapsed / 60)}m ago`;
  return `${Math.floor(elapsed / 3_600)}h ago`;
}
