"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
  brand_classification: ["brand"],
};

/** Fetch every row of a view, paging past Supabase's 1,000-row response cap. */
export async function fetchAll<T>(view: string, columns = "*", pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    let q = supabase().from(view).select(columns);
    for (const c of ORDER[view] ?? []) q = q.order(c);
    const { data, error } = await q.range(from, from + pageSize - 1);
    if (error) throw new Error(`${view}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < pageSize) return out;
  }
}
