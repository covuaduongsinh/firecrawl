import { HttpError } from './retry';

/**
 * Firecrawl API v2 client for the UI.
 * The base URL defaults to `/firecrawl`, which the dev server (vite.config.ts) and the production
 * server (bridge/server.ts) both proxy to the API — the latter adding the API key server-side.
 */
export interface FirecrawlClientOptions {
  baseUrl?: string;
  /** Only needed when calling an API directly (not through the /firecrawl proxy). */
  apiKey?: string;
}

export interface ScrapeData {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  metadata?: {
    title?: string;
    description?: string;
    language?: string;
    sourceURL?: string;
    statusCode?: number;
    [key: string]: unknown;
  };
  warning?: string;
}

export type ExtractStatus = 'processing' | 'completed' | 'failed' | 'cancelled';

export const DEFAULT_FIRECRAWL_BASE_URL = '/firecrawl';

export function resolveFirecrawlOptions(): Required<FirecrawlClientOptions> {
  return {
    baseUrl: (import.meta.env.VITE_FIRECRAWL_API_URL || DEFAULT_FIRECRAWL_BASE_URL).replace(/\/+$/, ''),
    apiKey: import.meta.env.VITE_FIRECRAWL_API_KEY || '',
  };
}

async function request<T>(
  options: FirecrawlClientOptions,
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal } = {}
): Promise<T> {
  const baseUrl = (options.baseUrl ?? DEFAULT_FIRECRAWL_BASE_URL).replace(/\/+$/, '');
  const res = await fetch(`${baseUrl}${path}`, {
    method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
    signal: init.signal,
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.apiKey ? { Authorization: `Bearer ${options.apiKey}` } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // Non-JSON error page (e.g. proxy error); reported below.
  }
  if (!res.ok || json.success === false) {
    const message = typeof json.error === 'string' ? json.error : text.slice(0, 200) || res.statusText;
    throw new HttpError(res.ok ? 500 : res.status, `Firecrawl ${path} (${res.status}): ${message}`);
  }
  return json as T;
}

export async function scrape(
  options: FirecrawlClientOptions,
  url: string,
  params: { formats?: string[]; onlyMainContent?: boolean; signal?: AbortSignal } = {}
): Promise<ScrapeData> {
  const json = await request<{ data?: ScrapeData }>(options, '/v2/scrape', {
    body: {
      url,
      formats: params.formats ?? ['markdown'],
      ...(params.onlyMainContent !== undefined ? { onlyMainContent: params.onlyMainContent } : {}),
    },
    signal: params.signal,
  });
  return json.data ?? {};
}

/** Lists a site's URLs; v2 returns link objects, normalised here to plain URLs. */
export async function map(
  options: FirecrawlClientOptions,
  url: string,
  params: { search?: string; limit?: number; signal?: AbortSignal } = {}
): Promise<string[]> {
  const json = await request<{ links?: (string | { url?: string })[] }>(options, '/v2/map', {
    body: {
      url,
      ...(params.search ? { search: params.search } : {}),
      ...(params.limit ? { limit: params.limit } : {}),
    },
    signal: params.signal,
  });
  return (json.links ?? [])
    .map((link) => (typeof link === 'string' ? link : link.url))
    .filter((link): link is string => typeof link === 'string' && link.length > 0);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true }
    );
  });
}

/** Starts an extract job and polls it until it completes (v2 extract is asynchronous). */
export async function extract(
  options: FirecrawlClientOptions,
  params: {
    urls: string[];
    prompt?: string;
    schema?: unknown;
    signal?: AbortSignal;
    pollIntervalMs?: number;
    timeoutMs?: number;
  }
): Promise<unknown> {
  const started = await request<{ id?: string; data?: unknown }>(options, '/v2/extract', {
    body: {
      urls: params.urls,
      ...(params.prompt ? { prompt: params.prompt } : {}),
      ...(params.schema ? { schema: params.schema } : {}),
    },
    signal: params.signal,
  });
  if (!started.id) return started.data;

  // A failed job answers success:false, which request() turns into an error carrying its message.
  const deadline = Date.now() + (params.timeoutMs ?? 10 * 60_000);
  for (;;) {
    const status = await request<{ status?: ExtractStatus; data?: unknown; error?: string }>(
      options,
      `/v2/extract/${encodeURIComponent(started.id)}`,
      { signal: params.signal }
    );
    if (status.status === 'completed') return status.data;
    if (status.status === 'failed' || status.status === 'cancelled') {
      throw new Error(`Trích xuất thất bại: ${status.error || status.status}`);
    }
    if (Date.now() > deadline) throw new Error('Trích xuất quá thời gian chờ.');
    await sleep(params.pollIntervalMs ?? 2000, params.signal);
  }
}
