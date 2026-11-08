import { AIEngineConfig } from "./aiEngines";
import { bridgeFetch } from "./bridgeClient";

export interface SearchResultItem {
  url: string;
  title: string;
  description: string;
  markdown: string;
  metadata?: Record<string, unknown>;
}

export interface SearchOptions {
  baseUrl?: string;
  apiKey?: string;
  limit?: number;
  lang?: string;
  country?: string;
  signal?: AbortSignal;
}

export interface DeepResearchResult {
  reportMarkdown: string;
  sources: SearchResultItem[];
  query: string;
  createdAt: string;
  engineUsed: string;
}

/**
 * Gọi endpoint /v1/search để tìm kiếm và cào dữ liệu markdown sạch từ nhiều trang web cùng lúc.
 */
export async function searchWeb(
  query: string,
  options: SearchOptions = {}
): Promise<SearchResultItem[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const limit = options.limit ?? 5;
  const lang = options.lang || "en";
  const baseUrl = (options.baseUrl || "").replace(/\/+$/, "");
  const searchUrl = baseUrl ? `${baseUrl}/v1/search` : "/v1/search";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (options.apiKey) {
    headers["Authorization"] = `Bearer ${options.apiKey}`;
  }

  const res = await fetch(searchUrl, {
    method: "POST",
    headers,
    signal: options.signal,
    body: JSON.stringify({
      query: trimmed,
      limit,
      lang,
      ...(options.country ? { country: options.country } : {}),
      scrapeOptions: {
        formats: ["markdown"],
      },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    let msg = errorText;
    try {
      const parsed = JSON.parse(errorText);
      msg = parsed.error || errorText;
    } catch {}
    throw new Error(`Lỗi tìm kiếm Firecrawl (${res.status}): ${msg}`);
  }

  const json = await res.json();
  const rawData = (json.data || []) as any[];

  return rawData.map((item, idx) => {
    const meta = item.metadata || {};
    return {
      url: item.url || meta.sourceURL || "",
      title: item.title || meta.title || `Kết quả #${idx + 1}`,
      description: item.description || meta.description || "",
      markdown: item.markdown || item.content || "",
      metadata: meta,
    };
  });
}

/**
 * Xây dựng prompt phân tích & tổng hợp báo cáo nghiên cứu chuyên sâu (Deep Research).
 */
export function buildResearchPrompt(
  query: string,
  sources: SearchResultItem[],
  customInstruction?: string
): string {
  const sourceBlocks = sources
    .map((s, idx) => {
      const truncatedMd = s.markdown ? s.markdown.slice(0, 4000) : "Không có nội dung chi tiết.";
      return `---
Nguồn [${idx + 1}]: ${s.title}
URL: ${s.url}
Tóm lược: ${s.description || "N/A"}
Nội dung trích xuất:
${truncatedMd}`;
    })
    .join("\n\n");

  return `Bạn là một chuyên gia phân tích công nghệ và kiến trúc phần mềm cao cấp (Principal Research Analyst).
Nhiệm vụ của bạn là đọc các nguồn tài liệu web được cào thực tế dưới đây và tạo một "BÁO CÁO NGHIÊN CỨU CHUYÊN SÂU" (Deep Research Report) hoàn chỉnh, khách quan, giàu chiều sâu và thực tiễn.

CÂU HỎI / CHỦ ĐỀ NGHIÊN CỨU:
"${query}"

${customInstruction ? `YÊU CẦU ĐẶC BIỆT CỦA NGƯỜI DÙNG:\n${customInstruction}\n` : ""}

CÁC NGUỒN TÀI LIỆU WEB THỰC TẾ TRÍCH XUẤT ĐƯỢC:
${sourceBlocks}

---
HƯỚNG DẪN ĐỊNH DẠNG BẢN BÁO CÁO (OBSIDIAN MARKDOWN):
1. Bắt đầu bằng phần Frontmatter YAML:
---
title: "Báo cáo: [Tên chủ đề ngắn gọn]"
date: ${new Date().toISOString().split("T")[0]}
tags:
  - deep-research
  - firecrawl
  - report
query: "${query.replace(/"/g, '\\"')}"
sources_count: ${sources.length}
---

2. Cấu trúc bài viết:
# [Tiêu Đề Báo Cáo Nghiên Cứu Chuyên Sâu]

## 🎯 1. Tóm Tắt Điều Hành (Executive Summary)
(Tóm lược ngắn gọn các phát hiện cốt lõi, bức tranh tổng quan và câu trả lời chính cho chủ đề trong 2-3 đoạn súc tích).

## 🔍 2. Phân Tích & So Sánh Chi Tiết (Detailed Technical Analysis)
(Đi sâu vào các đặc tính kỹ thuật, kiến trúc, tính năng, điểm mạnh, điểm yếu. Nếu là so sánh nhiều đối tượng, hãy lập BẢNG SO SÁNH Markdown rõ ràng).

## 📊 3. Đánh Giá Khách Quan & Khuyến Nghị (Evaluation & Key Takeaways)
(Phân tích xem giải pháp nào phù hợp với quy mô doanh nghiệp nào, trường hợp nào nên dùng, các rủi ro hoặc lưu ý khi triển khai).

## 📚 4. Danh Mục Tài Liệu Tham Khảo (Citations & Sources)
(Liệt kê các nguồn theo định dạng:
- [1] **[Tiêu đề trang]**(URL) - Ghi chú ngắn về thông tin lấy từ nguồn này).

LƯU Ý QUAN TRỌNG:
- Trả về TOÀN BỘ nội dung bằng Tiếng Việt chuẩn mực, giữ nguyên các thuật ngữ kỹ thuật quốc tế phổ biến.
- Sử dụng số trích dẫn [1], [2] trong nội dung phân tích khi trích dẫn dữ liệu từ các nguồn trên.
- CHỈ TRẢ VỀ NỘI DUNG MARKDOWN HOÀN CHỈNH, không kèm lời chào hỏi hay giải thích phụ.`;
}

/**
 * Tổng hợp báo cáo Deep Research bằng AI Engine (Claude Code CLI / Gemini / Antigravity).
 */
export async function runDeepResearch(
  query: string,
  sources: SearchResultItem[],
  aiConfig: AIEngineConfig,
  customInstruction?: string
): Promise<DeepResearchResult> {
  if (sources.length === 0) {
    throw new Error("Không có dữ liệu nguồn nào để nghiên cứu. Vui lòng kiểm tra lại từ khóa tìm kiếm.");
  }

  const prompt = buildResearchPrompt(query, sources, customInstruction);
  let reportMarkdown = "";
  let engineUsed: string = aiConfig.engine;

  // 1. Sử dụng Claude Code CLI
  if (aiConfig.engine === "claude") {
    engineUsed = `Claude Code CLI (${aiConfig.claudeModel || "claude-sonnet-5"})`;
    const res = await bridgeFetch("/api/cli/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine: "claude",
        prompt,
        model: aiConfig.claudeModel || "default",
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Lỗi tổng hợp Claude CLI: ${err}`);
    }
    const data = await res.json();
    reportMarkdown = data.rawOutput || "";
  }
  // 2. Sử dụng Antigravity CLI / Gemini
  else if (aiConfig.engine === "gemini" && !aiConfig.geminiApiKey) {
    engineUsed = `Antigravity CLI (${aiConfig.geminiModel || "gemini-2.5-flash"})`;
    const res = await bridgeFetch("/api/cli/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine: "antigravity",
        prompt,
        model: aiConfig.geminiModel || "default",
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Lỗi tổng hợp Antigravity CLI: ${err}`);
    }
    const data = await res.json();
    reportMarkdown = data.rawOutput || "";
  }
  // 3. Fallback: Gemini REST API trực tiếp
  else if (aiConfig.engine === "gemini" && aiConfig.geminiApiKey) {
    engineUsed = `Google Gemini REST API (${aiConfig.geminiModel || "gemini-2.5-flash"})`;
    const model = aiConfig.geminiModel || "gemini-2.5-flash";
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${aiConfig.geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 8192,
          },
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Lỗi Gemini API (${res.status}): ${err}`);
    }
    const data = await res.json();
    reportMarkdown = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } else {
    // Fallback khác
    const res = await bridgeFetch("/api/cli/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine: "claude",
        prompt,
        model: "default",
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Lỗi AI Engine: ${err}`);
    }
    const data = await res.json();
    reportMarkdown = data.rawOutput || "";
  }

  // Loại bỏ các khối ```markdown bọc ngoài nếu có
  let cleanMd = reportMarkdown.trim();
  if (cleanMd.startsWith("```markdown")) {
    cleanMd = cleanMd.slice(11).trim();
  } else if (cleanMd.startsWith("```")) {
    cleanMd = cleanMd.slice(3).trim();
  }
  if (cleanMd.endsWith("```")) {
    cleanMd = cleanMd.slice(0, -3).trim();
  }

  return {
    reportMarkdown: cleanMd,
    sources,
    query,
    createdAt: new Date().toLocaleString("vi-VN"),
    engineUsed,
  };
}
