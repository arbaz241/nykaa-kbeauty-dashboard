export type Origin = "kbeauty" | "local" | "global" | "unknown";

export interface ReviewPhrase { text: string; sentiment: "Positive" | "Negative" | string; rank: number | null }

export interface ShelfRow {
  scrape_date: string; subcategory: string; rank: number; product_id: string; name: string; brand: string;
  origin: Origin; k_marketing: boolean; mrp: number | null; price: number | null; discount_pct: number | null;
  rating: number | null; rating_count: number | null; in_stock: boolean | null; is_ad: boolean; is_pinned: boolean;
  has_offer: boolean; offer_message: string | null; url: string | null; first_review_date: string | null;
  review_count: number | null; pack_size: string | null; country_name: string | null; formulation: string | null;
  skin_types: string[] | null; concerns: string[] | null; key_ingredients: string[] | null; preferences: string[] | null;
  usp_summary: string | null; usp_points: string[] | null; review_key_phrases: ReviewPhrase[] | null;
  review_splitup: Record<string, number> | null; detail_review_count: number | null; image_url: string | null;
  description_text: string | null;
}

export interface ReviewMonth { product_id: string; month: string; reviews: number; avg_rating: number | null; brand: string; coverage_start: string; name: string; url: string | null }

export interface SearchRow { query: string; rank: number; sample: number; product_id: string; brand: string; name: string; price: number | null; is_ad: boolean; total_found: number | null; scrape_date: string; origin: Origin }

export interface AssortmentRow { brand: string; total_products: number | null; scrape_date: string }

export interface CatalogRow {
  scrape_date: string; brand: string; product_id: string; catalog_rank: number | null; name: string; subcategories: string[]; l3: string | null;
  price: number | null; mrp: number | null; discount_pct: number | null; rating: number | null; rating_count: number | null;
  in_stock: boolean | null; has_offer: boolean; offer_message: string | null; pack_size: string | null; url: string | null;
  country_name: string | null; formulation: string | null; skin_types: string[] | null; concerns: string[] | null; key_ingredients: string[] | null;
  usp_summary: string | null; usp_points: string[] | null; review_key_phrases: ReviewPhrase[] | null; review_splitup: Record<string, number> | null;
  detail_review_count: number | null; best_image: string | null;
}
export interface ShareDaily { scrape_date: string; subcategory: string; origin: Origin; slots: number; top20: number }
export interface BrandDaily { scrape_date: string; brand: string; origin: Origin; subcategory: string; slots: number; best_rank: number; top20: number }
export interface Suggestion { scrape_date: string; seed: string; position: number; suggestion: string; kind: string; product_id: string | null; url: string | null }
export interface ProductHistory { scrape_date: string; subcategory: string; product_id: string; rank: number; price: number | null; mrp: number | null; discount_pct: number | null; rating: number | null; rating_count: number | null; is_ad: boolean; is_pinned: boolean; has_offer: boolean }
export interface ReviewAspect { id: string; displayText: string; sentimentValue: string }
export interface ReviewText { review_id: number; product_id: string; created_on: string; rating: number | null; title: string | null; body: string | null; is_buyer: boolean | null; aspects: ReviewAspect[] | null; images: number | null; likes: number | null }

/* ---- analysis layer (migration 013) ---- */
export interface Movement {
  product_id: string; brand: string; origin: Origin; name: string; url: string | null; category: string;
  rank: number; price: number | null; mrp: number | null; is_ad: boolean; discount_pct: number | null;
  rank_7d: number | null; rank_14d: number | null; gain_7d: number | null; gain_14d: number | null;
  price_7d: number | null; price_14d: number | null; mrp_14d: number | null; same_pack: boolean | null;
  price_change_14d: number | null; pack_changed_14d: boolean; discount_change_14d: number | null; new_since_14d: boolean;
}
export interface BrandShare {
  scrape_date: string; brand: string; origin: Origin; slots: number; top20: number; best_rank: number | null;
  share_of_shelf: number | null; search_earned: number; search_paid: number;
  share_of_voice: number | null; paid_dependency: number | null;
}
export interface ProductDemand {
  product_id: string; brand: string; category: string | null; name: string; url: string | null;
  recent: number; prior: number; lifetime: number; first_month: string; last_month: string;
  months_listed: number; momentum: number | null; reviews_per_month: number | null; history_complete: boolean | null;
  /** Variants share one Nykaa review pool; analysis counts a pool once. */
  pool_id: string;
}
export interface Availability {
  brand: string; product_id: string; name: string; url: string | null; price: number | null;
  rating_count: number | null; subcategories: string[]; scrape_date: string;
}
export interface MarketEvent {
  id: number; happened_on: string; ends_on: string | null; label: string; kind: string;
  brand: string | null; note: string | null;
}
export interface CategoryCoverage { category: string; first_date: string; last_date: string; days_tracked: number }
export interface Thumbnail {
  product_id: string; brand: string; name: string; image_url: string;
  background: string | null; bg_lightness: number | null; colorfulness: number | null; edge_density: number | null;
  dominant_colors: { hex: string; share: number }[] | null;
  shot_type: string | null; model_present: boolean | null; text_density: string | null;
  on_image_claims: string[] | null; packaging_style: string | null; mood: string | null; summary: string | null;
}
