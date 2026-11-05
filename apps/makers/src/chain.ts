import { whitechainSepolia } from "@octane/sdk";
import { createPublicClient, createWalletClient, fallback, http, type Account } from "viem";

/** Two RPCs, so one slow endpoint can't stop a maker. */
export function whitechainClients(rpcUrls: readonly string[], account: Account) {
  const transport = fallback(
    rpcUrls.map((url) => http(url, { timeout: 6_000, retryCount: 0 })),
    { retryCount: 1 },
  );
  return {
    client: createPublicClient({ chain: whitechainSepolia, transport }),
    wallet: createWalletClient({ chain: whitechainSepolia, transport, account }),
  };
}

export type WhitechainClients = ReturnType<typeof whitechainClients>;
