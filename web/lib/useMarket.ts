"use client";

import { useMemo } from "react";
import { useCatalog, useDemand, useReviewMonths, useShelf, useShelfDaily, useShelfProducts } from "./data";
import { indexDaily, poolProducts, productDims, ratingFlow, ratingFreeze, type FlowRow } from "./market";
import { shelfWindow, usePeriod, type ShelfWindow } from "./period";
import { norm } from "./brands";
import type { ShelfRow } from "./types";

/** Everything the Round 4 tabs share, loaded once and computed for the chosen period.
 *  Plan v2 (17 Oct 2026): no market growth from our data any more (Nykaa's reported figures are the market; see
 *  lib/reference.ts). The period picker only moves shelf facts. Buying (new ratings) stops on the last day Nykaa
 *  still updated its rating counts. */
export function useMarket() {
  const shelf = useShelf(); const catalog = useCatalog(); const months = useReviewMonths(); const demand = useDemand();
  const daily = useShelfDaily(); const products = useShelfProducts();
  const period = usePeriod();
  const ready = !!(shelf.data && catalog.data && months.data && demand.data && daily.data && products.data);
  const error = shelf.error || catalog.error || months.error || demand.error || daily.error || products.error;

  const dims = useMemo(() => productDims(products.data ?? [], shelf.data ?? []), [products.data, shelf.data]);
  const ix = useMemo(() => indexDaily(daily.data ?? []), [daily.data]);
  /** Today's shelf. Lists added on 18 Oct (BB & CC cream, blush, lip gloss) are kept out of the live site's views
   *  until round 4 goes live (migration 027), so their rows are rebuilt here from the daily data. */
  const today = useMemo(() => {
    const rows = shelf.data ?? []; const day = ix.days[ix.days.length - 1];
    const have = new Set(rows.map((r) => r.subcategory));
    const extra: ShelfRow[] = [];
    for (const r of ix.byDay.get(day)?.values() ?? []) {
      if (r.subcategory === "kbeauty_store" || have.has(r.subcategory)) continue;
      const d = dims.get(r.product_id);
      extra.push({ scrape_date: day, subcategory: r.subcategory, rank: r.rank, nykaa_rank: r.nykaa_rank, product_id: r.product_id, name: d?.name ?? r.product_id,
        brand: d?.brand ?? "?", origin: (d?.origin ?? "unknown") as ShelfRow["origin"], k_marketing: false, mrp: r.mrp, price: r.price,
        discount_pct: r.mrp && r.price ? Math.round((1 - r.price / r.mrp) * 100) : null, rating: null, rating_count: r.rating_count, in_stock: r.in_stock,
        is_ad: r.is_ad, is_pinned: false, has_offer: r.has_offer, offer_message: null, url: d?.url ?? null, first_review_date: d?.first_review_date ?? null,
        review_count: null, pack_size: null, country_name: null, formulation: null, skin_types: null, concerns: null, key_ingredients: null, preferences: null,
        usp_summary: null, usp_points: null, review_key_phrases: null, review_splitup: null, detail_review_count: null, image_url: null, description_text: null,
        is_bestseller: false, is_new_tag: false, tags: null, nykaa_l3: r.nykaa_l3 ?? null });
    }
    return extra.length ? [...rows, ...extra] : rows;
  }, [shelf.data, ix, dims]);
  const freeze = useMemo(() => ratingFreeze(ix), [ix]);
  const originOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of dims.values()) if (!m.has(norm(d.brand)) || m.get(norm(d.brand)) === "unknown") m.set(norm(d.brand), d.origin);
    return (b: string) => m.get(norm(b)) ?? "unknown";
  }, [dims]);
  const pool = useMemo(() => (ready ? poolProducts({ months: months.data!, demand: demand.data!, shelf: shelf.data!, catalog: catalog.data!, products: products.data!, daily: daily.data! }) : []),
    [ready, months.data, demand.data, shelf.data, catalog.data, products.data, daily.data]);

  const latest = ix.days[ix.days.length - 1] ?? null;
  const win: ShelfWindow | null = useMemo(() => shelfWindow(ix.days, period.days), [ix.days, period.days]);
  const ratingEnd = freeze?.lastLive;
  const flow: FlowRow[] = useMemo(() => (win ? ratingFlow(ix, dims, win.start, win.end, false, ratingEnd) : []), [ix, dims, win, ratingEnd]);
  const prevFlow: FlowRow[] | null = useMemo(() => (win?.prev ? ratingFlow(ix, dims, win.prev.start, win.prev.end, false, ratingEnd) : null), [ix, dims, win, ratingEnd]);
  /** The days the buying figures actually cover (start → the earlier of the period end and the last live day). */
  const flowSpan = win ? { start: win.start, end: ratingEnd && ratingEnd < win.end ? ratingEnd : win.end, none: !!ratingEnd && ratingEnd <= win.start } : null;

  return { ready, error, period, shelf: today, catalog: catalog.data ?? [], products: products.data ?? [], months: months.data ?? [], dims, ix, pool, originOf,
    latest, win, flow, prevFlow, freeze, flowSpan };
}
export type Market = ReturnType<typeof useMarket>;
