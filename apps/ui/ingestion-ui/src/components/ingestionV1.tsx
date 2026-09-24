import { useState, ChangeEvent, FormEvent, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Copy,
  Check,
  Sparkles,
  Globe,
  FileText,
  Code,
  FolderTree,
} from "lucide-react";
import AIEngineSettings from "@/components/AIEngineSettings";
import PromptBankSelector from "@/components/PromptBankSelector";
import BatchDocExtractor from "@/components/BatchDocExtractor";
import {
  AIEngineConfig,
  loadAIConfig,
  executeDirectAIExtract,
} from "@/lib/aiEngines";
import { formatExtractToMarkdown } from "@/lib/markdownFormatter";

//! Dynamic API URL fallback to local Firecrawl instance
const FIRECRAWL_API_URL =
  (import.meta as any).env?.VITE_FIRECRAWL_API_URL || "http://localhost:3002";
const FIRECRAWL_API_KEY =
  (import.meta as any).env?.VITE_FIRECRAWL_API_KEY || "";

interface FormData {
  url: string;
  crawlSubPages: boolean;
  search: string;
  limit: string;
  maxDepth: string;
  excludePaths: string;
  includePaths: string;
  extractMainContent: boolean;
}

interface ExtractFormData {
  urls: string;
  prompt: string;
  useSchema: boolean;
  schema: string;
}

interface CrawlerOptions {
  includes?: string[];
  excludes?: string[];
  maxDepth?: number;
  limit?: number;
  returnOnlyUrls: boolean;
}

interface ScrapeOptions {
  formats?: string[];
  onlyMainContent?: boolean;
}

interface PageOptions {
  onlyMainContent: boolean;
}

interface RequestBody {
  url: string;
  crawlerOptions?: CrawlerOptions;
  pageOptions?: PageOptions;
  search?: string;
  excludePaths?: string[];
  includePaths?: string[];
  maxDepth?: number;
  limit?: number;
  scrapeOptions?: ScrapeOptions;
  formats?: string[];
}

interface ScrapeResultMetadata {
  title: string;
  description: string;
  language: string;
  sourceURL: string;
  pageStatusCode: number;
  pageError?: string;
  [key: string]: string | number | undefined;
}

interface ScrapeResultData {
  markdown: string;
  content: string;
  html: string;
  rawHtml: string;
  metadata: ScrapeResultMetadata;
  llm_extraction: Record<string, unknown>;
  warning?: string;
}

interface ScrapeResult {
  success: boolean;
  data: ScrapeResultData;
}

interface ExtractApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

const DEFAULT_JSON_SCHEMA = JSON.stringify(
  {
    type: "object",
    properties: {
      title: { type: "string", description: "Tiêu đề chính" },
      summary: { type: "string", description: "Tóm tắt nội dung" },
      key_points: {
        type: "array",
        items: { type: "string" },
        description: "Các ý chính nổi bật",
      },
    },
    required: ["title", "summary"],
  },
  null,
  2
);

export default function FirecrawlComponentV1() {
  const [activeTab, setActiveTab] = useState<"scrape" | "extract" | "batch_tree">("batch_tree");

  // Scrape / Crawl Form State
  const [formData, setFormData] = useState<FormData>({
    url: "",
    crawlSubPages: false,
    search: "",
    limit: "",
    maxDepth: "",
    excludePaths: "",
    includePaths: "",
    extractMainContent: false,
  });

  // Extract Form State
  const [extractFormData, setExtractFormData] = useState<ExtractFormData>({
    urls: "",
    prompt: "Trích xuất thông tin tóm tắt và các ý chính của trang web này.",
    useSchema: false,
    schema: DEFAULT_JSON_SCHEMA,
  });

  // AI Engine Configuration State
  const [aiConfig, setAiConfig] = useState<AIEngineConfig>(loadAIConfig);

  const [loading, setLoading] = useState<boolean>(false);
  const [scrapingSelectedLoading, setScrapingSelectedLoading] =
    useState<boolean>(false);
  const [crawledUrls, setCrawledUrls] = useState<string[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [scrapeResults, setScrapeResults] = useState<
    Record<string, ScrapeResult>
  >({});
  const [extractResult, setExtractResult] = useState<any>(null);
  const [isCollapsibleOpen, setIsCollapsibleOpen] = useState(true);
  const [crawlStatus, setCrawlStatus] = useState<{
    current: number;
    total: number | null;
  }>({ current: 0, total: null });
  const [elapsedTime, setElapsedTime] = useState<number>(0);
  const [showCrawlStatus, setShowCrawlStatus] = useState<boolean>(false);
  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const urlsPerPage = 10;

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (loading) {
      setShowCrawlStatus(true);
      timer = setInterval(() => {
        setElapsedTime((prevTime) => prevTime + 1);
      }, 1000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [loading]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (
    filename: string,
    content: string,
    mimeType: string = "text/plain;charset=utf-8"
  ) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadAllMarkdown = () => {
    const allMarkdown = Object.entries(scrapeResults)
      .filter(([_, res]) => res.success && res.data?.markdown)
      .map(
        ([url, res]) =>
          `# ${res.data.metadata?.title || url}\n**Source:** ${url}\n\n${res.data.markdown}\n\n---\n`
      )
      .join("\n");
    handleDownload(
      `firecrawl-scrape-${new Date().toISOString().slice(0, 10)}.md`,
      allMarkdown,
      "text/markdown;charset=utf-8"
    );
  };

  const handleDownloadAllJSON = () => {
    const jsonData = JSON.stringify(scrapeResults, null, 2);
    handleDownload(
      `firecrawl-scrape-${new Date().toISOString().slice(0, 10)}.json`,
      jsonData,
      "application/json;charset=utf-8"
    );
  };

  const handleDownloadExtractJSON = () => {
    const jsonData = JSON.stringify(extractResult, null, 2);
    handleDownload(
      `firecrawl-extract-${new Date().toISOString().slice(0, 10)}.json`,
      jsonData,
      "application/json;charset=utf-8"
    );
  };

  const handleDownloadExtractMarkdown = () => {
    const mdContent = formatExtractToMarkdown(extractResult, {
      sourceUrl: extractFormData.urls,
    });
    handleDownload(
      `firecrawl-extract-${new Date().toISOString().slice(0, 10)}.md`,
      mdContent,
      "text/markdown;charset=utf-8"
    );
  };

  const handleScrapeChange = (e: ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prevData) => {
      const newData = {
        ...prevData,
        [name]: type === "checkbox" ? checked : value,
      };

      if (name === "limit" || name === "search") {
        newData.crawlSubPages = !!value || !!newData.limit || !!newData.search;
      }

      return newData;
    });
  };

  const handleExtractChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setExtractFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleScrapeSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setIsCollapsibleOpen(false);
    setElapsedTime(0);
    setCrawlStatus({ current: 0, total: null });
    setIsScraping(!formData.crawlSubPages);
    setCrawledUrls([]);
    setSelectedUrls([]);
    setScrapeResults({});
    setExtractResult(null);
    setScrapingSelectedLoading(false);
    setShowCrawlStatus(false);

    try {
      const endpoint = `${FIRECRAWL_API_URL}/v1/${
        formData.crawlSubPages ? "map" : "scrape"
      }`;

      const requestBody: RequestBody = formData.crawlSubPages
        ? {
            url: formData.url,
            search: formData.search || undefined,
            limit: formData.limit ? parseInt(formData.limit) : undefined,
          }
        : {
            url: formData.url,
            formats: ["markdown"],
          };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (formData.crawlSubPages) {
        if (data.success === true && Array.isArray(data.links)) {
          setCrawledUrls(data.links);
          setSelectedUrls(data.links);
          setCrawlStatus({
            current: data.links.length,
            total: data.links.length,
          });

          const linkResults: Record<string, ScrapeResult> = {};
          data.links.forEach((link: string) => {
            linkResults[link] = {
              success: true,
              data: {
                metadata: {
                  sourceURL: link,
                  title: link,
                  description: "",
                  language: "",
                  pageStatusCode: 200,
                },
                markdown: "",
                content: "",
                html: "",
                rawHtml: "",
                llm_extraction: {},
              },
            };
          });
          setScrapeResults(linkResults);
        }
      } else {
        setScrapeResults({
          [formData.url]: {
            success: true,
            data: {
              ...data.data,
              metadata: {
                ...data.data.metadata,
                title: data.data.metadata?.title || formData.url,
              },
            },
          },
        });
      }
    } catch (error) {
      console.error("Scrape error:", error);
      setScrapeResults({
        [formData.url]: {
          success: false,
          data: {
            metadata: {
              sourceURL: formData.url,
              title: "Scrape Failed",
              description: "",
              language: "",
              pageStatusCode: 500,
              pageError:
                error instanceof Error ? error.message : "Unknown error",
            },
            markdown: "",
            content: "",
            html: "",
            rawHtml: "",
            llm_extraction: {},
          },
        },
      });
    } finally {
      setLoading(false);
      setShowCrawlStatus(false);
    }
  };

  const handleExtractSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setElapsedTime(0);
    setExtractResult(null);
    setScrapeResults({});
    setShowCrawlStatus(true);
    setIsScraping(false);

    try {
      const urlList = extractFormData.urls
        .split(/[\n,]+/)
        .map((u) => u.trim())
        .filter((u) => u.length > 0);

      if (urlList.length === 0) {
        throw new Error("Vui lòng nhập ít nhất một URL hợp lệ.");
      }

      let parsedSchema = undefined;
      if (extractFormData.useSchema && extractFormData.schema.trim()) {
        try {
          parsedSchema = JSON.parse(extractFormData.schema);
        } catch (err) {
          throw new Error("JSON Schema không hợp lệ. Vui lòng kiểm tra lại cú pháp JSON.");
        }
      }

      // Case 1: Sử dụng Firecrawl Server Native Endpoint (/v1/extract)
      if (aiConfig.engine === "firecrawl") {
        const requestBody = {
          urls: urlList,
          prompt: extractFormData.prompt,
          schema: parsedSchema,
        };

        const response = await fetch(`${FIRECRAWL_API_URL}/v1/extract`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        const data: ExtractApiResponse = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }

        setExtractResult(data);
      } else {
        // Case 2: Trích xuất thông minh qua AI Engine đã chọn (Gemini / Claude / Ollama / OpenAI)
        // Bước 1: Cào nội dung sạch (Markdown) từ Firecrawl Scrape API
        setCrawlStatus({ current: 0, total: urlList.length });
        const scrapedContents: { url: string; markdown: string }[] = [];

        for (let i = 0; i < urlList.length; i++) {
          const currentUrl = urlList[i];
          setCrawlStatus({ current: i + 1, total: urlList.length });

          const scrapeRes = await fetch(`${FIRECRAWL_API_URL}/v1/scrape`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: currentUrl,
              formats: ["markdown"],
              onlyMainContent: true,
            }),
          });

          if (!scrapeRes.ok) {
            const errText = await scrapeRes.text();
            throw new Error(`Lỗi cào URL ${currentUrl}: ${errText.slice(0, 150)}`);
          }

          const scrapeData = await scrapeRes.json();
          const md = scrapeData?.data?.markdown || scrapeData?.data?.content || "";
          scrapedContents.push({ url: currentUrl, markdown: md });
        }

        // Bước 2: Đưa Markdown vào AI Engine đã chọn để trích xuất JSON cấu trúc
        const extractedData = await executeDirectAIExtract(
          scrapedContents,
          extractFormData.prompt,
          parsedSchema,
          aiConfig
        );

        setExtractResult({
          success: true,
          data: extractedData,
        });
      }
    } catch (error) {
      console.error("Extract error:", error);
      setExtractResult({
        success: false,
        error: error instanceof Error ? error.message : "Trích xuất thất bại",
      });
    } finally {
      setLoading(false);
      setShowCrawlStatus(false);
    }
  };

  const handleScrapeSelected = async () => {
    setScrapingSelectedLoading(true);
    setLoading(true);
    setElapsedTime(0);
    setCrawlStatus({ current: 0, total: selectedUrls.length });
    setShowCrawlStatus(true);
    setIsScraping(true);

    try {
      const results: Record<string, ScrapeResult> = {};
      let completed = 0;

      for (const url of selectedUrls) {
        try {
          const response = await fetch(`${FIRECRAWL_API_URL}/v1/scrape`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              url: url,
              formats: ["markdown"],
            }),
          });

          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          results[url] = {
            success: true,
            data: {
              ...data.data,
              metadata: {
                ...data.data.metadata,
                title: data.data.metadata?.title || url,
              },
            },
          };
        } catch (error) {
          results[url] = {
            success: false,
            data: {
              metadata: {
                sourceURL: url,
                title: "Scrape Failed",
                description: "",
                language: "",
                pageStatusCode: 500,
                pageError:
                  error instanceof Error ? error.message : "Unknown error",
              },
              markdown: "",
              content: "",
              html: "",
              rawHtml: "",
              llm_extraction: {},
            },
          };
        }
        completed++;
        setCrawlStatus({ current: completed, total: selectedUrls.length });
      }

      setScrapeResults(results);
    } catch (error) {
      console.error("Error scraping selected URLs:", error);
    } finally {
      setScrapingSelectedLoading(false);
      setLoading(false);
      setShowCrawlStatus(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
  };

  const indexOfLastUrl = currentPage * urlsPerPage;
  const indexOfFirstUrl = indexOfLastUrl - urlsPerPage;
  const currentUrls = crawledUrls.slice(indexOfFirstUrl, indexOfLastUrl);

  return (
    <div className="flex flex-col items-center justify-center p-4 max-w-6xl mx-auto w-full">
      {/* Mode Selector Tabs */}
      <div className="flex bg-zinc-100 dark:bg-slate-900 p-1.5 rounded-xl mb-6 shadow-md w-full max-w-xl border border-zinc-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab("batch_tree")}
          className={`flex-1 flex items-center justify-center py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "batch_tree"
              ? "bg-emerald-600 text-white shadow-sm"
              : "text-zinc-600 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-white"
          }`}
        >
          <FolderTree className="w-4 h-4 mr-1.5" />
          Cây Tài Liệu (Batch Tree)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("extract")}
          className={`flex-1 flex items-center justify-center py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "extract"
              ? "bg-white text-orange-600 shadow-sm dark:bg-slate-800 dark:text-orange-400"
              : "text-zinc-600 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-white"
          }`}
        >
          <Sparkles className="w-4 h-4 mr-1.5 text-orange-500" />
          AI Extract (Đơn Trang)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("scrape")}
          className={`flex-1 flex items-center justify-center py-2.5 px-3 rounded-lg text-xs font-semibold transition-all ${
            activeTab === "scrape"
              ? "bg-white text-blue-600 shadow-sm dark:bg-slate-800 dark:text-blue-400"
              : "text-zinc-600 dark:text-slate-400 hover:text-zinc-900 dark:hover:text-white"
          }`}
        >
          <Globe className="w-4 h-4 mr-1.5 text-blue-500" />
          Scrape & Crawl
        </button>
      </div>

      {activeTab === "batch_tree" && (
        <div className="w-full">
          <BatchDocExtractor
            firecrawlApiUrl={FIRECRAWL_API_URL}
            apiKey={FIRECRAWL_API_KEY}
          />
        </div>
      )}

      {activeTab !== "batch_tree" && (
        <>
          <Card className="w-full shadow-lg border-zinc-200">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-xl font-bold flex items-center">
                {activeTab === "scrape" ? (
                  <>
                    <Globe className="w-5 h-5 mr-2 text-blue-600" />
                    Cào Dữ Liệu Web (Scrape & Map)
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 mr-2 text-orange-500" />
                    Trích Xuất Cấu Trúc AI (Structured Extraction)
                  </>
                )}
              </CardTitle>
            <span className="text-xs bg-orange-100 text-orange-800 px-2.5 py-1 rounded-full font-medium">
              Firecrawl v1 API
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            {activeTab === "scrape"
              ? "Chuyển đổi bất kỳ URL nào thành Markdown sạch hoặc quét toàn bộ cây liên kết."
              : "Sử dụng mô hình AI (LLM) để bóc tách chính xác thông tin bạn cần thành định dạng JSON chuẩn."}
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {activeTab === "scrape" ? (
            /* Scrape & Crawl Form */
            <form onSubmit={handleScrapeSubmit} className="space-y-4">
              <div className="flex space-x-2">
                <Input
                  type="url"
                  name="url"
                  placeholder="https://example.com"
                  value={formData.url}
                  onChange={handleScrapeChange}
                  required
                  className="flex-grow"
                />
                <Button
                  type="submit"
                  disabled={loading}
                  className="bg-orange-500 hover:bg-orange-600 text-white min-w-[100px]"
                >
                  {loading ? "Đang chạy..." : "Run"}
                </Button>
              </div>

              <Collapsible
                open={isCollapsibleOpen}
                onOpenChange={setIsCollapsibleOpen}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    className="p-0 text-xs text-zinc-500 hover:text-zinc-800 flex items-center"
                  >
                    Tùy chọn nâng cao (Advanced Options)
                    <ChevronDown
                      className={`ml-1 h-4 w-4 transition-transform ${
                        isCollapsibleOpen ? "rotate-180" : ""
                      }`}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3 pt-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="crawlSubPages"
                      name="crawlSubPages"
                      checked={formData.crawlSubPages}
                      onCheckedChange={(checked) =>
                        setFormData((prev) => ({
                          ...prev,
                          crawlSubPages: checked as boolean,
                        }))
                      }
                    />
                    <Label htmlFor="crawlSubPages" className="text-sm font-medium">
                      Crawl Sub-pages (Quét tất cả trang con)
                    </Label>
                  </div>

                  {formData.crawlSubPages && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                      <div>
                        <Label htmlFor="search" className="text-xs text-zinc-600">
                          Tìm kiếm trang cụ thể (Search keyword)
                        </Label>
                        <Input
                          id="search"
                          name="search"
                          placeholder="ví dụ: python sdk, pricing..."
                          value={formData.search}
                          onChange={handleScrapeChange}
                          className="mt-1 text-sm bg-white"
                        />
                      </div>
                      <div>
                        <Label htmlFor="limit" className="text-xs text-zinc-600">
                          Giới hạn số trang tối đa (Limit)
                        </Label>
                        <Input
                          id="limit"
                          name="limit"
                          type="number"
                          placeholder="10"
                          value={formData.limit}
                          onChange={handleScrapeChange}
                          className="mt-1 text-sm bg-white"
                        />
                      </div>
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            </form>
          ) : (
            /* AI Extract Form */
            <form onSubmit={handleExtractSubmit} className="space-y-4">
              <AIEngineSettings config={aiConfig} onChange={setAiConfig} />

              <div>
                <Label htmlFor="extractUrls" className="text-xs font-semibold text-zinc-700">
                  Địa chỉ URL cần trích xuất (Mỗi dòng 1 link hoặc ngăn cách bằng dấu phẩy):
                </Label>
                <Input
                  id="extractUrls"
                  name="urls"
                  placeholder="https://docs.frappe.io/education/student"
                  value={extractFormData.urls}
                  onChange={handleExtractChange}
                  required
                  className="mt-1 text-sm font-mono"
                />
              </div>

              <div>
                <PromptBankSelector
                  currentPrompt={extractFormData.prompt}
                  onSelectPrompt={(newPrompt) =>
                    setExtractFormData((prev) => ({
                      ...prev,
                      prompt: newPrompt,
                    }))
                  }
                />
                <Label htmlFor="extractPrompt" className="text-xs font-semibold text-zinc-700">
                  Câu lệnh chỉ đạo AI (Prompt):
                </Label>
                <textarea
                  id="extractPrompt"
                  name="prompt"
                  rows={3}
                  placeholder="Trích xuất tên sản phẩm, giá bán, mô tả, danh sách tính năng..."
                  value={extractFormData.prompt}
                  onChange={handleExtractChange}
                  required
                  className="w-full mt-1 p-2 text-sm border border-zinc-200 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white"
                />
              </div>

              <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200 space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="useSchema"
                    name="useSchema"
                    checked={extractFormData.useSchema}
                    onCheckedChange={(checked) =>
                      setExtractFormData((prev) => ({
                        ...prev,
                        useSchema: checked as boolean,
                      }))
                    }
                  />
                  <Label htmlFor="useSchema" className="text-xs font-medium cursor-pointer">
                    Quy định định dạng JSON Schema chặt chẽ (Custom Schema)
                  </Label>
                </div>

                {extractFormData.useSchema && (
                  <div>
                    <Label htmlFor="schema" className="text-[11px] text-zinc-500">
                      JSON Schema (Draft-07 / OpenAPI tương thích):
                    </Label>
                    <textarea
                      id="schema"
                      name="schema"
                      rows={6}
                      value={extractFormData.schema}
                      onChange={handleExtractChange}
                      className="w-full mt-1 p-2 font-mono text-xs border border-zinc-300 rounded bg-white text-zinc-800"
                    />
                  </div>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-semibold py-2 shadow"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {loading ? "AI đang phân tích..." : "Extract with AI"}
              </Button>
            </form>
          )}

          {/* Loading status bar */}
          {showCrawlStatus && (
            <div className="flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg text-xs text-orange-900 animate-pulse">
              <span>
                {isScraping
                  ? `Đang cào dữ liệu (${crawlStatus.current}/${crawlStatus.total || 1})...`
                  : activeTab === "extract"
                  ? "Đang gửi nội dung tới mô hình AI để trích xuất JSON..."
                  : `Đang quét cấu trúc trang...`}
              </span>
              <span className="font-mono font-semibold">{elapsedTime}s</span>
            </div>
          )}

          {/* Sub-pages URL selection list */}
          {crawledUrls.length > 0 && !isScraping && (
            <div className="mt-4 border-t border-zinc-200 pt-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-zinc-700">
                  Tìm thấy {crawledUrls.length} liên kết trang:
                </span>
                <span className="text-xs text-zinc-500">
                  Đã chọn: {selectedUrls.length}
                </span>
              </div>
              <ul className="space-y-1 max-h-48 overflow-y-auto bg-zinc-50 p-2 rounded border border-zinc-200">
                {currentUrls.map((url, index) => (
                  <li
                    key={index}
                    className="flex items-center space-x-2 text-xs py-1 hover:bg-zinc-100 rounded px-1"
                  >
                    <Checkbox
                      checked={selectedUrls.includes(url)}
                      onCheckedChange={() =>
                        setSelectedUrls((prev) =>
                          prev.includes(url)
                            ? prev.filter((u) => u !== url)
                            : [...prev, url]
                        )
                      }
                    />
                    <span className="truncate max-w-xl font-mono text-zinc-700">
                      {url}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-zinc-500">
                  Trang {currentPage} /{" "}
                  {Math.ceil(crawledUrls.length / urlsPerPage)}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage * urlsPerPage >= crawledUrls.length}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <Button
                className="w-full mt-3 bg-zinc-900 hover:bg-zinc-800 text-white"
                onClick={handleScrapeSelected}
                disabled={loading || scrapingSelectedLoading || selectedUrls.length === 0}
              >
                {scrapingSelectedLoading
                  ? `Đang cào... (${crawlStatus.current}/${crawlStatus.total || selectedUrls.length})`
                  : `Cào nội dung ${selectedUrls.length} trang đã chọn`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Structured Extraction Results Display */}
      {extractResult && (
        <div className="mt-8 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 flex items-center">
                <Sparkles className="w-5 h-5 mr-1.5 text-orange-500" />
                Kết quả trích xuất AI (Structured Extraction Result)
              </h2>
              <p className="text-xs text-zinc-500">
                Dữ liệu JSON có cấu trúc được bóc tách bởi mô hình AI.
              </p>
            </div>

            {/* Export Toolbar for Extract */}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-zinc-300 hover:bg-zinc-100"
                onClick={() =>
                  handleCopy(
                    JSON.stringify(extractResult, null, 2),
                    "extract-all"
                  )
                }
              >
                {copiedId === "extract-all" ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1 text-green-600" />
                    Đã chép!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    Copy JSON
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-zinc-300 hover:bg-zinc-100"
                onClick={() => {
                  const md = formatExtractToMarkdown(extractResult, {
                    sourceUrl: extractFormData.urls,
                  });
                  handleCopy(md, "extract-md");
                }}
              >
                {copiedId === "extract-md" ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1 text-green-600" />
                    Đã chép MD!
                  </>
                ) : (
                  <>
                    <FileText className="w-3.5 h-3.5 mr-1 text-blue-500" />
                    Copy MD
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-zinc-300 hover:bg-zinc-100"
                onClick={handleDownloadExtractJSON}
              >
                <Code className="w-3.5 h-3.5 mr-1 text-amber-500" />
                Tải JSON
              </Button>
              <Button
                variant="default"
                size="sm"
                className="text-xs bg-orange-600 hover:bg-orange-700 text-white shadow-sm"
                onClick={handleDownloadExtractMarkdown}
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                Tải Markdown (.md)
              </Button>
            </div>
          </div>

          <Card className="p-4 bg-zinc-900 text-zinc-100 border-zinc-800 rounded-xl overflow-hidden shadow-md">
            <pre className="text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-96 text-emerald-400">
              {JSON.stringify(extractResult, null, 2)}
            </pre>
          </Card>
        </div>
      )}

      {/* Scrape Results Display & Export Tools */}
      {Object.keys(scrapeResults).length > 0 && (
        <div className="mt-8 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 flex items-center">
                <FileText className="w-5 h-5 mr-1.5 text-blue-600" />
                Kết quả cào ({Object.keys(scrapeResults).length} trang)
              </h2>
              <p className="text-xs text-zinc-500">
                Văn bản Markdown sạch và metadata sẵn sàng để tải về hoặc đưa vào AI.
              </p>
            </div>

            {/* Export Toolbar for Scrape */}
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-zinc-300 hover:bg-zinc-100"
                onClick={() => {
                  const allMd = Object.entries(scrapeResults)
                    .map(([u, r]) => `## ${u}\n\n${r.data?.markdown || ""}`)
                    .join("\n\n");
                  handleCopy(allMd, "scrape-all-md");
                }}
              >
                {copiedId === "scrape-all-md" ? (
                  <>
                    <Check className="w-3.5 h-3.5 mr-1 text-green-600" />
                    Đã chép!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 mr-1" />
                    Copy All
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs border-zinc-300 hover:bg-zinc-100"
                onClick={handleDownloadAllJSON}
              >
                <Code className="w-3.5 h-3.5 mr-1" />
                Tải JSON
              </Button>
              <Button
                variant="default"
                size="sm"
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleDownloadAllMarkdown}
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                Tải Markdown (.md)
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-4 mt-2 w-full">
            {Object.entries(scrapeResults).map(([url, result], idx) => (
              <Card key={url} className="p-4 border-zinc-200 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <CardTitle className="text-sm font-semibold text-zinc-800">
                      {result.data?.metadata?.title || url}
                    </CardTitle>
                    <span className="text-xs text-blue-600 font-mono block truncate max-w-lg">
                      {url}
                    </span>
                  </div>

                  {/* Individual Card Action Buttons */}
                  <div className="flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-zinc-600"
                      onClick={() =>
                        handleCopy(result.data?.markdown || "", `card-${idx}`)
                      }
                      title="Sao chép Markdown"
                    >
                      {copiedId === `card-${idx}` ? (
                        <Check className="w-3.5 h-3.5 text-green-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs text-zinc-600"
                      onClick={() =>
                        handleDownload(
                          `${(result.data?.metadata?.title || "page")
                            .toLowerCase()
                            .replace(/[^a-z0-9]/g, "-")}.md`,
                          result.data?.markdown || "",
                          "text/markdown;charset=utf-8"
                        )
                      }
                      title="Tải Markdown trang này"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                <CardContent className="px-0 pt-1 pb-0">
                  <div className="overflow-y-auto max-h-48 bg-zinc-50 border border-zinc-100 rounded-md p-3">
                    {result.success ? (
                      <pre className="text-xs whitespace-pre-wrap font-sans text-zinc-700">
                        {result.data.markdown.trim() ||
                          "(Trang chưa cào nội dung markdown, vui lòng bấm 'Cào nội dung trang đã chọn')"}
                      </pre>
                    ) : (
                      <p className="text-xs text-red-500">
                        Không thể cào nội dung URL này. (
                        {result.data?.metadata?.pageError || "Lỗi"})
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
