import { createPublicClient, createWalletClient } from "@arkiv-network/sdk";
import { rabdi } from "@arkiv-network/sdk/chains";
import { http, type Account } from "viem";

const transport = () => http(undefined, { timeout: 15_000, retryCount: 1 });

export function arkivReader(accessKey: string) {
  return createPublicClient({ chain: rabdi({ accessKey }), transport: transport(), pollingInterval: 1_000 });
}

export function arkivWallet(accessKey: string, account: Account) {
  return createWalletClient({ chain: rabdi({ accessKey }), transport: transport(), account, pollingInterval: 1_000 });
}

export type ArkivReader = ReturnType<typeof arkivReader>;
export type ArkivWallet = ReturnType<typeof arkivWallet>;

/** The access key sits in the RPC URL, so transport errors repeat it. Never log them raw. */
export function redactAccessKey(text: string): string {
  return text.replace(/ark_live_[A-Za-z0-9_-]+/g, "[arkiv-key]");
}
