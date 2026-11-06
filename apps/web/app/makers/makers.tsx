"use client";

import { explorerTx, swarmLink } from "@octane/sdk";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Hash } from "viem";
import { PricingNote } from "@/components/pricing-note";
import { EASE } from "@/components/providers";
import { Ticker } from "@/components/ticker";
import { Badge, Card, Empty, External, LiveDot, PageHeader, Skeleton } from "@/components/ui";
import { capitalise, money, timeAgo } from "@/lib/format";

const POLL_MS = 4_000;
/** A maker quotes every 10s or so, and its quote lives 30s. */
const LIVE_WITHIN_SECONDS = 45;
/** The fuller a maker's gas tank reads, compared with the target our makers run at. */
const FULL_TANK_WBT = 0.4;
const WEI = 1e18;

type Line = Record<string, string | number | undefined>;

interface MakerSummary {
  maker: string;
  started?: Line;
  quoted?: Line;
  regime?: Line;
  published?: Line;
  fees: number[];
  jobs: Line[];
  relayed: number;
}

const REGIME_TONE = { calm: "positive", spiky: "caution", shock: "accent" } as const;

export function Makers() {
  const [makers, setMakers] = useState<MakerSummary[] | undefined>();

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch("/api/journal", { cache: "no-store" });
        const body = (await response.json()) as { makers: MakerSummary[] };
        if (!stopped) setMakers(body.makers);
      } catch {
        // The next poll tries again.
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);

  return (
    <section>
      <PageHeader
        title={
          <>
            Anyone can be a <em>maker.</em>
          </>
        }
        description="Makers pay the gas from their own wallets and earn a fee in stablecoins. An AI agent can price for you, or you can set your own rate."
        aside={
          <Link
            href="/makers/desk"
            className="shine inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-canvas transition-colors hover:bg-accent-bright"
          >
            Open your maker desk
            <ArrowRight size={15} aria-hidden />
          </Link>
        }
      />
      <div className="mt-8">
        <PricingNote />
      </div>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {makers === undefined && (
          <>
            <Skeleton className="block h-72 w-full rounded-2xl" />
            <Skeleton className="block h-72 w-full rounded-2xl" />
          </>
        )}
        {makers?.length === 0 && <Empty>No makers yet.</Empty>}
        {makers?.map((maker, index) => (
          <motion.div
            key={maker.maker}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: index * 0.07, ease: EASE }}
          >
            <MakerCard summary={maker} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/** The fee this maker has actually quoted over the last few minutes. */
function PriceLine({ fees, live }: { fees: number[]; live: boolean }) {
  if (fees.length < 2) return <div className="h-14" />;
  const width = 300;
  const height = 56;
  const pad = 5;
  const low = Math.min(...fees);
  const range = Math.max(...fees) - low || 1;
  const points = fees.map((fee, index) => {
    const x = (index / (fees.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((fee - low) / range) * (height - pad * 2);
    return [x, y] as const;
  });
  const path = points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = points.at(-1) ?? [0, 0];

  return (
    <div className="relative h-14">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none" aria-hidden>
        <path d={path} fill="none" stroke="var(--color-ink-3)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      {live && (
        <span
          className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_12px_rgb(255_107_44/0.9)]"
          style={{ left: `${(lastX / width) * 100}%`, top: `${(lastY / height) * 100}%` }}
        />
      )}
    </div>
  );
}

function FuelGauge({ wbt }: { wbt: number }) {
  const share = Math.min(1, wbt / FULL_TANK_WBT);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 text-xs text-ink-3">
        <span>Gas tank</span>
        <span className="tabular-nums">{wbt.toFixed(4)} WBT</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
        <motion.div
          className="h-full rounded-full bg-ink-2"
          initial={{ width: 0 }}
          animate={{ width: `${share * 100}%` }}
          transition={{ duration: 0.9, ease: EASE }}
        />
      </div>
    </div>
  );
}

function MakerCard({ summary }: { summary: MakerSummary }) {
  const { maker, quoted, regime, published, started, jobs, relayed, fees } = summary;
  const live = quoted?.ts !== undefined && Date.now() / 1000 - Number(quoted.ts) < LIVE_WITHIN_SECONDS;
  const regimeName = regime?.regime === undefined ? undefined : String(regime.regime);
  const address = started?.address === undefined ? undefined : String(started.address);
  const wbt = quoted?.wbt === undefined ? undefined : Number(quoted.wbt) / WEI;

  return (
    <Card className="flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2.5 text-lg font-semibold tracking-tight [font-family:var(--font-display)]">
            <LiveDot live={live} />
            {capitalise(maker)}
            {quoted?.mode === "manual" ? (
              <Badge tone="accent">Own rate</Badge>
            ) : (
              regimeName && <Badge tone={REGIME_TONE[regimeName as keyof typeof REGIME_TONE] ?? "neutral"}>{capitalise(regimeName)}</Badge>
            )}
          </h2>
          <p className="mt-1 text-xs text-ink-3">
            {live ? "Quoting now" : "Not quoting"} · {relayed} relayed
          </p>
        </div>
        <p className="figure text-2xl">
          {quoted?.fee === undefined ? "–" : <Ticker value={money(BigInt(String(quoted.fee)))} />}{" "}
          <span className="font-sans text-xs font-normal tracking-normal text-ink-3">USDT</span>
        </p>
      </div>

      <div className="mt-4">
        <PriceLine fees={fees} live={live} />
      </div>

      {regime?.note !== undefined && quoted?.mode !== "manual" && (
        <blockquote className="mt-4 font-serif text-[19px] italic leading-snug text-ink-2">{String(regime.note)}</blockquote>
      )}

      <div className="mt-auto pt-5">
        {wbt !== undefined && <FuelGauge wbt={wbt} />}

        {jobs.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {jobs.map((job) => (
              <li key={String(job.txHash)} className="flex items-center justify-between gap-4 py-2 text-[13px] tabular-nums text-ink-2">
                <span>
                  Earned {money(BigInt(String(job.fee)))} on {money(BigInt(String(job.amount)))}
                  <span className="text-ink-3"> · {timeAgo(Number(job.ts))}</span>
                </span>
                <External href={explorerTx(1874, job.txHash as Hash)}>Tx</External>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
          {address && (
            <Link href={`/history?maker=${address}`} className="text-sm text-ink-2 transition-colors hover:text-ink">
              Statement
            </Link>
          )}
          {published?.reference !== undefined && <External href={swarmLink(String(published.reference))}>Journal on Swarm</External>}
        </div>
      </div>
    </Card>
  );
}
