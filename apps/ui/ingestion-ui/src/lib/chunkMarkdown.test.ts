import { describe, expect, it } from "vitest";
import { chunkMarkdown } from "./chunkMarkdown";

describe("chunkMarkdown", () => {
  it("giữ nguyên tài liệu ngắn trong một phần", () => {
    expect(chunkMarkdown("# A\n\nngắn", 100)).toEqual(["# A\n\nngắn"]);
  });

  it("cắt tại heading và không phần nào vượt giới hạn", () => {
    const section = (n: number) => `## Mục ${n}\n\n${"x".repeat(60)}`;
    const md = [1, 2, 3, 4].map(section).join("\n\n");
    const chunks = chunkMarkdown(md, 150);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(150));
    chunks.forEach((c) => expect(c.startsWith("## Mục")).toBe(true));
    expect(chunks.join("\n\n")).toBe(md);
  });

  it("không cắt giữa khối code", () => {
    const code = "```\n# không phải heading\n\nvẫn trong code\n```";
    const md = `## A\n\n${"a".repeat(50)}\n\n${code}\n\n## B\n\n${"b".repeat(50)}`;
    const chunks = chunkMarkdown(md, 120);
    expect(chunks.some((c) => c.includes(code))).toBe(true);
  });

  it("chia mục quá dài theo đoạn văn và không mất nội dung", () => {
    const paragraphs = Array.from({ length: 10 }, (_, i) => `Đoạn ${i} ${"y".repeat(40)}`);
    const md = `## Dài\n\n${paragraphs.join("\n\n")}`;
    const chunks = chunkMarkdown(md, 120);
    chunks.forEach((c) => expect(c.length).toBeLessThanOrEqual(120));
    paragraphs.forEach((p) => expect(chunks.join("\n\n")).toContain(p));
  });
});
