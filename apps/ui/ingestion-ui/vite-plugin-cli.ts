import type { Plugin } from "vite";
import { createBridgeMiddleware } from "./bridge/middleware";
import { BRIDGE_TOKEN_META, createBridgeToken } from "./bridge/security";

/**
 * Dev-server bridge for /api/cli/* (local claude/agy CLIs) and /api/proxy/* (HTML fetch).
 * A fresh token is embedded in index.html on every start; the bridge rejects requests without it.
 */
export function cliBridgePlugin(): Plugin {
  const token = createBridgeToken();
  return {
    name: "vite-plugin-firecrawl-cli-bridge",
    // Dev server only: the production server (bridge/server.ts) injects its own token at runtime.
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(createBridgeMiddleware({ token }));
    },
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { name: BRIDGE_TOKEN_META, content: token },
          injectTo: "head",
        },
      ];
    },
  };
}
