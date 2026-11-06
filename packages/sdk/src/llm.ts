import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import Anthropic from "@anthropic-ai/sdk";

/** The only variables the child sees, so no key in this process's environment can reach it. */
function childEnv(): NodeJS.ProcessEnv {
  return Object.fromEntries(["PATH", "HOME", "USER"].map((name) => [name, process.env[name]])) as NodeJS.ProcessEnv;
}

export interface LlmClient {
  complete(system: string, prompt: string): Promise<string>;
}

/**
 * Uses this machine's logged-in Claude Code, so no API key is needed. Tools, project settings
 * and MCP servers are all off, and the child gets a bare environment with no keys in it.
 * Node only: never import this from browser code.
 */
export function claudeCli(model: string, timeoutMs = 20_000): LlmClient {
  return {
    complete(system, prompt) {
      return new Promise((resolve, reject) => {
        execFile(
          "claude",
          [
            "-p",
            "--model",
            model,
            "--output-format",
            "json",
            "--tools",
            "",
            "--no-session-persistence",
            "--strict-mcp-config",
            "--setting-sources",
            "",
            "--system-prompt",
            system,
            prompt,
          ],
          {
            cwd: tmpdir(),
            timeout: timeoutMs,
            maxBuffer: 1_000_000,
            env: childEnv(),
          },
          (error, stdout) => {
            if (error) return reject(new Error("claude CLI failed"));
            try {
              const outer = JSON.parse(stdout) as { is_error?: boolean; result?: unknown };
              if (outer.is_error || typeof outer.result !== "string") return reject(new Error("claude CLI error"));
              resolve(outer.result);
            } catch {
              reject(new Error("claude CLI returned invalid JSON"));
            }
          },
        );
      });
    },
  };
}

export const DEFAULT_API_MODEL = "claude-opus-5-5";

/** Enough for a short JSON answer plus the model's thinking, which counts toward this limit. */
const MAX_TOKENS = 2_000;

export interface AnthropicApiOptions {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  baseURL?: string;
}

/** Calls Claude through the Anthropic API, for anywhere Claude Code isn't logged in. */
export function anthropicApi(options: AnthropicApiOptions): LlmClient {
  const model = options.model ?? DEFAULT_API_MODEL;
  const client = new Anthropic({
    apiKey: options.apiKey,
    timeout: options.timeoutMs ?? 20_000,
    maxRetries: 1,
    ...(options.baseURL ? { baseURL: options.baseURL } : {}),
  });
  // Haiku has no server-side refusal fallback, so the parameter is only sent to models that do.
  const fallback = model.includes("haiku")
    ? {}
    : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

  return {
    async complete(system, prompt) {
      const response = await client.beta.messages.create({
        model,
        max_tokens: MAX_TOKENS,
        system,
        // These are small, bounded decisions, and they run often.
        output_config: { effort: "low" },
        messages: [{ role: "user", content: prompt }],
        ...fallback,
      });
      if (response.stop_reason === "refusal") throw new Error("the model refused the request");
      const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
      if (!text) throw new Error("the model returned no text");
      return text;
    },
  };
}

export interface LlmSettings {
  /** "anthropic-api" or "claude-cli". Left out, an API key selects the API. */
  provider?: string | undefined;
  apiKey?: string | undefined;
  /** A full model ID for the API. */
  apiModel?: string | undefined;
  /** A model alias for Claude Code, such as "haiku". */
  cliModel?: string | undefined;
  timeoutMs?: number;
}

/**
 * Picks the LLM from settings. Returns undefined when none is configured: every caller has a
 * rule-based fallback, so an LLM is never required for a quote or a payment.
 */
export function createLlm(settings: LlmSettings): LlmClient | undefined {
  const provider = settings.provider ?? (settings.apiKey ? "anthropic-api" : "claude-cli");
  if (provider === "anthropic-api") {
    if (!settings.apiKey) throw new Error("LLM_PROVIDER is anthropic-api, but ANTHROPIC_API_KEY is not set");
    return anthropicApi({
      apiKey: settings.apiKey,
      ...(settings.apiModel ? { model: settings.apiModel } : {}),
      ...(settings.timeoutMs ? { timeoutMs: settings.timeoutMs } : {}),
    });
  }
  if (provider === "claude-cli") {
    return settings.cliModel ? claudeCli(settings.cliModel, settings.timeoutMs) : undefined;
  }
  throw new Error(`unknown LLM_PROVIDER "${provider}"`);
}
