import { norm } from "./brands";
import { pct } from "./format";
import { monthYear, tr } from "./i18n";
import type { PoolProduct } from "./market";
import type { ProductDemand, ReviewMonth } from "./types";
import { monthsLabel, monthWindow, type MonthWindow } from "./period";

/** "No blank growth" (owner yes, 21 Oct 2026; method and backtest in the 20 Oct funnel analysis).
 *
 *  Year-on-year growth needs a product's reviews from a year ago. Two kinds of product can't have that:
 *  - big sellers whose history is cut off (Nykaa serves only the newest 2,000 reviews), and
 *  - launches (not on sale a year ago).
 *  Instead of a blank:
 *  - a cut-off big seller shows its share of its category's reviews, earliest readable quarter → latest quarter
 *    (the same fixed set of category products in both, so seasons and sales cancel out);
 *  - a launch shows when it launched and its share of the category's reviews now;
 *  - a brand's growth includes its cut-off big sellers with an estimated year-ago base: the product's earliest
 *    readable quarter scaled by how its category moved between that quarter and a year ago. Backtest on 43 brands:
 *    median error 8–13 points with the estimate, 18 points leaving them out.
 *  "All tracked products" stays same-products only: it is the yardstick. */

export type Fill =
  | { kind: "share"; fromLabel: string; then: number; now: number; recentLabel: string }
  | { kind: "launch"; launched: string; now: number; recentLabel: string }
  | { kind: "short"; since: string };

export interface FillCtx { w: MonthWindow; byCat: Map<string, PoolProduct[]> }

const sum = (p: PoolProduct, ms: string[]) => ms.reduce((a, m) => a + (p.byMonth.get(m) ?? 0), 0);
const addMonths = (m: string, k: number) => { const d = new Date(`${m.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + k); return d.toISOString().slice(0, 10); };
const quarterFrom = (m: string) => [0, 1, 2].map((k) => addMonths(m, k));
const FULL = "1900-01-02"; // a product whose whole history was read carries coverage 1900-01-01

export function fillContext(pool: PoolProduct[], latest: string): FillCtx {
  const byCat = new Map<string, PoolProduct[]>();
  for (const p of pool) if (p.category) { const xs = byCat.get(p.category); if (xs) xs.push(p); else byCat.set(p.category, [p]); }
  return { w: monthWindow(latest, 3, "yoy"), byCat };
}

const hasYoY = (p: PoolProduct, w: MonthWindow) => p.coverage <= w.base[0] && sum(p, w.base) > 0;

/** What a product shows where its year-on-year growth would be blank; null when it has year-on-year growth (or
 *  nothing honest to show). */
export function productFill(ctx: FillCtx, p: PoolProduct | undefined): Fill | null {
  if (!p) return null;
  const { w } = ctx;
  if (hasYoY(p, w)) return null;
  const cat = p.category ? ctx.byCat.get(p.category) ?? [] : [];
  const r = sum(p, w.recent);
  if (p.coverage < FULL && p.first && p.first.slice(0, 10) >= addMonths(w.base[0], 3)) {
    // the latest complete month only: a launch's first months spike, so a quarter would overstate its place
    const last = [w.recent[2]];
    const den = cat.filter((q) => q.coverage <= last[0]);
    const tot = den.reduce((a, q) => a + sum(q, last), 0);
    return { kind: "launch", launched: `${p.first.slice(0, 7)}-01`, now: tot ? sum(p, last) / tot : 0, recentLabel: monthsLabel(last) };
  }
  if (p.coverage >= FULL && p.coverage > w.base[0]) {
    const w0 = quarterFrom(p.coverage);
    if (w0[2] >= w.recent[0]) return { kind: "short", since: p.coverage };
    const den = cat.filter((q) => q.coverage <= w0[0]);
    const t0 = den.reduce((a, q) => a + sum(q, w0), 0); const tR = den.reduce((a, q) => a + sum(q, w.recent), 0);
    if (!t0 || !tR || sum(p, w0) < 10) return { kind: "short", since: p.coverage };
    return { kind: "share", fromLabel: monthsLabel(w0), then: sum(p, w0) / t0, now: r / tR, recentLabel: monthsLabel(w.recent) };
  }
  return null;
}

/** A brand's growth with its cut-off big sellers included at an estimated year-ago base. */
export function brandGrowth(ctx: FillCtx, pool: PoolProduct[], brand: string) {
  const { w } = ctx; const b = norm(brand);
  let recent = 0; let base = 0; let products = 0; let estimated = 0;
  for (const p of pool) {
    if (norm(p.brand) !== b) continue;
    if (hasYoY(p, w)) { recent += sum(p, w.recent); base += sum(p, w.base); products++; continue; }
    if (!(p.coverage >= FULL && p.coverage > w.base[0]) || !p.category) continue;
    const w0 = quarterFrom(p.coverage);
    if (w0[2] >= w.recent[0]) continue;
    const yoy = (ctx.byCat.get(p.category) ?? []).filter((q) => q !== p && hasYoY(q, w));
    const cW0 = yoy.reduce((a, q) => a + sum(q, w0), 0); const cB = yoy.reduce((a, q) => a + sum(q, w.base), 0);
    const pW0 = sum(p, w0);
    if (pW0 < 10 || !cW0 || !cB) continue;
    recent += sum(p, w.recent); base += (pW0 * cB) / cW0; estimated++;
  }
  return { recent, base, products, estimated, change: base > 0 ? recent / base - 1 : null };
}

/** The fill in words, for a table cell or a line under a chart. */
export function fillText(f: Fill): string {
  const p = (v: number) => pct(v, 1);
  if (f.kind === "share") return tr(`${p(f.then)} → ${p(f.now)} of category reviews (${f.fromLabel} → ${f.recentLabel})`, `카테고리 리뷰 점유 ${p(f.then)} → ${p(f.now)} (${f.fromLabel} → ${f.recentLabel})`);
  if (f.kind === "launch") return tr(`Launched ${monthYear(f.launched)} · ${p(f.now)} of category reviews in ${f.recentLabel}`, `${monthYear(f.launched)} 출시 · ${f.recentLabel} 카테고리 리뷰의 ${p(f.now)}`);
  return tr(`Only reviews since ${monthYear(f.since)} are visible on Nykaa`, `Nykaa에서 ${monthYear(f.since)} 이후 리뷰만 확인 가능`);
}

/** Review pools from the review months and demand rows alone (for tabs that don't load the whole market data):
 *  one product per Nykaa review pool, the one with the most reviews, as lib/market's poolProducts does. */
export function poolFromMonths(months: ReviewMonth[], demand: ProductDemand[]): PoolProduct[] {
  const dem = new Map(demand.map((d) => [d.product_id, d]));
  const members = new Map<string, string[]>();
  for (const d of demand) { const k = d.pool_id || d.product_id; const xs = members.get(k); if (xs) xs.push(d.product_id); else members.set(k, [d.product_id]); }
  const by = new Map<string, ReviewMonth[]>();
  for (const m of months) { const xs = by.get(m.product_id); if (xs) xs.push(m); else by.set(m.product_id, [m]); }
  const best = new Map<string, PoolProduct & { lifetime: number }>();
  for (const [pid, ms] of by) {
    const coverage = ms.reduce((a, m) => (m.coverage_start > a ? m.coverage_start : a), "1900-01-01").slice(0, 10);
    const byMonth = new Map<string, number>(); let earliest: string | null = null; let lifetime = 0;
    for (const m of ms) { const k = m.month.slice(0, 10); lifetime += m.reviews; if (m.reviews > 0 && (!earliest || k < earliest)) earliest = k; if (k >= coverage) byMonth.set(k, (byMonth.get(k) ?? 0) + m.reviews); }
    const pool = dem.get(pid)?.pool_id || pid;
    const p = { product_id: pid, brand: ms[0].brand, name: ms[0].name, category: dem.get(pid)?.category ?? null, price: null, first: earliest && earliest >= coverage ? earliest : null, coverage, byMonth, lifetime,
      members: members.get(pool) ?? [pid] };
    const cur = best.get(pool); if (!cur || lifetime > cur.lifetime) best.set(pool, p);
  }
  return [...best.values()];
}
