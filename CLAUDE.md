Firecrawl is a web scraper API. The directory you have access to is a monorepo:
 - `apps/api` has the actual API and worker code (runs on `http://localhost:3002`)
 - `apps/*-sdk` are various SDKs
 - `apps/playwright-service-ts` is the headless Chromium microservice
 - `apps/ui/ingestion-ui` is the React/Vite web UI (runs on `http://localhost:5173`) — see below
 - `skills/` holds the Firecrawl skills for coding agents

When making changes to the API, here are the general steps you should take:
1. Write some end-to-end tests that assert your win conditions, if they don't already exist
  - 1 happy path (more is encouraged if there are multiple happy paths with significantly different code paths taken)
  - 1+ failure path(s)
  - Generally, E2E (called `snips` in the API) is always preferred over unit testing.
  - In the API, always use `scrapeTimeout` from `./lib` to set the timeout you use for scrapes.
  - These tests will be ran on a variety of configurations. You should gate tests in the following manner:
    - If it requires fire-engine: `!process.env.TEST_SUITE_SELF_HOSTED`
    - If it requires AI: `!process.env.TEST_SUITE_SELF_HOSTED || process.env.OPENAI_API_KEY || process.env.OLLAMA_BASE_URL`
2. Write code to achieve your win conditions
3. Run your tests using `pnpm harness jest ...`
  - `pnpm harness` is a command that gets the API server and workers up for you to run the tests. Don't try to `pnpm start` manually.
  - The full test suite takes a long time to run, so you should try to only execute the relevant tests locally, and let CI run the full test suite.
4. Push to a branch, open a PR, and let CI run to verify your win condition.
Keep these steps in mind while building your TODO list.

Never bypass `knip` failures (e.g. with `git commit --no-verify`). If the pre-commit `knip` check fails, fix the reported unused exports/files — even if they predate your change — before committing.

## Fork conventions (Dương Sinh)

- Put implementation and documentation plans in `docs/plans/YYYY-MM-DD-<topic>.md`.
- Run the full stack with `docker compose up -d`.
- Keep fork-specific changes inside `apps/ui/ingestion-ui` where possible, so syncing with upstream stays conflict-free.

### `apps/ui/ingestion-ui`

- Before pushing, run `pnpm build`, `pnpm test` and `pnpm lint` in `apps/ui/ingestion-ui`. `vite dev` does not typecheck, so only `pnpm build` catches type errors.
- Pure logic lives in `src/lib/*` and is covered by `*.test.ts` files (vitest + jsdom). Add a test there for every bug fix.
- The local bridge (`bridge/`) serves `/api/cli/*` and `/api/proxy/*` during `vite dev`. It runs the `claude`/`agy` CLIs and fetches arbitrary URLs, so every request must pass `bridge/security.ts` checks (loopback Host, same Origin, session token). Never add a CLI flag that grants tool or permission bypass (e.g. `--dangerously-skip-permissions`): prompts contain scraped web content.

## MCP

To use the Firecrawl MCP server with a local stack, create a `.mcp.json` (gitignored) at the repo root:

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
