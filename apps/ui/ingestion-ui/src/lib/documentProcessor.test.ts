import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_AI_CONFIG } from "./aiEngines";
import { processDocument } from "./documentProcessor";

afterEach(() => vi.unstubAllGlobals());

/** Fake OpenAI-compatible endpoint that "translates" by upper-casing the part it receives. */
function stubOpenAI() {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const content: string = body.messages[1].content;
      calls.push(content);
      const doc = content.slice(content.indexOf("---", content.indexOf("TÀI LIỆU")));
      const heading = doc.match(/## (Mục \d+)/)?.[1] ?? "";
      return new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ markdown: `### Dịch ${heading}` }) } }] }),
        { status: 200 }
      );
    })
  );
  return calls;
}

const config = { ...DEFAULT_AI_CONFIG, engine: "openai" as const, openaiApiKey: "k" };

describe("processDocument", () => {
  it("chia trang dài thành nhiều phần và ghép lại đúng thứ tự, không cắt bỏ phần nào", async () => {
    const calls = stubOpenAI();
    const md = [1, 2, 3].map((n) => `## Mục ${n}\n\n${"nội dung ".repeat(20)}`).join("\n\n");
    const result = await processDocument(md, {
      title: "Trang dài",
      url: "https://docs.example.com/a",
      prompt: "Dịch",
      config,
      maxChunkChars: 200,
    });
    expect(result.chunkCount).toBe(3);
    expect(calls).toHaveLength(3);
    expect(calls[2]).toContain("phần 3/3");
    const order = ["Dịch Mục 1", "Dịch Mục 2", "Dịch Mục 3"].map((t) => result.markdownOutput.indexOf(t));
    expect(order.every((pos, i) => pos > -1 && (i === 0 || pos > order[i - 1]))).toBe(true);
    expect(result.markdownOutput.match(/^# Trang dài$/gm)).toHaveLength(1);
  });

  it("gọi AI một lần cho trang ngắn", async () => {
    const calls = stubOpenAI();
    const result = await processDocument("## Mục 1\n\nngắn", {
      title: "Ngắn",
      url: "https://docs.example.com/b",
      prompt: "Dịch",
      config,
    });
    expect(calls).toHaveLength(1);
    expect(result.chunkCount).toBe(1);
  });
});
