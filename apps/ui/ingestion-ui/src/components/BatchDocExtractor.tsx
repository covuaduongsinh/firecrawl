import React, { useState, useRef, useEffect } from 'react';
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
  ExternalLink,
  Code,
  FileText,
  AlertCircle,
  CheckCircle2,
  History,
} from 'lucide-react';
import DocTreeView from '@/components/DocTreeView';
import PromptBankSelector from '@/components/PromptBankSelector';
import AIEngineSettings from '@/components/AIEngineSettings';
import { DocCategory, DocItem, scanDocTree, normalizeDocUrl } from '@/lib/docTreeScanner';
import {
  exportToZip,
  exportToMergedMarkdown,
  exportToBatchJson,
  exportCategoryToZip,
  exportCategoryToMergedMarkdown,
  triggerBlobDownload,
} from '@/lib/batchExporter';
import { AIEngineConfig, loadAIConfig, executeDirectAIExtract } from '@/lib/aiEngines';
import { formatExtractToMarkdown } from '@/lib/markdownFormatter';
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

export default function BatchDocExtractor({
  firecrawlApiUrl = 'http://localhost:3002',
  apiKey = '',
}: BatchDocExtractorProps) {
  // Input State
  const [rootUrl, setRootUrl] = useState<string>('https://docs.frappe.io/education');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  // Tree State
  const [categories, setCategories] = useState<DocCategory[]>([]);
  const [activeItem, setActiveItem] = useState<DocItem | null>(null);

  // AI & Prompt State
  const [prompt, setPrompt] = useState<string>(
    'Dịch sang tiếng việt. nhưng giữ nguyên các thuật ngữ, nút bấm, tên riêng của từng chức năng ... nhé. vẫn lưu lại bản gốc nhé.'
  );
  const [aiConfig, setAiConfig] = useState<AIEngineConfig>(loadAIConfig());

  // Batch Runner State
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [currentProcessingItem, setCurrentProcessingItem] = useState<DocItem | null>(null);
  const [progressText, setProgressText] = useState<string>('');

  // Auto-Download & Auto-Save State
  const [autoDownloadEnabled, setAutoDownloadEnabled] = useState<boolean>(true);
  const [autoDownloadFormat, setAutoDownloadFormat] = useState<'zip' | 'merged_md'>('zip');
  const [downloadedCategorySlugs, setDownloadedCategorySlugs] = useState<Set<string>>(new Set());
  const [savedSessionInfo, setSavedSessionInfo] = useState<{ count: number; date: string } | null>(null);

  // Exporter & Copy States
  const [isExportingZip, setIsExportingZip] = useState<boolean>(false);
  const [copiedType, setCopiedType] = useState<string | null>(null);
  const [activePreviewTab, setActivePreviewTab] = useState<'formatted_md' | 'json' | 'raw_md'>('formatted_md');

  // Cancel, Pause & Sync refs
  const isPausedRef = useRef<boolean>(false);
  const isCancelledRef = useRef<boolean>(false);
  const categoriesRef = useRef<DocCategory[]>(categories);
  const downloadedCategorySlugsRef = useRef<Set<string>>(downloadedCategorySlugs);
  const autoDownloadEnabledRef = useRef<boolean>(autoDownloadEnabled);
  const autoDownloadFormatRef = useRef<'zip' | 'merged_md'>(autoDownloadFormat);
  const rootUrlRef = useRef<string>(rootUrl);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  useEffect(() => {
    downloadedCategorySlugsRef.current = downloadedCategorySlugs;
  }, [downloadedCategorySlugs]);

  useEffect(() => {
    autoDownloadEnabledRef.current = autoDownloadEnabled;
  }, [autoDownloadEnabled]);

  useEffect(() => {
    autoDownloadFormatRef.current = autoDownloadFormat;
  }, [autoDownloadFormat]);

  useEffect(() => {
    rootUrlRef.current = rootUrl;
  }, [rootUrl]);

  // Sync active item when categories change
  useEffect(() => {
    if (activeItem) {
      for (const cat of categories) {
        const found = cat.items.find((i) => i.id === activeItem.id);
        if (found) {
          setActiveItem(found);
          break;
        }
      }
    }
  }, [categories]);

  // Check saved session in LocalStorage
  const getCacheKey = (url: string) => `firecrawl_batch_cache_${url.trim().replace(/[^a-zA-Z0-9]/g, '_')}`;

  useEffect(() => {
    if (!rootUrl.trim()) {
      setSavedSessionInfo(null);
      return;
    }
    try {
      const raw = localStorage.getItem(getCacheKey(rootUrl));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.categories) && parsed.categories.length > 0) {
          const done = parsed.categories.reduce(
            (acc: number, c: any) =>
              acc +
              (c.items?.filter(
                (i: any) => i.status === 'done' || (i.markdownOutput && i.markdownOutput.length > 0)
              ).length || 0),
            0
          );
          setSavedSessionInfo({
            count: done,
            date: new Date(parsed.timestamp).toLocaleString('vi-VN'),
          });
          return;
        }
      }
    } catch {}
    setSavedSessionInfo(null);
  }, [rootUrl]);

  // Save session to LocalStorage
  const saveSessionToStorage = (updatedCategories: DocCategory[]) => {
    try {
      if (!rootUrlRef.current.trim()) return;
      localStorage.setItem(
        getCacheKey(rootUrlRef.current),
        JSON.stringify({
          categories: updatedCategories,
          timestamp: new Date().toISOString(),
          url: rootUrlRef.current,
        })
      );
    } catch (e) {
      console.warn('LocalStorage save error or quota limit:', e);
    }
  };

  // Restore saved session
  const handleRestoreSession = () => {
    try {
      const raw = localStorage.getItem(getCacheKey(rootUrl));
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.categories) && parsed.categories.length > 0) {
        setCategories(parsed.categories);
        categoriesRef.current = parsed.categories;
        if (parsed.categories[0].items?.length > 0) {
          setActiveItem(parsed.categories[0].items[0]);
        }
        setScanMessage(
          `Đã khôi phục thành công tiến độ phiên lưu lúc ${new Date(parsed.timestamp).toLocaleString(
            'vi-VN'
          )}!`
        );
      }
    } catch (err: any) {
      alert('Không thể khôi phục tiến độ: ' + err.message);
    }
  };

  // Handle Scan Doc Tree
  const handleScanTree = async () => {
    if (!rootUrl.trim()) return;
    setIsScanning(true);
    setScanMessage(null);

    try {
      const scannedCategories = await scanDocTree(rootUrl.trim(), firecrawlApiUrl, apiKey);
      setCategories(scannedCategories);
      categoriesRef.current = scannedCategories;
      saveSessionToStorage(scannedCategories);

      const totalItems = scannedCategories.reduce((acc, cat) => acc + cat.items.length, 0);
      setScanMessage(
        `Đã quét thành công ${scannedCategories.length} chuyên mục với ${totalItems} bài viết!`
      );

      // Select first item by default
      if (scannedCategories.length > 0 && scannedCategories[0].items.length > 0) {
        setActiveItem(scannedCategories[0].items[0]);
      }
    } catch (err: any) {
      setScanMessage(`Lỗi quét cây mục lục: ${err.message || err}`);
    } finally {
      setIsScanning(false);
    }
  };

  // Process a single item
  const processSingleItem = async (
    item: DocItem,
    updateItemStatus: (id: string, updates: Partial<DocItem>) => void
  ): Promise<boolean> => {
    try {
      // 1. Scrape content via Universal Scraper (Proxy / Firecrawl / DOM)
      updateItemStatus(item.id, { status: 'scraping', error: undefined });

      const rawMarkdown = await scrapePageMarkdown(item.url, firecrawlApiUrl, apiKey);

      if (!rawMarkdown || rawMarkdown.length < 10) {
        throw new Error('Không nhận được nội dung markdown từ trang web.');
      }

      // 2. Direct AI Translation / Extraction
      updateItemStatus(item.id, { status: 'translating' });

      const aiResult = await executeDirectAIExtract(
        [{ url: item.url, markdown: rawMarkdown }],
        prompt,
        undefined,
        aiConfig
      );

      // 3. Format to beautiful Markdown
      const formattedMd = formatExtractToMarkdown(
        aiResult.extractedJson,
        {
          title: item.title,
          sourceUrl: item.url,
          engineUsed: aiResult.engineUsed,
          modelUsed: aiResult.modelUsed,
        }
      );

      updateItemStatus(item.id, {
        status: 'done',
        extractedData: aiResult.extractedJson,
        markdownOutput: formattedMd,
      });

      return true;
    } catch (err: any) {
      updateItemStatus(item.id, {
        status: 'error',
        error: err.message || String(err),
      });
      return false;
    }
  };

  // Batch Runner Loop
  const handleStartBatch = async () => {
    if (isRunning) return;

    // Get all selected items
    const selectedItems: { catSlug: string; item: DocItem }[] = [];
    for (const cat of categories) {
      for (const item of cat.items) {
        if (item.selected) {
          selectedItems.push({ catSlug: cat.slug, item });
        }
      }
    }

    if (selectedItems.length === 0) {
      alert('Vui lòng chọn ít nhất một bài viết để xử lý.');
      return;
    }

    setIsRunning(true);
    setIsPaused(false);
    isPausedRef.current = false;
    isCancelledRef.current = false;

    // Helper to update specific item and persist session
    const updateItem = (id: string, updates: Partial<DocItem>) => {
      setCategories((prev) => {
        const next = prev.map((cat) => ({
          ...cat,
          items: cat.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
        }));
        categoriesRef.current = next;
        saveSessionToStorage(next);
        return next;
      });
    };

    let processedCount = 0;
    const totalToProcess = selectedItems.length;

    for (let i = 0; i < selectedItems.length; i++) {
      if (isCancelledRef.current) {
        break;
      }

      // Check Pause state
      while (isPausedRef.current) {
        if (isCancelledRef.current) break;
        setProgressText(`Đang tạm dừng (${processedCount}/${totalToProcess})...`);
        await new Promise((r) => setTimeout(r, 500));
      }

      if (isCancelledRef.current) break;

      const { item, catSlug } = selectedItems[i];
      setCurrentProcessingItem(item);
      setProgressText(
        `Đang xử lý (${i + 1}/${totalToProcess}): ${item.category} -> ${item.title}`
      );

      // Auto select current processing item in preview
      setActiveItem(item);

      await processSingleItem(item, updateItem);
      processedCount++;

      // ==========================================
      // AUTO-DOWNLOAD BY CATEGORY TRIGGER
      // ==========================================
      const currentCat = categoriesRef.current.find((c) => c.slug === catSlug);
      if (
        currentCat &&
        autoDownloadEnabledRef.current &&
        !downloadedCategorySlugsRef.current.has(currentCat.slug)
      ) {
        const selectedInCat = currentCat.items.filter((it) => it.selected);
        const isCatDone =
          selectedInCat.length > 0 &&
          selectedInCat.every((it) => it.status === 'done' || it.status === 'error');
        const hasDoneItem = selectedInCat.some(
          (it) => it.status === 'done' || (it.markdownOutput && it.markdownOutput.length > 0)
        );

        if (isCatDone && hasDoneItem) {
          downloadedCategorySlugsRef.current.add(currentCat.slug);
          setDownloadedCategorySlugs(new Set(downloadedCategorySlugsRef.current));

          const originalCatIndex =
            categoriesRef.current.findIndex((c) => c.slug === currentCat.slug) + 1;
          const docName = getDocTitleFromUrl(rootUrlRef.current);

          try {
            if (autoDownloadFormatRef.current === 'zip') {
              await exportCategoryToZip(currentCat, originalCatIndex, docName);
            } else {
              exportCategoryToMergedMarkdown(currentCat, originalCatIndex, docName);
            }
            setProgressText(`✓ Đã tự động tải về chuyên mục: "${currentCat.name}"`);
          } catch (dlErr) {
            console.error('Lỗi khi tự động tải file chuyên mục:', dlErr);
          }
        }
      }
    }

    setIsRunning(false);
    setIsPaused(false);
    setCurrentProcessingItem(null);
    setProgressText(`Hoàn thành đợt xử lý (${processedCount}/${totalToProcess} bài)!`);
  };

  const handlePauseToggle = () => {
    setIsPaused((prev) => !prev);
  };

  const handleCancelBatch = () => {
    isCancelledRef.current = true;
    setIsRunning(false);
    setIsPaused(false);
    setCurrentProcessingItem(null);
    setProgressText('Đã dừng tiến trình dịch hàng loạt.');
  };

  // Re-run single active item
  const handleRerunActiveItem = async () => {
    if (!activeItem || isRunning) return;
    const updateItem = (id: string, updates: Partial<DocItem>) => {
      setCategories((prev) => {
        const next = prev.map((cat) => ({
          ...cat,
          items: cat.items.map((i) => (i.id === id ? { ...i, ...updates } : i)),
        }));
        categoriesRef.current = next;
        saveSessionToStorage(next);
        return next;
      });
    };
    await processSingleItem(activeItem, updateItem);
  };

  // Global Export Handlers
  const handleExportZip = async () => {
    setIsExportingZip(true);
    try {
      const docName = getDocTitleFromUrl(rootUrl);
      await exportToZip(categories, docName);
    } catch (err: any) {
      alert('Lỗi xuất file ZIP: ' + err.message);
    } finally {
      setIsExportingZip(false);
    }
  };

  const handleExportMergedMd = () => {
    const docName = getDocTitleFromUrl(rootUrl);
    exportToMergedMarkdown(categories, docName);
  };

  const handleExportBatchJson = () => {
    const docName = getDocTitleFromUrl(rootUrl);
    exportToBatchJson(categories, docName);
  };

  // Category Export Handlers (Manual triggers from DocTreeView)
  const handleExportCategoryZip = async (cat: DocCategory, catIndex: number) => {
    const docName = getDocTitleFromUrl(rootUrl);
    await exportCategoryToZip(cat, catIndex, docName);
    setDownloadedCategorySlugs((prev) => new Set(prev).add(cat.slug));
  };

  const handleExportCategoryMd = (cat: DocCategory, catIndex: number) => {
    const docName = getDocTitleFromUrl(rootUrl);
    exportCategoryToMergedMarkdown(cat, catIndex, docName);
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
    (acc, cat) =>
      acc +
      cat.items.filter((i) => i.status === 'done' || (i.markdownOutput && i.markdownOutput.length > 0))
        .length,
    0
  );
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
                onConfigChange={(newCfg) => setAiConfig(newCfg)}
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
                  Bắt Đầu Dịch Hàng Loạt ({totalSelected} bài)
                </Button>
              ) : (
                <>
                  <Button
                    onClick={handlePauseToggle}
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
                    onClick={handleCancelBatch}
                    variant="destructive"
                    className="h-9 px-3 text-xs"
                  >
                    <Square className="h-3.5 w-3.5 mr-1.5 fill-current" />
                    Dừng
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

          {/* Auto-Download Settings Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 pb-1 border-t border-slate-800 text-xs text-slate-300">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="auto-download-check"
                checked={autoDownloadEnabled}
                onCheckedChange={(checked) => setAutoDownloadEnabled(checked === true)}
                className="border-slate-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
              />
              <label
                htmlFor="auto-download-check"
                className="cursor-pointer font-medium flex items-center space-x-1.5 select-none text-slate-200"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>Tự động tải về ngay khi hoàn thành từng chuyên mục</span>
                <span className="text-slate-400 text-[11px] hidden sm:inline">
                  (An toàn tuyệt đối, tránh mất mát khi cào nhiều bài)
                </span>
              </label>
            </div>

            {autoDownloadEnabled && (
              <div className="flex items-center space-x-2">
                <span className="text-slate-400 text-[11px]">Định dạng tải tự động:</span>
                <select
                  value={autoDownloadFormat}
                  onChange={(e) => setAutoDownloadFormat(e.target.value as 'zip' | 'merged_md')}
                  className="bg-slate-950 border border-slate-700 text-slate-200 rounded px-2.5 py-1 text-xs focus:ring-1 focus:ring-emerald-500 font-medium"
                >
                  <option value="zip">📦 File ZIP (.zip)</option>
                  <option value="merged_md">📄 Gộp 1 File Markdown (.md)</option>
                </select>
              </div>
            )}
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
        </div>
      )}

      {/* 3. Split Layout: Tree on Left, Inspector & Preview on Right */}
      {categories.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Doc Tree View (5 columns) */}
          <div className="lg:col-span-5">
            <DocTreeView
              categories={categories}
              onCategoriesChange={setCategories}
              activeItemId={activeItem?.id}
              onSelectItem={(item) => setActiveItem(item)}
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
