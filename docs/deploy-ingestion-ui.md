# Deploy Ingestion UI lên VPS

Hướng dẫn chạy Firecrawl + giao diện Ingestion UI (Batch Crawler & AI Extractor) trên một VPS Linux
(Ubuntu 22.04/24.04), truy cập qua domain có HTTPS và mật khẩu.

## Kiến trúc

```
Trình duyệt ──HTTPS──▶ Caddy (443) ──▶ ingestion-ui (127.0.0.1:5173)
                                         ├─ trang web (dist/)
                                         ├─ /api/proxy/*  tải trang tài liệu (chặn IP nội bộ)
                                         └─ /firecrawl/*  ──▶ api:3002 (mạng nội bộ Docker, gắn API key phía server)
```

- **Cầu nối CLI (`claude`/`agy`) bị tắt trên server.** Dùng AI qua API key (Gemini, Claude, OpenAI/DeepSeek)
  trong phần *Cài đặt AI Engine*. CLI chỉ dùng được khi chạy `pnpm dev` trên máy cá nhân.
- API key AI do người dùng nhập được lưu trong trình duyệt của người đó (localStorage), không lưu trên server.

## Yêu cầu

- VPS tối thiểu 4 vCPU / 8 GB RAM (API + Playwright + Redis + RabbitMQ + Postgres), 30 GB ổ đĩa.
- Docker Engine + Docker Compose plugin: `curl -fsSL https://get.docker.com | sh`
- Một domain (ví dụ `crawl.covuaduongsinh.com`) trỏ bản ghi A về IP của VPS.

## Các bước

### 1. Lấy mã nguồn

```bash
git clone https://github.com/covuaduongsinh/firecrawl.git
cd firecrawl
```

### 2. Tạo file `.env` ở thư mục gốc repo

```bash
# --- Firecrawl API ---
USE_DB_AUTHENTICATION=false
# Chỉ mở cổng API cho chính VPS (không public ra Internet):
PORT=127.0.0.1:3002
BULL_AUTH_KEY=<chuỗi-ngẫu-nhiên-dài>

# --- Ingestion UI ---
UI_DOMAIN=crawl.covuaduongsinh.com
UI_BASIC_AUTH=thay:<mật-khẩu-mạnh>
# Cổng nội bộ để Caddy chuyển tiếp (mặc định 127.0.0.1:5173)
UI_BIND=127.0.0.1
UI_PORT=5173
```

Tạo chuỗi ngẫu nhiên: `openssl rand -hex 24`.

> Server UI **từ chối khởi động** nếu đặt `UI_DOMAIN` mà thiếu `UI_BASIC_AUTH` — để tránh vô tình mở công cụ ra Internet.

### 3. Build và chạy

```bash
docker compose --profile ui up -d --build
docker compose ps            # các service phải "running"/"healthy"
docker compose logs -f ingestion-ui
```

### 4. HTTPS bằng Caddy

```bash
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile >/dev/null <<'CADDY'
crawl.covuaduongsinh.com {
    encode gzip
    reverse_proxy 127.0.0.1:5173
}
CADDY
sudo systemctl reload caddy
```

Caddy tự xin chứng chỉ Let's Encrypt. Mở tường lửa cho 80/443, **không** mở 3002/5173:

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

## Kiểm tra sau deploy

| Kiểm tra | Lệnh / thao tác | Kết quả đúng |
|---|---|---|
| Health | `curl -s https://crawl.covuaduongsinh.com/healthz` | `ok` |
| Bắt đăng nhập | `curl -s -o /dev/null -w '%{http_code}' https://crawl.covuaduongsinh.com/` | `401` |
| API không public | `curl -m 5 http://<IP-VPS>:3002` từ máy khác | timeout / refused |
| Giao diện | Mở domain, đăng nhập, *Quét Cây Mục Lục* với `https://docs.frappe.io/education` | hiện cây chuyên mục |
| AI | *Cài đặt AI Engine* → nhập API key → *Kiểm tra kết nối* | ✅ |

## Cập nhật phiên bản mới

```bash
cd firecrawl
git pull
docker compose --profile ui up -d --build ingestion-ui
```

## Biến môi trường của `ingestion-ui`

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `UI_BASIC_AUTH` | (trống) | `user:password`; bắt buộc khi có `UI_DOMAIN` |
| `UI_DOMAIN` → `BRIDGE_ALLOWED_HOSTS` | (trống) | Domain được phép truy cập (ngoài localhost) |
| `UI_FIRECRAWL_API_KEY` → `FIRECRAWL_API_KEY` | (trống) | Key gửi tới Firecrawl API (khi bật `USE_DB_AUTHENTICATION`) |
| `UI_BIND`, `UI_PORT` | `127.0.0.1`, `5173` | Địa chỉ/cổng mở ra ngoài container |
| `BRIDGE_ALLOW_PRIVATE_URLS` | tắt | `1` = cho phép tải trang trong mạng nội bộ (không khuyến nghị trên VPS) |
| `BRIDGE_ENABLE_CLI` | tắt | Không bật trên VPS |

## Sự cố thường gặp

- **Trang trắng / 401 lặp lại**: sai `UI_BASIC_AUTH`; sửa `.env` rồi `docker compose --profile ui up -d ingestion-ui`.
- **"Bridge chỉ nhận yêu cầu từ localhost"**: `UI_DOMAIN` chưa khớp domain đang truy cập.
- **"Không kết nối được Firecrawl API"**: service `api` chưa chạy — xem `docker compose logs api`.
- **Quét cây không ra bài**: trang tài liệu chặn bot hoặc cần JavaScript; thử lại khi `api` + `playwright-service` đã chạy (tầng dự phòng dùng Firecrawl).
