import { describe, expect, it } from 'vitest';
import {
  decodeHtmlEntities,
  extractFirstLandingCardLink,
  importCustomUrls,
  normalizeDocUrl,
  parseDocManifestJson,
  parseDomSidebar,
  parseSitemapXml,
  slugToTitle,
} from './docTreeScanner';

describe('docTreeScanner', () => {
  describe('slugToTitle & normalizeDocUrl & decodeHtmlEntities', () => {
    it('formats slugs into human titles', () => {
      expect(slugToTitle('student-management')).toBe('Student Management');
      expect(slugToTitle('getting_started')).toBe('Getting Started');
      expect(slugToTitle('')).toBe('General');
    });

    it('normalizes URLs by removing hashes, query params and trailing slashes', () => {
      expect(normalizeDocUrl('https://docs.paperclip.ing/guides/#intro')).toBe(
        'https://docs.paperclip.ing/guides'
      );
      expect(normalizeDocUrl('https://docs.paperclip.ing/guides/?ref=search')).toBe(
        'https://docs.paperclip.ing/guides'
      );
    });

    it('decodes HTML entities properly', () => {
      expect(decodeHtmlEntities('Your Org &amp; Agents')).toBe('Your Org & Agents');
      expect(decodeHtmlEntities('&quot;Hello&quot; &lt;World&gt;')).toBe('"Hello" <World>');
    });
  });

  describe('parseDocManifestJson (Paperclip docs format)', () => {
    const sampleManifest = {
      sections: [
        {
          tier: 'Learn',
          title: 'Quickstart',
          pages: [
            {
              title: 'Quickstart Path',
              file: 'guides/getting-started/five-minute-path.md',
              slug: 'guides/getting-started/five-minute-path',
            },
            {
              title: 'What is Paperclip?',
              file: 'guides/welcome/what-is-paperclip.md',
              slug: 'guides/welcome/what-is-paperclip',
            },
          ],
        },
        {
          tier: 'Learn',
          title: 'How-to Guides',
          pages: [
            {
              title: 'Members & Access',
              pages: [
                {
                  title: 'Enable Multi-User Login',
                  file: 'how-to/enable-multi-user-login.md',
                  slug: 'how-to/enable-multi-user-login',
                },
                {
                  title: 'Add a Human Teammate',
                  file: 'how-to/add-a-human-teammate.md',
                  slug: 'how-to/add-a-human-teammate',
                },
              ],
            },
          ],
        },
      ],
    };

    it('parses structured manifest with nested pages and returns categories with full URLs', () => {
      const categories = parseDocManifestJson(sampleManifest, 'https://docs.paperclip.ing/');
      expect(categories).toHaveLength(2);

      // Section 1: Quickstart
      expect(categories[0].name).toBe('Quickstart');
      expect(categories[0].items).toHaveLength(2);
      expect(categories[0].items[0].title).toBe('Quickstart Path');
      expect(categories[0].items[0].url).toBe(
        'https://docs.paperclip.ing/guides/getting-started/five-minute-path'
      );

      // Section 2: How-to Guides (with nested subgroup)
      expect(categories[1].name).toBe('How-to Guides');
      expect(categories[1].items).toHaveLength(2);
      expect(categories[1].items[0].title).toBe('Members & Access: Enable Multi-User Login');
      expect(categories[1].items[0].url).toBe(
        'https://docs.paperclip.ing/how-to/enable-multi-user-login'
      );
      expect(categories[1].items[0].depth).toBe(2);
    });

    it('handles flat pages array format', () => {
      const flatManifest = {
        pages: [
          {
            title: 'Intro',
            category: 'Getting Started',
            slug: 'intro',
          },
          {
            title: 'Advanced Usage',
            category: 'Advanced',
            url: 'https://docs.example.com/advanced',
          },
        ],
      };

      const categories = parseDocManifestJson(flatManifest, 'https://docs.example.com');
      expect(categories).toHaveLength(2);
      expect(categories[0].name).toBe('Getting Started');
      expect(categories[0].items[0].url).toBe('https://docs.example.com/intro');
      expect(categories[1].name).toBe('Advanced');
      expect(categories[1].items[0].url).toBe('https://docs.example.com/advanced');
    });
  });

  describe('parseSitemapXml', () => {
    const sampleSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://docs.paperclip.ing/</loc></url>
  <url><loc>https://docs.paperclip.ing/guides/getting-started/five-minute-path/</loc></url>
  <url><loc>https://docs.paperclip.ing/guides/welcome/what-is-paperclip/</loc></url>
  <url><loc>https://docs.paperclip.ing/reference/api/overview/</loc></url>
  <url><loc>https://docs.paperclip.ing/logo.svg</loc></url>
</urlset>`;

    it('parses XML sitemap and clusters URLs into meaningful categories while skipping assets', () => {
      const categories = parseSitemapXml(sampleSitemap, 'https://docs.paperclip.ing/');
      expect(categories.length).toBeGreaterThanOrEqual(2);

      const allItems = categories.flatMap((c) => c.items);
      // logo.svg should be excluded
      expect(allItems.some((i) => i.url.endsWith('logo.svg/'))).toBe(false);
      // five-minute-path should be included
      expect(
        allItems.some((i) =>
          i.url.includes('guides/getting-started/five-minute-path')
        )
      ).toBe(true);
    });
  });

  describe('parseDomSidebar', () => {
    it('parses Paperclip Docs sb-section structure', () => {
      const html = `<nav id="sidebar">
        <div class="sb-section" data-section-idx="0" data-section-title="Quickstart" data-open="true">
          <div class="sb-pages">
            <a class="sb-link" href="/guides/getting-started/five-minute-path/">Quickstart Path</a>
            <a class="sb-link" href="/guides/welcome/what-is-paperclip/">What is Paperclip?</a>
          </div>
        </div>
        <div class="sb-section" data-section-idx="1" data-section-title="Day-to-day">
          <div class="sb-pages">
            <a class="sb-link" href="/guides/day-to-day/dashboard/">The Dashboard</a>
          </div>
        </div>
      </nav>`;

      const categories = parseDomSidebar(html, 'https://docs.paperclip.ing/');
      expect(categories).toHaveLength(2);
      expect(categories[0].name).toBe('Quickstart');
      expect(categories[0].items).toHaveLength(2);
      expect(categories[0].items[0].url).toBe(
        'https://docs.paperclip.ing/guides/getting-started/five-minute-path'
      );
      expect(categories[1].name).toBe('Day-to-day');
      expect(categories[1].items).toHaveLength(1);
    });

    it('parses Frappe Docs wiki-tree structure', () => {
      const html = `<ul class="wiki-tree">
        <li class="wiki-item is-group">
          <button class="wiki-item-content">General Education</button>
          <ul class="wiki-tree">
            <li><a href="/education/introduction">Introduction</a></li>
            <li><a href="/education/setup">Setup Guide</a></li>
          </ul>
        </li>
      </ul>`;

      const categories = parseDomSidebar(html, 'https://docs.frappe.io/education');
      expect(categories).toHaveLength(1);
      expect(categories[0].name).toBe('General Education');
      expect(categories[0].items).toHaveLength(2);
      expect(categories[0].items[0].url).toBe('https://docs.frappe.io/education/introduction');
    });

    it('extracts first landing card link', () => {
      const landingHtml = `<section id="landing">
        <div class="card-grid">
          <a class="card" href="/guides/getting-started/five-minute-path/">
            <div class="card-title">Quickstart</div>
          </a>
        </div>
      </section>`;

      const link = extractFirstLandingCardLink(landingHtml, 'https://docs.paperclip.ing/');
      expect(link).toBe('https://docs.paperclip.ing/guides/getting-started/five-minute-path');
    });
  });

  describe('importCustomUrls', () => {
    it('creates categories from custom newline-separated URLs', () => {
      const input = `
        https://docs.paperclip.ing/guides/getting-started/five-minute-path/
        https://docs.paperclip.ing/guides/day-to-day/dashboard/
        https://docs.paperclip.ing/reference/api/overview/
      `;

      const categories = importCustomUrls(input, 'https://docs.paperclip.ing');
      expect(categories.length).toBeGreaterThanOrEqual(2);
      const totalItems = categories.reduce((sum, c) => sum + c.items.length, 0);
      expect(totalItems).toBe(3);
    });
  });
});
