# Lịch sử tương tác và quyết định

Nhật ký các lượt làm việc với agent trên repo này. Mỗi lượt thêm **một mục mới ở đầu danh sách** (mới nhất trước): việc đã làm, quyết định của chủ fork, lỗi đã bắt được, việc còn dở. Mục đích: phiên sau (hoặc một agent khác) nối tiếp mà không phải đọc lại hội thoại.

Nhật ký ở mức dự án; quy tắc ngôn ngữ và plan-mode của chủ fork nằm ở cấu hình cá nhân, không lặp lại ở đây.

---

## 2026-09-30 — Khởi tạo bộ tài liệu (pha 1)

**Yêu cầu**: tạo/cập nhật các file `.md` (agents, claude, readme, skills, tech, memory...) để thống kê, giới thiệu, mô tả thuật toán và lưu lịch sử của mọi module, làm cơ sở rà soát, xây thêm module mới và nhân bản phần mềm.

**Quyết định của chủ fork** (hỏi ngày 2026-09-30):
- Nơi ghi: **toàn bộ trong repo**.
- Phạm vi: **toàn bộ monorepo, sâu như nhau**.

**Đã làm**:
- Khảo sát repo tại commit `96a8e0ae3d` (2026-09-26): đếm quy mô bằng script, đọc `docker-compose.yaml`, `apps/api/package.json`, routes, `scrapeURL/README.md`, `nuq.sql`, cấu trúc `ingestion-ui`.
- Viết `docs/TONG-QUAN-FIRECRAWL.md`.
- Viết `docs/PROGRESS.md` với 19 hàng tính năng đề xuất (chờ duyệt).
- Viết file này.
- Thêm đoạn con trỏ "Tài liệu dự án" vào `CLAUDE.md`.

**Lỗi đã bắt khi tự soát**:
- Đường dẫn README của UI lúc đầu viết thiếu `ui/`; đã sửa thành `apps/ui/ingestion-ui/README.md`.
- Một dòng về "console cp1252" không phải dữ kiện của repo; đã thay bằng quy ước thật trong `CLAUDE.md`.

**Nghi vấn ghi nhận (chưa kiểm chứng)**:
- `apps/ui/ingestion-ui/README.md` là README template gốc, lỗi thời.
- `apps/api/native/README.md` là README mẫu napi-rs.
- Quan hệ khoá ngoại giữa 4 bảng NuQ chưa xác nhận.

**Còn dở / bước kế tiếp**: chủ fork duyệt danh sách ở `PROGRESS.md`, chọn tính năng đầu tiên cho pha 2. Chưa viết tài liệu tính năng nào.
