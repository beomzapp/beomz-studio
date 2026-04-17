/**
 * BEO-375: IndexedDB cache for WebContainer state.
 *
 * Two stores:
 *   files-v1       — source file list keyed by wc-{projectId}-{generationId}
 *   node-modules-v1 — node_modules binary snapshot (fixed key "v1")
 *
 * All errors are swallowed — cache is best-effort and never blocks the boot path.
 */

import type { StudioFile } from "@beomz-studio/contracts";

const DB_NAME = "beomz-wc-cache";
const DB_VERSION = 1;
const STORE_FILES = "files-v1";
const STORE_NM = "node-modules-v1";
const NM_KEY = "v1";

// Cached DB handle — opened once, reused across calls.
let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_FILES)) db.createObjectStore(STORE_FILES);
      if (!db.objectStoreNames.contains(STORE_NM)) db.createObjectStore(STORE_NM);
    };
    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(store: string, key: string): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const req = db.transaction(store, "readonly").objectStore(store).get(key);
        req.onsuccess = () => resolve((req.result as T) ?? null);
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbPut(store: string, key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      }),
  );
}

// ── Files cache ─────────────────────────────────────────────────────────────

export type CachedFiles = ReadonlyArray<Pick<StudioFile, "path" | "content" | "kind">>;

export async function wcCacheGetFiles(
  projectId: string,
  generationId: string,
): Promise<CachedFiles | null> {
  try {
    return await idbGet<CachedFiles>(STORE_FILES, `wc-${projectId}-${generationId}`);
  } catch {
    return null;
  }
}

export async function wcCacheSetFiles(
  projectId: string,
  generationId: string,
  files: CachedFiles,
): Promise<void> {
  try {
    // Serialise to a plain array so IndexedDB can store it
    await idbPut(STORE_FILES, `wc-${projectId}-${generationId}`, Array.from(files));
  } catch {
    // non-fatal
  }
}

// ── node_modules binary cache ────────────────────────────────────────────────

export async function wcCacheGetNodeModules(): Promise<Uint8Array | null> {
  try {
    return await idbGet<Uint8Array>(STORE_NM, NM_KEY);
  } catch {
    return null;
  }
}

export async function wcCacheSetNodeModules(data: Uint8Array): Promise<void> {
  try {
    await idbPut(STORE_NM, NM_KEY, data);
  } catch {
    // non-fatal
  }
}
