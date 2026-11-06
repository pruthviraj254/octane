import {
  ArkivWriter,
  QUOTE_LIFETIME,
  QuoteEntity,
  WHITECHAIN_USDT,
  arkivReader,
  arkivWallet,
  buildPayment,
  encodeRelayJobJson,
  fetchMakerProfile,
  getQuotes,
  quoteValues,
  signPaymentAuth,
  signQuote,
  type BoardQuote,
  type MarketConfig,
  type Quote,
  type RelayJob,
} from "@octane/sdk";
import { parseUnits, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { env, envHex, run } from "./lib/env.ts";

/** Attacks the live system. Every check states what must happen, so nothing passes by accident. */
let failures = 0;
const check = (name: string, passed: boolean, detail = "") => {
  if (!passed) failures += 1;
  console.log(`${passed ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const post = async (endpoint: string, body: string) => {
  const response = await fetch(`${endpoint}/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body });
  const json = (await response.json()) as { error?: string; txHash?: string };
  return { status: response.status, error: json.error ?? "", txHash: json.txHash };
};

await run(async () => {
  const accessKey = env("ARKIV_ACCESS_KEY");
  const reader = arkivReader(accessKey);
  const relay = envHex("OCTANE_RELAY");
  const market: MarketConfig = { reader, relay, factory: envHex("OCTANE_FACTORY") };
  const attackerKey = envHex("PAYER_AGENT_PRIVATE_KEY");
  const attacker = privateKeyToAccount(attackerKey);
  const writer = new ArkivWriter(reader, arkivWallet(accessKey, attacker), attacker.address);
  const merchant = envHex("MERCHANT_ADDRESS");
  const now = () => BigInt(Math.floor(Date.now() / 1000));

  const { quotes } = await getQuotes(market, "whitechain");
  const byStyle = (style: string) => quotes.find((entry) => entry.style === style);
  const cautious = byStyle("cautious");
  const aggressive = byStyle("aggressive");
  if (!cautious || !aggressive) throw new Error(`need cautious and aggressive on the board, saw ${quotes.map((q) => q.style).join(",")}`);

  const profile = async (maker: Address) => {
    const found = await fetchMakerProfile(reader, maker);
    if (!found) throw new Error("no profile");
    return found.endpoint;
  };
  const cautiousEndpoint = await profile(cautious.quote.maker);

  console.log("\n# Fake quotes on the board");
  const genuine = cautious.quote;
  const fakeQuotes: { name: string; quote: Quote; owner: "attacker" }[] = [];

  // A quote claiming to be from Maker Cautious, written by the attacker's wallet.
  const spoofed: Quote = { ...genuine, fee: 1n, nonce: 111n, validUntil: now() + 100n };
  const spoofedSig = await signQuote(attacker, { ...spoofed, maker: attacker.address }).catch(() => "0x" as const);
  fakeQuotes.push({ name: "spoofed maker", quote: spoofed, owner: "attacker" });

  // A correctly signed quote from the attacker's own wallet, naming the attacker's own contract.
  const fakeSettlement: Quote = {
    maker: attacker.address,
    chainId: 1874n,
    settlement: attacker.address,
    token: WHITECHAIN_USDT,
    maxGas: 200_000n,
    fee: 1n,
    validUntil: now() + 100n,
    nonce: 222n,
  };
  const fakeSig = await signQuote(attacker, fakeSettlement);

  const wrote = await writer.submit({
    creates: [
      { schema: QuoteEntity, values: quoteValues(spoofed, spoofedSig, "spoofed", 1n), expiration: QUOTE_LIFETIME },
      { schema: QuoteEntity, values: quoteValues(fakeSettlement, fakeSig, "fake-settlement", 1n), expiration: QUOTE_LIFETIME },
    ],
  });
  check("attacker could write fake quotes to Arkiv (the board must not trust that)", wrote.status === "sent");

  const seen = await getQuotes(market, "whitechain");
  const styles = seen.quotes.map((entry) => entry.style);
  const cheapest = seen.quotes[0]?.quote.fee ?? 0n;
  check("spoofed quote hidden from the board", !styles.includes("spoofed"));
  check("quote naming the attacker's contract hidden", !styles.includes("fake-settlement"));
  check("cheapest quote is still a real maker's, not the fake 1 unit", cheapest > 1000n, `cheapest ${cheapest}`);

  console.log("\n# Bad jobs sent straight to a maker's relayer");
  const victim = privateKeyToAccount(generatePrivateKey());
  const jobFor = async (entry: BoardQuote, payer = victim, amount = parseUnits("0.01", 6)): Promise<RelayJob> => {
    const payment = buildPayment({ quote: entry.quote, payer: payer.address, merchant, amount });
    return { quote: entry.quote, quoteSig: entry.sig, payment, authSig: await signPaymentAuth(payer, entry.quote, payment) };
  };

  const garbage = await post(cautiousEndpoint, "not json");
  check("malformed job refused", garbage.status === 400, garbage.error);

  const wrongMaker = await post(cautiousEndpoint, encodeRelayJobJson(await jobFor(aggressive)));
  check("another maker's quote refused", wrongMaker.status === 422, wrongMaker.error);

  const expiredEntry: BoardQuote = { ...cautious, quote: { ...cautious.quote, validUntil: now() - 10n } };
  const expired = await post(cautiousEndpoint, encodeRelayJobJson(await jobFor(expiredEntry)));
  check("expired quote refused", expired.status === 422, expired.error);

  const tamperedEntry: BoardQuote = { ...cautious, quote: { ...cautious.quote, fee: cautious.quote.fee + 1n } };
  const tampered = await post(cautiousEndpoint, encodeRelayJobJson(await jobFor(tamperedEntry)));
  check("quote with a changed fee refused", tampered.status === 422, tampered.error);

  const noFunds = await post(cautiousEndpoint, encodeRelayJobJson(await jobFor(cautious)));
  check("payer with no USDT refused by simulation, no gas spent", noFunds.status === 502 && !noFunds.txHash, noFunds.error);

  console.log("\n# Griefing shield");
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  const second = await post(cautiousEndpoint, encodeRelayJobJson(await jobFor(cautious)));
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  const third = await post(cautiousEndpoint, encodeRelayJobJson(await jobFor(cautious)));
  await new Promise((resolve) => setTimeout(resolve, 1_200));
  const blocked = await post(cautiousEndpoint, encodeRelayJobJson(await jobFor(cautious)));
  check("repeat offender blocked after 3 failed jobs", blocked.status === 422 && blocked.error.includes("failed jobs"), `${second.error} / ${third.error} / ${blocked.error}`);

  const fresh = privateKeyToAccount(generatePrivateKey());
  const burstA = await post(cautiousEndpoint, encodeRelayJobJson(await jobFor(cautious, fresh)));
  const burstB = await post(cautiousEndpoint, encodeRelayJobJson(await jobFor(cautious, fresh)));
  check("same payer sending jobs too fast refused", burstB.status === 422 && burstB.error.includes("too many"), `${burstA.error} / ${burstB.error}`);

  console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
  if (failures > 0) process.exitCode = 1;
});
