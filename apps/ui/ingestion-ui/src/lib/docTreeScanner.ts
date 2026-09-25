import { bridgeFetch } from './bridgeClient';
import { DEFAULT_FIRECRAWL_BASE_URL, map, scrape } from './firecrawlClient';

export interface DocItem {
  id: string;
  url: string;
  title: string;
  category: string;
  categorySlug: string;
  slug: string;
  depth: number;
  selected: boolean;
  status: 'idle' | 'scraping' | 'translating' | 'done' | 'error';
  extractedData?: unknown;
  markdownOutput?: string;
  error?: string;
}

export interface DocCategory {
  name: string;
  slug: string;
  items: DocItem[];
  expanded: boolean;
  selected: boolean;
}

/**
 * Format slug into human-readable Title
 * e.g. "student-management" -> "Student Management"
 */
export function slugToTitle(slug: string): string {
  if (!slug) return 'General';
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Clean URL and remove trailing slashes / hash fragments
 */
export function normalizeDocUrl(rawUrl: string): string {
  try {
    const urlObj = new URL(rawUrl);
    urlObj.hash = '';
    urlObj.search = '';
    const path = urlObj.pathname.replace(/\/+$/, '');
    return `${urlObj.origin}${path}`;
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Parses raw HTML string looking for common documentation sidebar structures
 */
export function parseDomSidebar(html: string, pageUrl: string): DocCategory[] {
  const categories: DocCategory[] = [];
  const rootObj = new URL(pageUrl);
  const seenUrls = new Set<string>();
  const seenGroups = new Map<string, DocItem[]>();

  // 1. Strategy: Frappe Docs / Frappe Wiki Tree (e.g., https://docs.frappe.io/education)
  if (html.includes('wiki-tree') || html.includes('wiki-item')) {
    const groupChunks = html.split(/<li class="wiki-item is-group">/i).slice(1);

    for (const chunk of groupChunks) {
      const titleMatch = chunk.match(
        /<button[^>]*class="[^"]*wiki-item-content[^"]*"[^>]*>([\s\S]*?)<\/button>/i
      );
      let groupTitle = 'General';
      if (titleMatch) {
        groupTitle = titleMatch[1].replace(/<[^>]+>/g, '').trim();
      }

      // Match the first nested <ul> or the content inside
      const listMatch = chunk.match(/<ul[^>]*class="[^"]*wiki-tree[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
      const listContent = listMatch ? listMatch[1] : chunk;
      const itemMatches = [...listContent.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];

      for (const m of itemMatches) {
        const href = m[1];
        const rawText = m[2].replace(/<[^>]+>/g, '').trim();
        if (!href || href.startsWith('#') || href.endsWith('.md')) continue;

        let fullUrl = href;
        if (href.startsWith('/')) {
          fullUrl = `${rootObj.origin}${href}`;
        } else if (!href.startsWith('http')) {
          fullUrl = `${rootObj.origin}/${href}`;
        }

        fullUrl = normalizeDocUrl(fullUrl);

        if (seenUrls.has(fullUrl)) continue;
        seenUrls.add(fullUrl);

        if (!seenGroups.has(groupTitle)) {
          seenGroups.set(groupTitle, []);
        }

        const slug = fullUrl.split('/').pop() || '';
        const itemTitle = rawText || slugToTitle(slug);

        seenGroups.get(groupTitle)!.push({
          id: `item_${Math.random().toString(36).slice(2, 7)}`,
          url: fullUrl,
          title: itemTitle,
          category: groupTitle,
          categorySlug: groupTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          slug: slug,
          depth: 1,
          selected: true,
          status: 'idle',
        });
      }
    }

    seenGroups.forEach((items, groupName) => {
      if (items.length > 0) {
        categories.push({
          name: groupName,
          slug: groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          items,
          expanded: true,
          selected: true,
        });
      }
    });

    if (categories.length > 0) {
      return categories;
    }
  }

  // 2. Strategy: Docusaurus / VitePress / Nextra / GitBook Sidebar
  const navMatches = [...html.matchAll(/<(?:nav|aside)[^>]*>([\s\S]*?)<\/(?:nav|aside)>/gi)];
  for (const navMatch of navMatches) {
    const navHtml = navMatch[1];
    // Check if contains menu items
    if (navHtml.includes('sidebar') || navHtml.includes('menu') || navHtml.includes('tree')) {
      const linkMatches = [...navHtml.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
      if (linkMatches.length >= 3) {
        for (const lm of linkMatches) {
          const href = lm[1];
          const rawText = lm[2].replace(/<[^>]+>/g, '').trim();
          if (!href || href.startsWith('#') || href.endsWith('.md')) continue;

          let fullUrl = href.startsWith('/')
            ? `${rootObj.origin}${href}`
            : href.startsWith('http')
            ? href
            : `${rootObj.origin}/${href}`;

          fullUrl = normalizeDocUrl(fullUrl);
          if (seenUrls.has(fullUrl)) continue;
          seenUrls.add(fullUrl);

          const pathParts = new URL(fullUrl).pathname.split('/').filter(Boolean);
          const catName = pathParts.length > 1 ? slugToTitle(pathParts[0]) : 'General';

          if (!seenGroups.has(catName)) {
            seenGroups.set(catName, []);
          }

          const slug = fullUrl.split('/').pop() || '';
          seenGroups.get(catName)!.push({
            id: `item_${Math.random().toString(36).slice(2, 7)}`,
            url: fullUrl,
            title: rawText || slugToTitle(slug),
            category: catName,
            categorySlug: catName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            slug: slug,
            depth: 1,
            selected: true,
            status: 'idle',
          });
        }
      }
    }
  }

  seenGroups.forEach((items, groupName) => {
    if (items.length > 0) {
      categories.push({
        name: groupName,
        slug: groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        items,
        expanded: true,
        selected: true,
      });
    }
  });

  return categories;
}

/**
 * Primary scanner function: Combines Proxy Fetch + DOM Sidebar Parser + Firecrawl Map Fallback
 */
export async function scanDocTree(
  rootUrl: string,
  firecrawlApiUrl: string = DEFAULT_FIRECRAWL_BASE_URL,
  apiKey: string = ''
): Promise<DocCategory[]> {
  const cleanRoot = normalizeDocUrl(rootUrl);

  // --- Tier 1: Try Direct HTML Proxy Fetch (Vite CLI Bridge) ---
  try {
    const proxyRes = await bridgeFetch(`/api/proxy/fetch-html?url=${encodeURIComponent(cleanRoot)}`);
    if (proxyRes.ok) {
      const proxyJson = await proxyRes.json();
      if (proxyJson.success && proxyJson.html) {
        const domCategories = parseDomSidebar(proxyJson.html, proxyJson.finalUrl || cleanRoot);
        if (domCategories.length > 0) {
          return domCategories;
        }
      }
    }
  } catch (e) {
    console.warn('Proxy fetch HTML failed, trying Firecrawl Scrape rawHtml...', e);
  }

  const firecrawl = { baseUrl: firecrawlApiUrl, apiKey };

  // --- Tier 2: Try Firecrawl Scrape with rawHtml format ---
  try {
    const data = await scrape(firecrawl, cleanRoot, { formats: ['rawHtml'] });
    const rawHtml = data.rawHtml || data.html || '';
    if (rawHtml) {
      const domCategories = parseDomSidebar(rawHtml, cleanRoot);
      if (domCategories.length > 0) {
        return domCategories;
      }
    }
  } catch (e) {
    console.warn('Firecrawl scrape rawHtml failed, trying Map API fallback...', e);
  }

  // --- Tier 3: Fallback to Firecrawl Map API & Path Analysis ---
  let urls: string[] = [];
  try {
    urls = await map(firecrawl, cleanRoot, { limit: 150 });
  } catch (err) {
    console.warn('Firecrawl map API failed:', err);
  }

  if (!urls.some((u) => normalizeDocUrl(u) === cleanRoot)) {
    urls.unshift(cleanRoot);
  }

  // Group by URL Path Segments
  const rootUrlObj = new URL(cleanRoot);
  const rootPathParts = rootUrlObj.pathname.split('/').filter(Boolean);
  const basePrefix = rootPathParts.length > 0 ? rootPathParts[0] : '';

  const validUrls = Array.from(
    new Set(
      urls
        .map((u) => normalizeDocUrl(u))
        .filter((u) => {
          try {
            const parsed = new URL(u);
            if (parsed.origin !== rootUrlObj.origin) return false;
            if (basePrefix && !parsed.pathname.includes(`/${basePrefix}`)) return false;
            if (/\.(png|jpg|jpeg|gif|svg|pdf|zip|css|js)$/i.test(parsed.pathname)) return false;
            return true;
          } catch {
            return false;
          }
        })
    )
  );

  const categoryMap = new Map<string, DocItem[]>();
  for (const urlStr of validUrls) {
    const parsed = new URL(urlStr);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    const baseIndex = basePrefix ? pathParts.indexOf(basePrefix) : -1;
    const relevantParts = baseIndex >= 0 ? pathParts.slice(baseIndex + 1) : pathParts;

    let categorySlug = 'general';
    let itemSlug = '';

    if (relevantParts.length === 0) {
      categorySlug = 'general';
      itemSlug = 'overview';
    } else if (relevantParts.length === 1) {
      categorySlug = 'general';
      itemSlug = relevantParts[0];
    } else {
      categorySlug = relevantParts[0];
      itemSlug = relevantParts.slice(1).join('-');
    }

    const categoryName = slugToTitle(categorySlug);
    const itemTitle = slugToTitle(itemSlug);

    const docItem: DocItem = {
      id: `${categorySlug}_${itemSlug}_${Math.random().toString(36).slice(2, 7)}`,
      url: urlStr,
      title: itemTitle,
      category: categoryName,
      categorySlug: categorySlug,
      slug: itemSlug,
      depth: relevantParts.length,
      selected: true,
      status: 'idle',
    };

    if (!categoryMap.has(categorySlug)) {
      categoryMap.set(categorySlug, []);
    }
    categoryMap.get(categorySlug)!.push(docItem);
  }

  const result: DocCategory[] = [];
  categoryMap.forEach((items, catSlug) => {
    result.push({
      name: slugToTitle(catSlug),
      slug: catSlug,
      items,
      expanded: true,
      selected: true,
    });
  });

  return result;
}
