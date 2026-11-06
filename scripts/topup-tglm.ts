import { rabdi } from "@arkiv-network/sdk/chains";
import { ARKIV_CHAIN_ID, explorerTx } from "@octane/sdk";
import { createPublicClient, createWalletClient, formatEther, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env, envHex, run } from "./lib/env.ts";

/** Sends tGLM from the payer agent to a maker running low. Usage: topup-tglm <address> <amount> */
await run(async () => {
  const [to, amount] = process.argv.slice(2);
  if (!to || !isAddress(to) || !amount) throw new Error("usage: topup-tglm <address> <amount>");

  const chain = rabdi({ accessKey: env("ARKIV_ACCESS_KEY") });
  const account = privateKeyToAccount(envHex("PAYER_AGENT_PRIVATE_KEY"));
  const client = createPublicClient({ chain, transport: http() });
  const wallet = createWalletClient({ chain, transport: http(), account });

  const hash = await wallet.sendTransaction({ to, value: parseEther(amount) });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`tGLM transfer failed: ${hash}`);

  console.log(`Sent ${amount} tGLM: ${explorerTx(ARKIV_CHAIN_ID, hash)}`);
  console.log(`Maker now has ${formatEther(await client.getBalance({ address: to }))} tGLM`);
  console.log(`Payer agent has ${formatEther(await client.getBalance({ address: account.address }))} tGLM`);
});
