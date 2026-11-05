import { isAddress, isHex, type Address, type Hash, type Hex } from "viem";
import { z } from "zod";
import type { RelayJob } from "./pathB.ts";

const address = z.string().refine((value) => isAddress(value)).transform((value) => value as Address);
const hex = z.string().refine((value) => isHex(value)).transform((value) => value as Hex);
const hash = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((value) => value as Hash);
const uint = z.string().regex(/^\d+$/).transform(BigInt);

const JobSchema = z.object({
  quote: z.object({
    maker: address,
    chainId: uint,
    settlement: address,
    token: address,
    maxGas: uint,
    fee: uint,
    validUntil: uint,
    nonce: uint,
  }),
  quoteSig: hex,
  payment: z.object({
    payer: address,
    merchant: address,
    amount: uint,
    feePayer: address,
    salt: hash,
    validAfter: uint,
    validBefore: uint,
  }),
  authSig: hex,
  optIn: z
    .object({
      terms: z.object({ merchant: address, amount: uint, maxFee: uint, orderId: hash, expiry: uint }),
      signature: hex,
    })
    .optional(),
});

/** Bigints travel as decimal strings, because JSON can't carry them. */
export function encodeRelayJobJson(job: RelayJob): string {
  return JSON.stringify(job, (_, value) => (typeof value === "bigint" ? value.toString() : value));
}

export function parseRelayJobJson(body: string): RelayJob {
  const { optIn, ...rest } = JobSchema.parse(JSON.parse(body));
  return optIn ? { ...rest, optIn } : rest;
}

export interface JobReceipt {
  txHash: Hash;
  explorerUrl: string;
}

/** Hands a signed job to the maker's own relayer. Delivery is off-chain and free. */
export async function submitRelayJob(endpoint: string, job: RelayJob): Promise<JobReceipt> {
  const response = await fetch(`${endpoint.replace(/\/$/, "")}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: encodeRelayJobJson(job),
  });
  const body = (await response.json()) as Partial<JobReceipt> & { error?: string };
  if (!response.ok || !body.txHash || !body.explorerUrl) {
    throw new Error(body.error ?? `maker returned ${response.status}`);
  }
  return { txHash: body.txHash, explorerUrl: body.explorerUrl };
}
