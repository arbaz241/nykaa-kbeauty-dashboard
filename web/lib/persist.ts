"use client";

/** A copy of each fully fetched view in the browser's IndexedDB, so a page opens on the last download instead of
 *  waiting ~5 s for 10+ MB again. The data changes once a night; fetchAll still refreshes every view in the
 *  background on each visit and swaps in the new rows. Every call fails soft: without storage the app fetches as before. */

const DB = "nykaa-cache", STORE = "views", VERSION = 1;

let opened: Promise<IDBDatabase | null> | null = null;
function db(): Promise<IDBDatabase | null> {
  if (!opened) opened = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch { resolve(null); }
  });
  return opened;
}

function run<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return db().then((d) => new Promise<T | undefined>((resolve) => {
    if (!d) return resolve(undefined);
    try {
      const req = work(d.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => resolve(undefined);
    } catch { resolve(undefined); }
  }));
}

export const readCached = <T>(key: string) => run<T[]>("readonly", (s) => s.get(key));
export const writeCached = (key: string, rows: unknown[]) => run("readwrite", (s) => s.put(rows, key));
/** On sign-out, so the next person on this browser does not open on the previous user's download. */
export const clearCached = () => run("readwrite", (s) => s.clear());
