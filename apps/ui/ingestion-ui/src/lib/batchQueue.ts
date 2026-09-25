export interface QueueOptions {
  /** Number of items processed at the same time (≥ 1). */
  concurrency: number;
  /** Aborting stops picking up new items; in-flight workers receive the same signal. */
  signal: AbortSignal;
  /** Awaited before each item starts, e.g. to hold the queue while paused. */
  beforeEach?: () => Promise<void>;
}

/**
 * Runs `worker` over `items` with bounded concurrency, in order of start.
 * Resolves with the number of items whose worker finished (successfully or not) once all workers stop.
 */
export async function runQueue<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  options: QueueOptions
): Promise<number> {
  let next = 0;
  let finished = 0;
  const lanes = Math.max(1, Math.min(options.concurrency, items.length));

  const lane = async () => {
    for (;;) {
      if (options.signal.aborted) return;
      await options.beforeEach?.();
      if (options.signal.aborted || next >= items.length) return;
      const index = next++;
      try {
        await worker(items[index], index);
      } finally {
        finished++;
      }
    }
  };

  await Promise.all(Array.from({ length: lanes }, lane));
  return finished;
}

/** Resolves once `isPaused()` is false, polling every `intervalMs`; rejects nothing, returns early on abort. */
export async function waitWhilePaused(
  isPaused: () => boolean,
  signal: AbortSignal,
  intervalMs = 300
): Promise<void> {
  while (isPaused() && !signal.aborted) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
