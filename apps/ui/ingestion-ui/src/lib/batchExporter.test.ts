import { describe, expect, it } from "vitest";
import {
  formatObsidianNote,
  safeFileSlug,
  writeArticleToDirectory,
  writeIndexToDirectory,
} from "./batchExporter";
import type { DocCategory, DocItem } from "./docTreeScanner";

function item(id: string, extra: Partial<DocItem> = {}): DocItem {
  return {
    id,
    url: `https://docs.frappe.io/education/${id}`,
    title: `Bài ${id}`,
    category: "Student",
    categorySlug: "student",
    slug: id,
    depth: 1,
    selected: true,
    status: "done",
    markdownOutput: `# Bài ${id}\n\n> 📅 **Thời gian:** hôm nay\n\n---\n\nNội dung ${id}`,
    ...extra,
  };
}

/** Minimal in-memory FileSystemDirectoryHandle. */
function memoryDir(files: Map<string, string>, prefix = ""): FileSystemDirectoryHandle {
  return {
    async getDirectoryHandle(name: string) {
      return memoryDir(files, `${prefix}${name}/`);
    },
    async getFileHandle(name: string) {
      return {
        async createWritable() {
          let data = "";
          return {
            async write(chunk: string) {
              data += chunk;
            },
            async close() {
              files.set(`${prefix}${name}`, data);
            },
          };
        },
      };
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe("safeFileSlug", () => {
  it("bỏ dấu tiếng Việt và ký tự cấm trên Windows", () => {
    expect(safeFileSlug('Quản lý: "Học viên" <mới>?')).toBe("quan-ly-hoc-vien-moi");
    expect(safeFileSlug("???")).toBe("bai-viet");
  });
});

describe("formatObsidianNote", () => {
  it("tạo frontmatter YAML hợp lệ và chỉ một tiêu đề H1", () => {
    const note = formatObsidianNote(item("a", { title: 'Tiêu đề: "đặc biệt"' }), "Học viên", new Date("2026-09-25T00:00:00Z"));
    expect(note.startsWith("---\ntitle: \"Tiêu đề: \\\"đặc biệt\\\"\"\n")).toBe(true);
    expect(note).toContain("created: 2026-09-25");
    expect(note).toContain("  - hoc-vien");
    expect(note.match(/^# /gm)).toHaveLength(1);
    expect(note).toContain("Nội dung a");
    expect(note).not.toContain("📅");
  });
});

describe("ghi thư mục", () => {
  const categories: DocCategory[] = [
    { name: "Intro", slug: "intro", expanded: true, selected: true, items: [item("x")] },
    {
      name: "Student",
      slug: "student",
      expanded: true,
      selected: true,
      items: [item("s1", { status: "idle", markdownOutput: undefined }), item("s2")],
    },
  ];

  it("đánh số theo thứ tự cây mục lục để chạy lại sẽ ghi đè đúng file", async () => {
    const files = new Map<string, string>();
    const path = await writeArticleToDirectory(memoryDir(files), categories, "s2", "obsidian");
    expect(path).toBe("02-student/02-s2.md");
    expect(files.get("02-student/02-s2.md")).toContain("source: \"https://docs.frappe.io/education/s2\"");
  });

  it("bỏ qua bài chưa dịch và ghi mục lục trỏ đúng đường dẫn", async () => {
    const files = new Map<string, string>();
    expect(await writeArticleToDirectory(memoryDir(files), categories, "s1", "standard")).toBeNull();
    await writeIndexToDirectory(memoryDir(files), categories, "Frappe Education");
    const readme = files.get("README.md")!;
    expect(readme).toContain("[Bài x](./01-intro/01-x.md)");
    expect(readme).toContain("[Bài s2](./02-student/02-s2.md)");
    expect(readme).not.toContain("s1");
  });
});
