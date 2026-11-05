import {
  hashDomain,
  hashStruct,
  hashTypedData,
  isAddressEqual,
  recoverTypedDataAddress,
  type Address,
  type Hash,
  type Hex,
  type LocalAccount,
} from "viem";

/**
 * The EIP-712 signed gas quote shared by both settlement paths.
 * Must stay identical to contracts/src/lib/QuoteLib.sol. The fixture test keeps them in step.
 */
export interface Quote {
  /** Who gets paid and whose funds back the quote. */
  maker: Address;
  /** Settlement chain. */
  chainId: bigint;
  /** OctaneRelay or the maker's paymaster clone. */
  settlement: Address;
  /** USDT (Path B) or USDC (Path A). */
  token: Address;
  /** Gas units covered. */
  maxGas: bigint;
  /** Path B: flat fee in token units. Path A: token per unit of gas cost. */
  fee: bigint;
  /** Unix time, enforced onchain by the settlement contract. */
  validUntil: bigint;
  /** Per maker, prevents replay. */
  nonce: bigint;
}

export const QUOTE_DOMAIN_NAME = "Octane";
export const QUOTE_DOMAIN_VERSION = "1";

export const QUOTE_TYPES = {
  Quote: [
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

const DOMAIN_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
} as const;

/** secp256k1 order / 2. Signatures above it are malleable copies, which QuoteLib refuses. */
const MAX_S = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n;

/** The domain comes from the quote, binding it to one chain and one settlement contract. */
export function quoteDomain(quote: Quote) {
  return {
    name: QUOTE_DOMAIN_NAME,
    version: QUOTE_DOMAIN_VERSION,
    chainId: quote.chainId,
    verifyingContract: quote.settlement,
  } as const;
}

export function quoteDomainSeparator(quote: Quote): Hash {
  return hashDomain({ domain: quoteDomain(quote), types: DOMAIN_TYPES });
}

export function quoteStructHash(quote: Quote): Hash {
  return hashStruct({ data: { ...quote }, primaryType: "Quote", types: QUOTE_TYPES });
}

function typedData(quote: Quote) {
  return {
    domain: quoteDomain(quote),
    types: QUOTE_TYPES,
    primaryType: "Quote",
    message: quote,
  } as const;
}

/** The EIP-712 digest. This is the `quoteHash` used across Octane. */
export function hashQuote(quote: Quote): Hash {
  return hashTypedData(typedData(quote));
}

export async function signQuote(account: LocalAccount, quote: Quote): Promise<Hex> {
  if (!isAddressEqual(account.address, quote.maker)) {
    throw new Error(`signer ${account.address} is not the quote maker ${quote.maker}`);
  }
  return account.signTypedData(typedData(quote));
}

/** Mirrors QuoteLib.isSignedByMaker: true only if the chain would accept this signature. */
export async function isSignedByMaker(quote: Quote, signature: Hex): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return false;
  if (BigInt(`0x${signature.slice(66, 130)}`) > MAX_S) return false;
  const v = Number.parseInt(signature.slice(130, 132), 16);
  if (v !== 27 && v !== 28) return false;
  try {
    const signer = await recoverTypedDataAddress({ ...typedData(quote), signature });
    return isAddressEqual(signer, quote.maker);
  } catch {
    return false;
  }
}
