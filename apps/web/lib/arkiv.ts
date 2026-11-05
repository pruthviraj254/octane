import { arkivReader, type ArkivReader } from "@octane/sdk";
import { isAddressEqual, type Address } from "viem";

let reader: ArkivReader | undefined;

/** Reads go straight from the browser to Arkiv, with no Octane server in between. */
export function getReader(): ArkivReader {
  reader ??= arkivReader(process.env.NEXT_PUBLIC_ARKIV_ACCESS_KEY ?? "");
  return reader;
}

const relay = process.env.NEXT_PUBLIC_OCTANE_RELAY;

/** A fake maker could name its own contract, so only the deployed relay counts. */
export function isTrustedSettlement(settlement: Address): boolean {
  return Boolean(relay) && isAddressEqual(settlement, relay as Address);
}
