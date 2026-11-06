import { EF_USDC, WHITECHAIN_USDT, efDevnet, explorerTx, whitechainSepolia } from "@octane/sdk";
import { createPublicClient, createWalletClient, erc20Abi, formatUnits, http, isAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { LEGACY } from "./lib/devnet.ts";
import { env, envHex, run } from "./lib/env.ts";

const CALL_GAS = 400_000n;

/**
 * Sends a maker's stablecoin earnings to its owner. Usage: withdraw-maker <name> <to>
 * Run it with the maker offline, because a running maker sends from the same wallet.
 */
await run(async () => {
  const [name, to] = process.argv.slice(2);
  if (!name || !to || !isAddress(to)) throw new Error("usage: withdraw-maker <name> <to>");
  const account = privateKeyToAccount(envHex(`MAKER_${name.toUpperCase()}_PRIVATE_KEY`));
  const recipient: Address = to;

  const whitechainTransport = http(env("WHITECHAIN_RPC_URL"), { timeout: 20_000 });
  const whitechain = createPublicClient({ chain: whitechainSepolia, transport: whitechainTransport });
  const usdt = await whitechain.readContract({ address: WHITECHAIN_USDT, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  if (usdt > 0n) {
    const wallet = createWalletClient({ chain: whitechainSepolia, transport: whitechainTransport, account });
    const hash = await wallet.writeContract({ address: WHITECHAIN_USDT, abi: erc20Abi, functionName: "transfer", args: [recipient, usdt] });
    const receipt = await whitechain.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`USDT transfer failed: ${hash}`);
    console.log(`Sent ${formatUnits(usdt, 6)} USDT: ${explorerTx(whitechainSepolia.id, hash)}`);
  }

  const devnetTransport = http(env("EF_RPC_URL"), { timeout: 20_000 });
  const devnet = createPublicClient({ chain: efDevnet, transport: devnetTransport });
  const usdc = await devnet.readContract({ address: EF_USDC, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
  if (usdc > 0n) {
    const wallet = createWalletClient({ chain: efDevnet, transport: devnetTransport, account });
    const hash = await wallet.writeContract({ address: EF_USDC, abi: erc20Abi, functionName: "transfer", args: [recipient, usdc], gas: CALL_GAS, ...LEGACY });
    const receipt = await devnet.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`USDC transfer failed: ${hash}`);
    console.log(`Sent ${formatUnits(usdc, 6)} USDC: ${explorerTx(efDevnet.id, hash)}`);
  }
  if (usdt === 0n && usdc === 0n) console.log("Nothing to withdraw yet.");
});
