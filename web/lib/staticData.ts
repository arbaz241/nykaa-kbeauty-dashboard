"use client";

import { mutate } from "swr";

/** The nightly data files next to the site (scripts/export-data.mjs, owner 19 Oct 2026: pages open in 0.1-0.2 s).
 *  The build carries their manifest: which files exist and when each copy was built. The files live under a folder
 *  named after the build stamp and never change, so the browser keeps them until the next night's files. No manifest
 *  (sign-in required, or a local build without the service key): every read goes to the database as before. */
interface Manifest { stamp: string; built: Record<string, string>; tables: string[] }
const M: Manifest | null = (() => {
  try { const s = process.env.NEXT_PUBLIC_DATA_MANIFEST; return s ? (JSON.parse(s) as Manifest) : null; } catch { return null; }
})();

/** The files exist only while anyone with the link may open the site, so pages need not wait for a sign-in. */
export const openSite = !!M;
export const hasStatic = (name: string) => !!M && (name in M.built || M.tables.includes(name));
/** When the file's copy was built (to tell whether the database holds a newer one). */
export const staticBuilt = (name: string) => M?.built[name] ?? null;
export const staticNames = () => (M ? [...Object.keys(M.built), ...M.tables] : []);

const docs = new Map<string, Promise<unknown>>();
export function staticDoc(name: string): Promise<unknown> {
  if (!docs.has(name)) {
    docs.set(name, fetch(`/data/${M!.stamp}/${name}.json`).then((r) => { if (!r.ok) throw new Error(`${name}: ${r.status}`); return r.json(); }));
    docs.get(name)!.catch(() => docs.delete(name));
  }
  return docs.get(name)!;
}

/** Once a page has its data, pull every other tab's files into the browser cache, so the next tab opens at once. */
let warmed = false;
export function warmStatic() {
  if (warmed || !M) return;
  warmed = true;
  for (const n of staticNames()) staticDoc(n).catch(() => { /* that tab reads it itself */ });
}

/** A small table the owner edits (brand tiers, events, data notes): the first read opens on the nightly file, and
 *  the database's rows replace it as soon as they arrive, so an edit made today still shows. Later reads (after an
 *  edit) go straight to the database. */
const served = new Set<string>();
export async function staticThenLive<T>(name: string, swrKey: string, live: () => Promise<T>): Promise<T> {
  if (!hasStatic(name) || served.has(swrKey)) return live();
  served.add(swrKey);
  try {
    const rows = (await staticDoc(name)) as T;
    live().then((fresh) => { if (JSON.stringify(fresh) !== JSON.stringify(rows)) mutate(swrKey, fresh, { revalidate: false }); }, () => { /* keep the file's rows */ });
    return rows;
  } catch { return live(); }
}
