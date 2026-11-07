# Lịch sử tương tác và quyết định

Nhật ký các lượt làm việc với agent trên repo này. Mỗi lượt thêm **một mục mới ở đầu danh sách** (mới nhất trước): việc đã làm, quyết định của chủ fork, lỗi đã bắt được, việc còn dở. Mục đích: phiên sau (hoặc một agent khác) nối tiếp mà không phải đọc lại hội thoại.

Nhật ký ở mức dự án; quy tắc ngôn ngữ và plan-mode của chủ fork nằm ở cấu hình cá nhân, không lặp lại ở đây.

---

## 2026-11-07 — Triển khai cập nhật lên VPS qua Dokploy & SSH

**Yêu cầu**: Cập nhật bản build mới nhất của phần mềm lên VPS `217.15.160.118` (domain `https://firecrawl.dsc.edu.vn`) qua Dokploy (`https://dokploy.dsc.edu.vn`) và SSH.

**Thông số môi trường**:
- VPS IP: `217.15.160.118`, SSH root qua khóa `C:\Users\duongsinh\.ssh\id_ed25519`.
- Dokploy Project: `firecrawl-app` (`compose-navigate-online-bus-tlk6tz`, ID: `oaE7L3G64ZEqKRL4YvxAv`).
- Dokploy API: Gọi deploy thành công qua endpoint `/api/compose.deploy` với `x-api-key`.
- Domain công khai: `https://firecrawl.dsc.edu.vn`.

**Đã làm**:
- Lưu kế hoạch tại `docs/plans/2026-11-07-deploy-vps-dokploy-firecrawl-plan.md`.
- Kết nối SSH vào VPS, kéo mã nguồn mới nhất từ GitHub (`git pull origin main` tại `/root/firecrawl` nhận commit `38297c332`).
- Chạy `pnpm install --ignore-workspace` và build frontend bằng `tsc -b && vite build`.
- Đồng bộ bundle tĩnh mới (`dist/*`) vào thư mục phục vụ web của Nginx (`/var/www/firecrawl-ui/`).
- Khởi động lại container `ui` (`compose-navigate-online-bus-tlk6tz-ui-1`) và gửi trigger deploy qua Dokploy API.
- Kiểm tra xác minh: `https://firecrawl.dsc.edu.vn` trả về HTTP 200, nạp đúng bundle JS mới (`index-BYNIS7Vu.js`), cầu nối CLI bridge (`/api/cli/status`) hoạt động hoàn hảo với `agy` và `claude`.

---

## 2026-11-07 — Đồng bộ 435 commit từ Upstream vào Local và GitHub (Origin)

**Yêu cầu**: Lên kế hoạch `/plan` và triển khai cập nhật, đồng bộ các thay đổi từ repository gốc (`upstream/main`) vào repository local (`main`) và GitHub (`origin/main`), đồng thời quy định từ nay mọi kế hoạch luôn được lưu tại thư mục `docs/plans/`.

**Quyết định & Nghiên cứu Upstream**:
- **Nghiên cứu việc Upstream gỡ bỏ `apps/ui/ingestion-ui`**: Tại commit `244f83bdd`, upstream xóa template mẫu cũ vì họ không dùng và để loại bỏ các cảnh báo lỗ hổng bảo mật. Thay vào đó, Firecrawl chuyển hướng Web UI sang SaaS Cloud (`firecrawl.dev/app`), phát triển `firecrawl-cli` và cung cấp bộ `skills/` chuẩn cho AI agents (Cursor, Claude Code, Antigravity).
- **Quyết định**: Giữ nguyên vẹn 100% mã nguồn `apps/ui/ingestion-ui` trên fork của chúng ta (vì đã được nâng cấp thành công cụ trích xuất mạnh mẽ độc lập); từ nay thư mục này hoàn toàn độc lập, không còn lo ngại xung đột từ upstream.
- **Quy ước kế hoạch**: Kế hoạch đồng bộ được lưu tại `docs/plans/2026-11-07-sync-upstream-firecrawl-plan.md`. Mọi kế hoạch trong tương lai cũng sẽ luôn được ghi vào `docs/plans/`.

**Đã làm**:
- Commit tài liệu và ghi chú quy ước kế hoạch (`423cd5532`).
- Tạo nhánh sao lưu an toàn `backup/pre-sync-upstream-main`.
- Thực hiện merge 435 commit từ `upstream/main` vào `main` (commit merge `601db8868`).
- Giải quyết xung đột: giữ lại toàn bộ `apps/ui/ingestion-ui/`, hợp nhất cấu hình `.gitignore` (bao gồm `tmp/` từ upstream và các rule local tools).
- Đẩy nhánh `main` đã merge lên GitHub remote `origin/main` thành công.
- Lưu trữ đầy đủ kế hoạch và cập nhật nhật ký tương tác.

**Bước kế tiếp**: Sẵn sàng khai thác các tính năng mới của Core API v2, Playwright service 1.65.0 và hệ thống Agent Skills tại `skills/`.

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
