# Kế hoạch: Ngăn chặn dịch lại bài đã dịch & Tự động đồng bộ với thư mục lưu trữ trên máy

- **Ngày tạo**: 2026-11-07
- **Tác giả**: Antigravity Assistant
- **Mục tiêu**: Khắc phục triệt để tình trạng hệ thống dịch lại các bài viết đã dịch xong, không nhận diện được các file `.md` đã tồn tại trên đĩa cứng, và xóa sạch tiến độ khi quét lại cây mục lục.

---

## 1. Vấn đề & Nguyên nhân gốc rễ

Qua phân tích 4 ảnh chụp màn hình của người dùng:
1. **Ảnh 2 & 3**: Trên máy tính tại thư mục `Documents > nocobase core > 05-core` đã có 30 bài viết đã được trích xuất và dịch (các bài từ `03-pages-routes-and-navigation.md` đến `29-sign-in.md` có dung lượng từ 13KB đến 82KB). Các bài `01-overview.md` và `02-project-structure.md` có dung lượng 1KB là do lỗi phiên đăng nhập Claude trước đó tạo ra.
2. **Ảnh 1 & 4**: Trên giao diện web [firecrawl.dsc.edu.vn](https://firecrawl.dsc.edu.vn), dù người dùng đã tick chọn **"Bỏ qua bài đã dịch (tiết kiệm token khi chạy lại)"**:
   - Hệ thống vẫn hiển thị: **`Bắt Đầu Dịch Hàng Loạt (123 bài)`** (thay vì 94 bài còn thiếu).
   - Trong cây thư mục chuyên mục `Core (119/119)`, toàn bộ các bài đều ở trạng thái chưa hoàn thành (không có badge xanh `Đã xong`), màn hình bên phải báo `Bài viết chưa được trích xuất`.

### Các nguyên nhân cụ thể:
1. **Tách biệt giữa trạng thái bộ nhớ (React State) và ổ đĩa (Local Disk)**:
   - Khi người dùng chọn `Thư mục: nocobase core` qua File System Access API, trình duyệt chỉ giữ đối tượng `FileSystemDirectoryHandle` để ghi đè (`writeArticleToDirectory`). Hệ thống **chưa từng quét hoặc đọc lại** các file `.md` đã có sẵn trong thư mục này.
2. **Quét lại cây mục lục (`handleScanTree`) ghi đè toàn bộ**:
   - Mỗi lần bấm "Quét Cây Mục Lục", hàm `handleScanTree` tạo mới toàn bộ danh sách `categories` với `status: 'idle'` và `markdownOutput: undefined`.
   - Ngay sau đó, hàm gọi `replaceCategories(scannedCategories)` -> tự động ghi đè bộ nhớ đệm IndexedDB bằng danh sách mới tinh chưa dịch bài nào!
3. **Logic lọc bỏ qua bài dịch chỉ dựa vào RAM**:
   - Bộ lọc `selected.filter(({ item }) => !(item.status === 'done' && item.markdownOutput))` chỉ kiểm tra biến trong bộ nhớ. Vì biến bộ nhớ chưa được gán dữ liệu từ đĩa, hệ thống xếp toàn bộ 123 bài vào hàng đợi dịch lại từ đầu.
4. **Chưa có cơ chế phân loại file lỗi 1KB**:
   - Các file 1KB do lỗi auth trước đây (`Not logged in · Please run /login`) cần được phát hiện để dịch lại, trong khi các file dịch thật (> 1.5KB) cần được giữ nguyên và đánh dấu `done`.

---

## 2. Giải pháp kiến trúc

```
+-------------------------------------------------------------+
| Người dùng chọn Thư mục lưu (FileSystemDirectoryHandle)     |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| Hàm `syncWithOutputDirectory(dir, categories)`               |
| 1. Duyệt các thư mục chuyên mục (`01-...`, `05-...`)        |
| 2. Kiểm tra sự tồn tại của file `<NN>-<slug>.md`            |
| 3. Kiểm tra tính hợp lệ (size > 1.5KB & không chứa lỗi CLI) |
|    - Hợp lệ: Gán `status = 'done'`, nạp `markdownOutput`    |
|    - File rác 1KB: Giữ `status = 'idle'` để dịch lại        |
+-------------------------------------------------------------+
                               |
                               v
+-------------------------------------------------------------+
| Giao diện cập nhật tức thì:                                 |
| - Badge xanh `✓ Đã xong` xuất hiện trên 30 bài đã có        |
| - Nút dịch hiển thị: `Bắt Đầu Dịch Hàng Loạt (94 bài)`       |
| - Nhấp vào bài đã dịch -> hiển thị nội dung ngay lập tức     |
| - Tự động đồng bộ tiến độ vào IndexedDB                     |
+-------------------------------------------------------------+
```

---

## 3. Các thay đổi chi tiết

### Thành phần 1: Thư viện `batchExporter.ts` (File System Reader & Validator)
- Viết hàm `checkArticleOnDisk(dir: FileSystemDirectoryHandle, categoryFolder: string, fileName: string)`:
  - Kiểm tra xem file có tồn tại không.
  - Đọc nội dung file.
  - Kiểm tra tính hợp lệ:
    + Độ dài nội dung >= 200 ký tự.
    + Không chứa các cụm từ lỗi: `not logged in`, `please run /login`, `failed to authenticate`.
- Viết hàm `syncWithOutputDirectory(dir: FileSystemDirectoryHandle, categories: DocCategory[], flavor: ExportFlavor)`:
  - Quét toàn bộ cây danh mục đối chiếu với các file trên đĩa.
  - Cập nhật các bài viết hợp lệ thành `status: 'done'`, nạp `markdownOutput`.
  - Trả về danh sách categories đã đồng bộ kèm thống kê (`matchedCount`, `repairedCount`).

### Thành phần 2: Tự động hợp nhất khi quét mục lục (`BatchDocExtractor.tsx`)
- Sửa hàm `handleScanTree`:
  - Trước khi thay thế `categories`, đối chiếu các URL giữa danh sách mới quét và danh sách cũ (trong RAM hoặc IndexedDB).
  - Nếu bài viết đã có `markdownOutput` và `status === 'done'`, bảo lưu nguyên vẹn trạng thái.
  - Nếu đã chọn `outputDir`, tự động chạy đối chiếu với thư mục trên đĩa.

### Thành phần 3: Các điểm kích hoạt đồng bộ (Tránh người dùng phải thao tác thủ công)
- **Khi chọn thư mục**: Vừa chọn thư mục xong (`chooseOutputDir`), tự động chạy đồng bộ ngay lập tức và hiển thị thông báo: `✓ Đã nhận diện 30 bài đã dịch sẵn trong thư mục!`.
- **Thêm nút thao tác nhanh**: Bên cạnh nút "Thư mục: nocobase core", thêm nút biểu tượng `🔄 Quét lại thư mục` để người dùng có thể đồng bộ lại bất kỳ lúc nào nếu vừa copy/paste file từ nơi khác vào.
- **Trước khi bắt đầu dịch hàng loạt (`handleStartBatch`)**:
  - Nếu `skipDone` được bật và có `outputDir`, thực hiện kiểm tra an toàn lần cuối trên đĩa để đảm bảo không một bài nào đã có file trên đĩa bị dịch đè.

### Thành phần 4: Xử lý bài đơn lẻ (`processSingleItem`)
- Trong trường hợp bài viết bất ngờ đã được dịch trên đĩa (ví dụ do chạy song song hoặc file đã có sẵn), bỏ qua việc gọi AI và cập nhật luôn trạng thái `done`.

---

## 4. Kế hoạch kiểm thử & Xác minh

### Kiểm thử tự động (Unit Tests)
- Bổ sung unit test trong `batchExporter.test.ts`:
  - Kiểm thử `checkArticleOnDisk` với file hợp lệ (80KB) -> trả về hợp lệ.
  - Kiểm thử `checkArticleOnDisk` với file lỗi 1KB chứa `Not logged in` -> trả về không hợp lệ để dịch lại.
  - Kiểm thử `syncWithOutputDirectory` cập nhật chính xác danh sách categories.
- Chạy: `node D:/code/firecrawl/apps/ui/ingestion-ui/node_modules/vitest/vitest.mjs run D:/code/firecrawl/apps/ui/ingestion-ui/src/lib/batchExporter.test.ts`.

### Kiểm thử thực tế trên VPS & Trình duyệt
- Build lại bundle frontend (`tsc -b && vite build`).
- Đẩy lên VPS `217.15.160.118`, reload web UI.
- Người dùng chọn thư mục `nocobase core`:
  - Hệ thống tự động nhận diện 30 bài đã có.
  - Số lượng bài cần dịch chuyển từ 123 bài xuống còn 94 bài.
  - Bấm `Bắt Đầu Dịch Hàng Loạt` chỉ xử lý các bài chưa dịch, tuyệt đối không dịch lại 30 bài đã hoàn thành.
