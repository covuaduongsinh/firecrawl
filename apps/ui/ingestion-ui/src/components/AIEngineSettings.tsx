import { useState, useEffect } from "react";
import {
  AIEngineConfig,
  AIEngineType,
  saveAIConfig,
  testAIConnection,
  getLocalCliStatus,
} from "@/lib/aiEngines";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sparkles,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Settings2,
  Terminal,
  Check,
} from "lucide-react";

interface AIEngineSettingsProps {
  config: AIEngineConfig;
  onChange: (newConfig: AIEngineConfig) => void;
}

export default function AIEngineSettings({
  config,
  onChange,
}: AIEngineSettingsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs: number;
  } | null>(null);

  const [cliInfo, setCliInfo] = useState<{
    antigravity: { available: boolean; path: string | null };
    claude: { available: boolean; path: string | null };
  }>({
    antigravity: { available: false, path: null },
    claude: { available: false, path: null },
  });

  useEffect(() => {
    getLocalCliStatus().then((info) => {
      setCliInfo(info);
    });
  }, []);

  const handleEngineChange = (engine: AIEngineType) => {
    const updated = { ...config, engine };
    onChange(updated);
    saveAIConfig(updated);
    setTestResult(null);
  };

  const handleFieldChange = (key: keyof AIEngineConfig, val: string) => {
    const updated = { ...config, [key]: val };
    onChange(updated);
    saveAIConfig(updated);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testAIConnection(config);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({
        success: false,
        message: e?.message || "Lỗi kiểm tra kết nối",
        latencyMs: 0,
      });
    } finally {
      setTesting(false);
    }
  };

  // Helper hiển thị tên Model đang dùng
  const getActiveModelDisplay = () => {
    switch (config.engine) {
      case "gemini":
        const modelLabel = config.geminiModel === "default" || !config.geminiModel ? "Antigravity Auto" : config.geminiModel;
        if (config.geminiApiKey) {
          return `${modelLabel} (API Key)`;
        }
        return cliInfo.antigravity.available
          ? `${modelLabel} (Antigravity CLI)`
          : `${modelLabel} (Chưa có Key)`;
      case "claude":
        if (config.claudeApiKey) {
          return `${config.claudeModel || "claude-sonnet-5"} (API Key)`;
        }
        return cliInfo.claude.available
          ? `${config.claudeModel || "claude-sonnet-5"} (Claude CLI)`
          : `${config.claudeModel || "claude-sonnet-5"} (Chưa có Key)`;
      case "ollama":
        return `${config.ollamaModel || "llama3"} (Local: ${config.ollamaBaseUrl})`;
      case "openai":
        return `${config.openaiModel || "gpt-4o-mini"}`;
      case "firecrawl":
        return "Firecrawl Server Native";
      default:
        return "";
    }
  };

  return (
    <div className="bg-slate-900/90 border border-slate-700/80 rounded-xl p-4 shadow-md backdrop-blur-md space-y-3">
      {/* Header Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-indigo-400" />
          <span className="text-sm font-bold text-white">
            AI Engine điều phối:
          </span>
        </div>

        {/* Engine Pills */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-950 p-1 rounded-lg border border-slate-800">
          <button
            type="button"
            onClick={() => handleEngineChange("gemini")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              config.engine === "gemini"
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md ring-1 ring-blue-400/50"
                : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            Google Antigravity / Gemini
          </button>

          <button
            type="button"
            onClick={() => handleEngineChange("claude")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              config.engine === "claude"
                ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md ring-1 ring-purple-400/50"
                : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            }`}
          >
            <Terminal className="w-3.5 h-3.5 text-purple-300" />
            Claude Code
          </button>

          <button
            type="button"
            onClick={() => handleEngineChange("ollama")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              config.engine === "ollama"
                ? "bg-slate-700 text-white shadow-md ring-1 ring-slate-400/50"
                : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            }`}
          >
            🦙 Ollama Local
          </button>

          <button
            type="button"
            onClick={() => handleEngineChange("openai")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              config.engine === "openai"
                ? "bg-emerald-700 text-white shadow-md ring-1 ring-emerald-400/50"
                : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            }`}
          >
            🟢 OpenAI / DeepSeek
          </button>

          <button
            type="button"
            onClick={() => handleEngineChange("firecrawl")}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
              config.engine === "firecrawl"
                ? "bg-amber-600 text-white shadow-md ring-1 ring-amber-400/50"
                : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
            }`}
          >
            🌐 Firecrawl Backend
          </button>
        </div>

        {/* Toggle Settings Detail */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="border-slate-600 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs h-8"
        >
          <Settings2 className="w-3.5 h-3.5 mr-1.5 text-indigo-300" />
          {isOpen ? "Đóng cấu hình" : "Cấu hình Model & Key"}
        </Button>
      </div>

      {/* Active Model & Engine Banner */}
      <div className="text-xs flex flex-wrap items-center justify-between gap-2 border-t border-slate-700/80 pt-2.5 px-1 bg-slate-950/40 rounded-lg p-2">
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
          <span className="text-slate-300 font-medium">Đang sử dụng:</span>
          <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 text-indigo-200 border border-indigo-700 font-semibold flex items-center gap-1 text-[11px]">
            {config.engine === "gemini" && <Sparkles className="w-3 h-3 text-amber-400" />}
            {config.engine === "claude" && <Terminal className="w-3 h-3 text-purple-400" />}
            {getActiveModelDisplay()}
          </span>
        </div>

        {/* Mode & CLI Ready badge */}
        <div className="flex items-center gap-2">
          {config.engine === "gemini" && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded font-medium flex items-center gap-1 ${
                config.geminiApiKey
                  ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700/60"
                  : cliInfo.antigravity.available
                  ? "bg-blue-950/80 text-blue-300 border border-blue-700/60"
                  : "bg-amber-950/80 text-amber-300 border border-amber-700/60"
              }`}
            >
              {config.geminiApiKey ? (
                <>
                  <Check className="w-3 h-3" /> Gemini REST API Key
                </>
              ) : cliInfo.antigravity.available ? (
                <>
                  <Check className="w-3 h-3" /> Antigravity CLI Sẵn sàng
                </>
              ) : (
                "⚠️ Nhập API Key hoặc mở Antigravity"
              )}
            </span>
          )}

          {config.engine === "claude" && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded font-medium flex items-center gap-1 ${
                config.claudeApiKey
                  ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700/60"
                  : cliInfo.claude.available
                  ? "bg-purple-950/80 text-purple-300 border border-purple-700/60"
                  : "bg-amber-950/80 text-amber-300 border border-amber-700/60"
              }`}
            >
              {config.claudeApiKey ? (
                <>
                  <Check className="w-3 h-3" /> Claude API Key
                </>
              ) : cliInfo.claude.available ? (
                <>
                  <Check className="w-3 h-3" /> Claude Code CLI Sẵn sàng
                </>
              ) : (
                "⚠️ Nhập Anthropic Key hoặc cài Claude CLI"
              )}
            </span>
          )}

          {config.engine === "ollama" && (
            <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
              {config.ollamaBaseUrl}
            </span>
          )}

          {config.engine === "openai" && (
            <span
              className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                config.openaiApiKey
                  ? "bg-emerald-950/80 text-emerald-300 border border-emerald-700/60"
                  : "bg-amber-950/80 text-amber-300 border border-amber-700/60"
              }`}
            >
              {config.openaiApiKey ? "✅ API Key OK" : "⚠️ Cần nhập API Key"}
            </span>
          )}
        </div>
      </div>

      {/* Settings Form Drawer */}
      {isOpen && (
        <div className="bg-slate-950/90 border border-slate-700 rounded-lg p-4 mt-2 space-y-4 animate-in fade-in duration-200">
          {/* Detected CLI Status Banner */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs bg-slate-900 p-2.5 rounded-md border border-slate-800">
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  cliInfo.antigravity.available ? "bg-emerald-400" : "bg-zinc-600"
                }`}
              />
              <span className="text-slate-300">
                Antigravity CLI:{" "}
                <strong
                  className={
                    cliInfo.antigravity.available
                      ? "text-emerald-400"
                      : "text-slate-500"
                  }
                >
                  {cliInfo.antigravity.available ? "Đã phát hiện trên máy" : "Chưa tìm thấy"}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  cliInfo.claude.available ? "bg-emerald-400" : "bg-zinc-600"
                }`}
              />
              <span className="text-slate-300">
                Claude Code CLI:{" "}
                <strong
                  className={
                    cliInfo.claude.available
                      ? "text-purple-400"
                      : "text-slate-500"
                  }
                >
                  {cliInfo.claude.available ? "Đã phát hiện trên máy" : "Chưa tìm thấy"}
                </strong>
              </span>
            </div>
          </div>

          {config.engine === "gemini" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-200">
                    Google Gemini API Key (Tùy chọn nếu đã có Antigravity CLI):
                  </Label>
                  <Input
                    type="password"
                    placeholder="AIzaSy... (Để trống để dùng Antigravity CLI)"
                    value={config.geminiApiKey}
                    onChange={(e) => handleFieldChange("geminiApiKey", e.target.value)}
                    className="bg-slate-900 border-slate-700 text-xs mt-1 text-slate-200"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Nếu để trống, hệ thống sẽ tự động dùng phiên đăng nhập <strong>Google Antigravity CLI</strong> có sẵn trên máy tính của bạn.
                  </p>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-200">
                    Mô hình chỉ định (Model):
                  </Label>
                  <select
                    value={config.geminiModel}
                    onChange={(e) => handleFieldChange("geminiModel", e.target.value)}
                    className="w-full h-9 rounded-md bg-slate-900 border border-slate-700 text-slate-200 text-xs px-2.5 mt-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="default">⚡ Antigravity Auto (Mặc định tối ưu - Khuyên dùng)</option>
                    <option value="gemini-3.7-flash">Gemini 3.7 Flash (Nhanh & Tự nhiên)</option>
                    <option value="gemini-3.8-flash">Gemini 3.8 Flash (Tốc độ cao)</option>
                    <option value="gemini-3.6-flash">Gemini 3.6 Flash (Siêu tiết kiệm token)</option>
                    <option value="gemini-3.1-pro">Gemini 3.1 Pro (Chính xác cao / Logic sâu)</option>
                    <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (Thinking)</option>
                    <option value="claude-opus-4-6-thinking">Claude Opus 4.6 (Thinking)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {config.engine === "claude" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-200">
                    Anthropic Claude API Key (Tùy chọn nếu đã có Claude Code CLI):
                  </Label>
                  <Input
                    type="password"
                    placeholder="sk-ant-... (Để trống để dùng Claude CLI)"
                    value={config.claudeApiKey}
                    onChange={(e) => handleFieldChange("claudeApiKey", e.target.value)}
                    className="bg-slate-900 border-slate-700 text-xs mt-1 text-slate-200"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Nếu để trống, hệ thống sẽ tự động gọi phiên đăng nhập <strong>Claude Code CLI</strong> trên máy tính của bạn.
                  </p>
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-200">
                    Mô hình Claude:
                  </Label>
                  <select
                    value={config.claudeModel}
                    onChange={(e) => handleFieldChange("claudeModel", e.target.value)}
                    className="w-full h-9 rounded-md bg-slate-900 border border-slate-700 text-slate-200 text-xs px-2.5 mt-1 focus:outline-none focus:ring-1 focus:ring-purple-500"
                  >
                    <option value="claude-sonnet-5">Claude Sonnet 5 (Cân bằng — Khuyên dùng)</option>
                    <option value="claude-opus-5-5">Claude Opus 5.5 (Chính xác cao nhất)</option>
                    <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5 (Nhanh & tiết kiệm)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {config.engine === "ollama" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-200">Ollama Base URL:</Label>
                  <Input
                    type="text"
                    placeholder="http://localhost:11434"
                    value={config.ollamaBaseUrl}
                    onChange={(e) => handleFieldChange("ollamaBaseUrl", e.target.value)}
                    className="bg-slate-900 border-slate-700 text-xs mt-1 text-slate-200"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-200">Tên Model Ollama:</Label>
                  <Input
                    type="text"
                    placeholder="llama3, mistral, qwen2.5..."
                    value={config.ollamaModel}
                    onChange={(e) => handleFieldChange("ollamaModel", e.target.value)}
                    className="bg-slate-900 border-slate-700 text-xs mt-1 text-slate-200"
                  />
                </div>
              </div>
            </div>
          )}

          {config.engine === "openai" && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-200">API Key:</Label>
                  <Input
                    type="password"
                    placeholder="sk-..."
                    value={config.openaiApiKey}
                    onChange={(e) => handleFieldChange("openaiApiKey", e.target.value)}
                    className="bg-slate-900 border-slate-700 text-xs mt-1 text-slate-200"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-200">Base URL:</Label>
                  <Input
                    type="text"
                    placeholder="https://api.openai.com/v1"
                    value={config.openaiBaseUrl}
                    onChange={(e) => handleFieldChange("openaiBaseUrl", e.target.value)}
                    className="bg-slate-900 border-slate-700 text-xs mt-1 text-slate-200"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-200">Model Name:</Label>
                  <Input
                    type="text"
                    placeholder="gpt-4o-mini, deepseek-chat..."
                    value={config.openaiModel}
                    onChange={(e) => handleFieldChange("openaiModel", e.target.value)}
                    className="bg-slate-900 border-slate-700 text-xs mt-1 text-slate-200"
                  />
                </div>
              </div>
            </div>
          )}

          {config.engine === "firecrawl" && (
            <div className="text-xs text-slate-300 bg-slate-900 p-2.5 rounded border border-slate-800">
              💡 Chế độ này gửi trực tiếp request đến endpoint <code>/v1/extract</code> của backend Docker Firecrawl.
            </div>
          )}

          {/* Test connection row */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing}
              className="text-xs h-8 bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700"
            >
              {testing ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-blue-400" />
                  Đang kiểm tra...
                </>
              ) : (
                "Kiểm tra kết nối"
              )}
            </Button>

            {testResult && (
              <div
                className={`text-xs flex items-center gap-1.5 font-medium ${
                  testResult.success ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
