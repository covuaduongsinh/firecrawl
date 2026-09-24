export interface PromptItem {
  id: string;
  title: string;
  prompt: string;
  isBuiltin?: boolean;
}

export const BUILTIN_PROMPTS: PromptItem[] = [
  {
    id: "summary-keypoints",
    title: "📝 Tóm tắt & Ý chính",
    prompt: "Trích xuất thông tin tóm tắt và các ý chính của trang web này.",
    isBuiltin: true,
  },
  {
    id: "translate-keep-terms",
    title: "🌐 Dịch tiếng Việt (Giữ thuật ngữ & Bản gốc)",
    prompt:
      "Dịch sang tiếng việt. nhưng giữ nguyên các thuật ngữ, nút bấm, tên riêng của từng chức năng ... nhé. vẫn lưu lại bản gốc nhé.",
    isBuiltin: true,
  },
  {
    id: "product-pricing",
    title: "💰 Sản phẩm & Bảng giá",
    prompt:
      "Trích xuất tên sản phẩm, danh sách tính năng chính, bảng giá các gói dịch vụ, thông số kỹ thuật và điều khoản mua hàng.",
    isBuiltin: true,
  },
  {
    id: "article-metadata",
    title: "📰 Bài viết & Tác giả / Ngày đăng",
    prompt:
      "Trích xuất tiêu đề bài viết, tên tác giả, ngày xuất bản, chuyên mục, đoạn tóm tắt và toàn bộ nội dung chi tiết.",
    isBuiltin: true,
  },
  {
    id: "faq-qa",
    title: "❓ Hỏi đáp FAQ & Hướng dẫn",
    prompt:
      "Trích xuất tất cả các cặp câu hỏi và câu trả lời (FAQ), hoặc các bước hướng dẫn từng bước từ trang web này.",
    isBuiltin: true,
  },
];

const STORAGE_KEY = "firecrawl_user_prompt_bank";

export function loadPromptBank(): PromptItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const userPrompts: PromptItem[] = JSON.parse(saved);
      // Kết hợp Builtin và Custom của người dùng (tránh trùng id)
      const customOnes = userPrompts.filter((p) => !p.isBuiltin);
      return [...BUILTIN_PROMPTS, ...customOnes];
    }
  } catch (e) {
    console.error("Lỗi đọc ngân hàng câu lệnh:", e);
  }
  return BUILTIN_PROMPTS;
}

export function saveUserPrompts(prompts: PromptItem[]): void {
  try {
    const customOnes = prompts.filter((p) => !p.isBuiltin);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(customOnes));
  } catch (e) {
    console.error("Lỗi lưu ngân hàng câu lệnh:", e);
  }
}
