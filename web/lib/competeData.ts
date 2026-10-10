/** Competitive Analysis data assembly: every product and brand fact the old USP and Compare tabs showed, in one
 *  shape per product and per brand (docs/restructure-v2-plan.md §2 inventory). Pure functions, no fetching. */

import { norm } from "./brands";
import { PER_SHEET, clause, packMl, packPieces, sheetCount, shortName } from "./format";
import type { Variant } from "./data";
import { reviewThemes, themeFor, type ReviewLite, type ReviewThemes } from "./reviewThemes";
import type { Lvl } from "@/components/Detail";
import { brandScore, type AspectStat, type BrandScore } from "./metrics";
import { basketPrice, categoryPrice, withAnchor, type BasketPrice } from "./price";
import type { AssortmentRow, CatalogRow, Movement, ProductDemand, ReviewMonth, ReviewPhrase, SearchRow, ShelfRow, Thumbnail } from "./types";
import type { UspComparison, UspProduct } from "./usp";

export const HERO_ORDER = ["toner", "face_moisturizer", "serum", "sunscreen", "face_wash", "masks", "eye_care", "lip_care"];
/** The USP analysis files lip balms as "lip_balm"; on the shelf they are the Lip care category. */
export const shelfCat = (c: string | null) => (c === "lip_balm" ? "lip_care" : c ?? "");
export const ROLE_LABEL: Record<string, string> = {
  anchor: "Innisfree", korean_rival_1: "K-beauty rival", korean_rival_2: "K-beauty rival", korean_rival_3: "K-beauty rival",
  indian_leader: "Indian leader", global_rival: "Global rival", rival: "Rival",
};

/** Product title without the brand and without the trailing claim list. */
export const shortTitle = (name: string, brand: string) => shortName(name, brand).split(/,| [-–|] | SPF | For /i)[0];

export interface ProductFacts {
  pid: string; brand: string; name: string; url: string | null; image: string | null; role: string;
  price: number | null; mrp: number | null; discount: number | null; offer: string | null; perHundred: number | null; pack: string | null; priceNote: string | null;
  rank: number | null; paid: boolean; rank7: number | null; rank14: number | null; gain7: number | null;
  rating: number | null; ratings: number | null; reviewsTotal: number | null; split: Record<string, number> | null;
  recent: number | null; momentum: number | null; spark: (number | null)[] | null; search: number;
  whatItIs: string | null; claims: string[]; concerns: string[]; ingredients: string[]; skinTypes: string[];
  formulation: string | null; madeIn: string | null; since: string | null; phrases: ReviewPhrase[];
  usp?: UspProduct; thumb?: Thumbnail; aspects?: AspectStat[];
  /** MRP per 100 ml/g at the size closest to the category's standard size (or the listed size) */
  /** the price every product is compared on: MRP per 100 ml/g, or per sheet for sheet masks */
  unit: number | null; unitNote: string | null;
  mrpPer100: number | null; perPiece: number | null; sizeUsed: { ml: number; mrp: number; how: "matched" | "listed" } | null; per100Why: string | null;
  sizes: { pack: string; ml: number | null; mrp: number | null; price: number | null }[];
  themes: ReviewThemes | null;
  proof: { level: Lvl | null; reasons: string[] }; echo: { level: Lvl | null; reasons: string[]; none: string };
  whoFor: { skin: string[]; concerns: string[]; age: string | null; use: string | null };
  promise: string | null;
  /** this product's line in the USP group read (angle, credibility, whether buyers echo it) */
  groupRead?: UspComparison["comparison"]["products"][number];
}

export type BrandFacts = BrandScore & { basket: BasketPrice; catPrice: { price: number; perHundred: number | null; n: number } | null };

/** Every product a brand sells in a category: today's top 100 first (by rank), then its wider catalogue by ratings. */
export function productOptions(brand: string, cat: string, rows: ShelfRow[], catalog: CatalogRow[]) {
  const on = rows.filter((r) => r.subcategory === cat && r.brand === brand).sort((a, b) => a.rank - b.rank)
    .map((r) => ({ product_id: r.product_id, name: r.name, brand, price: r.price, rank: r.rank as number | null }));
  const seen = new Set(on.map((r) => r.product_id));
  const more = catalog.filter((r) => r.brand === brand && r.subcategories.includes(cat) && !seen.has(r.product_id))
    .sort((a, b) => (b.rating_count ?? 0) - (a.rating_count ?? 0))
    .map((r) => ({ product_id: r.product_id, name: r.name, brand, price: r.price, rank: null as number | null }));
  return [...on, ...more];
}
export type ProductOption = ReturnType<typeof productOptions>[number];

/** Product id -> number of tracked searches where it is in the top 10 unpaid results (one sample per query). */
export function searchCounts(rows: SearchRow[]) {
  const byQ = new Map<string, SearchRow[]>(); rows.forEach((r) => byQ.set(r.query, [...(byQ.get(r.query) ?? []), r]));
  const out = new Map<string, number>();
  for (const rs of byQ.values()) {
    const minS = Math.min(...rs.map((r) => r.sample));
    const top = rs.filter((r) => !r.is_ad && r.sample === minS).sort((a, b) => a.rank - b.rank).slice(0, 10);
    new Set(top.map((r) => r.product_id)).forEach((id) => out.set(id, (out.get(id) ?? 0) + 1));
  }
  return out;
}

/** Monthly reviews for one product over a fixed window, blank before its reliable coverage. */
export function productSpark(months: ReviewMonth[], win: string[]) {
  if (!months.length) return null;
  const start = months[0].coverage_start;
  const m = new Map(months.filter((r) => r.month >= r.coverage_start).map((r) => [r.month.slice(0, 10), r.reviews]));
  return win.map((mo) => (mo >= start ? m.get(mo) ?? 0 : null));
}

export interface Sources {
  cat: string; rows: ShelfRow[]; catalog: CatalogRow[]; demand: Map<string, ProductDemand>; movement: Movement[];
  months: Map<string, ReviewMonth[]>; win: string[]; search: Map<string, number>; thumbs: Map<string, Thumbnail>;
  usp: Map<string, UspProduct>; aspects?: Map<string, AspectStat[]>; reviews?: Map<string, ReviewLite[]>; variants?: Map<string, Variant[]>; stdMl: number | null; lastPrices?: Map<string, { price: number | null; mrp: number | null; scrape_date: string }>;
  hero: UspComparison | null;
}

export function productFacts(pid: string, brandHint: string, role: string, s: Sources): ProductFacts {
  const onCat = s.rows.filter((r) => r.product_id === pid && r.subcategory === s.cat).sort((a, b) => a.rank - b.rank)[0];
  const sh = onCat ?? s.rows.find((r) => r.product_id === pid);
  const c = s.catalog.find((r) => r.product_id === pid);
  const u = s.usp.get(pid); const lp = s.lastPrices?.get(pid);
  const name = sh?.name ?? c?.name ?? u?.name ?? pid;
  const price = sh?.price ?? c?.price ?? lp?.price ?? null; const mrp = sh?.mrp ?? c?.mrp ?? lp?.mrp ?? null;
  const pack = sh?.pack_size ?? c?.pack_size ?? null; const ml = packMl(pack) ?? packMl(name);
  const mv = s.movement.find((m) => m.product_id === pid && m.category === s.cat);
  const d = s.demand.get(pid);
  const lower = name.toLowerCase();
  const groupRead = s.hero?.comparison.products.find((x) => { const p = x.product.toLowerCase(); return p.includes(lower.slice(0, 24)) || lower.includes(p.slice(0, 24)); });
  return {
    pid, brand: brandHint || sh?.brand || c?.brand || u?.brand || "", name, url: sh?.url ?? c?.url ?? u?.url ?? null,
    image: sh?.image_url ?? c?.best_image ?? s.thumbs.get(pid)?.image_url ?? null, role,
    price, mrp, discount: sh?.discount_pct ?? c?.discount_pct ?? (price && mrp && mrp > price ? ((mrp - price) / mrp) * 100 : null),
    offer: (sh?.has_offer ? sh.offer_message ?? "Offer available" : null) ?? (c?.has_offer ? c.offer_message ?? "Offer available" : null),
    perHundred: ml && price ? (price / ml) * 100 : null, pack,
    priceNote: !sh && !c && lp ? `last seen ${new Date(lp.scrape_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : null,
    rank: onCat?.rank ?? null, paid: !!(onCat?.is_ad || onCat?.is_pinned), rank7: mv?.rank_7d ?? null, rank14: mv?.rank_14d ?? null, gain7: mv?.gain_7d ?? null,
    rating: sh?.rating ?? c?.rating ?? null, ratings: sh?.rating_count ?? c?.rating_count ?? null,
    reviewsTotal: sh?.detail_review_count ?? c?.detail_review_count ?? null, split: sh?.review_splitup ?? c?.review_splitup ?? null,
    recent: d?.recent ?? null, momentum: d?.momentum ?? null, spark: productSpark(s.months.get(pid) ?? [], s.win), search: s.search.get(pid) ?? 0,
    whatItIs: sh?.usp_summary ?? c?.usp_summary ?? null, claims: sh?.usp_points ?? c?.usp_points ?? [], concerns: sh?.concerns ?? c?.concerns ?? [],
    ingredients: sh?.key_ingredients ?? c?.key_ingredients ?? [], skinTypes: sh?.skin_types ?? c?.skin_types ?? [],
    formulation: sh?.formulation ?? c?.formulation ?? null, madeIn: sh?.country_name ?? c?.country_name ?? null, since: sh?.first_review_date ?? null,
    phrases: sh?.review_key_phrases ?? c?.review_key_phrases ?? [],
    usp: u, thumb: s.thumbs.get(pid), aspects: s.aspects?.get(pid), groupRead,
    ...unitPrice(sizing(pack, name, mrp ?? price, s.variants?.get(pid), s.stdMl), PER_SHEET.has(s.cat), pack, name, mrp ?? price),
    themes: s.reviews?.has(pid) ? reviewThemes(s.reviews.get(pid)!) : null,
    proof: proofLevel(u), echo: echoLevel(u, s.reviews?.get(pid)),
    whoFor: whoFor(u, sh?.skin_types ?? c?.skin_types ?? [], sh?.concerns ?? c?.concerns ?? []),
    promise: u ? clause(u.analysis.main_usp.brand_words || u.analysis.main_usp.statement, 12) : null,
  };
}

/* ---------------------------------------------------------------- price per 100 ml (or per sheet) on MRP */

function unitPrice<T extends { mrpPer100: number | null; sizeUsed: { ml: number; how: string } | null; per100Why: string | null }>(sz: T, perSheet: boolean, pack: string | null, name: string, mrp: number | null) {
  if (perSheet) {
    const c = sheetCount(pack, name);
    return { ...sz, unit: mrp ? mrp / c.n : null, unitNote: `${c.n} sheet${c.n === 1 ? "" : "s"}${c.est ? " (estimated from pack weight)" : ""}`, per100Why: mrp ? null : "MRP not shown" };
  }
  return { ...sz, unit: sz.mrpPer100, unitNote: sz.sizeUsed ? `at ${sz.sizeUsed.ml} ml/g${sz.sizeUsed.how === "matched" ? " (closest size)" : ""}` : null };
}

const MINI = 15;
/** The most common full-size pack in a category's top 100 (rounded to 5 ml/g): the size products are compared at. */
export function standardSize(rows: ShelfRow[], cat: string): number | null {
  const m = new Map<number, number>();
  rows.filter((r) => r.subcategory === cat).forEach((r) => { const ml = packMl(r.pack_size) ?? packMl(r.name); if (ml && ml >= MINI) { const k = Math.round(ml / 5) * 5; m.set(k, (m.get(k) ?? 0) + 1); } });
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
}

function sizing(pack: string | null, name: string, listedMrp: number | null, variants: Variant[] | undefined, std: number | null) {
  const sizes = (variants ?? []).filter((v) => v.pack_size).map((v) => ({ pack: v.pack_size!, ml: packMl(v.pack_size), mrp: v.mrp, price: v.price }))
    .filter((v, i, xs) => xs.findIndex((y) => y.pack === v.pack && y.mrp === v.mrp) === i).sort((a, b) => (a.ml ?? 0) - (b.ml ?? 0));
  const full = sizes.filter((v) => v.ml && v.ml >= MINI && v.mrp);
  let sizeUsed: { ml: number; mrp: number; how: "matched" | "listed" } | null = null;
  if (full.length > 1 && std) {
    const best = [...full].sort((a, b) => Math.abs(Math.log(a.ml! / std)) - Math.abs(Math.log(b.ml! / std)))[0];
    sizeUsed = { ml: best.ml!, mrp: best.mrp!, how: "matched" };
  } else {
    // one size: the listed pack, else the variant whose MRP is the listed MRP, else the size in the name
    const ml = packMl(pack) ?? full.find((v) => v.mrp === listedMrp)?.ml ?? (full.length === 1 ? full[0].ml : null) ?? packMl(name);
    const mrp = full.length === 1 && !packMl(pack) ? full[0].mrp : listedMrp;
    if (ml && mrp) sizeUsed = { ml, mrp, how: "listed" };
  }
  const pieces = packPieces(pack) ?? packPieces(name);
  const per100Why = sizeUsed ? null : pieces ? null : !listedMrp ? "MRP not shown" : "Pack size not listed on Nykaa";
  return {
    sizes: sizes.length ? sizes : pack ? [{ pack, ml: packMl(pack), mrp: listedMrp, price: null }] : [],
    sizeUsed, mrpPer100: sizeUsed ? (sizeUsed.mrp / sizeUsed.ml) * 100 : null,
    perPiece: !sizeUsed && pieces && listedMrp ? listedMrp / pieces : null, per100Why,
  };
}

/* ---------------------------------------------------------------- levels (one scale: strong / moderate / weak) */

const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);

function proofLevel(u: UspProduct | undefined): { level: Lvl | null; reasons: string[] } {
  if (!u) return { level: null, reasons: [] };
  const a = u.analysis;
  const types = new Map<string, number>(); a.key_benefits.forEach((b) => b.proof_type !== "none" && types.set(b.proof_type.replaceAll("_", " "), (types.get(b.proof_type.replaceAll("_", " ")) ?? 0) + 1));
  const unproven = a.key_benefits.filter((b) => b.proof_type === "none").length;
  return {
    level: a.proof_strength.rating,
    reasons: [
      ...sentences(a.proof_strength.reason).slice(0, 2),
      types.size ? `Proof offered: ${[...types.entries()].map(([k, n]) => `${k} (${n})`).join(", ")}` : "No proof offered for any benefit",
      ...(unproven ? [`${unproven} of ${a.key_benefits.length} claimed benefits have no proof at all`] : []),
    ].slice(0, 4),
  };
}

/** Share of the product's checked claims that buyers repeat: ≥60% strong, 30–59% moderate, <30% weak (owner-approved). */
function echoLevel(u: UspProduct | undefined, reviews: ReviewLite[] | undefined): { level: Lvl | null; reasons: string[]; none: string } {
  if (!u) return { level: null, reasons: [], none: "Not analysed" };
  const rc = u.analysis.review_check;
  const judged = rc.benefit_verdicts.filter((b) => b.verdict !== "insufficient_reviews");
  if (rc.reviews_considered < 30 || !judged.length) return { level: null, reasons: [], none: `Too few reviews (${rc.reviews_considered} read)` };
  const echoed = judged.filter((b) => b.verdict === "echoed"); const contra = judged.filter((b) => b.verdict === "contradicted");
  const share = echoed.length / judged.length;
  const top = [...u.analysis.key_benefits].sort((x, y) => y.emphasis - x.emphasis)[0];
  const th = top ? themeFor(top.benefit) : undefined;
  let mention: string | null = null;
  if (th && reviews?.length) {
    const t = reviewThemes(reviews).praise.find((x) => x.key === th.key);
    mention = `${Math.round((t?.share ?? 0) * 100)}% of ${reviews.length} stored reviews mention its lead benefit ("${clause(top.benefit, 6)}")`;
  }
  return {
    level: share >= 0.6 ? "strong" : share >= 0.3 ? "moderate" : "weak", none: "",
    reasons: [
      `Buyers repeat ${echoed.length} of ${judged.length} claims checked (${Math.round(share * 100)}%)`,
      ...(contra.length ? [`Contradicted: ${contra.map((b) => clause(b.benefit, 6)).join("; ")}`] : []),
      ...(judged.length > echoed.length + contra.length ? [`Rarely mentioned: ${judged.filter((b) => b.verdict === "rarely_mentioned").map((b) => clause(b.benefit, 6)).join("; ")}`] : []),
      ...(mention ? [mention] : []),
    ].slice(0, 4),
  };
}

const splitList = (v: string) => v.split(/,|;|\/| and | or /i).map((x) => x.trim().replace(/^(and|or)\s+/i, "")).filter((x) => x && x.split(/\s+/).length <= 4);
const dedupe = (xs: string[]) => { const seen = new Set<string>(); return xs.filter((x) => { const k = x.toLowerCase().replace(/ skin$/, ""); if (seen.has(k)) return false; seen.add(k); return true; }); };
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);

/** Who it is for: Nykaa's skin-type and concern fields merged with the USP read's target attributes, as short chips. */
function whoFor(u: UspProduct | undefined, skin: string[], concerns: string[]) {
  const attr = (d: string) => u?.analysis.target_consumer.attributes.filter((t) => t.dimension === d).map((t) => t.value) ?? [];
  const aiSkin = attr("skin_type").flatMap(splitList).filter((x) => /skin|dry|oily|normal|combination|sensitive|all|acne/i.test(x));
  return {
    skin: dedupe([...skin, ...(skin.length ? [] : aiSkin)].map(cap)).slice(0, 4),
    concerns: dedupe([...concerns, ...attr("concern").flatMap(splitList)].map(cap)).slice(0, 6),
    age: attr("age_or_life_stage")[0] ? clause(attr("age_or_life_stage")[0], 6) : null,
    use: attr("routine_role")[0] ? clause(attr("routine_role")[0], 7) : null,
  };
}

export function brandFacts(brands: string[], anchor: string, cat: string, rows: ShelfRow[], catalog: CatalogRow[], months: ReviewMonth[], search: SearchRow[], assort: AssortmentRow[]): BrandFacts[] {
  const prices = withAnchor(brands.map((b) => basketPrice(b, catalog, rows)), anchor);
  return brands.map((b, i) => ({
    ...brandScore(b, rows, months, search, assort), basket: prices[i], catPrice: prices[i].byCategory[cat] ?? categoryPrice(b, cat, catalog, rows),
  }));
}

/** Match a rival named in the AI read ("LANEIGE Lip Glowy Balm") to one of the products in view. */
export function matchRival<T extends { brand: string; name: string }>(label: string, products: T[]): T | undefined {
  const l = norm(label);
  return products.find((p) => l.includes(norm(shortTitle(p.name, p.brand)).slice(0, 14)) && l.includes(norm(p.brand)))
    ?? products.find((p) => norm(p.brand).length > 2 && l.startsWith(norm(p.brand)))
    ?? products.find((p) => l.includes(norm(p.brand)));
}
