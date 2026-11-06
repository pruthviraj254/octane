"use client";

import { explorerTx, swarmLink } from "@octane/sdk";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Hash } from "viem";
import { Badge, Card, Empty, External, LiveDot, PageHeader, Skeleton } from "@/components/ui";
import { capitalise, money, timeAgo } from "@/lib/format";

const POLL_MS = 4_000;
/** A maker quotes every 10s or so, and its quote lives 30s. */
const LIVE_WITHIN_SECONDS = 45;

type Line = Record<string, string | number | undefined>;

interface MakerSummary {
  maker: string;
  started?: Line;
  quoted?: Line;
  regime?: Line;
  published?: Line;
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
    <section className="animate-rise">
      <PageHeader title="Makers" description="Three AI makers pay the gas from their own wallets and earn a fee in stablecoins." />
      <div className="mt-6 space-y-3">
        {makers === undefined && <Skeleton className="block h-40 w-full rounded-xl" />}
        {makers?.length === 0 && <Empty>No makers yet.</Empty>}
        {makers?.map((maker) => <MakerCard key={maker.maker} summary={maker} />)}
      </div>
    </section>
  );
}

function MakerCard({ summary }: { summary: MakerSummary }) {
  const { maker, quoted, regime, published, started, jobs, relayed } = summary;
  const live = quoted?.ts !== undefined && Date.now() / 1000 - Number(quoted.ts) < LIVE_WITHIN_SECONDS;
  const regimeName = regime?.regime === undefined ? undefined : String(regime.regime);
  const address = started?.address === undefined ? undefined : String(started.address);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[15px] font-medium">
            <LiveDot live={live} />
            {capitalise(maker)}
            {regimeName && (
              <Badge tone={REGIME_TONE[regimeName as keyof typeof REGIME_TONE] ?? "neutral"}>{capitalise(regimeName)}</Badge>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-ink-3">{live ? "Quoting now" : "Not quoting"} · {relayed} relayed</p>
        </div>
        <p className="text-right text-[15px] font-medium tabular-nums tracking-tight">
          {quoted?.fee === undefined ? "–" : money(BigInt(String(quoted.fee)))} <span className="text-xs font-normal text-ink-3">USDT</span>
        </p>
      </div>

      {regime?.note !== undefined && (
        <p className="mt-3 border-l-2 border-line-strong pl-3 text-sm leading-relaxed text-ink-2">{String(regime.note)}</p>
      )}

      {jobs.length > 0 && (
        <ul className="mt-3 divide-y divide-line border-t border-line">
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

      <div className="mt-3 flex gap-4">
        {address && (
          <Link href={`/history?maker=${address}`} className="text-sm text-ink-2 transition-colors hover:text-ink">
            Statement
          </Link>
        )}
        {published?.reference !== undefined && <External href={swarmLink(String(published.reference))}>Journal on Swarm</External>}
      </div>
    </Card>
  );
}
