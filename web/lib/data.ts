"use client";

import useSWR from "swr";
import { fetchAll, supabase } from "./supabase";
import { aspectSummary } from "./metrics";
import type { Availability, BrandShare, CategoryCoverage, Thumbnail, Movement, MarketEvent, ProductDemand, AssortmentRow, BrandDaily, CatalogRow, ProductHistory, ReviewAspect, ReviewMonth, ReviewText, SearchRow, ShareDaily, ShelfRow, Suggestion } from "./types";

const opts = { revalidateOnFocus: false, dedupingInterval: 10 * 60 * 1000 };

/** Tracked category shelves only (Nykaa's Korean Beauty store is a separate storefront, not a category). */
export function useShelf() {
  return useSWR("shelf", async () => (await fetchAll<ShelfRow>("web_latest_shelf")).filter((r) => r.subcategory !== "kbeauty_store").map(numeric), opts);
}
export function useKoreanStore() {
  return useSWR("kstore", async () => (await fetchAll<ShelfRow>("web_latest_shelf")).filter((r) => r.subcategory === "kbeauty_store").map(numeric), opts);
}
export function useReviewMonths() {
  return useSWR("review_months", () => fetchAll<ReviewMonth>("web_review_months"), opts);
}
export function useSearch() {
  return useSWR("search", () => fetchAll<SearchRow>("web_latest_search"), opts);
}
export function useAssortment() {
  return useSWR("assortment", () => fetchAll<AssortmentRow>("web_latest_assortment"), opts);
}

// Postgres numerics arrive as strings through PostgREST; normalise the ones we do maths on.
function numeric(r: ShelfRow): ShelfRow {
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return { ...r, mrp: n(r.mrp), price: n(r.price), discount_pct: n(r.discount_pct), rating: n(r.rating) };
}


export function useCatalog() {
  return useSWR("catalog", async () => (await fetchAll<CatalogRow>("web_brand_catalog")).map((r) => ({ ...r, price: num(r.price), mrp: num(r.mrp), discount_pct: num(r.discount_pct), rating: num(r.rating) })), opts);
}
export function useShareDaily() { return useSWR("share_daily", () => fetchAll<ShareDaily>("web_share_daily"), opts); }
export function useBrandDaily() { return useSWR("brand_daily", () => fetchAll<BrandDaily>("web_brand_daily"), opts); }
export function useSearchHistory() { return useSWR("search_history", () => fetchAll<SearchRow>("web_search_history"), opts); }
export function useSuggestions() { return useSWR("suggestions", () => fetchAll<Suggestion>("web_suggestions_latest"), opts); }

/** One product's rank/price history, monthly reviews and recent review text, fetched on demand. */
export function useProduct(productId: string | null) {
  return useSWR(productId ? ["product", productId] : null, async () => {
    const sb = supabase();
    const [hist, months, texts, aspects] = await Promise.all([
      sb.from("web_product_history").select("*").eq("product_id", productId!).order("scrape_date"),
      sb.from("web_review_months").select("*").eq("product_id", productId!).order("month"),
      sb.from("web_review_texts").select("*").eq("product_id", productId!).order("created_on", { ascending: false }).limit(12),
      // aspect tags only: a wider sample, so "what reviewers single out" is not read off six reviews
      sb.from("web_review_texts").select("aspects,rating").eq("product_id", productId!).not("aspects", "is", null).order("created_on", { ascending: false }).limit(600),
    ]);
    for (const r of [hist, months, texts, aspects]) if (r.error) throw new Error(r.error.message);
    return {
      history: (hist.data ?? []).map((h) => ({ ...h, price: num(h.price), rating: num(h.rating) })) as ProductHistory[],
      months: (months.data ?? []) as ReviewMonth[],
      texts: (texts.data ?? []) as ReviewText[],
      aspects: aspectSummary((aspects.data ?? []) as { aspects: ReviewAspect[] | null }[]),
    };
  }, opts);
}

/* ---- analysis layer ---- */
export function useMovement() {
  return useSWR("movement", async () => (await fetchAll<Movement>("web_movement")).map((r) => ({
    ...r, price: num(r.price), mrp: num(r.mrp), price_14d: num(r.price_14d), mrp_14d: num(r.mrp_14d),
    discount_pct: num(r.discount_pct), price_change_14d: num(r.price_change_14d), discount_change_14d: num(r.discount_change_14d),
  })) as Movement[], opts);
}
export function useBrandShares() {
  return useSWR("brand_shares", async () => (await fetchAll<BrandShare>("web_brand_shares")).map((r) => ({
    ...r, share_of_shelf: num(r.share_of_shelf), share_of_voice: num(r.share_of_voice), paid_dependency: num(r.paid_dependency),
  })) as BrandShare[], opts);
}
export function useDemand() {
  return useSWR("demand_products", async () => (await fetchAll<ProductDemand>("web_product_demand")).map((r) => ({
    ...r, momentum: num(r.momentum), reviews_per_month: num(r.reviews_per_month),
  })) as ProductDemand[], opts);
}
export function useAvailability() {
  return useSWR("availability", () => fetchAll<Availability>("web_availability"), opts);
}
export function useCategoryCoverage() {
  return useSWR("cat_coverage", () => fetchAll<CategoryCoverage>("web_category_coverage"), opts);
}
export function useThumbnails() {
  return useSWR("thumbnails", async () => (await fetchAll<Thumbnail>("web_thumbnails")).map((r) => ({
    ...r, bg_lightness: num(r.bg_lightness), colorfulness: num(r.colorfulness), edge_density: num(r.edge_density),
  })) as Thumbnail[], opts);
}
export function useEvents() {
  return useSWR("events", async () => {
    const { data, error } = await supabase().from("market_events").select("*").order("happened_on", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as MarketEvent[];
  }, opts);
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Shelf rows for two specific days (for movers), fetched on demand. */
export function useShelfDays(days: string[]) {
  return useSWR(days.length === 2 ? ["shelf_days", ...days] : null, async () => {
    const out: (ProductHistory & { name: string; brand: string })[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase().from("web_product_history").select("*").in("scrape_date", days).neq("subcategory", "kbeauty_store").range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as (ProductHistory & { name: string; brand: string })[]));
      if (!data || data.length < 1000) break;
    }
    return out;
  }, { revalidateOnFocus: false });
}
