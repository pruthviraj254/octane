import { keccak256, toBytes, type Address, type Hash, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  QUOTE_TYPES,
  hashQuote,
  quoteDomainSeparator,
  quoteStructHash,
  signQuote,
  type Quote,
} from "../src/quotes.js";

/** Derived from a public label: a test-only signer that never holds funds. */
export const testSigner = privateKeyToAccount(keccak256(toBytes("octane.test.quote.signer")));

export const testQuote: Quote = {
  maker: testSigner.address,
  chainId: 1874n,
  settlement: "0x1111111111111111111111111111111111111111",
  token: "0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7",
  maxGas: 200_000n,
  fee: 50_000n,
  validUntil: 1_800_000_000n,
  nonce: 7n,
};

export interface QuoteFixture {
  quote: {
    maker: Address;
    chainId: string;
    settlement: Address;
    token: Address;
    maxGas: string;
    fee: string;
    validUntil: string;
    nonce: string;
  };
  quoteTypeHash: Hash;
  domainSeparator: Hash;
  structHash: Hash;
  digest: Hash;
  signature: Hex;
}

const fields = QUOTE_TYPES.Quote.map(({ type, name }) => `${type} ${name}`).join(",");
const quoteTypeHash = keccak256(toBytes(`Quote(${fields})`));

export async function buildQuoteFixture(): Promise<QuoteFixture> {
  const q = testQuote;
  return {
    quote: {
      maker: q.maker,
      chainId: q.chainId.toString(),
      settlement: q.settlement,
      token: q.token,
      maxGas: q.maxGas.toString(),
      fee: q.fee.toString(),
      validUntil: q.validUntil.toString(),
      nonce: q.nonce.toString(),
    },
    quoteTypeHash,
    domainSeparator: quoteDomainSeparator(q),
    structHash: quoteStructHash(q),
    digest: hashQuote(q),
    signature: await signQuote(testSigner, q),
  };
}

export const fixturePath = new URL("../../../contracts/test/fixtures/quote.json", import.meta.url);
