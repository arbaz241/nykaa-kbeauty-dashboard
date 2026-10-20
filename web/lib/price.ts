import { PER_SHEET, packMl, sheetCount } from "./format";
import type { CatalogRow, ShelfRow } from "./types";
import { tr } from "./i18n";

/** Brand price benchmark: like-for-like, on a fixed basket of core skincare categories, on MRP (the list price;
 *  selling prices move with each sale, so they are shown second). Medians, not averages: a few premium products
 *  would pull an average up.
 *  The old "typical price" was the median of whatever happened to rank in the top 100 that day, so a
 *  brand ranking with a sheet mask and a lip balm looked cheap (Innisfree ₹720 vs ₹1,403 across its range). */
export const PRICE_BASKET = ["toner", "serum", "face_moisturizer", "face_wash", "sunscreen"] as const;
export const basketLabel = () => tr("Toner, Serum, Moisturiser, Face wash, Sunscreen; full sizes only", "토너, 세럼, 보습 크림, 클렌징 폼, 선크림 · 정규 용량만");

/** Below this a pack is a mini/travel/trial size, not the size a shopper compares on. */
const MINI_ML = 15;
const NOT_STANDARD = /\b(combo|kit|gift|set of|sets?\b|duo|trio|bundle|pack of \d|mini|travel|trial|sample|discovery|\d+\s*x\s*\d+|value pack)\b/i;
/** " + " joins two products only when both sides name one ("Toner + Serum"); "Relief Sunscreen Rice + Probiotics" or
 *  "Niacinamide + Zinc" is one product's ingredients. Owner 21 Oct 2026: the old rule dropped Beauty of Joseon's best
 *  seller from every per-ml price. */
const PRODUCT_WORD = /\b(toner|serum|essence|ampoule|cream|moisturi[sz]er|lotion|cleanser|face ?wash|foam|sunscreen|sun (?:cream|stick|serum)|mask|balm|oil|mist|gel|lipstick|lip ?tint|foundation|cushion|primer|eye cream|scrub)\b/i;
const twoProducts = (name: string) => name.split(/\s\+\s/).length > 1 && name.split(/\s\+\s/).filter((part) => PRODUCT_WORD.test(part)).length >= 2;
const NOT_STANDARD_L3 = new Set(["Combos @ Nykaa", "Gift Sets", "Makeup Combos", "Bath & Body Combos"]);

export interface PricedItem { product_id: string; brand: string; name: string; category: string; price: number; ml: number | null; perHundred: number | null }

/** Why an item is left out of the benchmark, or null when it counts. */
export function exclusion(r: { name: string; pack_size: string | null; l3?: string | null; nykaa_l3?: string | null; price: number | null }): string | null {
  if (!r.price) return "no price";
  if (NOT_STANDARD_L3.has(r.l3 ?? r.nykaa_l3 ?? "")) return "combo or gift set";
  if (NOT_STANDARD.test(r.name) || twoProducts(r.name)) return "combo, kit or mini";
  const ml = packMl(r.pack_size) ?? packMl(r.name);
  if (ml !== null && ml < MINI_ML) return "mini size";
  return null;
}

/** One brand's comparable products per basket category: its full Nykaa catalogue when we track it, else what
 *  it has on today's top-100 shelves. In-stock only; combos, gift sets, minis and samples excluded. */
export function basketItems(brand: string, catalog: CatalogRow[], shelf: ShelfRow[]): { items: PricedItem[]; source: "range" | "shelf" } {
  const fromCat = catalog.filter((r) => r.brand === brand && r.in_stock !== false);
  const useCat = catalog.some((r) => r.brand === brand);
  const out = new Map<string, PricedItem>();
  const add = (pid: string, name: string, cat: string, price: number | null, pack: string | null) => {
    // price here is the MRP when the listing shows one
    if (!PRICE_BASKET.includes(cat as (typeof PRICE_BASKET)[number]) || !price) return;
    const ml = packMl(pack) ?? packMl(name);
    out.set(`${cat}|${pid}`, { product_id: pid, brand, name, category: cat, price, ml, perHundred: ml ? (price / ml) * 100 : null });
  };
  if (useCat) {
    for (const r of fromCat) if (!exclusion(r)) for (const c of r.subcategories) add(r.product_id, r.name, c, r.mrp ?? r.price, r.pack_size);
  } else {
    for (const r of shelf) if (r.brand === brand && r.in_stock !== false && !exclusion(r)) add(r.product_id, r.name, r.subcategory, r.mrp ?? r.price, r.pack_size);
  }
  return { items: [...out.values()], source: useCat ? "range" : "shelf" };
}

const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b); if (!s.length) return null;
  const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export interface BasketPrice {
  brand: string; source: "range" | "shelf";
  /** median price and ₹/100ml per basket category, with how many products it rests on */
  byCategory: Record<string, { price: number; perHundred: number | null; n: number }>;
  /** average of the category medians: only categories the brand sells */
  overall: number | null; categories: number;
  /** price relative to the anchor on the categories both sell (geometric mean of the ratios), 1 = same */
  vsAnchor: number | null; shared: number;
}

export function basketPrice(brand: string, catalog: CatalogRow[], shelf: ShelfRow[]): Omit<BasketPrice, "vsAnchor" | "shared"> {
  const { items, source } = basketItems(brand, catalog, shelf);
  const byCategory: BasketPrice["byCategory"] = {};
  for (const c of PRICE_BASKET) {
    const xs = items.filter((i) => i.category === c);
    if (!xs.length) continue;
    byCategory[c] = { price: med(xs.map((i) => i.price))!, perHundred: med(xs.map((i) => i.perHundred).filter((v): v is number => v !== null)), n: xs.length };
  }
  const vals = Object.values(byCategory).map((v) => v.price);
  return { brand, source, byCategory, overall: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, categories: vals.length };
}

/** Median full-size price in any one category (also outside the basket), on the same exclusion rules. */
export function categoryPrice(brand: string, cat: string, catalog: CatalogRow[], shelf: ShelfRow[]) {
  const useCat = catalog.some((r) => r.brand === brand);
  const src = useCat ? catalog.filter((r) => r.brand === brand && r.subcategories.includes(cat)) : shelf.filter((r) => r.brand === brand && r.subcategory === cat);
  const items = [...new Map(src.filter((r) => r.in_stock !== false && !exclusion(r)).map((r) => [r.product_id, r])).values()];
  if (!items.length) return null;
  const per = items.map((r) => { const ml = packMl(r.pack_size) ?? packMl(r.name); const p = r.mrp ?? r.price; return ml && p ? (p / ml) * 100 : null; }).filter((v): v is number => v !== null);
  return { price: med(items.map((r) => (r.mrp ?? r.price)!))!, perHundred: med(per), n: items.length };
}

export function withAnchor(prices: Omit<BasketPrice, "vsAnchor" | "shared">[], anchor: string): BasketPrice[] {
  const a = prices.find((p) => p.brand === anchor);
  return prices.map((p) => {
    if (!a || p.brand === anchor) return { ...p, vsAnchor: p.brand === anchor ? 1 : null, shared: p.categories };
    const shared = Object.keys(p.byCategory).filter((c) => a.byCategory[c]);
    const logs = shared.map((c) => Math.log(p.byCategory[c].price / a.byCategory[c].price));
    return { ...p, vsAnchor: logs.length ? Math.exp(logs.reduce((x, y) => x + y, 0) / logs.length) : null, shared: shared.length };
  });
}

export interface Bench {
  /** the K-beauty leader's MRP per unit: what every product is compared against */
  value: number; unit: "100 ml/g" | "sheet";
  leader: { product_id: string; brand: string; name: string; url: string | null; reviews: number; buying: number | null; mrp: number; size: string };
  /** context only: median and range of comparable products in today's top 100 */
  median: number | null; min: number | null; max: number | null; n: number;
}

/** MRP per unit of one shelf listing on the category's basis (per 100 ml/g, or per sheet for sheet masks). */
export function shelfUnit(r: ShelfRow, perSheet: boolean, std: number | null): { value: number; size: string } | null {
  const p = r.mrp ?? r.price; if (!p || exclusion(r)) return null;
  if (perSheet) {
    if (/patch/i.test(r.name)) return null; // acne patches share the shelf but are not masks
    const c = sheetCount(r.pack_size, r.name); return { value: p / c.n, size: `${c.n} sheet${c.n === 1 ? "" : "s"}${c.est ? " (est.)" : ""}` };
  }
  const ml = packMl(r.pack_size) ?? packMl(r.name);
  if (!ml || ml < MINI_ML || (std && (ml < std / 2 || ml > std * 2))) return null;
  return { value: (p / ml) * 100, size: `${ml} ml/g` };
}

/** A product's full-size variant nearest the usual size, as MRP per 100 ml/g. */
function nearestSize(vs: { pack_size: string | null; mrp: number | null }[], std: number) {
  const c = vs.map((v) => ({ ml: packMl(v.pack_size), mrp: v.mrp })).filter((v): v is { ml: number; mrp: number } => !!v.ml && v.ml >= MINI_ML && !!v.mrp)
    .sort((a, b) => Math.abs(a.ml - std) - Math.abs(b.ml - std))[0];
  return c ? { value: (c.mrp / c.ml) * 100, size: `${c.ml} ml/g`, mrp: c.mrp } : null;
}

/** The K-beauty product with the most buying in the category's top 100 (the anchor's own excluded), or null when the list has no buying yet. */
export function kBeautyLeaderId(shelf: ShelfRow[], cat: string, anchor: string, buying: Map<string, number>): string | null {
  let best: string | null = null; let v = 0;
  for (const r of shelf) if (r.subcategory === cat && r.origin === "kbeauty" && r.brand !== anchor && (buying.get(r.product_id) ?? 0) > v) { v = buying.get(r.product_id)!; best = r.product_id; }
  return best;
}

/** Benchmark (owner, 10 Oct): the K-beauty leader of the category, Innisfree's own excluded; the category median stays
 *  as context. Leader = the K-beauty product with the most buying (new ratings × MRP) in the category's top 100. Owner
 *  21 Oct 2026: picking it by lifetime reviews made COSRX's Aloe Sun Cream (#77, ₹37k of buying) the sunscreen leader
 *  over Beauty of Joseon's Relief Sunscreen (#3, ₹17.6 lakh). Reviews decide only on lists with no buying yet. If the
 *  leader's size can't be found, there is no benchmark rather than a lesser one. */
export function kBeautyBenchmark(shelf: ShelfRow[], cat: string, anchor: string, std: number | null, buying?: Map<string, number>, sizeOf?: (r: ShelfRow) => string | null,
  variantsOf?: (pid: string) => { pack_size: string | null; mrp: number | null }[]): Bench | null {
  const perSheet = PER_SHEET.has(cat);
  const seen = new Set<string>(); const vals: number[] = [];
  const top = buying ? kBeautyLeaderId(shelf, cat, anchor, buying) : null;
  let lead: Bench["leader"] | null = null; let leadVal = 0;
  for (const r of shelf) {
    if (r.subcategory !== cat || seen.has(r.product_id)) continue;
    seen.add(r.product_id);
    // a listing without a pack size on Nykaa's list takes it from its own product page, when given
    const fill = !r.pack_size && sizeOf ? sizeOf(r) : null;
    const row = fill ? { ...r, pack_size: fill } : r;
    const u = shelfUnit(row, perSheet, std);
    if (u) vals.push(u.value);
    const reviews = r.review_count ?? r.rating_count ?? 0;
    const isLead: boolean = top ? r.product_id === top : !!u && r.origin === "kbeauty" && r.brand !== anchor && (!lead || reviews > lead.reviews);
    // the top seller is the leader at whatever size it sells (audit 21 Oct: TONYMOLY's 500 ml Mochi Toner fell outside
    // the usual-size band, so toner had "no K-beauty product" to compare with); the band only shapes the median
    // like the compared products, the leader is priced at its size nearest the category's usual one (a 500 ml jumbo
    // bottle is cheaper per ml and made a 160 ml toner look "+202%")
    // sizes of the leader: its product-page variants, else its sibling listings that share its rating count (Nykaa lists
    // TONYMOLY's Mochi Toner as a 500 ml and a 100 ml listing with one set of ratings)
    const sizes: { pack_size: string | null; mrp: number | null }[] = isLead && !perSheet && std ? [...(variantsOf?.(r.product_id) ?? []),
      ...shelf.filter((x) => x.subcategory === cat && x.brand === r.brand && !!r.rating_count && x.rating_count === r.rating_count).map((x) => ({ pack_size: x.pack_size ?? (packMl(x.name) ? `${packMl(x.name)}ml` : null), mrp: x.mrp }))] : [];
    const near: { value: number; size: string; mrp: number } | null = sizes.length && std ? nearestSize(sizes, std) : null;
    const lu: { value: number; size: string; mrp?: number } | null = !isLead ? null : near ?? u ?? (top ? shelfUnit(row, perSheet, null) : null);
    if (isLead && lu) { lead = { product_id: r.product_id, brand: r.brand, name: r.name, url: r.url, reviews, buying: top ? buying!.get(top) ?? null : null, mrp: lu.mrp ?? (r.mrp ?? r.price)!, size: lu.size }; leadVal = lu.value; }
  }
  if (!lead) return null;
  return { value: leadVal, unit: perSheet ? "sheet" : "100 ml/g", leader: lead, median: vals.length >= 3 ? med(vals) : null,
    min: vals.length ? Math.min(...vals) : null, max: vals.length ? Math.max(...vals) : null, n: vals.length };
}
