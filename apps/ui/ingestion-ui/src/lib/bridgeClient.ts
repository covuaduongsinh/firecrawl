/** Must match BRIDGE_TOKEN_META / BRIDGE_TOKEN_HEADER in bridge/security.ts. */
const TOKEN_META = "firecrawl-bridge-token";
const TOKEN_HEADER = "X-Bridge-Token";

function bridgeToken(): string {
  return document.querySelector<HTMLMetaElement>(`meta[name="${TOKEN_META}"]`)?.content || "";
}

/** fetch() for the local bridge (/api/cli/*, /api/proxy/*): adds the per-session token header. */
export function bridgeFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set(TOKEN_HEADER, bridgeToken());
  return fetch(path, { ...init, headers });
}
