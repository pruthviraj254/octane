import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { SpendCaps } from "./caps.ts";

const caps = () => new SpendCaps(500n, 10_000n, pathToFileURL(`${mkdtempSync(join(tmpdir(), "caps-"))}/`));

describe("SpendCaps", () => {
  it("allows spending within the cap", () => {
    expect(() => caps().check(9_500n)).not.toThrow();
  });

  it("refuses when the amount plus the highest fee passes the cap", () => {
    expect(() => caps().check(9_501n)).toThrow("daily cap");
  });

  it("remembers what was spent", () => {
    const limits = caps();
    limits.record(6_000n);
    limits.record(1_000n);
    expect(limits.spentToday()).toBe(7_000n);
    expect(() => limits.check(3_000n)).toThrow("daily cap");
    expect(() => limits.check(2_500n)).not.toThrow();
  });
});
