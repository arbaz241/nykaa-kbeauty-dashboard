"use client";

import useSWR from "swr";
import { db, fetchAll } from "./supabase";
import { staticThenLive } from "./staticData";
import { aspectSummary } from "./metrics";
import { countsIn } from "./market";
import type { ReviewLite } from "./reviewThemes";
import type { BrandOffer, CategoryBrand, CategoryStat, ExternalNews, HomepageFeature, ShelfDay, ShelfProduct } from "./types";
import type { Availability, BrandShare, CategoryCoverage, Thumbnail, Movement, MarketEvent, ProductDemand, AssortmentRow, BrandDaily, CatalogRow, ProductHistory, ReviewAspect, ReviewMonth, ReviewText, SearchRow, ShareDaily, ShelfRow, Suggestion } from "./types";

const opts = { revalidateOnFocus: false, dedupingInterval: 10 * 60 * 1000 };

/** Tracked category shelves only (Nykaa's Korean Beauty store is a separate storefront, not a category).
 *  Plan v4: only products Nykaa files under the category count, ranked among themselves; Nykaa's own position is
 *  kept as nykaa_rank (lib/market countsIn). */
export function useShelf() {
  return useSWR("shelf", async () => ownCategory((await fetchAll<ShelfRow>("web_latest_shelf")).filter((r) => r.subcategory !== "kbeauty_store").map(numeric)), opts);
}
export function ownCategory(rows: ShelfRow[]): ShelfRow[] {
  const by = new Map<string, ShelfRow[]>();
  for (const r of rows) if (countsIn(r.subcategory, r.nykaa_l3)) { const g = by.get(r.subcategory) ?? []; g.push(r); by.set(r.subcategory, g); }
  return [...by.values()].flatMap((g) => g.sort((a, b) => a.rank - b.rank).map((r, i) => ({ ...r, rank: i + 1, nykaa_rank: r.rank })));
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


/** Nykaa files some products under a sibling category id that is not one of the tracked shelves (its "Cleanser"
 *  next to "Face Wash"); the catalogue then gave them no category and Compare called the brand "not in range".
 *  Their own Nykaa sub-category name (l3) places them. Combos and gift sets stay uncategorised on purpose. */
const L3_CATEGORY: Record<string, string> = {
  "Cleanser": "face_wash", "Micellar Water": "face_wash", "Cleansing Oils & Balm": "cleansing_balm", "Night Cream": "face_moisturizer",
  "Lip Balm": "lip_care", "Lip Masks": "lip_care", "Lip Scrubs": "lip_care", "Eye Masks": "eye_care",
};

export function useCatalog() {
  return useSWR("catalog", async () => (await fetchAll<CatalogRow>("web_brand_catalog")).map((r) => ({
    ...r, price: num(r.price), mrp: num(r.mrp), discount_pct: num(r.discount_pct), rating: num(r.rating),
    subcategories: r.subcategories?.length ? r.subcategories : r.l3 && L3_CATEGORY[r.l3] ? [L3_CATEGORY[r.l3]] : [],
  })), opts);
}

/** Last price seen on any shelf day, for products that are on neither today's shelf nor a tracked catalogue. */
export function useLastPrices(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useSWR(key.length ? ["last_prices", ...key] : null, async () => {
    const out = new Map<string, { price: number | null; mrp: number | null; scrape_date: string }>();
    await Promise.all(key.map(async (id) => {
      const { data, error } = await (await db()).from("web_product_history").select("scrape_date,price,mrp").eq("product_id", id).not("price", "is", null)
        .order("scrape_date", { ascending: false }).limit(1);
      if (error) throw new Error(error.message);
      if (data?.[0]) out.set(id, { price: num(data[0].price), mrp: num(data[0].mrp), scrape_date: data[0].scrape_date });
    }));
    return out;
  }, { revalidateOnFocus: false });
}
export function useShareDaily() { return useSWR("share_daily", () => fetchAll<ShareDaily>("web_share_daily"), opts); }
export function useBrandDaily() { return useSWR("brand_daily", () => fetchAll<BrandDaily>("web_brand_daily"), opts); }
export function useSearchHistory() { return useSWR("search_history", () => fetchAll<SearchRow>("web_search_history"), opts); }
export function useSuggestions() { return useSWR("suggestions", () => fetchAll<Suggestion>("web_suggestions_latest"), opts); }

/** One product's rank/price history, monthly reviews and recent review text, fetched on demand. */
export function useProduct(productId: string | null) {
  return useSWR(productId ? ["product", productId] : null, async () => {
    const sb = await db();
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
  return useSWR("events", () => staticThenLive("market_events", "events", async () => {
    const { data, error } = await (await db()).from("market_events").select("*").order("happened_on", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as MarketEvent[];
  }), opts);
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Recent review text, stars and Nykaa's tags for a handful of products (Competitive Analysis review themes). */
export function useReviewsFor(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useSWR(key.length ? ["reviews_for", ...key] : null, async () => {
    const out = new Map<string, ReviewLite[]>();
    await Promise.all(key.map(async (id) => {
      const { data, error } = await (await db()).from("web_review_texts").select("rating,title,body,aspects").eq("product_id", id)
        .order("created_on", { ascending: false }).limit(600);
      if (error) throw new Error(error.message);
      out.set(id, (data ?? []) as ReviewLite[]);
    }));
    return out;
  }, { revalidateOnFocus: false });
}

export interface Variant { sku?: string; pack_size: string | null; mrp: number | null; price: number | null; in_stock?: boolean }
/** Every size a product is sold in, from its product page (products with several sizes have no single pack size). */
export function useVariants(ids: string[]) {
  const key = [...new Set(ids)].sort();
  return useSWR(key.length ? ["variants", ...key] : null, async () => {
    const { data, error } = await (await db()).from("product_details").select("product_id,variants").in("product_id", key);
    if (error) throw new Error(error.message);
    return new Map((data ?? []).map((r) => [r.product_id as string, ((r.variants ?? []) as Variant[]).map((v) => ({ ...v, mrp: num(v.mrp), price: num(v.price) }))]));
  }, { revalidateOnFocus: false });
}

/** Names and links for products no longer on today's shelf (movers that dropped out of the top 100). */
export function useProductNames(ids: string[]) {
  return useSWR(ids.length ? ["product_names", ...ids] : null, async () => {
    const out = new Map<string, { name: string; brand: string; url: string | null }>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await (await db()).from("products").select("product_id,name,brand,url").in("product_id", ids.slice(i, i + 200));
      if (error) throw new Error(error.message);
      for (const r of data ?? []) out.set(r.product_id, { name: r.name, brand: r.brand, url: r.url });
    }
    return out;
  }, { revalidateOnFocus: false });
}

/** Shelf rows for two specific days (for movers), fetched on demand. */
export function useShelfDays(days: string[]) {
  return useSWR(days.length === 2 ? ["shelf_days", ...days] : null, async () => {
    const out: (ProductHistory & { name: string; brand: string })[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await (await db()).from("web_product_history").select("*").in("scrape_date", days).neq("subcategory", "kbeauty_store")
        .order("scrape_date").order("subcategory").order("rank").order("product_id").range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...((data ?? []) as (ProductHistory & { name: string; brand: string })[]));
      if (!data || data.length < 1000) break;
    }
    return out;
  }, { revalidateOnFocus: false });
}

/* ---- Round 4: the period picker's daily shelf, brand counts, homepage and offers (migration 025) ---- */
export function useShelfDaily() {
  return useSWR("shelf_daily", async () => (await fetchAll<ShelfDay>("web_shelf_daily")).map((r) => ({
    ...r, price: num(r.price), mrp: num(r.mrp), rating_count: num(r.rating_count), rank: Number(r.rank),
  })) as ShelfDay[], opts);
}
export function useShelfProducts() { return useSWR("shelf_products", () => fetchAll<ShelfProduct>("web_shelf_products"), opts); }
export function useCategoryStats() {
  return useSWR("category_stats", async () => (await fetchAll<CategoryStat>("web_category_stats")).map((r) => ({ ...r, brands: Number(r.brands), products: Number(r.products) })), opts);
}
export function useCategoryBrands() {
  return useSWR("category_brands", async () => (await fetchAll<CategoryBrand>("web_category_brands")).map((r) => ({ ...r, products: Number(r.products) })), opts);
}
export function useHomepage() { return useSWR("homepage", () => fetchAll<HomepageFeature>("web_homepage_features"), opts); }
export function useBrandOffers() { return useSWR("brand_offers", () => fetchAll<BrandOffer>("web_brand_offers"), opts); }
/** Outside headlines about the main brands and the day's movers (scraper/news.py, nightly since 18 Oct). */
export function useExternalNews() { return useSWR("external_news", () => fetchAll<ExternalNews>("web_external_news"), opts); }

/** Every day a product was pinned by Nykaa to the top of a list (about 2,600 rows in 120 days). The daily shelf view has
 *  no pin flag, so moves read a pin starting or ending as a climb or fall with no cause (audit 19 Oct: the Brief's
 *  "biggest climb" was a pinned product). A nightly copy of its own (migration 031), so it comes in the page's one
 *  data request. */
export function usePinned() {
  return useSWR("pinned", () => fetchAll<{ scrape_date: string; subcategory: string; product_id: string }>("web_pinned_days"), opts);
}
