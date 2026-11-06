import { readFileSync, writeFileSync } from "node:fs";
import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { encodeTx, frame, newTx, secp256k1Placeholder, signTx } from "@forshtat/hegota-support/tx";
import {
  EF_STAKING_REGISTRY,
  EF_USDC,
  admissionReport,
  arkivReader,
  buildLayout1,
  efDevnet,
  frameTxHash,
  getQuotes,
  sendToAltMempool,
  signFrameTx,
  simulateFrameTx,
  usdcTransferCall,
} from "@octane/sdk";
import { createPublicClient, createWalletClient, encodeFunctionData, erc20Abi, http, parseEther, parseGwei, parseUnits, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env, envHex, run, saveEnv } from "./lib/env.ts";

/** Tests a fee pull in a pre_verify frame. Results go to docs/evidence and the EF write-up. */
const LEGACY = { type: "legacy", gasPrice: parseGwei("0.002") } as const;
const FEE = parseUnits("0.05", 6);

await run(async () => {
  const transport = http(env("EF_RPC_URL"), { timeout: 20_000 });
  const client = createPublicClient({ chain: efDevnet, transport });
  const deployer = createWalletClient({ chain: efDevnet, transport, account: privateKeyToAccount(envHex("DEPLOYER_PRIVATE_KEY")) });
  const payerKey = envHex("PAYER_AGENT_PRIVATE_KEY");
  const payer = privateKeyToAccount(payerKey);
  const artifact = JSON.parse(
    readFileSync(new URL("../contracts/out/PreVerifyProbe.sol/PreVerifyProbe.json", import.meta.url), "utf8"),
  ) as { abi: Abi; bytecode: { object: Hex } };

  let probe = process.env.OCTANE_PREVERIFY_PROBE as Address | undefined;
  if (!probe || ((await client.getCode({ address: probe })) ?? "0x") === "0x") {
    const hash = await deployer.deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object,
      args: [EF_USDC, EF_STAKING_REGISTRY, FEE],
      gas: 20_000_000n,
      ...LEGACY,
    });
    const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success" || !receipt.contractAddress) throw new Error(`deploy failed: ${hash}`);
    probe = receipt.contractAddress;
    saveEnv("OCTANE_PREVERIFY_PROBE", probe);

    await client.waitForTransactionReceipt({
      hash: await deployer.sendTransaction({ to: probe, value: parseEther("0.05"), gas: 400_000n, ...LEGACY }),
    });
    await client.waitForTransactionReceipt({
      hash: await deployer.writeContract({ address: probe, abi: artifact.abi, functionName: "stake", value: parseEther("0.012"), gas: 400_000n, ...LEGACY }),
    });
  }
  console.log(`probe ${probe}`);

  const allowance = await client.readContract({ address: EF_USDC, abi: erc20Abi, functionName: "allowance", args: [payer.address, probe] });

  // The one-time approval goes through the normal market, so the payer still needs no ETH.
  if (allowance < FEE) {
    const market = {
      reader: arkivReader(env("ARKIV_ACCESS_KEY")),
      relay: envHex("OCTANE_RELAY"),
      factory: envHex("OCTANE_FACTORY"),
    };
    const best = (await getQuotes(market, "ef-devnet")).quotes[0];
    if (!best) throw new Error("no Path A quote on the board");
    const approval = await signFrameTx(
      buildLayout1({
        sender: payer.address,
        nonce: BigInt(await client.getTransactionCount({ address: payer.address })),
        quote: best.quote,
        quoteSig: best.sig,
        calls: [{ to: EF_USDC, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [probe, parseUnits("1", 6)] }) }],
        maxFeePerGas: parseGwei("2"),
      }),
      payerKey,
    );
    const approved = await sendToAltMempool(approval);
    const receipt = await client.waitForTransactionReceipt({ hash: approved, timeout: 60_000 });
    console.log(`approved the probe: ${receipt.status}`);
  }
  const nonce = BigInt(await client.getTransactionCount({ address: payer.address }));

  const tx = await signTx(
    profile,
    newTx({
      chainId: efDevnet.id,
      sender: payer.address,
      nonceSeq: nonce,
      fees: { maxFeePerGas: parseGwei("2"), maxPriorityFeePerGas: parseGwei("1") },
      signatures: [secp256k1Placeholder(profile)],
      frames: [
        frame(profile, "VERIFY", { scope: "EXECUTION", execution: 6_000n }),
        frame(profile, "DEFAULT", {
          target: probe,
          execution: 70_000n,
          state: 100_000n,
          data: encodeFunctionData({ abi: artifact.abi, functionName: "collect" }),
        }),
        frame(profile, "VERIFY", {
          scope: "PAYMENT",
          target: probe,
          execution: 15_000n,
          data: encodeFunctionData({ abi: artifact.abi, functionName: "pay" }),
        }),
        frame(profile, "SENDER", {
          target: EF_USDC,
          execution: 80_000n,
          state: 100_000n,
          data: usdcTransferCall(envHex("MERCHANT_ADDRESS"), 1n).data,
        }),
      ],
    }),
    payerKey,
  );
  const hash = frameTxHash(tx);
  console.log(`tx ${hash}`);

  let simulation: unknown;
  try {
    simulation = await simulateFrameTx(tx);
    const { erc7562Trace: trace, ...summary } = simulation as Record<string, unknown>;
    console.log(`simulation ${JSON.stringify(summary).slice(0, 500)}`);
    const pay = (trace as { frameIndex: number; root: unknown }[] | undefined)?.find((entry) => entry.frameIndex === 2);
    console.log(`pay frame ${JSON.stringify(pay?.root, (key, value) => (key === "usedOpcodes" || key === "contractSize" || key === "accessedSlots" || key === "extCodeAccessInfo" || key === "keccak" ? undefined : value)).slice(0, 900)}`);
  } catch (error) {
    simulation = String(error);
    console.log(`simulation failed: ${String(error).slice(0, 400)}`);
  }

  let outcome: string;
  try {
    outcome = `admitted ${await sendToAltMempool(tx)}`;
  } catch (error) {
    outcome = `rejected: ${error instanceof Error ? error.message : String(error)}`;
  }
  console.log(`alt mempool ${outcome}`);
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 90_000 }).catch(() => undefined);
  console.log(`receipt ${receipt ? `${receipt.status} gas ${receipt.gasUsed}` : "none"}`);
  writeFileSync(
    new URL("../docs/evidence/preverify-spike.json", import.meta.url),
    `${JSON.stringify({ hash, outcome, receipt: receipt?.status ?? null, report: await admissionReport(hash).catch(() => null), encoded: encodeTx(profile, tx).slice(0, 20) }, null, 2)}\n`,
  );
});
