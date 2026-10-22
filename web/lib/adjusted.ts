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
 *    estimated buyers = reviews in the latest complete month ÷ rate × 100;  ₹ = buyers × MRP;  share = brand ₹ ÷ category ₹.
 *  One month, not three (22 Oct, on the live check): a 3-month window reached back to July, before the month the rates
 *  were learned on, and caught review bursts (Niconi: 277 and 370 reviews in single July weeks, 58% of masks).
 *  Review counts are burst-cut (migration 034); sizes sharing one set of reviews count once at their middle MRP.
 *  Test (learn 13-26 Sep, predict 26 Sep - 9 Oct): median miss 1.7 pts per brand (raw reviews 2.6), same #1 brand
 *  in 5 of 7 categories (raw 2). Only products whose reviews were read after 9 Oct teach a rate, so their window
 *  reviews are complete. */

export const CAL_START = "2026-09-13";
export const CAL_END = "2026-10-09";
const CAL_DAYS = 26; // 13 Sep -> 9 Oct, the days the ratings window spans
const MIN_REVIEWS = 20;

export type RateLevel = "brand × category" | "brand, scaled to the category" | "origin × category" | "category";
/** Owner check 22 Oct (Kay Beauty "leading" moisturiser at 12%): a brand's rate taken across its categories mixed its
 *  makeup (0.8 reviews per 100 buyers on a foundation) into a skincare launch, turning 33 reviews into ~4,000 buyers.
 *  The fallback is now how the brand compares with each category's average, applied to this category's average
 *  (kept within 1/3x-3x), and no product is given more than 3x the buyers its own Nykaa ratings showed while
 *  visible. Backtest (learn 13-26 Sep, predict 26 Sep-9 Oct): median miss 1.6 pts as before, biggest single
 *  overstatement 13 -> 8 pts. */
const FACTOR_LIMIT = 3;
const OWN_CAP = 3;
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
  const ok = (k: string) => { const x = t.get(k); return x && x[1] >= MIN_REVIEWS && x[0] > 0 ? x[1] / x[0] : null; };
  // the brand against each category's average: its reviews ÷ the reviews its ratings would bring at those averages
  const factor = new Map<string, number>();
  const expected = new Map<string, number>();
  for (const [k, [ra]] of t) { if (!k.startsWith("bc|")) continue; const [, b, c] = k.split("|"); const cr = ok(`c|${c}`); if (cr) expected.set(b, (expected.get(b) ?? 0) + ra * cr); }
  for (const [b, e] of expected) { const x = t.get(`b|${b}`); if (x && x[1] >= MIN_REVIEWS && e > 0) factor.set(b, Math.min(FACTOR_LIMIT, Math.max(1 / FACTOR_LIMIT, x[1] / e))); }
  return {
    rate(brand, cat) {
      const b = norm(brand); const o = originOf(brand);
      const bc = ok(`bc|${b}|${cat}`); if (bc) return { r: bc, level: "brand × category" };
      const f = factor.get(b); const cr = ok(`c|${cat}`); if (f && cr) return { r: cr * f, level: "brand, scaled to the category" };
      const oc = ok(`oc|${o}|${cat}`); if (oc) return { r: oc, level: "origin × category" };
      return cr ? { r: cr, level: "category" } : null;
    },
  };
}

/** One row per listing in the latest top 100s, in the same shape as ratingFlow, so every tab reads it unchanged.
 *  `months`: the complete months counted. A review pool (sizes sharing Nykaa's reviews) counts once, on its
 *  best-placed listing. Months not read yet (history cut off, or read before the month ended) are filled from the
 *  months that are, at the same pace. */
export function adjustedFlow(ix: DailyIndex, dims: Map<string, Dim>, pool: PoolProduct[], rates: Rates, months: string[],
  readOn: (pid: string) => string | null, originOf: (b: string) => string, capped: Map<string, number>): FlowRow[] {
  const day = ix.days[ix.days.length - 1]; const endMap = day ? ix.byDay.get(day) : undefined; if (!endMap) return [];
  const byMember = new Map<string, PoolProduct>();
  for (const p of pool) for (const m of p.members ?? [p.product_id]) if (!byMember.has(m)) byMember.set(m, p);
  const entries = [...endMap.values()].filter((e) => e.subcategory !== "kbeauty_store").sort((a, b) => a.rank - b.rank);
  const seen = new Set<string>(); const out: FlowRow[] = [];
  for (const e of entries) {
    const d = dims.get(e.product_id); const brand = d?.brand ?? "?"; const name = d?.name ?? e.product_id;
    const pp = byMember.get(e.product_id); const combo = isCombo(name);
    let reviews = 0; let buyers = 0; let poolSize = 1; let price = e.mrp ?? e.price ?? null;
    if (pp) {
      const sizes = (pp.members ?? []).map((m) => endMap.get(`${e.subcategory}|${m}`)).filter((x): x is NonNullable<typeof x> => !!x);
      poolSize = sizes.length || 1;
      // sizes sharing one set of reviews: the middle MRP of the sizes on the list (as the ratings method did)
      const ps = sizes.map((x) => x.mrp ?? x.price).filter((p): p is number => !!p).sort((a, b) => a - b);
      if (ps.length > 1) price = ps.length % 2 ? ps[(ps.length - 1) / 2] : (ps[ps.length / 2 - 1] + ps[ps.length / 2]) / 2;
      const key = `${e.subcategory}|${pp.product_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        const read = readOn(pp.product_id);
        const ok = months.filter((m) => m >= pp.coverage && (!read || read > monthEnd(m)));
        const got = ok.reduce((a, m) => a + (capped.get(`${pp.product_id}|${m}`) ?? 0), 0);
        reviews = ok.length ? (got * months.length) / ok.length : 0;
        const rt = rates.rate(brand, e.subcategory);
        buyers = rt ? (reviews / rt.r) : 0;
        // never more than 3x the buyers the product's own ratings showed while Nykaa still published them
        const pace = ownPace(ix, e.subcategory, pp.members ?? [pp.product_id]);
        if (pace !== null && pace > 0) buyers = Math.min(buyers, OWN_CAP * pace * months.length);
      }
    }
    const flow = combo ? 0 : buyers;
    out.push({ product_id: e.product_id, subcategory: e.subcategory, brand, origin: d?.origin ?? originOf(brand), name, url: d?.url ?? null,
      flow, value: flow * (price ?? 0), rankStart: null, rankEnd: e.rank, price: e.price ?? e.mrp ?? null, partial: false, combo, rawFlow: buyers,
      poolSize, nykaaRank: e.nykaa_rank ?? e.rank, reviews: Math.round(reviews), noHistory: !pp });
  }
  return out;
}

/** New ratings a month on the product's own listings in the ratings window (13 Sep - 9 Oct), when it was listed
 *  at least a week of it; null when we did not see it long enough. Sizes sharing a count give one figure. */
function ownPace(ix: DailyIndex, cat: string, members: string[]): number | null {
  let best: number | null = null;
  for (const m of members) {
    const s = (ix.series.get(`${cat}|${m}`) ?? []).filter((r) => r.scrape_date >= CAL_START && r.scrape_date <= CAL_END && r.rating_count !== null);
    if (s.length < 2) continue;
    const a = s[0]; const z = s[s.length - 1];
    const days = (Date.parse(z.scrape_date) - Date.parse(a.scrape_date)) / 864e5;
    if (days < 7) continue;
    const p = (Math.max(0, z.rating_count! - a.rating_count!) / days) * 30;
    best = best === null ? p : Math.max(best, p);
  }
  return best;
}

/** The latest complete month before `day`, and the month before it. */
export function reviewMonths(day: string) {
  const t = new Date(`${day.slice(0, 7)}-01T00:00:00Z`);
  const m = (k: number) => { const d = new Date(t); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 10); };
  return { recent: [m(-1)], prev: [m(-2)] };
}
