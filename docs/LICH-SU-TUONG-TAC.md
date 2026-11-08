# Lịch sử tương tác và quyết định

Nhật ký các lượt làm việc với agent trên repo này. Mỗi lượt thêm **một mục mới ở đầu danh sách** (mới nhất trước): việc đã làm, quyết định của chủ fork, lỗi đã bắt được, việc còn dở. Mục đích: phiên sau (hoặc một agent khác) nối tiếp mà không phải đọc lại hội thoại.

Nhật ký ở mức dự án; quy tắc ngôn ngữ và plan-mode của chủ fork nằm ở cấu hình cá nhân, không lặp lại ở đây.

---

## 2026-11-08 — Kích hoạt Persistent Token 1 năm (Claude setup-token) trên VPS

**Yêu cầu**: Xử lý triệt để việc phiên OAuth của Claude Code bị hết hạn sau vài tiếng khi cào dịch hàng loạt khối lượng lớn (dừng ở bài 34/124).

**Nguyên nhân gốc rễ**:
- Đăng nhập OAuth trình duyệt (`claude.ai`) chỉ cấp Access Token ngắn hạn (4-8 tiếng) với cơ chế Refresh Token Rotation. Trên môi trường headless server không có trình duyệt để xoay vòng token mượt mà.

**Đã làm**:
- Người dùng chạy lệnh chính thức `claude setup-token` trên máy tính cá nhân để tạo token dài hạn (1 năm) gắn với gói thuê bao Claude Max.
- Bơm token trực tiếp sang VPS qua kết nối mã hóa SSH vào tệp an toàn `/root/.claude/oauth_token.env` (phân quyền `600`).
- Nâng cấp `bridge.js` và `bridge/middleware.ts` tự động phát hiện và nạp `CLAUDE_CODE_OAUTH_TOKEN` từ tệp cấu hình hoặc biến môi trường.
- Kiểm tra xác minh:
  + Lệnh CLI thực tế trên VPS qua bash source: dịch chuẩn xác `"Token vĩnh viễn 1 năm đang hoạt động"`.
  + Endpoint `/api/cli/status`: `{"claude":{"available":true,"authenticated":true,"reason":"Sẵn sàng"}}`.
  + Endpoint `/api/cli/extract`: test dịch qua web bridge trả về `"Mọi thứ đã được thiết lập hoàn hảo."` (HTTP 200).

---

## 2026-11-07 — Ngăn chặn dịch lại bài đã dịch & Tự động đồng bộ với thư mục trên máy

**Yêu cầu**: Sửa lỗi nhiều bài viết đã dịch xong trên máy tính nhưng hệ thống vẫn tiếp tục xếp vào hàng đợi dịch lại (123 bài thay vì 94 bài còn thiếu), làm tốn token và ghi đè lên các bài dịch tốt cũ.

**Nguyên nhân gốc rễ**:
1. Ứng dụng chỉ dùng `FileSystemDirectoryHandle` theo một chiều ghi (`writeArticleToDirectory`), không có cơ chế đọc ngược từ ổ đĩa để nhận diện các bài `.md` đã tồn tại.
2. Mỗi lần người dùng bấm "Quét Cây Mục Lục", ứng dụng tạo mới danh sách và ghi đè bộ nhớ đệm IndexedDB bằng danh sách trống (`status: 'idle'`).
3. Bộ lọc `skipDone` chỉ dựa trên bộ nhớ RAM, khi RAM bị reset thì toàn bộ bài viết bị đưa vào hàng đợi dịch lại.
4. Một số bài dịch bị lỗi 1KB trước đó (chứa thông báo `Not logged in`) cần được nhận diện để dịch lại, còn bài hợp lệ (> 1.5KB) phải được bỏ qua.

**Đã làm**:
- Kế hoạch kỹ thuật lưu tại: `docs/plans/2026-11-07-fix-duplicate-translation-and-folder-sync-plan.md`.
- Bổ sung vào `apps/ui/ingestion-ui/src/lib/batchExporter.ts`:
  + `isValidTranslatedMarkdown`: Kiểm tra tính hợp lệ của bản dịch (độ dài >= 200 ký tự và không chứa chuỗi lỗi CLI).
  + `readArticleFromDirectory`: Đọc trực tiếp file bài viết từ thư mục đĩa theo cấu trúc `<NN-category>/<NN-article>.md`.
  + `syncWithOutputDirectory`: Đồng bộ toàn bộ cây mục lục với ổ đĩa, tự động đánh dấu `done` và nạp nội dung cho các bài viết hợp lệ, giữ `idle` cho bài rác 1KB để dịch lại.
- Bổ sung unit tests trong `batchExporter.test.ts` (8/8 tests passed).
- Cập nhật `apps/ui/ingestion-ui/src/components/BatchDocExtractor.tsx`:
  + Tự động kích hoạt đồng bộ ngay khi người dùng chọn thư mục (`chooseOutputDir`).
  + Bổ sung nút bấm `🔄 Đồng bộ thư mục` trên thanh công cụ.
  + Hợp nhất thông minh trong `handleScanTree`: giữ nguyên trạng thái các bài đã `done` và tự động đối chiếu với thư mục đã chọn nếu có.
  + Kiểm tra an toàn trước khi chạy (`handleStartBatch`) và trong từng tác vụ (`processSingleItem`): bỏ qua ngay lập tức nếu file trên đĩa đã hợp lệ.
  + Cập nhật công thức tính `totalDone` loại trừ file hỏng 1KB.
- Build và triển khai bản cập nhật lên VPS, đồng bộ vào `/var/www/firecrawl-ui/`.

---

## 2026-11-07 — Kích hoạt gói thuê bao Claude Max (Claude Code CLI) trên VPS

**Yêu cầu**: Người dùng muốn sử dụng gói thuê bao Claude Code thay vì trả tiền API token và gặp lỗi "Chưa có Key / Chưa tìm thấy claude.exe".

**Phát hiện**:
- Người dùng đã sở hữu tài khoản Claude Max (`duongsinhchess@gmail.com`, bậc `default_claude_max_5x`) đã được xác thực trên máy local tại `C:\Users\duongsinh\.claude\.credentials.json`.
- Trên VPS, container `ui-bridge` trước đây chưa mount thư mục `/root/.claude/` nên không đọc được OAuth token của gói thuê bao.

**Đã làm**:
- Đồng bộ token xác thực Claude Max từ local lên VPS `/root/.claude/.credentials.json`.
- Cập nhật file compose của Dokploy (`/etc/dokploy/compose/compose-navigate-online-bus-tlk6tz/code/docker-compose.yml`), bổ sung mount `- /root/.claude:/root/.claude` cho container `ui-bridge`.
- Tái tạo container `ui-bridge`.
- Kiểm tra xác minh:
  + `claude auth status` trên VPS: `loggedIn: true, authMethod: "claude.ai", subscriptionType: "max"`.
  + Endpoint `/api/cli/status` trả về: `claude: { available: true, authenticated: true, reason: "Sẵn sàng" }`.
  + Endpoint `/api/cli/extract` test dịch thực tế với Claude CLI trả về: `"Gói đăng ký Claude Max đang hoạt động hoàn hảo."` (HTTP 200).
  + Web UI `https://firecrawl.dsc.edu.vn` sẵn sàng sử dụng Claude Max không cần nhập API Key.

---

## 2026-11-07 — Khắc phục lỗi lấy dữ liệu "Not logged in · Please run /login" từ Claude Code CLI

**Yêu cầu**: Sửa lỗi cào tài liệu từ Nocobase khi toàn bộ các bài viết kết quả chỉ có dung lượng ~1KB và chứa nội dung `Not logged in · Please run /login`.

**Nguyên nhân gốc rễ đã xác định**:
1. Phiên OAuth của `claude` CLI trên VPS đã hết hạn (`accessToken: ""`), khiến `claude` thoát với mã lỗi 1 và in thông báo `Not logged in · Please run /login`.
2. Lỗ hổng trong cầu nối Server Bridge (`bridge.js` và `bridge/middleware.ts`): do điều kiện `if (code !== 0 && !stdout.trim())` chỉ báo lỗi khi `stdout` rỗng, nên khi Claude in chuỗi lỗi vào `stdout`, Bridge đã hiểu nhầm đây là nội dung dịch thành công và trả về `HTTP 200 { success: true, rawOutput: "Not logged in · Please run /login" }`.
3. Endpoint `/api/cli/status` chỉ kiểm tra sự tồn tại của tệp nhị phân trên đĩa chứ không kiểm tra trạng thái xác thực thực tế, gây hiểu nhầm với badge `✓ Claude Code CLI Sẵn sàng`.
4. Trong khi đó, **Google Antigravity / Gemini CLI (`agy`)** trên VPS đã được xác thực qua `/root/.gemini` và hoạt động hoàn hảo 100%.

**Đã làm**:
- Kế hoạch chi tiết lưu tại `docs/plans/2026-11-07-fix-cli-auth-validation-and-extractor-plan.md`.
- Sửa Server Bridge (`bridge/middleware.ts` và `/var/www/firecrawl-ui/bridge.js` trên VPS):
  + Kiểm tra xác thực thực tế trong `/api/cli/status`: nếu chưa có token hợp lệ thì trả về `available: false` kèm lý do `Chưa đăng nhập`.
  + Bắt buộc trả về HTTP 401 khi phát hiện lỗi xác thực CLI, không bao giờ trả về HTTP 200 cho chuỗi thông báo lỗi.
- Sửa Frontend (`aiEngines.ts`, `AIEngineSettings.tsx`):
  + Bổ sung kiểm duyệt trong `parseAIOutputSafe` và `executeDirectAIExtract` để từ chối các chuỗi lỗi xác thực.
  + Hiển thị badge cảnh báo hổ phách `⚠️ Claude CLI chưa đăng nhập - Hãy chọn Antigravity hoặc nhập Key`.
- Build và triển khai bản cập nhật lên VPS (`index-_Vtdty6-.js`), khởi động lại container `ui` và `ui-bridge`.
- Kiểm tra xác minh:
  + `/api/cli/status` báo chính xác `claude: { available: false, authenticated: false }` và `antigravity: { available: true, authenticated: true }`.
  + `/api/cli/extract` với Claude trả về đúng HTTP 401 Unauthorized kèm hướng dẫn.
  + `/api/cli/extract` với Google Antigravity dịch tiếng Việt chuẩn xác và ổn định.

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
