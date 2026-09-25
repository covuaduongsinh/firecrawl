import { describe, expect, it } from "vitest";
import { runQueue } from "./batchQueue";

const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));

describe("runQueue", () => {
  it("không chạy quá số luồng cho phép và xử lý đủ mọi mục", async () => {
    let active = 0;
    let peak = 0;
    const done: number[] = [];
    const count = await runQueue(
      [1, 2, 3, 4, 5],
      async (n) => {
        active++;
        peak = Math.max(peak, active);
        await tick();
        done.push(n);
        active--;
      },
      { concurrency: 2, signal: new AbortController().signal }
    );
    expect(count).toBe(5);
    expect(peak).toBe(2);
    expect(done.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("dừng nhận mục mới sau khi hủy", async () => {
    const controller = new AbortController();
    const started: number[] = [];
    await runQueue(
      [1, 2, 3, 4],
      async (n) => {
        started.push(n);
        if (n === 2) controller.abort();
        await tick();
      },
      { concurrency: 1, signal: controller.signal }
    );
    expect(started).toEqual([1, 2]);
  });

  it("một mục lỗi không làm dừng hàng đợi khi worker tự bắt lỗi", async () => {
    const results: string[] = [];
    await runQueue(
      ["a", "b"],
      async (x) => {
        try {
          if (x === "a") throw new Error("fail");
          results.push(x);
        } catch {
          results.push(`${x}:error`);
        }
      },
      { concurrency: 1, signal: new AbortController().signal }
    );
    expect(results).toEqual(["a:error", "b"]);
  });
});
