import { efDevnet, EF_EXPIRY_VERIFIER, EF_STAKING_REGISTRY, EF_USDC, explorerTx } from "@octane/sdk";
import { createWalletClient, erc20Abi, formatEther, formatUnits, parseEther, parseUnits, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { artifact, confirmOnDevnet, devnetClients, ensureStakedClone, fundOnDevnet, LEGACY, publishedKey } from "./lib/devnet.ts";
import { env, envHex, run, saveEnv } from "./lib/env.ts";

/**
 * Brings the EF devnet to a working state and can be rerun at any time. Each step checks the
 * chain first, so after a devnet reset it rebuilds exactly what's missing.
 */
const DEPLOY_GAS = 20_000_000n; // Contract creation costs state gas here; 6M runs out for the paymaster.
const CALL_GAS = 400_000n;
const PAYER_USDC = parseUnits("50", 6);
const DEPLOYER_FUNDING = parseEther("0.2"); // Includes what the pre_verify spike stakes and funds.
const MAKER_FUNDING = parseEther("0.25");
const USDC_DEPLOYER = "0xa071C572d39ef9C2f6e09450570bC36A85a5CDc0";

await run(async () => {
  const { client, transport } = devnetClients();
  const makerAccount = privateKeyToAccount(envHex("MAKER_CAUTIOUS_PRIVATE_KEY"));
  const deployer = createWalletClient({ chain: efDevnet, transport, account: privateKeyToAccount(envHex("DEPLOYER_PRIVATE_KEY")) });
  const payer = envHex("PAYER_AGENT_ADDRESS");

  await fundOnDevnet("deployer", deployer.account.address, DEPLOYER_FUNDING);
  await fundOnDevnet("Maker Cautious", makerAccount.address, MAKER_FUNDING);

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
    implementation = (await confirmOnDevnet("paymaster implementation", hash)).contractAddress ?? undefined;
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
    factory = (await confirmOnDevnet("factory", hash)).contractAddress ?? undefined;
    if (!factory) throw new Error("no contract address");
    saveEnv("OCTANE_FACTORY", factory);
  }
  console.log(`factory ${factory}`);

  saveEnv("OCTANE_CLONE_CAUTIOUS", await ensureStakedClone("Maker Cautious", makerAccount, factory as Address));

  const balance = () => client.readContract({ address: EF_USDC, abi: erc20Abi, functionName: "balanceOf", args: [payer] });
  if ((await balance()) < PAYER_USDC / 2n) {
    const shared = createWalletClient({ chain: efDevnet, transport, account: privateKeyToAccount(await publishedKey(USDC_DEPLOYER)) });
    const hash = await shared.writeContract({
      address: EF_USDC,
      abi: erc20Abi,
      functionName: "transfer",
      args: [payer, PAYER_USDC],
      gas: CALL_GAS,
      ...LEGACY,
    });
    await confirmOnDevnet("USDC to payer", hash);
  }
  console.log(`payer ${formatUnits(await balance(), 6)} USDC, ${formatEther(await client.getBalance({ address: payer }))} ETH`);
  console.log(`explorer ${explorerTx(efDevnet.id, "0x")}`.replace(/tx\/0x$/, ""));
});
