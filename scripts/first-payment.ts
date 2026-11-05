import { createPublicClient, createWalletClient, formatUnits, http, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  OCTANE_RELAY_ABI,
  WHITECHAIN_USDT,
  assertUsdtDomain,
  buildPayment,
  explorerTx,
  signPaymentAuth,
  signQuote,
  whitechainSepolia,
  type Quote,
} from "@octane/sdk";
import { env, envHex } from "./lib/env.js";

const usdtAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const relay = envHex("OCTANE_RELAY");
const maker = privateKeyToAccount(envHex("MAKER_CAUTIOUS_PRIVATE_KEY"));
const payer = privateKeyToAccount(envHex("PAYER_AGENT_PRIVATE_KEY"));
const merchant = envHex("MERCHANT_ADDRESS");

const transport = http(env("WHITECHAIN_RPC_URL"));
const client = createPublicClient({ chain: whitechainSepolia, transport });
const wallet = createWalletClient({ chain: whitechainSepolia, transport, account: maker });

await assertUsdtDomain(client);

const usdt = (account: `0x${string}`) =>
  client.readContract({ address: WHITECHAIN_USDT, abi: usdtAbi, functionName: "balanceOf", args: [account] });

const show = async (label: string) => {
  const [p, m, k] = await Promise.all([usdt(payer.address), usdt(merchant), usdt(maker.address)]);
  console.log(`${label}: payer ${formatUnits(p, 6)} · merchant ${formatUnits(m, 6)} · maker ${formatUnits(k, 6)} USDT`);
};

await show("before");

const now = BigInt(Math.floor(Date.now() / 1000));
const quote: Quote = {
  maker: maker.address,
  chainId: BigInt(whitechainSepolia.id),
  settlement: relay,
  token: WHITECHAIN_USDT,
  maxGas: 200_000n,
  fee: parseUnits("0.01", 6),
  validUntil: now + 105n,
  nonce: 1n,
};
const quoteSig = await signQuote(maker, quote);

const payment = buildPayment({ quote, payer: payer.address, merchant, amount: parseUnits("0.01", 6) });
const authSig = await signPaymentAuth(payer, quote, payment);

const { request } = await client.simulateContract({
  account: maker,
  address: relay,
  abi: OCTANE_RELAY_ABI,
  functionName: "relay",
  args: [quote, quoteSig, payment, authSig],
});
const hash = await wallet.writeContract(request);
console.log(`sent ${hash}`);

const receipt = await client.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error(`reverted: ${hash}`);
console.log(`settled in block ${receipt.blockNumber}, gas used ${receipt.gasUsed}`);
console.log(explorerTx(whitechainSepolia.id, hash));

await show("after");
const [payerWbt, payerNonce] = await Promise.all([
  client.getBalance({ address: payer.address }),
  client.getTransactionCount({ address: payer.address }),
]);
console.log(`payer WBT ${payerWbt} · payer transactions sent ${payerNonce}`);
