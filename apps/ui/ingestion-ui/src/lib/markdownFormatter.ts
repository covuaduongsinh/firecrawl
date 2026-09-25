/**
 * Module chuyển đổi dữ liệu trích xuất AI thành tài liệu Markdown chuẩn, đẹp mắt, dễ đọc, không trùng lặp.
 */

/**
 * AI output has no fixed shape (the prompt decides it), so the formatter walks it dynamically.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseJson = any;

export interface FormatterOptions {
  title?: string;
  sourceUrl?: string;
  engineUsed?: string;
  modelUsed?: string;
  isSubDocument?: boolean;
  includeRawJson?: boolean;
}

// Các dòng giao diện web thừa — chỉ lọc khi CẢ DÒNG đúng là cụm này (không lọc đoạn văn có chứa từ đó,
// ví dụ "Submit Assignment" trong tài liệu Frappe Education phải được giữ lại).
const BOILERPLATE_EXACT = [
  "was this helpful",
  "nội dung này có hữu ích không",
  "edit this page",
  "chỉnh sửa trang này",
  "submit",
  "gửi",
  "thanks",
  "cảm ơn",
  "previous page",
  "next page",
  "trang trước",
  "trang sau",
  "on this page",
  "trên trang này",
];

// Các dòng bắt đầu bằng cụm này và ngắn (ví dụ "Last updated on 2 Jan 2024") cũng là boilerplate.
const BOILERPLATE_PREFIX = ["last updated", "cập nhật lần cuối"];
const PREFIX_MAX_LENGTH = 60;

function normalizeForBoilerplate(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[*_`>#]+/g, "")
    .replace(/[?!.:…]+$/u, "")
    .trim();
}

export function isBoilerplateText(text: unknown): boolean {
  if (typeof text !== "string") return false;
  const normalized = normalizeForBoilerplate(text);
  if (normalized.length === 0) return false;
  if (BOILERPLATE_EXACT.includes(normalized)) return true;
  return (
    normalized.length <= PREFIX_MAX_LENGTH &&
    BOILERPLATE_PREFIX.some((prefix) => normalized.startsWith(prefix))
  );
}

function cleanMarkdownText(text: string): string {
  if (!text || typeof text !== "string") return "";
  let clean = text.trim();

  // Bỏ bọc codeblock markdown nếu có
  if (clean.startsWith("```markdown")) clean = clean.slice(11);
  else if (clean.startsWith("```md")) clean = clean.slice(5);
  else if (clean.startsWith("```")) clean = clean.slice(3);
  if (clean.endsWith("```")) clean = clean.slice(0, -3);

  return clean.trim();
}

export function formatExtractToMarkdown(
  rawResult: LooseJson,
  optionsInput: FormatterOptions | string = {}
): string {
  if (!rawResult) return "";

  const options: FormatterOptions =
    typeof optionsInput === "string"
      ? { sourceUrl: optionsInput }
      : optionsInput || {};

  // Trích xuất đối tượng dữ liệu cốt lõi
  const rootData = rawResult.data?.extractedJson || rawResult.data || rawResult;

  // Nếu kết quả là chuỗi thuần -> trả về trực tiếp
  if (typeof rootData === "string") {
    return cleanMarkdownText(rootData);
  }

  // Xác định Tiêu đề chuẩn
  const rawTitle =
    options.title ||
    rootData.title?.translated ||
    rootData.title?.vi ||
    rootData.title?.original ||
    rootData.title?.en ||
    rootData.title ||
    rootData.name ||
    "";

  let titleStr = "";
  if (typeof rawTitle === "object" && rawTitle !== null) {
    titleStr = rawTitle.translated || rawTitle.vi || rawTitle.original || rawTitle.en || "";
  } else if (typeof rawTitle === "string") {
    titleStr = rawTitle.trim();
  }

  let out = "";

  // 1. Header & Metadata (Chỉ in khi không phải là sub-document trong sách gộp)
  if (!options.isSubDocument) {
    if (titleStr) {
      out += `# ${titleStr}\n\n`;
    }

    const source =
      options.sourceUrl ||
      rootData.source_url ||
      rootData.sourceURL ||
      rootData.url ||
      "";
    const engine = options.engineUsed || rawResult.data?.engineUsed || "";
    const model = options.modelUsed || rawResult.data?.modelUsed || "";

    out += `> 📅 **Thời gian:** ${new Date().toLocaleString("vi-VN")}\n`;
    if (source) {
      out += `> 🔗 **Nguồn tài liệu:** [${source}](${source})\n`;
    }
    if (engine || model) {
      out += `> 🤖 **Mô hình AI:** ${[engine, model].filter(Boolean).join(" — ")}\n`;
    }
    out += `\n---\n\n`;
  }

  // 2. Tóm tắt / Summary nếu có
  if (rootData.summary) {
    const sumVal = rootData.summary;
    out += `## 📌 Tóm Tắt Tổng Quan\n\n`;
    if (typeof sumVal === "object") {
      if (sumVal.translated || sumVal.vi) {
        out += `${sumVal.translated || sumVal.vi}\n\n`;
        if (sumVal.original || sumVal.en) {
          out += `> 📖 *Bản gốc:* ${sumVal.original || sumVal.en}\n\n`;
        }
      } else {
        out += `${JSON.stringify(sumVal)}\n\n`;
      }
    } else if (typeof sumVal === "string") {
      out += `${sumVal}\n\n`;
    }
  }

  // 3. XỬ LÝ NỘI DUNG CHÍNH (KHỬ TRÙNG LẶP TRIỆT ĐỂ)
  // Ưu tiên 1: Có trường văn bản định dạng hoàn chỉnh (formatted_bilingual_text / markdown / translation / content)
  const fullTextContent =
    rootData.formatted_bilingual_text ||
    rootData.bilingual_text ||
    rootData.markdown ||
    rootData.translated_content ||
    rootData.translation ||
    (typeof rootData.content === "string" ? rootData.content : null);

  if (fullTextContent && typeof fullTextContent === "string") {
    // Render trực tiếp văn bản định dạng sạch
    const cleaned = cleanMarkdownText(fullTextContent);
    // Bỏ qua tiêu đề H1 trùng lặp ở đầu nếu đã có
    const lines = cleaned.split("\n");
    if (lines.length > 0 && lines[0].startsWith("# ") && titleStr && lines[0].includes(titleStr)) {
      lines.shift();
    }
    out += lines.join("\n").trim() + "\n\n";
  }
  // Ưu tiên 2: Có mảng `sections` có cấu trúc
  else if (Array.isArray(rootData.sections) && rootData.sections.length > 0) {
    out += `## 📖 Nội Dung Chi Tiết\n\n`;
    rootData.sections.forEach((sec: LooseJson, idx: number) => {
      renderSection(sec, idx + 1);
    });
  }
  // Ưu tiên 3: Có mảng câu song ngữ `content_bilingual` hoặc `bilingual_content`
  else if (
    (Array.isArray(rootData.content_bilingual) && rootData.content_bilingual.length > 0) ||
    (Array.isArray(rootData.bilingual_content) && rootData.bilingual_content.length > 0)
  ) {
    const chunks = rootData.content_bilingual || rootData.bilingual_content;
    renderBilingualChunks(chunks);
  }
  // Ưu tiên 4: Duyệt qua các trường khác không nằm trong danh sách loại trừ
  else {
    const EXCLUDED_KEYS = [
      "title",
      "summary",
      "source_url",
      "sourceURL",
      "source",
      "url",
      "navigation",
      "sections",
      "content_bilingual",
      "bilingual_content",
      "formatted_bilingual_text",
      "bilingual_text",
      "markdown",
      "content",
      "translation",
      "translated_content",
      "type",
      "rawOutput",
      "json",
      "extractedJson",
    ];

    for (const [key, val] of Object.entries(rootData)) {
      if (EXCLUDED_KEYS.includes(key)) continue;
      renderGenericField(key, val);
    }
  }

  // 4. Render mảng câu song ngữ thành Markdown đẹp mắt (Không in JSON thô)
  function renderBilingualChunks(chunks: LooseJson[]) {
    for (const chunk of chunks) {
      if (typeof chunk === "string") {
        if (!isBoilerplateText(chunk)) {
          out += `${chunk}\n\n`;
        }
        continue;
      }

      if (typeof chunk === "object" && chunk !== null) {
        const orig = String(chunk.original || chunk.en || chunk.source || "");
        const vi = String(chunk.vietnamese || chunk.vi || chunk.translated || chunk.target || "");

        if (isBoilerplateText(orig) || isBoilerplateText(vi)) {
          continue;
        }

        // Nếu là tiêu đề đề mục
        if (orig.startsWith("#") || vi.startsWith("#")) {
          const cleanVi = vi.replace(/^#+\s*/, "");
          const cleanOrig = orig.replace(/^#+\s*/, "");
          out += `### ${cleanVi || cleanOrig}\n`;
          if (cleanOrig && cleanVi && cleanOrig !== cleanVi) {
            out += `*(Bản gốc: ${cleanOrig})*\n\n`;
          } else {
            out += `\n`;
          }
        } else if (vi && orig && vi !== orig) {
          out += `> 🇬🇧 *${orig.trim()}*\n\n🇻🇳 ${vi.trim()}\n\n`;
        } else if (vi) {
          out += `${vi.trim()}\n\n`;
        } else if (orig) {
          out += `${orig.trim()}\n\n`;
        }
      }
    }
  }

  function renderSection(sec: LooseJson, index: number) {
    if (!sec || typeof sec !== "object") {
      if (!isBoilerplateText(String(sec))) {
        out += `### Mục ${index}\n\n${sec}\n\n`;
      }
      return;
    }

    const heading =
      sec.heading?.translated ||
      sec.heading?.vi ||
      sec.heading?.original ||
      sec.heading ||
      sec.title?.translated ||
      sec.title ||
      `Mục ${index}`;

    if (isBoilerplateText(String(heading))) return;

    out += `### ${index}. ${heading}\n\n`;

    const origHeading = sec.heading?.original || sec.heading?.en;
    if (origHeading && origHeading !== heading) {
      out += `*(Bản gốc: ${origHeading})*\n\n`;
    }

    // Nội dung văn bản trong section
    if (sec.content) {
      if (typeof sec.content === "object") {
        const viContent = sec.content.translated || sec.content.vi;
        const origContent = sec.content.original || sec.content.en;
        if (viContent) {
          out += `${viContent}\n\n`;
          if (origContent) {
            out += `> 📖 *Bản gốc:* ${origContent}\n\n`;
          }
        } else {
          for (const [ck, cv] of Object.entries(sec.content)) {
            if (!isBoilerplateText(String(cv))) {
              out += `- **${ck}**: ${cv}\n`;
            }
          }
          out += `\n`;
        }
      } else if (!isBoilerplateText(String(sec.content))) {
        out += `${sec.content}\n\n`;
      }
    }

    // Danh sách items / bullet points
    if (Array.isArray(sec.items)) {
      renderListItems(sec.items);
    } else if (Array.isArray(sec.features)) {
      renderListItems(sec.features);
    }

    out += `\n`;
  }

  function renderListItems(items: LooseJson[]) {
    items.forEach((item) => {
      if (typeof item === "string" || typeof item === "number") {
        if (!isBoilerplateText(String(item))) {
          out += `- ${item}\n`;
        }
      } else if (typeof item === "object" && item !== null) {
        const itemTitle =
          item.title?.translated ||
          item.title?.vi ||
          item.title?.original ||
          item.title ||
          item.name ||
          "";
        const itemDesc =
          item.description?.translated ||
          item.description?.vi ||
          item.description?.original ||
          item.description ||
          item.content ||
          "";

        if (isBoilerplateText(itemTitle) || isBoilerplateText(itemDesc)) {
          return;
        }

        if (itemTitle && itemDesc) {
          out += `- **${itemTitle}**: ${itemDesc}\n`;
        } else if (itemTitle) {
          out += `- **${itemTitle}**\n`;
        } else if (itemDesc) {
          out += `- ${itemDesc}\n`;
        }
      }
    });
    out += `\n`;
  }

  function renderGenericField(key: string, val: LooseJson, depth = 2) {
    if (val === null || val === undefined) return;

    const readableTitle = key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const headingPrefix = "#".repeat(Math.min(depth, 5));

    if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
      if (!isBoilerplateText(String(val))) {
        out += `${headingPrefix} ${readableTitle}\n\n${val}\n\n`;
      }
      return;
    }

    if (Array.isArray(val)) {
      if (val.length > 0 && typeof val[0] === "object" && (val[0].original || val[0].vietnamese)) {
        renderBilingualChunks(val);
      } else {
        out += `${headingPrefix} ${readableTitle}\n\n`;
        renderListItems(val);
      }
      return;
    }

    if (typeof val === "object") {
      out += `${headingPrefix} ${readableTitle}\n\n`;
      for (const [k, v] of Object.entries(val)) {
        if (typeof v === "object" && v !== null) {
          renderGenericField(k, v, depth + 1);
        } else if (!isBoilerplateText(String(v))) {
          out += `- **${k.replace(/_/g, " ")}**: ${v}\n`;
        }
      }
      out += `\n`;
    }
  }

  // 5. Phụ lục Raw JSON (chỉ thêm khi options.includeRawJson = true)
  if (options.includeRawJson) {
    out += `\n---\n\n<details>\n<summary><strong>🔍 Xem Dữ Liệu JSON Gốc (Raw JSON)</strong></summary>\n\n\`\`\`json\n${JSON.stringify(
      rawResult,
      null,
      2
    )}\n\`\`\`\n\n</details>\n`;
  }

  return out.trim() + "\n";
}
