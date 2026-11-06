import { NAME, controlOf, deskNames, listDesks, setUpMaker, startMaker, stopMaker, writeControl, type Control } from "@/lib/desk";

const MIN_FEE = 65_000;
const MAX_FEE = 500_000;
const MAX_ADDED_SECONDS = 86_400;

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
  return Response.json({ desks: await listDesks() }, noStore);
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
}

function validFee(fee: unknown): string | undefined {
  const value = Number(fee);
  return Number.isInteger(value) && value >= MIN_FEE && value <= MAX_FEE ? String(value) : undefined;
}

function nextControl(name: string, body: Action): Control | string {
  const control = controlOf(name);
  const next: Control = { ...control };
  if (body.mode === "auto" || body.mode === "manual") next.mode = body.mode;
  if (body.fee !== undefined) {
    const fee = validFee(body.fee);
    if (!fee) return "A rate must be between 0.065 and 0.50 USDT.";
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
      return Response.json({ output: await setUpMaker(name, ["--spread", String(margin)]) });
    }
    if (!known) return refuse(`There's no maker called ${name} on this machine.`, 404);

    if (body.action === "fund") {
      return Response.json({ output: await setUpMaker(name, ["--fund", ...(body.paymaster === true ? ["--path-a"] : [])]) });
    }
    if (body.action === "control" || body.action === "start") {
      const next = nextControl(name, body);
      if (typeof next === "string") return refuse(next);
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
