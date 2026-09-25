# Firecrawl Ingestion UI — production image (static app + bridge server, no nginx).
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# The API is reached through the server's /firecrawl proxy, so no URL or key is baked into the bundle.
ENV VITE_FIRECRAWL_API_URL=/firecrawl
RUN pnpm build && pnpm build:server

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3006 \
    UI_DIST_DIR=/app/dist \
    FIRECRAWL_API_URL=http://api:3002
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server/server.mjs ./server.mjs
USER node
EXPOSE 3006
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3006/healthz >/dev/null || exit 1
CMD ["node", "server.mjs"]
