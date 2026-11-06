import { execFile, spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv, promisify } from "node:util";
import { WHITECHAIN_USDT, arkivReader, whitechainSepolia } from "@octane/sdk";
import { createPublicClient, erc20Abi, formatEther, formatUnits, http, type Address } from "viem";

/**
 * The desk runs beside your maker, on your machine: it can start and stop your maker and set its
 * price, and it holds no key of its own. Keys stay in .env and never reach the browser.
 */
const ROOT = join(process.cwd(), "..", "..");
const DATA = join(ROOT, "apps", "makers", "data");
const ENV_FILE = join(ROOT, ".env");
const LIVE_WITHIN_SECONDS = 45;
const run = promisify(execFile);

export const NAME = /^[a-z][a-z0-9]{1,15}$/;

export interface Control {
  mode: "auto" | "manual";
  fee?: string;
  until?: number;
  /** This maker has an AI agent. In manual mode, its owner is overriding it. */
  agent?: boolean;
}

export interface DeskInfo {
  name: string;
  address: Address;
  endpoint: string | undefined;
  /** This machine started it and can stop it. */
  running: boolean;
  /** Its quote is on the board right now. */
  live: boolean;
  control: Control;
  /** What it's quoting now, in USDT base units. */
  fee: string | undefined;
  margin: string | undefined;
  paymaster: string | undefined;
  wbt: string | undefined;
  tglm: string | undefined;
  usdt: string | undefined;
  relayed: number;
  withdrew: string | undefined;
  /** The agent is pricing on its fallback buffer, because its last AI call failed. */
  aiUnavailable: boolean;
  /** The working behind the formula's latest price, in USDT base units. */
  formula: string | undefined;
  gasCost: string | undefined;
  bufferBps: string | undefined;
  spread: string | undefined;
  aiNote: string | undefined;
}

/** The same test the makers use: a provider, an API key, or a Claude Code model. */
export function aiConfigured(): boolean {
  const env = settings();
  return Boolean(env.LLM_PROVIDER || env.ANTHROPIC_API_KEY || env.LLM_MODEL);
}

function settings(): Record<string, string | undefined> {
  return existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, "utf8")) : {};
}

/**
 * Only what's needed to run, so no setting from this server reaches a child process. USER matters:
 * without it, Claude Code can't find its login in the macOS Keychain and the AI silently drops out.
 */
const childEnv = () => ({ PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER }) as unknown as NodeJS.ProcessEnv;

function readControl(name: string): Control {
  const file = join(DATA, `${name}.control.json`);
  if (!existsSync(file)) return { mode: "auto" };
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Control;
  } catch {
    return { mode: "auto" };
  }
}

/** Written in one step, so a maker reading it on its tick never sees half a file. */
export function writeControl(name: string, control: Control): void {
  const file = join(DATA, `${name}.control.json`);
  const draft = `${file}.draft`;
  writeFileSync(draft, JSON.stringify(control));
  renameSync(draft, file);
}

function processOf(name: string): number | undefined {
  const file = join(DATA, `${name}.pid`);
  if (!existsSync(file)) return undefined;
  const pid = Number(readFileSync(file, "utf8"));
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    return undefined;
  }
}

function recentJournal(name: string) {
  const file = join(DATA, `${name}.jsonl`);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .slice(-3_000)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as Record<string, string | number | undefined>];
      } catch {
        return [];
      }
    });
}

export function deskNames(): string[] {
  return Object.keys(settings())
    .flatMap((key) => key.match(/^MAKER_([A-Z0-9]+)_ADDRESS$/)?.[1] ?? [])
    .map((name) => name.toLowerCase());
}

export async function listDesks(): Promise<DeskInfo[]> {
  const env = settings();
  const names = deskNames();

  const whitechain = createPublicClient({ chain: whitechainSepolia, transport: http(env.WHITECHAIN_RPC_URL, { timeout: 8_000 }) });
  const arkiv = arkivReader(env.ARKIV_ACCESS_KEY ?? "");

  return Promise.all(
    names.map(async (name) => {
      const prefix = `MAKER_${name.toUpperCase()}`;
      const address = env[`${prefix}_ADDRESS`] as Address;
      const [wbt, usdt, tglm] = await Promise.allSettled([
        whitechain.getBalance({ address }),
        whitechain.readContract({ address: WHITECHAIN_USDT, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        arkiv.getBalance({ address }),
      ]);
      const lines = recentJournal(name);
      const quoted = lines.findLast((line) => line.event === "quoted");
      const lastEvent = lines.findLast((line) => line.event === "quoted" || line.event === "withdrew");
      const regime = lines.findLast((line) => line.event === "regime");
      const started = lines.findLast((line) => line.event === "started");
      const live = quoted?.ts !== undefined && lastEvent?.event === "quoted" && Date.now() / 1000 - Number(quoted.ts) < LIVE_WITHIN_SECONDS;
      return {
        name,
        address,
        endpoint: env[`${prefix}_ENDPOINT`],
        running: processOf(name) !== undefined,
        live,
        control: readControl(name),
        fee: quoted?.fee === undefined ? undefined : String(quoted.fee),
        margin: env[`${prefix}_SPREAD`],
        paymaster: env[`OCTANE_CLONE_${name.toUpperCase()}`],
        wbt: wbt.status === "fulfilled" ? formatEther(wbt.value) : undefined,
        tglm: tglm.status === "fulfilled" ? formatEther(tglm.value) : undefined,
        usdt: usdt.status === "fulfilled" ? formatUnits(usdt.value, 6) : undefined,
        relayed: lines.filter((line) => line.event === "relayed").length,
        withdrew: lastEvent?.event === "withdrew" ? String(lastEvent.reason) : undefined,
        aiUnavailable: live && regime?.source === "fallback",
        formula: quoted?.formula === undefined ? undefined : String(quoted.formula),
        gasCost: quoted?.gasCost === undefined ? undefined : String(quoted.gasCost),
        bufferBps: quoted?.bufferBps === undefined ? undefined : String(quoted.bufferBps),
        spread: started?.spread === undefined ? env[`${prefix}_SPREAD`] : String(started.spread),
        aiNote: regime?.note === undefined ? undefined : String(regime.note),
      };
    }),
  );
}

/** Reuses the same script as the command line, so there's one tested way to set a maker up. */
export async function setUpMaker(name: string, flags: string[]): Promise<string> {
  const { stdout } = await run("pnpm", ["new-maker", name, ...flags], { cwd: ROOT, env: childEnv(), timeout: 180_000 });
  return stdout.trim().split("\n").slice(-4).join("\n");
}

export function startMaker(name: string): void {
  if (processOf(name) !== undefined) return;
  const log = openSync(join(DATA, `${name}.log`), "a");
  const child = spawn("pnpm", ["exec", "tsx", "src/index.ts", name], {
    cwd: join(ROOT, "apps", "makers"),
    detached: true,
    stdio: ["ignore", log, log],
    env: childEnv(),
  });
  child.unref();
}

export function stopMaker(name: string): boolean {
  const pid = processOf(name);
  if (pid === undefined) return false;
  process.kill(pid, "SIGTERM");
  return true;
}

export function controlOf(name: string): Control {
  return readControl(name);
}
