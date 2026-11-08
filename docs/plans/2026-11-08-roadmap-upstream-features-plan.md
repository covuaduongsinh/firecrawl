# Kế hoạch & Lộ trình Khai thác Tính năng mới từ Upstream Firecrawl

- **Ngày lập**: 2026-11-08
- **Tác giả**: Antigravity Assistant & Fork Maintainer
- **Mục tiêu**: Rà soát 435 commits mới được đồng bộ từ `upstream/main`, phân tích các tính năng cốt lõi chưa được tích hợp vào Web UI, và lên kế hoạch phát triển nâng cấp hệ thống thành một nền tảng trích xuất, nghiên cứu chuyên sâu (Deep Research) và đồng hành cùng AI Agent hoàn chỉnh.

---

## 1. Kết quả Rà soát Tính năng mới từ Upstream

Qua phân tích 435 commits mới nhất từ upstream Firecrawl, các khối tính năng công nghệ lớn sau đây đã được hoàn thiện tại tầng Core API (`apps/api`), nhưng **Web UI hiện tại (`apps/ui/ingestion-ui`) vẫn chưa khai thác**:

| # | Khối tính năng Upstream | Điểm mới cốt lõi | Giá trị gia tăng cho người dùng |
|---|---|---|---|
| **1** | **Search v1 & Fusion Engine** (`/v1/search`) | Hỗ trợ *Rewrite Tool Fusion* (`#5627`) và *Reciprocal Rank Fusion* (`#5595`). Tự động mở rộng từ khóa, tổng hợp kết quả đa nguồn và trích xuất Markdown sạch tức thì. | Tìm kiếm thông tin trên toàn cầu, lấy dữ liệu sạch không quảng cáo mà không cần biết trước URL đích. |
| **2** | **Deep Research Controller** (`/v1/deep-research`) | Thuật toán lặp nhiều bước: Tự động phân tích câu hỏi -> Tìm kiếm đa tầng -> Trích xuất trang -> Tổng hợp bài nghiên cứu hoàn chỉnh. | Tạo các báo cáo phân tích, nghiên cứu chuyên sâu (so sánh công nghệ, tổng hợp thị trường) xuất thẳng ra Obsidian Markdown. |
| **3** | **Tạo `llms.txt` Tự động** (`/v1/llmstxt`) | Chuẩn mở mới nhất (Answer.AI / Jeremy Howard) chuyển toàn bộ một trang web/tài liệu thành 1 tệp siêu nén tối ưu token cho AI. | Nạp toàn bộ tài liệu dự án lớn vào Claude Code, Cursor, Antigravity chỉ trong 1 file duy nhất. |
| **4** | **Bản đồ tên miền siêu tốc (`/v1/map`)** | Quét toàn bộ hàng nghìn URL của một website chỉ trong 1 - 2 giây thông qua sitemap và bộ đệm chỉ mục. | Hỗ trợ đắc lực cho cây tài liệu: nếu trang web không có menu bên (sidebar) thì `/v1/map` vẫn tìm ra 100% bài viết. |
| **5** | **Agent Skills & MCP Action Logs** (`skills/`, `/mcp-action-logs`) | Bộ kỹ năng agent chuẩn (`firecrawl-build`, `firecrawl-search`,...) và hỗ trợ giao thức MCP (Model Context Protocol). | Tích hợp Firecrawl trực tiếp vào các trợ lý code (Cursor, Windsurf, Claude Desktop, Antigravity). |
| **6** | **Health Probes & Liveness/Readiness** (`/health/liveness`, `/health/readiness`, `/v1/queue-status`) | Giám sát trạng thái hoạt động của API, hàng đợi RabbitMQ/Redis và Playwright 1.65.0. | Giúp người dùng theo dõi tài nguyên VPS, phát hiện nghẽn hàng đợi hoặc quá tải CPU trong các đợt cào hàng nghìn bài. |

---

## 2. Đề xuất Kiến trúc Giao diện Nâng cấp (Giai đoạn tiếp theo)

Thêm 2 tab chuyên dụng mới trên thanh điều hướng chính của Web UI:

```
[ Cây Tài Liệu (Batch Tree) ] [ 🔍 Tìm Kiếm & Deep Research (Mới) ] [ 📚 Tạo llms.txt (Mới) ] [ AI Extract ] [ Scrape & Crawl ]
```

---

## 3. Lộ trình Triển khai Phân kỳ (Phased Roadmap)

### 🚀 Giai đoạn 1: Ra mắt Tab "Tìm Kiếm Thông Minh & Deep Research" (Ưu tiên cao)
- **Mục tiêu**: Cho phép người dùng gõ bất kỳ câu hỏi/chủ đề nào để Firecrawl tự động tìm kiếm web, lọc bỏ rác và chuyển cho **Claude Max (5x)** hoặc **Google Antigravity** tổng hợp thành báo cáo nghiên cứu chi tiết.
- **Các thành phần cụ thể**:
  1. **Module Client (`searchClient.ts`)**:
     - Gọi endpoint `/v1/search` của Firecrawl backend.
     - Hỗ trợ các bộ lọc: số lượng kết quả (limit), bộ lọc quốc gia, ngôn ngữ, và lọc theo danh sách tên miền ưu tiên.
  2. **Giao diện Search & Research Studio (`SearchResearchStudio.tsx`)**:
     - Ô nhập từ khóa hoặc câu hỏi nghiên cứu (ví dụ: *"So sánh chi tiết tính năng giữa NocoBase và Directus kèm bảng so sánh"*).
     - Cho phép chọn chế độ:
       + **Tìm kiếm nhanh (Quick Search)**: Trả về danh sách bài viết kèm tóm tắt và Markdown sạch của từng trang.
       + **Nghiên cứu sâu (Deep Research)**: AI đọc toàn bộ nội dung các trang tìm được và sinh báo cáo tổng hợp nhiều mục có trích dẫn nguồn (Citations).
     - Tích hợp nút **"Lưu vào Obsidian"** hoặc xuất file `.md` hoàn chỉnh.

---

### 📄 Giai đoạn 2: Bộ Tạo `llms.txt` Tự động & Nâng cấp Quét Cây bằng `/v1/map`
- **Mục tiêu**: Biến bất kỳ website tài liệu nào thành định dạng chuẩn cho AI Agent và tăng tốc độ quét mục lục lên gấp 10 lần.
- **Các thành phần cụ thể**:
  1. **Tab Tạo `llms.txt` (`LLMsTxtGenerator.tsx`)**:
     - Nhập URL trang web (ví dụ `https://docs.nocobase.com`).
     - Gọi `/v1/llmstxt` để sinh 2 tệp:
       + `llms.txt`: Tóm tắt cấu trúc và danh mục liên kết quan trọng nhất.
       + `llms-full.txt`: Toàn bộ nội dung trang web đã được tối ưu cho ngữ cảnh AI.
     - Xem trước trực tiếp và tải về bằng 1 click.
  2. **Tăng cường `docTreeScanner.ts` với `/v1/map`**:
     - Khi người dùng nhập một trang tài liệu không có menu sidebar chuẩn HTML, hệ thống tự động kích hoạt chế độ **"Quét qua Sitemap/Map"**.
     - Tìm kiếm toàn bộ liên kết con trong 1-2 giây để người dùng chọn dịch hàng loạt.

---

### 🛠️ Giai đoạn 3: Thanh Giám sát Sức khỏe Hệ thống & Trạm Kỹ năng Agent (MCP Hub)
- **Mục tiêu**: Tối ưu trải nghiệm quản trị VPS và kết nối Firecrawl vào các IDE/Agent khác.
- **Các thành phần cụ thể**:
  1. **Thanh Header Diagnostics (`SystemHealthBadge.tsx`)**:
     - Hiển thị chấm trạng thái xanh góc trên bên phải:
       + `Core API`: 🟢 OK (ms latency)
       + `Playwright 1.65.0`: 🟢 Ready
       + `Redis Queue`: 🟢 0 jobs waiting
       + `AI Engine`: 🟢 Claude Max (1 Năm) / Antigravity
     - Bấm vào mở hộp thoại xem chi tiết trạng thái VPS mà không cần gõ lệnh SSH.
  2. **Trạm kết nối Agent (Skills / MCP Config Guide)**:
     - Tạo sẵn đoạn mã cấu hình `mcp.json` và lệnh CLI để người dùng có thể nhúng server Firecrawl trên VPS của mình vào Cursor hoặc Claude Desktop.

---

## 4. Kế hoạch Kiểm thử & Xác minh
- **Kiểm thử tự động**: Viết unit test cho `searchClient.test.ts` và `llmsTxtClient.test.ts` trong `apps/ui/ingestion-ui`.
- **Kiểm thử thực tế trên VPS**:
  - Gọi `/v1/search` từ backend xem kết quả tìm kiếm có hoạt động tốt trong mạng VPS không.
  - Test việc AI tổng hợp báo cáo bằng gói thuê bao Claude Max (1 năm) vừa kích hoạt.
- **Deploy**: Build bản frontend mới, đưa lên Nginx tại `/var/www/firecrawl-ui/`.

---

## 5. Câu hỏi xin ý kiến người dùng
1. Bạn có muốn bắt đầu triển khai **Giai đoạn 1: Tìm Kiếm Thông Minh & Deep Research** trước không?
2. Trong chế độ Nghiên cứu sâu (Deep Research), bạn có cần mẫu prompt chuyên biệt nào (ví dụ: Chuyên dịch tài liệu công nghệ, chuyên viết báo cáo kinh doanh, hay so sánh sản phẩm)?
