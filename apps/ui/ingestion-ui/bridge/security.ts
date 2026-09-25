import { randomBytes, timingSafeEqual } from "crypto";
import { lookup } from "dns/promises";
import type { IncomingMessage } from "http";
import net from "net";

export const BRIDGE_TOKEN_HEADER = "x-bridge-token";
export const BRIDGE_TOKEN_META = "firecrawl-bridge-token";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function createBridgeToken(): string {
  return randomBytes(32).toString("hex");
}

/** Hostnames the bridge answers to: loopback, plus any listed in BRIDGE_ALLOWED_HOSTS (comma separated). */
function allowedHostnames(): Set<string> {
  const extra = (process.env.BRIDGE_ALLOWED_HOSTS || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return new Set([...LOOPBACK_HOSTNAMES, ...extra]);
}

function hostnameOf(hostHeader: string): string {
  const host = hostHeader.trim().toLowerCase();
  if (host.startsWith("[")) {
    const end = host.indexOf("]");
    return end === -1 ? host : host.slice(0, end + 1);
  }
  return host.split(":")[0];
}

export type RequestCheck = { ok: true } | { ok: false; status: number; error: string };

/**
 * Rejects requests that could come from another website open in the same browser:
 * - Host must be loopback (blocks DNS rebinding),
 * - Origin, when sent, must be this same host (blocks cross-site form/fetch posts),
 * - the per-process token from the page's <meta> tag must be present (blocks simple requests,
 *   which cannot carry custom headers without a CORS preflight the bridge never answers).
 */
export function checkBridgeRequest(req: IncomingMessage, token: string): RequestCheck {
  const hostHeader = req.headers.host || "";
  if (!allowedHostnames().has(hostnameOf(hostHeader))) {
    return { ok: false, status: 403, error: `Bridge chỉ nhận yêu cầu từ localhost (Host: ${hostHeader}).` };
  }

  const origin = req.headers.origin;
  if (origin && origin !== "null") {
    let originHost = "";
    try {
      originHost = new URL(origin).host.toLowerCase();
    } catch {
      return { ok: false, status: 403, error: "Origin không hợp lệ." };
    }
    if (originHost !== hostHeader.toLowerCase()) {
      return { ok: false, status: 403, error: "Yêu cầu từ trang web khác bị từ chối." };
    }
  } else if (origin === "null") {
    return { ok: false, status: 403, error: "Origin không hợp lệ." };
  }

  if (req.headers["sec-fetch-site"] === "cross-site") {
    return { ok: false, status: 403, error: "Yêu cầu từ trang web khác bị từ chối." };
  }

  const sent = req.headers[BRIDGE_TOKEN_HEADER];
  if (typeof sent !== "string" || !tokensEqual(sent, token)) {
    return { ok: false, status: 403, error: "Thiếu hoặc sai bridge token. Hãy tải lại trang." };
  }

  return { ok: true };
}

function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

const PRIVATE_IPV4_RANGES: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

/** True for loopback, private, link-local, CGNAT, multicast and reserved addresses. */
export function isPrivateAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) {
    const value = ipv4ToInt(ip);
    return PRIVATE_IPV4_RANGES.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (value & mask) === (ipv4ToInt(base) & mask);
    });
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return (
      lower === "::" ||
      lower === "::1" ||
      /^f[cd][0-9a-f]{2}:/.test(lower) ||
      /^fe[89ab][0-9a-f]:/.test(lower) ||
      lower.startsWith("ff")
    );
  }
  return true;
}

/**
 * Validates that a URL may be fetched by the proxy: http(s) only and resolving to public addresses,
 * unless BRIDGE_ALLOW_PRIVATE_URLS=1 (for scraping intranet docs on purpose).
 * Throws an Error with a user-facing message otherwise.
 */
export async function assertFetchableUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`URL không hợp lệ: ${rawUrl}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`Chỉ hỗ trợ http/https (nhận: ${url.protocol}).`);
  }
  if (process.env.BRIDGE_ALLOW_PRIVATE_URLS === "1") return url;

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(hostname)
    ? [hostname]
    : (await lookup(hostname, { all: true })).map((a) => a.address);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new Error(
      `Không cho phép tải địa chỉ nội bộ (${url.hostname}). Đặt BRIDGE_ALLOW_PRIVATE_URLS=1 nếu thật sự cần.`
    );
  }
  return url;
}
