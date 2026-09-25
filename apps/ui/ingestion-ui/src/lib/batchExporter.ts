import JSZip from 'jszip';
import { DocCategory, DocItem } from './docTreeScanner';

/**
 * Trigger file download in browser
 */
export function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Helper to slugify for filenames / anchors
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

/**
 * Clean article markdown body when embedding inside a merged book
 * Removes duplicate top-level `# H1` and redundant metadata lines
 */
function cleanArticleBodyForBook(rawContent: string): string {
  if (!rawContent) return '';
  let content = rawContent.trim();

  // Bỏ YAML frontmatter nếu có
  content = content.replace(/^---\n[\s\S]*?\n---\n+/, '');

  // Bỏ dòng tiêu đề H1 đầu tiên nếu có (ví dụ: `# Introduction` hoặc `# Tài Liệu...`)
  content = content.replace(/^#\s+[^\n]+\n+/, '');

  // Bỏ khối metadata trích dẫn đầu bài nếu có (`> 📅 ...\n> 🔗 ...\n\n---\n\n`)
  content = content.replace(/^(?:>[^\n]*\n*)+(?:---\n*)?/, '');

  return content.trim();
}

export type ExportFlavor = 'standard' | 'obsidian';

/** File/folder name part that is safe on Windows, macOS and Linux. */
export function safeFileSlug(text: string, fallback = 'bai-viet'): string {
  return slugify(text || '').slice(0, 80).replace(/-+$/, '') || fallback;
}

function articleFileName(item: DocItem, index: number): string {
  return `${String(index).padStart(2, '0')}-${safeFileSlug(item.slug || item.title)}.md`;
}

function categoryFolderName(category: DocCategory, index: number): string {
  return `${String(index).padStart(2, '0')}-${safeFileSlug(category.slug || category.name, 'chuyen-muc')}`;
}

function articleContent(item: DocItem): string {
  return (item.markdownOutput || JSON.stringify(item.extractedData, null, 2) || '').trim();
}

/** YAML double-quoted scalar (JSON strings are valid YAML). */
function yamlString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Obsidian note: YAML frontmatter holds the metadata (searchable with Dataview),
 * followed by a single H1 and the article body.
 */
export function formatObsidianNote(item: DocItem, categoryName: string, now = new Date()): string {
  const frontmatter = [
    '---',
    `title: ${yamlString(item.title)}`,
    `source: ${yamlString(item.url)}`,
    `category: ${yamlString(categoryName)}`,
    `created: ${now.toISOString().slice(0, 10)}`,
    'tags:',
    '  - firecrawl',
    `  - ${safeFileSlug(categoryName, 'chuyen-muc')}`,
    '---',
    '',
  ].join('\n');
  return `${frontmatter}# ${item.title}\n\n${cleanArticleBodyForBook(articleContent(item))}\n`;
}

/**
 * Clean article for single standalone file in ZIP
 * Ensures a single clean H1 header and metadata block
 */
function formatStandaloneArticleMarkdown(
  item: DocItem,
  categoryName: string,
  flavor: ExportFlavor = 'standard'
): string {
  if (flavor === 'obsidian') return formatObsidianNote(item, categoryName);

  const content = articleContent(item);

  // Nếu nội dung đã bắt đầu bằng `# ` (đã có tiêu đề H1 chuẩn)
  if (content.startsWith('# ')) {
    return content;
  }

  const fileHeader = [
    `# ${item.title}`,
    `> **Chuyên mục:** ${categoryName} | **Nguồn:** [${item.url}](${item.url})`,
    `> **Thời gian:** ${new Date().toLocaleString('vi-VN')}`,
    `\n---\n\n`,
  ].join('\n');

  return fileHeader + content;
}

/** Heading with an explicit anchor for standard Markdown viewers; plain heading for Obsidian. */
function anchoredHeading(level: string, anchor: string, text: string, flavor: ExportFlavor): string {
  return flavor === 'obsidian' ? `${level} ${text}` : `${level} <a id="${anchor}"></a> ${text}`;
}

/** TOC link to a heading: `[[#Heading|label]]` in Obsidian, `[label](#anchor)` elsewhere. */
function tocLink(label: string, anchor: string, headingText: string, flavor: ExportFlavor): string {
  return flavor === 'obsidian' ? `[[#${headingText.replace(/[[\]#|^]/g, ' ').trim()}|${label}]]` : `[${label}](#${anchor})`;
}

/**
 * Export all extracted articles into a structured ZIP file
 */
export async function exportToZip(
  categories: DocCategory[],
  docTitle: string = 'Documentation',
  flavor: ExportFlavor = 'standard'
): Promise<void> {
  const zip = new JSZip();
  let categoryIndex = 1;
  const tocLines: string[] = [];

  tocLines.push(`# 📚 ${docTitle} - Mục Lục Toàn Bộ Tài Liệu`);
  tocLines.push(`> Ngày tạo: ${new Date().toLocaleString('vi-VN')}`);
  tocLines.push(`> Được trích xuất và dịch tự động bởi Firecrawl Batch Crawler & AI Engine\n`);
  tocLines.push(`## Danh Sách Chuyên Mục & Bài Viết:\n`);

  for (const cat of categories) {
    const activeItems = cat.items.filter(
      (item) => item.selected && (item.markdownOutput || item.extractedData)
    );
    if (activeItems.length === 0) continue;

    const catFolderName = categoryFolderName(cat, categoryIndex);
    const catFolder = zip.folder(catFolderName);

    tocLines.push(`### ${categoryIndex}. ${cat.name}`);

    let itemIndex = 1;
    for (const item of activeItems) {
      const itemFileName = articleFileName(item, itemIndex);
      const itemRelativePath = `${catFolderName}/${itemFileName}`;

      const finalContent = formatStandaloneArticleMarkdown(item, cat.name, flavor);
      catFolder?.file(itemFileName, finalContent);

      tocLines.push(`- [${item.title}](./${itemRelativePath})`);
      itemIndex++;
    }

    tocLines.push('');
    categoryIndex++;
  }

  // Add README.md / MUC_LUC.md
  zip.file('README.md', tocLines.join('\n'));
  zip.file('MUC_LUC.md', tocLines.join('\n'));

  // Generate zip file and download
  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = `${slugify(docTitle)}-documentation-archive-${new Date().toISOString().slice(0, 10)}.zip`;
  triggerBlobDownload(blob, filename);
}

/**
 * Export all extracted articles into a single merged Markdown Book with Table of Contents
 */
export function exportToMergedMarkdown(
  categories: DocCategory[],
  docTitle: string = 'Documentation',
  flavor: ExportFlavor = 'standard'
): void {
  const lines: string[] = [];

  // Header
  lines.push(`# 📚 ${docTitle} (Tài Liệu Toàn Tập)`);
  lines.push(`> **Thời gian tạo:** ${new Date().toLocaleString('vi-VN')}`);
  lines.push(`> **Hệ thống:** Firecrawl Batch Crawler & AI Translation Engine`);
  lines.push(`\n---\n`);

  // Table of Contents
  lines.push(`## 📑 Mục Lục (Table of Contents)\n`);

  let catIdx = 1;
  for (const cat of categories) {
    const activeItems = cat.items.filter(
      (item) => item.selected && (item.markdownOutput || item.extractedData)
    );
    if (activeItems.length === 0) continue;

    const catAnchor = `chuong-${catIdx}-${slugify(cat.name)}`;
    lines.push(`- ${tocLink(`**${catIdx}. ${cat.name}**`, catAnchor, `${catIdx}. ${cat.name.toUpperCase()}`, flavor)}`);

    let itemIdx = 1;
    for (const item of activeItems) {
      const itemAnchor = `muc-${catIdx}-${itemIdx}-${slugify(item.title)}`;
      const itemHeading = `${catIdx}.${itemIdx} ${item.title}`;
      lines.push(`  - ${tocLink(itemHeading, itemAnchor, itemHeading, flavor)}`);
      itemIdx++;
    }
    catIdx++;
  }

  lines.push(`\n---\n`);

  // Content Chapters
  catIdx = 1;
  for (const cat of categories) {
    const activeItems = cat.items.filter(
      (item) => item.selected && (item.markdownOutput || item.extractedData)
    );
    if (activeItems.length === 0) continue;

    const catAnchor = `chuong-${catIdx}-${slugify(cat.name)}`;
    lines.push(`\n${anchoredHeading('#', catAnchor, `${catIdx}. ${cat.name.toUpperCase()}`, flavor)}\n`);

    let itemIdx = 1;
    for (const item of activeItems) {
      const itemAnchor = `muc-${catIdx}-${itemIdx}-${slugify(item.title)}`;
      lines.push(`\n${anchoredHeading('##', itemAnchor, `${catIdx}.${itemIdx} ${item.title}`, flavor)}`);
      lines.push(`> 🔗 **Nguồn gốc:** [${item.url}](${item.url})\n`);

      const raw = item.markdownOutput || JSON.stringify(item.extractedData, null, 2);
      const cleanContent = cleanArticleBodyForBook(raw);
      lines.push(cleanContent);
      lines.push(`\n---\n`);
      itemIdx++;
    }
    catIdx++;
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const filename = `${slugify(docTitle)}-full-book-${new Date().toISOString().slice(0, 10)}.md`;
  triggerBlobDownload(blob, filename);
}

/**
 * Export all extracted articles to a single JSON file
 */
export function exportToBatchJson(
  categories: DocCategory[],
  docTitle: string = 'Documentation'
): void {
  const outputData: Record<string, unknown>[] = [];

  for (const cat of categories) {
    for (const item of cat.items) {
      if (item.selected && (item.extractedData || item.markdownOutput)) {
        outputData.push({
          id: item.id,
          title: item.title,
          category: cat.name,
          url: item.url,
          extractedData: item.extractedData,
          markdownOutput: item.markdownOutput,
        });
      }
    }
  }

  const blob = new Blob([JSON.stringify(outputData, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const filename = `${slugify(docTitle)}-batch-extracted-${new Date().toISOString().slice(0, 10)}.json`;
  triggerBlobDownload(blob, filename);
}

/**
 * Export a single category's extracted articles into a ZIP package
 */
export async function exportCategoryToZip(
  category: DocCategory,
  catIndex: number = 1,
  docTitle: string = 'Documentation',
  flavor: ExportFlavor = 'standard'
): Promise<boolean> {
  const activeItems = category.items.filter(
    (item) => item.selected !== false && (item.markdownOutput || item.extractedData)
  );
  if (activeItems.length === 0) return false;

  const zip = new JSZip();
  const catPrefix = String(catIndex).padStart(2, '0');
  const catSlug = safeFileSlug(category.slug || category.name, 'chuyen-muc');
  const catFolderName = categoryFolderName(category, catIndex);
  const catFolder = zip.folder(catFolderName);

  const tocLines: string[] = [
    `# 📁 Chuyên mục ${catIndex}: ${category.name}`,
    `> **Thuộc tài liệu:** ${docTitle}`,
    `> **Tổng số bài đã dịch:** ${activeItems.length} bài`,
    `> **Thời gian xuất:** ${new Date().toLocaleString('vi-VN')}\n`,
    `## Danh sách bài viết:\n`,
  ];

  let itemIndex = 1;
  for (const item of activeItems) {
    const itemFileName = articleFileName(item, itemIndex);

    const finalContent = formatStandaloneArticleMarkdown(item, category.name, flavor);
    catFolder?.file(itemFileName, finalContent);

    tocLines.push(`${itemIndex}. [${item.title}](./${itemFileName}) - [Link gốc](${item.url})`);
    itemIndex++;
  }

  zip.file('README.md', tocLines.join('\n'));

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = `${catPrefix}-${catSlug}-${slugify(docTitle)}-${new Date().toISOString().slice(0, 10)}.zip`;
  triggerBlobDownload(blob, filename);
  return true;
}

/**
 * Export a single category into a merged Markdown document
 */
export function exportCategoryToMergedMarkdown(
  category: DocCategory,
  catIndex: number = 1,
  docTitle: string = 'Documentation',
  flavor: ExportFlavor = 'standard'
): boolean {
  const activeItems = category.items.filter(
    (item) => item.selected !== false && (item.markdownOutput || item.extractedData)
  );
  if (activeItems.length === 0) return false;

  const lines: string[] = [
    `# 📁 ${category.name.toUpperCase()}`,
    `> **Tài liệu:** ${docTitle} | **Chuyên mục:** #${catIndex}`,
    `> **Tổng số bài:** ${activeItems.length} bài | **Thời gian:** ${new Date().toLocaleString('vi-VN')}\n`,
    `---\n`,
    `## 📑 Mục Lục Chuyên Mục\n`,
  ];

  let itemIdx = 1;
  for (const item of activeItems) {
    const anchor = `bai-${itemIdx}-${slugify(item.title)}`;
    const heading = `${itemIdx}. ${item.title}`;
    lines.push(`- ${tocLink(heading, anchor, heading, flavor)}`);
    itemIdx++;
  }

  lines.push(`\n---\n`);

  itemIdx = 1;
  for (const item of activeItems) {
    const anchor = `bai-${itemIdx}-${slugify(item.title)}`;
    lines.push(`\n${anchoredHeading('##', anchor, `${itemIdx}. ${item.title}`, flavor)}`);
    lines.push(`> 🔗 **Nguồn gốc:** [${item.url}](${item.url})\n`);

    const raw = item.markdownOutput || JSON.stringify(item.extractedData, null, 2);
    const cleanContent = cleanArticleBodyForBook(raw);
    lines.push(cleanContent);
    lines.push(`\n---\n`);
    itemIdx++;
  }

  const catPrefix = String(catIndex).padStart(2, '0');
  const catSlug = safeFileSlug(category.slug || category.name, 'chuyen-muc');
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const filename = `${catPrefix}-${catSlug}-${slugify(docTitle)}.md`;
  triggerBlobDownload(blob, filename);
  return true;
}

// ==========================================
// GHI TRỰC TIẾP VÀO THƯ MỤC (File System Access API — Chrome/Edge)
// ==========================================

export function supportsDirectoryOutput(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** Asks the user for an output folder (e.g. a folder inside the Obsidian vault). */
export async function pickOutputDirectory(): Promise<FileSystemDirectoryHandle> {
  if (!window.showDirectoryPicker) {
    throw new Error('Trình duyệt không hỗ trợ ghi thư mục. Hãy dùng Chrome hoặc Edge.');
  }
  return window.showDirectoryPicker({ id: 'firecrawl-output', mode: 'readwrite' });
}

async function writeTextFile(dir: FileSystemDirectoryHandle, name: string, content: string) {
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(content);
  await writable.close();
}

/**
 * Writes one finished article to `<dir>/<NN-category>/<NN-article>.md`.
 * Numbers follow the scanned tree order, so re-running a batch overwrites the same files.
 */
export async function writeArticleToDirectory(
  dir: FileSystemDirectoryHandle,
  categories: DocCategory[],
  itemId: string,
  flavor: ExportFlavor
): Promise<string | null> {
  for (let c = 0; c < categories.length; c++) {
    const category = categories[c];
    const i = category.items.findIndex((it) => it.id === itemId);
    if (i === -1) continue;
    const item = category.items[i];
    if (!item.markdownOutput && !item.extractedData) return null;
    const folderName = categoryFolderName(category, c + 1);
    const folder = await dir.getDirectoryHandle(folderName, { create: true });
    const fileName = articleFileName(item, i + 1);
    await writeTextFile(folder, fileName, formatStandaloneArticleMarkdown(item, category.name, flavor));
    return `${folderName}/${fileName}`;
  }
  return null;
}

/** Writes README.md listing every finished article, using the same paths as writeArticleToDirectory. */
export async function writeIndexToDirectory(
  dir: FileSystemDirectoryHandle,
  categories: DocCategory[],
  docTitle: string
): Promise<void> {
  const lines = [`# 📚 ${docTitle} - Mục Lục`, `> Cập nhật: ${new Date().toLocaleString('vi-VN')}`, ''];
  categories.forEach((category, c) => {
    const done = category.items
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => item.markdownOutput || item.extractedData);
    if (done.length === 0) return;
    const folderName = categoryFolderName(category, c + 1);
    lines.push(`## ${c + 1}. ${category.name}`);
    done.forEach(({ item, i }) => lines.push(`- [${item.title}](./${folderName}/${articleFileName(item, i + 1)})`));
    lines.push('');
  });
  await writeTextFile(dir, 'README.md', lines.join('\n'));
}
