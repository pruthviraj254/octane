import { WHITECHAIN_USDT, explorerTx, whitechainSepolia } from "@octane/sdk";
import { createPublicClient, createWalletClient, formatUnits, http, parseEther, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env, envHex, run } from "./lib/env.ts";

/** Swaps the deployer's WBT for USDT on the testnet pool and sends it to the payer agent. */
const ROUTER = "0xe208cC685cD95D56E8ec6DEC9816476567fc6962";
const WWBT = "0x4200000000000000000000000000000000000006";
const POOL_FEE = 3000;
const AMOUNT_IN = parseEther(process.argv[2] ?? "0.25");
const SLIPPAGE_PERCENT = 97n;

const abi = parseAbi([
  "struct Params { address tokenIn; address tokenOut; uint24 fee; address recipient; uint256 amountIn; uint256 amountOutMinimum; uint160 sqrtPriceLimitX96; }",
  "function exactInputSingle(Params params) payable returns (uint256 amountOut)",
]);

await run(async () => {
  const transport = http(env("WHITECHAIN_RPC_URL"), { timeout: 20_000 });
  const client = createPublicClient({ chain: whitechainSepolia, transport });
  const account = privateKeyToAccount(envHex("DEPLOYER_PRIVATE_KEY"));
  const wallet = createWalletClient({ chain: whitechainSepolia, transport, account });
  const recipient = envHex("PAYER_AGENT_ADDRESS");

  const params = (amountOutMinimum: bigint) => ({
    tokenIn: WWBT,
    tokenOut: WHITECHAIN_USDT,
    fee: POOL_FEE,
    recipient,
    amountIn: AMOUNT_IN,
    amountOutMinimum,
    sqrtPriceLimitX96: 0n,
  }) as const;

  const { result: expected } = await client.simulateContract({
    account,
    address: ROUTER,
    abi,
    functionName: "exactInputSingle",
    args: [params(0n)],
    value: AMOUNT_IN,
  });
  const minimum = (expected * SLIPPAGE_PERCENT) / 100n;
  console.log(`expecting ${formatUnits(expected, 6)} USDT, minimum ${formatUnits(minimum, 6)}`);

  const hash = await wallet.writeContract({
    address: ROUTER,
    abi,
    functionName: "exactInputSingle",
    args: [params(minimum)],
    value: AMOUNT_IN,
  });
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error(`swap reverted: ${hash}`);
  console.log(explorerTx(whitechainSepolia.id, hash));
});
