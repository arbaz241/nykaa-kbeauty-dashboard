"use client";

import { useMemo } from "react";
import { norm } from "./brands";
import { useCategoryBrands, useReviewMonths, useShelf } from "./data";
import { CATEGORIES } from "./format";
import type { Origin } from "./types";

/** What the dashboard tracks, counted one way for every tab (owner 19 Oct 2026: "start with showing what the actual
 *  measures are"; 302 products next to 699 brands read as a contradiction). Four nested groups, each a subset of the
 *  one before in spirit:
 *    lists     - the Nykaa category lists we read nightly
 *    selling   - brands with at least one product in those lists (Nykaa's own brand filter, all ranks)
 *    top100    - products and brands in today's top 100 of each list (own category only)
 *    followed  - products whose written reviews we read month by month (main brands and their rivals) */
export type OriginCount = Record<Origin, number>;
export interface Scope {
  day: string | null;
  lists: number;
  storeBrands: number;
  selling: { brands: number; products: number; byOrigin: OriginCount };
  top100: { products: number; brands: number; byOrigin: OriginCount; productsByOrigin: OriginCount };
  followed: { products: number; brands: number; byOrigin: OriginCount; productsByOrigin: OriginCount };
}

const zero = (): OriginCount => ({ kbeauty: 0, local: 0, global: 0, unknown: 0 });

export function useScope(): Scope | null {
  const cb = useCategoryBrands(); const shelf = useShelf(); const months = useReviewMonths();
  return useMemo(() => {
    if (!cb.data || !shelf.data || !months.data) return null;
    const day = cb.data.reduce((a, b) => (b.last_seen > a ? b.last_seen : a), "");
    const latest = cb.data.filter((b) => b.last_seen === day);
    const inLists = latest.filter((b) => b.subcategory !== "kbeauty_store" && CATEGORIES.includes(b.subcategory));
    const originOf = new Map<string, Origin>();
    for (const b of latest) if (!originOf.has(norm(b.brand)) || originOf.get(norm(b.brand)) === "unknown") originOf.set(norm(b.brand), b.origin);
    for (const r of shelf.data) if (!originOf.has(norm(r.brand)) || originOf.get(norm(r.brand)) === "unknown") originOf.set(norm(r.brand), r.origin);
    const o = (b: string): Origin => originOf.get(norm(b)) ?? "unknown";

    const sellingBrands = new Map<string, Origin>(); let sellingProducts = 0;
    for (const b of inLists) { sellingBrands.set(norm(b.brand), o(b.brand)); sellingProducts += b.products; }
    const selling = { brands: sellingBrands.size, products: sellingProducts, byOrigin: zero() };
    for (const v of sellingBrands.values()) selling.byOrigin[v]++;

    const rows = shelf.data.filter((r) => CATEGORIES.includes(r.subcategory));
    const topProducts = new Map<string, Origin>(); const topBrands = new Map<string, Origin>();
    for (const r of rows) { topProducts.set(r.product_id, o(r.brand)); topBrands.set(norm(r.brand), o(r.brand)); }
    const top100 = { products: topProducts.size, brands: topBrands.size, byOrigin: zero(), productsByOrigin: zero() };
    for (const v of topBrands.values()) top100.byOrigin[v]++;
    for (const v of topProducts.values()) top100.productsByOrigin[v]++;

    const fProducts = new Map<string, Origin>(); const fBrands = new Map<string, Origin>();
    for (const m of months.data) { fProducts.set(m.product_id, o(m.brand)); fBrands.set(norm(m.brand), o(m.brand)); }
    const followed = { products: fProducts.size, brands: fBrands.size, byOrigin: zero(), productsByOrigin: zero() };
    for (const v of fBrands.values()) followed.byOrigin[v]++;
    for (const v of fProducts.values()) followed.productsByOrigin[v]++;

    return {
      day: day || null, lists: new Set(rows.map((r) => r.subcategory)).size,
      storeBrands: new Set(latest.filter((b) => b.subcategory === "kbeauty_store").map((b) => norm(b.brand))).size,
      selling, top100, followed,
    };
  }, [cb.data, shelf.data, months.data]);
}
