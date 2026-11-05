import { getAddress, isAddress, type Address } from "viem";

export interface Identity {
  address: Address;
  /** What to show people. An ENS name can replace this later without touching callers. */
  label: string;
}

/**
 * Every maker and agent shown or checked in Octane goes through here.
 * Today it only understands addresses; names plug in here later.
 */
export async function resolveIdentity(addressOrName: string): Promise<Identity> {
  if (!isAddress(addressOrName)) {
    throw new Error(`can't resolve "${addressOrName}": only addresses are supported so far`);
  }
  const address = getAddress(addressOrName);
  return { address, label: `${address.slice(0, 6)}…${address.slice(-4)}` };
}
