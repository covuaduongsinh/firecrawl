# Rà soát codebase & Kế hoạch cải thiện — Firecrawl (fork Dương Sinh)

## Context
Thầy Tường yêu cầu review toàn bộ codebase, đánh giá chi tiết và lập kế hoạch cải thiện.
Repo là fork của Firecrawl upstream (`apps/api`, SDK… do upstream duy trì). Phần tự phát triển nằm ở
2 commit gần nhất (`9d090fc`, `bb30774`, ~6.400 dòng) — chủ yếu `apps/ui/ingestion-ui`:
Batch Doc Crawler (quét cây mục lục → cào → dịch AI → xuất ZIP/MD/JSON), chọn AI Engine
(Gemini/Claude/Ollama/OpenAI + cầu nối CLI `agy`/`claude` qua Vite plugin), Prompt Bank.
Review tập trung vào phần này + các file gốc bị sửa (CLAUDE.md, docker-compose, pnpm-workspace).

**Phạm vi thực hiện (Thầy đã chọn):** lưu báo cáo thành `docs/plans/2026-09-25-codebase-review-and-improvement-plan.md`
+ triển khai **GĐ 0 → 3** (mục 1–13, 15). GĐ 4–5 để phiên sau (riêng test cho `src/lib/*` sẽ viết kèm
khi sửa, dùng `vitest`). Mỗi giai đoạn 1 commit, push lên `claude/wizardly-feynman-v56gg2`.

---

## 1. Đánh giá tổng quan

| Tiêu chí | Điểm | Nhận xét ngắn |
|---|---|---|
| Tính năng / giá trị sử dụng | 8/10 | Luồng quét→dịch→xuất sách rất sát nhu cầu Việt hóa tài liệu |
| Bảo mật | 3/10 | Cầu nối CLI có thể bị khai thác chạy lệnh trên máy (xem P0) |
| Độ tin cậy | 5/10 | Nhiều lỗi âm thầm mất dữ liệu (quota, regex HTML, lọc boilerplate) |
| Chất lượng code | 5/10 | Component quá lớn (939 & 1.180 dòng), `any`, catch rỗng, trùng lặp |
| Test / CI | 1/10 | Không có test nào cho UI, CI không build/lint UI |
| Triển khai | 3/10 | Bridge chỉ chạy trong `vite dev`; nginx trỏ tới service không tồn tại |

---

## 2. Phát hiện chi tiết (xếp theo mức độ)

### Phát hiện thêm khi chạy thử (build/lint thực tế)
0. **`pnpm build` đang FAIL** (10 lỗi TypeScript) — bản production không build được.
   Nghiêm trọng nhất: `BatchDocExtractor.tsx:636` truyền prop `onConfigChange` nhưng `AIEngineSettings`
   gọi `onChange` → **bấm đổi AI Engine trong Batch Crawler là giao diện crash** (ErrorBoundary hiện ra).
   `vite dev` không kiểm tra kiểu nên lỗi này lọt qua.
0b. **`pnpm lint` crash** do override `ajv: ^8` trong `apps/ui/ingestion-ui/pnpm-workspace.yaml`
   ép `@eslint/eslintrc` (cần ajv 6) dùng ajv 8. Sửa: tách override theo dải phiên bản.
   Sau khi sửa, lint báo 45 lỗi có sẵn (`any`, catch rỗng) — dọn ở GĐ 4.

### P0 — Bảo mật nghiêm trọng
1. **RCE qua CSRF + prompt injection** — `vite-plugin-cli.ts:147-220`
   - `/api/cli/extract` không kiểm tra Origin/Content-Type, `JSON.parse` mọi body → bất kỳ website nào
     Thầy mở trên trình duyệt có thể `POST text/plain` tới `localhost:5173/api/cli/extract`.
   - Lệnh chạy `agy -p <prompt> --dangerously-skip-permissions` → agent được toàn quyền chạy lệnh.
   - Ngay cả khi không bị CSRF: prompt chứa **nội dung trang web cào về** → trang độc hại có thể nhúng
     lệnh ("ignore instructions, run …") → agent thực thi trên máy Thầy.
   - Sửa: bỏ `--dangerously-skip-permissions`; chạy CLI ở chế độ **không tool** (chỉ sinh văn bản);
     kiểm tra header `Origin`/`Host` là localhost; bắt buộc `Content-Type: application/json`;
     token ngẫu nhiên sinh khi khởi động server, UI gửi kèm header; giới hạn kích thước body.
2. **SSRF / open proxy** — `/api/proxy/fetch-html` (`vite-plugin-cli.ts:77-146`) tải bất kỳ URL nào,
   kể cả `http://localhost:3002`, `169.254.169.254`, mạng LAN. Nguy hiểm khi đưa lên server (nginx đã
   có sẵn route `/api/proxy/`). Sửa: chỉ cho `http/https`, chặn IP private/loopback/link-local sau khi
   resolve DNS, timeout 20s, giới hạn 10MB, cùng cơ chế token như trên.
3. **API key** lưu plaintext trong `localStorage` (`aiEngines.ts:37-55`); Gemini key nằm trên query URL;
   `VITE_FIRECRAWL_API_KEY` bị nhúng vào bundle JS. ErrorBoundary nút "Clear cache" gọi
   `localStorage.clear()` (`main.tsx:44`) → xóa luôn key, prompt bank, phiên dịch dở. Sửa: chỉ xóa key
   phiên của app; ghi chú rõ đây là công cụ chạy local; về lâu dài chuyển gọi AI qua bridge (key ở server).

### P1 — Lỗi chức năng (bug thật, gây mất/sai dữ liệu)
4. **Crash dev server khi timeout** — `vite-plugin-cli.ts:229-252`: sau 120s trả 504, rồi sự kiện `close`
   lại `writeHead` lần 2 → `ERR_HTTP_HEADERS_SENT`. Proxy `fetch` cũng không có timeout.
5. **Claude API không chạy từ trình duyệt** — `aiEngines.ts:370`: header sai `dangerously-allow-browser`;
   đúng phải là `anthropic-dangerous-direct-browser-access: true` → mọi request bị CORS chặn.
   Model mặc định `claude-3-5-sonnet` không phải model ID hợp lệ và dòng 3.x đã ngừng; cập nhật danh sách
   (`claude-sonnet-5`, `claude-opus-5-5`, `claude-haiku-4-5-20251001`). `testAIConnection` cho Claude
   không gọi thử API thật (`aiEngines.ts:193-199`). Danh sách model Gemini/Antigravity cần xác minh lại.
6. **Bộ lọc boilerplate xóa nhầm nội dung** — `markdownFormatter.ts:31-36`: so khớp `includes("submit")`,
   `includes("last updated")`… → xóa mọi đoạn có chữ "submit" (tài liệu Frappe Education có
   "Submit Assignment", "Submitted"…). Sửa: chỉ lọc khi cả dòng đúng là cụm từ đó.
   *(Đính chính khi kiểm chứng bằng test: nghi vấn "chuỗi rỗng bị coi là boilerplate" không đúng —
   hàm cũ trả `false` cho chuỗi rỗng.)*
7. **Chuyển HTML→Markdown bằng regex làm cụt nội dung** — `pageScraper.ts:4-75`:
   `<div …content…>([\s\S]*?)</div>` dừng ở `</div>` lồng nhau đầu tiên → chỉ lấy đoạn đầu bài;
   bảng, danh sách lồng, code có ngôn ngữ, entity số (`&#8217;`) đều hỏng; link tương đối `../x` sai.
   Sửa: parse bằng `DOMParser` (trình duyệt) + `turndown` + `turndown-plugin-gfm`; hoặc ưu tiên
   Firecrawl `/v2/scrape` (onlyMainContent) khi backend đang chạy — đây chính là thế mạnh của Firecrawl.
8. **Batch runner** — `BatchDocExtractor.tsx:297-417`:
   - Bấm Dừng không hủy request đang chạy (không có `AbortController`) nhưng đặt `isRunning=false`
     → có thể bấm Bắt đầu lần 2 → **2 vòng lặp chạy song song**, ghi đè trạng thái.
   - Chạy lại xử lý cả bài đã `done` → dịch lại, tốn token. Cần tùy chọn "bỏ qua bài đã xong".
   - Không retry/backoff khi 429/5xx; chạy tuần tự 1 bài/lần (chậm với 100+ bài).
   - `useEffect([categories])` thiếu dep `activeItem`; ghi localStorage bên trong updater của `setState`.
9. **Lưu phiên bằng localStorage (~5MB)** — `BatchDocExtractor.tsx:177-191`: với vài chục bài dịch là
   vượt quota → lỗi bị nuốt (`console.warn`) → Thầy tưởng đã lưu nhưng khôi phục mất dữ liệu.
   Sửa: chuyển sang IndexedDB (`idb-keyval`), báo lỗi hiển thị khi lưu thất bại.
10. **Auto-download từng chuyên mục** — trình duyệt chặn nhiều lượt tải tự động liên tiếp (chỉ cho file
    đầu tiên). Sửa: dùng File System Access API (`showDirectoryPicker`) ghi thẳng vào 1 thư mục
    — có thể chọn thẳng thư mục trong vault Obsidian; fallback: 1 ZIP khi kết thúc.
11. **Cắt nội dung dài âm thầm** — `aiEngines.ts:265` `slice(0, 40000)` + `maxOutputTokens: 8192`:
    trang dài bị cắt đầu vào, bản dịch bị cắt đầu ra → JSON hỏng → rơi vào fallback. Sửa: chia chunk
    theo heading (~8–12k ký tự), dịch từng phần rồi ghép; cảnh báo khi phải cắt.
12. **Xuất file chưa thân thiện Obsidian** — `batchExporter.ts`: dùng `<a id>` trong heading (Obsidian
    không hỗ trợ), không có YAML frontmatter. Thêm chế độ xuất "Obsidian": frontmatter
    (`title`, `source`, `category`, `translated_at`, `engine`), liên kết `[[...]]`, tên file an toàn Windows.

### P2 — Hạ tầng, chất lượng code, quy trình
13. `pnpm-workspace.yaml` (gốc repo) chứa giá trị giữ chỗ `'set this to true or false'` → cấu hình
    không hợp lệ. Sửa: xóa file (ingestion-ui đã có workspace riêng) hoặc đặt `true`.
14. `nginx.conf` proxy tới `ui-bridge:3006` nhưng **không có** service này, không có Dockerfile UI,
    không có service UI trong `docker-compose.yaml` → bản build production mất hết `/api/cli`, `/api/proxy`.
    Sửa: tách bridge thành server Node độc lập (`apps/ui/ingestion-ui/server/bridge.ts`), Vite plugin
    dùng lại cùng handler khi dev; thêm Dockerfile + service compose (profile `ui`).
15. `CLAUDE.md` bị viết lại, **mất** quy trình gốc upstream (viết E2E trước, `pnpm harness jest`, knip
    phải sửa cả lỗi có sẵn); lại mô tả `.claude/skills/` và `.mcp.json` nhưng `.gitignore` bỏ qua cả hai.
    Sửa: khôi phục phần quy trình gốc + thêm mục riêng cho ingestion-ui; bỏ các mục không tồn tại
    hoặc commit `.mcp.json` mẫu (`.mcp.example.json`).
16. Lint dự kiến fail (`--max-warnings 0` + `tseslint.recommended`): ~30 chỗ `any`, nhiều `catch (e) {}`.
    Không có test. CI chỉ chạy `npm-audit` cho UI.
17. Cấu trúc: `BatchDocExtractor.tsx` 939 dòng, `ingestionV1.tsx` 1.180 dòng; `updateItem` lặp 2 lần;
    component V0 (`ingestion.tsx`) cũ vẫn hiển thị. Tách hook `useBatchRunner`, `useSessionStore`,
    `useAIConfig`; ẩn/xóa V0.
18. UI gọi API `/v1/*` trong khi API hiện có `/v2` (`apps/api/src/controllers/v2`). Nên dùng
    `@mendable/firecrawl-js` từ `apps/js-sdk` hoặc chuyển sang endpoint v2.
19. Fork drift: các sửa ở file gốc (CLAUDE.md, docker-compose rabbitmq, .gitignore) sẽ xung đột khi
    đồng bộ upstream. Giữ tùy biến trong `apps/ui/ingestion-ui` + `docker-compose.override.yaml`.

---

## 3. Lộ trình cải thiện (6 giai đoạn, ~9–11 ngày công)

| GĐ | Nội dung | Mục xử lý | Công | File chính |
|---|---|---|---|---|
| 0 | Sửa nhanh ít rủi ro | 0, 0b, 5, 6, 13, 15 | 0,5 ngày | `vite-plugin-cli.ts`, `aiEngines.ts`, `AIEngineSettings.tsx`, `markdownFormatter.ts`, `pnpm-workspace.yaml`, `CLAUDE.md` |
| 1 | Gia cố bảo mật bridge | 1, 2, 3, 4 | 1–1,5 ngày | `vite-plugin-cli.ts` → `server/bridge.ts`, `main.tsx` |
| 2 | Chất lượng nội dung | 7, 11 | 2 ngày | `pageScraper.ts`, `aiEngines.ts` (thêm `chunkMarkdown`) |
| 3 | Batch runner & lưu trữ | 8, 9, 10, 12 | 2–3 ngày | `BatchDocExtractor.tsx` → `hooks/useBatchRunner.ts`, `lib/sessionStore.ts`, `batchExporter.ts` |
| 4 | Test, lint, CI, refactor | 16, 17 | 2 ngày | `vitest` cho `src/lib/*`, `.github/workflows/ingestion-ui.yml` |
| 5 | Triển khai & đồng bộ upstream (tùy chọn) | 14, 18, 19 | 1–2 ngày | `Dockerfile`, `docker-compose.override.yaml`, client v2 |

Nguyên tắc: mỗi giai đoạn 1 PR riêng, có test cho logic thuần trước khi sửa (formatter, parser, scanner,
exporter, `parseAIOutputSafe`); không đụng `apps/api` trừ khi cần.

**Khuyến nghị:** làm ngay GĐ 0 + 1 (bảo mật là rủi ro thật trên máy Thầy), rồi GĐ 2–3 vì trực tiếp
quyết định chất lượng bản dịch/tài liệu đưa vào Obsidian.

---

## 4. Kiểm chứng
- `cd apps/ui/ingestion-ui && pnpm install && pnpm lint && pnpm build` (tsc + vite) phải sạch.
- `pnpm vitest run`: test formatter (mục có title không description vẫn giữ; đoạn chứa "Submit" không bị xóa),
  `convertHtmlToMarkdown` với HTML có div lồng/bảng, `parseDomSidebar` với HTML mẫu Frappe/Docusaurus.
- Bảo mật: `curl -X POST -H 'Content-Type: text/plain' -H 'Origin: https://evil.example' localhost:5173/api/cli/extract -d '{...}'` → 403;
  `curl 'localhost:5173/api/proxy/fetch-html?url=http://127.0.0.1:3002'` → 400.
- Timeout: giả lập CLI treo → nhận 504 một lần, dev server không crash.
- E2E thủ công (skill `run`/Playwright): quét `https://docs.frappe.io/education`, chạy 3 bài, Dừng giữa chừng
  rồi Bắt đầu lại → không có 2 vòng lặp; tải lại trang → khôi phục phiên từ IndexedDB; xuất Obsidian mở được trong vault.
