import { clear, createStore, del, get, set } from "idb-keyval";
import type { DocCategory } from "./docTreeScanner";

/**
 * Batch sessions (scanned tree + translated articles) are kept in IndexedDB: a few dozen translated
 * pages already exceed localStorage's ~5 MB quota, which used to fail silently.
 */
export interface BatchSession {
  url: string;
  timestamp: string;
  categories: DocCategory[];
}

const store = createStore("firecrawl-ingestion-ui", "batch-sessions");
export const LEGACY_SESSION_PREFIX = "firecrawl_batch_cache_";

function sessionKey(rootUrl: string): string {
  return rootUrl.trim().replace(/\/+$/, "");
}

function legacyKey(rootUrl: string): string {
  return `${LEGACY_SESSION_PREFIX}${rootUrl.trim().replace(/[^a-zA-Z0-9]/g, "_")}`;
}

export async function saveSession(rootUrl: string, categories: DocCategory[]): Promise<void> {
  if (!rootUrl.trim()) return;
  const session: BatchSession = { url: rootUrl.trim(), timestamp: new Date().toISOString(), categories };
  await set(sessionKey(rootUrl), session, store);
}

/** Loads a session, migrating one saved by older versions in localStorage. */
export async function loadSession(rootUrl: string): Promise<BatchSession | null> {
  if (!rootUrl.trim()) return null;
  const saved = await get<BatchSession>(sessionKey(rootUrl), store);
  if (saved && Array.isArray(saved.categories) && saved.categories.length > 0) return saved;

  try {
    const raw = localStorage.getItem(legacyKey(rootUrl));
    if (!raw) return null;
    const legacy = JSON.parse(raw) as Partial<BatchSession>;
    if (!Array.isArray(legacy.categories) || legacy.categories.length === 0) return null;
    const migrated: BatchSession = {
      url: rootUrl.trim(),
      timestamp: legacy.timestamp || new Date().toISOString(),
      categories: legacy.categories,
    };
    await set(sessionKey(rootUrl), migrated, store);
    localStorage.removeItem(legacyKey(rootUrl));
    return migrated;
  } catch {
    return null;
  }
}

export async function deleteSession(rootUrl: string): Promise<void> {
  await del(sessionKey(rootUrl), store);
}

/** Removes every saved batch session (IndexedDB and legacy localStorage), keeping settings and prompts. */
export async function clearAllSessions(): Promise<void> {
  Object.keys(localStorage)
    .filter((key) => key.startsWith(LEGACY_SESSION_PREFIX))
    .forEach((key) => localStorage.removeItem(key));
  await clear(store);
}

export function countDoneItems(categories: DocCategory[]): number {
  return categories.reduce(
    (acc, cat) => acc + cat.items.filter((i) => i.status === "done" || !!i.markdownOutput).length,
    0
  );
}
