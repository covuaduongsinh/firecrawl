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
 * Decode common HTML entities in title strings
 */
export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
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
 * Parses documentation manifest JSON (such as content.json used by Paperclip Docs and modern SPAs)
 */
export function parseDocManifestJson(jsonInput: string | unknown, originUrl: string): DocCategory[] {
  let data: Record<string, unknown> | null = null;
  try {
    data = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : (jsonInput as Record<string, unknown>);
  } catch {
    return [];
  }

  if (!data || typeof data !== 'object') return [];

  const rootUrlObj = new URL(originUrl);
  const origin = rootUrlObj.origin;
  const categories: DocCategory[] = [];

  // Structure 1: Paperclip Docs or similar with `sections: [{ title, pages: [...] }]`
  const sections = Array.isArray(data.sections) ? (data.sections as Record<string, unknown>[]) : [];
  if (sections.length > 0) {
    for (const sec of sections) {
      const rawSecTitle = (sec.title as string) || 'General';
      const secName = decodeHtmlEntities(rawSecTitle);
      const secSlug = secName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'general';
      const items: DocItem[] = [];

      const processPages = (pages: unknown[], currentSubGroup = '') => {
        if (!Array.isArray(pages)) return;
        for (const p of pages) {
          if (!p || typeof p !== 'object') continue;
          const pageObj = p as Record<string, unknown>;

          // Nested subgroup (e.g. { title: 'Members & Access', pages: [...] })
          if (Array.isArray(pageObj.pages)) {
            processPages(pageObj.pages, (pageObj.title as string) || currentSubGroup);
            continue;
          }

          const rawTitle = (pageObj.title as string) || (pageObj.slug as string) || '';
          if (!rawTitle && !pageObj.slug && !pageObj.file) continue;

          const title = decodeHtmlEntities(rawTitle) || 'Untitled';
          let slug = typeof pageObj.slug === 'string' ? pageObj.slug.replace(/^\/+/, '') : '';
          if (!slug && typeof pageObj.file === 'string') {
            slug = pageObj.file.replace(/\.md$/i, '');
          }

          let fullUrl = '';
          if (slug) {
            fullUrl = `${origin}/${slug}`;
          } else {
            fullUrl = originUrl;
          }
          fullUrl = normalizeDocUrl(fullUrl);

          items.push({
            id: `item_${Math.random().toString(36).slice(2, 7)}`,
            url: fullUrl,
            title: currentSubGroup ? `${decodeHtmlEntities(currentSubGroup)}: ${title}` : title,
            category: secName,
            categorySlug: secSlug,
            slug: slug.split('/').pop() || slug,
            depth: currentSubGroup ? 2 : 1,
            selected: true,
            status: 'idle',
          });
        }
      };

      processPages(Array.isArray(sec.pages) ? sec.pages : []);

      if (items.length > 0) {
        categories.push({
          name: secName,
          slug: secSlug,
          items,
          expanded: true,
          selected: true,
        });
      }
    }

    if (categories.length > 0) return categories;
  }

  // Structure 2: Standard flat manifest with `pages: [...]` or `items: [...]`
  const rawList = Array.isArray(data.pages)
    ? (data.pages as unknown[])
    : Array.isArray(data.items)
    ? (data.items as unknown[])
    : null;

  if (rawList && rawList.length > 0) {
    const seenGroups = new Map<string, DocItem[]>();
    for (const item of rawList) {
      if (!item || typeof item !== 'object') continue;
      const obj = item as Record<string, unknown>;
      const cat = decodeHtmlEntities((obj.category as string) || (obj.section as string) || 'General');
      const catSlug = cat.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'general';
      const rawTitle = (obj.title as string) || (obj.name as string) || 'Untitled';
      const slug = typeof obj.slug === 'string' ? obj.slug.replace(/^\/+/, '') : '';
      const url = typeof obj.url === 'string' && obj.url ? obj.url : slug ? `${origin}/${slug}/` : originUrl;

      if (!seenGroups.has(cat)) seenGroups.set(cat, []);
      seenGroups.get(cat)!.push({
        id: `item_${Math.random().toString(36).slice(2, 7)}`,
        url: normalizeDocUrl(url),
        title: decodeHtmlEntities(rawTitle),
        category: cat,
        categorySlug: catSlug,
        slug: slug.split('/').pop() || slug,
        depth: 1,
        selected: true,
        status: 'idle',
      });
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

    if (categories.length > 0) return categories;
  }

  return categories;
}

/**
 * Parses XML sitemap text and groups URLs into structured DocCategories
 */
export function parseSitemapXml(xmlText: string, rootUrl: string): DocCategory[] {
  const rootUrlObj = new URL(rootUrl);
  const categories: DocCategory[] = [];
  const locMatches = [...xmlText.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)];
  if (locMatches.length === 0) return [];

  const seenUrls = new Set<string>();
  const seenGroups = new Map<string, DocItem[]>();

  // If user provided a subpath prefix (e.g. /education), only match URLs under that prefix
  const rootPath = rootUrlObj.pathname.replace(/\/+$/, '');
  const pathPrefix = rootPath && rootPath !== '/' ? rootPath : '';

  for (const m of locMatches) {
    const rawUrl = m[1].trim();
    if (!rawUrl || /\.(png|jpg|jpeg|gif|svg|pdf|zip|css|js|xml|json)$/i.test(rawUrl)) continue;

    let urlObj: URL;
    try {
      urlObj = new URL(rawUrl);
    } catch {
      continue;
    }

    if (urlObj.origin !== rootUrlObj.origin) continue;
    if (pathPrefix && !urlObj.pathname.startsWith(pathPrefix)) continue;

    const normalized = normalizeDocUrl(rawUrl);
    if (seenUrls.has(normalized)) continue;
    seenUrls.add(normalized);

    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    let categoryName = 'General';
    let itemTitle = 'Overview';
    let itemSlug = 'overview';

    if (pathParts.length === 0) {
      categoryName = 'General';
      itemTitle = 'Overview';
      itemSlug = 'overview';
    } else if (pathParts.length === 1) {
      categoryName = slugToTitle(pathParts[0]);
      itemTitle = `${slugToTitle(pathParts[0])} Overview`;
      itemSlug = pathParts[0];
    } else if (pathParts.length === 2) {
      categoryName = slugToTitle(pathParts[0]);
      itemTitle = slugToTitle(pathParts[1]);
      itemSlug = pathParts[1];
    } else {
      categoryName = `${slugToTitle(pathParts[0])} / ${slugToTitle(pathParts[1])}`;
      itemTitle = slugToTitle(pathParts[pathParts.length - 1]);
      itemSlug = pathParts[pathParts.length - 1];
    }

    const catSlug = categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'general';

    if (!seenGroups.has(categoryName)) {
      seenGroups.set(categoryName, []);
    }

    seenGroups.get(categoryName)!.push({
      id: `item_${Math.random().toString(36).slice(2, 7)}`,
      url: normalized,
      title: itemTitle,
      category: categoryName,
      categorySlug: catSlug,
      slug: itemSlug,
      depth: pathParts.length,
      selected: true,
      status: 'idle',
    });
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
 * Creates DocCategories from an arbitrary list of URLs entered manually by the user
 */
export function importCustomUrls(rawInput: string[] | string, rootUrl: string = 'https://docs.local'): DocCategory[] {
  const lines = Array.isArray(rawInput)
    ? rawInput
    : rawInput.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  const seenUrls = new Set<string>();
  const seenGroups = new Map<string, DocItem[]>();

  for (const line of lines) {
    const raw = line.trim();
    if (!raw || raw.startsWith('#') || raw.startsWith('//')) continue;
    let url = raw;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      try {
        const base = new URL(rootUrl);
        url = new URL(raw, base.origin).toString();
      } catch {
        continue;
      }
    }

    url = normalizeDocUrl(url);
    if (seenUrls.has(url)) continue;
    seenUrls.add(url);

    let pathParts: string[] = [];
    try {
      pathParts = new URL(url).pathname.split('/').filter(Boolean);
    } catch {
      continue;
    }

    const catName = pathParts.length > 1 ? slugToTitle(pathParts[0]) : 'Custom Import';
    const slug = pathParts[pathParts.length - 1] || 'page';
    const catSlug = catName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'custom';

    if (!seenGroups.has(catName)) {
      seenGroups.set(catName, []);
    }

    seenGroups.get(catName)!.push({
      id: `item_${Math.random().toString(36).slice(2, 7)}`,
      url,
      title: slugToTitle(slug),
      category: catName,
      categorySlug: catSlug,
      slug,
      depth: pathParts.length || 1,
      selected: true,
      status: 'idle',
    });
  }

  const result: DocCategory[] = [];
  seenGroups.forEach((items, groupName) => {
    if (items.length > 0) {
      result.push({
        name: groupName,
        slug: groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        items,
        expanded: true,
        selected: true,
      });
    }
  });

  return result;
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
        groupTitle = decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, '').trim());
      }

      // Match the first nested <ul> or the content inside
      const listMatch = chunk.match(/<ul[^>]*class="[^"]*wiki-tree[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
      const listContent = listMatch ? listMatch[1] : chunk;
      const itemMatches = [...listContent.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];

      for (const m of itemMatches) {
        const href = m[1];
        const rawText = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, '').trim());
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

  // 2. Strategy: Paperclip Docs sidebar structure (<div class="sb-section" data-section-title="...">)
  if (html.includes('sb-section') && (html.includes('sb-link') || html.includes('sb-section-title'))) {
    const sectionMatches = [
      ...html.matchAll(
        /<div[^>]*class="[^"]*sb-section[^"]*"[^>]*data-section-title="([^"]+)"[\s\S]*?(?=<div[^>]*class="[^"]*sb-section[^"]*"|<\/nav>|<\/aside>|$)/gi
      ),
    ];

    for (const sm of sectionMatches) {
      const secTitle = decodeHtmlEntities(sm[1].trim());
      const secContent = sm[0];
      const linkMatches = [
        ...secContent.matchAll(/<a[^>]*class="[^"]*sb-link[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi),
      ];

      for (const lm of linkMatches) {
        const href = lm[1];
        const rawText = decodeHtmlEntities(lm[2].replace(/<[^>]+>/g, '').trim());
        if (!href || href.startsWith('#')) continue;

        let fullUrl = href.startsWith('/')
          ? `${rootObj.origin}${href}`
          : href.startsWith('http')
          ? href
          : `${rootObj.origin}/${href}`;

        fullUrl = normalizeDocUrl(fullUrl);
        if (seenUrls.has(fullUrl)) continue;
        seenUrls.add(fullUrl);

        if (!seenGroups.has(secTitle)) {
          seenGroups.set(secTitle, []);
        }

        const slug = fullUrl.split('/').filter(Boolean).pop() || '';
        seenGroups.get(secTitle)!.push({
          id: `item_${Math.random().toString(36).slice(2, 7)}`,
          url: fullUrl,
          title: rawText || slugToTitle(slug),
          category: secTitle,
          categorySlug: secTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          slug,
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

  // 3. Strategy: Docusaurus / VitePress / Nextra / GitBook Sidebar (or any <nav> / <aside> with sidebar markers)
  const navMatches = [...html.matchAll(/<(?:nav|aside)([^>]*)>([\s\S]*?)<\/(?:nav|aside)>/gi)];
  for (const navMatch of navMatches) {
    const navAttrs = navMatch[1] || '';
    const navHtml = navMatch[2] || '';
    const combined = (navAttrs + ' ' + navHtml).toLowerCase();

    // Check if contains menu/sidebar markers in attributes or content
    if (
      combined.includes('sidebar') ||
      combined.includes('menu') ||
      combined.includes('tree') ||
      combined.includes('toc') ||
      combined.includes('nav-links') ||
      combined.includes('sb-') ||
      combined.includes('vpsidebar') ||
      combined.includes('nextra-sidebar')
    ) {
      const linkMatches = [...navHtml.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
      if (linkMatches.length >= 3) {
        for (const lm of linkMatches) {
          const href = lm[1];
          const rawText = decodeHtmlEntities(lm[2].replace(/<[^>]+>/g, '').trim());
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
 * Extracts candidate first guide link from Landing Page Cards (e.g. Paperclip Docs Landing Cards)
 */
export function extractFirstLandingCardLink(html: string, pageUrl: string): string | null {
  const rootObj = new URL(pageUrl);
  const cardMatches = [
    ...html.matchAll(
      /<a[^>]*class="[^"]*(?:card|landing-tier-card|doc-card)[^"]*"[^>]*href="([^"]+)"/gi
    ),
  ];
  for (const m of cardMatches) {
    const href = m[1];
    if (!href || href.startsWith('#') || href === '/') continue;
    const fullUrl = href.startsWith('/')
      ? `${rootObj.origin}${href}`
      : href.startsWith('http')
      ? href
      : `${rootObj.origin}/${href}`;
    return normalizeDocUrl(fullUrl);
  }
  return null;
}

/**
 * Primary scanner function: Multi-Tier Smart Doc Tree Discovery
 * Tier 0: Direct Doc Manifest JSON (content.json) - Fastest, 100% complete
 * Tier 1: Proxy Fetch & DOM Sidebar Parser (Frappe, Paperclip, Docusaurus)
 * Tier 1b: Landing Page Card traversal to full subpage sidebar
 * Tier 2: XML Sitemap Parser via Proxy (/sitemap.xml)
 * Tier 3: Firecrawl Scrape API rawHtml
 * Tier 4: Firecrawl Map API Fallback & Path Clustering
 */
export async function scanDocTree(
  rootUrl: string,
  firecrawlApiUrl: string = DEFAULT_FIRECRAWL_BASE_URL,
  apiKey: string = '',
  onStatus?: (status: string) => void
): Promise<DocCategory[]> {
  const cleanRoot = normalizeDocUrl(rootUrl);
  const rootUrlObj = new URL(cleanRoot);
  const origin = rootUrlObj.origin;

  // --- Tier 0: Check Doc Manifest JSON (e.g. content.json) ---
  const candidateManifests = [
    `${origin}/content.json`,
    ...(cleanRoot !== origin ? [`${cleanRoot.replace(/\/+$/, '')}/content.json`] : []),
  ];

  for (const manifestUrl of candidateManifests) {
    try {
      onStatus?.('Đang kiểm tra manifest tài liệu (content.json)...');
      const proxyRes = await bridgeFetch(`/api/proxy/fetch-html?url=${encodeURIComponent(manifestUrl)}`);
      if (proxyRes.ok) {
        const proxyJson = await proxyRes.json();
        if (proxyJson.success && proxyJson.html) {
          const manifestCategories = parseDocManifestJson(proxyJson.html, cleanRoot);
          if (manifestCategories.length > 0) {
            return manifestCategories;
          }
        }
      }
    } catch {
      // Manifest not found or fetch error, proceed to Tier 1
    }
  }

  // --- Tier 1: Direct HTML Proxy Fetch (Vite CLI Bridge) & DOM Parser ---
  let pageHtml = '';
  try {
    onStatus?.('Đang tải mã nguồn trang qua Proxy...');
    const proxyRes = await bridgeFetch(`/api/proxy/fetch-html?url=${encodeURIComponent(cleanRoot)}`);
    if (proxyRes.ok) {
      const proxyJson = await proxyRes.json();
      if (proxyJson.success && proxyJson.html) {
        pageHtml = proxyJson.html;
        const domCategories = parseDomSidebar(pageHtml, proxyJson.finalUrl || cleanRoot);
        if (domCategories.length > 0) {
          return domCategories;
        }

        // --- Tier 1b: If page is a landing page with empty sidebar but has landing cards, follow first card ---
        const firstDocLink = extractFirstLandingCardLink(pageHtml, proxyJson.finalUrl || cleanRoot);
        if (firstDocLink) {
          onStatus?.('Phát hiện trang đích dạng thẻ, đang bóc tách thanh điều hướng từ trang con...');
          try {
            const subpageRes = await bridgeFetch(
              `/api/proxy/fetch-html?url=${encodeURIComponent(firstDocLink)}`
            );
            if (subpageRes.ok) {
              const subpageJson = await subpageRes.json();
              if (subpageJson.success && subpageJson.html) {
                const subpageCategories = parseDomSidebar(subpageJson.html, subpageJson.finalUrl || firstDocLink);
                if (subpageCategories.length > 0) {
                  return subpageCategories;
                }
              }
            }
          } catch {
            // Ignore and continue
          }
        }
      }
    }
  } catch (e) {
    console.warn('Proxy fetch HTML failed, proceeding to next tier...', e);
  }

  // --- Tier 2: Check Sitemap XML (/sitemap.xml) via Proxy ---
  const candidateSitemaps = [
    `${origin}/sitemap.xml`,
    ...(cleanRoot !== origin ? [`${cleanRoot.replace(/\/+$/, '')}/sitemap.xml`] : []),
  ];

  for (const sitemapUrl of candidateSitemaps) {
    try {
      onStatus?.('Đang kiểm tra sơ đồ trang web (sitemap.xml)...');
      const sitemapRes = await bridgeFetch(`/api/proxy/fetch-html?url=${encodeURIComponent(sitemapUrl)}`);
      if (sitemapRes.ok) {
        const sitemapJson = await sitemapRes.json();
        if (sitemapJson.success && sitemapJson.html && sitemapJson.html.includes('<loc>')) {
          const sitemapCategories = parseSitemapXml(sitemapJson.html, cleanRoot);
          if (sitemapCategories.length > 0) {
            return sitemapCategories;
          }
        }
      }
    } catch {
      // Ignore and continue
    }
  }

  const firecrawl = { baseUrl: firecrawlApiUrl, apiKey };

  // --- Tier 3: Try Firecrawl Scrape with rawHtml format ---
  try {
    onStatus?.('Đang thử trích xuất bằng Firecrawl Scrape API...');
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

  // --- Tier 4: Fallback to Firecrawl Map API & Path Analysis ---
  let urls: string[] = [];
  try {
    onStatus?.('Đang dò tìm liên kết qua Firecrawl Map API...');
    urls = await map(firecrawl, cleanRoot, { limit: 500 });
  } catch (err) {
    console.warn('Firecrawl map API failed:', err);
  }

  if (!urls.some((u) => normalizeDocUrl(u) === cleanRoot)) {
    urls.unshift(cleanRoot);
  }

  // Group by URL Path Segments
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
            if (/\.(png|jpg|jpeg|gif|svg|pdf|zip|css|js|xml|json)$/i.test(parsed.pathname)) return false;
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
