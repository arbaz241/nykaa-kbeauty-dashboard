import { norm } from "./brands";
import { isCombo, perDay, type DailyIndex, type Dim, type FlowRow, type PoolProduct } from "./market";
import { monthEnd } from "./reviewRead";

/** Share of buying from adjusted reviews (owner "go ahead", 22 Oct 2026; decision paper "Adjusted review share").
 *
 *  Nykaa froze its public rating counts on 10 Oct, so new ratings (the old buyer count) stopped moving. Reviews still
 *  arrive with their dates. For 13 Sep - 9 Oct we saw both, so we learn how many of a brand's buyers write a review:
 *    rate per 100 buyers = reviews ÷ new ratings × 100, per brand × category,
 *  used only when it rests on ≥ 20 reviews, else the brand's rate across its categories, then same-origin brands in
 *  the category, then the category. Then, every night:
 *    estimated buyers = reviews in the last 3 complete months ÷ rate × 100;  ₹ = buyers × MRP;  share = brand ₹ ÷ category ₹.
 *  Test (learn 13-26 Sep, predict 26 Sep - 9 Oct): median miss 1.7 pts per brand (raw reviews 2.6), same #1 brand
 *  in 5 of 7 categories (raw 2). Only products whose reviews were read after 9 Oct teach a rate, so their window
 *  reviews are complete. */

export const CAL_START = "2026-09-13";
export const CAL_END = "2026-10-09";
const CAL_DAYS = 26; // 13 Sep -> 9 Oct, the days the ratings window spans
const MIN_REVIEWS = 20;

export type RateLevel = "brand × category" | "brand" | "origin × category" | "category";
export interface Rates { rate: (brand: string, cat: string) => { r: number; level: RateLevel } | null }

/** Learn the rates from the frozen ratings window (`ratings`: ratingFlow rows for 13 Sep - 9 Oct). */
export function learnRates(ix: DailyIndex, ratings: FlowRow[], windowReviews: Map<string, number>, reviewPool: (pid: string) => string,
  readOn: (pid: string) => string | null, originOf: (b: string) => string): Rates {
  const t = new Map<string, [number, number]>();
  const add = (k: string, ra: number, re: number) => { const x = t.get(k) ?? [0, 0]; x[0] += ra; x[1] += re; t.set(k, x); };
  const seenPool = new Set<string>();
  for (const r of ratings) {
    if (r.combo || r.subcategory === "kbeauty_store") continue;
    // listed on both the first and the last day: a product that joined the list later has reviews from the whole
    // window but no rating gain counted, which would inflate its brand's rate (22 Oct: CeraVe fell to 0.1%)
    if (r.rankStart === null) continue;
    if ((readOn(r.product_id) ?? "") <= CAL_END) continue; // its window reviews may be incomplete
    const pool = reviewPool(r.product_id);
    let re = 0;
    if (!seenPool.has(`${r.subcategory}|${pool}`)) { seenPool.add(`${r.subcategory}|${pool}`); re = windowReviews.get(pool) ?? windowReviews.get(r.product_id) ?? 0; }
    // lists added after 13 Sep: their ratings cover fewer days than the reviews, so the reviews are scaled to them
    if (r.partial) re *= Math.min(1, perDay(ix, r.subcategory, CAL_START, CAL_END) / CAL_DAYS);
    const b = norm(r.brand); const o = originOf(r.brand); const c = r.subcategory;
    add(`bc|${b}|${c}`, r.flow, re); add(`b|${b}`, r.flow, re); add(`oc|${o}|${c}`, r.flow, re); add(`c|${c}`, r.flow, re);
  }
  return {
    rate(brand, cat) {
      const b = norm(brand); const o = originOf(brand);
      for (const [k, level] of [[`bc|${b}|${cat}`, "brand × category"], [`b|${b}`, "brand"], [`oc|${o}|${cat}`, "origin × category"], [`c|${cat}`, "category"]] as const) {
        const x = t.get(k); if (x && x[1] >= MIN_REVIEWS && x[0] > 0) return { r: x[1] / x[0], level };
      }
      return null;
    },
  };
}

/** One row per listing in the latest top 100s, in the same shape as ratingFlow, so every tab reads it unchanged.
 *  `months`: the 3 complete months counted. A review pool (sizes sharing Nykaa's reviews) counts once, on its
 *  best-placed listing. Months not read yet (history cut off, or read before the month ended) are filled from the
 *  months that are, at the same pace. */
export function adjustedFlow(ix: DailyIndex, dims: Map<string, Dim>, pool: PoolProduct[], rates: Rates, months: string[],
  readOn: (pid: string) => string | null, originOf: (b: string) => string): FlowRow[] {
  const day = ix.days[ix.days.length - 1]; const endMap = day ? ix.byDay.get(day) : undefined; if (!endMap) return [];
  const byMember = new Map<string, PoolProduct>();
  for (const p of pool) for (const m of p.members ?? [p.product_id]) if (!byMember.has(m)) byMember.set(m, p);
  const entries = [...endMap.values()].filter((e) => e.subcategory !== "kbeauty_store").sort((a, b) => a.rank - b.rank);
  const seen = new Set<string>(); const out: FlowRow[] = [];
  for (const e of entries) {
    const d = dims.get(e.product_id); const brand = d?.brand ?? "?"; const name = d?.name ?? e.product_id;
    const pp = byMember.get(e.product_id); const combo = isCombo(name);
    let reviews = 0; let buyers = 0; let poolSize = 1;
    if (pp) {
      poolSize = (pp.members ?? []).filter((m) => endMap.has(`${e.subcategory}|${m}`)).length || 1;
      const key = `${e.subcategory}|${pp.product_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        const read = readOn(pp.product_id);
        const ok = months.filter((m) => m >= pp.coverage && (!read || read > monthEnd(m)));
        const got = ok.reduce((a, m) => a + (pp.byMonth.get(m) ?? 0), 0);
        reviews = ok.length ? (got * months.length) / ok.length : 0;
        const rt = rates.rate(brand, e.subcategory);
        buyers = rt ? (reviews / rt.r) : 0;
      }
    }
    const price = e.mrp ?? e.price ?? null;
    const flow = combo ? 0 : buyers;
    out.push({ product_id: e.product_id, subcategory: e.subcategory, brand, origin: d?.origin ?? originOf(brand), name, url: d?.url ?? null,
      flow, value: flow * (price ?? 0), rankStart: null, rankEnd: e.rank, price: e.price ?? e.mrp ?? null, partial: false, combo, rawFlow: buyers,
      poolSize, nykaaRank: e.nykaa_rank ?? e.rank, reviews: Math.round(reviews), noHistory: !pp });
  }
  return out;
}

/** The 3 complete months before `day`, and the 3 before those. */
export function reviewMonths(day: string) {
  const t = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  const m = (k: number) => { const d = new Date(t); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 10); };
  return { recent: [m(-3), m(-2), m(-1)], prev: [m(-6), m(-5), m(-4)] };
}
