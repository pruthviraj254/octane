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
import { ArrowUp, Check, ChevronRight, Copy, LoaderCircle, TriangleAlert } from "lucide-react";
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
import type { PrivateKeyAccount } from "viem/accounts";
import { Badge, Button, Card, Detail, External, Skeleton } from "@/components/ui";
import { capitalise, money, shortAddress } from "@/lib/format";
import { INDEXER, MERCHANT, getMarket, whitechain } from "@/lib/market";
import { loadWallet } from "@/lib/wallet";

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

export function Wallet() {
  const [wallet, setWallet] = useState<{ key: Hex; account: PrivateKeyAccount } | undefined>();
  const [balances, setBalances] = useState<Balances | undefined>();
  const [text, setText] = useState("");
  const [step, setStep] = useState<Step>({ kind: "idle" });

  useEffect(() => setWallet(loadWallet()), []);

  const address = wallet?.account.address;

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

  async function pay(plan: Plan, merchantPays: boolean, entry: BoardQuote) {
    if (!wallet) return;
    setStep({ kind: "paying", plan });
    const maxFee = (entry.quote.fee * FEE_TOLERANCE_PERCENT) / 100n;
    // Only an override binds the payment to one maker. The default can still fall back.
    const chosen = entry.key === plan.best.key ? {} : { maker: entry.quote.maker };
    try {
      const result =
        plan.chain === "whitechain"
          ? await payOnWhitechain(getMarket(), {
              payer: wallet.account,
              to: plan.to,
              amount: plan.amount,
              maxFee,
              avoid: plan.skipped.map((skipped) => skipped.maker),
              ...chosen,
              ...(merchantPays ? { merchantOptIn: await merchantOptIn(plan.amount) } : {}),
            })
          : await payOnEfDevnet(getMarket(), {
              sender: wallet.account.address,
              privateKey: wallet.key,
              payments: [{ to: plan.to, amount: plan.amount }],
              maxFee,
              maxFeePerGas: parseGwei("2"),
              ...chosen,
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
    <section className="animate-rise">
      <p className="text-sm text-ink-3">Balance</p>
      <p className="mt-2 text-[44px] font-semibold leading-none tracking-tight tabular-nums sm:text-5xl" data-testid="usdt-balance">
        {balances ? <Balance value={balances.usdt} /> : <Skeleton className="h-10 w-40 align-bottom" />}{" "}
        <span className="text-lg font-medium tracking-normal text-ink-3">USDT</span>
      </p>
      {balances && balances.usdc > 0n && (
        <p className="mt-2 text-sm tabular-nums text-ink-2">{money(balances.usdc)} USDC</p>
      )}
      <p className="mt-3 text-[13px] text-ink-3" data-testid="gas-proof">
        No gas token needed. Gas tokens held: {balances ? (balances.wbt + balances.eth).toString() : "–"} · Transactions you've sent:{" "}
        {balances ? balances.transactionsSent : "–"}
      </p>

      <form onSubmit={submit} className="mt-8">
        <label htmlFor="request" className="sr-only">
          Who do you want to pay? Type a request or paste an address.
        </label>
        <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-surface p-1.5 pl-4 transition-colors focus-within:border-ink-2">
          <input
            id="request"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Pay Rahul 10 USDT, or paste an address"
            autoComplete="off"
            className="h-9 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-3"
          />
          <button
            type="submit"
            aria-label="Continue"
            disabled={busy || !text.trim()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink text-canvas transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-raised disabled:text-ink-3"
          >
            <ArrowUp size={18} aria-hidden />
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
              className="rounded-lg border border-line px-3 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            >
              {example}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4" aria-live="polite">
        {step.kind === "thinking" && <Progress title="Finding the best price" />}
        {step.kind === "error" && (
          <div data-testid="error" className="flex animate-rise gap-2.5 rounded-xl bg-caution-soft px-4 py-3 text-sm leading-relaxed text-caution">
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

      <div className="mt-10 divide-y divide-line border-y border-line">
        {address && (
          <Link
            href={`/history?payer=${address}`}
            className="flex items-center justify-between gap-4 py-3.5 text-sm text-ink-2 transition-colors hover:text-ink"
          >
            Your gas spend
            <ChevronRight size={16} className="text-ink-3" aria-hidden />
          </Link>
        )}
        <div className="flex items-center justify-between gap-4 py-3.5">
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
  );
}

/** Cents stand out and the digits past them recede, with nothing rounded away. */
function Balance({ value }: { value: bigint }) {
  const text = money(value);
  const cents = text.indexOf(".") + 3;
  return (
    <>
      {text.slice(0, cents)}
      <span className="text-ink-3">{text.slice(cents)}</span>
    </>
  );
}

function Progress({ title, detail }: { title: string; detail?: string }) {
  return (
    <Card className="flex animate-rise items-start gap-3 px-4 py-3.5">
      <LoaderCircle size={16} className="mt-0.5 shrink-0 animate-spin text-ink-3" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm tabular-nums">{title}</p>
        {detail && <p className="mt-0.5 text-[13px] text-ink-3">{detail}</p>}
      </div>
    </Card>
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
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
    >
      {copied ? <Check size={16} className="text-positive" aria-hidden /> : <Copy size={16} aria-hidden />}
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
    <Card className="animate-rise p-4 sm:p-5">
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
    </Card>
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
    <Card className="animate-rise p-4 sm:p-5">
      <p className="text-sm text-ink-3">Review payment</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
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
        <fieldset data-testid="maker-picker" className="mt-1 animate-rise divide-y divide-line overflow-hidden rounded-lg border border-line">
          <legend className="sr-only">Choose a maker</legend>
          {plan.quotes.map((entry) => (
            <label
              key={entry.key}
              className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-raised has-[:checked]:bg-raised"
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
        <label className="mt-2 flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-raised px-3 py-2.5 text-sm text-ink-2">
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
    </Card>
  );
}

function Receipt({ plan, result }: { plan: Plan; result: PaymentResult }) {
  const merchantCovered = result.feePaidBy === "merchant";
  return (
    <Card className="animate-rise p-4 sm:p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-positive-soft text-positive">
          <Check size={14} strokeWidth={2.5} aria-hidden />
        </span>
        <p className="text-[15px] font-medium tabular-nums">
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
    </Card>
  );
}
