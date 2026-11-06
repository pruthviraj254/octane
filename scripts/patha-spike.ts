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
/** `dry` as the second argument stops a tampered transaction before it reaches the mempool. */
const dry = process.argv[3] === "dry";
const outDir = new URL("../docs/evidence/", import.meta.url);
const MAX_BLOCK_AGE_SECONDS = 120n;

/**
 * Builds one sponsored Layout 1 transaction. `simulate` sends nothing and writes nothing.
 * `send` submits to both mempools and replaces the files in docs/evidence once it's mined.
 */
await run(async () => {
  const client = createPublicClient({ chain: efDevnet, transport: http(env("EF_RPC_URL"), { timeout: 20_000 }) });
  const makerAccount = privateKeyToAccount(envHex("MAKER_CAUTIOUS_PRIVATE_KEY"));
  const payerKey = envHex("PAYER_AGENT_PRIVATE_KEY");
  const payer = privateKeyToAccount(payerKey);
  const merchant = envHex("MERCHANT_ADDRESS");
  const clone = envHex("OCTANE_CLONE_CAUTIOUS");

  const block = await client.getBlock();
  const now = block.timestamp;
  const blockAge = BigInt(Math.floor(Date.now() / 1000)) - now;
  const stopped = blockAge > MAX_BLOCK_AGE_SECONDS;
  // Nothing can be mined on a stopped chain.
  if (mode === "send" && stopped) {
    throw new Error(`the devnet's latest block is ${blockAge}s old, so send is blocked. Use simulate.`);
  }
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
  if (["underpay", "redirect", "forged"].includes(mode)) {
    const frames = simulation.frames as { succeeded: boolean }[] | undefined;
    console.log(`${mode}: status ${String(simulation.executionStatus)}, frames ${JSON.stringify(frames)}, error ${String(simulation.executionError)}`);
    if (dry) return;
    try {
      console.log(`alt mempool admitted it: ${await sendToAltMempool(tx)}`);
    } catch (error) {
      console.log(`alt mempool rejected it: ${error instanceof Error ? error.message : String(error)}`);
    }
    return;
  }
  if (mode !== "send") {
    const frames = simulation.frames as { succeeded: boolean }[] | undefined;
    console.log(`simulate: status ${String(simulation.executionStatus)}, payer ${String(simulation.payer)}, gas ${String(simulation.gasUsed)}, prefix ${JSON.stringify(simulation.prefixShape)}`);
    console.log(`frames passed: ${frames?.filter((frame) => frame.succeeded).length} of ${frames?.length}`);
    console.log(`latest block is ${blockAge}s old, so send is ${stopped ? "blocked" : "allowed"}`);
    console.log(`canonical mempool would admit it: ${String(simulation.canonicalMempoolValid)}, because ${String(simulation.canonicalMempoolViolation)}`);
    return;
  }

  let canonicalRejection: string | undefined;
  try {
    const accepted = await sendToCanonicalMempool(tx);
    console.log(`canonical mempool ACCEPTED it: ${accepted}`);
  } catch (error) {
    canonicalRejection = error instanceof Error ? error.message : String(error);
    console.log(`canonical mempool rejected it: ${canonicalRejection}`);
  }

  const admitted = await sendToAltMempool(tx);
  console.log(`alt mempool admitted it: ${admitted}`);

  let mined = false;
  for (let attempt = 0; attempt < 12 && !mined; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const receipt = await client.getTransactionReceipt({ hash }).catch(() => undefined);
    if (receipt) {
      console.log(`mined in block ${receipt.blockNumber}, status ${receipt.status}, gas ${receipt.gasUsed}`);
      mined = receipt.status === "success";
    }
  }
  const report = await admissionReport(hash).catch((error: unknown) => String(error));
  // The proof files change only for a mined transaction, so a failed run can't replace real evidence.
  if (mined) {
    writeFileSync(new URL("patha-simulation.json", outDir), `${JSON.stringify(simulation, null, 2)}\n`);
    writeFileSync(new URL("patha-admission.json", outDir), `${JSON.stringify(report, null, 2)}\n`);
    if (canonicalRejection) writeFileSync(new URL("patha-canonical-rejection.txt", outDir), `${hash}\n${canonicalRejection}\n`);
  } else {
    console.log("not mined, so docs/evidence is unchanged");
  }
  console.log(JSON.stringify(report).slice(0, 1800));
  console.log(explorerTx(efDevnet.id, hash));

  const balance = (address: `0x${string}`) =>
    client.readContract({ address: EF_USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] });
  console.log(`payer ${formatUnits(await balance(payer.address), 6)} · merchant ${formatUnits(await balance(merchant), 6)} · maker ${formatUnits(await balance(makerAccount.address), 6)} USDC`);
});
