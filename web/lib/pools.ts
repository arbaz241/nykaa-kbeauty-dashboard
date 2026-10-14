import { norm } from "./brands";

/** Nykaa shows one set of ratings for every size of a product, and sometimes for a whole range: the Innisfree
 *  Volcanic clay mask 80g and its Mini both carry the same 25,672 ratings. A brand total must count that set once.
 *  Two listings share a set when the same brand shows the identical ratings count and star rating on the same day.
 *  Below 100 ratings identical counts happen by chance between unrelated products (checked 14 Oct 2026), so those
 *  stay separate; they barely move a brand total either way. Monthly review counts are pooled separately, by the
 *  review Nykaa serves first (pool_id in web_product_demand). */
export const POOL_MIN_RATINGS = 100;

export function ratingPool(r: { product_id: string; brand: string; rating?: number | null; rating_count?: number | null }) {
  const n = r.rating_count ?? 0;
  return n >= POOL_MIN_RATINGS ? `${norm(r.brand)}|${n}|${r.rating ?? ""}` : r.product_id;
}

/** One listing per shared set of ratings (the first seen, so callers pass rows best-ranked first when it matters). */
export function onePerRatingPool<T extends { product_id: string; brand: string; rating?: number | null; rating_count?: number | null }>(rows: T[]): T[] {
  const seen = new Map<string, T>();
  for (const r of rows) { const k = ratingPool(r); if (!seen.has(k)) seen.set(k, r); }
  return [...seen.values()];
}
