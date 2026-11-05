import { readFileSync } from "node:fs";
import { efDevnet, EF_EXPIRY_VERIFIER, EF_STAKING_REGISTRY, EF_USDC, explorerTx } from "@octane/sdk";
import { createPublicClient, createWalletClient, erc20Abi, formatEther, formatUnits, http, parseEther, parseGwei, parseUnits, type Abi, type Address, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env, envHex, run, saveEnv } from "./lib/env.ts";

/**
 * Brings the EF devnet to a working state and can be rerun at any time. Each step checks the
 * chain first, so after a devnet reset it rebuilds exactly what's missing.
 */
const LEGACY = { type: "legacy", gasPrice: parseGwei("0.002") } as const;
const DEPLOY_GAS = 20_000_000n; // Contract creation costs state gas here; 6M runs out for the paymaster.
const CALL_GAS = 400_000n;
const CLONE_FUNDING = parseEther("0.1");
const STAKE = parseEther("0.012");
const MAX_GAS_PRICE = parseGwei("3");
const PAYER_USDC = parseUnits("50", 6);

/** EF publishes this key for the devnet. It's read at runtime and never saved. */
const USDC_DEPLOYER = "0xa071C572d39ef9C2f6e09450570bC36A85a5CDc0";
const PUBLISHED_KEYS_URL =
  "https://raw.githubusercontent.com/forshtat/mempool-workshop-sidecar/HEAD/deploy/devnet/devnet-readme.md";

function artifact(name: string): { abi: Abi; bytecode: Hex } {
  const url = new URL(`../contracts/out/${name}.sol/${name}.json`, import.meta.url);
  const json = JSON.parse(readFileSync(url, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: json.abi, bytecode: json.bytecode.object };
}

async function publishedUsdcDeployerKey(): Promise<Hex> {
  const response = await fetch(PUBLISHED_KEYS_URL);
  if (!response.ok) throw new Error(`couldn't read the sidecar repo: ${response.status}`);
  const keys = (await response.text()).match(/0x[0-9a-fA-F]{64}/g) ?? [];
  const key = keys.find((candidate) => privateKeyToAccount(candidate as Hex).address === USDC_DEPLOYER);
  if (!key) throw new Error("the USDC deployer key isn't in the sidecar readme");
  return key as Hex;
}

await run(async () => {
  const transport = http(env("EF_RPC_URL"), { timeout: 20_000 });
  const client = createPublicClient({ chain: efDevnet, transport });
  const deployer = createWalletClient({ chain: efDevnet, transport, account: privateKeyToAccount(envHex("DEPLOYER_PRIVATE_KEY")) });
  const maker = createWalletClient({ chain: efDevnet, transport, account: privateKeyToAccount(envHex("MAKER_CAUTIOUS_PRIVATE_KEY")) });
  const payer = envHex("PAYER_AGENT_ADDRESS");

  const confirm = async (label: string, hash: Hash) => {
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
    console.log(`${label}: ${hash} (gas ${receipt.gasUsed})`);
    return receipt;
  };

  const hasCode = async (address: string | undefined) =>
    Boolean(address) && ((await client.getCode({ address: address as Address })) ?? "0x") !== "0x";

  const paymaster = artifact("OctanePaymaster");
  let implementation = process.env.OCTANE_PAYMASTER;
  if (!(await hasCode(implementation))) {
    const hash = await deployer.deployContract({
      abi: paymaster.abi,
      bytecode: paymaster.bytecode,
      args: [EF_USDC, EF_STAKING_REGISTRY, EF_EXPIRY_VERIFIER],
      gas: DEPLOY_GAS,
      ...LEGACY,
    });
    implementation = (await confirm("paymaster implementation", hash)).contractAddress ?? undefined;
    if (!implementation) throw new Error("no contract address");
    saveEnv("OCTANE_PAYMASTER", implementation);
  }
  console.log(`implementation ${implementation}`);

  const factoryArtifact = artifact("OctanePaymasterFactory");
  let factory = process.env.OCTANE_FACTORY;
  if (!(await hasCode(factory))) {
    const hash = await deployer.deployContract({
      abi: factoryArtifact.abi,
      bytecode: factoryArtifact.bytecode,
      args: [implementation],
      gas: DEPLOY_GAS,
      ...LEGACY,
    });
    factory = (await confirm("factory", hash)).contractAddress ?? undefined;
    if (!factory) throw new Error("no contract address");
    saveEnv("OCTANE_FACTORY", factory);
  }
  console.log(`factory ${factory}`);
  const factoryAddress = factory as Address;

  const readClone = () =>
    client.readContract({
      address: factoryAddress,
      abi: factoryArtifact.abi,
      functionName: "cloneOf",
      args: [maker.account.address],
    }) as Promise<Address>;

  let clone = await readClone();
  if (BigInt(clone) === 0n) {
    const hash = await maker.writeContract({
      address: factoryAddress,
      abi: factoryArtifact.abi,
      functionName: "createClone",
      args: [MAX_GAS_PRICE],
      gas: 1_000_000n,
      ...LEGACY,
    });
    await confirm("clone for Maker Cautious", hash);
    clone = await readClone();
  }
  saveEnv("OCTANE_CLONE_CAUTIOUS", clone);
  console.log(`clone ${clone}`);

  if ((await client.getBalance({ address: clone })) < CLONE_FUNDING / 2n) {
    const hash = await maker.sendTransaction({ to: clone, value: CLONE_FUNDING, gas: CALL_GAS, ...LEGACY });
    await confirm("fund clone", hash);
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
    await confirm("stake clone", hash);
  }
  const [stake, delay, withdrawTime] = await readStake();
  console.log(`staked ${formatEther(stake)} ETH, delay ${delay}s, withdrawTime ${withdrawTime}`);

  const balance = () => client.readContract({ address: EF_USDC, abi: erc20Abi, functionName: "balanceOf", args: [payer] });
  if ((await balance()) < PAYER_USDC / 2n) {
    const shared = createWalletClient({ chain: efDevnet, transport, account: privateKeyToAccount(await publishedUsdcDeployerKey()) });
    const hash = await shared.writeContract({
      address: EF_USDC,
      abi: erc20Abi,
      functionName: "transfer",
      args: [payer, PAYER_USDC],
      gas: CALL_GAS,
      ...LEGACY,
    });
    await confirm("USDC to payer", hash);
  }
  console.log(`payer ${formatUnits(await balance(), 6)} USDC, ${formatEther(await client.getBalance({ address: payer }))} ETH`);
  console.log(`explorer ${explorerTx(efDevnet.id, "0x")}`.replace(/tx\/0x$/, ""));
});
