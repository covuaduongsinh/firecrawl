import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { cliBridgePlugin } from "./vite-plugin-cli"

export default defineConfig({
  plugins: [react(), cliBridgePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
