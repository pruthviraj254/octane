import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";

/**
 * Server-only settings: the environment first, then the repo's .env. These stay out of
 * next.config's `env`, because values there can end up in the browser bundle.
 */
export function serverSetting(name: string): string | undefined {
  const fromEnvironment = process.env[name];
  if (fromEnvironment) return fromEnvironment;
  const file = join(process.cwd(), "..", "..", ".env");
  if (!existsSync(file)) return undefined;
  return parseEnv(readFileSync(file, "utf8"))[name] || undefined;
}
