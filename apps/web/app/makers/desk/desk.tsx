"use client";

import { explorerTx } from "@octane/sdk";
import { ArrowLeft, Bot, Check, Clock, Copy, Fuel, Hand, Link2, Plus, Power, Undo2, WalletCards } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { parseEther, parseUnits, type Hash } from "viem";
import { motion } from "motion/react";
import { PricingNote } from "@/components/pricing-note";
import { EASE } from "@/components/providers";
import { Ticker } from "@/components/ticker";
import { Badge, Button, Card, Empty, External, LiveDot, PageHeader, SectionTitle, Skeleton } from "@/components/ui";
import { capitalise, money, shortAddress } from "@/lib/format";
import type { DeskInfo, MarketName } from "@/lib/desk";
import { linkMessage } from "@/lib/owner";
import { useWalletSession } from "@/lib/wallet-session";

const POLL_MS = 4_000;
const MIN_WBT = 0.01;
const MIN_TGLM = 0.01;
const MIN_RATE = 0.065;
const MAX_RATE = 0.5;
const SEND_WBT = parseEther("0.02");
const RATE_HINT = "Between 0.065 and 0.50. Below 0.065 a payment can cost you more in gas than it earns.";
const LIMITS = [
  { label: "5 min", seconds: 300 },
  { label: "30 min", seconds: 1_800 },
  { label: "2 hours", seconds: 7_200 },
];

type Act = (body: Record<string, unknown>) => Promise<boolean>;
type ActWithResult = (body: Record<string, unknown>) => Promise<{ output?: string; error?: string }>;

function useDesks() {
  const [desks, setDesks] = useState<DeskInfo[] | undefined>();
  const [aiReady, setAiReady] = useState(true);
  const [problem, setProblem] = useState<string | undefined>();
  const [isPublicSite, setIsPublicSite] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/desk", { cache: "no-store" });
      if (response.status === 403) {
        setIsPublicSite(true);
        return;
      }
      const body = (await response.json()) as { desks?: DeskInfo[]; aiConfigured?: boolean; error?: string };
      if (body.desks) {
        setDesks(body.desks);
        setAiReady(body.aiConfigured === true);
        setProblem(undefined);
      } else {
        setProblem(body.error ?? "The desk didn't answer.");
      }
    } catch {
      // The next poll tries again.
    }
  }, []);

  useEffect(() => {
    if (isPublicSite) return;
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh, isPublicSite]);

  const act: Act = useCallback(
    async (body) => {
      setProblem(undefined);
      const response = await fetch("/api/desk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) setProblem(result.error ?? "That didn't work.");
      await refresh();
      return response.ok;
    },
    [refresh],
  );

  const actWithResult: ActWithResult = useCallback(
    async (body) => {
      const response = await fetch("/api/desk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { output?: string; error?: string };
      await refresh();
      return result;
    },
    [refresh],
  );

  return { desks, aiReady, problem, isPublicSite, act, actWithResult };
}

function useNow(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function clock(seconds: number): string {
  const whole = Math.max(0, seconds);
  const hours = Math.floor(whole / 3_600);
  const minutes = Math.floor((whole % 3_600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${minutes}:${rest}`;
}

function toBase(rate: string): bigint | undefined {
  try {
    return parseUnits(rate, 6);
  } catch {
    return undefined;
  }
}

function rateProblem(rate: string): string | undefined {
  const value = Number(rate);
  if (!rate.trim() || Number.isNaN(value)) return "Enter a rate.";
  if (value < MIN_RATE || value > MAX_RATE) return `A rate must be between ${MIN_RATE} and ${MAX_RATE.toFixed(2)}.`;
  return undefined;
}

export function DeskPage() {
  const { desks, aiReady, problem, isPublicSite, act, actWithResult } = useDesks();

  return (
    <section>
      <Link href="/makers" className="group mb-6 inline-flex items-center gap-1.5 text-sm text-ink-3 transition-colors hover:text-ink">
        <ArrowLeft size={14} className="transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden />
        All makers
      </Link>
      <PageHeader
        title={
          <>
            Your maker <em>desk.</em>
          </>
        }
        description="Put spare gas tokens to work and earn a stablecoin fee on every payment you carry. Let an AI agent set your price, or set it yourself."
      />

      <div className="mt-8">
        <PricingNote />
      </div>

      {problem && (
        <p data-testid="desk-error" className="mt-4 rounded-2xl bg-caution-soft px-4 py-3 text-sm leading-relaxed text-caution">
          {problem}
        </p>
      )}

      {isPublicSite ? (
        <div data-testid="desk-private" className="mt-4 rounded-2xl bg-canvas/50 px-4 py-4 text-sm leading-relaxed text-ink-2">
          <p className="font-medium text-ink">The desk isn't open on this public site.</p>
          <p className="mt-1">
            It can start and stop makers and move their funds, so it only runs on its owner's machine. To be a maker, run Octane
            yourself and open this page there.{" "}
            <a
              href="https://github.com/pruthviraj254/octane#run-your-own-maker"
              className="underline underline-offset-2 transition-colors hover:text-ink"
            >
              How to run your own maker
            </a>
          </p>
        </div>
      ) : (
        <>
          <NewDesk act={act} aiReady={aiReady} />

          <div className="mt-10">
            <SectionTitle>Makers on this machine</SectionTitle>
            <div className="grid gap-3 lg:grid-cols-2">
              {desks === undefined && <Skeleton className="block h-80 w-full rounded-2xl" />}
              {desks?.length === 0 && <Empty>No makers yet. Set one up above.</Empty>}
              {desks?.map((desk, index) => (
                <motion.div
                  key={desk.name}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.05, ease: EASE }}
                >
                  <DeskCard desk={desk} act={act} actWithResult={actWithResult} aiReady={aiReady} />
                </motion.div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

type Where = MarketName | "both";

const WHERE: { key: Where; label: string; needs: string; carries: string }[] = [
  { key: "whitechain", label: "Whitechain", needs: "Spare WBT", carries: "Carries USDT payments" },
  { key: "ef-devnet", label: "EF devnet", needs: "Spare ETH", carries: "Your staked paymaster carries USDC payments" },
  { key: "both", label: "Both", needs: "Spare WBT and ETH", carries: "Carries USDT and USDC payments" },
];

function MarketChoice({ where, onChange }: { where: Where | undefined; onChange: (where: Where) => void }) {
  return (
    <div>
      <p className="text-[13px] text-ink-3">Where do you want to be a maker?</p>
      <div role="radiogroup" aria-label="Where to be a maker" className="mt-1.5 grid gap-2 sm:grid-cols-3">
        {WHERE.map((option) => {
          const active = option.key === where;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={active}
              data-testid={`market-${option.key}`}
              onClick={() => onChange(option.key)}
              className={`rounded-xl border p-3 text-left transition-colors ${active ? "border-accent/60 bg-accent-soft" : "border-line hover:border-line-strong"}`}
            >
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="mt-0.5 block text-xs text-ink-2">{option.needs}</span>
              <span className="block text-xs text-ink-3">{option.carries}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ModeChoice({ manual, aiReady, aiOff, onChange }: { manual: boolean; aiReady: boolean; aiOff?: string; onChange: (manual: boolean) => void }) {
  const options = [
    { key: true, label: "I'll set the price", hint: "It never moves by itself", icon: Hand, off: false },
    { key: false, label: "AI agent", hint: aiOff ?? (aiReady ? "Reprices with the formula" : "No AI set up on this machine"), icon: Bot, off: !aiReady || aiOff !== undefined },
  ];
  return (
    <div role="radiogroup" aria-label="Who sets the price" className="grid grid-cols-2 gap-2">
      {options.map((option) => {
        const active = option.key === manual;
        return (
          <button
            key={option.label}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={option.off}
            onClick={() => onChange(option.key)}
            className={`rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-accent/60 bg-accent-soft" : "border-line hover:border-line-strong"}`}
          >
            <option.icon size={16} className={active ? "text-accent-bright" : "text-ink-3"} aria-hidden />
            <span className="mt-1.5 block text-sm font-medium">{option.label}</span>
            <span className="block text-xs text-ink-3">{option.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-[13px] text-ink-3">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-3">{hint}</p>}
    </div>
  );
}

const INPUT =
  "h-10 w-full rounded-xl border border-line-strong bg-canvas/50 px-3 text-sm tabular-nums outline-none transition-colors placeholder:text-ink-3 focus:border-accent/70";

function NewDesk({ act, aiReady }: { act: Act; aiReady: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  // Nothing is picked for you: this decides the chain, the funds and the token.
  const [where, setWhere] = useState<Where>();
  const [chosenManual, setManual] = useState(true);
  const [rate, setRate] = useState("0.07");
  const [margin, setMargin] = useState("0.01");
  const [busy, setBusy] = useState(false);
  // The agent prices from Whitechain's pool. The EF devnet has no market to read.
  const efOnly = where === "ef-devnet";
  const manual = chosenManual || efOnly;
  const badRate = manual ? rateProblem(rate) : undefined;
  const unit = efOnly ? "USDC" : where === "both" ? "USDT or USDC" : where === "whitechain" ? "USDT" : "stablecoins";

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const base = toBase(margin);
    const fee = toBase(rate);
    if (base === undefined || fee === undefined || badRate || !where) return;
    setBusy(true);
    const pricing = manual ? { mode: "manual", fee: fee.toString() } : { mode: "auto" };
    const markets = where === "both" ? ["whitechain", "ef-devnet"] : [where];
    if (await act({ action: "create", name: name.trim(), margin: base.toString(), markets, ...pricing })) {
      setName("");
      setOpen(false);
    }
    setBusy(false);
  }

  if (!open) {
    return (
      <div className="mt-6">
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} aria-hidden />
          Become a maker
        </Button>
      </div>
    );
  }

  return (
    <Card className="mt-6 animate-rise p-5 sm:p-6">
      <h2 className="text-lg font-semibold tracking-tight [font-family:var(--font-display)]">Set up a new maker</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-3">
        This creates a desk wallet on this machine, because a maker signs around the clock and a browser wallet would ask you to approve every payment. Your own wallet can own the desk: fund it, then withdraw your earnings back.
      </p>
      <form onSubmit={(event) => void create(event)} className="mt-4 space-y-4">
        <Field label="Maker name" htmlFor="desk-name" hint="Lowercase letters and digits. It's only a label: the choice below sets the chain.">
          <input id="desk-name" value={name} onChange={(event) => setName(event.target.value.toLowerCase())} placeholder="nova" autoComplete="off" maxLength={16} className={INPUT} />
        </Field>
        <MarketChoice where={where} onChange={setWhere} />
        <ModeChoice manual={manual} aiReady={aiReady} {...(efOnly ? { aiOff: "Needs Whitechain's market price" } : {})} onChange={setManual} />
        {manual ? (
          <Field label={`Your rate per payment, in ${unit}`} htmlFor="desk-rate" hint={badRate ?? RATE_HINT}>
            <input id="desk-rate" value={rate} onChange={(event) => setRate(event.target.value)} inputMode="decimal" className={INPUT} />
          </Field>
        ) : (
          <Field label="Your margin, in USDT" htmlFor="desk-margin" hint="Added on top of gas in the agent's formula.">
            <input id="desk-margin" value={margin} onChange={(event) => setMargin(event.target.value)} inputMode="decimal" className={INPUT} />
          </Field>
        )}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || name.trim().length < 2 || badRate !== undefined || !where}>
            {busy ? "Setting up" : where ? "Create desk wallet" : "Choose a market first"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

/** Shows the working, so a person can check the agent's price against the formula. */
function AiPrice({ desk }: { desk: DeskInfo }) {
  if (!desk.formula || !desk.gasCost) {
    return <p className="text-[13px] leading-relaxed text-ink-3">The agent's working appears here once it's live.</p>;
  }
  const buffer = Number(desk.bufferBps ?? 0) / 100;
  const margin = money(BigInt(desk.spread ?? 0));
  return (
    <div className="rounded-xl bg-raised/50 p-3.5" data-testid={`ai-price-${desk.name}`}>
      <p className="text-xs text-ink-3">The agent's price right now</p>
      <p className="mt-1.5 font-mono text-[13px] leading-relaxed text-ink-2">
        {money(BigInt(desk.gasCost))} gas × (1 + {buffer}% AI buffer) + {margin} margin
      </p>
      <p className="figure mt-1 text-xl">
        = <Ticker value={money(BigInt(desk.formula))} /> <span className="font-sans text-xs font-normal tracking-normal text-ink-3">USDT</span>
      </p>
      {desk.formula === String(MIN_RATE * 1e6) && <p className="mt-1 text-xs text-ink-3">Held at the 0.065 minimum.</p>}
      {desk.aiNote && <p className="mt-2 font-serif text-[17px] italic leading-snug text-ink-2">{desk.aiNote}</p>}
      {desk.markets.includes("ef-devnet") && (
        <p className="mt-2 text-xs text-ink-3">This is the Whitechain price. The EF devnet has no market to read, so the agent charges a fixed 0.05 USDC there.</p>
      )}
    </div>
  );
}

/**
 * A browser wallet can't be the wallet that signs here: every payment and quote refresh would
 * need a popup. So it owns the desk instead: it funds it, and earnings can only go back to it.
 */
function OwnerPanel({ desk, actWithResult }: { desk: DeskInfo; actWithResult: ActWithResult }) {
  const { connected } = useWalletSession();
  const [busy, setBusy] = useState<string | undefined>();
  const [message, setMessage] = useState<string | undefined>();
  const [copied, setCopied] = useState(false);
  const owner = desk.control.owner;
  const isOwner = connected !== undefined && owner?.toLowerCase() === connected.address.toLowerCase();
  const earned = Number(desk.usdt ?? 0) + Number(desk.usdc ?? 0);

  async function link() {
    if (!connected) return;
    setBusy("link");
    setMessage(undefined);
    try {
      const signature = await connected.account.signMessage({ message: linkMessage(desk.name, connected.address) });
      const result = await actWithResult({ action: "link", name: desk.name, owner: connected.address, signature });
      if (result.error) setMessage(result.error);
    } catch (error) {
      setMessage((error as { code?: number }).code === 4001 ? "You declined in your wallet." : "Your wallet couldn't sign that.");
    }
    setBusy(undefined);
  }

  async function withdraw() {
    setBusy("withdraw");
    setMessage(undefined);
    const result = await actWithResult({ action: "withdraw", name: desk.name });
    setMessage(result.error ?? result.output?.replace(/: https:\S+/g, "").replace(/\n/g, ". "));
    setBusy(undefined);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(desk.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      // Clipboard access can be blocked. The address is still on the card.
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-line p-3.5" data-testid={`owner-${desk.name}`}>
      <p className="flex items-center gap-2 text-sm font-medium">
        <WalletCards size={15} className="text-ink-3" aria-hidden />
        {owner ? `Owned by ${shortAddress(owner)}` : "Own this desk with your wallet"}
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
        {owner
          ? "Earnings can only go to this wallet. The desk wallet just signs each payment automatically."
          : "Fund the desk from your own wallet, and earnings go back to it. A browser wallet can't sign here itself, because every payment and quote refresh would need a popup."}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {!owner && connected && (
          <Button variant="secondary" disabled={busy !== undefined} onClick={() => void link()}>
            <Link2 size={15} aria-hidden />
            {busy === "link" ? "Check your wallet" : "Link my wallet"}
          </Button>
        )}
        {!owner && !connected && <p className="text-[13px] text-ink-2">Press Connect wallet at the top of the page to start.</p>}
        {owner && (
          <Button variant="secondary" disabled={busy !== undefined || earned === 0 || desk.running} onClick={() => void withdraw()}>
            {busy === "withdraw" ? "Withdrawing" : desk.running ? "Take offline to withdraw" : earned === 0 ? "Nothing to withdraw yet" : "Withdraw earnings to my wallet"}
          </Button>
        )}
        <Button variant="secondary" onClick={() => void copy()}>
          {copied ? <Check size={15} className="text-accent" aria-hidden /> : <Copy size={15} aria-hidden />}
          {copied ? "Copied" : "Copy desk address"}
        </Button>
      </div>
      {owner && connected && !isOwner && <p className="mt-2 text-[13px] text-caution">The wallet connected now isn't this desk's owner.</p>}
      {message && <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{message}</p>}
    </div>
  );
}

function Readout({ label, value, low = false }: { label: string; value: ReactNode; low?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-ink-3">{label}</p>
      <div className={`mt-1 truncate text-sm font-medium tabular-nums ${low ? "text-caution" : ""}`}>{value}</div>
    </div>
  );
}

function DeskCard({ desk, act, actWithResult, aiReady }: { desk: DeskInfo; act: Act; actWithResult: ActWithResult; aiReady: boolean }) {
  const { connected, sendWbt } = useWalletSession();
  const now = useNow();
  const manualNow = desk.control.mode === "manual";
  const hasAgent = desk.control.agent ?? !manualNow;
  const overridden = hasAgent && manualNow;
  const [rate, setRate] = useState(desk.control.fee ? money(BigInt(desk.control.fee)) : "0.07");
  const [busy, setBusy] = useState<string | undefined>();
  const [sent, setSent] = useState<Hash | undefined>();
  const [walletProblem, setWalletProblem] = useState<string | undefined>();

  const wbt = Number(desk.wbt ?? 0);
  const tglm = Number(desk.tglm ?? 0);
  const onWhitechain = desk.markets.includes("whitechain");
  const onDevnet = desk.markets.includes("ef-devnet");
  const needsPaymaster = onDevnet && !desk.paymaster;
  const ready = (!onWhitechain || wbt >= MIN_WBT) && tglm >= MIN_TGLM && !needsPaymaster;
  const unit = onWhitechain && onDevnet ? "USDT or USDC" : onDevnet ? "USDC" : "USDT";
  const secondsLeft = desk.control.until === undefined ? undefined : desk.control.until - now;
  const timeUp = secondsLeft !== undefined && secondsLeft <= 0;
  const badRate = rateProblem(rate);
  const base = toBase(rate);
  const rateChanged = manualNow && base?.toString() !== desk.control.fee;

  async function run(label: string, body: Record<string, unknown>) {
    setBusy(label);
    await act({ name: desk.name, ...body });
    setBusy(undefined);
  }


  async function fundFromWallet() {
    setBusy("wallet");
    setWalletProblem(undefined);
    try {
      setSent(await sendWbt(desk.address, SEND_WBT));
    } catch (error) {
      setWalletProblem((error as { code?: number }).code === 4001 ? "You declined in your wallet." : "Your wallet couldn't send that.");
    }
    setBusy(undefined);
  }

  return (
    <Card className="flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4" data-testid={`desk-${desk.name}`}>
        <div className="min-w-0">
          <h3 className="flex flex-wrap items-center gap-2 text-lg font-semibold tracking-tight [font-family:var(--font-display)]">
            <LiveDot live={desk.live} />
            {capitalise(desk.name)}
            <Badge tone={manualNow ? "accent" : "neutral"}>{overridden ? "AI overridden" : manualNow ? "Own rate" : "AI agent"}</Badge>
            {onWhitechain && <Badge>Whitechain</Badge>}
            {onDevnet && <Badge>EF paymaster</Badge>}
          </h3>
          <p className="mt-1 truncate font-mono text-xs text-ink-3">{shortAddress(desk.address)}</p>
        </div>
        <p className="figure text-2xl">
          {desk.live && desk.fee ? <Ticker value={money(BigInt(desk.fee))} /> : "–"} <span className="font-sans text-xs font-normal tracking-normal text-ink-3">{onWhitechain ? "USDT" : "USDC"}</span>
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-raised/50 p-3.5 sm:grid-cols-4">
        <Readout label="Status" value={desk.live ? "On the board" : desk.running ? "Starting" : "Offline"} />
        <Readout
          label="Time limit"
          value={secondsLeft === undefined ? "None" : timeUp ? "Ended" : <span data-testid={`limit-${desk.name}`}>{clock(secondsLeft)}</span>}
          low={timeUp}
        />
        <Readout
          label="Earned"
          value={
            <>
              {onWhitechain && <span className="block">{Number(desk.usdt ?? 0).toFixed(3)} USDT</span>}
              {onDevnet && <span className="block">{Number(desk.usdc ?? 0).toFixed(3)} USDC</span>}
            </>
          }
        />
        <Readout label="Carried" value={`${desk.relayed} ${desk.relayed === 1 ? "payment" : "payments"}`} />
        {onWhitechain && <Readout label="Gas tank" value={`${wbt.toFixed(4)} WBT`} low={wbt < MIN_WBT} />}
        {onDevnet && <Readout label="Paymaster" value={desk.paymasterEth ? `${Number(desk.paymasterEth).toFixed(4)} ETH` : "Not set up"} low={needsPaymaster} />}
        <Readout label="Arkiv gas" value={`${tglm.toFixed(4)} tGLM`} low={tglm < MIN_TGLM} />
      </div>

      {desk.withdrew && !desk.live && <p className="mt-3 text-[13px] text-ink-3">Left the board: {desk.withdrew}.</p>}
      {desk.aiUnavailable && !manualNow && (
        <p data-testid={`ai-unavailable-${desk.name}`} className="mt-3 text-[13px] leading-relaxed text-caution">
          The AI isn't answering, so this agent is holding a fixed safety buffer until it's back.
        </p>
      )}

      {!ready && (
        <div className="mt-4 rounded-xl bg-caution-soft p-3.5">
          <p className="flex items-center gap-2 text-sm font-medium text-caution">
            <Fuel size={15} aria-hidden />
            This desk needs funds before it can go live
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            {onWhitechain && `At least ${MIN_WBT} WBT to pay gas on Whitechain. `}
            {needsPaymaster && "ETH for your paymaster on the EF devnet: 0.1 to pay gas and 0.012 staked. "}
            {MIN_TGLM} tGLM to keep a quote on Arkiv. On testnet, borrow it from Octane's test wallets.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy !== undefined} onClick={() => void run("fund", { action: "fund" })}>
              {busy === "fund" ? (needsPaymaster ? "Borrowing and staking, about a minute" : "Borrowing") : "Borrow test funds"}
            </Button>
            {connected && onWhitechain && wbt < MIN_WBT && (
              <Button variant="secondary" disabled={busy !== undefined} onClick={() => void fundFromWallet()}>
                {busy === "wallet" ? "Check your wallet" : "Send 0.02 WBT from my wallet"}
              </Button>
            )}
          </div>
          {walletProblem && <p className="mt-2 text-[13px] text-caution">{walletProblem}</p>}
          {sent && (
            <div className="mt-2">
              <External href={explorerTx(1874, sent)}>Sent. View transaction</External>
            </div>
          )}
        </div>
      )}

      <div className="mt-5 space-y-4">
        {desk.paymaster && (
          <div>
            <p className="text-[13px] text-ink-3">Quoting on</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(["whitechain", "ef-devnet"] as const).map((market) => {
                const on = desk.markets.includes(market);
                const next = on ? desk.markets.filter((name) => name !== market) : [...desk.markets, market];
                return (
                  <button
                    key={market}
                    type="button"
                    aria-pressed={on}
                    disabled={busy !== undefined || next.length === 0}
                    onClick={() => void run("markets", { action: "control", markets: next })}
                    className={`rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${on ? "border-accent/60 bg-accent-soft text-ink" : "border-line text-ink-3 hover:border-line-strong"}`}
                  >
                    {market === "whitechain" ? "Whitechain" : "EF devnet"}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {hasAgent && onWhitechain && <AiPrice desk={desk} />}

        {!hasAgent && (
          <p className="text-[13px] leading-relaxed text-ink-3">
            No AI agent on this desk. Your rate holds exactly until you change it, and nothing else can move it.
          </p>
        )}
        {overridden && (
          <p className="text-[13px] leading-relaxed text-caution">
            You've overridden the agent. Payers see your rate of {desk.control.fee ? money(BigInt(desk.control.fee)) : "–"} USDT, and the agent keeps working it out above so you can compare.
          </p>
        )}

        <Field label={hasAgent && !manualNow ? `Force a price, in ${unit}` : `Your rate per payment, in ${unit}`} htmlFor={`rate-${desk.name}`} hint={badRate ?? RATE_HINT}>
          <input id={`rate-${desk.name}`} value={rate} onChange={(event) => setRate(event.target.value)} inputMode="decimal" className={INPUT} />
        </Field>

        <div className="flex flex-wrap gap-2">
          {manualNow ? (
            <Button disabled={busy !== undefined || badRate !== undefined || !rateChanged} onClick={() => void run("save", { action: "control", mode: "manual", fee: base?.toString() })}>
              {busy === "save" ? "Updating" : "Update rate"}
            </Button>
          ) : (
            <Button disabled={busy !== undefined || badRate !== undefined} onClick={() => void run("save", { action: "control", mode: "manual", fee: base?.toString(), agent: true })}>
              {busy === "save" ? "Overriding" : "Override AI price"}
            </Button>
          )}
          {overridden && (
            <Button variant="secondary" disabled={busy !== undefined} onClick={() => void run("back", { action: "control", mode: "auto" })}>
              <Undo2 size={15} aria-hidden />
              {busy === "back" ? "Switching" : "Back to AI price"}
            </Button>
          )}
          {!hasAgent && (
            <Button variant="secondary" disabled={busy !== undefined || !aiReady || !onWhitechain} onClick={() => void run("back", { action: "control", mode: "auto" })}>
              <Bot size={15} aria-hidden />
              {!aiReady ? "No AI on this machine" : !onWhitechain ? "AI needs Whitechain" : busy === "back" ? "Switching" : "Turn on AI agent"}
            </Button>
          )}
          {hasAgent && (
            <Button variant="secondary" disabled={busy !== undefined || badRate !== undefined} onClick={() => void run("off", { action: "control", mode: "manual", fee: base?.toString(), agent: false })}>
              {busy === "off" ? "Switching" : "Remove AI agent"}
            </Button>
          )}
        </div>

        <div>
          <p className="flex items-center gap-1.5 text-[13px] text-ink-3">
            <Clock size={13} aria-hidden />
            {secondsLeft === undefined ? "Add a time limit" : "Extend the time limit"}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {LIMITS.map((limit) => (
              <button
                key={limit.seconds}
                type="button"
                disabled={busy !== undefined}
                onClick={() => void run("limit", { action: "control", addSeconds: limit.seconds })}
                className="rounded-lg border border-line px-2.5 py-1.5 text-[13px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
              >
                + {limit.label}
              </button>
            ))}
            {secondsLeft !== undefined && (
              <button
                type="button"
                disabled={busy !== undefined}
                onClick={() => void run("limit", { action: "control", clearLimit: true })}
                className="rounded-lg px-2.5 py-1.5 text-[13px] text-ink-3 transition-colors hover:text-ink disabled:opacity-50"
              >
                Remove limit
              </button>
            )}
          </div>
        </div>
      </div>

      <OwnerPanel desk={desk} actWithResult={actWithResult} />

      {!desk.paymaster && !onDevnet && (
        <div className="mt-5 rounded-xl border border-line p-3.5">
          <p className="text-sm font-medium">Have spare ETH? Run a paymaster too</p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
            Sponsors USDC payments on the EF devnet from your own staked contract. On testnet this borrows ETH, then stakes 0.012 and funds the paymaster with 0.1.
          </p>
          <Button className="mt-3" variant="secondary" disabled={busy !== undefined || desk.running} onClick={() => void run("paymaster", { action: "fund", paymaster: true })}>
            {busy === "paymaster" ? "Setting up, about a minute" : desk.running ? "Take offline to set up" : "Set up a paymaster"}
          </Button>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {desk.running ? (
          <Button variant="secondary" disabled={busy !== undefined} onClick={() => void run("stop", { action: "stop" })}>
            <Power size={15} aria-hidden />
            {busy === "stop" ? "Stopping" : "Take offline"}
          </Button>
        ) : (
          <Button disabled={busy !== undefined || !ready} onClick={() => void run("start", { action: "start" })}>
            <Power size={15} aria-hidden />
            {busy === "start" ? "Starting" : "Go live"}
          </Button>
        )}
        {!desk.running && desk.live && <p className="text-[13px] text-ink-3">Running from a terminal. Stop it there with Ctrl+C to manage it here.</p>}
      </div>
    </Card>
  );
}
