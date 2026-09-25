import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { bridgeFetch } from './bridgeClient';
import { DEFAULT_FIRECRAWL_BASE_URL, scrape } from './firecrawlClient';
// Phần giao diện không thuộc nội dung bài viết.
const NOISE_SELECTORS = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "form",
  "button",
  "nav",
  "footer",
  "aside",
  "[role=navigation]",
  ".sidebar",
  ".wiki-sidebar",
  ".toc",
  ".table-of-contents",
  ".breadcrumb",
  ".breadcrumbs",
  ".pagination",
  ".edit-link",
  ".feedback",
];

// Vùng nội dung chính, theo thứ tự ưu tiên (Frappe Wiki, trang docs phổ biến, HTML chuẩn).
const MAIN_CONTENT_SELECTORS = [
  "#wiki-content",
  ".wiki-content",
  "article",
  "main",
  "[role=main]",
  ".markdown-body",
  ".markdown",
  ".prose",
  "#content",
  ".content",
];
const MIN_MAIN_CONTENT_CHARS = 200;

let turndownService: TurndownService | null = null;

function getTurndown(): TurndownService {
  if (!turndownService) {
    turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      emDelimiter: "*",
    });
    turndownService.use(gfm);
  }
  return turndownService;
}

function pickMainContent(doc: Document): Element {
  for (const selector of MAIN_CONTENT_SELECTORS) {
    const el = doc.querySelector(selector);
    if (el && (el.textContent || "").trim().length >= MIN_MAIN_CONTENT_CHARS) return el;
  }
  return doc.body;
}

function absolutize(root: Element, attr: string, baseUrl: string) {
  root.querySelectorAll(`[${attr}]`).forEach((el) => {
    const value = el.getAttribute(attr);
    if (!value || value.startsWith("#") || /^(data|mailto|tel|javascript):/i.test(value)) return;
    try {
      el.setAttribute(attr, new URL(value, baseUrl).toString());
    } catch {
      // Leave malformed URLs untouched.
    }
  });
}

/**
 * Convert HTML to clean Markdown (headings, lists, tables, code blocks, images, links),
 * keeping only the main article area and resolving relative URLs against `baseUrl`.
 */
export function convertHtmlToMarkdown(html: string, baseUrl: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll(NOISE_SELECTORS.join(",")).forEach((el) => el.remove());
  // Site headers are noise, but an <article>'s own <header> usually holds the page title.
  doc.querySelectorAll("header").forEach((el) => {
    if (!el.closest("article, main")) el.remove();
  });

  const main = pickMainContent(doc);
  main.querySelectorAll("img[data-src]:not([src])").forEach((img) => {
    img.setAttribute("src", img.getAttribute("data-src") || "");
  });
  absolutize(main, "href", baseUrl);
  absolutize(main, "src", baseUrl);

  return getTurndown()
    .turndown(main.innerHTML)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Universal page markdown fetcher with multi-tier fallback:
 * 1. Node.js Proxy fetch (/api/proxy/fetch-html) + HTML-to-Markdown
 * 2. Firecrawl Scrape API (/v2/scrape)
 * 3. Browser direct fetch
 */
export async function scrapePageMarkdown(
  url: string,
  firecrawlApiUrl: string = DEFAULT_FIRECRAWL_BASE_URL,
  apiKey: string = '',
  signal?: AbortSignal
): Promise<string> {
  // Strategy 1: Vite Proxy Fetch (Fastest, zero-config, bypasses CORS & offline Docker issues)
  try {
    const proxyRes = await bridgeFetch(`/api/proxy/fetch-html?url=${encodeURIComponent(url)}`, { signal });
    if (proxyRes.ok) {
      const proxyJson = await proxyRes.json();
      if (proxyJson.success && proxyJson.html) {
        const md = convertHtmlToMarkdown(proxyJson.html, proxyJson.finalUrl || url);
        if (md && md.length > 50) {
          return md;
        }
      }
    }
  } catch (e) {
    if (signal?.aborted) throw e;
    console.warn('Proxy fetch failed for page, trying Firecrawl API...', e);
  }

  // Strategy 2: Firecrawl Scrape API (v2)
  try {
    const data = await scrape({ baseUrl: firecrawlApiUrl, apiKey }, url, {
      formats: ['markdown'],
      onlyMainContent: true,
      signal,
    });
    const rawMarkdown = data.markdown || '';
    if (rawMarkdown.length > 50) {
      return rawMarkdown;
    }
  } catch (e) {
    if (signal?.aborted) throw e;
    console.warn('Firecrawl API scrape failed, trying direct browser fetch...', e);
  }

  // Strategy 3: Direct browser fetch fallback
  try {
    const directRes = await fetch(url, { signal });
    if (directRes.ok) {
      const html = await directRes.text();
      const md = convertHtmlToMarkdown(html, url);
      if (md) return md;
    }
  } catch (e) {
    if (signal?.aborted) throw e;
    console.warn('Direct browser fetch also failed:', e);
  }

  throw new Error(`Không thể cào nội dung trang web từ URL: ${url}`);
}
