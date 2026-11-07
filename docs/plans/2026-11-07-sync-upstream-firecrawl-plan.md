# Kế hoạch đồng bộ Firecrawl từ Upstream vào Local và GitHub (Origin)

- **Ngày cập nhật:** 2026-11-07
- **Nhánh thực hiện:** `main`
- **Mục tiêu:** Cập nhật 435 commit mới nhất từ `upstream/main` vào nhánh local `main` và đẩy lên `origin/main` (GitHub cá nhân), đồng thời bảo toàn toàn bộ ứng dụng `apps/ui/ingestion-ui`, tích hợp các tính năng mới của Upstream (Core API v2, Playwright service 1.65.0, hệ thống Firecrawl Agent Skills tại `skills/`).

---

## 1. Kết quả nghiên cứu Upstream: Tại sao xóa Ingestion-UI & Họ dùng gì thay thế?

### 1.1. Tại sao Upstream xóa `apps/ui/ingestion-ui`?
- **Bản chất cũ:** Ở commit `244f83bdd` (tháng 10/2026), commit message nêu rõ:
  > *"chore(ui): remove the unmaintained ingestion-ui template. Nothing builds or deploys apps/ui/ingestion-ui; it has had no functional change since 2024 and only receives dependency patches. Removing it takes tailwindcss 3 and postcss-selector-parser 6 out of the repo."*
- `apps/ui/ingestion-ui` trong repo gốc vốn chỉ là một template demo sơ sài từ năm 2024, không được đội ngũ Firecrawl dùng hay triển khai trong sản phẩm thực tế của họ. Giữ lại template này chỉ gây cảnh báo bảo mật (`pnpm audit`) nên họ quyết định dọn dẹp dứt điểm.

### 1.2. Upstream hiện tại sử dụng công cụ gì mới và tối ưu hơn?
Định hướng của Upstream Firecrawl là tập trung vào Scraper Engine và công cụ cho Developer/Agent:
1. **Web UI chính thức (SaaS Cloud):** Đội ngũ Firecrawl chuyển toàn bộ Dashboard/Playground lên nền tảng web tại `https://firecrawl.dev/app` (codebase đóng, không nằm trong monorepo này).
2. **Firecrawl CLI (`firecrawl-cli`):** Công cụ dòng lệnh chính thức mới tại `https://github.com/firecrawl/cli` hỗ trợ crawl, scrape, map, search và tương tác trực tiếp từ terminal hoặc script (`npx -y firecrawl-cli@latest`).
3. **Bộ Firecrawl Agent Skills (`skills/`):** Upstream vừa bổ sung thư mục `skills/` trực tiếp trong monorepo để cung cấp agent skills cho các AI IDE (Antigravity, Cursor, Claude Code) gồm:
   - `skills/firecrawl-build`: Điều phối tích hợp Firecrawl vào codebase.
   - `skills/firecrawl-build-scrape`: Hướng dẫn agent cào đơn trang.
   - `skills/firecrawl-build-search`: Tìm kiếm & discovery dữ liệu web.
   - `skills/firecrawl-build-interact`: Mô phỏng hành động tương tác trình duyệt (click, nhập liệu, chuyển trang).
   - `skills/firecrawl-build-onboarding`: Tự động nhận diện API keys hoặc Self-hosted URL.
4. **Cải tiến Core Engine:** Nâng cấp Playwright service lên `1.65.0`, bổ sung các endpoint kiểm tra sức khỏe hệ thống (`/health/liveness`, `/health/readiness`), cơ chế chống cạn kiệt tài nguyên và xử lý rate limit nâng cao.

### 1.3. Đánh giá & Chiến lược tận dụng cho Fork của chúng ta
- **Về `apps/ui/ingestion-ui`:**
  - Nhánh của bạn đã nâng cấp nó từ một template demo cũ thành một ứng dụng độc lập hoàn chỉnh (Doc Tree Crawler, AI Engine selector cho Claude/Gemini/OpenAI/Ollama, Batch Runner bền bỉ với IndexedDB, Export Obsidian/ZIP, Docker container riêng biệt).
  - **Lợi thế lớn:** Vì upstream đã gỡ bỏ hoàn toàn template cũ, từ nay trở đi `apps/ui/ingestion-ui` của chúng ta sẽ hoàn toàn độc lập, không bao giờ bị xung đột (conflict) từ upstream trong các đợt sync tương lai!
- **Tận dụng từ Upstream sau khi Merge:**
  1. Hưởng lợi trực tiếp từ các bản vá lỗi và tính năng mới của Core API (`apps/api`) và Playwright service.
  2. Tích hợp bộ `skills/` của upstream vào kho vũ khí của Antigravity trong repo này.
  3. Có thể dùng health probes mới (`/health/liveness`, `/health/readiness`) để nâng cấp client kết nối trong UI sau này.

---

## 2. Kế hoạch triển khai từng bước

### Bước 1: Lưu trạng thái tài liệu hiện tại
Commit các thay đổi chưa staged ở `CLAUDE.md` và các tài liệu mới trong `docs/`:
```bash
git add CLAUDE.md docs/LICH-SU-TUONG-TAC.md docs/PROGRESS.md docs/TONG-QUAN-FIRECRAWL.md docs/plans/2026-11-07-sync-upstream-firecrawl-plan.md
git commit -m "docs: add system overview, progress tracking and sync upstream plan"
```

### Bước 2: Tạo nhánh an toàn (Safety Backup)
```bash
git branch backup/pre-sync-upstream-main
```

### Bước 3: Merge `upstream/main` vào `main`
```bash
git merge upstream/main -m "chore: merge upstream/main into main"
```

### Bước 4: Giải quyết xung đột
1. Giữ lại toàn bộ `apps/ui/ingestion-ui`:
   ```bash
   git checkout --ours apps/ui/ingestion-ui/
   git add apps/ui/ingestion-ui/
   ```
2. Hợp nhất `.gitignore` (giữ cả rule của upstream và local):
   ```bash
   git add .gitignore
   ```
3. Hoàn tất commit merge:
   ```bash
   git commit -m "chore: merge upstream/main, preserve ingestion-ui and adopt new skills"
   ```

### Bước 5: Kiểm tra xác minh (Verification)
- Kiểm tra build và lint `apps/ui/ingestion-ui`:
  ```bash
  cd apps/ui/ingestion-ui && pnpm build && pnpm lint
  ```

### Bước 6: Đẩy lên GitHub Remote
```bash
git push origin main
```

### Bước 7: Cập nhật nhật ký tương tác
- Cập nhật mục mới ở đầu `docs/LICH-SU-TUONG-TAC.md` ghi nhận sự kiện đồng bộ và commit SHA.
- Cập nhật `CLAUDE.md` chuẩn hóa quy ước lưu trữ kế hoạch tại `docs/plans/`.
