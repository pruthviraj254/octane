"use client";

import { WHITECHAIN_USDT } from "@octane/sdk";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { External, PageHeader, Skeleton } from "@/components/ui";
import { Ticker } from "@/components/ticker";
import { money, shortAddress } from "@/lib/format";
import { INDEXER } from "@/lib/market";

const POLL_MS = 6_000;
const SAMPLE_ROWS = 3;
const BLOCK_SECONDS = 2;
const EXPLORER = "https://rabdi.explorer.arkiv.network";
const SELECT = { key: true, owner: true, expiresAt: true, attributes: true };

interface Attribute {
  name: string;
  type: string;
  value: string;
}

interface Entity {
  key: string;
  owner: string;
  expiresAt: string;
  attributes: Attribute[];
}

interface Table {
  schema: string;
  title: string;
  about: string;
  writer: string;
  lifetime: string;
  /** The query the app sends, written out in full. */
  query: (now: number) => string;
  columns: { label: string; attribute: string; show: (value: string) => string }[];
}

const hexNumber = (value: string) => BigInt(value).toString();
const stable = (value: string) => money(BigInt(value));
const chainName = (value: string) => (BigInt(value) === 1874n ? "Whitechain" : "EF devnet");
const when = (value: string) => new Date(Number(BigInt(value)) * 1000).toLocaleTimeString();
const percent = (value: string) => `${(Number(BigInt(value)) / 100).toFixed(2)}%`;

const TABLES: Table[] = [
  {
    schema: "octane.quote",
    title: "Live quotes",
    about: "One standing quote per maker, chain and token, signed by the maker. This is the market.",
    writer: "Each maker's own wallet",
    lifetime: "Gone 30 seconds after its last refresh",
    query: (now) => `arkiv.schema = str('octane.quote') AND chainId = u64(1874) AND token = addr(${WHITECHAIN_USDT}) AND validUntil > u64(${now}) ORDER BY fee:u256 ASC`,
    columns: [
      { label: "Maker", attribute: "style", show: (value) => value },
      { label: "Fee", attribute: "fee", show: stable },
      { label: "Chain", attribute: "chainId", show: chainName },
    ],
  },
  {
    schema: "octane.maker",
    title: "Maker profiles",
    about: "Where to reach each maker, and where its public journal lives on Swarm.",
    writer: "Each maker's own wallet",
    lifetime: "7 days, renewed while it runs",
    query: () => "arkiv.schema = str('octane.maker')",
    columns: [
      { label: "Maker", attribute: "style", show: (value) => value },
      { label: "Wallet", attribute: "maker", show: shortAddress },
      { label: "Relayer", attribute: "endpoint", show: (value) => value },
    ],
  },
  {
    schema: "octane.fill",
    title: "Settled payments",
    about: "A record of each settled payment, so payment history needs no database of ours.",
    writer: "The indexer wallet only",
    lifetime: "30 days, read-only",
    query: () => `arkiv.schema = str('octane.fill') AND $creator = addr(${INDEXER}) ORDER BY ts:u64 DESC`,
    columns: [
      { label: "Time", attribute: "ts", show: when },
      { label: "Fee", attribute: "fee", show: stable },
      { label: "Maker", attribute: "maker", show: shortAddress },
    ],
  },
  {
    schema: "octane.makerStats",
    title: "Reputation",
    about: "Fade score, uptime and coverage, which anyone can recompute from public data.",
    writer: "The indexer wallet only, so makers can't rate themselves",
    lifetime: "Renewed about every 5 minutes",
    query: () => `arkiv.schema = str('octane.makerStats') AND $creator = addr(${INDEXER}) ORDER BY epoch:u64 DESC`,
    columns: [
      { label: "Maker", attribute: "maker", show: shortAddress },
      { label: "Fade", attribute: "fadeScore", show: percent },
      { label: "Payments", attribute: "fills24h", show: hexNumber },
    ],
  },
  {
    schema: "octane.request",
    title: "Auction requests",
    about: "An agent asks makers to bid on a batch of payments. Empty unless an auction is running.",
    writer: "The paying agent's wallet",
    lifetime: "60 seconds",
    query: (now) => `arkiv.schema = str('octane.request') AND chainId = u64(1874) AND deadline > u64(${now})`,
    columns: [
      { label: "Payer", attribute: "payer", show: shortAddress },
      { label: "Max fee", attribute: "maxFee", show: stable },
      { label: "Deadline", attribute: "deadline", show: when },
    ],
  },
  {
    schema: "octane.bid",
    title: "Auction bids",
    about: "Each maker's signed price for an open request. Empty unless an auction is running.",
    writer: "Each maker's own wallet",
    lifetime: "Expires with its request",
    query: () => "arkiv.schema = str('octane.bid') ORDER BY fee:u256 ASC",
    columns: [
      { label: "Maker", attribute: "maker", show: shortAddress },
      { label: "Fee", attribute: "fee", show: stable },
    ],
  },
];

async function arkivQuery(expression: string, options: object) {
  const response = await fetch("/api/arkiv", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "arkiv_query", params: [expression, options] }),
  });
  const body = (await response.json()) as { result?: { data: Entity[]; count?: string; blockNumber: string }; error?: { message: string } };
  if (!body.result) throw new Error(body.error?.message ?? "Arkiv didn't answer");
  return body.result;
}

function CopyQuery({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1_500);
    } catch {
      // Clipboard access can be blocked. The query stays selectable.
    }
  }
  return (
    <button type="button" onClick={() => void copy()} aria-label="Copy query" className="shrink-0 text-ink-3 transition-colors hover:text-ink">
      {copied ? <Check size={14} className="text-accent" aria-hidden /> : <Copy size={14} aria-hidden />}
    </button>
  );
}

function TableCard({ table }: { table: Table }) {
  // Set after loading, so the server and the browser first render the same text.
  const [now, setNow] = useState(0);
  const [rows, setRows] = useState<Entity[] | undefined>();
  const [count, setCount] = useState<bigint | undefined>();
  const [block, setBlock] = useState(0n);
  const [problem, setProblem] = useState(false);
  const query = table.query(now);

  useEffect(() => {
    setNow(Math.floor(Date.now() / 1000));
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!document.hidden) {
        try {
          const [total, page] = await Promise.all([
            arkivQuery(`arkiv.schema = str('${table.schema}')`, { select: { count: true } }),
            arkivQuery(table.query(Math.floor(Date.now() / 1000)), { select: SELECT, limit: SAMPLE_ROWS }),
          ]);
          if (!stopped) {
            setCount(BigInt(total.count ?? 0));
            setRows(page.data);
            setBlock(BigInt(page.blockNumber));
            setProblem(false);
          }
        } catch {
          if (!stopped) setProblem(true);
        }
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [table]);

  return (
    <article data-testid={`table-${table.schema}`} className="spot min-w-0 rounded-2xl border border-line bg-surface p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight [font-family:var(--font-display)]">{table.title}</h2>
          <p className="mt-0.5 font-mono text-xs text-ink-3">{table.schema}</p>
        </div>
        <p className="figure text-3xl">{count === undefined ? <Skeleton className="h-8 w-10" /> : <Ticker value={count.toString()} />}</p>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">{table.about}</p>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="inline text-ink-3">Written by </dt>
          <dd className="inline text-ink-2">{table.writer}</dd>
        </div>
        <div>
          <dt className="inline text-ink-3">Lifetime </dt>
          <dd className="inline text-ink-2">{table.lifetime}</dd>
        </div>
      </dl>

      <div className="mt-3 flex items-start gap-2 rounded-xl bg-canvas/50 p-3">
        <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-ink-2">{query}</code>
        <CopyQuery text={query} />
      </div>

      {problem && <p className="mt-3 text-[13px] text-caution">Couldn't reach Arkiv just now. Trying again.</p>}
      {rows !== undefined && rows.length === 0 && !problem && <p className="mt-3 text-[13px] text-ink-3">Nothing here right now.</p>}
      {rows !== undefined && rows.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[420px] text-left text-[13px] tabular-nums">
            <thead>
              <tr className="text-xs text-ink-3">
                {table.columns.map((column) => (
                  <th key={column.label} className="pb-1.5 pr-4 font-normal">
                    {column.label}
                  </th>
                ))}
                <th className="pb-1.5 pr-4 font-normal">Expires in</th>
                <th className="pb-1.5 font-normal">Written by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.key}>
                  {table.columns.map((column) => {
                    const value = row.attributes.find((attribute) => attribute.name === column.attribute)?.value;
                    return (
                      <td key={column.label} className="py-1.5 pr-4 text-ink-2">
                        {value === undefined ? "–" : column.show(value)}
                      </td>
                    );
                  })}
                  <td className="py-1.5 pr-4 text-ink-3">{Math.max(0, Number(BigInt(row.expiresAt) - block) * BLOCK_SECONDS).toLocaleString("en")}s</td>
                  <td className="py-1.5">
                    <External href={`${EXPLORER}/address/${row.owner}`}>{shortAddress(row.owner)}</External>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

export function ArkivData() {
  return (
    <section>
      <PageHeader
        title={
          <>
            What's on <em>Arkiv.</em>
          </>
        }
        description="Octane has no database of its own. Everything the market needs lives here, live, with the exact query behind each table."
        aside={<External href={EXPLORER}>Arkiv explorer</External>}
      />
      <p className="mt-6 max-w-2xl text-[13px] leading-relaxed text-ink-3">
        Anyone can write under these names, so the app trusts nothing for being on Arkiv. A quote counts only if its maker signed it and wrote it, and fills and reputation count only from the indexer wallet.
      </p>
      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {TABLES.map((table) => (
          <TableCard key={table.schema} table={table} />
        ))}
      </div>
    </section>
  );
}
