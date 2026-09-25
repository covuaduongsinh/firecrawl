import { useCallback, useRef, useState } from 'react';
import { runQueue, waitWhilePaused } from '@/lib/batchQueue';

export interface BatchRunOptions<T> {
  concurrency: number;
  /** Processes one item; resolves true on success. Must stop promptly when `signal` aborts. */
  worker: (item: T, index: number, signal: AbortSignal) => Promise<boolean>;
  /** Runs once after the queue stops (finished or cancelled), before the run is marked idle. */
  onFinish?: (aborted: boolean) => Promise<void> | void;
}

/**
 * Run / pause / stop state for a batch. Only one run can be active: a stop aborts in-flight work and the
 * run stays active (isStopping) until every worker has returned, so a new run cannot overlap it.
 */
export function useBatchRunner() {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [progressText, setProgressText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const isPausedRef = useRef(false);

  const run = useCallback(async <T,>(items: T[], options: BatchRunOptions<T>) => {
    if (abortRef.current || items.length === 0) return;

    const controller = new AbortController();
    abortRef.current = controller;
    isPausedRef.current = false;
    setIsPaused(false);
    setIsStopping(false);
    setIsRunning(true);

    let succeeded = 0;
    try {
      await runQueue(
        items,
        async (item, index) => {
          if (await options.worker(item, index, controller.signal)) succeeded++;
        },
        {
          concurrency: options.concurrency,
          signal: controller.signal,
          beforeEach: () => waitWhilePaused(() => isPausedRef.current, controller.signal),
        }
      );
    } finally {
      abortRef.current = null;
      await options.onFinish?.(controller.signal.aborted);
      setIsRunning(false);
      setIsPaused(false);
      setIsStopping(false);
      setProgressText(
        controller.signal.aborted
          ? `Đã dừng tiến trình (${succeeded}/${items.length} bài thành công).`
          : `Hoàn thành đợt xử lý (${succeeded}/${items.length} bài thành công)!`
      );
    }
  }, []);

  const togglePause = useCallback(() => {
    if (!abortRef.current) return;
    const next = !isPausedRef.current;
    isPausedRef.current = next;
    setIsPaused(next);
    if (next) setProgressText('Đang tạm dừng — bài đang xử lý sẽ hoàn tất rồi dừng...');
  }, []);

  const cancel = useCallback(() => {
    if (!abortRef.current) return;
    abortRef.current.abort();
    isPausedRef.current = false;
    setIsPaused(false);
    setIsStopping(true);
    setProgressText('Đang dừng, hủy các yêu cầu đang chạy...');
  }, []);

  return { isRunning, isPaused, isStopping, progressText, setProgressText, run, togglePause, cancel };
}
