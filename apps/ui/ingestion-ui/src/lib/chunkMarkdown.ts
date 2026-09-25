/**
 * Split Markdown into chunks of at most `maxChars`, cutting at headings first, then at blank lines,
 * and never inside a fenced code block unless a single block is itself larger than the limit.
 */
export function chunkMarkdown(markdown: string, maxChars: number): string[] {
  const text = markdown.trim();
  if (text.length <= maxChars) return text ? [text] : [];

  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const section of splitOutsideFences(text, (line) => /^#{1,3}\s/.test(line))) {
    const pieces =
      section.length <= maxChars
        ? [section]
        : packPieces(splitOutsideFences(section, (line) => line.trim() === ""), maxChars);
    for (const piece of pieces) {
      if (current && current.length + piece.length + 2 > maxChars) flush();
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  flush();
  return chunks;
}

/** Split before every line matching `isBoundary`, ignoring lines inside ``` fences. */
function splitOutsideFences(text: string, isBoundary: (line: string) => boolean): string[] {
  const parts: string[] = [];
  let buffer: string[] = [];
  let inFence = false;
  for (const line of text.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && isBoundary(line) && buffer.some((l) => l.trim())) {
      parts.push(buffer.join("\n").trim());
      buffer = [];
    }
    buffer.push(line);
  }
  if (buffer.some((l) => l.trim())) parts.push(buffer.join("\n").trim());
  return parts.filter(Boolean);
}

/** Greedily join paragraphs up to `maxChars`; hard-split any single paragraph that is still too long. */
function packPieces(paragraphs: string[], maxChars: number): string[] {
  const out: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      if (current) out.push(current);
      current = "";
      for (let i = 0; i < paragraph.length; i += maxChars) out.push(paragraph.slice(i, i + maxChars));
      continue;
    }
    if (current && current.length + paragraph.length + 2 > maxChars) {
      out.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }
  if (current) out.push(current);
  return out;
}
