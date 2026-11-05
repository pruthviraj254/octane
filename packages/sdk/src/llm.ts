import { execFile } from "node:child_process";
import { tmpdir } from "node:os";

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
