import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useBatchRunner } from "./useBatchRunner";

/** Worker that stays busy until aborted or released. */
function controllableWorker() {
  const started: number[] = [];
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const worker = async (item: number, _index: number, signal: AbortSignal) => {
    started.push(item);
    await Promise.race([gate, new Promise((resolve) => signal.addEventListener("abort", resolve))]);
    return !signal.aborted;
  };
  return { started, worker, release: () => release() };
}

describe("useBatchRunner", () => {
  it("không cho chạy lượt thứ hai khi lượt đầu chưa xong", async () => {
    const { result } = renderHook(() => useBatchRunner());
    const first = controllableWorker();
    const second = controllableWorker();

    let firstRun!: Promise<void>;
    act(() => {
      firstRun = result.current.run([1, 2], { concurrency: 1, worker: first.worker });
    });
    await waitFor(() => expect(result.current.isRunning).toBe(true));
    await act(() => result.current.run([9], { concurrency: 1, worker: second.worker }));
    expect(second.started).toEqual([]);

    first.release();
    await act(() => firstRun);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.progressText).toMatch(/Hoàn thành đợt xử lý \(2\/2/);
  });

  it("Dừng hủy việc đang chạy, giữ trạng thái đang dừng tới khi xong", async () => {
    const { result } = renderHook(() => useBatchRunner());
    const w = controllableWorker();
    let run!: Promise<void>;
    act(() => {
      run = result.current.run([1, 2, 3], { concurrency: 1, worker: w.worker });
    });
    await waitFor(() => expect(w.started).toEqual([1]));
    act(() => result.current.cancel());
    expect(result.current.isStopping).toBe(true);
    await act(() => run);
    expect(w.started).toEqual([1]);
    expect(result.current.isRunning).toBe(false);
    expect(result.current.isStopping).toBe(false);
    expect(result.current.progressText).toMatch(/Đã dừng tiến trình \(0\/3/);
  });
});
