"use client";

import { useMemo } from "react";
import { useCatalog, useDemand, usePinned, useReviewCapped, useReviewCounts, useReviewMonths, useReviewWindow, useShelf, useShelfDaily, useShelfProducts } from "./data";
import { adjustedFlow, familyCounts, learnRates, lifetimeRatio, perReviewByCategory, reviewMonths, sizeByReviews } from "./adjusted";
import { monthEnd as monthEndOf, useReviewRead } from "./reviewRead";
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
  const daily = useShelfDaily(); const products = useShelfProducts(); const win33 = useReviewWindow(); const cap34 = useReviewCapped(); const readMap = useReviewRead(); const counts = useReviewCounts();
  const period = usePeriod();
  const ready = !!(shelf.data && catalog.data && months.data && demand.data && daily.data && products.data && win33.data && cap34.data && readMap && counts.data);
  const error = shelf.error || catalog.error || months.error || demand.error || daily.error || products.error || win33.error || cap34.error;

  const dims = useMemo(() => productDims(products.data ?? [], shelf.data ?? []), [products.data, shelf.data]);
  const pins = usePinned();
  const ix = useMemo(() => {
    const base = indexDaily(daily.data ?? [], (pid) => dims.get(pid)?.name);
    const pinned = new Set((pins.data ?? []).map((r) => `${r.scrape_date}|${r.subcategory}|${r.product_id}`));
    for (const r of shelf.data ?? []) if (r.is_pinned) pinned.add(`${r.scrape_date}|${r.subcategory}|${r.product_id}`);
    return { ...base, pinned };
  }, [daily.data, shelf.data, pins.data, dims]);
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
  /** Share of buying has its own fixed window (owner 19 Oct 2026: the period picker is not needed everywhere): the
   *  last 30 collected days that have live rating counts. While Nykaa's counts are frozen (since 10 Oct) it ends on
   *  the last live day, so a short period never leaves buying empty. The period picker now moves rank moves only. */
  const buyWin = useMemo(() => {
    const days = ix.days; if (!days.length) return null;
    const lastLive = ratingEnd && ratingEnd < days[days.length - 1] ? ratingEnd : days[days.length - 1];
    const i = days.indexOf(lastLive);
    const start = days[Math.max(0, i - 29)];
    const j = days.indexOf(start);
    const prev = j >= 30 ? { start: days[j - 30], end: start } : null;
    return { start, lastLive, end: days[days.length - 1], prev };
  }, [ix.days, ratingEnd]);
  /** The frozen ratings window (13 Sep - 9 Oct): no longer the share itself, but what the review rates are learned on. */
  const ratingsFlow: FlowRow[] = useMemo(() => (buyWin ? ratingFlow(ix, dims, buyWin.start, buyWin.end, false, ratingEnd) : []), [ix, dims, buyWin, ratingEnd]);
  /** Share of buying = adjusted reviews (owner, 22 Oct 2026; lib/adjusted). */
  const rmonths = useMemo(() => (latest ? reviewMonths(latest) : null), [latest]);
  // each category's median ratings per written review (Nykaa's own counts), for sizing categories against each other
  const perReview = useMemo(() => perReviewByCategory(counts.data ?? [], today), [counts.data, today]);
  const rates = useMemo(() => {
    if (!ready) return null;
    const poolOf = new Map<string, string>(); for (const p of pool) for (const m of p.members ?? [p.product_id]) if (!poolOf.has(m)) poolOf.set(m, p.product_id);
    const rp = (pid: string) => poolOf.get(pid) ?? pid;
    const wr = new Map<string, number>(); // reviews per review pool: the pool's members share one set of reviews
    for (const r of win33.data ?? []) { const k = rp(r.product_id); wr.set(k, Math.max(wr.get(k) ?? 0, r.reviews)); }
    const ro = (pid: string) => readMap?.get(rp(pid)) ?? readMap?.get(pid) ?? null;
    return learnRates(ix, ratingsFlow, wr, rp, ro, originOf, familyCounts(counts.data ?? [], ratingsFlow, perReview), perReview);
  }, [ready, pool, win33.data, readMap, ix, ratingsFlow, originOf, counts.data, perReview]);
  const readOf = useMemo(() => (pid: string) => readMap?.get(pid) ?? null, [readMap]);
  const lifetime = useMemo(() => lifetimeRatio(counts.data ?? []), [counts.data]);
  const capped = useMemo(() => new Map((cap34.data ?? []).map((r) => [`${r.product_id}|${String(r.month).slice(0, 10)}`, Number(r.reviews)])), [cap34.data]);
  const flow: FlowRow[] = useMemo(() => (rates && rmonths ? sizeByReviews(adjustedFlow(ix, dims, pool, rates, rmonths.recent, readOf, originOf, capped, lifetime), perReview) : []), [ix, dims, pool, rates, rmonths, readOf, originOf, capped, lifetime, perReview]);
  const prevFlow: FlowRow[] | null = useMemo(() => (rates && rmonths ? sizeByReviews(adjustedFlow(ix, dims, pool, rates, rmonths.prev, readOf, originOf, capped, lifetime), perReview) : null), [ix, dims, pool, rates, rmonths, readOf, originOf, capped, lifetime, perReview]);
  /** The months the buying figures cover (first day of the first month to the last day of the last). */
  const flowSpan = rmonths ? { start: rmonths.recent[0], end: monthEndOf(rmonths.recent[rmonths.recent.length - 1]), none: false } : null;

  return { ready, error, period, shelf: today, catalog: catalog.data ?? [], products: products.data ?? [], months: months.data ?? [], dims, ix, pool, originOf,
    latest, win, flow, prevFlow, freeze, flowSpan, ratingsFlow, rates, rmonths };
}
export type Market = ReturnType<typeof useMarket>;
