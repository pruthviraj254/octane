import { createPublicClient, createWalletClient, formatEther, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { rabdi } from "@arkiv-network/sdk/chains";
import { ARKIV_CHAIN_ID, explorerTx } from "@octane/sdk";
import { env, envHex, run } from "./lib/env.ts";

/** Tops up the other Arkiv writers from Maker Cautious. Skips any wallet that already has tGLM. */
const AMOUNTS: Record<string, bigint> = {
  MAKER_AGGRESSIVE: parseEther("2"),
  MAKER_BALANCER: parseEther("2"),
  INDEXER: parseEther("2"),
  // Only for auction requests. An agent paying from the board never touches Arkiv's gas token.
  PAYER_AGENT: parseEther("0.2"),
};

await run(async () => {
  const chain = rabdi({ accessKey: env("ARKIV_ACCESS_KEY") });
  const source = privateKeyToAccount(envHex("MAKER_CAUTIOUS_PRIVATE_KEY"));
  const client = createPublicClient({ chain, transport: http() });
  const wallet = createWalletClient({ chain, transport: http(), account: source });

  if ((await client.getChainId()) !== ARKIV_CHAIN_ID) throw new Error("not Rabdi");

  for (const [name, amount] of Object.entries(AMOUNTS)) {
    const to = envHex(`${name}_ADDRESS`);
    if ((await client.getBalance({ address: to })) > 0n) {
      console.log(`${name}: already funded`);
      continue;
    }
    const hash = await wallet.sendTransaction({ to, value: amount });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`transfer to ${name} failed: ${hash}`);
    console.log(`${name}: ${formatEther(await client.getBalance({ address: to }))} tGLM ${explorerTx(ARKIV_CHAIN_ID, hash)}`);
  }
  console.log(`Maker Cautious: ${formatEther(await client.getBalance({ address: source.address }))} tGLM`);
});
