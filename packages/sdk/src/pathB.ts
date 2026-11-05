import {
  encodeAbiParameters,
  encodeFunctionData,
  hashDomain,
  hashStruct,
  keccak256,
  concat,
  toHex,
  type Address,
  type Hash,
  type Hex,
  type LocalAccount,
  type PublicClient,
} from "viem";
import { WHITECHAIN_USDT } from "./networks.js";
import { QUOTE_DOMAIN_NAME, QUOTE_DOMAIN_VERSION, hashQuote, type Quote } from "./quotes.js";

/** The test USDT has no `eip712Domain()`, so this comes from its verified source. */
export const USDT_DOMAIN = {
  name: "Tether USD",
  version: "1",
  chainId: 1874n,
  verifyingContract: WHITECHAIN_USDT,
} as const;

const EIP712_DOMAIN_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
} as const;

const RECEIVE_WITH_AUTHORIZATION_TYPES = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

const MERCHANT_OPT_IN_TYPES = {
  MerchantOptIn: [
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "maxFee", type: "uint256" },
    { name: "orderId", type: "bytes32" },
    { name: "expiry", type: "uint64" },
  ],
} as const;

const QUOTE_TUPLE = {
  type: "tuple",
  name: "quote",
  components: [
    { name: "maker", type: "address" },
    { name: "chainId", type: "uint256" },
    { name: "settlement", type: "address" },
    { name: "token", type: "address" },
    { name: "maxGas", type: "uint256" },
    { name: "fee", type: "uint256" },
    { name: "validUntil", type: "uint64" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

const PAYMENT_TUPLE = {
  type: "tuple",
  name: "payment",
  components: [
    { name: "payer", type: "address" },
    { name: "merchant", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "feePayer", type: "address" },
    { name: "salt", type: "bytes32" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
  ],
} as const;

const OPT_IN_TUPLE = {
  type: "tuple",
  name: "optIn",
  components: MERCHANT_OPT_IN_TYPES.MerchantOptIn,
} as const;

export const OCTANE_RELAY_ABI = [
  {
    type: "function",
    name: "relay",
    stateMutability: "nonpayable",
    inputs: [
      QUOTE_TUPLE,
      { name: "quoteSig", type: "bytes" },
      PAYMENT_TUPLE,
      { name: "authSig", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "relayMerchantPays",
    stateMutability: "nonpayable",
    inputs: [
      QUOTE_TUPLE,
      { name: "quoteSig", type: "bytes" },
      PAYMENT_TUPLE,
      { name: "authSig", type: "bytes" },
      OPT_IN_TUPLE,
      { name: "optInSig", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "Relayed",
    anonymous: false,
    inputs: [
      { name: "quoteHash", type: "bytes32", indexed: true },
      { name: "maker", type: "address", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "merchant", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
      { name: "feePayer", type: "address", indexed: false },
    ],
  },
] as const;

export interface Payment {
  payer: Address;
  merchant: Address;
  amount: bigint;
  /** The payer, or the merchant in merchant-pays mode. */
  feePayer: Address;
  /** Lets the same payment repeat under one quote. */
  salt: Hash;
  validAfter: bigint;
  validBefore: bigint;
}

export interface MerchantOptIn {
  merchant: Address;
  amount: bigint;
  maxFee: bigint;
  orderId: Hash;
  expiry: bigint;
}

/** Everything a maker needs to settle a payment. Sent off-chain, for free. */
export interface RelayJob {
  quote: Quote;
  quoteSig: Hex;
  payment: Payment;
  authSig: Hex;
  optIn?: { terms: MerchantOptIn; signature: Hex };
}

export function randomSalt(): Hash {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

/** A payment that lives exactly as long as its quote. */
export function buildPayment(args: {
  quote: Quote;
  payer: Address;
  merchant: Address;
  amount: bigint;
  merchantPays?: boolean;
  salt?: Hash;
}): Payment {
  return {
    payer: args.payer,
    merchant: args.merchant,
    amount: args.amount,
    feePayer: args.merchantPays ? args.merchant : args.payer,
    salt: args.salt ?? randomSalt(),
    validAfter: 0n,
    validBefore: args.quote.validUntil + 1n,
  };
}

/** The EIP-3009 nonce that binds an authorisation to one maker and one payment. */
export function bindingNonce(quote: Quote, payment: Payment): Hash {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "uint256" },
        { type: "address" },
        { type: "address" },
        { type: "bytes32" },
      ],
      [hashQuote(quote), payment.merchant, payment.amount, quote.maker, payment.feePayer, payment.salt],
    ),
  );
}

/** What leaves the payer's balance. In merchant-pays mode the fee comes from the merchant's side. */
export function authorisedValue(quote: Quote, payment: Payment): bigint {
  return payment.feePayer === payment.merchant ? payment.amount : payment.amount + quote.fee;
}

/** The payer's only step: a free signature. It never sends a transaction. */
export function signPaymentAuth(payer: LocalAccount, quote: Quote, payment: Payment): Promise<Hex> {
  return payer.signTypedData({
    domain: USDT_DOMAIN,
    types: RECEIVE_WITH_AUTHORIZATION_TYPES,
    primaryType: "ReceiveWithAuthorization",
    message: {
      from: payment.payer,
      to: quote.settlement,
      value: authorisedValue(quote, payment),
      validAfter: payment.validAfter,
      validBefore: payment.validBefore,
      nonce: bindingNonce(quote, payment),
    },
  });
}

function optInDomain(relay: Address, chainId: bigint) {
  return {
    name: QUOTE_DOMAIN_NAME,
    version: QUOTE_DOMAIN_VERSION,
    chainId,
    verifyingContract: relay,
  } as const;
}

export function signMerchantOptIn(
  merchant: LocalAccount,
  relay: Address,
  chainId: bigint,
  optIn: MerchantOptIn,
): Promise<Hex> {
  return merchant.signTypedData({
    domain: optInDomain(relay, chainId),
    types: MERCHANT_OPT_IN_TYPES,
    primaryType: "MerchantOptIn",
    message: optIn,
  });
}

export function merchantOptInDigest(relay: Address, chainId: bigint, optIn: MerchantOptIn): Hash {
  return keccak256(
    concat([
      "0x1901",
      hashDomain({ domain: optInDomain(relay, chainId), types: EIP712_DOMAIN_TYPES }),
      hashStruct({ data: { ...optIn }, primaryType: "MerchantOptIn", types: MERCHANT_OPT_IN_TYPES }),
    ]),
  );
}

export function encodeRelayJob(job: RelayJob): Hex {
  if (job.optIn) {
    return encodeFunctionData({
      abi: OCTANE_RELAY_ABI,
      functionName: "relayMerchantPays",
      args: [job.quote, job.quoteSig, job.payment, job.authSig, job.optIn.terms, job.optIn.signature],
    });
  }
  return encodeFunctionData({
    abi: OCTANE_RELAY_ABI,
    functionName: "relay",
    args: [job.quote, job.quoteSig, job.payment, job.authSig],
  });
}

/** Stops a wrong domain before anyone signs: a bad domain fails only once it's onchain. */
export async function assertUsdtDomain(client: PublicClient): Promise<void> {
  const onchain = await client.readContract({
    address: WHITECHAIN_USDT,
    abi: [
      {
        type: "function",
        name: "DOMAIN_SEPARATOR",
        stateMutability: "view",
        inputs: [],
        outputs: [{ type: "bytes32" }],
      },
    ],
    functionName: "DOMAIN_SEPARATOR",
  });
  const expected = hashDomain({ domain: USDT_DOMAIN, types: EIP712_DOMAIN_TYPES });
  if (onchain !== expected) throw new Error(`USDT domain mismatch: chain ${onchain}, sdk ${expected}`);
}
