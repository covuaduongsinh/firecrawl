import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Sparkles,
  FolderTree,
  Play,
  Pause,
  RotateCcw,
  Square,
  Download,
  FileArchive,
  BookOpen,
  Copy,
  Check,
  Globe,
  Loader2,
  Code,
  FileText,
  AlertCircle,
  CheckCircle2,
  History,
} from 'lucide-react';
import DocTreeView from '@/components/DocTreeView';
import PromptBankSelector from '@/components/PromptBankSelector';
import AIEngineSettings from '@/components/AIEngineSettings';
import { DocCategory, DocItem, scanDocTree } from '@/lib/docTreeScanner';
import {
  exportToZip,
  exportToMergedMarkdown,
  exportToBatchJson,
  exportCategoryToZip,
  exportCategoryToMergedMarkdown,
  triggerBlobDownload,
  ExportFlavor,
  supportsDirectoryOutput,
  pickOutputDirectory,
  writeArticleToDirectory,
  writeIndexToDirectory,
} from '@/lib/batchExporter';
import { AIEngineConfig, loadAIConfig } from '@/lib/aiEngines';
import { processDocument } from '@/lib/documentProcessor';
import { useBatchRunner } from '@/hooks/useBatchRunner';
import { isAbortError, withRetry } from '@/lib/retry';
import { countDoneItems, loadSession, saveSession } from '@/lib/sessionStore';
import { scrapePageMarkdown } from '@/lib/pageScraper';

interface BatchDocExtractorProps {
  firecrawlApiUrl?: string;
  apiKey?: string;
}

function getDocTitleFromUrl(urlStr: string): string {
  try {
    const parsed = new URL(urlStr);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    if (pathParts.length > 0) {
      return pathParts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('-');
    }
    return parsed.hostname.replace(/[^a-zA-Z0-9]/g, '-');
  } catch {
    return 'Documentation';
  }
}

type AutoSaveMode = 'folder' | 'download' | 'off';

const LAST_URL_KEY = 'firecrawl_batch_last_url';
const DEFAULT_ROOT_URL = 'https://docs.frappe.io/education';

function loadLastRootUrl(): string {
  try {
    return localStorage.getItem(LAST_URL_KEY) || DEFAULT_ROOT_URL;
  } catch {
    return DEFAULT_ROOT_URL;
  }
}

function saveLastRootUrl(url: string) {
  try {
    localStorage.setItem(LAST_URL_KEY, url);
  } catch {
    // Chỉ là tiện ích, bỏ qua nếu trình duyệt chặn localStorage.
  }
}

const RETRY_OPTIONS = { retries: 3, baseDelayMs: 2000 };

export default function BatchDocExtractor({
  firecrawlApiUrl = 'http://localhost:3002',
  apiKey = '',
}: BatchDocExtractorProps) {
  // Input State
  const [rootUrl, setRootUrl] = useState<string>(loadLastRootUrl);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // Tree State
  const [categories, setCategories] = useState<DocCategory[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const activeItem = useMemo(() => {
    if (!activeItemId) return null;
    for (const cat of categories) {
      const found = cat.items.find((i) => i.id === activeItemId);
      if (found) return found;
    }
    return null;
  }, [categories, activeItemId]);

  // AI & Prompt State
  const [prompt, setPrompt] = useState<string>(
    'Dịch sang tiếng việt. nhưng giữ nguyên các thuật ngữ, nút bấm, tên riêng của từng chức năng ... nhé. vẫn lưu lại bản gốc nhé.'
  );
  const [aiConfig, setAiConfig] = useState<AIEngineConfig>(loadAIConfig);

  // Batch Runner State
  const runner = useBatchRunner();
  const { isRunning, isPaused, isStopping, progressText, setProgressText } = runner;
  const [skipDone, setSkipDone] = useState<boolean>(true);
  const [concurrency, setConcurrency] = useState<number>(1);

  // Auto-Save & Export State
  const [autoSaveMode, setAutoSaveMode] = useState<AutoSaveMode>(
    supportsDirectoryOutput() ? 'folder' : 'download'
  );
  const [autoDownloadFormat, setAutoDownloadFormat] = useState<'zip' | 'merged_md'>('zip');
  const [exportFlavor, setExportFlavor] = useState<ExportFlavor>('obsidian');
  const [outputDir, setOutputDir] = useState<FileSystemDirectoryHandle | null>(null);
  const [downloadedCategorySlugs, setDownloadedCategorySlugs] = useState<Set<string>>(new Set());
  const [savedSessionInfo, setSavedSessionInfo] = useState<{ count: number; date: string } | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  // Exporter & Copy States
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [activePreviewTab, setActivePreviewTab] = useState<'formatted_md' | 'json' | 'raw_md'>('formatted_md');

  // Refs read by the running batch (always current, unlike render-time closures)
  const categoriesRef = useRef<DocCategory[]>(categories);
  const downloadedCategorySlugsRef = useRef<Set<string>>(downloadedCategorySlugs);
  const rootUrlRef = useRef<string>(rootUrl);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    rootUrlRef.current = rootUrl;
  }, [rootUrl]);

  // ------------------------------------------
  // Lưu phiên (IndexedDB, không giới hạn 5MB như localStorage)
  // ------------------------------------------
  const writeSession = useCallback(async (cats: DocCategory[]) => {
    try {
      await saveSession(rootUrlRef.current, cats);
      setStorageError(null);
    } catch (err) {
      setStorageError(`Không lưu được tiến độ phiên: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const persistSession = useCallback(
    (cats: DocCategory[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void writeSession(cats);
      }, 400);
    },
    [writeSession]
  );

  const flushSession = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await writeSession(categoriesRef.current);
  }, [writeSession]);

  const replaceCategories = useCallback(
    (next: DocCategory[]) => {
      categoriesRef.current = next;
      setCategories(next);
      persistSession(next);
    },
    [persistSession]
  );

  const updateItem = useCallback(
    (id: string, updates: Partial<DocItem>) => {
      replaceCategories(
        categoriesRef.current.map((cat) => ({
          ...cat,
          items: cat.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
        }))
      );
    },
    [replaceCategories]
  );

  // Check saved session for the current URL
  useEffect(() => {
    let cancelled = false;
    if (!rootUrl.trim()) {
      setSavedSessionInfo(null);
      return;
    }
    loadSession(rootUrl)
      .then((session) => {
        if (cancelled) return;
        setSavedSessionInfo(
          session
            ? { count: countDoneItems(session.categories), date: new Date(session.timestamp).toLocaleString('vi-VN') }
            : null
        );
      })
      .catch(() => !cancelled && setSavedSessionInfo(null));
    return () => {
      cancelled = true;
    };
  }, [rootUrl]);

  // Restore saved session
  const handleRestoreSession = async () => {
    try {
      const session = await loadSession(rootUrl);
      if (!session) return;
      categoriesRef.current = session.categories;
      setCategories(session.categories);
      setActiveItemId(session.categories[0]?.items[0]?.id ?? null);
      setScanMessage(
        `Đã khôi phục thành công tiến độ phiên lưu lúc ${new Date(session.timestamp).toLocaleString('vi-VN')}!`
      );
    } catch (err) {
      alert('Không thể khôi phục tiến độ: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Handle Scan Doc Tree
  const handleScanTree = async () => {
    if (!rootUrl.trim()) return;
    setIsScanning(true);
    setScanMessage(null);

    try {
      const scannedCategories = await scanDocTree(rootUrl.trim(), firecrawlApiUrl, apiKey);
      saveLastRootUrl(rootUrl.trim());
      replaceCategories(scannedCategories);
      setDownloadedCategorySlugs(new Set());
      downloadedCategorySlugsRef.current = new Set();

      const totalItems = scannedCategories.reduce((acc, cat) => acc + cat.items.length, 0);
      setScanMessage(
        `Đã quét thành công ${scannedCategories.length} chuyên mục với ${totalItems} bài viết!`
      );
      setActiveItemId(scannedCategories[0]?.items[0]?.id ?? null);
    } catch (err) {
      setScanMessage(`Lỗi quét cây mục lục: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsScanning(false);
    }
  };

  // Choose output folder (e.g. inside the Obsidian vault)
  const chooseOutputDir = async (): Promise<FileSystemDirectoryHandle | null> => {
    try {
      const dir = await pickOutputDirectory();
      setOutputDir(dir);
      return dir;
    } catch (err) {
      if (!isAbortError(err)) {
        setStorageError(err instanceof Error ? err.message : String(err));
      }
      return null;
    }
  };

  // Process a single item: scrape → AI (chia phần, tự thử lại khi lỗi tạm thời) → lưu
  const processSingleItem = async (
    item: DocItem,
    signal: AbortSignal,
    dir: FileSystemDirectoryHandle | null
  ): Promise<boolean> => {
    const previous = { status: item.status, markdownOutput: item.markdownOutput };
    try {
      updateItem(item.id, { status: 'scraping', error: undefined });
      const rawMarkdown = await scrapePageMarkdown(item.url, firecrawlApiUrl, apiKey, signal);
      if (!rawMarkdown || rawMarkdown.length < 10) {
        throw new Error('Không nhận được nội dung markdown từ trang web.');
      }

      updateItem(item.id, { status: 'translating' });
      const result = await processDocument(rawMarkdown, {
        title: item.title,
        url: item.url,
        prompt,
        config: aiConfig,
        signal,
        onChunk: (index, total) => {
          if (total > 1) setProgressText(`Đang dịch "${item.title}" — phần ${index}/${total}`);
        },
        runStep: (step) =>
          withRetry(step, {
            ...RETRY_OPTIONS,
            signal,
            onRetry: (attempt, delayMs, err) =>
              setProgressText(
                `⏳ "${item.title}": thử lại lần ${attempt} sau ${Math.round(delayMs / 1000)}s (${
                  err instanceof Error ? err.message.slice(0, 80) : String(err)
                })`
              ),
          }),
      });

      updateItem(item.id, {
        status: 'done',
        extractedData: result.extractedData,
        markdownOutput: result.markdownOutput,
      });

      if (dir) {
        try {
          await writeArticleToDirectory(dir, categoriesRef.current, item.id, exportFlavor);
        } catch (err) {
          setStorageError(`Không ghi được file vào thư mục: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return true;
    } catch (err) {
      if (signal.aborted || isAbortError(err)) {
        // Dừng giữa chừng: trả bài về trạng thái trước đó, không đánh dấu lỗi.
        updateItem(item.id, { status: previous.markdownOutput ? 'done' : 'idle', error: undefined });
        return false;
      }
      updateItem(item.id, {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      });
      return false;
    }
  };

  // Tải về chuyên mục khi mọi bài đã chọn trong chuyên mục đã xử lý xong (chế độ "download")
  const maybeDownloadCategory = async (catSlug: string) => {
    const currentCat = categoriesRef.current.find((c) => c.slug === catSlug);
    if (!currentCat || downloadedCategorySlugsRef.current.has(catSlug)) return;
    const selectedInCat = currentCat.items.filter((it) => it.selected);
    const isCatDone =
      selectedInCat.length > 0 &&
      selectedInCat.every((it) => it.status === 'done' || it.status === 'error');
    const hasDoneItem = selectedInCat.some((it) => it.status === 'done' || !!it.markdownOutput);
    if (!isCatDone || !hasDoneItem) return;

    downloadedCategorySlugsRef.current.add(catSlug);
    setDownloadedCategorySlugs(new Set(downloadedCategorySlugsRef.current));
    const catIndex = categoriesRef.current.findIndex((c) => c.slug === catSlug) + 1;
    const docName = getDocTitleFromUrl(rootUrlRef.current);
    try {
      if (autoDownloadFormat === 'zip') {
        await exportCategoryToZip(currentCat, catIndex, docName, exportFlavor);
      } else {
        exportCategoryToMergedMarkdown(currentCat, catIndex, docName, exportFlavor);
      }
      setProgressText(`✓ Đã tự động tải về chuyên mục: "${currentCat.name}"`);
    } catch (dlErr) {
      console.error('Lỗi khi tự động tải file chuyên mục:', dlErr);
    }
  };

  // Chạy một danh sách bài (dùng chung cho "Bắt đầu" và "Dịch lại bài đang xem")
  const runItems = async (queue: { catSlug: string; item: DocItem }[]) => {
    if (isRunning || queue.length === 0) return;

    // Hỏi thư mục trước tiên, khi vẫn còn "user gesture" của cú bấm nút.
    let dir: FileSystemDirectoryHandle | null = null;
    if (autoSaveMode === 'folder') {
      dir = outputDir ?? (await chooseOutputDir());
      if (!dir) return;
    }

    await runner.run(queue, {
      concurrency,
      worker: async ({ item, catSlug }, index, signal) => {
        setProgressText(`Đang xử lý (${index + 1}/${queue.length}): ${item.category} -> ${item.title}`);
        if (concurrency === 1) setActiveItemId(item.id);
        const ok = await processSingleItem(item, signal, dir);
        if (!signal.aborted && autoSaveMode === 'download') await maybeDownloadCategory(catSlug);
        return ok;
      },
      onFinish: async () => {
        await flushSession();
        if (!dir) return;
        try {
          await writeIndexToDirectory(dir, categoriesRef.current, getDocTitleFromUrl(rootUrlRef.current));
        } catch (err) {
          setStorageError(`Không ghi được mục lục README.md: ${err instanceof Error ? err.message : String(err)}`);
        }
      },
    });
  };

  // Batch Runner
  const handleStartBatch = async () => {
    const selected: { catSlug: string; item: DocItem }[] = [];
    for (const cat of categoriesRef.current) {
      for (const item of cat.items) {
        if (item.selected) selected.push({ catSlug: cat.slug, item });
      }
    }
    if (selected.length === 0) {
      alert('Vui lòng chọn ít nhất một bài viết để xử lý.');
      return;
    }
    const queue = skipDone
      ? selected.filter(({ item }) => !(item.status === 'done' && item.markdownOutput))
      : selected;
    if (queue.length === 0) {
      alert('Tất cả bài đã chọn đều đã dịch xong. Bỏ chọn "Bỏ qua bài đã dịch" nếu muốn dịch lại.');
      return;
    }
    await runItems(queue);
  };

  // Re-run single active item
  const handleRerunActiveItem = async () => {
    if (!activeItem) return;
    const cat = categoriesRef.current.find((c) => c.items.some((i) => i.id === activeItem.id));
    if (cat) await runItems([{ catSlug: cat.slug, item: activeItem }]);
  };

  // Global Export Handlers
  const handleExportZip = async () => {
    setIsExportingZip(true);
    try {
      await exportToZip(categories, getDocTitleFromUrl(rootUrl), exportFlavor);
    } catch (err) {
      alert('Lỗi xuất file ZIP: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleExportMergedMd = () => {
    exportToMergedMarkdown(categories, getDocTitleFromUrl(rootUrl), exportFlavor);
  };

  const handleExportBatchJson = () => {
    exportToBatchJson(categories, getDocTitleFromUrl(rootUrl));
  };

  // Category Export Handlers (Manual triggers from DocTreeView)
  const handleExportCategoryZip = async (cat: DocCategory, catIndex: number) => {
    await exportCategoryToZip(cat, catIndex, getDocTitleFromUrl(rootUrl), exportFlavor);
    setDownloadedCategorySlugs((prev) => new Set(prev).add(cat.slug));
  };

  const handleExportCategoryMd = (cat: DocCategory, catIndex: number) => {
    exportCategoryToMergedMarkdown(cat, catIndex, getDocTitleFromUrl(rootUrl), exportFlavor);
    setDownloadedCategorySlugs((prev) => new Set(prev).add(cat.slug));
  };

  // Copy handler
  const handleCopyText = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  // Selected & Done Count
  const totalSelected = categories.reduce(
    (acc, cat) => acc + cat.items.filter((i) => i.selected).length,
    0
  );
  const totalDone = categories.reduce(
    (acc, cat) => acc + cat.items.filter((i) => i.selected && (i.status === 'done' || !!i.markdownOutput)).length,
    0
  );
  const totalPending = totalSelected - totalDone;
  const progressPercent = totalSelected > 0 ? Math.round((totalDone / totalSelected) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* 1. Header & Doc Tree Scanner Input */}
      <Card className="bg-slate-900 border-slate-800 shadow-xl">
        <CardHeader className="pb-3 border-b border-slate-800/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-lg shadow-md text-white">
                <FolderTree className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-white tracking-wide">
                  Documentation Tree Batch Crawler & AI Extractor
                </CardTitle>
                <p className="text-xs text-slate-400">
                  Tự động quét cây thư mục, cào nội dung & dịch thuật hàng loạt theo từng chuyên mục
                </p>
              </div>
            </div>

            {/* Global Export Buttons */}
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportZip}
                disabled={totalDone === 0 || isExportingZip}
                className="h-8 text-xs border-emerald-800/80 hover:bg-emerald-950/60 text-emerald-300 shadow-sm"
              >
                {isExportingZip ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <FileArchive className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
                )}
                Tải Trọn Bộ ZIP (.zip)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportMergedMd}
                disabled={totalDone === 0}
                className="h-8 text-xs border-cyan-800/80 hover:bg-cyan-950/60 text-cyan-300 shadow-sm"
              >
                <BookOpen className="h-3.5 w-3.5 mr-1.5 text-cyan-400" />
                Tải Sách Markdown (.md)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportBatchJson}
                disabled={totalDone === 0}
                className="h-8 text-xs border-slate-700 hover:bg-slate-800 text-slate-300"
              >
                <Code className="h-3.5 w-3.5 mr-1.5 text-amber-400" />
                JSON
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* URL Input & Scan Action */}
          <div className="flex flex-wrap md:flex-nowrap items-center gap-2.5">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
              <Input
                placeholder="Nhập đường dẫn trang tài liệu (VD: https://docs.frappe.io/education)..."
                value={rootUrl}
                onChange={(e) => setRootUrl(e.target.value)}
                disabled={isScanning || isRunning}
                className="pl-9 h-10 bg-slate-950 border-slate-700 text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {savedSessionInfo && (
              <Button
                variant="outline"
                onClick={handleRestoreSession}
                disabled={isScanning || isRunning}
                className="h-10 text-xs border-amber-800/80 bg-amber-950/30 text-amber-300 hover:bg-amber-950/70"
                title={`Khôi phục ${savedSessionInfo.count} bài đã dịch trước đó`}
              >
                <History className="h-4 w-4 mr-1.5 text-amber-400" />
                Khôi phục phiên trước ({savedSessionInfo.count} bài)
              </Button>
            )}

            <Button
              onClick={handleScanTree}
              disabled={isScanning || isRunning || !rootUrl.trim()}
              className="h-10 px-5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-medium shadow-md transition-all"
            >
              {isScanning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Đang quét cấu trúc...
                </>
              ) : (
                <>
                  <FolderTree className="h-4 w-4 mr-2" />
                  Quét Cây Mục Lục
                </>
              )}
            </Button>
          </div>

          {scanMessage && (
            <div className="text-xs text-emerald-400 bg-emerald-950/40 p-2.5 rounded-lg border border-emerald-800/60 flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>{scanMessage}</span>
            </div>
          )}

          {/* AI Settings & Prompt Bank */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-slate-800/60">
            <div>
              <Label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Ngân Hàng Câu Lệnh Prompt Dịch Thuật</span>
              </Label>
              <PromptBankSelector
                currentPrompt={prompt}
                onSelectPrompt={(newPrompt) => setPrompt(newPrompt)}
              />
              <div className="mt-2.5 space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Nội dung câu lệnh đang dùng (có thể chỉnh sửa trực tiếp):</span>
                  <span className="font-mono text-[10px] text-slate-500">{prompt.length} ký tự</span>
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={3}
                  placeholder="Nhập hoặc chỉnh sửa nội dung câu lệnh prompt..."
                  className="w-full p-2.5 text-xs bg-slate-950 border border-slate-700/80 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed font-sans"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center">
                <span>Cấu Hình AI Engine</span>
              </Label>
              <AIEngineSettings
                config={aiConfig}
                onChange={setAiConfig}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Batch Execution Control Bar */}
      {categories.length > 0 && (
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl shadow-lg space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-2">
              {!isRunning ? (
                <Button
                  onClick={handleStartBatch}
                  disabled={totalSelected === 0}
                  className="h-9 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md"
                >
                  <Play className="h-4 w-4 mr-1.5 fill-current" />
                  Bắt Đầu Dịch Hàng Loạt ({skipDone ? totalPending : totalSelected} bài)
                </Button>
              ) : (
                <>
                  <Button
                    onClick={runner.togglePause}
                    disabled={isStopping}
                    variant="outline"
                    className="h-9 px-3 text-xs border-amber-600 text-amber-400 hover:bg-amber-950/50"
                  >
                    {isPaused ? (
                      <>
                        <Play className="h-3.5 w-3.5 mr-1.5" />
                        Tiếp Tục
                      </>
                    ) : (
                      <>
                        <Pause className="h-3.5 w-3.5 mr-1.5" />
                        Tạm Dừng
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={runner.cancel}
                    disabled={isStopping}
                    variant="destructive"
                    className="h-9 px-3 text-xs"
                  >
                    {isStopping ? (
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Square className="h-3.5 w-3.5 mr-1.5 fill-current" />
                    )}
                    {isStopping ? 'Đang dừng...' : 'Dừng'}
                  </Button>
                </>
              )}

              {activeItem && !isRunning && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRerunActiveItem}
                  className="h-9 text-xs border-slate-700 hover:bg-slate-800 text-slate-300"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                  Dịch lại bài đang xem
                </Button>
              )}
            </div>

            <div className="flex items-center space-x-3 text-xs">
              <span className="text-slate-400 font-medium">Tiến độ:</span>
              <span className="text-emerald-400 font-bold">
                {totalDone} / {totalSelected} ({progressPercent}%)
              </span>
            </div>
          </div>

          {/* Run & Auto-Save Settings Strip */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 pb-1 border-t border-slate-800 text-xs text-slate-300">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="skip-done-check"
                  checked={skipDone}
                  disabled={isRunning}
                  onCheckedChange={(checked) => setSkipDone(checked === true)}
                  className="border-slate-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                />
                <label htmlFor="skip-done-check" className="cursor-pointer font-medium select-none text-slate-200">
                  Bỏ qua bài đã dịch
                  <span className="text-slate-400 text-[11px] ml-1">(tiết kiệm token khi chạy lại)</span>
                </label>
              </div>
              <label className="flex items-center space-x-2">
                <span className="text-slate-400 text-[11px]">Số bài chạy song song:</span>
                <select
                  value={concurrency}
                  disabled={isRunning}
                  onChange={(e) => setConcurrency(Number(e.target.value))}
                  title="Dùng CLI (claude/agy) nên để 1; API key có thể tăng lên 2–3"
                  className="bg-slate-950 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-emerald-500"
                >
                  <option value={1}>1 (an toàn)</option>
                  <option value={2}>2</option>
                  <option value={3}>3</option>
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:justify-end">
              <label className="flex items-center space-x-2">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-slate-400 text-[11px]">Lưu tự động:</span>
                <select
                  value={autoSaveMode}
                  disabled={isRunning}
                  onChange={(e) => setAutoSaveMode(e.target.value as AutoSaveMode)}
                  className="bg-slate-950 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-emerald-500 font-medium"
                >
                  {supportsDirectoryOutput() && (
                    <option value="folder">📂 Ghi thẳng vào thư mục (từng bài)</option>
                  )}
                  <option value="download">⬇️ Tải về theo chuyên mục</option>
                  <option value="off">Tắt</option>
                </select>
              </label>

              {autoSaveMode === 'folder' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isRunning}
                  onClick={() => void chooseOutputDir()}
                  className="h-7 text-xs border-slate-700 hover:bg-slate-800 text-slate-200"
                  title="Chọn thư mục đích, ví dụ một thư mục trong vault Obsidian"
                >
                  <FolderTree className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
                  {outputDir ? `Thư mục: ${outputDir.name}` : 'Chọn thư mục...'}
                </Button>
              )}

              {autoSaveMode === 'download' && (
                <select
                  value={autoDownloadFormat}
                  disabled={isRunning}
                  onChange={(e) => setAutoDownloadFormat(e.target.value as 'zip' | 'merged_md')}
                  className="bg-slate-950 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-emerald-500 font-medium"
                >
                  <option value="zip">📦 File ZIP (.zip)</option>
                  <option value="merged_md">📄 Gộp 1 File Markdown (.md)</option>
                </select>
              )}

              <label className="flex items-center space-x-2">
                <span className="text-slate-400 text-[11px]">Định dạng:</span>
                <select
                  value={exportFlavor}
                  onChange={(e) => setExportFlavor(e.target.value as ExportFlavor)}
                  className="bg-slate-950 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-emerald-500 font-medium"
                >
                  <option value="obsidian">Obsidian (frontmatter)</option>
                  <option value="standard">Markdown chuẩn</option>
                </select>
              </label>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
            <div
              className="bg-gradient-to-r from-emerald-500 to-teal-400 h-2.5 transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {progressText && (
            <p className="text-xs text-slate-400 truncate flex items-center space-x-1.5 font-mono">
              {isRunning && <Loader2 className="h-3 w-3 animate-spin text-emerald-400 flex-shrink-0" />}
              <span>{progressText}</span>
            </p>
          )}

          {storageError && (
            <div className="text-xs text-red-300 bg-red-950/40 p-2.5 rounded-lg border border-red-800/60 flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{storageError}</span>
            </div>
          )}
        </div>
      )}

      {/* 3. Split Layout: Tree on Left, Inspector & Preview on Right */}
      {categories.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Doc Tree View (5 columns) */}
          <div className="lg:col-span-5">
            <DocTreeView
              categories={categories}
              onCategoriesChange={replaceCategories}
              activeItemId={activeItem?.id}
              onSelectItem={(item) => setActiveItemId(item.id)}
              isProcessing={isRunning}
              onExportCategoryZip={handleExportCategoryZip}
              onExportCategoryMd={handleExportCategoryMd}
              downloadedCategorySlugs={downloadedCategorySlugs}
            />
          </div>

          {/* Right: Live Preview & Inspector (7 columns) */}
          <div className="lg:col-span-7">
            <Card className="bg-slate-900 border-slate-800 shadow-xl overflow-hidden sticky top-4">
              <CardHeader className="pb-3 border-b border-slate-800/80 bg-slate-850">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2">
                      <FileText className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                      <h3 className="text-sm font-bold text-white truncate">
                        {activeItem ? activeItem.title : 'Chọn bài viết để xem'}
                      </h3>
                    </div>
                    {activeItem && (
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {activeItem.category} &bull;{' '}
                        <a
                          href={activeItem.url}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-emerald-400 text-slate-500"
                        >
                          {activeItem.url}
                        </a>
                      </p>
                    )}
                  </div>

                  {/* Tabs */}
                  {activeItem && activeItem.markdownOutput && (
                    <div className="flex items-center space-x-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setActivePreviewTab('formatted_md')}
                        className={`px-2 py-1 text-xs rounded font-medium transition ${
                          activePreviewTab === 'formatted_md'
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Markdown Đẹp
                      </button>
                      <button
                        type="button"
                        onClick={() => setActivePreviewTab('json')}
                        className={`px-2 py-1 text-xs rounded font-medium transition ${
                          activePreviewTab === 'json'
                            ? 'bg-emerald-600 text-white'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        JSON
                      </button>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="p-4">
                {!activeItem ? (
                  <div className="text-center py-16 text-slate-500 text-sm">
                    Chọn một bài viết bên cây mục lục để xem trước nội dung.
                  </div>
                ) : activeItem.status === 'scraping' || activeItem.status === 'translating' ? (
                  <div className="flex flex-col items-center justify-center py-16 space-y-3">
                    <Loader2 className="h-8 w-8 text-emerald-400 animate-spin" />
                    <p className="text-xs text-slate-300 font-medium">
                      {activeItem.status === 'scraping'
                        ? 'Đang cào nội dung từ trang web...'
                        : 'AI Engine đang dịch thuật & định dạng...'}
                    </p>
                  </div>
                ) : activeItem.status === 'error' ? (
                  <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-xl space-y-2">
                    <div className="flex items-center space-x-2 text-rose-400 text-xs font-semibold">
                      <AlertCircle className="h-4 w-4" />
                      <span>Xảy ra lỗi khi xử lý bài viết này</span>
                    </div>
                    <p className="text-xs text-slate-300 font-mono bg-slate-950 p-2.5 rounded border border-slate-800">
                      {activeItem.error}
                    </p>
                    <Button
                      size="sm"
                      onClick={handleRerunActiveItem}
                      className="text-xs bg-rose-700 hover:bg-rose-600 text-white"
                    >
                      Thử lại ngay
                    </Button>
                  </div>
                ) : activeItem.markdownOutput ? (
                  <div className="space-y-4">
                    {/* Tool Actions for this single article */}
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/60 text-xs">
                      <span className="text-emerald-400 font-medium flex items-center">
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        Đã trích xuất & dịch xong
                      </span>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleCopyText(activeItem.markdownOutput!, 'single_md')
                          }
                          className="h-7 text-xs text-slate-300 hover:text-white"
                        >
                          {copiedType === 'single_md' ? (
                            <Check className="h-3 w-3 mr-1 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3 mr-1" />
                          )}
                          Copy MD
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const blob = new Blob([activeItem.markdownOutput!], {
                              type: 'text/markdown;charset=utf-8',
                            });
                            triggerBlobDownload(blob, `${activeItem.slug}.md`);
                          }}
                          className="h-7 text-xs text-slate-300 hover:text-white"
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Tải .md
                        </Button>
                      </div>
                    </div>

                    {/* Preview Content */}
                    <div className="max-h-[500px] overflow-y-auto pr-1">
                      {activePreviewTab === 'formatted_md' ? (
                        <pre className="text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800 select-text">
                          {activeItem.markdownOutput}
                        </pre>
                      ) : (
                        <pre className="text-xs text-emerald-300 whitespace-pre-wrap font-mono leading-relaxed bg-slate-950 p-4 rounded-xl border border-slate-800 select-text">
                          {JSON.stringify(activeItem.extractedData, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 text-slate-500 text-xs space-y-2">
                    <p>Bài viết chưa được trích xuất.</p>
                    <Button
                      size="sm"
                      onClick={handleRerunActiveItem}
                      className="text-xs bg-emerald-700 hover:bg-emerald-600 text-white"
                    >
                      Dịch bài này ngay
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
