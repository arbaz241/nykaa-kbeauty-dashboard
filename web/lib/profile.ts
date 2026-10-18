import { norm } from "./brands";
import { explainMove, homepageRuns, smoothedMove, type DailyIndex, type Dim, type FlowRow, type PoolProduct, type Reason, type Run } from "./market";
import { addDays, monthWindow } from "./period";
import type { BrandOffer, HomepageFeature, MarketEvent, ShelfDay } from "./types";

/** Shared reads for the brand page, the product page and the Brief (plan v2, 17 Oct 2026): one place computes what
 *  a listing did in the period and why, so every page that mentions it says the same thing. */

export interface ListingMove {
  key: string; product_id: string; subcategory: string; brand: string; name: string;
  /** Smoothed ranks (median of the first and last three collected days); null when it was not on the shelf. */
  from: number | null; to: number | null;
  /** Places gained (positive = up); entries count from #101. */
  gain: number; entered: boolean; left: boolean;
  why: Reason[]; series: ShelfDay[];
}

export interface Context {
  ix: DailyIndex; dims: Map<string, Dim>; start: string; end: string;
  events: MarketEvent[]; runs: Run[]; offers: BrandOffer[];
}

/** What one listing (product in one category) did between `start` and `end`, and the likely reasons. */
export function listingMove(c: Context, cat: string, pid: string): ListingMove | null {
  const key = `${cat}|${pid}`;
  // a category tracked from later than the period start begins on its own first day, so its whole shelf does not
  // read as "entered"
  const cs = c.ix.catStart.get(cat);
  const start = cs && cs > c.start ? c.ix.days.find((d) => d >= cs) ?? c.start : c.start;
  const all = c.ix.series.get(key) ?? [];
  const series = all.filter((r) => r.scrape_date >= start && r.scrape_date <= c.end);
  if (!series.length) return null;
  const dim = c.dims.get(pid);
  const brand = dim?.brand ?? "?";
  const sm = smoothedMove(c.ix, key, start, c.end);
  const onStart = !!c.ix.byDay.get(start)?.get(key); const onEnd = !!c.ix.byDay.get(c.end)?.get(key);
  const entered = !onStart && onEnd && series.length >= 3; const left = onStart && !onEnd;
  // an entry has no starting rank and an exit no final one, whatever the smoothing says
  const from = entered ? null : sm ? sm.from : onStart ? series[0].rank : null;
  const to = left ? null : sm ? sm.to : onEnd ? series[series.length - 1].rank : null;
  const gain = from !== null && to !== null ? from - to : entered && to !== null ? 101 - to : left && from !== null ? from - 101 : 0;
  const why = Math.abs(gain) >= 5 && !entered && !left
    ? explainMove({ key, productId: pid, brand, start, end: c.end, ix: c.ix, events: c.events, runs: c.runs, offers: c.offers, dims: c.dims, firstReview: dim?.first_review_date ?? null, up: gain > 0 })
    : [];
  return { key, product_id: pid, subcategory: cat, brand, name: dim?.name ?? pid, from, to, gain, entered, left, why, series };
}

/** Every listing of a brand (or of everything when `brand` is null) seen in the period. */
export function listingMoves(c: Context, brand: string | null): ListingMove[] {
  const keys = new Set<string>();
  for (const d of c.ix.days) {
    if (d < c.start || d > c.end) continue;
    for (const [k, r] of c.ix.byDay.get(d)!) {
      if (r.subcategory === "kbeauty_store") continue;
      if (brand && norm(c.dims.get(r.product_id)?.brand ?? "") !== norm(brand)) continue;
      keys.add(k);
    }
  }
  return [...keys].map((k) => { const [cat, pid] = k.split("|"); return listingMove(c, cat, pid); }).filter((x): x is ListingMove => !!x);
}

export const runsFrom = (rows: HomepageFeature[]) => homepageRuns(rows);

/** Share of a category's buying (new ratings × price, combos left out) for each product, and its place among them. */
export function shareIn(flow: FlowRow[], cat: string) {
  const rows = flow.filter((r) => r.subcategory === cat && r.value > 0).sort((a, b) => b.value - a.value);
  const total = rows.reduce((a, r) => a + r.value, 0); const units = rows.reduce((a, r) => a + r.flow, 0);
  return { total, rows, of: (pid: string) => { const i = rows.findIndex((r) => r.product_id === pid); return i < 0 || !total ? null : { share: rows[i].value / total, units: units ? rows[i].flow / units : 0, place: i + 1, of: rows.length, poolSize: rows[i].poolSize }; } };
}

/** A brand's share of a category's buying, and its place among the brands there. */
export function brandShareIn(flow: FlowRow[], cat: string, brand: string) {
  const by = new Map<string, number>(); const un = new Map<string, number>(); const best = new Map<string, FlowRow>();
  for (const r of flow) if (r.subcategory === cat && r.value > 0) {
    const k = norm(r.brand); by.set(k, (by.get(k) ?? 0) + r.value); un.set(k, (un.get(k) ?? 0) + r.flow);
    if (!best.has(k) || r.value > best.get(k)!.value) best.set(k, r);
  }
  const total = [...by.values()].reduce((a, v) => a + v, 0); const units = [...un.values()].reduce((a, v) => a + v, 0);
  const ranked = [...by.entries()].sort((a, b) => b[1] - a[1]);
  const i = ranked.findIndex(([b]) => b === norm(brand));
  return i < 0 || !total ? null : { share: ranked[i][1] / total, units: units ? (un.get(ranked[i][0]) ?? 0) / units : 0, place: i + 1, of: ranked.length, best: best.get(ranked[i][0]) ?? null };
}

/** Written reviews per month over the last 24 complete months, for a set of tracked products, with the latest three
 *  months against the same months a year earlier. Only months inside each product's complete history count. */
export interface ReviewTrend { axis: string[]; values: (number | null)[]; recent: number; base: number; change: number | null; recentLabel: string; baseLabel: string; products: number; launches: number }
export function reviewTrend(pool: PoolProduct[], latest: string): ReviewTrend {
  const t = new Date(`${latest}T00:00:00Z`);
  const axis = Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 24 + i, 1)).toISOString().slice(0, 10));
  const values = axis.map((m) => { let any = false; let n = 0; for (const p of pool) { if (m >= p.coverage) { any = true; n += p.byMonth.get(m) ?? 0; } } return any ? n : null; });
  const w = monthWindow(latest, 3, "yoy");
  // a year-on-year comparison needs the product's history to reach the earlier months, or the product to be launched after them
  const lastBase = w.base[w.base.length - 1];
  let recent = 0; let base = 0; let launches = 0;
  const comparable = pool.filter((p) => p.coverage <= w.base[0] || (p.first !== null && p.first > lastBase));
  for (const p of comparable) {
    recent += w.recent.reduce((a, m) => a + (p.byMonth.get(m) ?? 0), 0);
    base += w.base.reduce((a, m) => a + (p.byMonth.get(m) ?? 0), 0);
    if (p.first !== null && p.first > lastBase) launches++;
  }
  return { axis, values, recent, base, change: base > 0 ? recent / base - 1 : null, recentLabel: w.recentLabel, baseLabel: w.baseLabel, products: comparable.length, launches };
}

/** Days in the period a brand was on Nykaa's homepage, from banner runs. */
export function homepageDays(runs: Run[], brand: string, start: string, end: string) {
  return runs.filter((r) => r.brand && norm(r.brand) === norm(brand) && r.end >= start && r.start <= end)
    .reduce((a, r) => a + Math.max(0, Math.round((Date.parse(r.end < end ? r.end : end) - Date.parse(r.start > start ? r.start : start)) / 864e5) + 1), 0);
}

/** The latest offers a brand ran (brand-own or Nykaa-wide), newest collection day only. */
export function latestOffers(offers: BrandOffer[], brand: string) {
  const mine = offers.filter((o) => norm(o.brand) === norm(brand));
  const day = mine.reduce((a, o) => (o.scrape_date > a ? o.scrape_date : a), "");
  return { day: day || null, offers: mine.filter((o) => o.scrape_date === day && o.offer_id !== "none") };
}

export const daysAgo = (d: string, n: number) => addDays(d, -n);
