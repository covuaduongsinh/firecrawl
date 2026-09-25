/** Error carrying the HTTP status of a failed API call, so callers can decide whether to retry. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

/** Rate limits, server errors, timeouts and network failures are worth retrying; 4xx input errors are not. */
export function isRetryableError(err: unknown): boolean {
  if (isAbortError(err)) return false;
  if (err instanceof HttpError) return err.status === 408 || err.status === 429 || err.status >= 500;
  return err instanceof TypeError; // fetch() network failure
}

export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  signal?: AbortSignal;
  onRetry?: (attempt: number, delayMs: number, err: unknown) => void;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Runs `fn`, retrying retryable failures with exponential backoff (base, 2×base, 4×base…). */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= options.retries || !isRetryableError(err)) throw err;
      const delayMs = options.baseDelayMs * 2 ** attempt;
      options.onRetry?.(attempt + 1, delayMs, err);
      await sleep(delayMs, options.signal);
    }
  }
}
