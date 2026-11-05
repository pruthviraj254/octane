import { WHITECHAIN_USDT, arkivReader, buildPayment, fetchBoard, fetchMakerProfile, resolveIdentity, signPaymentAuth, submitRelayJob } from "@octane/sdk";
import { formatUnits, isAddressEqual, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { env, envHex, run } from "./lib/env.ts";

/** A payer reads the live board, picks the cheapest maker, signs, and that maker settles it. */
await run(async () => {
  const relay = envHex("OCTANE_RELAY");
  const payer = privateKeyToAccount(envHex("PAYER_AGENT_PRIVATE_KEY"));
  const merchant = envHex("MERCHANT_ADDRESS");
  const reader = arkivReader(env("ARKIV_ACCESS_KEY"));

  const { quotes } = await fetchBoard(reader, {
    chainId: 1874n,
    token: WHITECHAIN_USDT,
    now: BigInt(Math.floor(Date.now() / 1000)),
    isTrustedSettlement: (settlement) => isAddressEqual(settlement, relay),
  });
  for (const entry of quotes) {
    console.log(`${entry.style}: ${formatUnits(entry.quote.fee, 6)} USDT (${(await resolveIdentity(entry.quote.maker)).label})`);
  }

  const best = quotes[0];
  if (!best) throw new Error("no live quotes on the board");
  const profile = await fetchMakerProfile(reader, best.quote.maker);
  if (!profile) throw new Error(`maker ${best.quote.maker} has no profile`);

  const amount = parseUnits(process.argv[2] ?? "0.01", 6);
  const payment = buildPayment({ quote: best.quote, payer: payer.address, merchant, amount });
  const authSig = await signPaymentAuth(payer, best.quote, payment);

  console.log(`paying ${formatUnits(amount, 6)} USDT via ${best.style}, fee ${formatUnits(best.quote.fee, 6)} USDT`);
  const receipt = await submitRelayJob(profile.endpoint, { quote: best.quote, quoteSig: best.sig, payment, authSig });
  console.log(receipt.explorerUrl);
});
