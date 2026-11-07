# Tiến độ viết tài liệu

- **Repo nguồn**: repo này (tài liệu nằm ngay trong `docs/`, theo lựa chọn của chủ fork ngày 2026-09-30)
- **Commit đang bám**: `96a8e0ae3d` (2026-09-26)
- **Ngôn ngữ**: Tiếng Việt, hai tầng (Phần A chức năng, Phần B kỹ thuật)
- **Phạm vi**: toàn bộ monorepo, mức sâu như nhau (chủ fork chọn 2026-09-30)
- **Cập nhật lần cuối**: 2026-09-30

## Quy ước

Mỗi tài liệu: một file, hai tầng, kết bằng "Điểm cần lưu ý và hạn chế" + "Đường dẫn tham chiếu nhanh". Chỉ dùng đường dẫn tương đối. Số dòng lấy bằng script/`wc -l`, bảng tra cứu sinh từ mã. Nghi vấn lỗi ghi rõ là "chưa kiểm chứng". Mỗi tài liệu tính năng là **một lượt hội thoại riêng**; xong thì cập nhật file này rồi dừng.

Vị trí file:

| File | Mục đích |
|---|---|
| `docs/TONG-QUAN-FIRECRAWL.md` | Bản đồ toàn hệ thống |
| `docs/PROGRESS.md` | Danh sách tính năng và tiến độ (file này) |
| `docs/LICH-SU-TUONG-TAC.md` | Nhật ký các lượt làm việc, quyết định, lỗi đã bắt |
| `docs/tinh-nang/<slug>.md` | Tài liệu chuyên sâu từng tính năng (pha 2) |

## Tổng quan

- [x] `docs/TONG-QUAN-FIRECRAWL.md`

## Tính năng (ĐỀ XUẤT, chờ chủ fork duyệt)

Số dòng là ước tính bằng script (tổng các file mã, không tính test), có thể chồng lấn giữa các hàng. Mục tiêu 1.000–12.000 dòng mỗi tài liệu, nên hàng lớn hơn được đề xuất tách.

| # | Tính năng | Module chính | Dòng ước tính | Đề xuất | File | Trạng thái |
|---|---|---|---:|---|---|---|
| 1 | Pipeline scrape và engine | `apps/api/src/scraper/scrapeURL`, `controllers/v2/scrape*.ts`, `parse*.ts` | 26.717 | Tách 2–3 tài liệu (lõi + engine; PDF/document; transformer) | `tinh-nang/scrape-*.md` | ⬜ |
| 2 | Crawl, batch scrape, map | `scraper/WebScraper`, `controllers/v2/crawl*.ts`, `map.ts` | 6.510 | Một tài liệu | `tinh-nang/crawl-batch-map.md` | ⬜ |
| 3 | Search | `apps/api/src/search`, `controllers/v2/search*.ts` | 3.357 | Một tài liệu | `tinh-nang/search.md` | ⬜ |
| 4 | Extract và JSON xác định | `lib/extract`, `lib/deterministicJson`, `controllers/v2/extract*.ts` | 29.494 | Tách 2–3 tài liệu | `tinh-nang/extract-*.md` | ⬜ |
| 5 | Agent, Browser, Interact | `controllers/v2/agent*.ts`, `browser*.ts`, `lib/scrape-interact` | 5.138 | Một tài liệu | `tinh-nang/agent-browser.md` | ⬜ |
| 6 | Monitor thay đổi trang | `services/monitoring`, `controllers/v2/monitor.ts` | 8.183 | Một tài liệu | `tinh-nang/monitor.md` | ⬜ |
| 7 | Hàng đợi NuQ và worker | `services/worker`, `services/queue-*.ts`, `apps/nuq-postgres` | 11.040 | Một tài liệu (thuật toán hàng đợi, khoá, ưu tiên) | `tinh-nang/nuq-worker.md` | ⬜ |
| 8 | Xác thực, billing, giới hạn | `services/autumn`, `services/billing`, `rate-limiter.ts`, `lib/concurrency-*.ts` | 5.963 | Một tài liệu | `tinh-nang/auth-billing.md` | ⬜ |
| 9 | Bảo mật doanh nghiệp và SIEM | `lib/threat-protection`, `lib/siem-logging`, `controllers/v2/team-*.ts` | 7.323 | Một tài liệu | `tinh-nang/bao-mat-siem.md` | ⬜ |
| 10 | Branding | `lib/branding` | 3.424 | Một tài liệu | `tinh-nang/branding.md` | ⬜ |
| 11 | llms.txt và deep research | `lib/generate-llmstxt`, `lib/deep-research` | 1.805 | Gộp một tài liệu | `tinh-nang/llmstxt-deep-research.md` | ⬜ |
| 12 | Exchange, Labs, Alexandria | `routes/exchange.ts`, `routes/labs.ts`, `lib/exchange*.ts`, `services/alexandria` | 3.330 | Một tài liệu (cần làm rõ nghiệp vụ trước) | `tinh-nang/exchange-labs.md` | ⬜ |
| 13 | Tích hợp: MCP, Slack, thông báo, webhook | `services/mcp`, `integrations`, `notification`, `webhook` | 4.713 | Một tài liệu | `tinh-nang/tich-hop.md` | ⬜ |
| 14 | Hạ tầng: Playwright, Go, Rust native, Redis | `apps/playwright-service-ts`, `go-html-to-md-service`, `apps/api/native`, `apps/redis` | 5.039 | Một tài liệu | `tinh-nang/ha-tang-dich-vu.md` | ⬜ |
| 15 | SDK JavaScript và Python | `apps/js-sdk`, `apps/python-sdk` | 37.126 | Tách 2 tài liệu (mỗi SDK một) | `tinh-nang/sdk-js.md`, `sdk-python.md` | ⬜ |
| 16 | 7 SDK còn lại | Go, Java, Rust, Ruby, PHP, Elixir, .NET | 40.408 | Một tài liệu mẫu chung + phụ lục từng ngôn ngữ | `tinh-nang/sdk-khac.md` | ⬜ |
| 17 | Ingestion UI (fork) | `apps/ui/ingestion-ui/src`, `bridge` | 6.817 | Một tài liệu; **ưu tiên vì là phần của chủ fork** | `tinh-nang/ingestion-ui.md` | ⬜ |
| 18 | Skills, ví dụ, CI và triển khai | `skills/`, `examples/`, `.github/workflows/`, `docker-compose.yaml` | chưa đếm | Một tài liệu | `tinh-nang/skills-vi-du-ci.md` | ⬜ |
| 19 | Bộ test end-to-end "snips" | `apps/api/src/__tests__` (39.848 dòng test) | — | Một tài liệu (cách viết, cổng điều kiện) | `tinh-nang/test-snips.md` | ⬜ |

Tổng số tài liệu dự kiến nếu chấp nhận đề xuất tách: khoảng 26–30 file.

### Việc cần chủ fork quyết trước khi sang pha 2

1. Danh sách có thiếu gì hoặc mục nào không cần viết?
2. Thứ tự ưu tiên. Gợi ý: **#17 Ingestion UI** (phần của bạn, nhỏ, cần sửa README lỗi thời) → **#1 Scrape** → **#7 NuQ** → **#2 Crawl** → phần còn lại theo nhu cầu nhân bản.
3. Với mỗi tính năng, câu hỏi phạm vi (sâu tới đâu, có lấy module kề không) sẽ hỏi ở đầu lượt của tính năng đó.

## Ghi chú giữa các lượt

- 2026-09-30: chủ fork chọn **ghi toàn bộ trong repo** (không tách repo tài liệu). Hệ quả: bất biến "không ghi vào repo nguồn" được thay bằng "chỉ ghi vào `docs/` và một đoạn con trỏ trong `CLAUDE.md`". `README.md` và `AGENTS.md` gốc là file upstream nên **không sửa** để đồng bộ upstream không xung đột.
- Bảng route trong tổng quan sinh bằng regex nên là cận dưới; nếu cần số chính xác sẽ đếm lại ở tài liệu tính năng tương ứng.
- Các hàng #1, #4, #15, #16 vượt xa mức 12.000 dòng; cách tách cụ thể sẽ chốt ở câu hỏi phạm vi của lượt đó.
