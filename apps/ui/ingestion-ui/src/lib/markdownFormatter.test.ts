import { describe, expect, it } from "vitest";
import { formatExtractToMarkdown, isBoilerplateText } from "./markdownFormatter";

describe("isBoilerplateText", () => {
  it("lọc dòng giao diện web đứng riêng", () => {
    expect(isBoilerplateText("Was this helpful?")).toBe(true);
    expect(isBoilerplateText("Submit")).toBe(true);
    expect(isBoilerplateText("Last updated on 2 Jan 2024")).toBe(true);
  });

  it("không lọc đoạn văn chỉ chứa từ khóa", () => {
    expect(isBoilerplateText("Submit Assignment")).toBe(false);
    expect(isBoilerplateText("Students can submit their homework online.")).toBe(false);
  });

  it("không coi chuỗi rỗng hay giá trị không phải chuỗi là boilerplate", () => {
    expect(isBoilerplateText("")).toBe(false);
    expect(isBoilerplateText(undefined)).toBe(false);
    expect(isBoilerplateText({})).toBe(false);
  });
});

describe("formatExtractToMarkdown", () => {
  it("giữ mục danh sách chỉ có tiêu đề, không có mô tả", () => {
    const md = formatExtractToMarkdown(
      { sections: [{ heading: "Tính năng", items: [{ title: "Quản lý học viên" }] }] },
      { title: "Demo" }
    );
    expect(md).toContain("- **Quản lý học viên**");
  });

  it("giữ câu song ngữ thiếu bản gốc", () => {
    const md = formatExtractToMarkdown(
      { content_bilingual: [{ original: "", vietnamese: "Chỉ có bản dịch" }] },
      { title: "Demo" }
    );
    expect(md).toContain("Chỉ có bản dịch");
  });

  it("không xóa đoạn nội dung có chữ Submit", () => {
    const md = formatExtractToMarkdown(
      {
        content_bilingual: [
          { original: "Submit Assignment", vietnamese: "Nộp bài tập (Submit Assignment)" },
          { original: "Was this helpful?", vietnamese: "Nội dung này có hữu ích không?" },
        ],
      },
      { title: "Demo" }
    );
    expect(md).toContain("Nộp bài tập (Submit Assignment)");
    expect(md).not.toContain("hữu ích");
  });

  it("không lặp tiêu đề H1 khi nội dung markdown đã có sẵn", () => {
    const md = formatExtractToMarkdown(
      { type: "document", markdown: "# Giới thiệu\n\nNội dung" },
      { title: "Giới thiệu" }
    );
    expect(md.match(/^# Giới thiệu$/gm)).toHaveLength(1);
  });
});
