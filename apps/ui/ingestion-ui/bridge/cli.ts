import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

export type CliEngine = "antigravity" | "claude";

export interface CliInvocation {
  executable: string;
  args: string[];
  /** Text written to the process stdin (keeps long prompts out of the command line). */
  stdin?: string;
  /** Needed to launch .cmd/.bat shims on Windows; args must then be shell-safe. */
  shell: boolean;
}

/** Windows limits a command line to 32 767 characters; stay well below it for argv prompts. */
const MAX_ARGV_PROMPT_CHARS = 28000;
const SAFE_MODEL = /^[A-Za-z0-9._:\-[\]]+$/;

export function findExecutable(names: string[]): string | null {
  const userHome = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || "";
  const appData = process.env.APPDATA || "";

  const candidates: string[] = [];
  for (const name of names) {
    if (localAppData) {
      candidates.push(
        path.join(localAppData, "agy", "bin", `${name}.EXE`),
        path.join(localAppData, "agy", "bin", `${name}.exe`)
      );
    }
    candidates.push(
      path.join(userHome, ".local", "bin", `${name}.exe`),
      path.join(userHome, ".local", "bin", name),
      path.join(userHome, ".gemini", "bin", `${name}.exe`),
      path.join(userHome, ".gemini", "bin", name)
    );
    if (appData) {
      candidates.push(path.join(appData, "npm", `${name}.cmd`), path.join(appData, "npm", name));
    }
  }

  for (const dir of (process.env.PATH || "").split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      candidates.push(path.join(dir, name), path.join(dir, `${name}.exe`), path.join(dir, `${name}.cmd`));
    }
  }

  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
}

function needsShell(executable: string): boolean {
  return process.platform === "win32" && /\.(cmd|bat)$/i.test(executable);
}

/**
 * Builds a text-only CLI call. The prompt embeds scraped web pages, so the CLIs run without
 * any tools or permission bypass: a malicious page can at worst change the returned text.
 */
export function buildCliInvocation(
  engine: CliEngine,
  executable: string,
  prompt: string,
  model?: string
): CliInvocation {
  const shell = needsShell(executable);
  const modelArg = model && model !== "default" && SAFE_MODEL.test(model) ? model : undefined;

  if (engine === "claude") {
    const args = [
      "-p",
      // `--tools ""` disables every built-in tool; through cmd.exe the empty value needs `=""`.
      ...(shell ? ['--tools=""'] : ["--tools", ""]),
      "--permission-mode",
      "dontAsk",
      "--strict-mcp-config",
      "--disable-slash-commands",
      "--no-session-persistence",
      "--output-format",
      "json",
    ];
    if (modelArg) args.push("--model", modelArg);
    return { executable, args, stdin: prompt, shell };
  }

  if (shell) {
    throw new Error("Antigravity CLI dạng .cmd không được hỗ trợ; hãy dùng agy.exe.");
  }
  if (prompt.length > MAX_ARGV_PROMPT_CHARS) {
    throw new Error(
      `Prompt quá dài cho Antigravity CLI (${prompt.length} ký tự, tối đa ${MAX_ARGV_PROMPT_CHARS}). ` +
        "Hãy nhập Gemini API Key hoặc giảm độ dài nội dung."
    );
  }
  const args = ["-p", prompt, "--output-format", "json", "--disable-slash-commands"];
  if (modelArg) args.push("--model", modelArg, "--effort", "low");
  return { executable, args, shell: false };
}

export type CliRunResult =
  | { kind: "ok"; stdout: string; stderr: string; code: number | null }
  | { kind: "timeout" }
  | { kind: "spawn-error"; message: string };

/** Runs the CLI and resolves exactly once, killing the process on timeout. */
export function runCli(invocation: CliInvocation, timeoutMs: number): Promise<CliRunResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: CliRunResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const proc = spawn(invocation.executable, invocation.args, {
      stdio: [invocation.stdin !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
      shell: invocation.shell,
      windowsHide: true,
      env: {
        ...process.env,
        DISABLE_AUTOUPDATER: "1",
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      },
    });

    const timer = setTimeout(() => {
      proc.kill();
      finish({ kind: "timeout" });
    }, timeoutMs);

    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => (stdout += d.toString()));
    proc.stderr?.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => finish({ kind: "spawn-error", message: err.message }));
    proc.on("close", (code) => finish({ kind: "ok", stdout, stderr, code }));

    if (invocation.stdin !== undefined && proc.stdin) {
      proc.stdin.on("error", () => {
        // The CLI may exit before reading stdin; the close/error handlers report it.
      });
      proc.stdin.end(invocation.stdin);
    }
  });
}

/** Extracts the model's answer from the CLI output (JSON envelope or plain text). */
export function parseCliOutput(stdout: string): { ok: true; text: string } | { ok: false; error: string } {
  const text = stdout.trim();
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      if (parsed.status === "ERROR" || parsed.is_error === true) {
        return { ok: false, error: String(parsed.error || parsed.result || "CLI trả về lỗi.") };
      }
      if (typeof parsed.response === "string") return { ok: true, text: parsed.response };
      if (typeof parsed.result === "string") return { ok: true, text: parsed.result };
    }
  } catch {
    // Plain-text output.
  }
  return { ok: true, text };
}
