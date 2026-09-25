import fs from "fs";
import http from "http";
import https from "https";
import path from "path";
import { timingSafeEqual } from "crypto";
import { pathToFileURL } from "url";
import { createBridgeMiddleware } from "./middleware";
import { BRIDGE_TOKEN_META, createBridgeToken } from "./security";

/**
 * Production server for the ingestion UI (Docker image): serves the built app, the /api/proxy bridge,
 * and a /firecrawl/* proxy to the Firecrawl API that adds the API key server-side.
 */
export interface UiServerConfig {
  distDir: string;
  /** Firecrawl API base, e.g. http://api:3002 inside docker compose. */
  firecrawlApiUrl: string;
  firecrawlApiKey?: string;
  /** "user:password" enables HTTP Basic Auth for everything except /healthz. */
  basicAuth?: string;
  /** /api/cli/* stays off unless explicitly enabled. */
  enableCli?: boolean;
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "same-origin",
};

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function isAuthorized(req: http.IncomingMessage, basicAuth: string): boolean {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  return safeEqual(decoded, basicAuth);
}

/** Injects the per-process bridge token so the page can call /api/proxy/*. */
export function injectBridgeToken(html: string, token: string): string {
  const meta = `<meta name="${BRIDGE_TOKEN_META}" content="${token}" />`;
  // Drop any token baked in at build time: the page reads the first one it finds.
  html = html.replace(new RegExp(`\\s*<meta name="${BRIDGE_TOKEN_META}"[^>]*>`, "g"), "");
  return html.includes("</head>") ? html.replace("</head>", `  ${meta}\n</head>`) : meta + html;
}

function sendText(res: http.ServerResponse, status: number, body: string, headers: Record<string, string> = {}) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function proxyFirecrawl(req: http.IncomingMessage, res: http.ServerResponse, config: UiServerConfig) {
  const upstreamPath = (req.url || "").replace(/^\/firecrawl/, "") || "/";
  if (!/^\/v[12]\//.test(upstreamPath)) return sendText(res, 404, "Not found");

  const target = new URL(upstreamPath, config.firecrawlApiUrl.replace(/\/+$/, "") + "/");
  const headers: http.OutgoingHttpHeaders = {
    "content-type": req.headers["content-type"] || "application/json",
    accept: req.headers.accept || "application/json",
  };
  if (req.headers["content-length"]) headers["content-length"] = req.headers["content-length"];
  if (config.firecrawlApiKey) headers.authorization = `Bearer ${config.firecrawlApiKey}`;

  const client = target.protocol === "https:" ? https : http;
  const upstream = client.request(target, { method: req.method, headers, timeout: 300_000 }, (upRes) => {
    res.writeHead(upRes.statusCode || 502, {
      "Content-Type": upRes.headers["content-type"] || "application/json",
      ...SECURITY_HEADERS,
    });
    upRes.pipe(res);
  });
  upstream.on("timeout", () => upstream.destroy(new Error("Firecrawl API timeout")));
  upstream.on("error", (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ success: false, error: `Không kết nối được Firecrawl API: ${err.message}` }));
    } else {
      res.destroy();
    }
  });
  req.pipe(upstream);
}

function serveStatic(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  distDir: string,
  indexHtml: string
) {
  if (req.method !== "GET" && req.method !== "HEAD") return sendText(res, 405, "Method not allowed");

  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url || "/", "http://localhost").pathname);
  } catch {
    return sendText(res, 400, "Bad request");
  }
  const filePath = path.resolve(distDir, "." + pathname);
  const insideDist = filePath === distDir || filePath.startsWith(distDir + path.sep);

  if (insideDist && pathname !== "/" && pathname !== "/index.html" && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const immutable = pathname.startsWith("/assets/");
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
      ...SECURITY_HEADERS,
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // SPA fallback: every other path gets the app shell with a fresh-per-process token.
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[".html"],
    "Cache-Control": "no-store",
    ...SECURITY_HEADERS,
  });
  res.end(req.method === "HEAD" ? undefined : indexHtml);
}

export function createUiServer(config: UiServerConfig): http.Server {
  const distDir = path.resolve(config.distDir);
  const token = createBridgeToken();
  const indexHtml = injectBridgeToken(fs.readFileSync(path.join(distDir, "index.html"), "utf8"), token);
  const bridge = createBridgeMiddleware({ token, disableCli: !config.enableCli });

  return http.createServer((req, res) => {
    const pathname = (req.url || "/").split("?")[0];
    if (pathname === "/healthz") return sendText(res, 200, "ok");

    if (config.basicAuth && !isAuthorized(req, config.basicAuth)) {
      return sendText(res, 401, "Cần đăng nhập.", {
        "WWW-Authenticate": 'Basic realm="Firecrawl Ingestion UI", charset="UTF-8"',
      });
    }

    if (pathname === "/firecrawl" || pathname.startsWith("/firecrawl/")) {
      return proxyFirecrawl(req, res, config);
    }

    void bridge(req, res, () => serveStatic(req, res, distDir, indexHtml));
  });
}

function isLoopbackOnly(hosts: string): boolean {
  return hosts
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean)
    .every((h) => ["localhost", "127.0.0.1", "[::1]", "::1"].includes(h));
}

function main() {
  const basicAuth = process.env.UI_BASIC_AUTH || "";
  const allowedHosts = process.env.BRIDGE_ALLOWED_HOSTS || "";
  if (!basicAuth && !isLoopbackOnly(allowedHosts) && process.env.UI_ALLOW_NO_AUTH !== "1") {
    console.error(
      "Từ chối khởi động: BRIDGE_ALLOWED_HOSTS mở cho domain công khai nhưng chưa đặt UI_BASIC_AUTH=user:password " +
        "(đặt UI_ALLOW_NO_AUTH=1 nếu thật sự muốn bỏ đăng nhập)."
    );
    process.exit(1);
  }
  if (basicAuth && !basicAuth.includes(":")) {
    console.error("UI_BASIC_AUTH phải có dạng user:password.");
    process.exit(1);
  }

  const port = Number(process.env.PORT || 3006);
  const server = createUiServer({
    distDir: process.env.UI_DIST_DIR || path.resolve("dist"),
    firecrawlApiUrl: process.env.FIRECRAWL_API_URL || "http://localhost:3002",
    firecrawlApiKey: process.env.FIRECRAWL_API_KEY || undefined,
    basicAuth: basicAuth || undefined,
    enableCli: process.env.BRIDGE_ENABLE_CLI === "1",
  });
  server.listen(port, "0.0.0.0", () => {
    console.log(`Ingestion UI đang chạy tại http://0.0.0.0:${port} (Basic Auth: ${basicAuth ? "bật" : "tắt"})`);
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
