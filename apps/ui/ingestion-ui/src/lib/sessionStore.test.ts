import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { DocCategory } from "./docTreeScanner";
import { clearAllSessions, countDoneItems, loadSession, saveSession } from "./sessionStore";

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, String(value)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  get length() {
    return storageMap.size;
  },
  key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true, configurable: true });

const ROOT = "https://docs.frappe.io/education";

function category(markdownSize: number): DocCategory {
  return {
    name: "Student",
    slug: "student",
    expanded: true,
    selected: true,
    items: Array.from({ length: 3 }, (_, i) => ({
      id: `i${i}`,
      url: `${ROOT}/student/${i}`,
      title: `Bài ${i}`,
      category: "Student",
      categorySlug: "student",
      slug: `bai-${i}`,
      depth: 1,
      selected: true,
      status: "done" as const,
      markdownOutput: "x".repeat(markdownSize),
    })),
  };
}

beforeEach(async () => {
  localStorage.clear();
  await clearAllSessions();
});

describe("sessionStore", () => {
  it("lưu và khôi phục phiên lớn hơn giới hạn localStorage", async () => {
    await saveSession(ROOT, [category(3_000_000)]); // ~9 MB of translated text
    const session = await loadSession(ROOT);
    expect(session?.categories[0].items).toHaveLength(3);
    expect(countDoneItems(session!.categories)).toBe(3);
  });

  it("chuyển phiên cũ từ localStorage sang IndexedDB", async () => {
    const legacyKey = `firecrawl_batch_cache_${ROOT.replace(/[^a-zA-Z0-9]/g, "_")}`;
    localStorage.setItem(
      legacyKey,
      JSON.stringify({ categories: [category(10)], timestamp: "2026-09-24T10:00:00.000Z", url: ROOT })
    );
    const session = await loadSession(ROOT);
    expect(session?.timestamp).toBe("2026-09-24T10:00:00.000Z");
    expect(localStorage.getItem(legacyKey)).toBeNull();
    expect(await loadSession(ROOT)).not.toBeNull();
  });

  it("xóa phiên nhưng giữ cấu hình AI", async () => {
    localStorage.setItem("firecrawl_ai_engine_config", "{}");
    await saveSession(ROOT, [category(10)]);
    await clearAllSessions();
    expect(await loadSession(ROOT)).toBeNull();
    expect(localStorage.getItem("firecrawl_ai_engine_config")).toBe("{}");
  });
});
