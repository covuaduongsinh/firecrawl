/**
 * Module chuyển đổi dữ liệu trích xuất AI thành tài liệu Markdown chuẩn, đẹp mắt, dễ đọc.
 */

interface FormatterOptions {
  title?: string;
  sourceUrl?: string;
  engineUsed?: string;
  modelUsed?: string;
}

export function formatExtractToMarkdown(
  rawResult: any,
  options: FormatterOptions = {}
): string {
  if (!rawResult) return "";

  // Trích xuất đối tượng dữ liệu cốt lõi
  const rootData = rawResult.data?.extractedJson || rawResult.data || rawResult;

  const title =
    rootData.title?.translated ||
    rootData.title?.original ||
    rootData.title ||
    rootData.name ||
    options.title ||
    "Tài Liệu Trích Xuất & Dịch Thuật";

  let out = "";

  // 1. Header & Metadata
  if (typeof title === "object") {
    const viTitle = title.translated || title.vi || "";
    const enTitle = title.original || title.en || "";
    out += `# ${viTitle || enTitle}\n`;
    if (viTitle && enTitle && viTitle !== enTitle) {
      out += `*(${enTitle})*\n\n`;
    } else {
      out += `\n`;
    }
  } else {
    out += `# ${title}\n\n`;
  }

  // Metadata block
  const source =
    rootData.source_url ||
    rootData.sourceURL ||
    rootData.url ||
    options.sourceUrl ||
    "";
  const engine = rawResult.data?.engineUsed || options.engineUsed || "";
  const model = rawResult.data?.modelUsed || options.modelUsed || "";

  out += `> 📅 **Thời gian tạo:** ${new Date().toLocaleString("vi-VN")}\n`;
  if (source) {
    out += `> 🔗 **Nguồn tài liệu:** [${source}](${source})\n`;
  }
  if (engine || model) {
    out += `> 🤖 **Mô hình xử lý:** ${[engine, model].filter(Boolean).join(" — ")}\n`;
  }
  out += `\n---\n\n`;

  // 2. Render Tóm tắt / Summary nếu có
  if (rootData.summary) {
    out += `## 📌 Tóm Tắt Tổng Quan\n\n`;
    if (typeof rootData.summary === "object") {
      if (rootData.summary.translated) {
        out += `${rootData.summary.translated}\n\n`;
        if (rootData.summary.original) {
          out += `> 📖 *Bản gốc:* ${rootData.summary.original}\n\n`;
        }
      } else {
        out += `${JSON.stringify(rootData.summary)}\n\n`;
      }
    } else {
      out += `${rootData.summary}\n\n`;
    }
  }

  // 3. Render Navigation / Menu nếu có
  if (rootData.navigation) {
    out += `### 🧭 Cấu Trúc Menu / Điều Hướng\n\n`;
    if (typeof rootData.navigation === "object") {
      for (const [k, v] of Object.entries(rootData.navigation)) {
        if (typeof v === "string") {
          out += `- **${k}**: ${v}\n`;
        }
      }
      out += `\n`;
    }
  }

  // 4. Render Danh sách Section / Nội dung chính
  if (Array.isArray(rootData.sections)) {
    out += `## 📖 Nội Dung Chi Tiết\n\n`;
    rootData.sections.forEach((sec: any, idx: number) => {
      renderSection(sec, idx + 1);
    });
  } else {
    // Duyệt qua các trường khác của đối tượng
    for (const [key, val] of Object.entries(rootData)) {
      if (
        [
          "title",
          "summary",
          "source_url",
          "sourceURL",
          "url",
          "navigation",
          "sections",
          "rawOutput",
        ].includes(key)
      ) {
        continue;
      }
      renderGenericField(key, val);
    }
  }

  function renderSection(sec: any, index: number) {
    if (!sec || typeof sec !== "object") {
      out += `### Mục ${index}\n\n${sec}\n\n`;
      return;
    }

    // Tiêu đề mục
    const heading =
      sec.heading?.translated ||
      sec.heading?.original ||
      sec.heading ||
      sec.title?.translated ||
      sec.title ||
      `Mục ${index}`;

    out += `### ${index}. ${heading}\n\n`;

    if (sec.heading?.original && sec.heading?.translated) {
      out += `*(Bản gốc: ${sec.heading.original})*\n\n`;
    }

    // Nội dung văn bản
    if (sec.content) {
      if (typeof sec.content === "object") {
        if (sec.content.translated) {
          out += `${sec.content.translated}\n\n`;
          if (sec.content.original) {
            out += `> 📖 *Bản gốc:* ${sec.content.original}\n\n`;
          }
        } else {
          for (const [ck, cv] of Object.entries(sec.content)) {
            out += `- **${ck}**: ${cv}\n`;
          }
          out += `\n`;
        }
      } else {
        out += `${sec.content}\n\n`;
      }
    }

    // Danh sách items / features / bullet points
    if (Array.isArray(sec.items)) {
      renderListItems(sec.items);
    } else if (Array.isArray(sec.features)) {
      renderListItems(sec.features);
    }

    // Bảng biểu hoặc dữ liệu con
    for (const [subK, subV] of Object.entries(sec)) {
      if (
        ["id", "heading", "title", "content", "items", "features"].includes(
          subK
        )
      ) {
        continue;
      }
      renderGenericField(subK, subV, 4);
    }

    out += `\n`;
  }

  function renderListItems(items: any[]) {
    items.forEach((item) => {
      if (typeof item === "string" || typeof item === "number") {
        out += `- ${item}\n`;
      } else if (typeof item === "object" && item !== null) {
        const itemTitle =
          item.title?.translated ||
          item.title ||
          item.name ||
          item.heading ||
          "";
        const itemDesc =
          item.description?.translated ||
          item.description ||
          item.content ||
          "";

        if (itemTitle && itemDesc) {
          out += `- **${itemTitle}**: ${itemDesc}\n`;
        } else if (itemTitle) {
          out += `- **${itemTitle}**\n`;
        } else {
          out += `- ${JSON.stringify(item)}\n`;
        }
      }
    });
    out += `\n`;
  }

  function renderGenericField(key: string, val: any, depth = 2) {
    if (val === null || val === undefined) return;

    const readableTitle = key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const headingPrefix = "#".repeat(Math.min(depth, 5));

    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      out += `${headingPrefix} ${readableTitle}\n\n${val}\n\n`;
      return;
    }

    if (Array.isArray(val)) {
      out += `${headingPrefix} ${readableTitle}\n\n`;
      renderListItems(val);
      return;
    }

    if (typeof val === "object") {
      out += `${headingPrefix} ${readableTitle}\n\n`;
      for (const [k, v] of Object.entries(val)) {
        if (typeof v === "object" && v !== null) {
          renderGenericField(k, v, depth + 1);
        } else {
          out += `- **${k.replace(/_/g, " ")}**: ${v}\n`;
        }
      }
      out += `\n`;
    }
  }

  // 5. Phụ lục: Cấu trúc JSON gốc dạng collapsible
  out += `\n---\n\n<details>\n<summary><strong>🔍 Xem Dữ Liệu JSON Gốc (Raw JSON)</strong></summary>\n\n\`\`\`json\n${JSON.stringify(
    rawResult,
    null,
    2
  )}\n\`\`\`\n\n</details>\n`;

  return out;
}
