import { EF_STAKING_REGISTRY, efDevnet } from "@octane/sdk";
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, formatEther, http, parseEther, parseGwei, type Abi, type Address, type Hash, type Hex, type LocalAccount } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env } from "./env.ts";

export const LEGACY = { type: "legacy", gasPrice: parseGwei("0.002") } as const;
/** A transfer to a brand-new account costs extra state gas on this network. */
export const NEW_ACCOUNT_GAS = 250_000n;
const CALL_GAS = 400_000n;
export const CLONE_FUNDING = parseEther("0.1");
const STAKE = parseEther("0.012");
const MAX_GAS_PRICE = parseGwei("3");

/** EF publishes these keys for the devnet. They're read at runtime and never saved. */
export const GENESIS: Address = "0x5544596212F91984C986A919C8026DF0576816f9";
const PUBLISHED_KEYS_URL =
  "https://raw.githubusercontent.com/forshtat/mempool-workshop-sidecar/HEAD/deploy/devnet/devnet-readme.md";

export async function publishedKey(address: Address): Promise<Hex> {
  const response = await fetch(PUBLISHED_KEYS_URL);
  if (!response.ok) throw new Error(`couldn't read the sidecar repo: ${response.status}`);
  const keys = (await response.text()).match(/0x[0-9a-fA-F]{64}/g) ?? [];
  const key = keys.find((candidate) => privateKeyToAccount(candidate as Hex).address === address);
  if (!key) throw new Error(`the key for ${address} isn't in the sidecar readme`);
  return key as Hex;
}

export function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const url = new URL(`../../contracts/out/${name}.sol/${name}.json`, import.meta.url);
  const json = JSON.parse(readFileSync(url, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: json.abi, bytecode: json.bytecode.object };
}

export function devnetClients() {
  const transport = http(env("EF_RPC_URL"), { timeout: 20_000 });
  return { client: createPublicClient({ chain: efDevnet, transport }), transport };
}

export async function confirmOnDevnet(label: string, hash: Hash) {
  const receipt = await devnetClients().client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  console.log(`${label}: ${hash} (gas ${receipt.gasUsed})`);
  return receipt;
}

/** Tops a wallet up from EF's genesis account. A reset leaves every wallet empty. */
export async function fundOnDevnet(label: string, to: Address, amount: bigint): Promise<void> {
  const { client, transport } = devnetClients();
  if ((await client.getBalance({ address: to })) >= amount / 2n) return;
  const shared = createWalletClient({ chain: efDevnet, transport, account: privateKeyToAccount(await publishedKey(GENESIS)) });
  await confirmOnDevnet(`fund ${label}`, await shared.sendTransaction({ to, value: amount, gas: NEW_ACCOUNT_GAS, ...LEGACY }));
}

/** Gives a maker its own paymaster: a clone, funded to pay gas and staked so it may read storage. */
export async function ensureStakedClone(label: string, makerAccount: LocalAccount, factory: Address): Promise<Address> {
  const { client, transport } = devnetClients();
  const maker = createWalletClient({ chain: efDevnet, transport, account: makerAccount });
  const factoryArtifact = artifact("OctanePaymasterFactory");
  const paymaster = artifact("OctanePaymaster");

  const readClone = () =>
    client.readContract({ address: factory, abi: factoryArtifact.abi, functionName: "cloneOf", args: [maker.account.address] }) as Promise<Address>;

  let clone = await readClone();
  if (BigInt(clone) === 0n) {
    const hash = await maker.writeContract({
      address: factory,
      abi: factoryArtifact.abi,
      functionName: "createClone",
      args: [MAX_GAS_PRICE],
      gas: 1_000_000n,
      ...LEGACY,
    });
    await confirmOnDevnet(`clone for ${label}`, hash);
    clone = await readClone();
  }
  console.log(`clone ${clone}`);

  if ((await client.getBalance({ address: clone })) < CLONE_FUNDING / 2n) {
    const hash = await maker.sendTransaction({ to: clone, value: CLONE_FUNDING, gas: CALL_GAS, ...LEGACY });
    await confirmOnDevnet("fund clone", hash);
  }
  console.log(`clone balance ${formatEther(await client.getBalance({ address: clone }))} ETH`);

  const depositInfo = [
    {
      type: "function",
      name: "getDepositInfo",
      stateMutability: "view",
      inputs: [{ name: "account", type: "address" }],
      outputs: [
        { name: "stake", type: "uint256" },
        { name: "unstakeDelaySec", type: "uint32" },
        { name: "withdrawTime", type: "uint64" },
      ],
    },
  ] as const;
  const readStake = () =>
    client.readContract({ address: EF_STAKING_REGISTRY, abi: depositInfo, functionName: "getDepositInfo", args: [clone] });

  if ((await readStake())[0] < STAKE) {
    const hash = await maker.writeContract({
      address: clone,
      abi: paymaster.abi,
      functionName: "stake",
      value: STAKE,
      gas: CALL_GAS,
      ...LEGACY,
    });
    await confirmOnDevnet("stake clone", hash);
  }
  const [stake, delay] = await readStake();
  console.log(`staked ${formatEther(stake)} ETH, delay ${delay}s`);
  return clone;
}
