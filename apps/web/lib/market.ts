import { arkivReader, arkivReaderAt, whitechainSepolia, type MarketConfig } from "@octane/sdk";
import { createPublicClient, http, type Address } from "viem";

let market: MarketConfig | undefined;

/**
 * With a browser key, reads go straight to Arkiv. Without one they pass through this app's
 * read-only route, because the keyless public endpoint rate limits a live board within seconds.
 * The browser checks every quote's signature either way, so the route can't forge a price.
 */
export function getMarket(): MarketConfig {
  const browserKey = process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY;
  market ??= {
    reader: browserKey ? arkivReader(browserKey) : arkivReaderAt(`${window.location.origin}/api/arkiv`),
    relay: process.env.NEXT_PUBLIC_OCTANE_RELAY as Address,
    factory: process.env.NEXT_PUBLIC_OCTANE_FACTORY as Address,
  };
  return market;
}

export const whitechain = createPublicClient({ chain: whitechainSepolia, transport: http() });

export const MERCHANT = process.env.NEXT_PUBLIC_MERCHANT as Address;
export const INDEXER = process.env.NEXT_PUBLIC_INDEXER as Address;
