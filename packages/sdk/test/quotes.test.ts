import { readFileSync } from "node:fs";
import { keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { hashQuote, isSignedByMaker, signQuote, type Quote } from "../src/index.js";
import { buildQuoteFixture, fixturePath, testQuote, testSigner } from "./quote-fixture.js";

const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

describe("quotes", () => {
  it("accepts the maker's signature", async () => {
    const signature = await signQuote(testSigner, testQuote);
    expect(await isSignedByMaker(testQuote, signature)).toBe(true);
  });

  it("refuses to sign for a different maker", async () => {
    const other = privateKeyToAccount(keccak256(toBytes("octane.test.quote.other")));
    await expect(signQuote(other, testQuote)).rejects.toThrow("not the quote maker");
  });

  it("rejects a signature from someone else", async () => {
    const other = privateKeyToAccount(keccak256(toBytes("octane.test.quote.other")));
    const signature = await signQuote(other, { ...testQuote, maker: other.address });
    expect(await isSignedByMaker(testQuote, signature)).toBe(false);
  });

  it.each<[string, Partial<Quote>]>([
    ["maker", { maker: "0x2222222222222222222222222222222222222222" }],
    ["chainId", { chainId: 1337n }],
    ["settlement", { settlement: "0x2222222222222222222222222222222222222222" }],
    ["token", { token: "0x2222222222222222222222222222222222222222" }],
    ["maxGas", { maxGas: testQuote.maxGas + 1n }],
    ["fee", { fee: testQuote.fee - 1n }],
    ["validUntil", { validUntil: testQuote.validUntil + 1n }],
    ["nonce", { nonce: testQuote.nonce + 1n }],
  ])("rejects a tampered %s and changes the hash", async (_field, change) => {
    const signature = await signQuote(testSigner, testQuote);
    const tampered = { ...testQuote, ...change };
    expect(await isSignedByMaker(tampered, signature)).toBe(false);
    expect(hashQuote(tampered)).not.toBe(hashQuote(testQuote));
  });

  it("rejects the malleable mirror of a valid signature", async () => {
    const signature = await signQuote(testSigner, testQuote);
    const s = BigInt(`0x${signature.slice(66, 130)}`);
    const v = Number.parseInt(signature.slice(130, 132), 16);
    const highS = (N - s).toString(16).padStart(64, "0");
    const mirror = `${signature.slice(0, 66)}${highS}${(v === 27 ? 28 : 27).toString(16)}` as Hex;
    expect(await isSignedByMaker(testQuote, mirror)).toBe(false);
  });

  it("rejects malformed signatures", async () => {
    const signature = await signQuote(testSigner, testQuote);
    expect(await isSignedByMaker(testQuote, "0x")).toBe(false);
    expect(await isSignedByMaker(testQuote, signature.slice(0, -2) as Hex)).toBe(false);
    expect(await isSignedByMaker(testQuote, `${signature.slice(0, -2)}1d` as Hex)).toBe(false);
  });

  it("matches the fixture the Solidity test verifies", async () => {
    const committed: unknown = JSON.parse(readFileSync(fixturePath, "utf8"));
    expect(await buildQuoteFixture()).toEqual(committed);
  });
});
