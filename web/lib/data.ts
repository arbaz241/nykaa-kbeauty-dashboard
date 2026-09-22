"use client";

import useSWR from "swr";
import { fetchAll } from "./supabase";
import type { AssortmentRow, ReviewMonth, SearchRow, ShelfRow } from "./types";

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
