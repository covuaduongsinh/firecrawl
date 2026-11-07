# Kế hoạch & Nhật ký triển khai Firecrawl lên VPS Dokploy

- **Ngày thực hiện:** 2026-11-07
- **Mục tiêu:** Cập nhật phiên bản mới nhất từ repository GitHub (`origin/main`) lên VPS qua Dokploy và SSH.
- **Thông số triển khai:**
  - **VPS IP:** `217.15.160.118`
  - **SSH:** user `root`, port `22`, khóa `C:\Users\duongsinh\.ssh\id_ed25519`
  - **Dokploy URL:** `https://dokploy.dsc.edu.vn`
  - **Dokploy Project:** `compose-navigate-online-bus-tlk6tz` (Tên hiển thị: `firecrawl-app`, ID: `oaE7L3G64ZEqKRL4YvxAv`)
  - **Domain:** `https://firecrawl.dsc.edu.vn`

---

## 1. Khảo sát kiến trúc hiện tại trên VPS

1. **Routing Traefik:**
   - Traefik của Dokploy điều hướng tên miền `firecrawl.dsc.edu.vn`:
     - PathPrefix `/v1`, `/v0`, `/admin`, `/health` -> Service `api:3002`
     - Tất cả các path còn lại -> Service `ui:80` (container `nginx:alpine`)
2. **Mount Volume của UI:**
   - Container Nginx mount thư mục tĩnh từ `/var/www/firecrawl-ui` trên host VPS.
   - Thư mục này bao gồm bundle tĩnh (`index.html`, `assets/`, `favicon.ico`, `vite.svg`) và cấu hình `nginx.conf`, `bridge.js`.
3. **Mã nguồn trên VPS:**
   - Thư mục `/root/firecrawl` là clone của `https://github.com/covuaduongsinh/firecrawl.git`.
   - Cần `git pull` để nhận các commit mới (bao gồm 435 commit từ upstream và các tính năng UI mới).

---

## 2. Các bước triển khai

### Bước 1: Cập nhật mã nguồn trên VPS
```bash
cd /root/firecrawl && git pull origin main
```

### Bước 2: Cài đặt dependencies và build frontend
```bash
cd /root/firecrawl/apps/ui/ingestion-ui
pnpm install
pnpm build
```

### Bước 3: Đồng bộ bản build vào thư mục phục vụ web của Nginx
```bash
cp -r /root/firecrawl/apps/ui/ingestion-ui/dist/* /var/www/firecrawl-ui/
```

### Bước 4: Kích hoạt Dokploy Deploy
Gọi API Dokploy với khóa xác thực:
```bash
POST https://dokploy.dsc.edu.vn/api/compose.deploy
Headers:
  x-api-key: firecrawl_appeawBFEvPFfGFPJnQWALBbhrRVDAPYkHXPSCWspSaMcyUgMZJfIsjwESJxWeemKSs
Body:
  {"composeId": "oaE7L3G64ZEqKRL4YvxAv"}
```
Đồng thời khởi động lại container `ui` nếu cần để nạp ngay bản build mới.

### Bước 5: Kiểm tra xác minh sau deploy
- Kiểm tra mã phản hồi HTTP `https://firecrawl.dsc.edu.vn` (200 OK).
- Kiểm tra nội dung `index.html` và hash bundle JavaScript mới.
- Kiểm tra API Core `/v1/scrape` và `/health`.
