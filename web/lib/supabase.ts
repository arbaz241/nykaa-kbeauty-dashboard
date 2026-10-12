"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { mutate } from "swr";
import { readCached, writeCached } from "./persist";

let client: SupabaseClient | null = null;

/** Browser Supabase client. The anon key is public by design; row-level security limits reads to signed-in users. */
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

/** A stable sort per view, so consecutive pages neither overlap nor skip rows (Postgres guarantees no order
 *  without one). Columns are the view's natural key. */
const ORDER: Record<string, string[]> = {
  web_latest_shelf: ["subcategory", "rank", "product_id"],
  web_review_months: ["product_id", "month"],
  web_latest_search: ["query", "sample", "rank", "product_id"],
  web_latest_assortment: ["brand"],
  web_brand_catalog: ["brand", "product_id"],
  web_share_daily: ["scrape_date", "subcategory", "origin"],
  web_brand_daily: ["scrape_date", "brand", "subcategory"],
  web_search_history: ["scrape_date", "query", "sample", "rank", "product_id"],
  web_suggestions_latest: ["seed", "kind", "position"],
  web_movement: ["category", "product_id"],
  web_brand_shares: ["scrape_date", "brand"],
  web_product_demand: ["product_id"],
  web_availability: ["brand", "product_id"],
  web_category_coverage: ["category"],
  web_thumbnails: ["product_id"],
  web_usp_products: ["product_id"],
  web_usp_comparisons: ["anchor_product_id"],
  brand_classification: ["brand"],
};

/** Views with a ready-made nightly copy (migration 020, web_<view>_snap); whole-view reads go to the copy. */
const SNAPSHOT = new Set(Object.keys(ORDER).filter((v) => v.startsWith("web_")));

const memory = new Map<string, unknown[]>();
const inflight = new Map<string, Promise<unknown[]>>();
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

/** Every row of a view. Opens on this browser's saved copy when there is one (lib/persist) and fetches the fresh
 *  rows behind it; when they differ, the pages re-read them (one revalidation for all views that changed). */
export function fetchAll<T>(view: string, columns = "*", pageSize = 1000): Promise<T[]> {
  const key = `${view}|${columns}`;
  if (memory.has(key)) return Promise.resolve(memory.get(key) as T[]);
  if (!inflight.has(key)) {
    const fresh = () => fetchFresh<T>(view, columns, pageSize).then((rows) => { memory.set(key, rows); writeCached(key, rows); return rows; });
    inflight.set(key, (async () => {
      const saved = await readCached<T>(key);
      if (!saved) return fresh();
      memory.set(key, saved);
      fresh().then((rows) => {
        if (JSON.stringify(rows) === JSON.stringify(saved)) return;
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => mutate(() => true), 200);
      }).catch(() => { /* keep showing the saved copy; the next visit tries again */ });
      return saved;
    })().finally(() => inflight.delete(key)));
  }
  return inflight.get(key) as Promise<T[]>;
}

/** Fetch every row of a view, paging past Supabase's 1,000-row response cap. The first page also returns the row
 *  count, so the remaining pages are requested together rather than one after another (review months was 15
 *  back-to-back pages, ~6.5 s). */
async function fetchFresh<T>(view: string, columns: string, pageSize: number): Promise<T[]> {
  let source = SNAPSHOT.has(view) ? `${view}_snap` : view;
  const page = async (from: number, count = false) => {
    let q = supabase().from(source).select(columns, count ? { count: "exact" } : undefined);
    for (const c of ORDER[view] ?? []) q = q.order(c);
    const { data, error, count: n } = await q.range(from, from + pageSize - 1);
    if (error) throw new Error(`${view}: ${error.message}`);
    return { rows: (data ?? []) as T[], n };
  };
  // the copy may not exist yet (migration 020 not applied): read the view itself
  const first = await page(0, true).catch((e) => { if (source === view) throw e; source = view; return page(0, true); });
  if (first.rows.length < pageSize) return first.rows;
  const total = first.n ?? 0;
  const starts: number[] = [];
  for (let from = pageSize; from < total; from += pageSize) starts.push(from);
  const rest = await Promise.all(starts.map((from) => page(from)));
  const out = [first.rows, ...rest.map((p) => p.rows)].flat();
  // the count can be stale if rows were added between requests: finish any tail one page at a time
  for (let from = pageSize * (starts.length + 1); out.length === from; from += pageSize) {
    const p = await page(from);
    out.push(...p.rows);
    if (p.rows.length < pageSize) break;
  }
  return out;
}
