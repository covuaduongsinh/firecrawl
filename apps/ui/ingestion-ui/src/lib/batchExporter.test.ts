import { describe, expect, it } from "vitest";
import {
  formatObsidianNote,
  isValidTranslatedMarkdown,
  readArticleFromDirectory,
  safeFileSlug,
  syncWithOutputDirectory,
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
    async getDirectoryHandle(name: string, options?: { create?: boolean }) {
      const targetPrefix = `${prefix}${name}/`;
      const exists = Array.from(files.keys()).some((k) => k.startsWith(targetPrefix));
      if (!exists && !options?.create) {
        const err = new Error("Directory not found");
        err.name = "NotFoundError";
        throw err;
      }
      return memoryDir(files, targetPrefix);
    },
    async getFileHandle(name: string, options?: { create?: boolean }) {
      const key = `${prefix}${name}`;
      const exists = files.has(key);
      if (!exists && !options?.create) {
        const err = new Error("File not found");
        err.name = "NotFoundError";
        throw err;
      }
      return {
        async getFile() {
          const content = files.get(key);
          if (content === undefined) {
            const err = new Error("File not found");
            err.name = "NotFoundError";
            throw err;
          }
          return {
            async text() {
              return content;
            },
            size: content.length,
          };
        },
        async createWritable() {
          let data = "";
          return {
            async write(chunk: string) {
              data += chunk;
            },
            async close() {
              files.set(key, data);
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

describe("isValidTranslatedMarkdown", () => {
  it("trả về true nếu nội dung dài hơn 200 ký tự và không chứa chuỗi lỗi auth", () => {
    const valid = "# Tiêu đề\n\nNội dung bài viết này được dịch rất chi tiết và đầy đủ để kiểm tra thuật toán phân loại bản dịch hợp lệ hay không. Chức năng này hỗ trợ nhiều đoạn văn bản phong phú.".repeat(2);
    expect(isValidTranslatedMarkdown(valid)).toBe(true);
  });

  it("trả về false nếu nội dung quá ngắn hoặc rỗng", () => {
    expect(isValidTranslatedMarkdown("")).toBe(false);
    expect(isValidTranslatedMarkdown("quá ngắn")).toBe(false);
    expect(isValidTranslatedMarkdown(null)).toBe(false);
  });

  it("trả về false nếu nội dung chứa chuỗi báo lỗi đăng nhập CLI", () => {
    const errorOutput = "# Tiêu đề\n\nNot logged in · Please run /login để đăng nhập tài khoản của bạn.".repeat(5);
    expect(isValidTranslatedMarkdown(errorOutput)).toBe(false);
    expect(isValidTranslatedMarkdown("Failed to authenticate session with server".repeat(5))).toBe(false);
  });
});

describe("syncWithOutputDirectory", () => {
  it("nhận diện file hợp lệ trên đĩa và cập nhật status done, bỏ qua file lỗi 1KB", async () => {
    const files = new Map<string, string>();
    const validContent = "# Hướng dẫn Pages & Routes\n\nNội dung chi tiết về cách định tuyến các trang trong hệ thống... ".repeat(10);
    const corruptedContent = "# Tiêu đề\n\nNot logged in · Please run /login";

    // File s2 hợp lệ trên đĩa (category 1 -> folder 01-student)
    files.set("01-student/02-s2.md", validContent);
    // File s1 bị lỗi 1KB trên đĩa
    files.set("01-student/01-s1.md", corruptedContent);

    const testCategories: DocCategory[] = [
      {
        name: "Student",
        slug: "student",
        expanded: true,
        selected: true,
        items: [
          item("s1", { status: "done", markdownOutput: corruptedContent }),
          item("s2", { status: "idle", markdownOutput: undefined }),
          item("s3", { status: "idle", markdownOutput: undefined }),
        ],
      },
    ];

    const result = await syncWithOutputDirectory(memoryDir(files), testCategories);

    expect(result.matchedCount).toBe(1); // s2 matched
    expect(result.invalidCount).toBe(1); // s1 invalid

    const studentItems = result.categories[0].items;
    // s2 được đánh dấu done và nạp content
    expect(studentItems[1].status).toBe("done");
    expect(studentItems[1].markdownOutput).toBe(validContent);

    // s1 phát hiện bị lỗi nên được chuyển về idle để dịch lại
    expect(studentItems[0].status).toBe("idle");
    expect(studentItems[0].markdownOutput).toBeUndefined();

    // s3 không có file trên đĩa vẫn giữ nguyên idle
    expect(studentItems[2].status).toBe("idle");
  });
});

