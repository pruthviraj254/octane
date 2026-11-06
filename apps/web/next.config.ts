import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";

// Only public values reach the browser. Private keys in the root .env stay out of this app.
const rootEnv = new URL("../../.env", import.meta.url);
const root = existsSync(rootEnv) ? parseEnv(readFileSync(rootEnv, "utf8")) : {};
const value = (name: string) => process.env[name] ?? root[name] ?? "";

const config: NextConfig = {
  transpilePackages: ["@octane/sdk"],
  devIndicators: false,
  env: {
    NEXT_PUBLIC_ARKIV_ACCESS_KEY: value("NEXT_PUBLIC_ARKIV_ACCESS_KEY"),
    NEXT_PUBLIC_OCTANE_RELAY: value("OCTANE_RELAY"),
    NEXT_PUBLIC_OCTANE_FACTORY: value("OCTANE_FACTORY"),
    NEXT_PUBLIC_MERCHANT: value("MERCHANT_ADDRESS"),
    NEXT_PUBLIC_INDEXER: value("INDEXER_ADDRESS"),
  },
};

export default config;
