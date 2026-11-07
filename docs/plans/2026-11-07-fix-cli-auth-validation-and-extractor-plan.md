# Kế hoạch sửa lỗi: Khắc phục lỗi lấy dữ liệu "Not logged in · Please run /login" và chuẩn hóa AI Engine trên VPS

- **Ngày thực hiện:** 2026-11-07
- **Triệu chứng lỗi từ người dùng:**
  - Khi cào tài liệu từ `docs.nocobase.com/core/`, toàn bộ các bài viết kết quả chỉ có kích thước ~1KB và chứa nội dung duy nhất: `Not logged in · Please run /login`.
  - Trên giao diện `https://firecrawl.dsc.edu.vn`, phần Cấu hình AI Engine đang chọn **Claude Code CLI** và hiện badge xanh `✓ Claude Code CLI Sẵn sàng`.

---

## 1. Nguyên nhân gốc rễ (Root Cause Analysis)

1. **Claude Code CLI trên VPS chưa đăng nhập:**
   - Tệp `/root/.claude/.credentials.json` trên VPS có `accessToken: ""` rỗng (phiên OAuth đã hết hạn từ tháng 8/2026).
   - Khi chạy lệnh `claude -p ...`, CLI thoát với mã lỗi `code: 1` và in ra thông báo: `Not logged in · Please run /login`.
2. **Lỗ hổng trong cầu nối Server Bridge (`bridge.js` và `bridge/middleware.ts`):**
   - Đoạn mã xử lý tiến trình CLI có điều kiện lỗi:
     ```js
     if (code !== 0 && !stdout.trim()) { ... return 500; }
     ```
     Vì `stdout` có chứa chuỗi `"Not logged in · Please run /login"`, nên điều kiện `!stdout.trim()` trả về `false`!
     Hệ quả: Server Bridge bỏ qua việc `code !== 0`, tưởng nhầm đây là bản dịch thành công và trả về mã `HTTP 200 { success: true, rawOutput: "Not logged in · Please run /login" }`!
3. **Kiểm tra trạng thái "Sẵn sàng" sai thực tế:**
   - Endpoint `/api/cli/status` chỉ kiểm tra xem tệp thực thi `/usr/local/bin/claude` có tồn tại trên đĩa hay không (`fs.existsSync`). Nó không hề kiểm tra xem CLI đã đăng nhập hay chưa.
   - Do đó, giao diện hiển thị badge `✓ Claude Code CLI Sẵn sàng`, khiến người dùng tin tưởng và bấm nút "Bắt Đầu Dịch Hàng Loạt".
4. **Thiếu kiểm duyệt nội dung lỗi ở Frontend:**
   - Frontend nhận chuỗi `"Not logged in · Please run /login"` và ghi thẳng vào tệp Markdown xuất ra.
5. **So sánh với Google Antigravity (`agy`):**
   - Trên VPS, công cụ **Google Antigravity / Gemini CLI (`agy`)** đang hoạt động hoàn hảo 100% (đã kiểm tra lệnh phản hồi `Pong! How can I help you today?` và dịch thử `Hello world` -> `Xin chào thế giới`).

---

## 2. Kế hoạch khắc phục (Fix Plan)

### Bước 1: Vá cầu nối Server Bridge (`bridge.js` & `bridge/middleware.ts`)
1. Bắt buộc kiểm tra `code !== 0` hoặc chuỗi lỗi xác thực (`not logged in`, `please run /login`, `failed to authenticate`).
2. Trả về mã lỗi HTTP 401/500 kèm thông báo rõ ràng bằng tiếng Việt:
   `"Claude Code CLI chưa được đăng nhập trên máy chủ. Hãy chọn Google Antigravity / Gemini hoặc cấu hình API Key trong Cài đặt AI Engine."`
3. Cập nhật endpoint `/api/cli/status`: Kiểm tra xác thực thực tế (kiểm tra token hoặc biến môi trường `ANTHROPIC_API_KEY`). Nếu chưa đăng nhập, trả về `available: false`.

### Bước 2: Bổ sung lớp bảo vệ ở Frontend (`aiEngines.ts` & `AIEngineSettings.tsx`)
1. Trong `parseAIOutputSafe` / `executeDirectAIExtract`: Nếu nội dung trả về là thông báo lỗi CLI/xác thực, chủ động ném lỗi (`throw new HttpError`) để dừng tiến trình, không tạo tệp rác 1KB.
2. Trong `AIEngineSettings.tsx`: Nếu Claude CLI chưa đăng nhập, hiển thị cảnh báo màu hổ phách `⚠️ Chưa đăng nhập - Hãy chọn Antigravity hoặc nhập API Key`.

### Bước 3: Cập nhật cấu hình Docker Compose trên VPS
- Trong `docker-compose.yml` cho `ui-bridge`: Mount thư mục `/root/.claude:/root/.claude` để chia sẻ thông tin xác thực nếu sau này cấu hình.

### Bước 4: Triển khai lên VPS và kiểm tra xác minh
- Cập nhật `/var/www/firecrawl-ui/bridge.js` trên VPS và khởi động lại `ui-bridge`.
- Build và cập nhật `ingestion-ui` lên `/var/www/firecrawl-ui/`.
- Kiểm tra trực tiếp trên trình duyệt `https://firecrawl.dsc.edu.vn`.
- Hướng dẫn người dùng chọn **Google Antigravity / Gemini** (đã sẵn sàng) để cào và dịch ngay lập tức mà không gặp lỗi.
