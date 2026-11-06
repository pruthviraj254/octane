"use client";

import { explorerTx } from "@octane/sdk";
import { ArrowLeft, Bot, Clock, Fuel, Hand, Plus, Power } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { parseEther, parseUnits, type Hash } from "viem";
import { motion } from "motion/react";
import { PricingNote } from "@/components/pricing-note";
import { EASE } from "@/components/providers";
import { Ticker } from "@/components/ticker";
import { Badge, Button, Card, Empty, External, LiveDot, PageHeader, SectionTitle, Skeleton } from "@/components/ui";
import { capitalise, money, shortAddress } from "@/lib/format";
import type { DeskInfo } from "@/lib/desk";
import { useWalletSession } from "@/lib/wallet-session";

const POLL_MS = 4_000;
const MIN_WBT = 0.01;
const MIN_TGLM = 0.01;
const MIN_RATE = 0.065;
const MAX_RATE = 0.5;
const SEND_WBT = parseEther("0.02");
const LIMITS = [
  { label: "5 min", seconds: 300 },
  { label: "30 min", seconds: 1_800 },
  { label: "2 hours", seconds: 7_200 },
];

type Act = (body: Record<string, unknown>) => Promise<boolean>;

function useDesks() {
  const [desks, setDesks] = useState<DeskInfo[] | undefined>();
  const [problem, setProblem] = useState<string | undefined>();

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/desk", { cache: "no-store" });
      const body = (await response.json()) as { desks?: DeskInfo[]; error?: string };
      if (body.desks) {
        setDesks(body.desks);
        setProblem(undefined);
      } else {
        setProblem(body.error ?? "The desk didn't answer.");
      }
    } catch {
      // The next poll tries again.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

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

  return { desks, problem, act };
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
  if (value < MIN_RATE || value > MAX_RATE) return `A rate must be between ${MIN_RATE} and ${MAX_RATE.toFixed(2)} USDT.`;
  return undefined;
}

export function DeskPage() {
  const { desks, problem, act } = useDesks();

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

      <NewDesk act={act} />

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
              <DeskCard desk={desk} act={act} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ModeChoice({ manual, onChange }: { manual: boolean; onChange: (manual: boolean) => void }) {
  const options = [
    { key: false, label: "AI agent", hint: "Reprices itself", icon: Bot },
    { key: true, label: "Set my own rate", hint: "You stay in control", icon: Hand },
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
            onClick={() => onChange(option.key)}
            className={`rounded-xl border p-3 text-left transition-colors ${active ? "border-accent/60 bg-accent-soft" : "border-line hover:border-line-strong"}`}
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

function NewDesk({ act }: { act: Act }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [margin, setMargin] = useState("0.01");
  const [busy, setBusy] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const base = toBase(margin);
    if (base === undefined) return;
    setBusy(true);
    if (await act({ action: "create", name: name.trim(), margin: base.toString() })) {
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
        This creates a desk wallet on this machine. It has to run around the clock to carry payments, so it can't be a wallet that asks you to approve each one.
      </p>
      <form onSubmit={(event) => void create(event)} className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Maker name" htmlFor="desk-name" hint="Lowercase letters and digits. It shows on the market.">
          <input id="desk-name" value={name} onChange={(event) => setName(event.target.value.toLowerCase())} placeholder="nova" autoComplete="off" maxLength={16} className={INPUT} />
        </Field>
        <Field label="AI agent's margin, in USDT" htmlFor="desk-margin" hint="Added on top of gas when an agent prices for you.">
          <input id="desk-margin" value={margin} onChange={(event) => setMargin(event.target.value)} inputMode="decimal" className={INPUT} />
        </Field>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={busy || name.trim().length < 2}>
            {busy ? "Setting up" : "Create desk wallet"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
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

function DeskCard({ desk, act }: { desk: DeskInfo; act: Act }) {
  const { connected, sendWbt } = useWalletSession();
  const now = useNow();
  const manualNow = desk.control.mode === "manual";
  const [manual, setManual] = useState(manualNow);
  const [rate, setRate] = useState(desk.control.fee ? money(BigInt(desk.control.fee)) : "0.07");
  const [busy, setBusy] = useState<string | undefined>();
  const [sent, setSent] = useState<Hash | undefined>();
  const [walletProblem, setWalletProblem] = useState<string | undefined>();

  const wbt = Number(desk.wbt ?? 0);
  const tglm = Number(desk.tglm ?? 0);
  const ready = wbt >= MIN_WBT && tglm >= MIN_TGLM;
  const secondsLeft = desk.control.until === undefined ? undefined : desk.control.until - now;
  const timeUp = secondsLeft !== undefined && secondsLeft <= 0;
  const badRate = manual ? rateProblem(rate) : undefined;
  const base = toBase(rate);
  const changed = manual !== manualNow || (manual && base?.toString() !== desk.control.fee);

  async function run(label: string, body: Record<string, unknown>) {
    setBusy(label);
    await act({ name: desk.name, ...body });
    setBusy(undefined);
  }

  const pricing = () => (manual ? { mode: "manual", fee: base?.toString() } : { mode: "auto" });

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
            <Badge tone={manualNow ? "accent" : "neutral"}>{manualNow ? "Own rate" : "AI agent"}</Badge>
            {desk.paymaster && <Badge>Paymaster</Badge>}
          </h3>
          <p className="mt-1 truncate font-mono text-xs text-ink-3">{shortAddress(desk.address)}</p>
        </div>
        <p className="figure text-2xl">
          {desk.live && desk.fee ? <Ticker value={money(BigInt(desk.fee))} /> : "–"} <span className="font-sans text-xs font-normal tracking-normal text-ink-3">USDT</span>
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-raised/50 p-3.5 sm:grid-cols-4">
        <Readout label="Status" value={desk.live ? "On the board" : desk.running ? "Starting" : "Offline"} />
        <Readout
          label="Time limit"
          value={secondsLeft === undefined ? "None" : timeUp ? "Ended" : <span data-testid={`limit-${desk.name}`}>{clock(secondsLeft)}</span>}
          low={timeUp}
        />
        <Readout label="Earned" value={`${Number(desk.usdt ?? 0).toFixed(3)} USDT`} />
        <Readout label="Carried" value={`${desk.relayed} payments`} />
        <Readout label="Gas tank" value={`${wbt.toFixed(4)} WBT`} low={wbt < MIN_WBT} />
        <Readout label="Arkiv gas" value={`${tglm.toFixed(4)} tGLM`} low={tglm < MIN_TGLM} />
      </div>

      {desk.withdrew && !desk.live && <p className="mt-3 text-[13px] text-ink-3">Left the board: {desk.withdrew}.</p>}

      {!ready && (
        <div className="mt-4 rounded-xl bg-caution-soft p-3.5">
          <p className="flex items-center gap-2 text-sm font-medium text-caution">
            <Fuel size={15} aria-hidden />
            This desk needs gas before it can go live
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
            At least {MIN_WBT} WBT to pay gas, and {MIN_TGLM} tGLM to keep a quote on Arkiv. On testnet, borrow a small float from Octane's test wallets.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" disabled={busy !== undefined} onClick={() => void run("fund", { action: "fund" })}>
              {busy === "fund" ? "Borrowing" : "Borrow test funds"}
            </Button>
            {connected && wbt < MIN_WBT && (
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
        <ModeChoice manual={manual} onChange={setManual} />

        {manual && (
          <Field label="Your rate per payment, in USDT" htmlFor={`rate-${desk.name}`} hint={badRate ?? "Between 0.065 and 0.50 USDT. Below 0.065 a payment costs you more in gas than it earns."}>
            <input id={`rate-${desk.name}`} value={rate} onChange={(event) => setRate(event.target.value)} inputMode="decimal" className={INPUT} />
          </Field>
        )}

        {desk.running && changed && (
          <Button disabled={busy !== undefined || badRate !== undefined} onClick={() => void run("save", { action: "control", ...pricing() })}>
            {busy === "save" ? "Updating" : manual ? "Update rate" : "Switch to AI agent"}
          </Button>
        )}

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

      {!desk.paymaster && (
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
          <Button disabled={busy !== undefined || !ready || badRate !== undefined} onClick={() => void run("start", { action: "start", ...pricing() })}>
            <Power size={15} aria-hidden />
            {busy === "start" ? "Starting" : "Go live"}
          </Button>
        )}
        {!desk.running && desk.live && <p className="text-[13px] text-ink-3">Running from a terminal. Stop it there with Ctrl+C to manage it here.</p>}
      </div>
    </Card>
  );
}
