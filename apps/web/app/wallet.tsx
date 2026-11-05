"use client";

import {
  EF_USDC,
  WHITECHAIN_USDT,
  getQuotes,
  payOnEfDevnet,
  payOnWhitechain,
  type BoardQuote,
  type Chain,
  type Intent,
  type PaymentResult,
} from "@octane/sdk";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPublicClient, erc20Abi, formatUnits, http, parseGwei, parseUnits, type Address, type Hex } from "viem";
import { efDevnet } from "@octane/sdk";
import type { PrivateKeyAccount } from "viem/accounts";
import { getMarket, whitechain } from "@/lib/market";
import { loadWallet } from "@/lib/wallet";

const DECIMALS = 6;
const REFRESH_MS = 5_000;
/** Room for the fee to move between showing it and paying it. The payer's signature caps it. */
const FEE_TOLERANCE_PERCENT = 110n;

const devnet = createPublicClient({ chain: efDevnet, transport: http() });

interface Balances {
  usdt: bigint;
  usdc: bigint;
  gasTokens: bigint;
  transactionsSent: number;
}

interface Plan {
  name: string;
  to: Address;
  amount: bigint;
  chain: Chain;
  symbol: string;
  best: BoardQuote;
  others: number;
}

type Step =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "confirm"; plan: Plan }
  | { kind: "paying"; plan: Plan }
  | { kind: "paid"; plan: Plan; result: PaymentResult }
  | { kind: "error"; message: string };

const money = (value: bigint) => formatUnits(value, DECIMALS);

export function Wallet() {
  const [wallet, setWallet] = useState<{ key: Hex; account: PrivateKeyAccount } | undefined>();
  const [balances, setBalances] = useState<Balances | undefined>();
  const [text, setText] = useState("");
  const [step, setStep] = useState<Step>({ kind: "idle" });

  useEffect(() => setWallet(loadWallet()), []);

  const address = wallet?.account.address;

  const refresh = useCallback(async () => {
    if (!address) return;
    try {
      const [usdt, wbt, sent, usdc, eth] = await Promise.all([
        whitechain.readContract({ address: WHITECHAIN_USDT, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        whitechain.getBalance({ address }),
        whitechain.getTransactionCount({ address }),
        devnet.readContract({ address: EF_USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        devnet.getBalance({ address }),
      ]);
      setBalances({ usdt, usdc, gasTokens: wbt + eth, transactionsSent: sent });
    } catch {
      // A failed read keeps the last balances on screen; the next refresh tries again.
    }
  }, [address]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  async function prepare(event: React.FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    setStep({ kind: "thinking" });
    try {
      const response = await fetch("/api/concierge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const body = (await response.json()) as { intent?: Intent; address?: Address; error?: string };
      if (!body.intent) throw new Error(body.error ?? "The concierge didn't answer.");
      if (body.intent.action !== "pay" || !body.address) {
        const reply = body.intent.action === "unknown" ? body.intent.reply : "I couldn't read that.";
        return setStep({ kind: "error", message: reply });
      }

      const chain: Chain = body.intent.token === "USDC" ? "ef-devnet" : "whitechain";
      const { quotes } = await getQuotes(getMarket(), chain);
      const best = quotes[0];
      if (!best) throw new Error("No maker is quoting right now. Try again in a moment.");

      setStep({
        kind: "confirm",
        plan: {
          name: body.intent.to,
          to: body.address,
          amount: parseUnits(body.intent.amount, DECIMALS),
          chain,
          symbol: body.intent.token,
          best,
          others: quotes.length - 1,
        },
      });
    } catch (error) {
      setStep({ kind: "error", message: error instanceof Error ? error.message : "Something went wrong." });
    }
  }

  async function pay(plan: Plan) {
    if (!wallet) return;
    setStep({ kind: "paying", plan });
    const maxFee = (plan.best.quote.fee * FEE_TOLERANCE_PERCENT) / 100n;
    try {
      const result =
        plan.chain === "whitechain"
          ? await payOnWhitechain(getMarket(), { payer: wallet.account, to: plan.to, amount: plan.amount, maxFee })
          : await payOnEfDevnet(getMarket(), {
              sender: wallet.account.address,
              privateKey: wallet.key,
              payments: [{ to: plan.to, amount: plan.amount }],
              maxFee,
              maxFeePerGas: parseGwei("2"),
            });
      setStep({ kind: "paid", plan, result });
      setText("");
      void refresh();
    } catch (error) {
      setStep({ kind: "error", message: error instanceof Error ? error.message : "The payment didn't go through." });
    }
  }

  const busy = step.kind === "thinking" || step.kind === "paying";

  return (
    <section>
      <div className="rounded-2xl border border-zinc-800 p-6">
        <p className="text-sm text-zinc-400">Your balance</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums" data-testid="usdt-balance">
          {balances ? money(balances.usdt) : "…"} <span className="text-xl text-zinc-400">USDT</span>
        </p>
        {balances && balances.usdc > 0n && (
          <p className="mt-1 text-lg tabular-nums text-zinc-300">{money(balances.usdc)} USDC</p>
        )}
        <p className="mt-3 text-sm text-zinc-500" data-testid="gas-proof">
          No gas token needed. Gas tokens held: {balances ? balances.gasTokens.toString() : "…"} · Transactions you've sent:{" "}
          {balances ? balances.transactionsSent : "…"}
        </p>
      </div>

      <form onSubmit={prepare} className="mt-6">
        <label htmlFor="request" className="text-sm text-zinc-400">
          What would you like to do?
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="request"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Pay Rahul 10 USDT"
            autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-orange-500"
          />
          <button
            type="submit"
            disabled={busy || !text.trim()}
            className="rounded-xl bg-orange-500 px-5 py-3 font-medium text-black disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      </form>

      <div className="mt-6" aria-live="polite">
        {step.kind === "thinking" && <p className="text-zinc-400">Finding the best price…</p>}
        {step.kind === "error" && <p className="text-amber-400">{step.message}</p>}
        {step.kind === "confirm" && <Confirm plan={step.plan} onPay={pay} onCancel={() => setStep({ kind: "idle" })} />}
        {step.kind === "paying" && <p className="text-zinc-400">Paying {step.plan.name}…</p>}
        {step.kind === "paid" && <Receipt plan={step.plan} result={step.result} />}
      </div>

      <details className="mt-10 text-sm text-zinc-500">
        <summary className="cursor-pointer">Receive money</summary>
        <p className="mt-2 break-all font-mono" data-testid="address">
          {address ?? "…"}
        </p>
      </details>
    </section>
  );
}

function Confirm({ plan, onPay, onCancel }: { plan: Plan; onPay: (plan: Plan) => void; onCancel: () => void }) {
  const fee = plan.best.quote.fee;
  const reason = useMemo(() => {
    const competitors = plan.others === 1 ? "1 other maker" : `${plan.others} other makers`;
    return plan.others > 0 ? `${plan.best.style} is cheapest of ${competitors} quoting now.` : `${plan.best.style} is quoting now.`;
  }, [plan]);

  return (
    <div className="rounded-2xl border border-orange-500/70 bg-orange-500/5 p-6">
      <p className="text-lg font-medium">
        Pay {plan.name} {money(plan.amount)} {plan.symbol}
      </p>
      <p className="mt-1 text-zinc-300">
        Fee {money(fee)} {plan.symbol}. Total {money(plan.amount + fee)} {plan.symbol}.
      </p>
      <p className="mt-1 text-sm capitalize text-zinc-400">{reason}</p>
      <div className="mt-4 flex gap-2">
        <button onClick={() => onPay(plan)} className="rounded-xl bg-orange-500 px-5 py-2 font-medium text-black">
          Confirm
        </button>
        <button onClick={onCancel} className="rounded-xl border border-zinc-700 px-5 py-2 text-zinc-300">
          Cancel
        </button>
      </div>
    </div>
  );
}

function Receipt({ plan, result }: { plan: Plan; result: PaymentResult }) {
  return (
    <div className="rounded-2xl border border-emerald-500/50 bg-emerald-500/5 p-6">
      <p className="text-lg font-medium">
        Paid {plan.name} {money(plan.amount)} {plan.symbol}
      </p>
      <p className="mt-1 text-sm capitalize text-zinc-400">
        Fee {money(result.fee)} {plan.symbol} to {result.makerStyle}.
      </p>
      <a href={result.explorerUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm text-orange-400 underline">
        View receipt
      </a>
    </div>
  );
}
