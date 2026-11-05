import { writeFileSync } from "node:fs";
import {
  EF_USDC,
  admissionReport,
  buildLayout1,
  efDevnet,
  explorerTx,
  frameTxHash,
  sendToAltMempool,
  sendToCanonicalMempool,
  signFrameTx,
  signQuote,
  simulateFrameTx,
  usdcTransferCall,
  type Quote,
} from "@octane/sdk";
import { createPublicClient, erc20Abi, formatUnits, http, parseGwei, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env, envHex, run } from "./lib/env.ts";

const mode = process.argv[2] ?? "simulate";
const outDir = new URL("../docs/evidence/", import.meta.url);

/** Builds one sponsored Layout 1 transaction. `simulate` sends nothing; `send` does both paths. */
await run(async () => {
  const client = createPublicClient({ chain: efDevnet, transport: http(env("EF_RPC_URL"), { timeout: 20_000 }) });
  const makerAccount = privateKeyToAccount(envHex("MAKER_CAUTIOUS_PRIVATE_KEY"));
  const payerKey = envHex("PAYER_AGENT_PRIVATE_KEY");
  const payer = privateKeyToAccount(payerKey);
  const merchant = envHex("MERCHANT_ADDRESS");
  const clone = envHex("OCTANE_CLONE_CAUTIOUS");

  const block = await client.getBlock();
  const now = block.timestamp;
  const quote: Quote = {
    maker: makerAccount.address,
    chainId: BigInt(efDevnet.id),
    settlement: clone,
    token: EF_USDC,
    maxGas: 700_000n,
    fee: parseUnits("0.05", 6),
    validUntil: now + 105n,
    nonce: now,
  };
  const quoteSig = await signQuote(makerAccount, quote);
  const nonce = BigInt(await client.getTransactionCount({ address: payer.address }));

  const unsigned = buildLayout1({
    sender: payer.address,
    nonce,
    quote,
    quoteSig,
    calls: [usdcTransferCall(merchant, parseUnits("0.01", 6))],
    maxFeePerGas: parseGwei("2"),
  });

  // Each tamper keeps a valid sender signature, so only the paymaster's own checks can catch it.
  const tampered = { ...unsigned };
  const feeFrame = tampered.frames[3];
  if (!feeFrame) throw new Error("no fee frame");
  if (mode === "underpay") {
    tampered.frames = tampered.frames.map((frame, index) =>
      index === 3 ? { ...frame, data: usdcTransferCall(makerAccount.address, 1n).data } : frame,
    );
  }
  if (mode === "redirect") {
    tampered.frames = tampered.frames.map((frame, index) =>
      index === 3 ? { ...frame, data: usdcTransferCall(merchant, quote.fee).data } : frame,
    );
  }
  if (mode === "forged") {
    const forged = await signQuote(payer, { ...quote, maker: payer.address });
    const entry = buildLayout1({ sender: payer.address, nonce, quote: { ...quote, maker: payer.address }, quoteSig: forged, calls: [], maxFeePerGas: parseGwei("2") }).signatures[1];
    if (!entry) throw new Error("no maker signature entry");
    tampered.signatures = [unsigned.signatures[0]!, entry];
  }
  const tx = await signFrameTx(tampered, payerKey);
  const hash = frameTxHash(tx);
  console.log(`tx ${hash}, nonce ${nonce}, ${tx.frames.length} frames`);

  const simulation = (await simulateFrameTx(tx)) as Record<string, unknown>;
  if (mode === "send") writeFileSync(new URL("patha-simulation.json", outDir), `${JSON.stringify(simulation, null, 2)}\n`);
  if (["underpay", "redirect", "forged"].includes(mode)) {
    const frames = simulation.frames as { succeeded: boolean }[] | undefined;
    console.log(`${mode}: status ${String(simulation.executionStatus)}, frames ${JSON.stringify(frames)}, error ${String(simulation.executionError)}`);
    try {
      console.log(`alt mempool admitted it: ${await sendToAltMempool(tx)}`);
    } catch (error) {
      console.log(`alt mempool rejected it: ${error instanceof Error ? error.message : String(error)}`);
    }
    return;
  }
  if (mode !== "send") return;

  try {
    const accepted = await sendToCanonicalMempool(tx);
    console.log(`canonical mempool ACCEPTED it: ${accepted}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeFileSync(new URL("patha-canonical-rejection.txt", outDir), `${hash}\n${message}\n`);
    console.log(`canonical mempool rejected it: ${message}`);
  }

  try {
    const admitted = await sendToAltMempool(tx);
    console.log(`alt mempool admitted it: ${admitted}`);
  } catch (error) {
    console.log(`alt mempool rejected it: ${error instanceof Error ? error.message : String(error)}`);
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const receipt = await client.getTransactionReceipt({ hash }).catch(() => undefined);
    if (receipt) {
      console.log(`mined in block ${receipt.blockNumber}, status ${receipt.status}, gas ${receipt.gasUsed}`);
      break;
    }
  }
  const report = await admissionReport(hash).catch((error: unknown) => String(error));
  writeFileSync(new URL("patha-admission.json", outDir), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report).slice(0, 1800));
  console.log(explorerTx(efDevnet.id, hash));

  const balance = (address: `0x${string}`) =>
    client.readContract({ address: EF_USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  console.log(`payer ${formatUnits(await balance(payer.address), 6)} · merchant ${formatUnits(await balance(merchant), 6)} · maker ${formatUnits(await balance(makerAccount.address), 6)} USDC`);
});
