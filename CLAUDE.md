# Firecrawl - AI & Assistant System Guide

You are assisting with the **Firecrawl** project — a high-performance, open-source web data extraction and scraping platform built for AI/LLM applications, RAG systems, and autonomous agents.

---

## 1. Project Structure & Architecture

Firecrawl is structured as a TypeScript/Node.js monorepo:
- **`apps/api`**: Core REST API, job schedulers, NuQ distributed queue, and worker services (runs on `http://localhost:3002`).
- **`apps/playwright-service-ts`**: Headless browser Chromium microservice (Playwright) for dynamic JS rendering and browser actions.
- **`apps/ui/ingestion-ui`**: React/Vite/Tailwind Web Dashboard (runs on `http://localhost:5173`).
- **`apps/nuq-postgres`**: PostgreSQL schema & extensions for high-throughput distributed queues.
- **`apps/*-sdk`**: Official client SDKs in Python, TypeScript/JS, Go, Rust, Java, .NET, PHP, Ruby, Elixir.
- **`.claude/skills/`**: Firecrawl-native skills for Claude Code and Antigravity CLI agents.

---

## 2. Global Rules & Guidelines

1. **Plans Directory Rule:**
   - Always place implementation plans and documentation plans in `/docs/plans/` (e.g. `docs/plans/YYYY-MM-DD-<topic>.md`).
2. **Local Endpoints:**
   - **Backend API:** `http://localhost:3002`
   - **Frontend Web UI:** `http://localhost:5173`
3. **Running the Stack:**
   - Use Docker Compose: `docker compose up -d`
   - Use `pnpm harness` for API local development/testing. Do not try to `pnpm start` manually without harness.
4. **Code Quality & Verification:**
   - Never bypass `knip` failures (e.g. with `git commit --no-verify`).
   - E2E tests (`snips` in `apps/api/src/__tests__/snips/`) are preferred over unit tests.
   - Test timeout: Always use `scrapeTimeout` from `./lib` in `apps/api`.
   - Test gating:
     - If it requires fire-engine: `!process.env.TEST_SUITE_SELF_HOSTED`
     - If it requires AI: `!process.env.TEST_SUITE_SELF_HOSTED || process.env.OPENAI_API_KEY || process.env.OLLAMA_BASE_URL`

---

## 3. Model Context Protocol (MCP) Integration

Firecrawl provides a native MCP server for Claude Code, Antigravity CLI, Cursor, and other AI tools.
Configured in `.mcp.json`:
```json
{
  "mcpServers": {
    "firecrawl": {
      "command": "npx",
      "args": ["-y", "firecrawl-mcp"],
      "env": {
        "FIRECRAWL_API_URL": "http://localhost:3002",
        "FIRECRAWL_API_KEY": ""
      }
    }
  }
}
```

### Available MCP Tools:
- **`firecrawl_scrape`**: Scrape a single URL to clean markdown, HTML, or screenshot.
- **`firecrawl_crawl`**: Asynchronously crawl all sub-pages of a website.
- **`firecrawl_map`**: Rapidly list all URLs on a domain.
- **`firecrawl_extract`**: Extract structured data using LLMs and JSON schemas.
- **`firecrawl_search`**: Search the web and return markdown content for results.