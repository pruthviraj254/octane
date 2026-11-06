"use client";

import { AnimatePresence, motion } from "motion/react";
import { Badge, Empty, LiveDot, PageHeader, SectionTitle, Skeleton, Stat } from "@/components/ui";
import { EASE } from "@/components/providers";
import { Ticker } from "@/components/ticker";
import { capitalise, money } from "@/lib/format";
import { useMarket, type Row, type Snapshot } from "@/lib/market-context";

const BLOCK_SECONDS = 2n;
const LIFETIME_SECONDS = 30;

export function Board() {
  const market = useMarket();
  const { whitechain } = market;
  const best = whitechain.rows[0];
  const makers = new Set([...whitechain.rows, ...market["ef-devnet"].rows].map((row) => row.quote.maker)).size;

  return (
    <section>
      <PageHeader
        title={
          <>
            The gas market, <em>live.</em>
          </>
        }
        description="Read straight from Arkiv. A maker that stops refreshing leaves within 30 seconds."
      />

      <div className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-[1.5fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <Stat
            large
            label="Best fee right now"
            value={best ? <Ticker value={money(best.quote.fee)} /> : <Skeleton className="h-11 w-40" />}
            hint={best ? `USDT, quoted by ${capitalise(best.style)}` : "USDT"}
          />
        </div>
        <Stat label="Makers live" value={whitechain.status === "loading" ? <Skeleton className="h-7 w-8" /> : <Ticker value={String(makers)} />} hint="Both markets" />
        <Stat
          label="Arkiv block"
          value={whitechain.block > 0n ? <Ticker value={whitechain.block.toLocaleString("en")} /> : <Skeleton className="h-7 w-24" />}
          hint="Rabdi"
        />
      </div>

      <Market title="Whitechain Sepolia" symbol="USDT" snapshot={whitechain} />
      <Market title="EF alt-mempool devnet" symbol="USDC" snapshot={market["ef-devnet"]} />
    </section>
  );
}

function Market({ title, symbol, snapshot }: { title: string; symbol: string; snapshot: Snapshot }) {
  const { rows, block, status } = snapshot;
  const quoting = status === "live" && rows.length > 0;
  const label = status === "offline" ? "Reconnecting" : status === "loading" ? "Connecting" : quoting ? "Live" : "Not quoting";

  return (
    <section className="mt-10">
      <SectionTitle
        aside={
          <span className="flex items-center gap-2 text-xs text-ink-3">
            <LiveDot live={quoting} />
            {label}
          </span>
        }
      >
        {title}
      </SectionTitle>

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <AnimatePresence initial={false}>
            {rows.map((row, index) => (
              <QuoteRow key={row.key} row={row} rank={index + 1} block={block} symbol={symbol} />
            ))}
          </AnimatePresence>
        </div>
      ) : status === "loading" ? (
        <Skeleton className="block h-20 w-full rounded-2xl" />
      ) : (
        <Empty>No live quotes right now.</Empty>
      )}
    </section>
  );
}

/** A quote's remaining life, as a ring that empties until the maker refreshes it. */
function LifeRing({ share, hot }: { share: number; hot: boolean }) {
  const length = 2 * Math.PI * 8;
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5 -rotate-90" aria-hidden>
      <circle cx="10" cy="10" r="8" fill="none" stroke="var(--color-line-strong)" strokeWidth="2" />
      <circle
        cx="10"
        cy="10"
        r="8"
        fill="none"
        stroke={hot ? "var(--color-accent)" : "var(--color-ink-2)"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={length}
        strokeDashoffset={length * (1 - share)}
        className="transition-[stroke-dashoffset] duration-700 ease-linear"
      />
    </svg>
  );
}

function QuoteRow({ row, rank, block, symbol }: { row: Row; rank: number; block: bigint; symbol: string }) {
  const seconds = block === 0n ? 0 : Math.max(0, Number((row.expiresAt - block) * BLOCK_SECONDS));
  const best = rank === 1;

  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 24 }}
      transition={{ duration: 0.55, ease: EASE }}
      className={`relative flex items-center gap-3 border-b border-line px-4 py-4 last:border-b-0 sm:gap-5 sm:px-5 ${best ? "bg-gradient-to-r from-accent-soft to-transparent" : ""}`}
    >
      <span className={`w-5 font-mono text-xs tabular-nums ${best ? "text-accent-bright" : "text-ink-3"}`}>{String(rank).padStart(2, "0")}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 text-[15px] font-medium">
          {capitalise(row.style)}
          {best && <Badge tone="accent">Best</Badge>}
        </p>
        <p className="mt-0.5 truncate font-mono text-xs text-ink-3">{row.label}</p>
      </div>
      <div className="text-right">
        <p className="figure text-lg sm:text-xl">
          <Ticker value={money(row.quote.fee)} /> <span className="font-sans text-xs font-normal tracking-normal text-ink-3">{symbol}</span>
        </p>
        <p className="mt-0.5 text-xs tabular-nums text-ink-3 sm:hidden">{seconds}s left</p>
      </div>
      <div className="hidden w-16 items-center justify-end gap-2 sm:flex">
        <span className="text-xs tabular-nums text-ink-3">{seconds}s</span>
        <LifeRing share={Math.min(1, seconds / LIFETIME_SECONDS)} hot={best} />
      </div>
    </motion.article>
  );
}
