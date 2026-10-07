"use client";

import useSWR from "swr";
import { fetchAll } from "./supabase";

/** scraper/usp.py stage A: what one product sells itself on, read from its gallery, page and reviews. */
export type Verdict = "echoed" | "rarely_mentioned" | "contradicted" | "insufficient_reviews";
export interface UspAnalysis {
  main_usp: { statement: string; brand_words: string; why_this_is_the_usp: string; evidence_images: number[]; confidence: "high" | "medium" | "low"; runner_up: string };
  key_benefits: { benefit: string; emphasis: number; proof_type: string; proof_detail: string; evidence_images: number[] }[];
  hero_ingredients: { ingredient: string; claimed_role: string }[];
  target_consumer: { summary: string; attributes: { dimension: string; value: string; basis: "stated" | "implied"; evidence: string }[] };
  trust_and_safety_claims: string[];
  emotional_and_brand_angle: string;
  proof_strength: { rating: "strong" | "moderate" | "weak"; reason: string };
  review_check: {
    reviews_considered: number; usp_verdict: Verdict; usp_explanation: string; usp_quotes: string[];
    benefit_verdicts: { benefit: string; verdict: Verdict; explanation: string; quotes: string[] }[];
    valued_but_not_advertised: { theme: string; how_often: string; quotes: string[] }[];
    recurring_complaints: { theme: string; how_often: string; quotes: string[] }[];
  };
  one_line_summary: string;
}
export interface UspProduct {
  product_id: string; brand: string; name: string; url: string | null; analysis: UspAnalysis;
  images: number | null; reviews_sampled: number | null; reviews_stored: number | null; analysed_at: string;
}

/** Stage B: one Innisfree product's message against its direct rivals. */
export interface UspComparisonBody {
  group_summary: string;
  table_stakes: { claim: string; products_making_it: string[] }[];
  products: { product: string; distinct_angle: string; credibility: "strong" | "moderate" | "weak"; credibility_reason: string; buyers_echo_it: string }[];
  anchor_position: {
    overlaps_with: { rival: string; shared_message: string }[];
    unique_to_anchor: string[];
    weaker_than_rivals: { rival: string; where: string }[];
    stronger_than_rivals: { rival: string; where: string }[];
    review_resonance_vs_rivals: string;
    verdict: string;
  };
  white_space: { opportunity: string; evidence: string }[];
}
export interface UspComparison {
  anchor_product_id: string; anchor_name: string; products: string[]; roles: Record<string, string>;
  comparison: UspComparisonBody; analysed_at: string; category: string | null;
}

const opts = { revalidateOnFocus: false, dedupingInterval: 10 * 60 * 1000 };
export function useUspProducts() {
  return useSWR("usp_products", () => fetchAll<UspProduct>("web_usp_products"), opts);
}
export function useUspComparisons() {
  return useSWR("usp_comparisons", () => fetchAll<UspComparison>("web_usp_comparisons"), opts);
}

export const ROLE_LABEL: Record<string, string> = {
  anchor: "Innisfree", korean_rival_1: "K-beauty rival", korean_rival_2: "K-beauty rival", korean_rival_3: "K-beauty rival",
  indian_leader: "Indian leader", global_rival: "Global rival",
};
export const VERDICT: Record<Verdict, { label: string; tone: string }> = {
  echoed: { label: "Buyers echo it", tone: "text-good" },
  rarely_mentioned: { label: "Buyers rarely mention it", tone: "text-muted" },
  contradicted: { label: "Buyers contradict it", tone: "text-bad" },
  insufficient_reviews: { label: "Too few reviews to judge", tone: "text-muted" },
};
