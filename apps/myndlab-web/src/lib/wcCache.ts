/**
 * BEO-375: IndexedDB cache for WebContainer state.
 *
 * Two stores:
 *   files-v3        — source file list keyed by wc-{projectId}-{generationId}
 *   node-modules-v2 — node_modules binary snapshot (fixed key "v2")
 *
 * DB_VERSION bumped to 2 (BEO-202): old "node-modules-v1" binaries were
 * exported without the mountPoint fix and silently break Vite on mount.
 * Bumping the key guarantees a cache miss for all existing users, forcing a
 * clean npm install that exports a correct v2 binary.
 *
 * DB_VERSION bumped to 3 (BEO-482 NUCLEAR): renamed files store from
 * "files-v1" to "files-v3" to evict ALL existing file cache entries for every
 * user. Any stale "Product Catalog" scaffold entries that survived the Fix 1
 * (skip if build in progress) and Fix 2 (poison-pill signature check) guards
 * are permanently unreachable — the old "files-v1" store is deleted on
 * upgrade and the new "files-v3" store starts empty. No stale entries survive.
 *
 * All errors are swallowed — cache is best-effort and never blocks the boot path.
 */

import type { StudioFile } from "@beomz-studio/contracts";

const DB_NAME = "beomz-wc-cache";
const DB_VERSION = 3;
const STORE_FILES = "files-v3";
const STORE_NM = "node-modules-v2";
const NM_KEY = "v2";

// Cached DB handle — opened once, reused across calls.
let _db: IDBDatabase | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      // BEO-482 NUCLEAR: delete the old files-v1 store so no scaffold entries
      // survive the version bump. The new files-v3 store starts completely empty.
      if (db.objectStoreNames.contains("files-v1")) db.deleteObjectStore("files-v1");
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

export async function wcCacheDeleteFiles(
  projectId: string,
  generationId: string,
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_FILES, "readwrite");
      tx.objectStore(STORE_FILES).delete(`wc-${projectId}-${generationId}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // non-fatal
  }
}

export async function wcCacheDeleteNodeModules(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NM, "readwrite");
      tx.objectStore(STORE_NM).delete(NM_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // non-fatal
  }
}
