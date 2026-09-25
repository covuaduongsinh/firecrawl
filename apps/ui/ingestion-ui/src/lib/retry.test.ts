import { describe, expect, it, vi } from "vitest";
import { HttpError, isRetryableError, withRetry } from "./retry";

describe("isRetryableError", () => {
  it("retry khi bị giới hạn tốc độ hoặc lỗi máy chủ, không retry lỗi đầu vào", () => {
    expect(isRetryableError(new HttpError(429, "rate limit"))).toBe(true);
    expect(isRetryableError(new HttpError(503, "overloaded"))).toBe(true);
    expect(isRetryableError(new HttpError(401, "bad key"))).toBe(false);
    expect(isRetryableError(new DOMException("Aborted", "AbortError"))).toBe(false);
  });
});

describe("withRetry", () => {
  it("thử lại rồi thành công", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(429, "slow down"))
      .mockResolvedValueOnce("ok");
    const onRetry = vi.fn();
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1, onRetry })).resolves.toBe("ok");
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("không thử lại lỗi 401", async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(401, "bad key"));
    await expect(withRetry(fn, { retries: 3, baseDelayMs: 1 })).rejects.toThrow("bad key");
    expect(fn).toHaveBeenCalledOnce();
  });

  it("dừng chờ ngay khi bị hủy", async () => {
    const controller = new AbortController();
    const fn = vi.fn().mockRejectedValue(new HttpError(503, "down"));
    const promise = withRetry(fn, { retries: 3, baseDelayMs: 10_000, signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toThrow(/Abort/);
  });
});
