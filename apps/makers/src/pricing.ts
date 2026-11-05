import { GAS_ESTIMATE, MAX_FEE, MIN_FEE, type MakerConfig } from "./config.ts";

export interface Market {
  /** Wei per gas, base fee plus tip. */
  gasPrice: bigint;
  /** Wei, the L1 data fee for one relay transaction. */
  l1Fee: bigint;
  /** USDT base units per 1 WBT. */
  wbtPrice: bigint;
  /** The maker's own WBT, in wei. */
  wbtBalance: bigint;
}

const WEI_PER_WBT = 10n ** 18n;
const BASIS_POINTS = 10_000n;

function ceilDiv(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}

/** What one relay costs the maker, in USDT base units. */
export function gasCost(market: Market, gas = GAS_ESTIMATE): bigint {
  return ceilDiv((gas * market.gasPrice + market.l1Fee) * market.wbtPrice, WEI_PER_WBT);
}

function inventorySkew(config: MakerConfig, market: Market): bigint {
  if (!config.skewsInventory || market.wbtBalance >= config.targetWbt) return 0n;
  return ceilDiv(config.spread * (config.targetWbt - market.wbtBalance), config.targetWbt);
}

/**
 * fee = gas cost × (1 + buffer) + spread + inventory skew, clamped to the hard limits.
 * The LLM picks only the buffer, so it can never set a price outside MIN_FEE and MAX_FEE.
 */
export function priceFee(config: MakerConfig, market: Market, bufferBps: bigint): bigint {
  const buffered = ceilDiv(gasCost(market) * (BASIS_POINTS + bufferBps), BASIS_POINTS);
  const fee = buffered + config.spread + inventorySkew(config, market);
  if (fee < MIN_FEE) return MIN_FEE;
  if (fee > MAX_FEE) return MAX_FEE;
  return fee;
}

/** The pool's price of WWBT in USDT base units, from its sqrt price. */
export function wbtPriceFromSqrt(sqrtPriceX96: bigint): bigint {
  return (sqrtPriceX96 * sqrtPriceX96 * WEI_PER_WBT) >> 192n;
}
