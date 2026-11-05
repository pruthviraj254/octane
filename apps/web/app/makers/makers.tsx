"use client";

import { explorerTx } from "@octane/sdk";
import { useEffect, useState } from "react";
import { formatUnits, type Hash } from "viem";

const POLL_MS = 4_000;

type Line = Record<string, unknown> & { ts: number; event: string };
interface Journal {
  maker: string;
  lines: Line[];
}

const last = (lines: Line[], event: string) => lines.filter((line) => line.event === event).at(-1);

export function Makers() {
  const [journals, setJournals] = useState<Journal[]>([]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch("/api/journal", { cache: "no-store" });
        const body = (await response.json()) as { journals: Journal[] };
        if (!stopped) setJournals(body.journals);
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
      <h1 className="text-3xl font-semibold tracking-tight">Makers</h1>
      <p className="mt-1 text-sm text-zinc-400">Three AI makers pay the gas from their own wallets and earn a fee in stablecoins.</p>
      <div className="mt-6 space-y-4">
        {journals.map((journal) => (
          <MakerCard key={journal.maker} journal={journal} />
        ))}
      </div>
    </section>
  );
}

function MakerCard({ journal }: { journal: Journal }) {
  const quoted = last(journal.lines, "quoted");
  const regime = last(journal.lines, "regime");
  const jobs = journal.lines.filter((line) => line.event === "relayed").slice(-3).reverse();

  return (
    <article className="rounded-2xl border border-zinc-800 p-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-medium capitalize">{journal.maker}</h2>
        <p className="text-sm tabular-nums text-zinc-400">
          {quoted ? `${formatUnits(BigInt(String(quoted.fee)), 6)} USDT` : "not quoting"}
          {regime ? ` · ${String(regime.regime)}` : ""}
        </p>
      </div>
      {regime && <p className="mt-2 text-sm text-zinc-300">{String(regime.note)}</p>}
      {jobs.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm text-zinc-400">
          {jobs.map((job) => (
            <li key={String(job.txHash)}>
              Relayed {formatUnits(BigInt(String(job.amount)), 6)} USDT, earned {formatUnits(BigInt(String(job.fee)), 6)}.{" "}
              <a href={explorerTx(1874, job.txHash as Hash)} target="_blank" rel="noreferrer" className="text-orange-400 underline">
                Transaction
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
