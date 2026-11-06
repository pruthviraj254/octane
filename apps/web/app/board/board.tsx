"use client";

import { getQuotes, resolveIdentity, type BoardQuote, type Chain } from "@octane/sdk";
import { useEffect, useState } from "react";
import { Badge, Empty, List, LiveDot, PageHeader, Skeleton, Stat } from "@/components/ui";
import { capitalise, money } from "@/lib/format";
import { getMarket } from "@/lib/market";

const POLL_MS = 2_000;
const BLOCK_SECONDS = 2n;
const LIFETIME_SECONDS = 30;

interface Row extends BoardQuote {
  label: string;
}

interface Snapshot {
  rows: Row[];
  block: bigint;
  status: "loading" | "live" | "offline";
}

const MARKETS: { chain: Chain; title: string; symbol: string }[] = [
  { chain: "whitechain", title: "Whitechain Sepolia", symbol: "USDT" },
  { chain: "ef-devnet", title: "EF alt-mempool devnet", symbol: "USDC" },
];

/** Asks again every block, because expiry emits no event. One failed read changes nothing. */
function useBoard(chain: Chain): Snapshot {
  const [snapshot, setSnapshot] = useState<Snapshot>({ rows: [], block: 0n, status: "loading" });

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const board = await getQuotes(getMarket(), chain);
        const rows = await Promise.all(
          board.quotes.map(async (entry) => ({ ...entry, label: (await resolveIdentity(entry.quote.maker)).label })),
        );
        if (!stopped) setSnapshot({ rows, block: board.blockNumber, status: "live" });
      } catch {
        if (!stopped) setSnapshot((previous) => ({ ...previous, status: "offline" }));
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [chain]);

  return snapshot;
}

export function Board() {
  const whitechain = useBoard("whitechain");
  const devnet = useBoard("ef-devnet");
  const best = whitechain.rows[0];
  const makers = new Set([...whitechain.rows, ...devnet.rows].map((row) => row.quote.maker)).size;

  return (
    <section className="animate-rise">
      <PageHeader title="Live gas market" description="Read straight from Arkiv. A maker that stops refreshing leaves within 30 seconds." />

      <div className="mt-6 grid grid-cols-3 gap-2 sm:gap-3">
        <Stat label="Makers live" value={whitechain.status === "loading" ? <Skeleton className="h-6 w-6" /> : makers} hint="Both markets" />
        <Stat label="Best fee" value={best ? money(best.quote.fee) : "–"} hint="USDT" />
        <Stat label="Arkiv block" value={whitechain.block > 0n ? whitechain.block.toLocaleString() : "–"} hint="Rabdi" />
      </div>

      {MARKETS.map((market, index) => (
        <Market key={market.chain} {...market} snapshot={index === 0 ? whitechain : devnet} />
      ))}
    </section>
  );
}

function Market({ title, symbol, snapshot }: { title: string; symbol: string; snapshot: Snapshot }) {
  const { rows, block, status } = snapshot;
  const quoting = status === "live" && rows.length > 0;
  const label = status === "offline" ? "Reconnecting" : status === "loading" ? "Connecting" : quoting ? "Live" : "Not quoting";
  return (
    <section className="mt-8">
      <div className="mb-2.5 flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="flex items-center gap-1.5 text-xs text-ink-3">
          <LiveDot live={quoting} />
          {label}
        </span>
      </div>
      {rows.length > 0 ? (
        <List>
          {rows.map((row, index) => (
            <QuoteRow key={row.key} row={row} block={block} best={index === 0 && rows.length > 1} symbol={symbol} />
          ))}
        </List>
      ) : status === "loading" ? (
        <Skeleton className="block h-16 w-full rounded-xl" />
      ) : (
        <Empty>No live quotes right now.</Empty>
      )}
    </section>
  );
}

function QuoteRow({ row, block, best, symbol }: { row: Row; block: bigint; best: boolean; symbol: string }) {
  const remaining = block === 0n ? 0 : Number((row.expiresAt - block) * BLOCK_SECONDS);
  const seconds = Math.max(0, remaining);
  const share = Math.min(100, (seconds / LIFETIME_SECONDS) * 100);

  return (
    <article className="relative flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="min-w-0">
        <p className="flex items-center gap-2 text-sm font-medium">
          {capitalise(row.style)}
          {best && <Badge tone="accent">Best</Badge>}
        </p>
        <p className="mt-0.5 truncate font-mono text-xs text-ink-3">{row.label}</p>
      </div>
      <div className="text-right">
        <p className="text-[15px] font-medium tabular-nums tracking-tight">
          {money(row.quote.fee)} <span className="text-xs font-normal text-ink-3">{symbol}</span>
        </p>
        <p className="mt-0.5 text-xs tabular-nums text-ink-3">{seconds}s left</p>
      </div>
      <span
        aria-hidden
        className={`absolute bottom-0 left-0 h-px transition-[width] duration-700 ease-linear ${best ? "bg-accent" : "bg-line-strong"}`}
        style={{ width: `${share}%` }}
      />
    </article>
  );
}
