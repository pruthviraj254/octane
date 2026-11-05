import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { authorisedValue, bindingNonce, buildPayment, encodeRelayJob, randomSalt, signPaymentAuth } from "../src/index.js";
import { buildPaymentFixture, paymentFixturePath, testQuote, testSigner } from "./quote-fixture.js";

const payer = testSigner.address;
const merchant = "0x2222222222222222222222222222222222222222" as const;

describe("pathB", () => {
  it("binds the authorisation to the salt, so repeat payments don't collide", () => {
    const first = buildPayment({ quote: testQuote, payer, merchant, amount: 1n });
    const second = buildPayment({ quote: testQuote, payer, merchant, amount: 1n });
    expect(bindingNonce(testQuote, first)).not.toBe(bindingNonce(testQuote, second));
  });

  it("binds the authorisation to the maker", () => {
    const payment = buildPayment({ quote: testQuote, payer, merchant, amount: 1n });
    const other = { ...testQuote, maker: merchant };
    expect(bindingNonce(testQuote, payment)).not.toBe(bindingNonce(other, payment));
  });

  it("charges the payer the fee only when the payer pays it", () => {
    const payerPays = buildPayment({ quote: testQuote, payer, merchant, amount: 100n });
    const merchantPays = buildPayment({ quote: testQuote, payer, merchant, amount: 100n, merchantPays: true });
    expect(authorisedValue(testQuote, payerPays)).toBe(100n + testQuote.fee);
    expect(authorisedValue(testQuote, merchantPays)).toBe(100n);
  });

  it("lets the authorisation live exactly as long as the quote", () => {
    const payment = buildPayment({ quote: testQuote, payer, merchant, amount: 1n });
    expect(payment.validBefore).toBe(testQuote.validUntil + 1n);
  });

  it("makes 32-byte salts", () => {
    expect(randomSalt()).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("encodes a relay call", async () => {
    const payment = buildPayment({ quote: testQuote, payer, merchant, amount: 1n });
    const authSig = await signPaymentAuth(testSigner, testQuote, payment);
    const data = encodeRelayJob({ quote: testQuote, quoteSig: authSig, payment, authSig });
    expect(data).toMatch(/^0x[0-9a-f]+$/);
  });

  it("matches the fixture the Solidity test verifies", () => {
    const committed: unknown = JSON.parse(readFileSync(paymentFixturePath, "utf8"));
    expect(buildPaymentFixture()).toEqual(committed);
  });
});
