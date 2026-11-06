import { describe, expect, it } from "vitest";
import { parseConciergeReply, parseIntent, settledWithoutLlm } from "../src/index.ts";

describe("parseIntent", () => {
  it("reads a plain request", () => {
    expect(parseIntent("Pay Rahul 10 USDT")).toMatchObject({ action: "pay", to: "Rahul", amount: "10", token: "USDT" });
  });

  it("reads Hinglish", () => {
    expect(parseIntent("Rahul ko 10 USDC bhejo")).toMatchObject({ action: "pay", to: "Rahul", amount: "10", token: "USDC" });
  });

  it("reads an address, and doesn't mistake its digits for the amount", () => {
    const address = "0xB349F2F9C6174C512cEFc23682c979616d58cFB5";
    expect(parseIntent(`send 2.5 usdt to ${address}`)).toMatchObject({ to: address, amount: "2.5", token: "USDT" });
  });

  it("defaults to USDT", () => {
    expect(parseIntent("Pay Rahul 5")).toMatchObject({ token: "USDT" });
  });

  it("asks again when it can't tell who or how much", () => {
    expect(parseIntent("hello").action).toBe("unknown");
    expect(parseIntent("pay 10 usdt").action).toBe("unknown");
    expect(parseIntent("Pay Rahul").action).toBe("unknown");
  });
});

describe("parseConciergeReply", () => {
  it("accepts a well-formed answer", () => {
    const reply = '{"action":"pay","to":"Rahul","amount":"10","token":"USDT"}';
    expect(parseConciergeReply(reply, "whatever")).toMatchObject({ action: "pay", source: "llm" });
  });

  it("falls back to the parser on a malformed answer", () => {
    expect(parseConciergeReply("no idea", "Pay Rahul 10 USDT")).toMatchObject({ source: "parser", amount: "10" });
  });

  it("rejects an answer with an invalid amount", () => {
    const reply = '{"action":"pay","to":"Rahul","amount":"lots","token":"USDT"}';
    expect(parseConciergeReply(reply, "Pay Rahul 10 USDT")).toMatchObject({ source: "parser", amount: "10" });
  });
});

describe("addresses", () => {
  const ADDRESS = "0xB349F2F9C6174C512cEFc23682c979616d58cFB5";
  const OTHER = "0x461bc91113A101dba5D8F2912c614Fb264Cab0F5";
  const LOWERCASE = ADDRESS.toLowerCase();
  const pay = (to: string) => JSON.stringify({ action: "pay", to, amount: "1", token: "USDT" });

  it("asks how much when only an address is pasted", () => {
    expect(parseIntent(ADDRESS)).toEqual({ action: "amount", to: ADDRESS });
    expect(settledWithoutLlm(`  ${ADDRESS} `)).toBe(true);
  });

  it("still asks the LLM when there are other words", () => {
    expect(settledWithoutLlm(`Pay ${ADDRESS} 1 USDT`)).toBe(false);
  });

  it("reads an amount on either side of the address", () => {
    expect(parseIntent(`${ADDRESS} 0.1 USDT`)).toMatchObject({ action: "pay", to: ADDRESS, amount: "0.1" });
    expect(parseIntent(`0.1 USDT to ${ADDRESS}`)).toMatchObject({ action: "pay", to: ADDRESS, amount: "0.1" });
    expect(parseIntent(`${ADDRESS} ko 5 USDT bhejo`)).toMatchObject({ action: "pay", to: ADDRESS, amount: "5" });
  });

  it.each([
    ["one character too long", `Pay ${LOWERCASE}a 1 USDT`],
    ["one character too short", `Pay ${LOWERCASE.slice(0, -1)} 1 USDT`],
    ["a bad checksum", `Pay ${ADDRESS.replace("B349", "b349")} 1 USDT`],
  ])("refuses an address with %s, and never reads part of it", (_, text) => {
    expect(parseIntent(text)).toMatchObject({ action: "unknown", reply: expect.stringContaining("doesn't look right") });
    expect(settledWithoutLlm(text)).toBe(true);
  });

  it("refuses two addresses", () => {
    const text = `Pay ${ADDRESS} or ${OTHER} 1 USDT`;
    expect(parseIntent(text)).toMatchObject({ action: "unknown", reply: expect.stringContaining("more than one") });
    expect(settledWithoutLlm(text)).toBe(true);
  });

  it("keeps the user's address when the LLM returns a different one", () => {
    expect(parseConciergeReply(pay(OTHER), `Pay ${ADDRESS} 1 USDT`)).toMatchObject({ action: "pay", to: ADDRESS });
  });

  it("keeps the user's address when the LLM changes one character", () => {
    const changed = `${LOWERCASE.slice(0, -1)}0`;
    expect(parseConciergeReply(pay(changed), `Pay ${LOWERCASE} 1 USDT`)).toMatchObject({ action: "pay", to: LOWERCASE });
  });

  it("ignores an address the user never wrote", () => {
    expect(parseConciergeReply(pay(OTHER), "Pay Rahul 1 USDT")).toMatchObject({ action: "pay", to: "Rahul", source: "parser" });
  });

  it("asks for the amount when the LLM can't read a pasted address", () => {
    const reply = JSON.stringify({ action: "unknown", reply: "Send a payment request." });
    expect(parseConciergeReply(reply, `send to ${ADDRESS}`)).toEqual({ action: "amount", to: ADDRESS });
  });
});
