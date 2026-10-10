import { packMl } from "./format";
import type { CatalogRow, ShelfRow } from "./types";

/** Brand price benchmark: like-for-like, on a fixed basket of core skincare categories, on MRP (the list price;
 *  selling prices move with each sale, so they are shown second). Medians, not averages: a few premium products
 *  would pull an average up.
 *  The old "typical price" was the median of whatever happened to rank in the top 100 that day, so a
 *  brand ranking with a sheet mask and a lip balm looked cheap (Innisfree ₹720 vs ₹1,403 across its range). */
export const PRICE_BASKET = ["toner", "serum", "face_moisturizer", "face_wash", "sunscreen"] as const;
export const BASKET_LABEL = "Toner, Serum, Moisturiser, Face wash, Sunscreen; full sizes only";

/** Below this a pack is a mini/travel/trial size, not the size a shopper compares on. */
const MINI_ML = 15;
const NOT_STANDARD = /\b(combo|kit|gift|set of|sets?\b|duo|trio|bundle|pack of \d|mini|travel|trial|sample|discovery|\d+\s*x\s*\d+|value pack)\b|\s\+\s/i;
const NOT_STANDARD_L3 = new Set(["Combos @ Nykaa", "Gift Sets", "Makeup Combos", "Bath & Body Combos"]);

export interface PricedItem { product_id: string; brand: string; name: string; category: string; price: number; ml: number | null; perHundred: number | null }

/** Why an item is left out of the benchmark, or null when it counts. */
export function exclusion(r: { name: string; pack_size: string | null; l3?: string | null; nykaa_l3?: string | null; price: number | null }): string | null {
  if (!r.price) return "no price";
  if (NOT_STANDARD_L3.has(r.l3 ?? r.nykaa_l3 ?? "")) return "combo or gift set";
  if (NOT_STANDARD.test(r.name)) return "combo, kit or mini";
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

/** Category benchmark for one product comparison: median MRP per 100 ml/g of today's top-100 products in the category,
 *  full sizes only and packs between half and double the category's usual size, so sizes are like for like. */
export function categoryBenchmark(shelf: ShelfRow[], cat: string, std: number | null) {
  const seen = new Set<string>(); const per: number[] = [];
  for (const r of shelf) {
    if (r.subcategory !== cat || seen.has(r.product_id) || exclusion(r)) continue;
    const ml = packMl(r.pack_size) ?? packMl(r.name); const p = r.mrp ?? r.price;
    if (!ml || !p || ml < MINI_ML || (std && (ml < std / 2 || ml > std * 2))) continue;
    seen.add(r.product_id); per.push((p / ml) * 100);
  }
  if (per.length < 3) return null;
  return { median: med(per)!, min: Math.min(...per), max: Math.max(...per), n: per.length, std };
}
