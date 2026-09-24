/**
 * Convert HTML to clean Markdown format preserving headings, images, lists, and code blocks
 */
export function convertHtmlToMarkdown(html: string, baseUrl: string): string {
  let clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
    .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
    .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
    .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '');

  // Extract main article content if exists
  const mainMatch =
    clean.match(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
    clean.match(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
    clean.match(/<div[^>]*id="wiki-content"[^>]*>([\s\S]*?)<\/div>/i) ||
    clean.match(/<div[^>]*class="[^"]*(?:wiki-content|markdown|content|prose)[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  if (mainMatch) {
    clean = mainMatch[1];
  }

  const baseOrigin = new URL(baseUrl).origin;

  // Headings
  clean = clean.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n');
  clean = clean.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n');
  clean = clean.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
  clean = clean.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n#### $1\n');

  // Code blocks
  clean = clean.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '\n```\n$1\n```\n');
  clean = clean.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`');

  // Images with absolute URL resolution
  clean = clean.replace(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi, (_, src, alt) => {
    const fullSrc = src.startsWith('/') ? `${baseOrigin}${src}` : src;
    return `![${alt}](${fullSrc})`;
  });
  clean = clean.replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, (_, src) => {
    const fullSrc = src.startsWith('/') ? `${baseOrigin}${src}` : src;
    return `![](${fullSrc})`;
  });

  // Links
  clean = clean.replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const fullHref = href.startsWith('/') ? `${baseOrigin}${href}` : href;
    return `[${text}](${fullHref})`;
  });

  // Bold & Italic
  clean = clean.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, '**$1**');
  clean = clean.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*');

  // Lists & Paragraphs
  clean = clean.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '- $1\n');
  clean = clean.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n');

  // Strip remaining HTML tags
  clean = clean.replace(/<[^>]+>/g, '');

  // Entities
  clean = clean
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Whitespace clean
  clean = clean.replace(/\n\s*\n\s*\n/g, '\n\n').trim();
  return clean;
}

/**
 * Universal page markdown fetcher with multi-tier fallback:
 * 1. Node.js Proxy fetch (/api/proxy/fetch-html) + HTML-to-Markdown
 * 2. Firecrawl Scrape API (/v1/scrape)
 * 3. Browser direct fetch
 */
export async function scrapePageMarkdown(
  url: string,
  firecrawlApiUrl: string = 'http://localhost:3002',
  apiKey: string = ''
): Promise<string> {
  // Strategy 1: Vite Proxy Fetch (Fastest, zero-config, bypasses CORS & offline Docker issues)
  try {
    const proxyRes = await fetch(`/api/proxy/fetch-html?url=${encodeURIComponent(url)}`);
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
    console.warn('Proxy fetch failed for page, trying Firecrawl API...', e);
  }

  // Strategy 2: Firecrawl Scrape API
  try {
    const scrapeRes = await fetch(`${firecrawlApiUrl}/v1/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        url,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    });

    if (scrapeRes.ok) {
      const scrapeJson = await scrapeRes.json();
      const rawMarkdown = scrapeJson?.data?.markdown || '';
      if (rawMarkdown && rawMarkdown.length > 50) {
        return rawMarkdown;
      }
    }
  } catch (e) {
    console.warn('Firecrawl API scrape failed, trying direct browser fetch...', e);
  }

  // Strategy 3: Direct browser fetch fallback
  try {
    const directRes = await fetch(url);
    if (directRes.ok) {
      const html = await directRes.text();
      const md = convertHtmlToMarkdown(html, url);
      if (md) return md;
    }
  } catch (e) {
    console.warn('Direct browser fetch also failed:', e);
  }

  throw new Error(`Không thể cào nội dung trang web từ URL: ${url}`);
}
