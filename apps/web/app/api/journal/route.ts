import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MAKERS = ["cautious", "aggressive", "balancer"];
const LINES = 40;

/** The makers' local journals, for the relayer view. Swarm publishes the same lines. */
export function GET() {
  const dir = join(process.cwd(), "..", "makers", "data");
  const journals = MAKERS.map((maker) => {
    const file = join(dir, `${maker}.jsonl`);
    if (!existsSync(file)) return { maker, lines: [] };
    const lines = readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .slice(-LINES)
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as Record<string, unknown>];
        } catch {
          return [];
        }
      });
    return { maker, lines };
  });
  return Response.json({ journals }, { headers: { "cache-control": "no-store" } });
}
