import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_API_MODEL, anthropicApi, createLlm } from "../src/llm.ts";

/** A stand-in for the Anthropic API, so the real SDK runs end to end with no key and no spend. */
interface Reply {
  status: number;
  body: unknown;
}

const message = (content: unknown[], stopReason = "end_turn"): Reply => ({
  status: 200,
  body: {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: DEFAULT_API_MODEL,
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  },
});

let server: Server;
let baseURL: string;
let reply: Reply;
let received: { url: string; headers: IncomingHttpHeaders; body: Record<string, unknown> }[];

beforeAll(async () => {
  server = createServer((request, response) => {
    let text = "";
    request.on("data", (chunk: Buffer) => (text += chunk.toString()));
    request.on("end", () => {
      received.push({ url: request.url ?? "", headers: request.headers, body: JSON.parse(text) as Record<string, unknown> });
      response.writeHead(reply.status, { "content-type": "application/json" });
      response.end(JSON.stringify(reply.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

beforeEach(() => {
  received = [];
  reply = message([{ type: "text", text: "hello" }]);
});

describe("anthropicApi", () => {
  it("sends a well-formed request and returns the text", async () => {
    const llm = anthropicApi({ apiKey: "test-key", baseURL });
    await expect(llm.complete("be brief", "hi")).resolves.toBe("hello");

    const [call] = received;
    expect(call?.url).toContain("/v1/messages");
    expect(call?.headers.authorization).toBe("Bearer test-key");
    expect(call?.headers["anthropic-beta"]).toContain("server-side-fallback-2026-07-01");
    expect(call?.body).toMatchObject({
      model: "claude-opus-5-5",
      system: "be brief",
      messages: [{ role: "user", content: "hi" }],
      output_config: { effort: "low" },
      fallbacks: "default",
    });
  });

  it("uses the model it's given, and sends no fallback to Haiku", async () => {
    await anthropicApi({ apiKey: "k", baseURL, model: "claude-haiku-5-5" }).complete("s", "p");
    expect(received[0]?.body.model).toBe("claude-haiku-5-5");
    expect(received[0]?.body).not.toHaveProperty("fallbacks");
  });

  it("skips thinking blocks and reads only the text", async () => {
    reply = message([
      { type: "thinking", thinking: "", signature: "x" },
      { type: "text", text: '{"regime":"calm"}' },
    ]);
    await expect(anthropicApi({ apiKey: "k", baseURL }).complete("s", "p")).resolves.toBe('{"regime":"calm"}');
  });

  it("treats a refusal as a failure, so the caller's fallback runs", async () => {
    reply = message([], "refusal");
    await expect(anthropicApi({ apiKey: "k", baseURL }).complete("s", "p")).rejects.toThrow("refused");
  });

  it("treats an empty answer as a failure", async () => {
    reply = message([]);
    await expect(anthropicApi({ apiKey: "k", baseURL }).complete("s", "p")).rejects.toThrow("no text");
  });

  it("rejects a bad key without retrying", async () => {
    reply = { status: 401, body: { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } } };
    await expect(anthropicApi({ apiKey: "bad", baseURL }).complete("s", "p")).rejects.toThrow();
    expect(received).toHaveLength(1);
  });
});

describe("createLlm", () => {
  it("uses the API when a key is set", async () => {
    expect(createLlm({ apiKey: "k", cliModel: "haiku" })).toBeDefined();
  });

  it("uses Claude Code when there's no key", () => {
    expect(createLlm({ cliModel: "haiku" })).toBeDefined();
  });

  it("returns nothing when no LLM is configured", () => {
    expect(createLlm({})).toBeUndefined();
  });

  it("refuses to run the API with no key", () => {
    expect(() => createLlm({ provider: "anthropic-api" })).toThrow("ANTHROPIC_API_KEY");
  });

  it("refuses an unknown provider", () => {
    expect(() => createLlm({ provider: "other", apiKey: "k" })).toThrow("unknown LLM_PROVIDER");
  });
});
