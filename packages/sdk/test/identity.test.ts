import { describe, expect, it } from "vitest";
import { explorerTx, resolveIdentity } from "../src/index.js";

describe("resolveIdentity", () => {
  it("normalises an address and shortens the label", async () => {
    const identity = await resolveIdentity("0xcedfb56113143d55b2358b8cfbb0deb5ad2f55a7");
    expect(identity.address).toBe("0xcedfB56113143d55b2358b8CFbB0dEB5Ad2f55a7");
    expect(identity.label).toBe("0xcedf…55a7");
  });

  it("rejects anything that isn't an address yet", async () => {
    await expect(resolveIdentity("rahul.eth")).rejects.toThrow("only addresses");
  });
});

describe("explorerTx", () => {
  it("links to the right explorer", () => {
    expect(explorerTx(1874, "0xabc")).toBe("https://explorer.testnet.whitechain.io/tx/0xabc");
  });

  it("refuses unknown chains", () => {
    expect(() => explorerTx(1, "0xabc")).toThrow("no explorer");
  });
});
