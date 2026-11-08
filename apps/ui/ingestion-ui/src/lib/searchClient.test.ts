import { describe, expect, it, vi } from "vitest";
import {
  buildResearchPrompt,
  runDeepResearch,
  SearchResultItem,
  searchWeb,
} from "./searchClient";

describe("searchClient", () => {
  describe("searchWeb", () => {
    it("returns empty array for empty or whitespace query", async () => {
      const res1 = await searchWeb("");
      const res2 = await searchWeb("   ");
      expect(res1).toEqual([]);
      expect(res2).toEqual([]);
    });

    it("sends correct payload to /v1/search and maps fields correctly", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: [
            {
              url: "https://example.com/nocobase",
              title: "NocoBase Guide",
              description: "A rapid development platform",
              markdown: "# NocoBase\n\nContent here...",
            },
          ],
        }),
      });
      global.fetch = mockFetch;

      const results = await searchWeb("nocobase", {
        baseUrl: "https://api.test",
        apiKey: "test-key",
        limit: 3,
        lang: "vi",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = mockFetch.mock.calls[0];
      expect(calledUrl).toBe("https://api.test/v1/search");
      expect(calledInit.headers["Authorization"]).toBe("Bearer test-key");

      const body = JSON.parse(calledInit.body);
      expect(body.query).toBe("nocobase");
      expect(body.limit).toBe(3);
      expect(body.lang).toBe("vi");
      expect(body.scrapeOptions.formats).toEqual(["markdown"]);

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe("NocoBase Guide");
      expect(results[0].url).toBe("https://example.com/nocobase");
      expect(results[0].markdown).toContain("NocoBase");
    });
  });

  describe("buildResearchPrompt", () => {
    it("embeds query, source metadata, and obsidian template", () => {
      const sources: SearchResultItem[] = [
        {
          url: "https://docs.nocobase.com",
          title: "NocoBase Docs",
          description: "Main documentation",
          markdown: "NocoBase is open source.",
        },
      ];

      const prompt = buildResearchPrompt("So sánh NocoBase", sources, "Tập trung vào plugin");

      expect(prompt).toContain("So sánh NocoBase");
      expect(prompt).toContain("NocoBase Docs");
      expect(prompt).toContain("https://docs.nocobase.com");
      expect(prompt).toContain("Tập trung vào plugin");
      expect(prompt).toContain("OBSIDIAN MARKDOWN");
      expect(prompt).toContain("Executive Summary");
      expect(prompt).toContain("Citations & Sources");
    });
  });

  describe("runDeepResearch", () => {
    it("throws error if no sources are provided", async () => {
      await expect(
        runDeepResearch("test query", [], {
          engine: "claude",
          geminiApiKey: "",
          claudeApiKey: "",
          claudeModel: "claude-sonnet-5",
          geminiModel: "gemini-2.5-flash",
          ollamaBaseUrl: "",
          ollamaModel: "",
          openaiApiKey: "",
          openaiBaseUrl: "",
          openaiModel: "",
        })
      ).rejects.toThrow("Không có dữ liệu nguồn");
    });
  });
});
