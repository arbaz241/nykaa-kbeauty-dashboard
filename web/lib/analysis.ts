import { norm } from "./brands";
import { monthsWindow } from "./metrics";
import type { BrandDaily, BrandShare, CatalogRow, ProductDemand, ReviewMonth, ShelfRow } from "./types";

/** Round 3 analysis layer (docs/round3 plan, owner decisions 12 Oct 2026). Every figure here comes with the
 *  basis it is computed on, so the page can show "compared with what" right next to the number. */

const same = (a: string, b: string) => norm(a) === norm(b);
const fmtMonth = (m: string) => new Date(m).toLocaleDateString("en-IN", { month: "short" });

/* ------------------------------------------------------------------ demand per product, with coverage */

export interface DemandRow {
  product_id: string; brand: string; name: string; category: string | null; url: string | null;
  /** Reviews dated in the last 3 complete months. */
  recent: number;
  /** Reviews dated in the 3 months before; meaningful only when `complete`. */
  prior: number;
  /** History covers all 6 months, so the product may enter a growth comparison. */
  complete: boolean;
}

export interface DemandWindow { recent: string; prior: string; recentMonths: string[]; priorMonths: string[] }

export function demandWindow(): DemandWindow {
  const w = monthsWindow(12);
  const recentMonths = w.slice(9); const priorMonths = w.slice(6, 9);
  const yr = new Date(w[11]).getFullYear();
  return { recentMonths, priorMonths, recent: `${fmtMonth(w[9])}–${fmtMonth(w[11])} ${yr}`, prior: `${fmtMonth(w[6])}–${fmtMonth(w[8])}` };
}

/** One row per review pool (a product and its variants share reviews). Categories come from the demand view,
 *  then the shelf, then the catalogue. Coverage comes from the monthly review history. */
export function demandRows(months: ReviewMonth[], demand: ProductDemand[], shelf: ShelfRow[], catalog: CatalogRow[]): DemandRow[] {
  const win = demandWindow();
  const byProduct = new Map<string, ReviewMonth[]>();
  for (const m of months) byProduct.set(m.product_id, [...(byProduct.get(m.product_id) ?? []), m]);
  const dem = new Map(demand.map((d) => [d.product_id, d]));
  const catOf = (pid: string) => dem.get(pid)?.category ?? shelf.find((r) => r.product_id === pid)?.subcategory ?? catalog.find((r) => r.product_id === pid)?.subcategories?.[0] ?? null;
  const rows: (DemandRow & { pool: string; lifetime: number })[] = [];
  for (const [pid, ms] of byProduct) {
    const cov = ms.reduce((a, m) => (m.coverage_start > a ? m.coverage_start : a), "1900-01-01");
    const sumIn = (set: string[]) => ms.filter((m) => set.includes(m.month.slice(0, 10)) && m.month >= m.coverage_start).reduce((a, m) => a + m.reviews, 0);
    rows.push({
      product_id: pid, brand: ms[0].brand, name: ms[0].name, url: ms[0].url, category: catOf(pid),
      recent: sumIn(win.recentMonths), prior: sumIn(win.priorMonths), complete: cov <= win.priorMonths[0],
      pool: dem.get(pid)?.pool_id || pid, lifetime: ms.reduce((a, m) => a + m.reviews, 0),
    });
  }
  const best = new Map<string, (typeof rows)[number]>();
  for (const r of rows) { const c = best.get(r.pool); if (!c || r.lifetime > c.lifetime || (!c.category && r.category)) best.set(r.pool, r); }
  return [...best.values()].map((r) => ({ product_id: r.product_id, brand: r.brand, name: r.name, category: r.category, url: r.url, recent: r.recent, prior: r.prior, complete: r.complete }));
}

/** Growth from complete products only, with how many products it rests on. */
export function growthOf(rows: DemandRow[]) {
  const c = rows.filter((r) => r.complete);
  const recent = c.reduce((a, r) => a + r.recent, 0); const prior = c.reduce((a, r) => a + r.prior, 0);
  return { growth: prior > 0 ? recent / prior - 1 : null, recent, prior, products: c.length };
}

/* ------------------------------------------------------------------ shelf share, like for like */

export function shelfDays(daily: BrandDaily[]) {
  return [...new Set(daily.map((r) => r.scrape_date))].sort();
}

/** Each brand's share of the top-100 places, on a chosen set of categories (so a newly added category does not
 *  read as a gain). */
export function shelfShare(daily: BrandDaily[], day: string, cats?: Set<string>) {
  const rows = daily.filter((r) => r.scrape_date === day && r.subcategory !== "kbeauty_store" && (!cats || cats.has(r.subcategory)));
  const total = rows.reduce((a, r) => a + Number(r.slots), 0);
  const by = new Map<string, number>();
  for (const r of rows) { const k = norm(r.brand); by.set(k, (by.get(k) ?? 0) + Number(r.slots)); }
  return { total, share: (b: string) => (total ? (by.get(norm(b)) ?? 0) / total : 0), count: (b: string) => by.get(norm(b)) ?? 0 };
}

/* ------------------------------------------------------------------ the scoreboard: three shares side by side */

export interface ScoreRow {
  brand: string;
  shelf: number; shelfSlots: number;
  /** Change in places over the comparison window, counted only on categories tracked on both days. */
  slotsChange: number | null;
  search: number; searchChange: number | null; paid: number | null;
  demand: number; demandRecent: number;
  growth: number | null; growthProducts: number;
}

export interface Scoreboard {
  rows: ScoreRow[];
  shelfTotal: number; searchDay: string; searchThenDay: string | null;
  shelfDay: string; shelfThenDay: string | null; likeForLikeCats: number;
  demandTotal: number; market: ReturnType<typeof growthOf>;
}

export function scoreboard(brands: string[], daily: BrandDaily[], shares: BrandShare[], rows: DemandRow[]): Scoreboard {
  const days = shelfDays(daily); const today = days.at(-1) ?? "";
  const then = days.length > 14 ? days.at(-15)! : days.length > 1 ? days[0] : null;
  const catsOn = (d: string) => new Set(daily.filter((r) => r.scrape_date === d && r.subcategory !== "kbeauty_store").map((r) => r.subcategory));
  const both = then ? new Set([...catsOn(today)].filter((c) => catsOn(then).has(c))) : undefined;
  const now = shelfShare(daily, today); const nowL = both ? shelfShare(daily, today, both) : null; const thenL = then && both ? shelfShare(daily, then, both) : null;

  const sDays = [...new Set(shares.map((s) => s.scrape_date))].sort(); const sToday = sDays.at(-1) ?? ""; const sThen = sDays.length > 7 ? sDays.at(-8)! : null;
  const onDay = (d: string | null) => new Map(d ? shares.filter((s) => s.scrape_date === d).map((s) => [norm(s.brand), s]) : []);
  const sNow = onDay(sToday); const sBefore = onDay(sThen);
  const voice = (b: string, m: Map<string, BrandShare>) => Number(m.get(norm(b))?.share_of_voice ?? 0);
  const paid = (b: string) => sNow.get(norm(b))?.paid_dependency ?? null;
  const byBrand = new Map<string, DemandRow[]>(); for (const r of rows) { const k = norm(r.brand); byBrand.set(k, [...(byBrand.get(k) ?? []), r]); }

  const demandTotal = rows.reduce((a, r) => a + r.recent, 0);
  const out = brands.map((b) => {
    const mine = byBrand.get(norm(b)) ?? []; const g = growthOf(mine);
    return {
      brand: b, shelf: now.share(b), shelfSlots: now.count(b),
      // the comparison counts only categories tracked on both days, so a newly added category is not a gain
      slotsChange: thenL && nowL ? nowL.count(b) - thenL.count(b) : null,
      search: voice(b, sNow), searchChange: sThen ? voice(b, sNow) - voice(b, sBefore) : null, paid: paid(b),
      demand: demandTotal ? mine.reduce((a, r) => a + r.recent, 0) / demandTotal : 0, demandRecent: mine.reduce((a, r) => a + r.recent, 0),
      growth: g.growth, growthProducts: g.products,
    };
  });
  return { rows: out, shelfTotal: now.total, searchDay: sToday, searchThenDay: sThen, shelfDay: today, shelfThenDay: then, likeForLikeCats: both?.size ?? 0, demandTotal, market: growthOf(rows) };
}

/** 1-based rank of `b` among `rows` on a metric (higher = better). */
export function rankOn(rows: ScoreRow[], b: string, k: "shelf" | "search" | "demand") {
  const s = [...rows].sort((x, y) => y[k] - x[k]); return s.findIndex((r) => same(r.brand, b)) + 1;
}

/* ------------------------------------------------------------------ the category opportunity map */

export interface CategoryCell {
  category: string; recent: number; products: number; brands: number;
  growth: number | null; growthBase: { recent: number; prior: number; products: number };
  anchorRecent: number; anchorShare: number; anchorProducts: number;
  leader: { brand: string; recent: number; share: number }; focusLeader: { brand: string; recent: number; share: number } | null;
  thin: string | null;
  quadrant: "opportunity" | "invest" | "maintain" | "low" | null;
}

export const QUAD: Record<NonNullable<CategoryCell["quadrant"]>, { label: string; read: string; tone: "good" | "bad" | "accent" | "muted" }> = {
  opportunity: { label: "Opportunity", read: "Growing faster than the market, and the anchor does worse here than its usual share", tone: "accent" },
  invest: { label: "Protect and invest", read: "Growing faster than the market, and the anchor does better here than usual", tone: "good" },
  maintain: { label: "Maintain", read: "Growing slower than the market; the anchor does better here than usual", tone: "muted" },
  low: { label: "Low priority", read: "Growing slower than the market, and the anchor does worse here than usual", tone: "bad" },
};

export function categoryMap(anchor: string, rows: DemandRow[], isFocus: (b: string) => boolean) {
  const market = growthOf(rows);
  const all = rows.reduce((a, r) => a + r.recent, 0);
  const usual = all ? rows.filter((r) => same(r.brand, anchor)).reduce((a, r) => a + r.recent, 0) / all : 0;
  const by = new Map<string, DemandRow[]>();
  for (const r of rows) if (r.category && r.category !== "kbeauty_store") by.set(r.category, [...(by.get(r.category) ?? []), r]);
  const cells: CategoryCell[] = [];
  for (const [category, rs] of by) {
    const recent = rs.reduce((a, r) => a + r.recent, 0);
    const g = growthOf(rs);
    const brand = new Map<string, number>(); rs.forEach((r) => brand.set(r.brand, (brand.get(r.brand) ?? 0) + r.recent));
    const ranked = [...brand.entries()].sort((a, b) => b[1] - a[1]);
    const anchorRecent = ranked.find(([b]) => same(b, anchor))?.[1] ?? 0;
    const lead = ranked.find(([b]) => !same(b, anchor)) ?? ["", 0];
    const fl = ranked.find(([b]) => !same(b, anchor) && isFocus(b));
    const thin = recent < 300 ? `only ${recent} reviews in 3 months` : g.products < 6 ? `growth rests on ${g.products} products` : null;
    const anchorShare = recent ? anchorRecent / recent : 0;
    const fast = g.growth !== null && market.growth !== null && g.growth >= market.growth;
    cells.push({
      category, recent, products: rs.length, brands: brand.size, growth: g.growth, growthBase: g,
      anchorRecent, anchorShare, anchorProducts: rs.filter((r) => same(r.brand, anchor)).length,
      leader: { brand: lead[0], recent: lead[1], share: recent ? lead[1] / recent : 0 },
      focusLeader: fl ? { brand: fl[0], recent: fl[1], share: recent ? fl[1] / recent : 0 } : null,
      thin, quadrant: thin || g.growth === null ? null : fast ? (anchorShare >= usual ? "invest" : "opportunity") : anchorShare >= usual ? "maintain" : "low",
    });
  }
  return { cells: cells.sort((a, b) => b.recent - a.recent), usual, market };
}

/* ------------------------------------------------------------------ range gaps, with the products behind every cell */

export const BANDS: [string, number, number][] = [["Under ₹500", 0, 500], ["₹500–999", 500, 1000], ["₹1,000–1,999", 1000, 2000], ["₹2,000+", 2000, Infinity]];

export interface GapCell { label: string; anchor: CatalogRow[]; rivals: CatalogRow[]; rivalBrands: string[]; gap: boolean }
export interface GapRow { category: string; bands: GapCell[] }

/** Every category the anchor sells in, split into MRP bands, with the anchor's and the focus brands' products. */
export function rangeGrid(anchor: string, catalog: CatalogRow[], isFocus: (b: string) => boolean): GapRow[] {
  const latest = new Map<string, string>();
  for (const r of catalog) if (!latest.has(r.brand) || r.scrape_date > latest.get(r.brand)!) latest.set(r.brand, r.scrape_date);
  const rows = catalog.filter((r) => r.scrape_date === latest.get(r.brand));
  const anchorRows = rows.filter((r) => same(r.brand, anchor));
  const cats = [...new Set(anchorRows.flatMap((r) => r.subcategories ?? []))].filter((c) => c !== "kbeauty_store");
  const price = (r: CatalogRow) => r.mrp ?? r.price ?? null;
  return cats.map((c) => ({
    category: c,
    bands: BANDS.map(([label, lo, hi]) => {
      const inCell = (r: CatalogRow) => (r.subcategories ?? []).includes(c) && price(r) !== null && price(r)! >= lo && price(r)! < hi;
      const a = anchorRows.filter(inCell);
      const rv = rows.filter((r) => !same(r.brand, anchor) && isFocus(r.brand) && inCell(r));
      return { label, anchor: a, rivals: rv, rivalBrands: [...new Set(rv.map((r) => r.brand))], gap: a.length === 0 && rv.length >= 3 };
    }),
  }));
}
