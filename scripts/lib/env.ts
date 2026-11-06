import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { redactAccessKey } from "@octane/sdk";

const envPath = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

/** Reads a required setting. Never logs the value. */
export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set in .env`);
  return value;
}

export function envHex(name: string): `0x${string}` {
  const value = env(name);
  if (!value.startsWith("0x")) throw new Error(`${name} must start with 0x`);
  return value as `0x${string}`;
}

/** Runs a script and prints failures without the access key that RPC errors repeat. */
export async function run(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (error) {
    const text = error instanceof Error ? (error.stack ?? error.message) : String(error);
    console.error(redactAccessKey(text));
    process.exitCode = 1;
  }
}

/** Records a deployed address in .env, so the next run reuses it. */
export function saveEnv(name: string, value: string): void {
  const line = `${name}=${value}`;
  const text = readFileSync(envPath, "utf8");
  const pattern = new RegExp(`^${name}=.*$`, "m");
  writeFileSync(envPath, pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`);
  process.env[name] = value;
}
