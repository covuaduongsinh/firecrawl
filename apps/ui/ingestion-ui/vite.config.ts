import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { cliBridgePlugin } from "./vite-plugin-cli"

// Dev: /firecrawl/* → Firecrawl API (same base URL as the production server in bridge/server.ts).
const firecrawlApiUrl = process.env.FIRECRAWL_API_URL || "http://localhost:3002"
const firecrawlApiKey = process.env.FIRECRAWL_API_KEY || ""

export default defineConfig({
  plugins: [react(), cliBridgePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/firecrawl": {
        target: firecrawlApiUrl,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/firecrawl/, ""),
        headers: firecrawlApiKey ? { Authorization: `Bearer ${firecrawlApiKey}` } : undefined,
      },
    },
  },
})
