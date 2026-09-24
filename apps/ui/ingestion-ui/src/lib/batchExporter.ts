import JSZip from 'jszip';
import { DocCategory } from './docTreeScanner';

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
 * Export all extracted articles into a structured ZIP file
 */
export async function exportToZip(
  categories: DocCategory[],
  docTitle: string = 'Documentation'
): Promise<void> {
  const zip = new JSZip();
  let categoryIndex = 1;
  const tocLines: string[] = [];

  tocLines.push(`# ${docTitle} - Mục Lục Toàn Bộ Tài Liệu`);
  tocLines.push(`> Ngày tạo: ${new Date().toLocaleString('vi-VN')}`);
  tocLines.push(`> Được trích xuất và dịch tự động bởi Firecrawl Ingestion & AI Engine\n`);
  tocLines.push(`## Danh Sách Chuyên Mục & Bài Viết:\n`);

  for (const cat of categories) {
    const activeItems = cat.items.filter(
      item => item.selected && (item.markdownOutput || item.extractedData)
    );
    if (activeItems.length === 0) continue;

    const catFolderPrefix = String(categoryIndex).padStart(2, '0');
    const catFolderName = `${catFolderPrefix}-${cat.slug || slugify(cat.name)}`;
    const catFolder = zip.folder(catFolderName);

    tocLines.push(`### ${categoryIndex}. ${cat.name}`);

    let itemIndex = 1;
    for (const item of activeItems) {
      const itemPrefix = String(itemIndex).padStart(2, '0');
      const itemFileName = `${itemPrefix}-${item.slug || slugify(item.title)}.md`;
      const itemRelativePath = `${catFolderName}/${itemFileName}`;

      const content = item.markdownOutput || JSON.stringify(item.extractedData, null, 2);
      
      const fileHeader = [
        `# ${item.title}`,
        `> **Chuyên mục:** ${cat.name} | **Nguồn:** [${item.url}](${item.url})`,
        `> **Thời gian:** ${new Date().toLocaleString('vi-VN')}`,
        `\n---\n\n`,
      ].join('\n');

      catFolder?.file(itemFileName, fileHeader + content);

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
  docTitle: string = 'Documentation'
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
      item => item.selected && (item.markdownOutput || item.extractedData)
    );
    if (activeItems.length === 0) continue;

    const catAnchor = `chuong-${catIdx}-${slugify(cat.name)}`;
    lines.push(`- [**${catIdx}. ${cat.name}**](#${catAnchor})`);

    let itemIdx = 1;
    for (const item of activeItems) {
      const itemAnchor = `muc-${catIdx}-${itemIdx}-${slugify(item.title)}`;
      lines.push(`  - [${catIdx}.${itemIdx} ${item.title}](#${itemAnchor})`);
      itemIdx++;
    }
    catIdx++;
  }

  lines.push(`\n---\n`);

  // Content Chapters
  catIdx = 1;
  for (const cat of categories) {
    const activeItems = cat.items.filter(
      item => item.selected && (item.markdownOutput || item.extractedData)
    );
    if (activeItems.length === 0) continue;

    const catAnchor = `chuong-${catIdx}-${slugify(cat.name)}`;
    lines.push(`\n# <a id="${catAnchor}"></a> ${catIdx}. ${cat.name.toUpperCase()}\n`);

    let itemIdx = 1;
    for (const item of activeItems) {
      const itemAnchor = `muc-${catIdx}-${itemIdx}-${slugify(item.title)}`;
      lines.push(`\n## <a id="${itemAnchor}"></a> ${catIdx}.${itemIdx} ${item.title}`);
      lines.push(`> 🔗 **Nguồn gốc:** [${item.url}](${item.url})\n`);

      const content = item.markdownOutput || JSON.stringify(item.extractedData, null, 2);
      lines.push(content);
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
  const outputData: any[] = [];

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
