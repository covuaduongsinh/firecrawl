// @vitest-environment node
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliBridgePlugin } from "../vite-plugin-cli";
import { createUiServer, injectBridgeToken } from "./server";

const AUTH = "thay:co-vua";
const authHeader = { Authorization: `Basic ${Buffer.from(AUTH).toString("base64")}` };

let ui: http.Server;
let api: http.Server;
let base: string;
const apiRequests: { url?: string; auth?: string; body: string }[] = [];

async function listen(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://localhost:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "ui-dist-"));
  fs.writeFileSync(path.join(dist, "index.html"), "<html><head><title>UI</title></head><body></body></html>");
  fs.mkdirSync(path.join(dist, "assets"));
  fs.writeFileSync(path.join(dist, "assets", "app.js"), "console.log(1)");
  fs.writeFileSync(path.join(os.tmpdir(), "secret.txt"), "secret");

  api = http.createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    apiRequests.push({ url: req.url, auth: req.headers.authorization, body });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ success: true, data: { markdown: "# ok" } }));
  });
  const apiUrl = await listen(api);

  ui = createUiServer({ distDir: dist, firecrawlApiUrl: apiUrl, firecrawlApiKey: "fc-secret", basicAuth: AUTH });
  base = await listen(ui);
});

afterAll(async () => {
  await new Promise((r) => ui.close(r));
  await new Promise((r) => api.close(r));
});

describe("production UI server", () => {
  it("yêu cầu đăng nhập Basic Auth", async () => {
    expect((await fetch(`${base}/`)).status).toBe(401);
    const wrong = { Authorization: `Basic ${Buffer.from("thay:sai").toString("base64")}` };
    expect((await fetch(`${base}/`, { headers: wrong })).status).toBe(401);
  });

  it("healthcheck không cần đăng nhập", async () => {
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
  });

  it("trả trang có bridge token và fallback SPA", async () => {
    const html = await (await fetch(`${base}/some/route`, { headers: authHeader })).text();
    expect(html).toMatch(/<meta name="firecrawl-bridge-token" content="[a-f0-9]{64}" \/>/);
  });

  it("phục vụ asset và chặn truy cập ngoài thư mục dist", async () => {
    const asset = await fetch(`${base}/assets/app.js`, { headers: authHeader });
    expect(asset.headers.get("cache-control")).toContain("immutable");
    const traversal = await fetch(`${base}/..%2Fsecret.txt`, { headers: authHeader });
    expect(await traversal.text()).not.toBe("secret");
  });

  it("proxy /firecrawl/v2 tới API kèm key phía server", async () => {
    const res = await fetch(`${base}/firecrawl/v2/scrape`, {
      method: "POST",
      headers: { ...authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://a.com" }),
    });
    expect(await res.json()).toEqual({ success: true, data: { markdown: "# ok" } });
    const last = apiRequests.at(-1)!;
    expect(last.url).toBe("/v2/scrape");
    expect(last.auth).toBe("Bearer fc-secret");
    expect(JSON.parse(last.body)).toEqual({ url: "https://a.com" });
  });

  it("không proxy đường dẫn ngoài /v1, /v2", async () => {
    expect((await fetch(`${base}/firecrawl/admin/x`, { headers: authHeader })).status).toBe(404);
  });

  it("tắt cầu nối CLI trên server", async () => {
    const html = await (await fetch(`${base}/`, { headers: authHeader })).text();
    const token = html.match(/content="([a-f0-9]{64})"/)![1];
    const headers = { ...authHeader, "X-Bridge-Token": token, "Content-Type": "application/json" };
    const status = await (await fetch(`${base}/api/cli/status`, { headers })).json();
    expect(status).toMatchObject({ claude: { available: false }, disabled: true });
    const res = await fetch(`${base}/api/cli/extract`, {
      method: "POST",
      headers,
      body: JSON.stringify({ engine: "claude", prompt: "x" }),
    });
    expect(res.status).toBe(403);
  });
});

describe("bridge token", () => {
  it("trang production chỉ có đúng một token (token lúc build bị thay)", () => {
    const html = injectBridgeToken(
      '<html><head><meta name="firecrawl-bridge-token" content="stale"></head></html>',
      "fresh"
    );
    expect(html.match(/firecrawl-bridge-token/g)).toHaveLength(1);
    expect(html).toContain('content="fresh"');
  });

  it("plugin Vite chỉ chạy ở dev server, không chèn token vào bản build", () => {
    expect(cliBridgePlugin().apply).toBe("serve");
  });
});
