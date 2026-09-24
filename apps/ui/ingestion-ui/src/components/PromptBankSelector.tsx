import React, { useState } from "react";
import {
  PromptItem,
  loadPromptBank,
  saveUserPrompts,
} from "@/lib/promptBank";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  BookmarkPlus,
  Trash2,
  BookOpen,
  Plus,
  ChevronDown,
} from "lucide-react";

interface PromptBankSelectorProps {
  currentPrompt: string;
  onSelectPrompt: (promptText: string) => void;
}

export default function PromptBankSelector({
  currentPrompt,
  onSelectPrompt,
}: PromptBankSelectorProps) {
  const [prompts, setPrompts] = useState<PromptItem[]>(loadPromptBank);
  const [isManaging, setIsManaging] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const handleSelect = (item: PromptItem) => {
    onSelectPrompt(item.prompt);
  };

  const handleSaveCurrentAsTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !currentPrompt.trim()) return;

    const newItem: PromptItem = {
      id: `custom-${Date.now()}`,
      title: `⭐ ${newTitle.trim()}`,
      prompt: currentPrompt.trim(),
      isBuiltin: false,
    };

    const updated = [...prompts, newItem];
    setPrompts(updated);
    saveUserPrompts(updated);
    setNewTitle("");
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    const updated = prompts.filter((p) => p.id !== id);
    setPrompts(updated);
    saveUserPrompts(updated);
  };

  return (
    <div className="space-y-2 mb-2">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 dark:text-slate-300">
          <BookOpen className="w-3.5 h-3.5 text-orange-400" />
          <span>Mẫu câu lệnh tạo sẵn (Prompt Bank):</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
            className="h-6 text-[11px] text-orange-400 hover:text-orange-300 hover:bg-orange-950/40 px-2 py-0 border border-orange-800/50 rounded"
          >
            <BookmarkPlus className="w-3 h-3 mr-1" />
            Lưu câu lệnh hiện tại
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsManaging(!isManaging)}
            className="h-6 text-[11px] text-slate-400 hover:text-slate-200 hover:bg-slate-800 px-2 py-0"
          >
            {isManaging ? "Xong" : "Quản lý"}
            <ChevronDown className="w-3 h-3 ml-1" />
          </Button>
        </div>
      </div>

      {/* Add Custom Prompt Form */}
      {showAddForm && (
        <form
          onSubmit={handleSaveCurrentAsTemplate}
          className="bg-slate-950 border border-orange-500/50 rounded-lg p-2 flex items-center gap-2 animate-in fade-in duration-150"
        >
          <Input
            placeholder="Đặt tên cho câu lệnh (ví dụ: Dịch chuyên sâu, Bóc tách tin tức...)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="h-7 text-xs bg-slate-900 border-slate-700 text-slate-200 placeholder:text-slate-500 flex-1"
            autoFocus
          />
          <Button
            type="submit"
            size="sm"
            disabled={!newTitle.trim() || !currentPrompt.trim()}
            className="h-7 text-xs bg-orange-600 hover:bg-orange-500 text-white"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Lưu
          </Button>
        </form>
      )}

      {/* Quick Click Badges / Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {prompts.map((item) => {
          const isSelected = currentPrompt.trim() === item.prompt.trim();
          return (
            <div
              key={item.id}
              className={`inline-flex items-center rounded-full text-xs transition-all border ${
                isSelected
                  ? "bg-orange-600 text-white border-orange-500 shadow-sm"
                  : "bg-slate-800/80 hover:bg-slate-750 text-slate-300 border-slate-700"
              }`}
            >
              <button
                type="button"
                onClick={() => handleSelect(item)}
                className="px-2.5 py-0.5 text-left font-medium text-[11px]"
                title={item.prompt}
              >
                {item.title}
              </button>

              {isManaging && !item.isBuiltin && (
                <button
                  type="button"
                  onClick={() => handleDelete(item.id)}
                  className="pr-2 pl-0.5 text-rose-400 hover:text-rose-300"
                  title="Xóa câu lệnh này"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
