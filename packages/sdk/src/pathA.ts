import { profile } from "@forshtat/hegota-support/profiles/ethrex-eip8141-tracer";
import { rpc, toWire } from "@forshtat/hegota-support/rpc";
import { encodeTx, frame, newTx, secp256k1Placeholder, sigScheme, signTx, txHash } from "@forshtat/hegota-support/tx";
import type { FrameTx, SignatureEntry } from "@forshtat/hegota-support/tx";
import {
  concat,
  encodeFunctionData,
  numberToHex,
  sliceHex,
  toHex,
  hexToNumber,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { EF_EXPIRY_VERIFIER, EF_MEMPOOL_RPC, EF_USDC, efDevnet } from "./networks.ts";
import { hashQuote, type Quote } from "./quotes.ts";

const EF_EXECUTION_RPC = efDevnet.rpcUrls.default.http[0];

/** Gas limits per frame. The expiry, sender and pay frames share the sidecar's 100k budget. */
export const FRAME_GAS = {
  expiry: 5_000n,
  onlyVerify: 6_000n,
  pay: 75_000n,
  feeExecution: 80_000n,
  /** A first payment to an address writes a new balance slot. */
  feeState: 100_000n,
  callExecution: 80_000n,
  callState: 100_000n,
} as const;

const ERC20_TRANSFER = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

export const OCTANE_PAYMASTER_ABI = [
  {
    type: "function",
    name: "pay",
    stateMutability: "nonpayable",
    inputs: [
      {
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
      },
    ],
    outputs: [],
  },
] as const;

export interface FrameCall {
  to: Address;
  data: Hex;
  value?: bigint;
}

export function usdcTransferCall(to: Address, amount: bigint): FrameCall {
  return {
    to: EF_USDC,
    data: encodeFunctionData({ abi: ERC20_TRANSFER, functionName: "transfer", args: [to, amount] }),
  };
}

/**
 * The maker signs a quote once for the board, as r || s || v. The same signature becomes a
 * frame transaction signature entry, which the protocol verifies and wants as v(0/1) || r || s.
 */
function makerSignatureEntry(quote: Quote, quoteSig: Hex): SignatureEntry {
  const v = hexToNumber(sliceHex(quoteSig, 64, 65));
  return {
    scheme: sigScheme(profile, "SECP256K1"),
    signer: quote.maker,
    msg: hashQuote(quote),
    signature: concat([numberToHex(v - 27, { size: 1 }), sliceHex(quoteSig, 0, 64)]),
  };
}

/**
 * Layout 1: expiry, sender approval, the maker's clone, the fee to the maker, then the user's calls.
 * The sender needs no ETH: the clone pays gas and the fee frame repays the maker in USDC.
 */
export function buildLayout1(args: {
  sender: Address;
  nonce: bigint;
  quote: Quote;
  quoteSig: Hex;
  calls: readonly FrameCall[];
  maxFeePerGas: bigint;
  maxPriorityFeePerGas?: bigint;
}): FrameTx {
  const { quote } = args;
  return newTx({
    chainId: efDevnet.id,
    sender: args.sender,
    nonceSeq: args.nonce,
    fees: {
      maxFeePerGas: args.maxFeePerGas,
      maxPriorityFeePerGas: args.maxPriorityFeePerGas ?? args.maxFeePerGas / 2n,
    },
    signatures: [secp256k1Placeholder(profile), makerSignatureEntry(quote, args.quoteSig)],
    frames: [
      frame(profile, "VERIFY", {
        target: EF_EXPIRY_VERIFIER,
        execution: FRAME_GAS.expiry,
        data: toHex(quote.validUntil, { size: 8 }),
      }),
      frame(profile, "VERIFY", { scope: "EXECUTION", execution: FRAME_GAS.onlyVerify }),
      frame(profile, "VERIFY", {
        scope: "PAYMENT",
        target: quote.settlement,
        execution: FRAME_GAS.pay,
        data: encodeFunctionData({ abi: OCTANE_PAYMASTER_ABI, functionName: "pay", args: [quote] }),
      }),
      frame(profile, "SENDER", {
        target: quote.token,
        execution: FRAME_GAS.feeExecution,
        state: FRAME_GAS.feeState,
        data: encodeFunctionData({ abi: ERC20_TRANSFER, functionName: "transfer", args: [quote.maker, quote.fee] }),
      }),
      ...args.calls.map((call) =>
        frame(profile, "SENDER", {
          target: call.to,
          execution: FRAME_GAS.callExecution,
          state: FRAME_GAS.callState,
          value: call.value ?? 0n,
          data: call.data,
        }),
      ),
    ],
  });
}

export function signFrameTx(tx: FrameTx, privateKey: Hex): Promise<FrameTx> {
  return signTx(profile, tx, privateKey);
}

export function frameTxHash(tx: FrameTx): Hash {
  return txHash(profile, tx);
}

/** The alt mempool: admits a staked payer that reads USDC storage. */
export async function sendToAltMempool(tx: FrameTx): Promise<Hash> {
  return (await rpc(EF_MEMPOOL_RPC, "eth_sendFrameTransaction", [toWire(tx)])) as Hash;
}

/** The canonical path, used to show that the public mempool rejects this transaction. */
export async function sendToCanonicalMempool(tx: FrameTx): Promise<Hash> {
  if (!EF_EXECUTION_RPC) throw new Error("no execution RPC");
  return (await rpc(EF_EXECUTION_RPC, "eth_sendRawTransaction", [encodeTx(profile, tx)])) as Hash;
}

/** A dry run that costs nothing. Canonical violations in the result are only informational. */
export async function simulateFrameTx(tx: FrameTx): Promise<unknown> {
  if (!EF_EXECUTION_RPC) throw new Error("no execution RPC");
  return rpc(EF_EXECUTION_RPC, "ethrex_simulateFrameTransaction", [encodeTx(profile, tx), "latest", { trace: true }]);
}

/** What the mempool decided and why. It names the rule and slot behind a rejection. */
export async function admissionReport(hash: Hash): Promise<unknown> {
  return rpc(EF_MEMPOOL_RPC, "skandha_explorer_getTransaction", [hash]);
}
