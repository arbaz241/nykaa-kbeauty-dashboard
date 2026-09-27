import { mean, median, packMl } from "./format";
import type { AssortmentRow, ReviewAspect, ReviewMonth, SearchRow, ShelfRow } from "./types";

export interface BrandScore {
  brand: string; origin: string; kMarketing: boolean;
  slots: number; products: number; categories: string[]; bestRank: number | null; medianRank: number | null; top20: number;
  medianPrice: number | null; minPrice: number | null; maxPrice: number | null; avgDiscount: number | null; offerShare: number | null; paidShare: number | null;
  rating: number | null; ratings: number;
  last3: number | null; prev3: number | null; growth: number | null; spark: (number | null)[]; demandProducts: number;
  searchTerms: number; bestSearch: number | null; adSlots: number;
  range: number | null; conversion: number | null;
  madeIn: string | null;
}

export function monthsWindow(n = 12): string[] {
  const now = new Date(); const out: string[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 10));
  }
  return out; // last n complete months, oldest first
}

export function brandScore(brand: string, shelf: ShelfRow[], months: ReviewMonth[], search: SearchRow[], assort: AssortmentRow[]): BrandScore {
  const g = shelf.filter((r) => r.brand === brand);
  const distinct = new Map(g.map((r) => [r.product_id, r]));
  const prices = g.map((r) => r.price).filter((x): x is number => x !== null);

  // demand: reviews per month, only months each product reliably covers; momentum needs the 6-month window covered
  const win = monthsWindow(12); const six = win[6];
  const bm = months.filter((m) => m.brand === brand && m.month >= m.coverage_start);
  const covered = new Set(bm.filter((m) => m.coverage_start <= six).map((m) => m.product_id));
  const byMonth = new Map<string, number>();
  for (const m of bm) if (covered.has(m.product_id)) byMonth.set(m.month, (byMonth.get(m.month) ?? 0) + m.reviews);
  const firstCov = bm.filter((m) => covered.has(m.product_id)).reduce((a, m) => (m.coverage_start > a ? m.coverage_start : a), "1900-01-01");
  const spark = win.map((mo) => (covered.size && mo >= firstCov ? byMonth.get(mo) ?? 0 : null));
  const sum = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
  const last3 = covered.size ? sum(spark.slice(-3)) : null; const prev3 = covered.size ? sum(spark.slice(-6, -3)) : null;

  // search: unpaid positions from one sample per query; ads counted across samples
  const queries = new Map<string, SearchRow[]>();
  for (const s of search) queries.set(s.query, [...(queries.get(s.query) ?? []), s]);
  let terms = 0; let best: number | null = null; let ads = 0;
  for (const rows of queries.values()) {
    const minSample = Math.min(...rows.map((r) => r.sample));
    const unpaid = rows.filter((r) => !r.is_ad && r.sample === minSample).sort((a, b) => a.rank - b.rank);
    const pos = unpaid.findIndex((r) => r.brand === brand);
    if (pos >= 0 && pos < 10) { terms += 1; best = best === null ? pos + 1 : Math.min(best, pos + 1); }
    ads += rows.filter((r) => r.is_ad && r.brand === brand).length;
  }
  const range = assort.find((a) => a.brand === brand)?.total_products ?? null;
  const countries = g.map((r) => r.country_name).filter(Boolean) as string[];
  return {
    brand, origin: g[0]?.origin ?? "unknown", kMarketing: g.some((r) => r.k_marketing),
    slots: g.length, products: distinct.size, categories: [...new Set(g.map((r) => r.subcategory))],
    bestRank: g.length ? Math.min(...g.map((r) => r.rank)) : null, medianRank: median(g.map((r) => r.rank)), top20: g.filter((r) => r.rank <= 20).length,
    medianPrice: median(prices), minPrice: prices.length ? Math.min(...prices) : null, maxPrice: prices.length ? Math.max(...prices) : null,
    avgDiscount: mean(g.map((r) => r.discount_pct)), offerShare: g.length ? g.filter((r) => r.has_offer).length / g.length : null,
    paidShare: g.length ? g.filter((r) => r.is_ad || r.is_pinned).length / g.length : null,
    rating: mean([...distinct.values()].map((r) => r.rating)), ratings: [...distinct.values()].reduce((a, r) => a + (r.rating_count ?? 0), 0),
    last3, prev3, growth: last3 !== null && prev3 ? (last3 - prev3) / prev3 : null, spark, demandProducts: covered.size,
    searchTerms: terms, bestSearch: best, adSlots: ads,
    range, conversion: range ? distinct.size / range : null,
    madeIn: countries.length ? mode(countries) : null,
  };
}

function mode(xs: string[]) {
  const c = new Map<string, number>(); xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1));
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

export const perMl = (r: ShelfRow) => { const ml = packMl(r.pack_size); return ml && r.price ? r.price / ml : null; };

/** Factual lead-in sentences for the selected brands. Each names the leader on one dimension. */
export function brandInsights(scores: BrandScore[]): string[] {
  const on = scores.filter((s) => s.slots > 0);
  if (on.length < 2) return [];
  const out: string[] = [];
  const top = [...on].sort((a, b) => b.slots - a.slots);
  out.push(`${top[0].brand} has the widest shelf presence: ${top[0].slots} top-100 listings across ${top[0].categories.length} categories, against ${top[top.length - 1].slots} for ${top[top.length - 1].brand}.`);
  const priced = on.filter((s) => s.medianPrice !== null).sort((a, b) => a.medianPrice! - b.medianPrice!);
  if (priced.length >= 2) out.push(`${priced[0].brand} is the most affordable at a ₹${Math.round(priced[0].medianPrice!).toLocaleString("en-IN")} typical price; ${priced[priced.length - 1].brand} is the most premium at ₹${Math.round(priced[priced.length - 1].medianPrice!).toLocaleString("en-IN")}.`);
  const mom = scores.filter((s) => s.growth !== null && (s.last3 ?? 0) >= 30).sort((a, b) => b.growth! - a.growth!);
  if (mom.length >= 2) out.push(`Demand momentum favours ${mom[0].brand} (${mom[0].growth! > 0 ? "+" : ""}${Math.round(mom[0].growth! * 100)}% reviews in the last three months vs the three before); ${mom[mom.length - 1].brand} is weakest (${mom[mom.length - 1].growth! > 0 ? "+" : ""}${Math.round(mom[mom.length - 1].growth! * 100)}%).`);
  const srch = [...scores].sort((a, b) => b.searchTerms - a.searchTerms);
  if (srch[0].searchTerms > 0) out.push(`${srch[0].brand} shows up in the most K-beauty searches (top 10 unpaid results for ${srch[0].searchTerms} tracked terms).`);
  return out;
}

export interface DemandLine { key: string; label: string; brand: string; spark: (number | null)[]; last3: number | null; prev3: number | null; growth: number | null; url?: string | null }

/** Monthly reviews over the last 12 complete months for one product or brand, using only months each product
 *  reliably covers. Momentum (last 3 vs prior 3) only from products that cover all 6 of those months. */
export function demandLines(months: ReviewMonth[], by: "brand" | "product"): DemandLine[] {
  const win = monthsWindow(12); const six = win[6];
  const groups = new Map<string, ReviewMonth[]>();
  for (const m of months) { const k = by === "brand" ? m.brand : m.product_id; groups.set(k, [...(groups.get(k) ?? []), m]); }
  const out: DemandLine[] = [];
  for (const [k, ms] of groups) {
    const ok = ms.filter((m) => m.month >= m.coverage_start);
    const covered = new Set(ok.filter((m) => m.coverage_start <= six).map((m) => m.product_id));
    const byMonth = new Map<string, number>();
    ok.filter((m) => covered.has(m.product_id)).forEach((m) => byMonth.set(m.month, (byMonth.get(m.month) ?? 0) + m.reviews));
    const start = ok.filter((m) => covered.has(m.product_id)).reduce((a, m) => (m.coverage_start > a ? m.coverage_start : a), "1900-01-01");
    const spark = win.map((mo) => (covered.size && mo >= start ? byMonth.get(mo) ?? 0 : null));
    const s = (xs: (number | null)[]) => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
    const last3 = covered.size ? s(spark.slice(-3)) : null; const prev3 = covered.size ? s(spark.slice(-6, -3)) : null;
    out.push({ key: k, label: by === "brand" ? k : ms[0].name, brand: ms[0].brand, spark, last3, prev3, growth: last3 !== null && prev3 ? (last3 - prev3) / prev3 : null, url: ms[0].url });
  }
  return out.sort((a, b) => (b.last3 ?? -1) - (a.last3 ?? -1));
}

export function momentumWord(g: number | null, volume: number | null): string {
  if (g === null || volume === null) return "not enough history";
  if (volume < 30) return "low volume";
  if (g > 0.15) return "rising fast";
  if (g > 0.05) return "rising";
  if (g < -0.15) return "falling fast";
  if (g < -0.05) return "falling";
  return "steady";
}

/** Nykaa asks reviewers to tag what stood out ("Moisturizing Effect", "Gentle Formula") with a sentiment.
 *  Aggregated, these say what a product is actually liked or disliked for — in shoppers' own terms. */
export interface AspectStat { label: string; positive: number; negative: number; total: number }

export function aspectSummary(rows: { aspects: ReviewAspect[] | null }[]): AspectStat[] {
  const by = new Map<string, AspectStat>();
  for (const r of rows) {
    for (const a of r.aspects ?? []) {
      const label = a.displayText?.trim();
      if (!label) continue;
      const stat = by.get(label) ?? { label, positive: 0, negative: 0, total: 0 };
      if (/^neg/i.test(a.sentimentValue)) stat.negative += 1; else stat.positive += 1;
      stat.total += 1;
      by.set(label, stat);
    }
  }
  return [...by.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}
