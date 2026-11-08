import fs from "fs";
import type { IncomingMessage, ServerResponse } from "http";
import os from "os";
import path from "path";
import {
  buildCliInvocation,
  CliEngine,
  CliInvocation,
  findExecutable,
  parseCliOutput,
  runCli,
} from "./cli";
import { assertFetchableUrl, checkBridgeRequest } from "./security";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_HTML_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export interface BridgeOptions {
  token: string;
  cliTimeoutMs?: number;
  fetchTimeoutMs?: number;
  /** Disables /api/cli/* (production server: no local CLIs, and agents must not run on the VPS). */
  disableCli?: boolean;
  /** Overridable in tests; defaults to locating the real CLI binaries. */
  resolveCli?: (engine: CliEngine, prompt: string, model?: string) => CliInvocation | null;
}

type Next = (err?: unknown) => void;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const contentType = (req.headers["content-type"] || "").toLowerCase();
  if (!contentType.startsWith("application/json")) {
    throw Object.assign(new Error("Content-Type phải là application/json."), { status: 415 });
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) {
      throw Object.assign(new Error("Nội dung yêu cầu quá lớn."), { status: 413 });
    }
    chunks.push(chunk as Buffer);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    throw Object.assign(new Error("JSON không hợp lệ."), { status: 400 });
  }
}

async function readLimitedText(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("Trang quá lớn (> 10MB).");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

interface FetchedPage {
  ok: boolean;
  status: number;
  html: string;
  finalUrl: string;
}

/** Fetches a public page, re-validating every redirect hop against the SSRF rules. */
async function fetchPublicHtml(
  rawUrl: string,
  timeoutMs: number
): Promise<FetchedPage> {
  let current = await assertFetchableUrl(rawUrl);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(current, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "manual",
      signal,
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      current = await assertFetchableUrl(new URL(location, current).toString());
      continue;
    }
    return { ok: res.ok, status: res.status, html: await readLimitedText(res), finalUrl: current.toString() };
  }
  throw new Error("Quá nhiều lần chuyển hướng.");
}

function looksLikeDocSidebar(html: string): boolean {
  return html.includes("wiki-tree") || html.includes("sidebar");
}

async function handleFetchHtml(req: IncomingMessage, res: ServerResponse, timeoutMs: number) {
  let targetUrl = "";
  if (req.method === "GET") {
    targetUrl = new URL(req.url || "", "http://localhost").searchParams.get("url") || "";
  } else if (req.method === "POST") {
    const body = await readJsonBody(req);
    targetUrl = typeof body.url === "string" ? body.url : "";
  } else {
    return sendJson(res, 405, { error: "Method not allowed." });
  }

  if (!targetUrl) return sendJson(res, 400, { error: "Thiếu tham số url." });

  let page: FetchedPage;
  try {
    page = await fetchPublicHtml(targetUrl, timeoutMs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return sendJson(res, 400, { error: `Không thể tải URL (${targetUrl}): ${message}` });
  }

  // Doc roots often render no sidebar; many doc sites expose it on /introduction.
  if (
    !looksLikeDocSidebar(page.html) &&
    !targetUrl.endsWith("/introduction") &&
    !targetUrl.endsWith("/docs")
  ) {
    try {
      const alt = await fetchPublicHtml(targetUrl.replace(/\/+$/, "") + "/introduction", timeoutMs);
      if (alt.ok && looksLikeDocSidebar(alt.html)) page = alt;
    } catch {
      // Keep the original page.
    }
  }

  if (!page.ok) {
    return sendJson(res, 502, { error: `Trang ${page.finalUrl} trả về HTTP ${page.status}.` });
  }
  sendJson(res, 200, { success: true, html: page.html, finalUrl: page.finalUrl });
}

export function getClaudeOAuthToken(): string | null {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN && process.env.CLAUDE_CODE_OAUTH_TOKEN.trim().length > 0) {
    return process.env.CLAUDE_CODE_OAUTH_TOKEN.trim();
  }
  const userHome = os.homedir();
  const tokenPaths = [
    "/root/.claude/oauth_token.env",
    path.join(userHome, ".claude", "oauth_token.env"),
  ];
  for (const p of tokenPaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8").trim();
        const match = raw.match(/CLAUDE_CODE_OAUTH_TOKEN=(.*)/);
        const tok = match ? match[1].replace(/['"]/g, "").trim() : raw.replace(/['"]/g, "").trim();
        if (tok.startsWith("sk-ant-")) return tok;
      }
    } catch {}
  }
  return null;
}

export function isClaudeAuthenticated(claudePath: string | null): boolean {
  if (!claudePath) return false;
  if (getClaudeOAuthToken()) return true;
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim().length > 0) return true;
  const userHome = os.homedir();
  const credPaths = [
    path.join(userHome, ".claude", ".credentials.json"),
    path.join(userHome, ".claude.json"),
    "/root/.claude/.credentials.json",
    "/root/.claude.json",
  ];
  for (const credPath of credPaths) {
    try {
      if (fs.existsSync(credPath)) {
        const raw = fs.readFileSync(credPath, "utf8");
        const json = JSON.parse(raw);
        if (json?.claudeAiOauth?.accessToken && json.claudeAiOauth.accessToken.length > 0) {
          return true;
        }
      }
    } catch {}
  }
  return false;
}

export function isAntigravityAuthenticated(agyPath: string | null): boolean {
  if (!agyPath) return false;
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0) return true;
  const userHome = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || "";
  const credPaths = [
    path.join(userHome, ".gemini", "oauth_creds.json"),
    path.join(userHome, ".gemini", "credentials.json"),
    path.join(localAppData, "agy", "oauth_creds.json"),
    "/root/.gemini/oauth_creds.json",
  ];
  for (const credPath of credPaths) {
    try {
      if (fs.existsSync(credPath)) return true;
    } catch {}
  }
  return fs.existsSync(path.join(userHome, ".gemini")) || fs.existsSync("/root/.gemini");
}

function defaultResolveCli(engine: CliEngine, prompt: string, model?: string): CliInvocation | null {
  const executable = findExecutable([engine === "claude" ? "claude" : "agy"]);
  return executable ? buildCliInvocation(engine, executable, prompt, model) : null;
}

async function handleCliExtract(
  req: IncomingMessage,
  res: ServerResponse,
  options: Required<Pick<BridgeOptions, "cliTimeoutMs" | "resolveCli">>
) {
  const body = await readJsonBody(req);
  const engineInput = body.engine;
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const model = typeof body.model === "string" ? body.model : undefined;

  const engine: CliEngine | null =
    engineInput === "antigravity" || engineInput === "gemini"
      ? "antigravity"
      : engineInput === "claude"
        ? "claude"
        : null;
  if (!engine) return sendJson(res, 400, { error: `Engine không hỗ trợ CLI: ${String(engineInput)}` });
  if (!prompt.trim()) return sendJson(res, 400, { error: "Thiếu prompt." });

  const oauthToken = getClaudeOAuthToken();
  if (oauthToken && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = oauthToken;
  }

  let invocation: CliInvocation | null;
  try {
    invocation = options.resolveCli(engine, prompt, model);
  } catch (err) {
    return sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
  }
  if (!invocation) {
    const name = engine === "claude" ? "Claude Code CLI ('claude')" : "Antigravity CLI ('agy')";
    return sendJson(res, 400, {
      error: `Không tìm thấy ${name}. Hãy cài đặt CLI hoặc nhập API Key trong phần Cài đặt AI Engine.`,
    });
  }

  const result = await runCli(invocation, options.cliTimeoutMs);
  if (result.kind === "timeout") {
    return sendJson(res, 504, {
      error: `Thực thi CLI quá thời gian chờ (${Math.round(options.cliTimeoutMs / 1000)}s).`,
    });
  }
  if (result.kind === "spawn-error") {
    return sendJson(res, 500, { error: `Lỗi khởi chạy CLI (${invocation.executable}): ${result.message}` });
  }
  const combined = (result.stdout + "\n" + result.stderr).trim();
  const isAuthError = /(not logged in|please run \/login|failed to authenticate|oauth session expired)/i.test(combined);

  if (result.code !== 0 || isAuthError) {
    const errorText = isAuthError
      ? `CLI (${engine}) chưa được đăng nhập hoặc phiên đã hết hạn. Hãy chuyển sang Google Antigravity / Gemini hoặc nhập API Key trong Cài đặt AI Engine.`
      : `CLI trả về mã lỗi ${result.code}: ${(result.stderr || result.stdout).slice(0, 2000)}`;
    return sendJson(res, isAuthError ? 401 : 500, { error: errorText });
  }

  const parsed = parseCliOutput(result.stdout);
  if (!parsed.ok) return sendJson(res, 400, { error: parsed.error });
  sendJson(res, 200, {
    success: true,
    rawOutput: parsed.text,
    engine,
    executable: invocation.executable,
  });
}

/**
 * Connect-style middleware serving /api/cli/* and /api/proxy/* for the ingestion UI.
 * Used by the Vite dev server (vite-plugin-cli.ts); framework-free so it can also run standalone.
 */
export function createBridgeMiddleware(options: BridgeOptions) {
  const cliTimeoutMs = options.cliTimeoutMs ?? 180_000;
  const fetchTimeoutMs = options.fetchTimeoutMs ?? 20_000;
  const resolveCli = options.resolveCli ?? defaultResolveCli;

  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const pathname = (req.url || "").split("?")[0];
    if (!pathname.startsWith("/api/cli/") && !pathname.startsWith("/api/proxy/")) return next();

    const check = checkBridgeRequest(req, options.token);
    if (!check.ok) return sendJson(res, check.status, { error: check.error });

    try {
      if (options.disableCli && pathname.startsWith("/api/cli/")) {
        if (pathname === "/api/cli/status") {
          return sendJson(res, 200, {
            antigravity: { available: false, path: null },
            claude: { available: false, path: null },
            disabled: true,
          });
        }
        return sendJson(res, 403, {
          error: "Cầu nối CLI bị tắt trên server. Hãy nhập API Key trong phần Cài đặt AI Engine.",
        });
      }
      if (pathname === "/api/cli/status" && req.method === "GET") {
        const agy = findExecutable(["agy"]);
        const claude = findExecutable(["claude"]);
        const agyAuth = isAntigravityAuthenticated(agy);
        const claudeAuth = isClaudeAuthenticated(claude);
        return sendJson(res, 200, {
          antigravity: { available: agyAuth, path: agy, authenticated: agyAuth },
          claude: { available: claudeAuth, path: claude, authenticated: claudeAuth },
        });
      }
      if (pathname === "/api/proxy/fetch-html") {
        return await handleFetchHtml(req, res, fetchTimeoutMs);
      }
      if (pathname === "/api/cli/extract" && req.method === "POST") {
        return await handleCliExtract(req, res, { cliTimeoutMs, resolveCli });
      }
      sendJson(res, 404, { error: "Không tìm thấy endpoint." });
    } catch (err) {
      const status = (err as { status?: number }).status ?? 500;
      sendJson(res, status, { error: err instanceof Error ? err.message : "Internal server error" });
    }
  };
}
