# Kế hoạch triển khai Giao diện Web (Web UI) cho Firecrawl

> **Mục tiêu:** Khởi chạy ứng dụng Web UI (`apps/ui/ingestion-ui`) kết nối trực tiếp đến backend Firecrawl API đang chạy trên `http://localhost:3002` để người dùng có thể nhập URL, cấu hình crawl/scrape và xem kết quả trực quan trên trình duyệt.

---

## 1. Thành phần giao diện (Ingestion UI)
- **Công nghệ:** React 18, TypeScript, Vite, TailwindCSS, Radix UI.
- **Tính năng giao diện:**
  - Nhập URL cần cào / crawl trực tiếp trên trình duyệt.
  - Tùy chọn Scrape đơn lẻ hoặc Crawl đệ quy với `maxDepth`, `limit`, `includePaths`, `excludePaths`.
  - Xem kết quả Markdown, HTML, Metadata, và xem trước tài liệu trực tiếp.
  - Hỗ trợ cả API V0 và V1 component.

---

## 2. Trạng thái vận hành
- **Backend API:** `http://localhost:3002` (Running)
- **Frontend Web UI:** `http://localhost:5173` (Running)
- **Cấu hình:** Đã liên kết API URL mặc định về `http://localhost:3002` cho môi trường local self-hosted.
