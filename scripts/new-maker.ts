import { rabdi } from "@arkiv-network/sdk/chains";
import { ARKIV_CHAIN_ID, explorerTx, whitechainSepolia } from "@octane/sdk";
import { createPublicClient, createWalletClient, formatEther, formatUnits, http, parseEther, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { devnetClients, ensureStakedClone, fundOnDevnet } from "./lib/devnet.ts";
import { env, envHex, run, saveEnv } from "./lib/env.ts";

/**
 * Sets up a maker under any name, with no change to our code, then reports whether its wallet
 * can run. Usage: new-maker <name> [--spread <USDT base units>] [--fund] [--path-a]
 *
 * Keeps a wallet already in .env, so someone with spare WBT can join with their own. --fund is
 * for testing: it lends just enough from our own testnet wallets. --path-a gives the maker its
 * own staked paymaster on the EF devnet, for someone with spare ETH.
 */
const MIN_WBT = parseEther("0.01"); // Below this a maker leaves the board.
const MIN_TGLM = parseEther("0.01");
const LOAN_WBT = parseEther("0.02"); // About 13 payments above the minimum.
const LOAN_TGLM = parseEther("0.05"); // About an hour and a half of quotes.
const MIN_ETH = parseEther("0.13"); // The clone's float, its stake, and gas to set them up.
const LOAN_ETH = parseEther("0.2");
const LAST_BUILT_IN_PORT = 8803;
const DEFAULT_SPREAD = 10_000n;

function nextPort(): number {
  const ports = Object.entries(process.env)
    .filter(([name]) => /^MAKER_.+_ENDPOINT$/.test(name))
    .map(([, value]) => Number(new URL(value ?? "http://127.0.0.1:0").port));
  return Math.max(LAST_BUILT_IN_PORT, ...ports) + 1;
}

function line(label: string, held: bigint, needed: bigint): void {
  console.log(`${held >= needed ? "ready  " : "missing"}  ${label}: ${formatEther(held)}, needs ${formatEther(needed)}`);
}

await run(async () => {
  const [name, ...flags] = process.argv.slice(2);
  if (!name || !/^[a-z][a-z0-9]{1,15}$/.test(name)) {
    throw new Error("usage: new-maker <name> [--spread <USDT base units>] [--fund] [--path-a]. Names are lowercase letters and digits.");
  }
  const spreadFlag = flags.indexOf("--spread");
  const spread = spreadFlag >= 0 ? flags[spreadFlag + 1] : undefined;
  if (spreadFlag >= 0 && !/^\d+$/.test(spread ?? "")) throw new Error("--spread takes USDT base units, for example 5000 for 0.005 USDT");

  const prefix = `MAKER_${name.toUpperCase()}`;
  if (!process.env[`${prefix}_PRIVATE_KEY`]) {
    saveEnv(`${prefix}_PRIVATE_KEY`, generatePrivateKey());
    console.log("Created a new wallet. Its key is in .env and is never printed.");
  } else {
    console.log("Using the wallet already in .env.");
  }
  const address: Address = privateKeyToAccount(envHex(`${prefix}_PRIVATE_KEY`)).address;
  saveEnv(`${prefix}_ADDRESS`, address);
  if (!process.env[`${prefix}_ENDPOINT`]) saveEnv(`${prefix}_ENDPOINT`, `http://127.0.0.1:${nextPort()}`);
  if (spread) saveEnv(`${prefix}_SPREAD`, spread);

  console.log(`\nMaker   ${name}`);
  console.log(`Wallet  ${address}`);
  console.log(`Relayer ${env(`${prefix}_ENDPOINT`)}`);
  console.log(`Margin  ${formatUnits(BigInt(process.env[`${prefix}_SPREAD`] ?? DEFAULT_SPREAD), 6)} USDT on top of gas\n`);

  const whitechainTransport = http(env("WHITECHAIN_RPC_URL"), { timeout: 20_000 });
  const whitechain = createPublicClient({ chain: whitechainSepolia, transport: whitechainTransport });
  const arkivChain = rabdi({ accessKey: env("ARKIV_ACCESS_KEY") });
  const arkiv = createPublicClient({ chain: arkivChain, transport: http() });
  if ((await arkiv.getChainId()) !== ARKIV_CHAIN_ID) throw new Error("not Rabdi");

  let wbt = await whitechain.getBalance({ address });
  let tglm = await arkiv.getBalance({ address });

  if (flags.includes("--fund")) {
    if (wbt < MIN_WBT) {
      const account = privateKeyToAccount(envHex("DEPLOYER_PRIVATE_KEY"));
      const wallet = createWalletClient({ chain: whitechainSepolia, transport: whitechainTransport, account });
      const hash = await wallet.sendTransaction({ to: address, value: LOAN_WBT });
      const receipt = await whitechain.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`WBT transfer failed: ${hash}`);
      console.log(`Lent ${formatEther(LOAN_WBT)} WBT from the deployer: ${explorerTx(whitechainSepolia.id, hash)}`);
      wbt = await whitechain.getBalance({ address });
    }
    if (tglm < MIN_TGLM) {
      // The agent's wallet is idle. A running maker's wallet could clash with its own refresh.
      const account = privateKeyToAccount(envHex("PAYER_AGENT_PRIVATE_KEY"));
      const wallet = createWalletClient({ chain: arkivChain, transport: http(), account });
      const hash = await wallet.sendTransaction({ to: address, value: LOAN_TGLM });
      const receipt = await arkiv.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error(`tGLM transfer failed: ${hash}`);
      console.log(`Lent ${formatEther(LOAN_TGLM)} tGLM from the payer agent: ${explorerTx(ARKIV_CHAIN_ID, hash)}`);
      tglm = await arkiv.getBalance({ address });
    }
    console.log("");
  }

  if (flags.includes("--path-a")) {
    const makerAccount = privateKeyToAccount(envHex(`${prefix}_PRIVATE_KEY`));
    if (flags.includes("--fund")) await fundOnDevnet(`Maker ${name}`, address, LOAN_ETH);
    const eth = await devnetClients().client.getBalance({ address });
    const cloneName = `OCTANE_CLONE_${name.toUpperCase()}`;
    if (eth >= MIN_ETH || process.env[cloneName]) {
      saveEnv(cloneName, await ensureStakedClone(`Maker ${name}`, makerAccount, envHex("OCTANE_FACTORY")));
      console.log(`Paymaster ${process.env[cloneName]}`);
    } else {
      line("ETH on the EF devnet, backs the paymaster", eth, MIN_ETH);
    }
  }

  line("WBT on Whitechain, pays gas", wbt, MIN_WBT);
  line("tGLM on Arkiv, keeps the quote live", tglm, MIN_TGLM);

  if (wbt >= MIN_WBT && tglm >= MIN_TGLM) {
    console.log(`\nReady. Join the market with: pnpm maker ${name}`);
    return;
  }
  console.log(`\nNot ready. Send funds to ${address}:`);
  if (wbt < MIN_WBT) console.log("  WBT:  https://faucet.testnet.whitechain.io");
  if (tglm < MIN_TGLM) console.log("  tGLM: https://hub.arkiv.network/faucet");
  console.log(`To test with our own testnet wallets instead: pnpm new-maker ${name} --fund`);
});
