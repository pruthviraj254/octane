import {
  createPublicClient,
  http,
  isAddressEqual,
  type Address,
  type Hash,
  type Hex,
  type LocalAccount,
  type PublicClient,
} from "viem";
import { fetchBoard, fetchMakerProfile, type BoardQuote } from "./arkiv/board.ts";
import type { ArkivReader } from "./arkiv/client.ts";
import type { ArkivWriter } from "./arkiv/writer.ts";
import { bidQuoteHash, fetchBids, postRequest, recordWinner, type Bid } from "./auction.ts";
import { fetchFadeScores, unreliableMakers } from "./history.ts";
import { submitRelayJob } from "./jobs.ts";
import { EF_USDC, WHITECHAIN_USDT, efDevnet, explorerTx, whitechainSepolia } from "./networks.ts";
import { buildLayout1, frameTxHash, sendToAltMempool, signFrameTx, usdcTransferCall } from "./pathA.ts";
import { buildPayment, signMerchantOptIn, signPaymentAuth, type MerchantOptIn, type RelayJob } from "./pathB.ts";

export type Chain = "whitechain" | "ef-devnet";

export const CHAINS = {
  whitechain: { chainId: BigInt(whitechainSepolia.id), token: WHITECHAIN_USDT, symbol: "USDT" },
  "ef-devnet": { chainId: BigInt(efDevnet.id), token: EF_USDC, symbol: "USDC" },
} as const;

/** Where to read a chain's quotes, and which settlement contracts to accept on it. */
export interface MarketConfig {
  reader: ArkivReader;
  /** The deployed OctaneRelay on Whitechain. */
  relay: Address;
  /** The deployed paymaster factory on the EF devnet. */
  factory: Address;
  /** The indexer whose fade scores to respect. Left out, every maker is treated alike. */
  indexer?: Address;
}

/** Makers with a poor public record. A failed read mustn't stop a payment, so it passes over nobody. */
async function makersToAvoid(market: MarketConfig, makers: readonly Address[]): Promise<Address[]> {
  if (!market.indexer) return [];
  const scores = await fetchFadeScores(market.reader, { indexer: market.indexer, makers }).catch(() => new Map<Address, bigint>());
  return unreliableMakers(makers, scores);
}

const FACTORY_ABI = [
  {
    type: "function",
    name: "isClone",
    stateMutability: "view",
    inputs: [{ name: "clone", type: "address" }],
    outputs: [{ type: "bool" }],
  },
] as const;

let efClient: PublicClient | undefined;
function efPublicClient(): PublicClient {
  efClient ??= createPublicClient({ chain: efDevnet, transport: http(undefined, { timeout: 15_000 }) }) as PublicClient;
  return efClient;
}

const knownClones = new Map<string, boolean>();

/** On the EF devnet only clones from our factory count, because anyone can name any contract. */
async function isFactoryClone(factory: Address, settlement: Address): Promise<boolean> {
  const cached = knownClones.get(settlement.toLowerCase());
  if (cached !== undefined) return cached;
  const result = await efPublicClient().readContract({
    address: factory,
    abi: FACTORY_ABI,
    functionName: "isClone",
    args: [settlement],
  });
  knownClones.set(settlement.toLowerCase(), result);
  return result;
}

/** Live, verified quotes for a chain, cheapest first. */
export async function getQuotes(market: MarketConfig, chain: Chain) {
  const { chainId, token } = CHAINS[chain];
  return fetchBoard(market.reader, {
    chainId,
    token,
    now: BigInt(Math.floor(Date.now() / 1000)),
    isTrustedSettlement: (settlement) =>
      chain === "whitechain" ? isAddressEqual(settlement, market.relay) : isFactoryClone(market.factory, settlement),
  });
}

export interface PaymentResult {
  chain: Chain;
  txHash: Hash;
  explorerUrl: string;
  maker: Address;
  makerStyle: string;
  fee: bigint;
  feePaidBy: "payer" | "merchant";
}

async function settleViaRelayer(market: MarketConfig, entry: BoardQuote, job: RelayJob): Promise<PaymentResult> {
  const profile = await fetchMakerProfile(market.reader, entry.quote.maker);
  if (!profile) throw new Error("maker has no profile");
  const receipt = await submitRelayJob(profile.endpoint, job);
  return {
    chain: "whitechain",
    txHash: receipt.txHash,
    explorerUrl: receipt.explorerUrl,
    maker: entry.quote.maker,
    makerStyle: entry.style,
    fee: entry.quote.fee,
    feePaidBy: job.optIn ? "merchant" : "payer",
  };
}

/**
 * Pays on Whitechain through the cheapest live maker, moving to the next one if a maker doesn't
 * deliver. Each attempt uses a fresh authorisation bound to that maker, so a failed attempt
 * can't be replayed through another. The payer only signs, however many attempts it takes.
 */
export async function payOnWhitechain(
  market: MarketConfig,
  args: {
    payer: LocalAccount;
    to: Address;
    amount: bigint;
    maxFee: bigint;
    merchantOptIn?: { terms: MerchantOptIn; signature: Hex };
    /** Makers to pass over, such as those with a poor fade score. */
    avoid?: readonly Address[];
  },
): Promise<PaymentResult> {
  const { quotes } = await getQuotes(market, "whitechain");
  const avoid = args.avoid ?? (await makersToAvoid(market, quotes.map((entry) => entry.quote.maker)));
  const avoided = (maker: Address) => avoid.some((address) => isAddressEqual(address, maker));
  const affordable = quotes.filter((entry) => entry.quote.fee <= args.maxFee && !avoided(entry.quote.maker));
  if (affordable.length === 0) {
    throw new Error(quotes.length === 0 ? "no live quotes on Whitechain" : "every live quote is above your maximum fee");
  }

  const failures: string[] = [];
  for (const entry of affordable) {
    const payment = buildPayment({
      quote: entry.quote,
      payer: args.payer.address,
      merchant: args.to,
      amount: args.amount,
      merchantPays: Boolean(args.merchantOptIn),
    });
    const authSig = await signPaymentAuth(args.payer, entry.quote, payment);
    const job: RelayJob = { quote: entry.quote, quoteSig: entry.sig, payment, authSig };
    if (args.merchantOptIn) job.optIn = args.merchantOptIn;
    try {
      return await settleViaRelayer(market, entry, job);
    } catch (error) {
      failures.push(`${entry.style}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`no maker delivered. ${failures.join("; ")}`);
}

/**
 * Runs a gas auction on Arkiv: post a request, wait for makers' bids, take the cheapest bid from
 * a reliable maker, and settle every job with that maker. Whitechain only for now.
 */
export async function runAuction(
  market: MarketConfig,
  args: {
    writer: ArkivWriter;
    payer: LocalAccount;
    jobs: readonly { to: Address; amount: bigint }[];
    maxFee: bigint;
    avoid?: readonly Address[];
  },
): Promise<{ requestKey: Hex; bids: Bid[]; winner: Bid; payments: PaymentResult[] }> {
  const posted = await postRequest(args.writer, {
    chainId: CHAINS.whitechain.chainId,
    payer: args.payer.address,
    maxFee: args.maxFee,
    jobs: args.jobs.map((job) => ({ to: job.to, amount: job.amount.toString() })),
  });

  const closes = Number(posted.deadline) * 1000;
  await new Promise((resolve) => setTimeout(resolve, Math.max(closes - Date.now(), 0)));

  const isRelay = (settlement: Address) => isAddressEqual(settlement, market.relay);
  const bids = await fetchBids(market.reader, posted.key, isRelay);
  const avoid = args.avoid ?? (await makersToAvoid(market, bids.map((bid) => bid.maker)));
  const avoided = (maker: Address) => avoid.some((address) => isAddressEqual(address, maker));
  const winner = bids.find((bid) => bid.quote.fee <= args.maxFee && !avoided(bid.maker));
  if (!winner) throw new Error(bids.length === 0 ? "no maker bid in time" : "no acceptable bid");

  await recordWinner(args.writer, posted.key, winner.maker);

  const payments: PaymentResult[] = [];
  for (const job of args.jobs) {
    const payment = buildPayment({ quote: winner.quote, payer: args.payer.address, merchant: job.to, amount: job.amount });
    const authSig = await signPaymentAuth(args.payer, winner.quote, payment);
    const entry: BoardQuote = {
      key: winner.key,
      quote: winner.quote,
      sig: winner.sig,
      quoteHash: bidQuoteHash(winner),
      style: winner.style,
      seq: 0n,
      expiresAt: 0n,
    };
    payments.push(await settleViaRelayer(market, entry, { quote: winner.quote, quoteSig: winner.sig, payment, authSig }));
  }
  return { requestKey: posted.key, bids, winner, payments };
}

/** Pays on the EF devnet with a frame transaction: the sender signs, and the maker's clone pays the gas. */
export async function payOnEfDevnet(
  market: MarketConfig,
  args: {
    sender: Address;
    privateKey: Hex;
    payments: readonly { to: Address; amount: bigint }[];
    maxFee: bigint;
    maxFeePerGas: bigint;
  },
): Promise<PaymentResult> {
  const { quotes } = await getQuotes(market, "ef-devnet");
  const entry = quotes.find((candidate) => candidate.quote.fee <= args.maxFee);
  if (!entry) throw new Error(quotes.length === 0 ? "no live quotes on the EF devnet" : "every live quote is above your maximum fee");

  const nonce = await efPublicClient().getTransactionCount({ address: args.sender });
  const tx = await signFrameTx(
    buildLayout1({
      sender: args.sender,
      nonce: BigInt(nonce),
      quote: entry.quote,
      quoteSig: entry.sig,
      calls: args.payments.map((payment) => usdcTransferCall(payment.to, payment.amount)),
      maxFeePerGas: args.maxFeePerGas,
    }),
    args.privateKey,
  );
  const expected = frameTxHash(tx);
  await sendToAltMempool(tx);
  // Admission isn't settlement. Only a successful receipt means the payment happened.
  const receipt = await efPublicClient().waitForTransactionReceipt({ hash: expected, timeout: 60_000 });
  if (receipt.status !== "success") throw new Error(`the transaction reverted: ${expected}`);
  return {
    chain: "ef-devnet",
    txHash: expected,
    explorerUrl: explorerTx(efDevnet.id, expected),
    maker: entry.quote.maker,
    makerStyle: entry.style,
    fee: entry.quote.fee,
    feePaidBy: "payer",
  };
}
