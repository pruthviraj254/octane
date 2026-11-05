import { describe, expect, it } from "vitest";
import { parseConciergeReply, parseIntent } from "../src/index.ts";

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
