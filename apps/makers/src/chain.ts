import { whitechainSepolia } from "@octane/sdk";
import { createPublicClient, createWalletClient, http, type Account } from "viem";

export function whitechainClients(rpcUrl: string, account: Account) {
  const transport = http(rpcUrl, { timeout: 10_000, retryCount: 1 });
  return {
    client: createPublicClient({ chain: whitechainSepolia, transport }),
    wallet: createWalletClient({ chain: whitechainSepolia, transport, account }),
  };
}

export type WhitechainClients = ReturnType<typeof whitechainClients>;
