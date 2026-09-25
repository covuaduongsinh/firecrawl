import { AIEngineConfig, executeDirectAIExtract } from "./aiEngines";
import { chunkMarkdown } from "./chunkMarkdown";
import { formatExtractToMarkdown } from "./markdownFormatter";

/**
 * Page size sent to the AI in one request. Bilingual output roughly doubles the text, so this
 * keeps each answer well inside the engines' output-token limits.
 */
export const DEFAULT_CHUNK_CHARS = 9000;

export interface ProcessedDocument {
  extractedData: unknown;
  markdownOutput: string;
  engineUsed: string;
  modelUsed: string;
  chunkCount: number;
}

export interface ProcessDocumentOptions {
  title: string;
  url: string;
  prompt: string;
  config: AIEngineConfig;
  signal?: AbortSignal;
  maxChunkChars?: number;
  onChunk?: (index: number, total: number) => void;
  /** Wraps each AI call, e.g. with retries. */
  runStep?: <T>(step: () => Promise<T>) => Promise<T>;
}

/**
 * Runs the prompt over a page's Markdown. Long pages are split at headings and processed part by
 * part instead of being silently truncated, then merged back into one Markdown document.
 */
export async function processDocument(
  markdown: string,
  options: ProcessDocumentOptions
): Promise<ProcessedDocument> {
  const { title, url, prompt, config, signal } = options;
  const runStep = options.runStep ?? (<T>(step: () => Promise<T>) => step());
  const chunks = chunkMarkdown(markdown, options.maxChunkChars ?? DEFAULT_CHUNK_CHARS);

  if (chunks.length <= 1) {
    options.onChunk?.(1, 1);
    const result = await runStep(() =>
      executeDirectAIExtract([{ url, markdown }], prompt, undefined, config, { signal })
    );
    return {
      extractedData: result.extractedJson,
      markdownOutput: formatExtractToMarkdown(result.extractedJson, {
        title,
        sourceUrl: url,
        engineUsed: result.engineUsed,
        modelUsed: result.modelUsed,
      }),
      engineUsed: result.engineUsed,
      modelUsed: result.modelUsed,
      chunkCount: 1,
    };
  }

  const parts: unknown[] = [];
  const partMarkdown: string[] = [];
  let engineUsed = "";
  let modelUsed = "";

  for (let i = 0; i < chunks.length; i++) {
    options.onChunk?.(i + 1, chunks.length);
    const partPrompt =
      `${prompt}\n\n(Đây là phần ${i + 1}/${chunks.length} của cùng một trang tài liệu. ` +
      "Chỉ xử lý nội dung của phần này, giữ nguyên thứ tự và cấu trúc heading.)";
    const result = await runStep(() =>
      executeDirectAIExtract([{ url, markdown: chunks[i] }], partPrompt, undefined, config, { signal })
    );
    engineUsed = result.engineUsed;
    modelUsed = result.modelUsed;
    parts.push(result.extractedJson);
    partMarkdown.push(formatExtractToMarkdown(result.extractedJson, { isSubDocument: true }).trim());
  }

  return {
    extractedData: { type: "document", chunks: parts },
    markdownOutput: formatExtractToMarkdown(
      { type: "document", markdown: partMarkdown.join("\n\n") },
      { title, sourceUrl: url, engineUsed, modelUsed }
    ),
    engineUsed,
    modelUsed,
    chunkCount: chunks.length,
  };
}
