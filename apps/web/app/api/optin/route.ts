import { signMerchantOptIn, type MerchantOptIn } from "@octane/sdk";
import { toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { serverSetting } from "@/lib/server-settings";

const VALID_SECONDS = 300n;
const CHAIN_ID = 1874n;
const MAX_FEE = 200_000n; // The most this merchant will cover: 0.20 USDT.

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { amount?: unknown };
  if (typeof body.amount !== "string" || !/^\d+$/.test(body.amount)) {
    return Response.json({ error: "send an amount in base units" }, { status: 400 });
  }
  // The merchant's checkout. Its key stays on this server and never reaches a payer's browser.
  const key = serverSetting("MERCHANT_PRIVATE_KEY") as Hex | undefined;
  const relay = process.env.NEXT_PUBLIC_OCTANE_RELAY as Address | undefined;
  if (!key || !relay) return Response.json({ error: "merchant checkout isn't configured" }, { status: 503 });

  const merchant = privateKeyToAccount(key);
  const terms: MerchantOptIn = {
    merchant: merchant.address,
    amount: BigInt(body.amount),
    maxFee: MAX_FEE,
    orderId: toHex(crypto.getRandomValues(new Uint8Array(32))),
    expiry: BigInt(Math.floor(Date.now() / 1000)) + VALID_SECONDS,
  };
  const signature = await signMerchantOptIn(merchant, relay, CHAIN_ID, terms);
  return Response.json({
    terms: { ...terms, amount: terms.amount.toString(), maxFee: terms.maxFee.toString(), expiry: terms.expiry.toString() },
    signature,
  });
}
