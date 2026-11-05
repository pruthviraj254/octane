import { defineChain, type Address } from "viem";
import { whitechainSepolia } from "viem/chains";

export { whitechainSepolia };

export const WHITECHAIN_USDT: Address = "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7";
export const WHITECHAIN_EXPLORER = "https://explorer.testnet.whitechain.io";

export const efDevnet = defineChain({
  id: 1337,
  name: "EF alt-mempool devnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://altmempool.forshtat.com"] } },
  blockExplorers: { default: { name: "Explorer", url: "https://explorer.altmempool.wtf" } },
});

/** Frame transactions go here, not to the execution RPC. */
export const EF_MEMPOOL_RPC = "https://altmempool.forshtat.com/rpc";
export const EF_USDC: Address = "0xEFe0D421fD473564c9C9b0cDCeB194cF476D6AF5";
export const EF_STAKING_REGISTRY: Address = "0xd51c04d7a0b01124e84de152f4e56d9eecb22d2f";
/** The address in the EIP has no code on the devnet; this is the one ethrex uses. */
export const EF_EXPIRY_VERIFIER: Address = "0x0000000000000000000000000000000000008141";

export const ARKIV_CHAIN_ID = 7794095;

export function explorerTx(chainId: number, hash: string): string {
  if (chainId === whitechainSepolia.id) return `${WHITECHAIN_EXPLORER}/tx/${hash}`;
  if (chainId === ARKIV_CHAIN_ID) return `https://rabdi.explorer.arkiv.network/tx/${hash}`;
  if (chainId === efDevnet.id) return `https://explorer.altmempool.wtf/tx/${hash}`;
  throw new Error(`no explorer known for chain ${chainId}`);
}
