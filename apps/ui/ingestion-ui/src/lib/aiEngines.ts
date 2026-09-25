import { bridgeFetch } from "./bridgeClient";
export type AIEngineType = "gemini" | "claude" | "ollama" | "openai" | "firecrawl";

export interface AIEngineConfig {
  engine: AIEngineType;
  // Google Gemini / Antigravity
  geminiApiKey: string;
  geminiModel: string;
  // Claude / Anthropic
  claudeApiKey: string;
  claudeModel: string;
  // Ollama
  ollamaBaseUrl: string;
  ollamaModel: string;
  // OpenAI / DeepSeek / Custom
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
}

export const DEFAULT_AI_CONFIG: AIEngineConfig = {
  engine: "gemini",
  geminiApiKey: "",
  geminiModel: "gemini-3.7-flash",
  claudeApiKey: "",
  claudeModel: "claude-sonnet-5",
  ollamaBaseUrl: "http://localhost:11434",
  ollamaModel: "llama3",
  openaiApiKey: "",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiModel: "gpt-4o-mini",
};

const STORAGE_KEY = "firecrawl_ai_engine_config";

/** Model Claude cũ (dòng 3.x) đã ngừng hoạt động — tự chuyển sang model mặc định hiện hành. */
const RETIRED_CLAUDE_MODEL = /^claude-3/;

/**
 * Header cho Anthropic API khi gọi trực tiếp từ trình duyệt.
 * `anthropic-dangerous-direct-browser-access` bắt buộc để API trả CORS header.
 */
function anthropicHeaders(key: string): Record<string, string> {
  return {
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

export function loadAIConfig(): AIEngineConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const merged: AIEngineConfig = { ...DEFAULT_AI_CONFIG, ...JSON.parse(saved) };
      if (RETIRED_CLAUDE_MODEL.test(merged.claudeModel)) {
        merged.claudeModel = DEFAULT_AI_CONFIG.claudeModel;
      }
      return merged;
    }
  } catch (e) {
    console.error("Lỗi đọc cấu hình AI:", e);
  }
  return DEFAULT_AI_CONFIG;
}

export function saveAIConfig(config: AIEngineConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error("Lỗi lưu cấu hình AI:", e);
  }
}

/**
 * Loại bỏ markdown code blocks dư thừa để lấy chuỗi text hoặc JSON thuần
 */
export function cleanJsonOutput(text: string): string {
  if (!text) return "";
  let clean = text.trim();
  if (clean.startsWith("```markdown")) {
    clean = clean.slice(11);
  } else if (clean.startsWith("```md")) {
    clean = clean.slice(5);
  } else if (clean.startsWith("```json")) {
    clean = clean.slice(7);
  } else if (clean.startsWith("```")) {
    clean = clean.slice(3);
  }
  if (clean.endsWith("```")) {
    clean = clean.slice(0, -3);
  }
  return clean.trim();
}

/**
 * Phân tích kết quả từ AI: ưu tiên JSON, nếu AI trả về Markdown/Text thuần thì tự động đóng gói cấu trúc
 */
export function parseAIOutputSafe(rawText: string): any {
  if (!rawText) return {};
  const clean = cleanJsonOutput(rawText);

  // 1. Parse trực tiếp nếu là JSON hợp lệ
  try {
    return JSON.parse(clean);
  } catch (e1) {
    // 2. Tìm khối JSON { ... } nằm bên trong văn bản
    const firstBrace = clean.indexOf("{");
    const lastBrace = clean.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      try {
        const potentialJson = clean.substring(firstBrace, lastBrace + 1);
        return JSON.parse(potentialJson);
      } catch (e2) {
        // Tiếp tục thử dạng mảng
      }
    }

    // 3. Tìm khối mảng JSON [ ... ]
    const firstBracket = clean.indexOf("[");
    const lastBracket = clean.lastIndexOf("]");
    if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
      try {
        const potentialJson = clean.substring(firstBracket, lastBracket + 1);
        return JSON.parse(potentialJson);
      } catch (e3) {
        // Không phải JSON
      }
    }

    // 4. Fallback: Nếu AI trả về văn bản dịch/markdown thuần tuý, đóng gói thành đối tượng có cấu trúc
    return {
      type: "document",
      markdown: clean,
    };
  }
}

/**
 * Kiểm tra trạng thái CLI trên máy tính qua local bridge endpoint
 */
export async function getLocalCliStatus(): Promise<{
  antigravity: { available: boolean; path: string | null };
  claude: { available: boolean; path: string | null };
}> {
  try {
    const res = await bridgeFetch("/api/cli/status");
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.warn("Không thể kết nối local CLI bridge:", e);
  }
  return {
    antigravity: { available: false, path: null },
    claude: { available: false, path: null },
  };
}

/**
 * Test kết nối đến AI Provider
 */
export async function testAIConnection(
  config: AIEngineConfig
): Promise<{ success: boolean; message: string; latencyMs: number }> {
  const start = performance.now();
  try {
    if (config.engine === "gemini") {
      const key = config.geminiApiKey.trim();
      if (!key) {
        // Kiểm tra qua Antigravity CLI
        const cliStatus = await getLocalCliStatus();
        const latency = Math.round(performance.now() - start);
        if (cliStatus.antigravity.available) {
          return {
            success: true,
            message: `✅ Sẵn sàng qua Google Antigravity CLI (${cliStatus.antigravity.path})`,
            latencyMs: latency,
          };
        }
        return {
          success: false,
          message: "Chưa cấu hình API Key và không tìm thấy 'agy.EXE'.",
          latencyMs: latency,
        };
      }
      const model = config.geminiModel || "gemini-2.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Respond 'OK'" }] }],
          generationConfig: { maxOutputTokens: 10 },
        }),
      });
      const latency = Math.round(performance.now() - start);
      if (!res.ok) {
        const err = await res.text();
        return {
          success: false,
          message: `Lỗi kết nối Gemini API (${res.status}): ${err.slice(0, 150)}`,
          latencyMs: latency,
        };
      }
      return {
        success: true,
        message: `✅ Kết nối thành công Google Gemini REST API (${latency}ms)! Model ${model} sẵn sàng.`,
        latencyMs: latency,
      };
    }

    if (config.engine === "claude") {
      const key = config.claudeApiKey.trim();
      if (!key) {
        // Kiểm tra qua Claude Code CLI
        const cliStatus = await getLocalCliStatus();
        const latency = Math.round(performance.now() - start);
        if (cliStatus.claude.available) {
          return {
            success: true,
            message: `✅ Sẵn sàng qua Claude Code CLI (${cliStatus.claude.path})`,
            latencyMs: latency,
          };
        }
        return {
          success: false,
          message: "Chưa cấu hình API Key và không tìm thấy 'claude.exe'.",
          latencyMs: latency,
        };
      }
      const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
        headers: anthropicHeaders(key),
      });
      const latency = Math.round(performance.now() - start);
      if (!res.ok) {
        const err = await res.text();
        return {
          success: false,
          message: `Lỗi kết nối Claude API (${res.status}): ${err.slice(0, 150)}`,
          latencyMs: latency,
        };
      }
      return {
        success: true,
        message: `✅ Kết nối thành công Anthropic Claude API (${latency}ms)! Model ${config.claudeModel || DEFAULT_AI_CONFIG.claudeModel} sẵn sàng.`,
        latencyMs: latency,
      };
    }

    if (config.engine === "ollama") {
      const baseUrl = config.ollamaBaseUrl.replace(/\/+$/, "");
      const res = await fetch(`${baseUrl}/api/tags`);
      const latency = Math.round(performance.now() - start);
      if (!res.ok) {
        return {
          success: false,
          message: `Không thể kết nối tới Ollama tại ${baseUrl}`,
          latencyMs: latency,
        };
      }
      const data = await res.json();
      const models = (data.models || []).map((m: any) => m.name).join(", ");
      return {
        success: true,
        message: `✅ Kết nối thành công Ollama (${latency}ms)! Models: ${models || "Chưa có model"}`,
        latencyMs: latency,
      };
    }

    if (config.engine === "openai") {
      const key = config.openaiApiKey.trim();
      if (!key) {
        return { success: false, message: "Chưa nhập OpenAI API Key.", latencyMs: 0 };
      }
      const baseUrl = config.openaiBaseUrl.replace(/\/+$/, "");
      const res = await fetch(`${baseUrl}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      const latency = Math.round(performance.now() - start);
      if (!res.ok) {
        const err = await res.text();
        return {
          success: false,
          message: `Lỗi kết nối API (${res.status}): ${err.slice(0, 150)}`,
          latencyMs: latency,
        };
      }
      return {
        success: true,
        message: `✅ Kết nối thành công (${latency}ms)!`,
        latencyMs: latency,
      };
    }

    return {
      success: true,
      message: "Firecrawl Backend Engine mặc định.",
      latencyMs: 0,
    };
  } catch (e: any) {
    const latency = Math.round(performance.now() - start);
    return {
      success: false,
      message: `Lỗi kết nối: ${e?.message || e}`,
      latencyMs: latency,
    };
  }
}

/**
 * Trích xuất dữ liệu có cấu trúc từ Markdown bằng AI Engine đã chọn
 */
export async function executeDirectAIExtract(
  contents: { url: string; markdown: string }[],
  userPrompt: string,
  schema: any | undefined,
  config: AIEngineConfig
): Promise<{ extractedJson: any; engineUsed: string; modelUsed: string }> {
  const combinedContext = contents
    .map(
      (c, i) =>
        `--- TÀI LIỆU [${i + 1}] Nguồn: ${c.url} ---\n${c.markdown.slice(0, 40000)}`
    )
    .join("\n\n");

  const systemInstruction = `You are a high-precision data extraction AI.
Extract structured information from the provided web content according to the user's instructions and JSON schema.
IMPORTANT RULES:
1. Respond ONLY with a single valid JSON object.
2. Do not include introductory text, explanations, or wrapping commentary.
3. Adhere strictly to the requested schema and properties.`;

  const schemaDescription = schema
    ? `\n\nREQUIRED JSON SCHEMA:\n${JSON.stringify(schema, null, 2)}`
    : "";
  const finalPrompt = `${systemInstruction}\n\nUSER PROMPT / TASK:\n${
    userPrompt || "Extract key information, main facts, entities, and structured data."
  }${schemaDescription}\n\nDOCUMENT CONTENT:\n${combinedContext}`;

  // 1. Google Antigravity / Gemini
  if (config.engine === "gemini") {
    const key = config.geminiApiKey.trim();

    // Nếu có API Key -> Dùng REST API
    if (key) {
      const model = config.geminiModel || "gemini-2.5-flash";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

      const payload: any = {
        contents: [{ parts: [{ text: finalPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 300)}`);
      }

      const data = await res.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return {
        extractedJson: parseAIOutputSafe(rawText),
        engineUsed: "Google Gemini REST API",
        modelUsed: model,
      };
    }

    // Nếu không có API Key -> Gọi Antigravity CLI qua Local Bridge
    const cliRes = await bridgeFetch("/api/cli/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine: "antigravity",
        prompt: finalPrompt,
        model: config.geminiModel || "default",
      }),
    });

    if (!cliRes.ok) {
      const err = await cliRes.json().catch(() => ({}));
      throw new Error(
        err.error ||
          "Không thể thực thi Antigravity CLI. Hãy cài đặt Antigravity hoặc nhập Gemini API Key trong phần Cài đặt."
      );
    }

    const cliData = await cliRes.json();
    return {
      extractedJson: parseAIOutputSafe(cliData.rawOutput),
      engineUsed: "Google Antigravity CLI (agy)",
      modelUsed: config.geminiModel || "Antigravity Auto",
    };
  }

  // 2. Claude Code / Anthropic
  if (config.engine === "claude") {
    const key = config.claudeApiKey.trim();

    // Nếu có API Key -> Gọi Claude API Direct
    if (key) {
      const model = config.claudeModel || DEFAULT_AI_CONFIG.claudeModel;
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: anthropicHeaders(key),
        body: JSON.stringify({
          model,
          max_tokens: 8192,
          messages: [{ role: "user", content: finalPrompt }],
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Claude API error (${res.status}): ${err.slice(0, 300)}`);
      }

      const data = await res.json();
      const rawText = data.content?.[0]?.text || "";
      return {
        extractedJson: parseAIOutputSafe(rawText),
        engineUsed: "Anthropic Claude API",
        modelUsed: model,
      };
    }

    // Nếu không có API Key -> Gọi Claude Code CLI qua Local Bridge
    const cliRes = await bridgeFetch("/api/cli/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engine: "claude",
        prompt: finalPrompt,
      }),
    });

    if (!cliRes.ok) {
      const err = await cliRes.json().catch(() => ({}));
      throw new Error(
        err.error ||
          "Không thể thực thi Claude Code CLI. Hãy đảm bảo đã cài đặt 'claude' hoặc nhập Anthropic API Key trong Cài đặt."
      );
    }

    const cliData = await cliRes.json();
    return {
      extractedJson: parseAIOutputSafe(cliData.rawOutput),
      engineUsed: "Claude Code CLI (claude)",
      modelUsed: config.claudeModel || "Claude Code mặc định",
    };
  }

  // 3. Ollama Local
  if (config.engine === "ollama") {
    const baseUrl = config.ollamaBaseUrl.replace(/\/+$/, "");
    const model = config.ollamaModel || "llama3";
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: finalPrompt,
        format: "json",
        stream: false,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Ollama error (${res.status}): ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    return {
      extractedJson: parseAIOutputSafe(data.response),
      engineUsed: `Ollama Local (${baseUrl})`,
      modelUsed: model,
    };
  }

  // 4. OpenAI / DeepSeek / Custom
  if (config.engine === "openai") {
    const key = config.openaiApiKey.trim();
    if (!key) {
      throw new Error("Vui lòng nhập API Key trong phần Cài đặt AI Engine.");
    }
    const baseUrl = config.openaiBaseUrl.replace(/\/+$/, "");
    const model = config.openaiModel || "gpt-4o-mini";

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemInstruction },
          {
            role: "user",
            content: `${userPrompt || "Extract data"}${schemaDescription}\n\n${combinedContext}`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`API error (${res.status}): ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const rawText = data?.choices?.[0]?.message?.content || "";
    return {
      extractedJson: parseAIOutputSafe(rawText),
      engineUsed: `OpenAI Compatible API (${baseUrl})`,
      modelUsed: model,
    };
  }

  throw new Error(`Engine ${config.engine} chưa được hỗ trợ.`);
}
