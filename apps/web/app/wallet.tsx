"use client";

import {
  EF_USDC,
  WHITECHAIN_USDT,
  efDevnet,
  fetchFadeScores,
  getQuotes,
  payOnEfDevnet,
  payOnWhitechain,
  unreliableMakers,
  type BoardQuote,
  type Chain,
  type Intent,
  type MerchantOptIn,
  type PaymentResult,
} from "@octane/sdk";
import { ArrowRight, ArrowUp, Check, ChevronRight, Copy, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  createPublicClient,
  erc20Abi,
  http,
  isAddress,
  isAddressEqual,
  parseGwei,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { Corona } from "@/components/corona";
import { EASE } from "@/components/providers";
import { Ticker } from "@/components/ticker";
import { Badge, Button, Detail, External, Skeleton } from "@/components/ui";
import { capitalise, money, shortAddress } from "@/lib/format";
import { INDEXER, MERCHANT, getMarket, whitechain } from "@/lib/market";
import { useMarket } from "@/lib/market-context";
import { useWalletSession } from "@/lib/wallet-session";

const DECIMALS = 6;
const REFRESH_MS = 5_000;
/** Room for the fee to move between showing it and paying it. The payer's signature caps it. */
const FEE_TOLERANCE_PERCENT = 110n;

const devnet = createPublicClient({ chain: efDevnet, transport: http(undefined, { timeout: 8_000, retryCount: 0 }) });

interface Balances {
  usdt: bigint;
  usdc: bigint;
  wbt: bigint;
  eth: bigint;
  transactionsSent: number;
}

interface Plan {
  name: string;
  to: Address;
  amount: bigint;
  chain: Chain;
  symbol: string;
  /** What the wallet recommends: the cheapest maker with a sound record. */
  best: BoardQuote;
  /** Every live quote, cheapest first, including those the wallet passed over. */
  quotes: BoardQuote[];
  others: number;
  /** Undefined until a balance has loaded. */
  held: bigint | undefined;
  /** This recipient is a merchant whose checkout can cover the fee. */
  merchant: boolean;
  /** Cheaper makers passed over because of their fade score. */
  skipped: { style: string; maker: Address }[];
}

type Step =
  | { kind: "idle" }
  | { kind: "thinking" }
  | { kind: "amount"; to: Address }
  | { kind: "confirm"; plan: Plan }
  | { kind: "paying"; plan: Plan }
  | { kind: "paid"; plan: Plan; result: PaymentResult }
  | { kind: "error"; message: string };

const EXAMPLES = ["Pay Rahul 1 USDT", "Rahul ko 1 USDT bhejo"];
/** One step of the payment, set inside the wallet panel. */
const STEP = "animate-rise rounded-2xl bg-raised/50 p-4";

export function Wallet() {
  const { account, address, builtIn, connected } = useWalletSession();
  const [balances, setBalances] = useState<Balances | undefined>();
  const [text, setText] = useState("");
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [settled, setSettled] = useState(0);
  const { rows } = useMarket().whitechain;

  // A different wallet means different balances, so never show the last one's.
  useEffect(() => setBalances(undefined), [address]);

  const refresh = useCallback(async () => {
    if (!address) return;
    // Each chain loads on its own, so a stalled devnet can't blank the USDT balance.
    const [whitechainResult, devnetResult] = await Promise.allSettled([
      Promise.all([
        whitechain.readContract({ address: WHITECHAIN_USDT, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        whitechain.getBalance({ address }),
        whitechain.getTransactionCount({ address }),
      ]),
      Promise.all([
        devnet.readContract({ address: EF_USDC, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        devnet.getBalance({ address }),
      ]),
    ]);
    setBalances((previous) => {
      const next = previous ?? { usdt: 0n, usdc: 0n, wbt: 0n, eth: 0n, transactionsSent: 0 };
      const merged = { ...next };
      if (whitechainResult.status === "fulfilled") {
        [merged.usdt, merged.wbt, merged.transactionsSent] = whitechainResult.value;
      }
      if (devnetResult.status === "fulfilled") [merged.usdc, merged.eth] = devnetResult.value;
      // Nothing has loaded yet: keep showing the placeholder, not a false zero.
      if (!previous && whitechainResult.status === "rejected" && devnetResult.status === "rejected") return previous;
      return merged;
    });
  }, [address]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (text.trim()) void prepare(text);
  }

  async function prepare(request: string) {
    setStep({ kind: "thinking" });
    try {
      const response = await fetch("/api/concierge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: request }),
      });
      const body = (await response.json()) as { intent?: Intent; address?: Address; error?: string };
      const recipient = body.address;
      if (!body.intent) throw new Error(body.error ?? "The concierge didn't answer.");
      if (body.intent.action === "amount" && recipient) return setStep({ kind: "amount", to: recipient });
      if (body.intent.action !== "pay" || !body.address) {
        const reply = body.intent.action === "unknown" ? body.intent.reply : "I couldn't read that.";
        return setStep({ kind: "error", message: reply });
      }

      const chain: Chain = body.intent.token === "USDC" ? "ef-devnet" : "whitechain";
      if (chain === "ef-devnet" && connected) {
        return setStep({
          kind: "error",
          message: "USDC settles with an EIP-8141 frame transaction, which browser wallets can't sign yet. Pay in USDT, or disconnect to use the built-in wallet.",
        });
      }
      const { quotes } = await getQuotes(getMarket(), chain);
      if (quotes.length === 0) throw new Error("No maker is quoting right now. Try again in a moment.");

      // The fade detector: a maker with a poor public record is passed over, even if it's cheapest.
      const scores = await fetchFadeScores(getMarket().reader, {
        indexer: INDEXER,
        makers: quotes.map((entry) => entry.quote.maker),
      }).catch(() => new Map<Address, bigint>());
      const unreliable = unreliableMakers(quotes.map((entry) => entry.quote.maker), scores);
      const faded = quotes.filter((entry) => unreliable.includes(entry.quote.maker));
      const reliable = quotes.filter((entry) => !faded.includes(entry));
      const best = reliable[0];
      if (!best) throw new Error("No maker is quoting right now. Try again in a moment.");

      // Catch this here: a maker would only refuse it, and the payer would learn less.
      const amount = parseUnits(body.intent.amount, DECIMALS);
      const held = chain === "whitechain" ? balances?.usdt : balances?.usdc;
      const isMerchant = chain === "whitechain" && recipient !== undefined && isAddressEqual(recipient, MERCHANT);
      const needed = isMerchant ? amount : amount + best.quote.fee;
      if (held !== undefined && held < needed) {
        return setStep({
          kind: "error",
          message: `You have ${money(held)} ${body.intent.token}. This payment needs ${money(needed)} ${body.intent.token}${isMerchant ? "" : ", including the fee"}.`,
        });
      }

      setStep({
        kind: "confirm",
        plan: {
          name: isAddress(body.intent.to) ? shortAddress(body.intent.to) : body.intent.to,
          to: body.address,
          amount,
          chain,
          symbol: body.intent.token,
          best,
          quotes,
          others: reliable.length - 1,
          held,
          skipped: faded.map((entry) => ({ style: entry.style, maker: entry.quote.maker })),
          merchant: isMerchant,
        },
      });
    } catch (error) {
      setStep({ kind: "error", message: error instanceof Error ? error.message : "Something went wrong." });
    }
  }

  async function merchantOptIn(amount: bigint): Promise<{ terms: MerchantOptIn; signature: Hex }> {
    const response = await fetch("/api/optin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: amount.toString() }),
    });
    if (!response.ok) throw new Error("The merchant's checkout didn't respond.");
    const { terms, signature } = (await response.json()) as {
      terms: { merchant: Address; amount: string; maxFee: string; orderId: Hex; expiry: string };
      signature: Hex;
    };
    return {
      signature,
      terms: { ...terms, amount: BigInt(terms.amount), maxFee: BigInt(terms.maxFee), expiry: BigInt(terms.expiry) },
    };
  }

  function requireBuiltIn() {
    if (!builtIn) throw new Error("The built-in wallet hasn't loaded yet.");
    return builtIn;
  }

  async function pay(plan: Plan, merchantPays: boolean, entry: BoardQuote) {
    if (!account) return;
    setStep({ kind: "paying", plan });
    const maxFee = (entry.quote.fee * FEE_TOLERANCE_PERCENT) / 100n;
    // Only an override binds the payment to one maker. The default can still fall back.
    const chosen = entry.key === plan.best.key ? {} : { maker: entry.quote.maker };
    try {
      const result =
        plan.chain === "whitechain"
          ? await payOnWhitechain(getMarket(), {
              payer: account,
              to: plan.to,
              amount: plan.amount,
              maxFee,
              avoid: plan.skipped.map((skipped) => skipped.maker),
              ...chosen,
              ...(merchantPays ? { merchantOptIn: await merchantOptIn(plan.amount) } : {}),
            })
          : await payOnEfDevnet(getMarket(), {
              sender: requireBuiltIn().account.address,
              privateKey: requireBuiltIn().key,
              payments: [{ to: plan.to, amount: plan.amount }],
              maxFee,
              maxFeePerGas: parseGwei("2"),
              avoid: plan.skipped.map((skipped) => skipped.maker),
              ...chosen,
            });
      setStep({ kind: "paid", plan, result });
      setSettled((count) => count + 1);
      setText("");
      void refresh();
    } catch (error) {
      setStep({ kind: "error", message: error instanceof Error ? error.message : "The payment didn't go through." });
    }
  }

  const busy = step.kind === "thinking" || step.kind === "paying";
  const empty = connected !== undefined && balances !== undefined && balances.usdt === 0n;

  return (
    <main className="relative">
      <Corona makers={rows.length} pulse={settled} />

      <div className="relative mx-auto grid max-w-6xl gap-4 px-4 pb-32 sm:px-6 md:pb-24 lg:grid-cols-[minmax(0,1fr)_440px] lg:gap-16 lg:pt-16">
        <section className="flex min-h-[316px] flex-col items-center justify-center text-center lg:min-h-0 lg:items-start lg:justify-start lg:pt-16 lg:text-left">
          <h1 className="headline max-w-[10ch] text-[42px] sm:text-5xl lg:max-w-[9ch] lg:text-[92px]">
            No gas token <em>needed.</em>
          </h1>
          <p className="mt-3 max-w-[24ch] text-sm leading-relaxed text-ink-2 sm:text-base lg:mt-7 lg:max-w-sm lg:text-lg">
            One fee in stablecoins. Makers compete to pay your gas.
          </p>
          <LiveQuotes />
        </section>

        <section className="min-w-0">
          <div className="spot rounded-3xl border border-line-strong bg-surface/85 p-5 shadow-[0_40px_90px_-40px_rgb(0_0_0/0.95)] backdrop-blur-md sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-ink-3">Balance</p>
              <p className="text-xs text-ink-3" data-testid="wallet-kind">
                {connected ? connected.wallet.name : "Built-in wallet"}
              </p>
            </div>
            <p className="figure mt-2 text-[52px] leading-none sm:text-6xl" data-testid="usdt-balance">
              {balances ? <Balance value={balances.usdt} /> : <Skeleton className="h-12 w-44 align-bottom" />}{" "}
              <span className="font-sans text-lg font-medium tracking-normal text-ink-3">USDT</span>
            </p>
            {balances && balances.usdc > 0n && <p className="mt-2 text-sm tabular-nums text-ink-2">{money(balances.usdc)} USDC</p>}
            <p className="mt-3 text-[13px] text-ink-3" data-testid="gas-proof">
              Gas tokens held: {balances ? (balances.wbt + balances.eth).toString() : "–"} · Transactions you've sent:{" "}
              {balances ? balances.transactionsSent : "–"}
            </p>

            {empty && (
              <p className="mt-3 rounded-xl bg-caution-soft px-3 py-2 text-[13px] leading-relaxed text-caution">
                This wallet holds no USDT on Whitechain Sepolia yet. Send some to it, and it can pay with no gas token.
              </p>
            )}

            <form onSubmit={submit} className="mt-6">
              <label htmlFor="request" className="sr-only">
                Who do you want to pay? Type a request or paste an address.
              </label>
              <div className="flex items-center gap-2 rounded-2xl border border-line-strong bg-canvas/60 p-1.5 pl-4 transition-[border-color,box-shadow] duration-200 focus-within:border-accent/70 focus-within:shadow-[0_0_0_4px_rgb(255_107_44/0.13)]">
                <input
                  id="request"
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Pay Rahul 10 USDT or paste 0x…"
                  autoComplete="off"
                  className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
                />
                <button
                  type="submit"
                  aria-label="Continue"
                  disabled={busy || !text.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-canvas transition-[background-color,transform] duration-200 hover:bg-accent-bright active:scale-95 disabled:cursor-not-allowed disabled:bg-raised disabled:text-ink-3"
                >
                  <ArrowUp size={18} strokeWidth={2.4} aria-hidden />
                </button>
              </div>
            </form>

            {step.kind === "idle" && !text && (
              <div className="mt-3 flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setText(example)}
                    className="rounded-lg border border-line px-2.5 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}

            <div aria-live="polite">
              {step.kind !== "idle" && <div className="mt-4" />}
              {step.kind === "thinking" && <Progress title="Finding the best price" />}
              {step.kind === "error" && (
                <div data-testid="error" className="flex animate-rise gap-2.5 rounded-2xl bg-caution-soft px-4 py-3 text-sm leading-relaxed text-caution">
                  <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden />
                  <p className="min-w-0">{step.message}</p>
                </div>
              )}
              {step.kind === "amount" && (
                <AmountPrompt
                  to={step.to}
                  onSubmit={(amount) => void prepare(`Pay ${step.to} ${amount}`)}
                  onCancel={() => setStep({ kind: "idle" })}
                />
              )}
              {step.kind === "confirm" && <Confirm plan={step.plan} onPay={pay} onCancel={() => setStep({ kind: "idle" })} />}
              {step.kind === "paying" && (
                <Progress
                  title={`Paying ${step.plan.name} ${money(step.plan.amount)} ${step.plan.symbol}`}
                  detail="A maker is paying the gas and settling this onchain."
                />
              )}
              {step.kind === "paid" && <Receipt plan={step.plan} result={step.result} />}
            </div>
          </div>

          <div className="mt-3 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface/70 backdrop-blur-md">
            {address && (
              <Link
                href={`/history?payer=${address}`}
                className="group flex items-center justify-between gap-4 px-5 py-3.5 text-sm text-ink-2 transition-colors hover:text-ink"
              >
                Your gas spend
                <ChevronRight size={16} className="text-ink-3 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </Link>
            )}
            <div className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm text-ink-2">Your address</p>
                <p className="mt-1 break-all font-mono text-xs text-ink-3" data-testid="address">
                  {address ?? "–"}
                </p>
              </div>
              {address && <CopyButton value={address} />}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

/** The live top of the market, on wide screens where there's room beside the wallet. */
function LiveQuotes() {
  const { rows } = useMarket().whitechain;
  return (
    <div className="mt-12 hidden w-full max-w-sm lg:block">
      <p className="mb-1 text-[13px] text-ink-3">Competing for your payment now</p>
      <AnimatePresence initial={false}>
        {rows.slice(0, 3).map((row, index) => (
          <motion.div
            key={row.key}
            layout
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="flex items-center justify-between gap-4 border-b border-line py-2.5 text-sm"
          >
            <span className={index === 0 ? "font-medium" : "text-ink-2"}>{capitalise(row.style)}</span>
            <span className={`figure text-[15px] ${index === 0 ? "text-accent-bright" : "text-ink-2"}`}>
              <Ticker value={money(row.quote.fee)} />
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
      <Link href="/board" className="group mt-3 inline-flex items-center gap-1 text-sm text-ink-2 transition-colors hover:text-ink">
        Open the market
        <ArrowRight size={14} className="transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

/** Cents stand out and the digits past them recede, with nothing rounded away. */
function Balance({ value }: { value: bigint }) {
  const text = money(value);
  return <Ticker value={text} dimFrom={text.indexOf(".") + 3} />;
}

function Progress({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className={STEP}>
      <p className="text-sm tabular-nums">{title}</p>
      {detail && <p className="mt-0.5 text-[13px] text-ink-3">{detail}</p>}
      <div className="mt-3 h-0.5 overflow-hidden rounded-full bg-line">
        <span className="block h-full w-1/3 animate-sweep rounded-full bg-accent" />
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      // Clipboard access can be blocked. The address stays selectable.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : "Copy address"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
    >
      {copied ? <Check size={16} className="text-accent" aria-hidden /> : <Copy size={16} aria-hidden />}
    </button>
  );
}

function AmountPrompt({ to, onSubmit, onCancel }: { to: Address; onSubmit: (amount: string) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (amount.trim()) onSubmit(amount.trim());
  }

  return (
    <div className={STEP}>
      <form onSubmit={submit} data-testid="amount-prompt">
        <p className="text-sm text-ink-3">Sending to</p>
        <p className="mt-1 break-all font-mono text-[13px] leading-relaxed text-ink">{to}</p>
        <label htmlFor="amount" className="mt-4 block text-sm text-ink-3">
          How much?
        </label>
        <input
          id="amount"
          autoFocus
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="10 USDT"
          autoComplete="off"
          className="mt-1.5 h-10 w-full rounded-lg border border-line-strong bg-transparent px-3 text-[15px] tabular-nums outline-none transition-colors placeholder:text-ink-3 focus:border-ink-2"
        />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={!amount.trim()}>
            Continue
          </Button>
        </div>
      </form>
    </div>
  );
}

function Confirm({
  plan,
  onPay,
  onCancel,
}: {
  plan: Plan;
  onPay: (plan: Plan, merchantPays: boolean, entry: BoardQuote) => void;
  onCancel: () => void;
}) {
  const [merchantPays, setMerchantPays] = useState(false);
  const [chosen, setChosen] = useState(plan.best);
  const [picking, setPicking] = useState(false);

  const isSkipped = (entry: BoardQuote) => plan.skipped.some((skipped) => isAddressEqual(skipped.maker, entry.quote.maker));
  const overridden = chosen.key !== plan.best.key;
  const fee = chosen.quote.fee;
  const canMerchantPay = plan.merchant && fee < plan.amount;
  const covered = merchantPays && canMerchantPay;
  const total = covered ? plan.amount : plan.amount + fee;
  const short = plan.held !== undefined && plan.held < total;
  const style = capitalise(chosen.style);

  return (
    <div className={STEP}>
      <p className="text-sm text-ink-3">Review payment</p>
      <p className="figure mt-1 text-3xl">
        {money(plan.amount)} {plan.symbol}
      </p>
      <p className="mt-0.5 text-sm text-ink-2">to {plan.name}</p>
      <p data-testid="recipient" className="mt-1 break-all font-mono text-xs leading-relaxed text-ink-3">
        {plan.to}
      </p>

      <dl className="mt-3 divide-y divide-line border-t border-line">
        <Detail label="Fee">
          {covered ? (
            <span className="text-ink-3">
              <s>{money(fee)}</s> {plan.name} covers it
            </span>
          ) : (
            `${money(fee)} ${plan.symbol}`
          )}
        </Detail>
        <Detail label="You pay">
          <span className="font-medium">
            {money(total)} {plan.symbol}
          </span>
        </Detail>
        <Detail label="Maker">
          <span className="inline-flex items-center gap-2">
            {!overridden && plan.others > 0 && <Badge tone="accent">Cheapest of {plan.others + 1}</Badge>}
            {style}
            {plan.quotes.length > 1 && (
              <button
                type="button"
                onClick={() => setPicking(!picking)}
                aria-expanded={picking}
                className="text-[13px] text-ink-3 underline underline-offset-2 transition-colors hover:text-ink"
              >
                {picking ? "Done" : "Change"}
              </button>
            )}
          </span>
        </Detail>
      </dl>

      {!covered && (
        <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
          Makers reprice every 10 seconds, so the final fee can move. It can't go above {money((fee * FEE_TOLERANCE_PERCENT) / 100n)} {plan.symbol}.
        </p>
      )}

      {picking && (
        <fieldset data-testid="maker-picker" className="mt-1 animate-rise divide-y divide-line overflow-hidden rounded-xl border border-line">
          <legend className="sr-only">Choose a maker</legend>
          {plan.quotes.map((entry) => (
            <label
              key={entry.key}
              className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-canvas/40 has-[:checked]:bg-accent-soft"
            >
              <span className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
                <input
                  type="radio"
                  name="maker"
                  value={entry.style}
                  checked={entry.key === chosen.key}
                  onChange={() => setChosen(entry)}
                  className="accent-accent"
                />
                {capitalise(entry.style)}
                {entry.key === plan.best.key && <Badge tone="accent">Recommended</Badge>}
                {isSkipped(entry) && <Badge tone="caution">Poor record</Badge>}
              </span>
              <span className="shrink-0 tabular-nums text-ink-2">{money(entry.quote.fee)}</span>
            </label>
          ))}
        </fieldset>
      )}

      {!overridden && plan.skipped.length > 0 && (
        <p className="mt-1 text-[13px] leading-relaxed text-caution">
          Passed over {new Intl.ListFormat("en").format(plan.skipped.map((entry) => capitalise(entry.style)))}: too many failed deliveries.
        </p>
      )}
      {overridden && (
        <p data-testid="override-note" className={`mt-2 text-[13px] leading-relaxed ${isSkipped(chosen) ? "text-caution" : "text-ink-3"}`}>
          {isSkipped(chosen) ? `${style} has too many failed deliveries. ` : ""}If {style} can't deliver, this payment stops and won't move to another maker.
        </p>
      )}
      {short && (
        <p className="mt-2 text-[13px] leading-relaxed text-caution">
          You have {money(plan.held ?? 0n)} {plan.symbol}. With this maker the payment needs {money(total)} {plan.symbol}.
        </p>
      )}

      {canMerchantPay && (
        <label className="mt-2 flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-canvas/50 px-3 py-2.5 text-sm text-ink-2">
          {plan.name} offers to cover the fee
          <input
            type="checkbox"
            data-testid="merchant-pays"
            checked={merchantPays}
            onChange={(event) => setMerchantPays(event.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="relative h-5 w-9 shrink-0 rounded-full bg-line-strong transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-ink after:transition-transform peer-checked:bg-accent peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent"
          />
        </label>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={short} onClick={() => onPay(plan, covered, chosen)}>
          Confirm
        </Button>
      </div>
    </div>
  );
}

function Receipt({ plan, result }: { plan: Plan; result: PaymentResult }) {
  const merchantCovered = result.feePaidBy === "merchant";
  return (
    <div className={STEP}>
      <div className="flex items-center gap-3">
        <motion.span
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 420, damping: 22 }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-canvas shadow-[0_0_28px_rgb(255_107_44/0.6)]"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
            />
          </svg>
        </motion.span>
        <p className="min-w-0 text-[15px] font-medium tabular-nums">
          Paid {plan.name} {money(plan.amount)} {plan.symbol}
        </p>
      </div>
      <dl className="mt-3 divide-y divide-line border-t border-line">
        <Detail label={merchantCovered ? `Fee, covered by ${plan.name}` : "Fee"}>
          {money(result.fee)} {plan.symbol}
        </Detail>
        <Detail label="Settled by">{capitalise(result.makerStyle)}</Detail>
      </dl>
      <div className="mt-2">
        <External href={result.explorerUrl}>View receipt</External>
      </div>
    </div>
  );
}
