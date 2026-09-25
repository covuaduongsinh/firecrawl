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
