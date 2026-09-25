import { afterEach, describe, expect, it, vi } from "vitest";
import { extract, map, scrape } from "./firecrawlClient";

afterEach(() => vi.unstubAllGlobals());

function stubResponses(responses: unknown[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const next = responses.shift() as { status?: number; body: unknown };
      return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
    })
  );
  return calls;
}

const opts = { baseUrl: "/firecrawl" };

describe("firecrawlClient v2", () => {
  it("scrape gọi /v2/scrape và trả data", async () => {
    const calls = stubResponses([{ body: { success: true, data: { markdown: "# Hi" } } }]);
    expect(await scrape(opts, "https://a.com", { onlyMainContent: true })).toEqual({ markdown: "# Hi" });
    expect(calls[0].url).toBe("/firecrawl/v2/scrape");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      url: "https://a.com",
      formats: ["markdown"],
      onlyMainContent: true,
    });
    expect(new Headers(calls[0].init.headers).has("Authorization")).toBe(false);
  });

  it("map chuẩn hóa link object của v2 thành URL", async () => {
    stubResponses([
      { body: { success: true, links: [{ url: "https://a.com/x", title: "X" }, "https://a.com/y", { title: "no url" }] } },
    ]);
    expect(await map(opts, "https://a.com", { limit: 10 })).toEqual(["https://a.com/x", "https://a.com/y"]);
  });

  it("extract poll tới khi completed", async () => {
    const calls = stubResponses([
      { body: { success: true, id: "job-1" } },
      { body: { success: true, status: "processing", data: [] } },
      { body: { success: true, status: "completed", data: { title: "Xong" } } },
    ]);
    const data = await extract(opts, { urls: ["https://a.com"], prompt: "p", pollIntervalMs: 1 });
    expect(data).toEqual({ title: "Xong" });
    expect(calls.map((c) => c.url)).toEqual([
      "/firecrawl/v2/extract",
      "/firecrawl/v2/extract/job-1",
      "/firecrawl/v2/extract/job-1",
    ]);
  });

  it("extract báo lỗi khi job thất bại", async () => {
    stubResponses([
      { body: { success: true, id: "job-2" } },
      { body: { success: false, status: "failed", error: "No content" } },
    ]);
    await expect(extract(opts, { urls: ["https://a.com"], pollIntervalMs: 1 })).rejects.toThrow("No content");
  });

  it("báo lỗi HTTP kèm mã trạng thái", async () => {
    stubResponses([{ status: 429, body: { success: false, error: "Rate limit" } }]);
    await expect(scrape(opts, "https://a.com")).rejects.toMatchObject({ status: 429, message: expect.stringContaining("Rate limit") });
  });
});
