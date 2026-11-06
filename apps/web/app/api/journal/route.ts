import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const JOURNAL = ".jsonl";
const RECENT_LINES = 3_000;
/** About eight minutes of quotes, for each maker's price line. */
const PRICE_POINTS = 48;

type Line = Record<string, unknown>;

/** A summary of each maker's local journal, for the relayer view. Swarm publishes the same lines. */
export function GET() {
  const dir = join(process.cwd(), "..", "makers", "data");
  const names = existsSync(dir)
    ? readdirSync(dir)
        .filter((name) => name.endsWith(JOURNAL))
        .map((name) => name.slice(0, -JOURNAL.length))
    : [];
  const makers = names.map((maker) => {
    const file = join(dir, `${maker}${JOURNAL}`);
    const lines: Line[] = existsSync(file)
      ? readFileSync(file, "utf8")
          .trim()
          .split("\n")
          .slice(-RECENT_LINES)
          .flatMap((line) => {
            try {
              return [JSON.parse(line) as Line];
            } catch {
              return [];
            }
          })
      : [];
    const latest = (event: string) => lines.filter((line) => line.event === event).at(-1);
    return {
      maker,
      started: latest("started"),
      quoted: latest("quoted"),
      regime: latest("regime"),
      published: latest("published"),
      stopped: latest("stopped"),
      fees: lines
        .filter((line) => line.event === "quoted")
        .slice(-PRICE_POINTS)
        .map((line) => Number(line.fee)),
      jobs: lines.filter((line) => line.event === "relayed").slice(-3).reverse(),
      relayed: lines.filter((line) => line.event === "relayed").length,
    };
  });
  return Response.json({ makers }, { headers: { "cache-control": "no-store" } });
}
