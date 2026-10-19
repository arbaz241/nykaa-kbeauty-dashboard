import { norm } from "./brands";
import { push } from "./group";
import { addDays, type MonthWindow } from "./period";
import type { CatalogRow, HomepageFeature, MarketEvent, ProductDemand, ReviewMonth, ShelfDay, ShelfProduct, ShelfRow, BrandOffer } from "./types";
import { tr } from "./i18n";
import { CATEGORIES, inr, median } from "./format";

/** Round 4 market layer (plan https://claude.ai/artifact/EHrtxEG82NePyf1d9CJPBv, owner decisions 17 Oct 2026).
 *
 *  Two measures of buying, one per clock:
 *  - Review value (monthly, years back): reviews written in a month × the product's MRP (owner 19 Oct 2026: the printed
 *    price, the same for every seller and every day, not the selling price that moves with each sale). Growth compares the
 *    chosen months with the same months a year earlier (or the months before), category by category, and Nykaa's
 *    total is the categories' growth weighted by their share of value (owner: "weights from our own data").
 *  - Rating flow (daily, since 13 Sep): how many new ratings each top-100 listing gained over the period
 *    (Nykaa's rating count, stars with or without text, rises about ten times faster than written reviews), × MRP.
 *  Neither is sales; both move with sales. Every figure carries what it rests on. */

export const MAKEUP = new Set(["lipstick", "foundation", "lip_tint", "bb_cream", "blush", "lip_gloss"]);

/** What counts in each list (plan v4, owner 18 Oct 2026: "own category only, and ranks also as per that"). Nykaa's
 *  page for a category also shows products Nykaa itself files elsewhere (a sheet mask on "Masks & peels" keeps the
 *  label "Sheet Masks"). A listing counts when Nykaa's label for it that day is one of these; a listing Nykaa gave no
 *  label counts too (we don't guess). Ranks are renumbered among the products that count; Nykaa's own position is
 *  kept as nykaa_rank. */
export const HOME_L3: Record<string, string[]> = {
  face_moisturizer: ["Face Moisturizer & Day Cream", "Night Cream"], serum: ["Serums & Essence"], sunscreen: ["Face Sunscreen"],
  face_wash: ["Face Wash", "Cleanser"], masks: ["Masks & Peels", "Face Packs"], sheet_mask: ["Sheet Masks"],
  toner: ["Toners & Mists", "Facial Mists", "Rose Water"], eye_care: ["Under Eye Cream & Serums", "Dark Circles & Wrinkles", "Dark Circles / Wrinkles", "Eye Masks"],
  lip_care: ["Lip Balm", "Lip Masks"], lipstick: ["Lipstick", "Lip Crayon"], foundation: ["Foundation"], lip_tint: ["Lip Tint"],
  bb_cream: ["BB & CC Cream", "Tinted Moisturizer"], blush: ["Blush"], lip_gloss: ["Lip Gloss", "Lip Plumper"],
};
export const countsIn = (cat: string, l3: string | null | undefined) => !l3 || !HOME_L3[cat] || HOME_L3[cat].includes(l3);
export type Vertical = "skin" | "makeup";
export const verticalOf = (cat: string): Vertical => (MAKEUP.has(cat) ? "makeup" : "skin");
export const VERTICAL_LABEL = () => ({ skin: tr("Skin", "스킨케어"), makeup: tr("Makeup", "메이크업") });
const STORE = "kbeauty_store";

/* ------------------------------------------------------------------ review value growth */

export interface GrowthCell {
  /** Value (reviews × price) in the chosen months, every product. */
  recent: number;
  /** Value in the comparison months, products whose history reaches back that far. */
  base: number;
  /** Recent value of those same products (like for like). */
  existingRecent: number;
  /** Recent value of products launched after the comparison months. */
  launchRecent: number;
  products: number; launches: number;
  /** Products left out: Nykaa shows only their latest ~1,000 reviews, so their comparison months are incomplete. */
  excluded: number;
  growth: number | null;
  /** Growth of the products that were already on sale (like for like). */
  existing: number | null;
  /** Points of growth that came from launches. */
  launch: number | null;
}

const emptyCell = (): GrowthCell => ({ recent: 0, base: 0, existingRecent: 0, launchRecent: 0, products: 0, launches: 0, excluded: 0, growth: null, existing: null, launch: null });
function finish(c: GrowthCell) {
  if (c.base > 0) {
    c.growth = (c.existingRecent + c.launchRecent) / c.base - 1;
    c.existing = c.existingRecent / c.base - 1;
    c.launch = c.launchRecent / c.base;
  }
  return c;
}

export interface ValueInput {
  months: ReviewMonth[]; demand: ProductDemand[];
  shelf: ShelfRow[]; catalog: CatalogRow[]; products: ShelfProduct[]; daily: ShelfDay[];
}

export interface PoolProduct {
  product_id: string; brand: string; name: string; category: string | null; /** MRP, selling price when none */ price: number | null;
  first: string | null; coverage: string; byMonth: Map<string, number>;
  /** Every listing whose reviews this one stands for (other sizes Nykaa pools with it), itself included. */
  members?: string[];
}

/** One product per review pool (sizes of one product share Nykaa's reviews), with its category, price and first
 *  review month. Price = MRP (selling price when none): today's shelf, then the brand catalogue, then the last day it
 *  was on a shelf. */
export function poolProducts({ months, demand, shelf, catalog, products, daily }: ValueInput): PoolProduct[] {
  const dem = new Map(demand.map((d) => [d.product_id, d]));
  const shelfBy = new Map<string, ShelfRow>(); for (const r of shelf) if (!shelfBy.has(r.product_id) || r.subcategory !== STORE) shelfBy.set(r.product_id, r);
  const catBy = new Map(catalog.map((r) => [r.product_id, r]));
  const prodBy = new Map(products.map((p) => [p.product_id, p]));
  const lastPrice = new Map<string, number>();
  const lastCat = new Map<string, string>();
  for (const d of daily) { const p = d.mrp ?? d.price; if (p) lastPrice.set(d.product_id, p); if (d.subcategory !== STORE) lastCat.set(d.product_id, d.subcategory); }
  const byProduct = new Map<string, ReviewMonth[]>(); for (const m of months) push(byProduct, m.product_id, m);
  const all: (PoolProduct & { pool: string; lifetime: number })[] = [];
  for (const [pid, ms] of byProduct) {
    const s = shelfBy.get(pid); const c = catBy.get(pid);
    const category = dem.get(pid)?.category ?? (s && s.subcategory !== STORE ? s.subcategory : null) ?? c?.subcategories?.[0] ?? lastCat.get(pid) ?? null;
    const price = s?.mrp ?? s?.price ?? c?.mrp ?? c?.price ?? lastPrice.get(pid) ?? null;
    const coverage = ms.reduce((a, m) => (m.coverage_start > a ? m.coverage_start : a), "1900-01-01").slice(0, 10);
    const byMonth = new Map<string, number>();
    let earliest: string | null = null;
    for (const m of ms) {
      const k = m.month.slice(0, 10);
      if (m.reviews > 0 && (!earliest || k < earliest)) earliest = k;
      if (k >= coverage) byMonth.set(k, (byMonth.get(k) ?? 0) + m.reviews);
    }
    // the first review: Nykaa's own date when we have it; otherwise the earliest month, if the history is complete there
    const fr = s?.first_review_date ?? prodBy.get(pid)?.first_review_date ?? null;
    const first = fr ? `${fr.slice(0, 7)}-01` : earliest && earliest >= coverage ? earliest : null;
    all.push({ product_id: pid, brand: ms[0].brand, name: ms[0].name, category, price, first, coverage, byMonth, pool: dem.get(pid)?.pool_id || pid, lifetime: ms.reduce((a, m) => a + m.reviews, 0) });
  }
  const best = new Map<string, (typeof all)[number]>();
  for (const r of all) { const c = best.get(r.pool); if (!c || r.lifetime > c.lifetime || (!c.category && r.category)) best.set(r.pool, r); }
  const members = new Map<string, string[]>(); for (const d of demand) { const k = d.pool_id || d.product_id; push(members, k, d.product_id); }
  for (const r of all) push(members, r.pool, r.product_id);
  return [...best.values()].map((r) => ({ ...r, members: [...new Set(members.get(r.pool) ?? [r.product_id])] }));
}

export interface GrowthResult {
  byCategory: Map<string, GrowthCell>;
  byVertical: Record<Vertical, GrowthCell>;
  total: GrowthCell;
  /** Each category's share of value in the comparison months: its weight in the total. */
  weight: Map<string, number>;
  /** Each category's share of value in the chosen months. */
  share: Map<string, number>;
  byBrand: Map<string, GrowthCell>;
  byOrigin: Map<string, GrowthCell>;
  priceMissing: number;
}

/** Growth of review value per category and in total. The total equals the categories' growth weighted by their
 *  share of value in the comparison months (Σ weight × growth). */
export function valueGrowth(pool: PoolProduct[], win: MonthWindow, originOf: (b: string) => string): GrowthResult {
  const lastBase = win.base[win.base.length - 1];
  const cats = new Map<string, number[]>(); // category -> prices, for products without one
  for (const p of pool) if (p.category && p.price) push(cats, p.category, p.price);
  const med = new Map([...cats].map(([c, ps]) => [c, ps.sort((a, b) => a - b)[Math.floor(ps.length / 2)]]));
  const byCategory = new Map<string, GrowthCell>(); const byBrand = new Map<string, GrowthCell>(); const byOrigin = new Map<string, GrowthCell>();
  const byVertical: Record<Vertical, GrowthCell> = { skin: emptyCell(), makeup: emptyCell() };
  const total = emptyCell();
  let priceMissing = 0;
  for (const p of pool) {
    if (!p.category || p.category === STORE) continue;
    const price = p.price ?? med.get(p.category) ?? null;
    if (!p.price) priceMissing++;
    if (!price) continue;
    const sum = (ms: string[]) => ms.reduce((a, m) => a + (p.byMonth.get(m) ?? 0), 0) * price;
    const recent = sum(win.recent);
    // a launch: first reviewed after the comparison months, so nothing to compare with. Otherwise the product
    // compares like for like when its history reaches back to the comparison months.
    const launch = p.first !== null && p.first > lastBase;
    const comparable = !launch && p.coverage <= win.base[0];
    const cells = [getCell(byCategory, p.category), byVertical[verticalOf(p.category)], total, getCell(byBrand, p.brand), getCell(byOrigin, originOf(p.brand))];
    for (const c of cells) {
      c.recent += recent;
      if (comparable) { c.base += sum(win.base); c.existingRecent += recent; c.products++; }
      else if (launch) { c.launchRecent += recent; c.launches++; }
      else c.excluded++;
    }
  }
  [...byCategory.values(), ...byBrand.values(), ...byOrigin.values(), byVertical.skin, byVertical.makeup, total].forEach(finish);
  const baseTot = [...byCategory.values()].reduce((a, c) => a + c.base, 0) || 1;
  const recTot = [...byCategory.values()].reduce((a, c) => a + c.recent, 0) || 1;
  return {
    byCategory, byVertical, total, byBrand, byOrigin, priceMissing,
    weight: new Map([...byCategory].map(([k, c]) => [k, c.base / baseTot])),
    share: new Map([...byCategory].map(([k, c]) => [k, c.recent / recTot])),
  };
}
function getCell<K>(m: Map<K, GrowthCell>, k: K) { let c = m.get(k); if (!c) { c = emptyCell(); m.set(k, c); } return c; }

/** Review value by month for each vertical (and in total): the demand trend chart. Products count from the month
 *  their history is complete. */
export function monthlyValue(pool: PoolProduct[], monthsAxis: string[]) {
  const out = { skin: monthsAxis.map(() => 0), makeup: monthsAxis.map(() => 0), total: monthsAxis.map(() => 0) };
  const idx = new Map(monthsAxis.map((m, i) => [m, i]));
  for (const p of pool) {
    if (!p.category || p.category === STORE || !p.price) continue;
    const v = verticalOf(p.category);
    for (const [m, n] of p.byMonth) { const i = idx.get(m); if (i === undefined) continue; out[v][i] += n * p.price; out.total[i] += n * p.price; }
  }
  return out;
}

/* ------------------------------------------------------------------ rating flow on the shelf */

export interface FlowRow {
  product_id: string; subcategory: string; brand: string; origin: string; name: string; url: string | null;
  /** New ratings between the start and end of the period (on the shelf both days). */
  flow: number;
  /** flow × MRP (selling price when a listing shows no MRP) */
  value: number;
  rankStart: number | null; rankEnd: number | null; price: number | null;
  /** The category started being tracked after the period began, so its period is shorter. */
  partial: boolean;
  /** A combo or kit: Nykaa shows it with the ratings of the products inside it, so its flow and value are left at
   *  0 (plan v2: combos were 4% of listings but 31% of rating value). `rawFlow` keeps what it would have been. */
  combo: boolean; rawFlow: number;
  /** Listings sharing this listing's rating count (1 = its own). The pool is counted once, at its median MRP. */
  poolSize: number;
  /** Position on Nykaa's own page (rankEnd is the position among the category's own products). */
  nykaaRank: number;
}

/** Combos, kits and routines: several products sold as one listing. */
export const isCombo = (name: string) => /\b(combo|kit|duo|trio|set of|pack of|routine|gift set|monthly pack|value pack|mega pack)\b/i.test(name);

/** Nykaa stopped updating rating counts on 10 Oct 2026 (its own app and product pages still show the 9 Oct count).
 *  A day counts as live when at least 20% of the listings seen the day before changed their count; buying figures
 *  end on the last live day, and the pages say so. */
export interface Freeze { lastLive: string; since: string; days: number }
export function ratingFreeze(ix: DailyIndex): Freeze | null {
  let lastLive: string | null = null;
  for (let i = 1; i < ix.days.length; i++) {
    const a = ix.byDay.get(ix.days[i - 1])!; const b = ix.byDay.get(ix.days[i])!;
    let both = 0; let changed = 0;
    for (const [k, r] of b) { const p = a.get(k); if (!p || p.rating_count === null || r.rating_count === null) continue; both++; if (p.rating_count !== r.rating_count) changed++; }
    if (both && changed / both >= 0.2) lastLive = ix.days[i];
  }
  const latest = ix.days[ix.days.length - 1];
  if (!lastLive || lastLive === latest) return null;
  const since = ix.days[ix.days.indexOf(lastLive) + 1];
  return { lastLive, since, days: ix.days.length - 1 - ix.days.indexOf(lastLive) };
}

export interface Dim { brand: string; origin: string; name: string; url: string | null; first_review_date: string | null }
export function productDims(products: ShelfProduct[], shelf: ShelfRow[]): Map<string, Dim> {
  const m = new Map<string, Dim>();
  for (const p of products) m.set(p.product_id, { brand: p.brand, origin: p.origin, name: p.name, url: p.url, first_review_date: p.first_review_date });
  for (const r of shelf) if (!m.has(r.product_id)) m.set(r.product_id, { brand: r.brand, origin: r.origin, name: r.name, url: r.url, first_review_date: r.first_review_date });
  return m;
}

/** Index daily rows by day and by category, built once per data load. */
export interface DailyIndex {
  days: string[];
  /** day -> "cat|pid" -> row */
  byDay: Map<string, Map<string, ShelfDay>>;
  /** category -> first day tracked */
  catStart: Map<string, string>;
  /** "cat|pid" -> rows, oldest first */
  series: Map<string, ShelfDay[]>;
  /** "day|cat|pid" pinned by Nykaa to the top of its list that day. The daily view has no pin flag (audit 19 Oct:
   *  Nykaa pins 77-104 products a day, so a pin starting or ending read as a move with no cause). */
  pinned?: Set<string>;
}
export function indexDaily(all: ShelfDay[]): DailyIndex {
  const byDay = new Map<string, Map<string, ShelfDay>>(); const catStart = new Map<string, string>(); const series = new Map<string, ShelfDay[]>();
  // own category only, ranks renumbered per day and category (Nykaa's position kept); the Korean store is a store
  const groups = new Map<string, ShelfDay[]>();
  for (const r of all) {
    if (r.subcategory !== STORE && !countsIn(r.subcategory, r.nykaa_l3)) continue;
    push(groups, `${r.scrape_date}|${r.subcategory}`, r);
  }
  const daily: ShelfDay[] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.rank - b.rank);
    g.forEach((r, i) => daily.push(r.subcategory === STORE ? { ...r, nykaa_rank: r.rank } : { ...r, rank: i + 1, nykaa_rank: r.rank }));
  }
  for (const r of daily) {
    let d = byDay.get(r.scrape_date); if (!d) { d = new Map(); byDay.set(r.scrape_date, d); }
    const k = `${r.subcategory}|${r.product_id}`;
    d.set(k, r);
    const cs = catStart.get(r.subcategory); if (!cs || r.scrape_date < cs) catStart.set(r.subcategory, r.scrape_date);
    push(series, k, r);
  }
  for (const s of series.values()) s.sort((a, b) => a.scrape_date.localeCompare(b.scrape_date));
  return { days: [...byDay.keys()].sort(), byDay, catStart, series };
}

/** The tracked day on or after `d` (a category added later starts on its own first day). */
function onOrAfter(days: string[], d: string) { return days.find((x) => x >= d) ?? null; }

/** New ratings each top-100 listing gained between two days, per category. Nykaa sometimes shows one rating count
 *  for a whole family of a brand's products (20 Nykaa sheet masks share 7.6M ratings; TONYMOLY's four Wonder toners
 *  share one count). Plan v4: such a pool counts ONCE across every list, credited to its best-placed listing, at the
 *  median MRP of the listings sharing it, and the row says how many share it (poolSize). */
export function ratingFlow(ix: DailyIndex, dims: Map<string, Dim>, start: string, end: string, includeStore = false, ratingEnd?: string): FlowRow[] {
  const endMap = ix.byDay.get(end); if (!endMap) return [];
  // ratings stop at `ratingEnd` when Nykaa froze its counts; ranks still run to `end`
  const rEnd = ratingEnd && ratingEnd < end && ratingEnd > start ? ix.byDay.get(ratingEnd) : null;
  const noRatings = !!ratingEnd && ratingEnd <= start;
  const out: FlowRow[] = [];
  const entries = [...endMap].filter(([, e]) => includeStore || e.subcategory !== STORE).sort((a, b) => a[1].rank - b[1].rank);
  const startOf = (k: string, cat: string) => {
    const cs = ix.catStart.get(cat) ?? start;
    const s0 = cs > start ? onOrAfter(ix.days, cs) : start;
    return { s: s0 ? ix.byDay.get(s0)?.get(k) : undefined, partial: cs > start };
  };
  const poolKey = (k: string, e: ShelfDay) => {
    const s = startOf(k, e.subcategory).s; const re = rEnd ? rEnd.get(k) : e;
    if (!s || !re || s.rating_count === null || re.rating_count === null || re.rating_count < 100) return null;
    return `${norm(dims.get(e.product_id)?.brand ?? "?")}|${s.rating_count}|${re.rating_count}`;
  };
  // every listing sharing a pool, on any list (the Korean store too: its prices are real prices)
  const members = new Map<string, number[]>();
  for (const [k, e] of endMap) { const p = poolKey(k, e); const price = e.mrp ?? e.price; if (p && price) push(members, p, price); }
  const seenPool = new Set<string>();
  for (const [k, e] of entries) {
    const cat = e.subcategory;
    const { s, partial } = startOf(k, cat);
    const dim = dims.get(e.product_id);
    const brand = dim?.brand ?? "?";
    let flow = 0; let poolSize = 1; let price = e.mrp ?? e.price; // value at MRP; the row still shows the selling price
    const combo = isCombo(dim?.name ?? "");
    const re = rEnd ? rEnd.get(k) : e;
    if (!noRatings && s && re && s.rating_count !== null && re.rating_count !== null) {
      flow = Math.max(0, re.rating_count - s.rating_count);
      const p = poolKey(k, e); const m = p ? members.get(p) ?? [] : [];
      if (p && m.length > 1) {
        poolSize = m.length;
        if (seenPool.has(p)) flow = 0; else { seenPool.add(p); price = median(m) ?? price; }
      }
    }
    const counted = combo ? 0 : flow;
    out.push({ product_id: e.product_id, subcategory: cat, brand, origin: dim?.origin ?? "unknown", name: dim?.name ?? e.product_id, url: dim?.url ?? null,
      flow: counted, value: counted * (price ?? 0), rankStart: s?.rank ?? null, rankEnd: e.rank, price: e.price ?? e.mrp ?? null, partial, combo, rawFlow: flow,
      poolSize, nykaaRank: e.nykaa_rank ?? e.rank });
  }
  return out;
}

/** Buying per day in each category. Lists started on different days and the ratings stopped on 9 Oct, so a total
 *  across categories adds per-day figures, never raw sums (plan v4). */
export function perDay(ix: DailyIndex, cat: string, start: string, end: string) {
  const cs = ix.catStart.get(cat) ?? start;
  const s0 = cs > start ? onOrAfter(ix.days, cs) : start;
  const i0 = s0 ? ix.days.indexOf(s0) : -1; const i1 = ix.days.indexOf(end);
  return i0 >= 0 && i1 > i0 ? i1 - i0 : 0;
}

/** How closely our buying order follows Nykaa's own order in a category (Spearman, -1 to 1): each product's average
 *  place over the window against its buying. */
export function rankAgreement(ix: DailyIndex, flow: FlowRow[], cat: string, start: string, end: string) {
  const rows = flow.filter((r) => r.subcategory === cat && !r.combo);
  if (rows.length < 10) return null;
  const avg = rows.map((r) => {
    const s = (ix.series.get(`${cat}|${r.product_id}`) ?? []).filter((d) => d.scrape_date >= start && d.scrape_date <= end);
    return s.length ? s.reduce((a, d) => a + d.rank, 0) / s.length : 101;
  });
  const rankOf = (xs: number[]) => { const o = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array(xs.length); o.forEach(([, i], k) => { r[i] = k; }); return r as number[]; };
  const a = rankOf(avg.map((v) => -v)); const b = rankOf(rows.map((r) => r.value)); const n = rows.length;
  return 1 - (6 * a.reduce((t, x, i) => t + (x - b[i]) ** 2, 0)) / (n * (n * n - 1));
}

/** Totals that count a product once even when it sits on two shelves. */
export function uniqueFlow(rows: FlowRow[]) {
  const best = new Map<string, FlowRow>();
  for (const r of rows) { const c = best.get(r.product_id); if (!c || r.flow > c.flow) best.set(r.product_id, r); }
  return [...best.values()];
}

export interface Agg { key: string; flow: number; value: number; listings: number; top20: number; best: number | null }
export function aggregate(rows: FlowRow[], keyOf: (r: FlowRow) => string): Map<string, Agg> {
  const m = new Map<string, Agg>();
  for (const r of rows) {
    const k = keyOf(r); let a = m.get(k);
    if (!a) { a = { key: k, flow: 0, value: 0, listings: 0, top20: 0, best: null }; m.set(k, a); }
    a.flow += r.flow; a.value += r.value; a.listings++; if ((r.rankEnd ?? 999) <= 20) a.top20++;
    if (r.rankEnd !== null && (a.best === null || r.rankEnd < a.best)) a.best = r.rankEnd;
  }
  return m;
}

/** Places a brand holds on a given day (categories only), counted on the categories tracked on `onCats`. */
export function placesOn(ix: DailyIndex, dims: Map<string, Dim>, day: string, cats?: Set<string>) {
  const m = new Map<string, number>();
  for (const r of ix.byDay.get(day)?.values() ?? []) {
    // only the shown lists: the hidden cleansing-balm list (owner, 18 Oct) is still collected and would count here
    if (!CATEGORIES.includes(r.subcategory) || (cats && !cats.has(r.subcategory))) continue;
    const b = dims.get(r.product_id)?.brand; if (!b) continue;
    m.set(b, (m.get(b) ?? 0) + 1);
  }
  return m;
}
export function catsOn(ix: DailyIndex, day: string) {
  return new Set([...(ix.byDay.get(day)?.values() ?? [])].map((r) => r.subcategory).filter((c) => c !== STORE && CATEGORIES.includes(c)));
}

/** New ratings per day across the categories (each day vs the day before, listings on both days). */
export function dailyFlow(ix: DailyIndex, dims: Map<string, Dim>, days: string[], keyOf: (r: ShelfDay, d: Dim | undefined) => string | null) {
  const out = new Map<string, number[]>();
  days.forEach((d, i) => {
    const prevDay = ix.days[ix.days.indexOf(d) - 1]; if (!prevDay) return;
    const a = ix.byDay.get(prevDay)!; const b = ix.byDay.get(d)!;
    const seen = new Set<string>();
    for (const [k, r] of b) {
      if (r.subcategory === STORE) continue;
      const p = a.get(k); if (!p || p.rating_count === null || r.rating_count === null) continue;
      const dim = dims.get(r.product_id);
      if (isCombo(dim?.name ?? "")) continue;
      const pool = `${r.subcategory}|${norm(dim?.brand ?? "")}|${p.rating_count}|${r.rating_count}`;
      if (r.rating_count >= 100) { if (seen.has(pool)) continue; seen.add(pool); }
      const key = keyOf(r, dim); if (!key) continue;
      let arr = out.get(key); if (!arr) { arr = days.map(() => 0); out.set(key, arr); }
      arr[i] += Math.max(0, r.rating_count - p.rating_count) * (r.mrp ?? r.price ?? 0);
    }
  });
  return out;
}

/* ------------------------------------------------------------------ events, homepage runs, offers */

export interface Run { kind: string; target: string; label: string; brand: string | null; start: string; end: string; days: number; isAd: boolean }

/** Consecutive days a homepage banner stayed up (a missed night does not break a run). */
export function homepageRuns(rows: HomepageFeature[]): Run[] {
  const by = new Map<string, HomepageFeature[]>();
  for (const r of rows) push(by, `${r.kind}|${r.target}`, r);
  const runs: Run[] = [];
  for (const rs of by.values()) {
    const days = [...new Set(rs.map((r) => r.scrape_date))].sort();
    let s = days[0]; let prev = days[0]; let n = 1;
    const close = () => { const r = rs[0]; runs.push({ kind: r.kind, target: r.target, label: r.label ?? r.target, brand: r.brand, start: s, end: prev, days: n, isAd: rs.some((x) => x.is_ad) }); };
    for (const d of days.slice(1)) {
      if (d <= addDays(prev, 2)) { prev = d; n++; continue; }
      close(); s = d; prev = d; n = 1;
    }
    close();
  }
  return runs.sort((a, b) => b.end.localeCompare(a.end) || b.days - a.days);
}

export type OfferKind = "percent" | "bogo" | "gift" | "members" | "other";
export const OFFER_KIND_LABEL = () => ({
  percent: tr("Extra % off", "추가 할인"), bogo: tr("Buy more, save more", "다구매 할인"), gift: tr("Free gift", "사은품"),
  members: tr("Members only", "회원 전용"), other: tr("Other", "기타"),
});
/** What kind of offer, and whether it is the brand's own or a Nykaa-wide one (a category, Luxe or new customers). */
export function classifyOffer(o: BrandOffer): { kind: OfferKind; brandOwn: boolean } {
  const t = `${o.title ?? ""} ${o.description ?? ""}`.toLowerCase();
  const kind: OfferKind = /prive|nykaapro|new customers|members?/.test(t) ? "members"
    : /buy \d|get \d|\d free/.test(t) ? "bogo" : /gift|mini|free product|complimentary/.test(t) ? "gift" : /% off|flat/.test(t) ? "percent" : "other";
  const brandWord = norm(o.brand).slice(0, 5);
  const sitewide = /on\s+(skincare|makeup|luxe|hair|fragrance|bath)\s+orders|on orders!|only for new customers/.test(t);
  return { kind, brandOwn: !sitewide && (norm(t).includes(brandWord) || /on all .* orders/.test(t)) };
}

/** Largest "% off" or "get N free" in an offer's text, for sorting by depth. */
export function offerDepth(o: BrandOffer): number {
  const t = `${o.title ?? ""} ${o.description ?? ""}`;
  const pc = [...t.matchAll(/(\d{1,2})\s*%/g)].map((m) => Number(m[1]));
  if (/buy 1.*get 1|bogo/i.test(t)) pc.push(50);
  if (/buy 2.*get 1/i.test(t)) pc.push(33);
  return pc.length ? Math.max(...pc) : 0;
}

export function eventsBetween(events: MarketEvent[], start: string, end: string) {
  return events.filter((e) => e.happened_on <= end && (e.ends_on ?? e.happened_on) >= start);
}

/* ------------------------------------------------------------------ why a listing moved */

export interface Reason { kind: "sale" | "offer" | "price" | "paid" | "stock" | "ratings" | "launch" | "homepage" | "rival"; text: string; strength: number }

/** Likely reasons for a rank move between two days, from what changed on the same dates. Several can apply;
 *  none is proof. When nothing matches the caller says "no clear cause". */
export function explainMove(args: {
  key: string; productId: string; brand: string; start: string; end: string; ix: DailyIndex;
  events: MarketEvent[]; runs: Run[]; offers: BrandOffer[]; dims: Map<string, Dim>; firstReview: string | null; up: boolean;
}): Reason[] {
  const { key, start, end, ix, up } = args;
  const s = ix.series.get(key)?.filter((r) => r.scrape_date >= start && r.scrape_date <= end) ?? [];
  const a = s[0]; const b = s[s.length - 1];
  const out: Reason[] = [];
  if (!a || !b) return out;
  // a real price cut: the selling price fell while the MRP stayed the same (Nykaa also swaps the pack it shows)
  if (a.price && b.price && a.mrp === b.mrp && Math.abs(b.price / a.price - 1) >= 0.05) {
    const ch = b.price / a.price - 1;
    if ((ch < 0) === up) out.push({ kind: "price", strength: 3, text: ch < 0 ? tr(`sold ${Math.round(-ch * 100)}% cheaper (${inr(b.price)}, was ${inr(a.price)})`, `${Math.round(-ch * 100)}% 더 싸게 판매 (${inr(b.price)}, 이전 ${inr(a.price)})`)
      : tr(`discount cut: now ${inr(b.price)}, was ${inr(a.price)}`, `할인 축소: 현재 ${inr(b.price)}, 이전 ${inr(a.price)}`) });
  }
  if (a.is_ad !== b.is_ad && b.is_ad === up) out.push({ kind: "paid", strength: 3, text: b.is_ad ? tr("the brand paid for a sponsored spot", "브랜드가 광고 자리를 구매") : tr("its sponsored spot ended", "광고 자리 종료") });
  if (a.has_offer !== b.has_offer && b.has_offer === up) out.push({ kind: "offer", strength: 2, text: b.has_offer ? tr("an offer started on it", "프로모션 시작") : tr("its offer ended", "프로모션 종료") });
  const oos = s.some((r) => r.in_stock === false);
  if (!up && oos) out.push({ kind: "stock", strength: 3, text: tr("ran out of stock", "품절") });
  if (up && a.in_stock === false && b.in_stock !== false) out.push({ kind: "stock", strength: 2, text: tr("back in stock", "재입고") });
  // ratings burst: this period's pace vs the product's lifetime pace
  if (a.rating_count !== null && b.rating_count !== null && args.firstReview) {
    const days = Math.max(1, (Date.parse(end) - Date.parse(start)) / 864e5);
    const life = Math.max(30, (Date.parse(end) - Date.parse(args.firstReview)) / 864e5);
    const pace = (b.rating_count - a.rating_count) / days; const usual = b.rating_count / life;
    if (up && pace > usual * 1.8 && b.rating_count - a.rating_count >= 50) out.push({ kind: "ratings", strength: 2, text: tr(`shoppers rated it ${(pace / usual).toFixed(1)}× faster than usual`, `평가가 평소보다 ${(pace / usual).toFixed(1)}배 빠르게 늘어남`) });
  }
  if (up && args.firstReview && Date.parse(end) - Date.parse(args.firstReview) <= 120 * 864e5) out.push({ kind: "launch", strength: 1, text: tr("new launch, still climbing", "신제품, 상승 중") });
  // an event explains the move only if the listing moved the same way while it ran (from the day before it started)
  const total = a.rank - b.rank;
  const movedDuring = (from: string, to: string) => {
    const before = [...s].reverse().find((r) => r.scrape_date < from) ?? s[0];
    const last = [...s].reverse().find((r) => r.scrape_date <= to) ?? b;
    const d = before.rank - last.rank;
    return last.scrape_date > before.scrape_date && (up ? d > 0 : d < 0) && Math.abs(d) >= Math.max(3, Math.abs(total) * 0.4);
  };
  for (const e of eventsBetween(args.events, start, end)) if ((e.kind === "sale" || !e.brand || norm(e.brand) === norm(args.brand)) && movedDuring(e.happened_on, e.ends_on ?? e.happened_on))
    out.push({ kind: "sale", strength: e.brand ? 2 : 1, text: tr(`during ${e.label}${e.status === "estimated" ? " (dates estimated)" : ""}`, `${e.label} 기간${e.status === "estimated" ? " (날짜 추정)" : ""}`) });
  for (const r of args.runs) if (r.end >= start && r.start <= end && movedDuring(r.start, r.end)) {
    if (r.kind === "sale") out.push({ kind: "sale", strength: 1, text: tr(`during Nykaa's ${r.label} (on its homepage)`, `Nykaa ${r.label} 기간 (홈페이지)`) });
    if (r.kind === "brand" && r.brand && norm(r.brand) === norm(args.brand) && up) out.push({ kind: "homepage", strength: 2, text: tr(`${r.brand} was on Nykaa's homepage for ${r.days} day${r.days === 1 ? "" : "s"}`, `${r.brand} Nykaa 홈페이지 ${r.days}일 노출`) });
  }
  const offerNow = args.offers.filter((o) => norm(o.brand) === norm(args.brand) && o.offer_id !== "none" && o.scrape_date >= start && o.scrape_date <= end && classifyOffer(o).brandOwn)
    .sort((x, y) => offerDepth(y) - offerDepth(x));
  const say = (o: BrandOffer) => (o.description || o.title || "").replace(/\s+/g, " ").replace(/^NykaaPro Offer\s*/i, "").slice(0, 70);
  if (up && offerNow.length) out.push({ kind: "offer", strength: 1, text: tr(`brand offer: ${say(offerNow[0])}`, `브랜드 프로모션: ${say(offerNow[0])}`) });
  // a rival above it disappeared or went out of stock
  if (up && a.rank > 1) {
    const cat = key.split("|")[0];
    const above = [...(ix.byDay.get(start)?.values() ?? [])].filter((r) => r.subcategory === cat && r.rank < a.rank);
    const gone = above.filter((r) => { const now = ix.byDay.get(end)?.get(`${cat}|${r.product_id}`); return !now || now.in_stock === false; });
    if (gone.length >= 5 && gone.length / above.length >= 0.35) out.push({ kind: "rival", strength: 1, text: tr(`${gone.length} products above it left the list or ran out`, `위 제품 ${gone.length}개가 목록에서 빠지거나 품절`) });
  }
  return out.sort((x, y) => y.strength - x.strength);
}

/** A listing's move over a period, from the median rank of its first three collected days to that of its last
 *  three: Nykaa's daily order jumps around (a product can sit at #74 one day and #6 the next), so single days mislead. */
export function smoothedMove(ix: DailyIndex, key: string, start: string, end: string): { from: number; to: number; days: number; bought: boolean } | null {
  const all = (ix.series.get(key) ?? []).filter((r) => r.scrape_date >= start && r.scrape_date <= end);
  // days the product sat in a bought spot (a sponsored tile, or pinned to the top by Nykaa) are placements, not its
  // own rank: Nykaa switches pins on and off from day to day (audit 19 Oct: Plum's toner at #1-3 when pinned,
  // #37-46 when not), so they are left out of the medians. A product in a bought spot nearly every day keeps those
  // ranks and is flagged.
  const open = all.filter((r) => !r.is_ad && !ix.pinned?.has(`${r.scrape_date}|${key}`));
  const bought = open.length < 4 && open.length < all.length;
  const s = bought ? all : open;
  if (s.length < 4) return null;
  const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a[Math.floor(a.length / 2)]; };
  const n = Math.min(3, Math.floor(s.length / 2));
  return { from: med(s.slice(0, n).map((r) => r.rank)), to: med(s.slice(-n).map((r) => r.rank)), days: s.length, bought };
}

export const REASON_COLOR: Record<Reason["kind"], string> = {
  sale: "#b4532a", offer: "#c28a1b", price: "#2a78d6", paid: "#7a5bd6", stock: "#a43c3c", ratings: "#1baf7a", launch: "#2c6e5a", homepage: "#e87ba4", rival: "#8a8880",
};
