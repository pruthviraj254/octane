import {
  NAME,
  aiConfigured,
  controlOf,
  deskNames,
  hasPaymaster,
  listDesks,
  marketsOf,
  setUpMaker,
  startMaker,
  stopMaker,
  writeControl,
  type Control,
  type MarketName,
} from "@/lib/desk";

const MIN_FEE = 65_000;
const MAX_FEE = 500_000;
const MAX_ADDED_SECONDS = 86_400;
const MARKETS: MarketName[] = ["whitechain", "ef-devnet"];

const isLocalName = (name: string | undefined) => name === "localhost" || name === "127.0.0.1";

/** This can start your maker, so it only answers your own machine and your own pages. */
function fromThisMachine(request: Request): boolean {
  const host = request.headers.get("host")?.split(":")[0];
  if (!isLocalName(host)) return false;
  const origin = request.headers.get("origin");
  return origin === null || isLocalName(new URL(origin).hostname);
}

const refuse = (message: string, status = 400) => Response.json({ error: message }, { status });
const noStore = { headers: { "cache-control": "no-store" } };

export async function GET(request: Request) {
  if (!fromThisMachine(request)) return refuse("The desk only runs on your own machine.", 403);
  return Response.json({ desks: await listDesks(), aiConfigured: aiConfigured() }, noStore);
}

interface Action {
  action?: string;
  name?: string;
  mode?: unknown;
  fee?: unknown;
  margin?: unknown;
  addSeconds?: unknown;
  clearLimit?: unknown;
  paymaster?: unknown;
  agent?: unknown;
  markets?: unknown;
}

function validFee(fee: unknown): string | undefined {
  const value = Number(fee);
  return Number.isInteger(value) && value >= MIN_FEE && value <= MAX_FEE ? String(value) : undefined;
}

function nextControl(name: string, body: Action): Control | string {
  const control = controlOf(name);
  const next: Control = { ...control };
  if (body.mode === "auto" || body.mode === "manual") next.mode = body.mode;
  if (typeof body.agent === "boolean") next.agent = body.agent;
  if (body.markets !== undefined) {
    const chosen = MARKETS.filter((market) => Array.isArray(body.markets) && body.markets.includes(market));
    if (chosen.length === 0) return "Choose at least one market.";
    next.markets = chosen;
  }
  if (next.mode === "auto") {
    if (!aiConfigured()) return "No AI is set up on this machine, so this maker needs a rate you set yourself.";
    if (next.markets && !next.markets.includes("whitechain")) return "The agent prices from Whitechain's market, so an EF-only maker needs a rate you set yourself.";
    next.agent = true;
  }
  if (body.fee !== undefined) {
    const fee = validFee(body.fee);
    if (!fee) return "A rate must be between 0.065 and 0.50.";
    next.fee = fee;
  }
  if (next.mode === "manual" && !next.fee) return "Set a rate first.";
  if (body.clearLimit === true) delete next.until;
  if (body.addSeconds !== undefined) {
    const seconds = Number(body.addSeconds);
    if (!Number.isInteger(seconds) || seconds <= 0 || seconds > MAX_ADDED_SECONDS) return "Choose up to 24 hours at a time.";
    const now = Math.floor(Date.now() / 1000);
    next.until = Math.max(next.until ?? 0, now) + seconds;
  }
  return next;
}

export async function POST(request: Request) {
  if (!fromThisMachine(request)) return refuse("The desk only runs on your own machine.", 403);
  const body = (await request.json().catch(() => ({}))) as Action;
  const name = body.name;
  if (typeof name !== "string" || !NAME.test(name)) return refuse("Names are lowercase letters and digits, 2 to 16 long.");
  const known = deskNames().includes(name);

  try {
    if (body.action === "create") {
      if (known) return refuse(`${name} already exists.`);
      const margin = Number(body.margin ?? 10_000);
      if (!Number.isInteger(margin) || margin < 0 || margin > 100_000) return refuse("A margin must be up to 0.10 USDT.");
      const pricing = nextControl(name, { ...body, agent: body.mode === "auto" });
      if (typeof pricing === "string") return refuse(pricing);
      const output = await setUpMaker(name, ["--spread", String(margin)]);
      writeControl(name, pricing);
      return Response.json({ output });
    }
    if (!known) return refuse(`There's no maker called ${name} on this machine.`, 404);

    if (body.action === "fund") {
      const markets = marketsOf(name);
      const addingPaymaster = body.paymaster === true && !markets.includes("ef-devnet");
      const flags = ["--fund"];
      if (addingPaymaster || markets.includes("ef-devnet")) flags.push("--path-a");
      if (!addingPaymaster && !markets.includes("whitechain")) flags.push("--ef-only");
      const output = await setUpMaker(name, flags);
      if (addingPaymaster) writeControl(name, { ...controlOf(name), markets: [...markets, "ef-devnet"] });
      return Response.json({ output });
    }
    if (body.action === "control" || body.action === "start") {
      const next = nextControl(name, body);
      if (typeof next === "string") return refuse(next);
      if (body.action === "start" && next.markets?.includes("ef-devnet") && !hasPaymaster(name)) {
        return refuse("Set up the paymaster first. It's what carries payments on the EF devnet.");
      }
      writeControl(name, next);
      if (body.action === "start") startMaker(name);
      return Response.json({ control: next });
    }
    if (body.action === "stop") {
      if (!stopMaker(name)) return refuse(`${name} was started from a terminal. Stop it there with Ctrl+C.`);
      return Response.json({ stopped: true });
    }
  } catch (error) {
    return refuse(error instanceof Error ? error.message.slice(0, 300) : "That didn't work.", 500);
  }
  return refuse("Unknown action.");
}
