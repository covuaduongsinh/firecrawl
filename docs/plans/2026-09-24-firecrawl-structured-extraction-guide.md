# Hướng dẫn chi tiết sử dụng tính năng Structured Extraction (/v1/extract) trong Firecrawl

> **Mục tiêu:** Hướng dẫn cấu hình LLM (OpenAI, Ollama, DeepSeek, v.v.) và thực thi các yêu cầu trích xuất dữ liệu có cấu trúc (JSON Schema) từ website thông qua endpoint `/v1/extract`.

---

## 1. Bản chất của Structured Extraction

**Structured Extraction** là tính năng kết hợp giữa:
1. **Web Scraper (Firecrawl):** Cào toàn bộ nội dung web, tài liệu hoặc danh sách trang.
2. **LLM Engine (AI):** Đọc hiểu toàn bộ văn bản và bóc tách chính xác các trường thông tin theo đúng định dạng JSON Schema hoặc theo câu lệnh (Prompt) mà bạn chỉ định.

---

## 2. Cấu hình Model AI (LLM Provider)

Để sử dụng `/v1/extract`, bạn cần cung cấp một nhà cung cấp AI trong file `.env` ở thư mục gốc:

### Lựa chọn A: Dùng OpenAI (GPT-4o, GPT-4o-mini)
Mở file `.env` và thêm:
```env
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx
MODEL_NAME=gpt-4o-mini
```

### Lựa chọn B: Dùng Ollama (Chạy AI Offline miễn phí 100% trên máy)
Nếu bạn đã cài Ollama trên máy tính (ví dụ model `llama3.2` hoặc `qwen2.5`):
```env
OLLAMA_BASE_URL=http://host.docker.internal:11434
MODEL_NAME=llama3.2
```

### Lựa chọn C: Dùng OpenRouter / DeepSeek / Groq (Tương thích OpenAI API)
```env
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_API_KEY=sk-or-xxxxxxxxxxxxxxxxxxxx
MODEL_NAME=deepseek/deepseek-chat
```

*Sau khi chỉnh sửa `.env`, chỉ cần chạy lại:*
```powershell
docker compose up -d api
```

---

## 3. Cách gọi API `/v1/extract`

### Ví dụ 1: Trích xuất bằng câu lệnh tự nhiên (Prompt)

#### PowerShell / cURL:
```powershell
Invoke-RestMethod -Uri "http://localhost:3002/v1/extract" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{
    "urls": ["https://news.ycombinator.com"],
    "prompt": "Trích xuất danh sách top 3 bài viết nổi bật gồm: tiêu đề (title), số điểm (points), và link bài viết (url)."
  }' | ConvertTo-Json -Depth 6
```

---

### Ví dụ 2: Trích xuất theo JSON Schema chuẩn (Strict Structured Output)

Bạn định nghĩa rõ ràng các trường, kiểu dữ liệu (`string`, `number`, `array`, `object`):

```powershell
$body = @{
  urls = @("https://docs.frappe.io/education/student")
  prompt = "Trích xuất thông tin tài liệu hướng dẫn module Student trong Frappe Education"
  schema = @{
    type = "object"
    properties = @{
      module_name = @{ type = "string"; description = "Tên module" }
      features = @{
        type = "array"
        items = @{ type = "string" }
        description = "Danh sách các tính năng chính"
      }
      prerequisites = @{
        type = "array"
        items = @{ type = "string" }
        description = "Các điều kiện tiên quyết"
      }
    }
    required = @("module_name", "features")
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod -Uri "http://localhost:3002/v1/extract" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body $body | ConvertTo-Json -Depth 6
```

---

## 4. Sử dụng qua Python SDK (`firecrawl-py`)

```python
from firecrawl import FirecrawlApp
from pydantic import BaseModel, Field
from typing import List

# Khởi tạo client trỏ về local
app = FirecrawlApp(api_url="http://localhost:3002")

# Định nghĩa cấu trúc dữ liệu mong muốn bằng Pydantic
class ArticleExtract(BaseModel):
    title: str = Field(description="Tiêu đề bài viết")
    author: str = Field(description="Tác giả")
    summary: str = Field(description="Tóm tắt nội dung chính")
    key_points: List[str] = Field(description="Các ý chính trong bài")

# Gọi extract
data = app.extract(
    urls=["https://example.com/blog/article-1"],
    params={
        "prompt": "Trích xuất thông tin bài viết theo schema",
        "schema": ArticleExtract.model_json_schema()
    }
)

print(data)
```
