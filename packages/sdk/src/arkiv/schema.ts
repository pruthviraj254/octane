import { addr, bytes, dec, defineSchema, key, str, u256, u64 } from "@arkiv-network/sdk/schema";

/** One standing quote per maker, chain and token. Patched and extended about every 10s. */
export const QuoteEntity = defineSchema("octane.quote", {
  chainId: u64().indexed(),
  token: addr().indexed(),
  maker: addr().indexed(),
  fee: u256().indexed(),
  maxGas: u64().indexed(),
  validUntil: u64().indexed(),
  settlement: addr(),
  nonce: u256(),
  seq: u64(),
  style: str(),
  quoteHash: str(),
  sig: bytes(),
});

/** A maker's profile. Holds the relayer endpoint payers send signed jobs to. */
export const MakerEntity = defineSchema("octane.maker", {
  maker: addr().indexed(),
  style: str().indexed(),
  endpoint: str(),
  journalRef: str().optional(),
  journalSeq: u64().optional(),
});

/** An auction request from a payer agent. */
export const RequestEntity = defineSchema("octane.request", {
  chainId: u64().indexed(),
  payer: addr().indexed(),
  maxFee: u256().indexed(),
  deadline: u64().indexed(),
  winner: addr().indexed().optional(),
  jobs: bytes(),
});

/** A maker's bid on a request. Expires with it. */
export const BidEntity = defineSchema("octane.bid", {
  requestKey: key().indexed(),
  maker: addr().indexed(),
  fee: u256().indexed(),
  quote: bytes(),
});

/** One settled payment. Owned by the indexer and read-only once written. */
export const FillEntity = defineSchema("octane.fill", {
  chainId: u64().indexed(),
  maker: addr().indexed(),
  payer: addr().indexed(),
  txHash: str().indexed(),
  quoteHash: str().indexed(),
  ts: u64().indexed(),
  fee: u256(),
  receipt: bytes(),
});

/** A maker's reputation. Owned by the indexer, so no maker can rate itself. */
export const MakerStatsEntity = defineSchema("octane.makerStats", {
  maker: addr().indexed(),
  epoch: u64().indexed(),
  /** Basis points, lower is better. */
  fadeScore: u64().indexed(),
  uptime24h: u64(),
  coverage24h: u64(),
  fills24h: u64(),
  pnl24h: dec(),
  inputs: bytes(),
});
