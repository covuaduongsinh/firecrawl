// @vitest-environment node
import http from "http";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildCliInvocation, parseCliOutput } from "./cli";
import { createBridgeMiddleware } from "./middleware";
import { assertFetchableUrl, isPrivateAddress } from "./security";

const TOKEN = "test-token";

describe("isPrivateAddress", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.10", "169.254.169.254", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])(
    "chặn %s",
    (ip) => expect(isPrivateAddress(ip)).toBe(true)
  );
  it.each(["8.8.8.8", "104.18.2.3", "172.32.0.1", "2606:4700::1111"])("cho phép %s", (ip) =>
    expect(isPrivateAddress(ip)).toBe(false)
  );
});

describe("assertFetchableUrl", () => {
  it("từ chối giao thức khác http/https", async () => {
    await expect(assertFetchableUrl("file:///etc/passwd")).rejects.toThrow(/http\/https/);
  });
  it("từ chối địa chỉ nội bộ", async () => {
    await expect(assertFetchableUrl("http://127.0.0.1:3002/v1/scrape")).rejects.toThrow(/nội bộ/);
    await expect(assertFetchableUrl("http://localhost:6379")).rejects.toThrow(/nội bộ/);
    await expect(assertFetchableUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(/nội bộ/);
  });
});

describe("buildCliInvocation", () => {
  it("chạy Claude CLI không tool, prompt qua stdin", () => {
    const inv = buildCliInvocation("claude", "/usr/bin/claude", "dịch trang này", "claude-sonnet-5");
    expect(inv.args).not.toContain("--dangerously-skip-permissions");
    expect(inv.args).toEqual(expect.arrayContaining(["--tools", "", "--permission-mode", "dontAsk"]));
    expect(inv.args.join(" ")).not.toContain("dịch trang này");
    expect(inv.stdin).toBe("dịch trang này");
  });
  it("không cho bỏ qua quyền với Antigravity và bỏ model không an toàn", () => {
    const inv = buildCliInvocation("antigravity", "/usr/bin/agy", "x", "gemini; rm -rf /");
    expect(inv.args).not.toContain("--dangerously-skip-permissions");
    expect(inv.args).not.toContain("--model");
  });
});

describe("parseCliOutput", () => {
  it("lấy result từ JSON của Claude CLI", () => {
    expect(parseCliOutput('{"type":"result","result":"xin chào"}')).toEqual({ ok: true, text: "xin chào" });
  });
  it("báo lỗi khi CLI trả status ERROR", () => {
    expect(parseCliOutput('{"status":"ERROR","error":"quota"}')).toEqual({ ok: false, error: "quota" });
  });
});

describe("bridge middleware", () => {
  let server: http.Server;
  let base: string;

  beforeAll(async () => {
    const middleware = createBridgeMiddleware({
      token: TOKEN,
      cliTimeoutMs: 300,
      // A CLI that never answers, to exercise the timeout path.
      resolveCli: () => ({
        executable: process.execPath,
        args: ["-e", "setTimeout(() => {}, 10000)"],
        shell: false,
      }),
    });
    server = http.createServer((req, res) =>
      middleware(req, res, () => {
        res.writeHead(404);
        res.end();
      })
    );
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const extract = (headers: Record<string, string>, body = '{"engine":"claude","prompt":"hi"}') =>
    fetch(`${base}/api/cli/extract`, { method: "POST", headers, body });

  it("chặn POST text/plain từ trang web khác (CSRF)", async () => {
    const res = await extract({ "Content-Type": "text/plain", Origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });

  it("chặn yêu cầu thiếu token", async () => {
    const res = await extract({ "Content-Type": "application/json" });
    expect(res.status).toBe(403);
  });

  it("chặn Host không phải localhost (DNS rebinding)", async () => {
    const res = await new Promise<number>((resolve) => {
      const url = new URL(base);
      http
        .request(
          { host: "127.0.0.1", port: url.port, path: "/api/cli/status", headers: { Host: "evil.example", "X-Bridge-Token": TOKEN } },
          (r) => resolve(r.statusCode || 0)
        )
        .end();
    });
    expect(res).toBe(403);
  });

  it("yêu cầu Content-Type JSON kể cả khi có token", async () => {
    const res = await extract({ "Content-Type": "text/plain", "X-Bridge-Token": TOKEN });
    expect(res.status).toBe(415);
  });

  it("chặn proxy tới địa chỉ nội bộ (SSRF)", async () => {
    const res = await fetch(`${base}/api/proxy/fetch-html?url=${encodeURIComponent("http://127.0.0.1:3002")}`, {
      headers: { "X-Bridge-Token": TOKEN },
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/nội bộ/);
  });

  it("trả 504 đúng một lần khi CLI quá thời gian và server vẫn chạy", async () => {
    const res = await extract({ "Content-Type": "application/json", "X-Bridge-Token": TOKEN, Origin: base });
    expect(res.status).toBe(504);
    const again = await fetch(`${base}/api/cli/status`, { headers: { "X-Bridge-Token": TOKEN } });
    expect(again.status).toBe(200);
  });
});
