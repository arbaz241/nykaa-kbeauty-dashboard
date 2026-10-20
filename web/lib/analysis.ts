import { norm } from "./brands";
import { monthsWindow } from "./metrics";
import type { BrandDaily, BrandShare, CatalogRow, ProductDemand, ReviewMonth, SearchRow, ShelfRow } from "./types";
import type { FlowRow } from "./market";
import { push } from "@/lib/group";
import { monthShort, tr } from "./i18n";

/** Round 3 analysis layer (docs/round3 plan, owner decisions 12 Oct 2026). Every figure here comes with the
 *  basis it is computed on, so the page can show "compared with what" right next to the number. */

const same = (a: string, b: string) => norm(a) === norm(b);
const fmtMonth = (m: string) => monthShort(new Date(m));

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
  // Round 4 (17 Oct 2026): the last 3 complete months against the same 3 months a year earlier, the way Nykaa
  // reports growth. It compared with the 3 months just before until then, which read +3% for the market.
  const w = monthsWindow(15);
  const recentMonths = w.slice(12); const priorMonths = w.slice(0, 3);
  const yr = new Date(w[14]).getFullYear(); const py = new Date(w[0]).getFullYear();
  return { recentMonths, priorMonths, recent: tr(`${fmtMonth(w[12])}–${fmtMonth(w[14])} ${yr}`, `${yr}년 ${fmtMonth(w[12]).replace("월", "")}–${fmtMonth(w[14])}`),
    prior: tr(`${fmtMonth(w[0])}–${fmtMonth(w[2])} ${py}`, `${py}년 ${fmtMonth(w[0]).replace("월", "")}–${fmtMonth(w[2])}`) };
}

/** One row per review pool (a product and its variants share reviews). Categories come from the demand view,
 *  then the shelf, then the catalogue. Coverage comes from the monthly review history. */
export function demandRows(months: ReviewMonth[], demand: ProductDemand[], shelf: ShelfRow[], catalog: CatalogRow[]): DemandRow[] {
  const win = demandWindow();
  const byProduct = new Map<string, ReviewMonth[]>();
  for (const m of months) push(byProduct, m.product_id, m);
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

/** The one growth figure used everywhere (owner 19 Oct 2026: "standardise this growth for products, brands and
 *  Nykaa as a whole"): written reviews in the last 3 complete months against the same 3 months a year earlier, for
 *  the SAME products only (complete history and reviews a year ago). Products launched since are counted apart
 *  (`launches`), never as growth: the products we track are picked from today's lists, so counting launches would
 *  read as growth that the market didn't have (Demand read +75% that way; same products read close to Nykaa). */
export function growthOf(rows: DemandRow[]) {
  const c = rows.filter((r) => r.complete && r.prior > 0);
  const recent = c.reduce((a, r) => a + r.recent, 0); const prior = c.reduce((a, r) => a + r.prior, 0);
  const launches = rows.filter((r) => r.complete && r.prior === 0 && r.recent > 0).length;
  return { growth: prior > 0 ? recent / prior - 1 : null, recent, prior, products: c.length, launches };
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
  /** Share of all buying across the tracked top 100s (owner 20 Oct 2026: a share of the reviews we happen to track is
   *  not a market share, it moves with how many of a brand's products we follow). */
  demand: number; buying: number;
  /** Written reviews on the brand's tracked products in the last 3 months (context, not a share). */
  demandRecent: number;
  growth: number | null; growthProducts: number;
}

export interface Scoreboard {
  rows: ScoreRow[];
  shelfTotal: number; searchDay: string; searchThenDay: string | null;
  shelfDay: string; shelfThenDay: string | null; likeForLikeCats: number;
  demandTotal: number; buyingTotal: number; market: ReturnType<typeof growthOf>;
}

/** Share of search, as the glossary defines it: each brand's places among the unpaid top 10 of every keyword
 *  collected that day (one sample per keyword), over all those places. Paid slots are counted separately. */
export function searchShares(search: SearchRow[], day: string) {
  const byQ = new Map<string, SearchRow[]>();
  for (const r of search) if (r.scrape_date === day) push(byQ, r.query, r);
  const by = new Map<string, number>(); const paid = new Map<string, number>(); let total = 0;
  for (const rs of byQ.values()) {
    const minS = Math.min(...rs.map((r) => r.sample));
    const unpaid = rs.filter((r) => !r.is_ad && r.sample === minS).sort((a, b) => a.rank - b.rank).slice(0, 10);
    unpaid.forEach((r) => { const k = norm(r.brand); by.set(k, (by.get(k) ?? 0) + 1); total++; });
    rs.filter((r) => r.is_ad).forEach((r) => { const k = norm(r.brand); paid.set(k, (paid.get(k) ?? 0) + 1); });
  }
  return { total, share: (b: string) => (total ? (by.get(norm(b)) ?? 0) / total : 0), paidSlots: (b: string) => paid.get(norm(b)) ?? 0, places: (b: string) => by.get(norm(b)) ?? 0 };
}

export function scoreboard(brands: string[], daily: BrandDaily[], shares: BrandShare[], rows: DemandRow[], search: SearchRow[], flow: FlowRow[], cats: string[]): Scoreboard {
  const days = shelfDays(daily); const today = days.at(-1) ?? "";
  const then = days.length > 14 ? days.at(-15)! : days.length > 1 ? days[0] : null;
  const catsOn = (d: string) => new Set(daily.filter((r) => r.scrape_date === d && r.subcategory !== "kbeauty_store").map((r) => r.subcategory));
  const both = then ? new Set([...catsOn(today)].filter((c) => catsOn(then).has(c))) : undefined;
  const now = shelfShare(daily, today); const nowL = both ? shelfShare(daily, today, both) : null; const thenL = then && both ? shelfShare(daily, then, both) : null;

  void shares;
  const sDays = [...new Set(search.map((s) => s.scrape_date))].sort(); const sToday = sDays.at(-1) ?? ""; const sThen = sDays.length > 7 ? sDays.at(-8)! : null;
  const sNow = searchShares(search, sToday); const sBefore = sThen ? searchShares(search, sThen) : null;
  const voice = (b: string, m: ReturnType<typeof searchShares> | null) => (m ? m.share(b) : 0);
  const paid = (b: string) => { const p = sNow.paidSlots(b); const e = sNow.places(b); return p + e ? p / (p + e) : null; };
  const byBrand = new Map<string, DemandRow[]>(); for (const r of rows) { const k = norm(r.brand); push(byBrand, k, r); }

  const demandTotal = rows.reduce((a, r) => a + r.recent, 0);
  const inCats = new Set(cats); const buyBy = new Map<string, number>(); let buyingTotal = 0;
  for (const f of flow) if (inCats.has(f.subcategory) && f.value > 0) { const k = norm(f.brand); buyBy.set(k, (buyBy.get(k) ?? 0) + f.value); buyingTotal += f.value; }
  const out = brands.map((b) => {
    const mine = byBrand.get(norm(b)) ?? []; const g = growthOf(mine);
    return {
      brand: b, shelf: now.share(b), shelfSlots: now.count(b),
      // the comparison counts only categories tracked on both days, so a newly added category is not a gain
      slotsChange: thenL && nowL ? nowL.count(b) - thenL.count(b) : null,
      search: voice(b, sNow), searchChange: sThen ? voice(b, sNow) - voice(b, sBefore) : null, paid: paid(b),
      demand: buyingTotal ? (buyBy.get(norm(b)) ?? 0) / buyingTotal : 0, buying: buyBy.get(norm(b)) ?? 0, demandRecent: mine.reduce((a, r) => a + r.recent, 0),
      growth: g.growth, growthProducts: g.products,
    };
  });
  return { rows: out, shelfTotal: now.total, searchDay: sToday, searchThenDay: sThen, shelfDay: today, shelfThenDay: then, likeForLikeCats: both?.size ?? 0, demandTotal, buyingTotal, market: growthOf(rows) };
}

/** 1-based rank of `b` among `rows` on a metric (higher = better). */
export function rankOn(rows: ScoreRow[], b: string, k: "shelf" | "search" | "demand") {
  const s = [...rows].sort((x, y) => y[k] - x[k]); return s.findIndex((r) => same(r.brand, b)) + 1;
}

/* ------------------------------------------------------------------ the category opportunity map */

export interface CategoryCell {
  category: string;
  /** Written reviews in the last 3 months on the category's tracked products (context for the growth figure). */
  recent: number; products: number; brands: number;
  growth: number | null; growthBase: { recent: number; prior: number; products: number };
  /** Share of the category's buying held by the products the growth figure rests on. */
  coverage: number;
  /** The category's buying (₹, new ratings × MRP) and the anchor's share of it: the site's one share measure. */
  buying: number; anchorShare: number; anchorProducts: number;
  /** The anchor's place among the brands with buying in the category (null = no buying counted for it), out of `brandsCounted`. */
  anchorPlace: number | null; brandsCounted: number;
  leader: { brand: string; share: number }; focusLeader: { brand: string; share: number } | null;
  thin: string | null;
  quadrant: "opportunity" | "invest" | "maintain" | "low" | null;
}

/** The four areas of the category map. Owner 20 Oct 2026: describe where a category sits, never tell the reader what
 *  to do about it ("be gentle… don't give statements too leaning on some front"); the ids stay for the code. */
const quad = (label: [string, string], read: [string, string], tone: "good" | "bad" | "accent" | "muted") =>
  ({ get label() { return tr(...label); }, get read() { return tr(...read); }, tone });
export const QUAD: Record<NonNullable<CategoryCell["quadrant"]>, { label: string; read: string; tone: "good" | "bad" | "accent" | "muted" }> = {
  opportunity: quad(["Faster growth · outside the top 5", "빠른 성장 · 상위 5위 밖"], ["Growing faster than all tracked products, and the anchor is not among the category's 5 biggest brands", "추적 제품 전체보다 빠르게 성장, 기준 브랜드는 카테고리 상위 5개 브랜드 밖"], "accent"),
  invest: quad(["Faster growth · top-5 brand", "빠른 성장 · 상위 5위"], ["Growing faster than all tracked products, and the anchor is among the category's 5 biggest brands", "추적 제품 전체보다 빠르게 성장, 기준 브랜드는 카테고리 상위 5개 브랜드"], "good"),
  maintain: quad(["Slower growth · top-5 brand", "느린 성장 · 상위 5위"], ["Growing slower than all tracked products; the anchor is among the category's 5 biggest brands", "추적 제품 전체보다 느리게 성장, 기준 브랜드는 카테고리 상위 5개 브랜드"], "muted"),
  low: quad(["Slower growth · outside the top 5", "느린 성장 · 상위 5위 밖"], ["Growing slower than all tracked products, and the anchor is not among the category's 5 biggest brands", "추적 제품 전체보다 느리게 성장, 기준 브랜드는 카테고리 상위 5개 브랜드 밖"], "muted"),
};

/** Category map (round 6 sweep, owner 20 Oct 2026: numbers that hold up in front of others). Across: the anchor's share
 *  of the category's buying (the same measure as the rest of the site), with its share across all lists as the dividing
 *  line. Up: the category's written-review growth on the same products, with all tracked products' growth as the line.
 *  Each growth figure says how much of the category's buying its products hold; below a quarter, or on fewer than 6
 *  products, the bubble is hollow and not placed in an area. */
export function categoryMap(anchor: string, rows: DemandRow[], isFocus: (b: string) => boolean, flow: FlowRow[], poolOf: (pid: string) => string, cats: string[]) {
  const market = growthOf(rows);
  const inCats = new Set(cats);
  const live = flow.filter((f) => inCats.has(f.subcategory) && f.value > 0);
  const all = live.reduce((a, f) => a + f.value, 0);
  const usual = all ? live.filter((f) => same(f.brand, anchor)).reduce((a, f) => a + f.value, 0) / all : 0;
  const by = new Map<string, DemandRow[]>();
  for (const r of rows) if (r.category && inCats.has(r.category)) push(by, r.category, r);
  const cells: CategoryCell[] = [];
  for (const category of cats) {
    const rs = by.get(category) ?? [];
    const fs = live.filter((f) => f.subcategory === category);
    const buying = fs.reduce((a, f) => a + f.value, 0);
    const recent = rs.reduce((a, r) => a + r.recent, 0);
    const g = growthOf(rs);
    const base = new Set(rs.filter((r) => r.complete && r.prior > 0).map((r) => poolOf(r.product_id)));
    const coverage = buying ? fs.filter((f) => base.has(poolOf(f.product_id))).reduce((a, f) => a + f.value, 0) / buying : 0;
    const brand = new Map<string, number>(); fs.forEach((f) => brand.set(f.brand, (brand.get(f.brand) ?? 0) + f.value));
    const ranked = [...brand.entries()].sort((a, b) => b[1] - a[1]);
    const anchorBuy = ranked.find(([b]) => same(b, anchor))?.[1] ?? 0;
    const placeIdx = ranked.findIndex(([b, v]) => same(b, anchor) && v > 0);
    const lead = ranked.find(([b]) => !same(b, anchor)) ?? ["", 0];
    const fl = ranked.find(([b]) => !same(b, anchor) && isFocus(b));
    const thin = !buying ? tr("no buying counted in this list yet", "이 목록은 아직 판매 집계 없음")
      : g.growth === null || g.products < 6 ? tr(`growth rests on ${g.products} product${g.products === 1 ? "" : "s"}`, `성장률이 제품 ${g.products}개에 기댐`)
      : coverage < 0.25 ? tr(`growth covers ${Math.round(coverage * 100)}% of the category's buying`, `성장률이 카테고리 판매의 ${Math.round(coverage * 100)}%만 반영`) : null;
    const anchorShare = buying ? anchorBuy / buying : 0;
    const fast = g.growth !== null && market.growth !== null && g.growth >= market.growth;
    cells.push({
      category, recent, products: rs.length, brands: brand.size, growth: g.growth, growthBase: g, coverage, buying,
      anchorShare, anchorProducts: fs.filter((f) => same(f.brand, anchor)).length, anchorPlace: placeIdx >= 0 ? placeIdx + 1 : null, brandsCounted: ranked.length,
      leader: { brand: lead[0], share: buying ? lead[1] / buying : 0 },
      focusLeader: fl ? { brand: fl[0], share: buying ? fl[1] / buying : 0 } : null,
      // owner 20 Oct 2026: the old dividing line (the anchor's share across all 15 lists, 0.3%) mixed in lists it doesn't
      // sell in and meant little; its place among the category's brands reads plainly
      thin, quadrant: thin ? null : fast ? (placeIdx >= 0 && placeIdx < 5 ? "invest" : "opportunity") : placeIdx >= 0 && placeIdx < 5 ? "maintain" : "low",
    });
  }
  return { cells: cells.sort((a, b) => b.buying - a.buying || b.recent - a.recent), usual, market };
}

/* ------------------------------------------------------------------ range gaps, with the products behind every cell */

export const BANDS: [string, number, number][] = [["Under ₹500", 0, 500], ["₹500–999", 500, 1000], ["₹1,000–1,999", 1000, 2000], ["₹2,000+", 2000, Infinity]];
/** A price band's label in the current language (the English label stays the band's id). */
export const bandLabel = (l: string) => tr(l, l === "Under ₹500" ? "₹500 미만" : l === "₹2,000+" ? "₹2,000 이상" : l);

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
      return { label, anchor: a, rivals: rv, rivalBrands: [...new Map(rv.map((r) => [norm(r.brand), r.brand])).values()], gap: a.length === 0 && rv.length >= 3 };
    }),
  }));
}
