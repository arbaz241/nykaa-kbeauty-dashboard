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

export interface ReviewMonth { product_id: string; month: string; reviews: number; avg_rating: number | null; brand: string; coverage_start: string }

export interface SearchRow { query: string; rank: number; sample: number; product_id: string; brand: string; name: string; price: number | null; is_ad: boolean; total_found: number | null; scrape_date: string; origin: Origin }

export interface AssortmentRow { brand: string; total_products: number | null; scrape_date: string }
