import React, { useState } from "react";
import {
  Search,
  Sparkles,
  Compass,
  FileText,
  Copy,
  Check,
  Download,
  FolderDown,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  BookOpen,
  Layers,
  AlertCircle,
  FileCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { AIEngineConfig, loadAIConfig } from "@/lib/aiEngines";
import AIEngineSettings from "@/components/AIEngineSettings";
import {
  searchWeb,
  runDeepResearch,
  SearchResultItem,
  DeepResearchResult,
} from "@/lib/searchClient";

interface SearchResearchStudioProps {
  firecrawlApiUrl?: string;
  apiKey?: string;
}

export default function SearchResearchStudio({
  firecrawlApiUrl = "",
  apiKey = "",
}: SearchResearchStudioProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"deep_research" | "quick_search">("deep_research");
  const [limit, setLimit] = useState<number>(5);
  const [lang, setLang] = useState<string>("vi");
  const [customInstruction, setCustomInstruction] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Trạng thái thực thi
  const [loading, setLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Kết quả
  const [researchResult, setResearchResult] = useState<DeepResearchResult | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [activeResultTab, setActiveResultTab] = useState<"report" | "sources">("report");
  const [copied, setCopied] = useState(false);
  const [expandedSourceIndex, setExpandedSourceIndex] = useState<number | null>(null);

  // Thư mục lưu trên máy
  const [outputDirHandle, setOutputDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);

  const [aiConfig, setAiConfig] = useState<AIEngineConfig>(() => loadAIConfig());

  const handleSearchSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setSavedPath(null);
    setResearchResult(null);
    setSearchResults([]);

    try {
      // Bước 1: Gọi Firecrawl /v1/search
      setCurrentStep(`Đang tìm kiếm web & cào nội dung ${limit} trang hàng đầu qua Firecrawl...`);
      const sources = await searchWeb(trimmed, {
        baseUrl: firecrawlApiUrl,
        apiKey,
        limit,
        lang,
      });

      if (sources.length === 0) {
        throw new Error("Không tìm thấy kết quả nào phù hợp từ công cụ tìm kiếm. Hãy thử từ khóa khác.");
      }

      setSearchResults(sources);

      // Bước 2: Nếu là chế độ Deep Research, gọi AI tổng hợp báo cáo
      if (mode === "deep_research") {
        setCurrentStep(`AI (${aiConfig.engine === "claude" ? "Claude Max 5x" : "Antigravity/Gemini"}) đang phân tích ${sources.length} nguồn tài liệu và tạo báo cáo...`);
        const result = await runDeepResearch(
          trimmed,
          sources,
          aiConfig,
          customInstruction.trim() || undefined
        );
        setResearchResult(result);
        setActiveResultTab("report");

        // Nếu đã chọn sẵn thư mục, tự động lưu file báo cáo
        if (outputDirHandle) {
          await saveReportToDirectory(result.reportMarkdown, trimmed, outputDirHandle);
        }
      } else {
        setActiveResultTab("sources");
      }
    } catch (err) {
      console.error("Lỗi Search / Deep Research:", err);
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi không xác định.");
    } finally {
      setLoading(false);
      setCurrentStep("");
    }
  };

  const handleCopyMarkdown = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const safeFileSlug = (str: string): string => {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  };

  const saveReportToDirectory = async (
    content: string,
    queryText: string,
    dir: FileSystemDirectoryHandle
  ) => {
    try {
      const dateStr = new Date().toISOString().split("T")[0];
      const filename = `${dateStr}-${safeFileSlug(queryText) || "report"}.md`;
      const fileHandle = await dir.getFileHandle(filename, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      setSavedPath(filename);
    } catch (e) {
      console.warn("Không thể lưu file vào thư mục:", e);
    }
  };

  const handlePickDirectory = async () => {
    if (!("showDirectoryPicker" in window)) {
      alert("Trình duyệt của bạn không hỗ trợ File System Access API. Hãy tải file .md thủ công.");
      return;
    }
    try {
      const handle = await (window as any).showDirectoryPicker({
        mode: "readwrite",
      });
      setOutputDirHandle(handle);
      if (researchResult) {
        await saveReportToDirectory(researchResult.reportMarkdown, query, handle);
      }
    } catch (e) {
      // User cancelled
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900/40 via-purple-900/30 to-slate-900/50 border border-blue-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-blue-500/20 text-blue-400 border border-blue-500/40 px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                Upstream Firecrawl v1 Fusion
              </span>
              <span className="bg-purple-500/20 text-purple-400 border border-purple-500/40 px-2.5 py-0.5 rounded-full text-xs font-semibold">
                AI Deep Research Studio
              </span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Compass className="w-6 h-6 text-blue-400" />
              Tìm Kiếm Web & Nghiên Cứu Chuyên Sâu
            </h2>
            <p className="text-sm text-slate-300 mt-1 max-w-2xl">
              Cào sạch dữ liệu đa nguồn từ internet theo thời gian thực và tự động tổng hợp thành báo cáo nghiên cứu chất lượng cao chuẩn Obsidian.
            </p>
          </div>

          <div className="flex-shrink-0">
            <AIEngineSettings
              config={aiConfig}
              onChange={(newCfg) => setAiConfig(newCfg)}
            />
          </div>
        </div>
      </div>

      {/* Main Search & Control Box */}
      <Card className="bg-slate-900/90 border-slate-800 shadow-xl backdrop-blur-md">
        <CardContent className="pt-6 space-y-5">
          <form onSubmit={handleSearchSubmit} className="space-y-4">
            {/* Search Input Box */}
            <div className="relative flex items-center">
              <Search className="absolute left-4 w-5 h-5 text-slate-400 pointer-events-none" />
              <Input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nhập câu hỏi hoặc chủ đề nghiên cứu (ví dụ: So sánh kiến trúc NocoBase vs Directus)..."
                className="pl-12 pr-36 py-6 text-base bg-slate-950/80 border-slate-700 text-white placeholder:text-slate-500 focus-visible:ring-blue-500 rounded-xl"
                disabled={loading}
              />
              <Button
                type="submit"
                disabled={loading || !query.trim()}
                className="absolute right-2 h-10 px-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium rounded-lg shadow-md transition-all flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang xử lý...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Bắt Đầu</span>
                  </>
                )}
              </Button>
            </div>

            {/* Mode & Quick Filter Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              {/* Mode Selection */}
              <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                <button
                  type="button"
                  onClick={() => setMode("deep_research")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    mode === "deep_research"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-300" />
                  Nghiên Cứu Sâu (Deep Research)
                </button>
                <button
                  type="button"
                  onClick={() => setMode("quick_search")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    mode === "quick_search"
                      ? "bg-slate-700 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Search className="w-3.5 h-3.5 text-slate-300" />
                  Tìm Nhanh & Lấy Markdown
                </button>
              </div>

              {/* Quick Settings */}
              <div className="flex items-center gap-3 text-xs text-slate-300">
                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  <span>Số nguồn:</span>
                  <select
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="bg-transparent text-white font-semibold outline-none cursor-pointer"
                  >
                    <option value={3} className="bg-slate-900">3 bài</option>
                    <option value={5} className="bg-slate-900">5 bài (Chuẩn)</option>
                    <option value={8} className="bg-slate-900">8 bài</option>
                    <option value={10} className="bg-slate-900">10 bài (Sâu)</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800">
                  <span>Ngôn ngữ:</span>
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value)}
                    className="bg-transparent text-white font-semibold outline-none cursor-pointer"
                  >
                    <option value="vi" className="bg-slate-900">Tiếng Việt</option>
                    <option value="en" className="bg-slate-900">Toàn cầu (en)</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Tùy chỉnh thêm
                  {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Advanced Section */}
            {showAdvanced && (
              <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800 space-y-3 animate-in fade-in-50">
                <label className="block text-xs font-semibold text-slate-300">
                  Yêu cầu phân tích đặc biệt cho AI (Tùy chọn):
                </label>
                <textarea
                  value={customInstruction}
                  onChange={(e) => setCustomInstruction(e.target.value)}
                  placeholder="Ví dụ: Tập trung so sánh về chi phí lưu trữ, khả năng mở rộng quy mô lớn, và lập bảng đối chiếu tính năng cụ thể..."
                  rows={2}
                  className="w-full text-xs bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
          </form>

          {/* Loading Progress Bar */}
          {loading && (
            <div className="bg-blue-950/40 border border-blue-500/30 rounded-xl p-4 flex items-center gap-3 animate-pulse">
              <RefreshCw className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" />
              <div className="text-xs text-blue-200 font-medium">
                {currentStep || "Đang kết nối Firecrawl Search Engine..."}
              </div>
            </div>
          )}

          {/* Error Notice */}
          {error && (
            <div className="bg-red-950/50 border border-red-500/40 rounded-xl p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-red-200 space-y-1">
                <p className="font-semibold">Đã xảy ra lỗi trong quá trình thực hiện:</p>
                <p>{error}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results Workspace */}
      {(researchResult || searchResults.length > 0) && (
        <div className="space-y-4">
          {/* Result Navigation Tabs & Action Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-900/80 p-2.5 rounded-xl border border-slate-800">
            <div className="flex gap-2">
              {researchResult && (
                <button
                  type="button"
                  onClick={() => setActiveResultTab("report")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    activeResultTab === "report"
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200 bg-slate-950/50"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  Báo Cáo Nghiên Cứu AI
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveResultTab("sources")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeResultTab === "sources"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200 bg-slate-950/50"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                Các Nguồn Đã Cào ({searchResults.length})
              </button>
            </div>

            {/* Action Buttons */}
            {activeResultTab === "report" && researchResult && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleCopyMarkdown(researchResult.reportMarkdown)}
                  className="h-8 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs flex items-center gap-1"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? "Đã copy" : "Copy MD"}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    handleDownloadFile(
                      researchResult.reportMarkdown,
                      `${new Date().toISOString().split("T")[0]}-${safeFileSlug(query)}.md`
                    )
                  }
                  className="h-8 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5 text-blue-400" />
                  Tải .md
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePickDirectory}
                  className="h-8 border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs flex items-center gap-1"
                >
                  <FolderDown className="w-3.5 h-3.5 text-purple-400" />
                  {outputDirHandle ? "Lưu vào thư mục đã chọn" : "Chọn thư mục Obsidian"}
                </Button>
              </div>
            )}
          </div>

          {savedPath && (
            <div className="bg-emerald-950/40 border border-emerald-500/30 rounded-lg p-2.5 px-3 flex items-center gap-2 text-xs text-emerald-300">
              <FileCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>Đã lưu báo cáo thành công vào tệp: <strong>{savedPath}</strong></span>
            </div>
          )}

          {/* TAB 1: REPORT VIEW */}
          {activeResultTab === "report" && researchResult && (
            <Card className="bg-slate-900 border-slate-800 shadow-2xl">
              <CardHeader className="border-b border-slate-800/80 pb-4">
                <div className="flex justify-between items-center text-xs text-slate-400">
                  <span>Mô hình: <strong className="text-slate-200">{researchResult.engineUsed}</strong></span>
                  <span>Thời gian: {researchResult.createdAt}</span>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="prose prose-invert max-w-none prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800 prose-headings:text-slate-100 prose-p:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                  {researchResult.reportMarkdown}
                </div>
              </CardContent>
            </Card>
          )}

          {/* TAB 2: SOURCES VIEW */}
          {activeResultTab === "sources" && (
            <div className="space-y-3">
              {searchResults.map((item, idx) => {
                const isExpanded = expandedSourceIndex === idx;
                return (
                  <Card key={idx} className="bg-slate-900/90 border-slate-800 hover:border-slate-700 transition-all">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex justify-between items-start gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="bg-slate-800 text-blue-400 text-xs px-2 py-0.5 rounded font-mono font-bold">
                              #{idx + 1}
                            </span>
                            <h4 className="font-semibold text-slate-100 text-sm hover:text-blue-400 transition-colors">
                              <a href={item.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5">
                                {item.title}
                                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                              </a>
                            </h4>
                          </div>
                          <p className="text-xs text-slate-400 line-clamp-2">
                            {item.description || "Không có tóm lược mô tả."}
                          </p>
                          <span className="text-[11px] text-slate-500 font-mono block">
                            {item.url}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleCopyMarkdown(item.markdown)}
                            className="h-8 px-2 text-slate-400 hover:text-white text-xs"
                            title="Copy Markdown của trang này"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setExpandedSourceIndex(isExpanded ? null : idx)}
                            className="h-8 px-2.5 text-xs text-slate-300 hover:text-white"
                          >
                            {isExpanded ? "Thu gọn" : "Xem Markdown"}
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
                          </Button>
                        </div>
                      </div>

                      {/* Expanded Raw Scraped Markdown */}
                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                          <div className="flex justify-between items-center text-xs text-slate-400">
                            <span>Nội dung Markdown sạch bóc tách từ trang:</span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownloadFile(item.markdown, `source-${idx + 1}-${safeFileSlug(item.title)}.md`)}
                              className="h-7 text-xs border-slate-700 bg-slate-800"
                            >
                              <Download className="w-3 h-3 mr-1" />
                              Tải trang này (.md)
                            </Button>
                          </div>
                          <pre className="bg-slate-950 p-3 rounded-lg text-xs font-mono text-slate-300 max-h-72 overflow-y-auto whitespace-pre-wrap border border-slate-800">
                            {item.markdown || "Nội dung trống."}
                          </pre>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
