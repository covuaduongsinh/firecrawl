import { useState, useMemo } from 'react';
import { DocCategory, DocItem } from '@/lib/docTreeScanner';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Folder,
  FolderOpen,
  FileText,
  Search,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  FileArchive,
  BookOpen,
  ExternalLink,
} from 'lucide-react';

interface DocTreeViewProps {
  categories: DocCategory[];
  onCategoriesChange: (categories: DocCategory[]) => void;
  activeItemId?: string;
  onSelectItem?: (item: DocItem) => void;
  isProcessing?: boolean;
  onExportCategoryZip?: (category: DocCategory, catIndex: number) => void;
  onExportCategoryMd?: (category: DocCategory, catIndex: number) => void;
  downloadedCategorySlugs?: Set<string>;
}

export default function DocTreeView({
  categories,
  onCategoriesChange,
  activeItemId,
  onSelectItem,
  isProcessing = false,
  onExportCategoryZip,
  onExportCategoryMd,
  downloadedCategorySlugs,
}: DocTreeViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});

  // Stats
  const totalItems = useMemo(() => {
    return categories.reduce((acc, cat) => acc + cat.items.length, 0);
  }, [categories]);

  const selectedCount = useMemo(() => {
    return categories.reduce(
      (acc, cat) => acc + cat.items.filter((i) => i.selected).length,
      0
    );
  }, [categories]);

  const completedCount = useMemo(() => {
    return categories.reduce(
      (acc, cat) =>
        acc +
        cat.items.filter((i) => i.status === 'done' || (i.markdownOutput && i.markdownOutput.length > 0))
          .length,
      0
    );
  }, [categories]);

  // Toggle Collapse
  const toggleCollapse = (catSlug: string) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [catSlug]: !prev[catSlug],
    }));
  };

  // Toggle All Selection
  const setAllSelected = (selected: boolean) => {
    const updated = categories.map((cat) => ({
      ...cat,
      selected,
      items: cat.items.map((item) => ({ ...item, selected })),
    }));
    onCategoriesChange(updated);
  };

  // Toggle Category Selection
  const toggleCategory = (catSlug: string, selected: boolean) => {
    const updated = categories.map((cat) => {
      if (cat.slug === catSlug) {
        return {
          ...cat,
          selected,
          items: cat.items.map((i) => ({ ...i, selected })),
        };
      }
      return cat;
    });
    onCategoriesChange(updated);
  };

  // Toggle Single Item Selection
  const toggleItem = (catSlug: string, itemId: string, selected: boolean) => {
    const updated = categories.map((cat) => {
      if (cat.slug === catSlug) {
        const newItems = cat.items.map((i) =>
          i.id === itemId ? { ...i, selected } : i
        );
        const anySelected = newItems.some((i) => i.selected);
        return {
          ...cat,
          selected: anySelected,
          items: newItems,
        };
      }
      return cat;
    });
    onCategoriesChange(updated);
  };

  // Filter Categories & Items based on search
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const query = searchQuery.toLowerCase();

    return categories
      .map((cat) => {
        const matchedItems = cat.items.filter(
          (item) =>
            item.title.toLowerCase().includes(query) ||
            item.url.toLowerCase().includes(query) ||
            cat.name.toLowerCase().includes(query)
        );
        return {
          ...cat,
          items: matchedItems,
        };
      })
      .filter((cat) => cat.items.length > 0);
  }, [categories, searchQuery]);

  return (
    <div className="flex flex-col space-y-4">
      {/* Control Header & Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
        <div className="flex items-center space-x-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Tìm kiếm bài viết..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 bg-slate-950 border-slate-700 text-xs text-slate-200 placeholder:text-slate-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAllSelected(true)}
            disabled={isProcessing}
            className="h-9 text-xs border-slate-700 hover:bg-slate-800 text-slate-300"
          >
            <CheckSquare className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
            Chọn tất cả
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAllSelected(false)}
            disabled={isProcessing}
            className="h-9 text-xs border-slate-700 hover:bg-slate-800 text-slate-300"
          >
            <Square className="h-3.5 w-3.5 mr-1.5 text-slate-400" />
            Bỏ chọn
          </Button>
        </div>

        <div className="flex items-center space-x-3 text-xs font-medium">
          <span className="px-2.5 py-1 bg-slate-800 text-slate-300 rounded-lg border border-slate-700">
            Tổng: <strong className="text-white">{totalItems}</strong> bài
          </span>
          <span className="px-2.5 py-1 bg-emerald-950/60 text-emerald-300 rounded-lg border border-emerald-800/60">
            Đã chọn: <strong className="text-emerald-400">{selectedCount}</strong>
          </span>
          {completedCount > 0 && (
            <span className="px-2.5 py-1 bg-cyan-950/60 text-cyan-300 rounded-lg border border-cyan-800/60">
              Đã xong: <strong className="text-cyan-400">{completedCount}</strong>
            </span>
          )}
        </div>
      </div>

      {/* Category Tree List */}
      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
        {filteredCategories.length === 0 ? (
          <div className="text-center py-10 text-slate-500 text-sm">
            Không tìm thấy bài viết hoặc chuyên mục nào phù hợp.
          </div>
        ) : (
          filteredCategories.map((cat) => {
            const isCollapsed = !!collapsedCategories[cat.slug];
            const catSelectedCount = cat.items.filter((i) => i.selected).length;
            const isAllCatSelected = catSelectedCount === cat.items.length && cat.items.length > 0;
            const isSomeCatSelected = catSelectedCount > 0 && !isAllCatSelected;

            const catDoneCount = cat.items.filter(
              (i) => i.status === 'done' || (i.markdownOutput && i.markdownOutput.length > 0)
            ).length;
            const isAutoDownloaded = downloadedCategorySlugs?.has(cat.slug);
            const originalCatIndex = categories.findIndex((c) => c.slug === cat.slug) + 1;

            return (
              <div
                key={cat.slug}
                className="border border-slate-800 bg-slate-900/60 rounded-xl overflow-hidden shadow-sm"
              >
                {/* Category Header */}
                <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-850 hover:bg-slate-800/80 transition-colors border-b border-slate-800">
                  <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleCollapse(cat.slug)}
                      className="p-1 hover:bg-slate-700 rounded text-slate-400 hover:text-slate-200 transition flex-shrink-0"
                    >
                      {isCollapsed ? (
                        <ChevronRight className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>

                    <Checkbox
                      checked={isAllCatSelected ? true : isSomeCatSelected ? 'indeterminate' : false}
                      onCheckedChange={(checked) =>
                        toggleCategory(cat.slug, checked === true)
                      }
                      disabled={isProcessing}
                      className="border-slate-600 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600 flex-shrink-0"
                    />

                    <div
                      className="flex items-center space-x-2 cursor-pointer select-none truncate flex-1"
                      onClick={() => toggleCollapse(cat.slug)}
                    >
                      {isCollapsed ? (
                        <Folder className="h-4 w-4 text-amber-400 flex-shrink-0" />
                      ) : (
                        <FolderOpen className="h-4 w-4 text-amber-400 flex-shrink-0" />
                      )}
                      <span className="font-semibold text-slate-200 text-sm truncate">
                        {cat.name}
                      </span>
                      <span className="text-xs text-slate-500 font-normal flex-shrink-0">
                        ({catSelectedCount}/{cat.items.length})
                      </span>
                    </div>
                  </div>

                  {/* Category Right Status & Quick Download Actions */}
                  <div className="flex items-center space-x-2 flex-shrink-0 ml-2">
                    {catDoneCount > 0 && (
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center space-x-1 ${
                          catDoneCount === cat.items.length
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/80'
                            : 'bg-cyan-950/70 text-cyan-300 border border-cyan-800/70'
                        }`}
                      >
                        <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-400" />
                        <span>{catDoneCount}/{cat.items.length} bài</span>
                      </span>
                    )}

                    {isAutoDownloaded && (
                      <span
                        className="text-[10px] bg-amber-950/70 text-amber-300 border border-amber-700/80 px-2 py-0.5 rounded-full font-medium flex items-center"
                        title="Chuyên mục này đã được tự động tải về máy khi hoàn thành"
                      >
                        ✓ Đã tự động tải
                      </span>
                    )}

                    {/* Quick Manual Download Buttons for Category */}
                    {catDoneCount > 0 && (
                      <div className="flex items-center space-x-1 pl-1 border-l border-slate-700">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onExportCategoryZip?.(cat, originalCatIndex);
                          }}
                          className="h-7 px-2 text-[11px] bg-slate-800 hover:bg-emerald-950/80 hover:text-emerald-300 text-slate-300 border border-slate-700"
                          title={`Tải file ZIP cho riêng chuyên mục "${cat.name}" (${catDoneCount} bài đã dịch)`}
                        >
                          <FileArchive className="h-3.5 w-3.5 mr-1 text-amber-400" />
                          Tải ZIP
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onExportCategoryMd?.(cat, originalCatIndex);
                          }}
                          className="h-7 px-2 text-[11px] bg-slate-800 hover:bg-cyan-950/80 hover:text-cyan-300 text-slate-300 border border-slate-700"
                          title={`Tải file Markdown gộp cho riêng chuyên mục "${cat.name}"`}
                        >
                          <BookOpen className="h-3.5 w-3.5 mr-1 text-cyan-400" />
                          Tải MD
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Items in Category */}
                {!isCollapsed && (
                  <div className="p-2 space-y-1 bg-slate-950/40">
                    {cat.items.map((item) => {
                      const isActive = activeItemId === item.id;
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center justify-between p-2 rounded-lg transition-all text-xs group ${
                            isActive
                              ? 'bg-emerald-950/40 border border-emerald-700/60'
                              : 'hover:bg-slate-800/60 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center space-x-2.5 flex-1 min-w-0">
                            <Checkbox
                              checked={item.selected}
                              onCheckedChange={(checked) =>
                                toggleItem(cat.slug, item.id, checked === true)
                              }
                              disabled={isProcessing}
                              className="border-slate-700 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                            />
                            <FileText className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                            <div
                              className="cursor-pointer truncate flex-1"
                              onClick={() => onSelectItem && onSelectItem(item)}
                            >
                              <span
                                className={`font-medium ${
                                  item.selected
                                    ? 'text-slate-200'
                                    : 'text-slate-500 line-through'
                                }`}
                              >
                                {item.title}
                              </span>
                              <span className="text-[10px] text-slate-500 ml-2 truncate font-mono">
                                {item.slug}
                              </span>
                            </div>
                          </div>

                          {/* Status Badge & Actions */}
                          <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
                            {item.status === 'scraping' && (
                              <span className="flex items-center text-blue-400 text-[11px] bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800">
                                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                Cào web...
                              </span>
                            )}
                            {item.status === 'translating' && (
                              <span className="flex items-center text-purple-400 text-[11px] bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800">
                                <Sparkles className="h-3 w-3 mr-1 animate-spin" />
                                Đang dịch...
                              </span>
                            )}
                            {item.status === 'done' && (
                              <span className="flex items-center text-emerald-400 text-[11px] bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Đã xong
                              </span>
                            )}
                            {item.status === 'error' && (
                              <span
                                className="flex items-center text-rose-400 text-[11px] bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800 cursor-help"
                                title={item.error || 'Lỗi không xác định'}
                              >
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Lỗi
                              </span>
                            )}

                            <a
                              href={item.url}
                              target="_blank"
                              rel="noreferrer"
                              title="Mở link gốc"
                              className="p-1 text-slate-500 hover:text-slate-300 transition"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
