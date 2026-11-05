import { arkivReader, whitechainSepolia, type MarketConfig } from "@octane/sdk";
import { createPublicClient, http, type Address } from "viem";

let market: MarketConfig | undefined;

/** Reads go straight from the browser to Arkiv, with no Octane server in between. */
export function getMarket(): MarketConfig {
  market ??= {
    reader: arkivReader(process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY ?? ""),
    relay: process.env.NEXT_PUBLIC_OCTANE_RELAY as Address,
    factory: process.env.NEXT_PUBLIC_OCTANE_FACTORY as Address,
  };
  return market;
}

export const whitechain = createPublicClient({ chain: whitechainSepolia, transport: http() });

export const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT as Address;
export const INDEXER = process.env.NEXT_PUBLIC_INDEXER as Address;
