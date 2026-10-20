"use client";

import useSWR from "swr";
import { fetchAll } from "./supabase";
import { isKo, useLang } from "./i18n";

/** Korean for text that comes from the data rather than the code: Nykaa's own product-page wording (claims,
 *  skin types, concerns, review tags) and the AI reads (USP, comparisons, image reads). Translated once by
 *  scraper/translate.py into the `ko_dictionary` table, keyed by the exact English string, and topped up after each
 *  nightly run. The data itself stays English, so every rule that matches on it keeps working; only display
 *  goes through `tx`. Customer reviews are shown as written (they are quotations). */

let dict: Map<string, string> | null = null;
/** Same strings by lower case: the site capitalises some short phrases (skin types, concerns) before showing them. */
let lower: Map<string, string> | null = null;

/** Built-in Korean for short, closed-vocabulary data words (countries, skin types, common concerns), so they read in
 *  Korean even before the AI-translated dictionary exists (migration 024 waits for the owner; audit 21 Oct 2026:
 *  "South Korea 생산"). Longer data text still waits for the dictionary. */
const BUILTIN: Record<string, string> = {
  "south korea": "한국", korea: "한국", "republic of korea": "한국", india: "인도", usa: "미국", "united states": "미국", "united states of america": "미국",
  france: "프랑스", japan: "일본", china: "중국", canada: "캐나다", germany: "독일", italy: "이탈리아", uk: "영국", "united kingdom": "영국",
  australia: "호주", switzerland: "스위스", spain: "스페인", thailand: "태국", taiwan: "대만", poland: "폴란드", "sri lanka": "스리랑카",
  all: "모든 피부", dry: "건성", oily: "지성", normal: "중성", combination: "복합성", sensitive: "민감성", "acne-prone": "트러블성",
  hydration: "보습", dehydration: "수분 부족", dryness: "건조함", dullness: "칙칙함", acne: "여드름", pigmentation: "색소 침착", "dark spots": "잡티",
  "uneven tone": "피부톤 불균일", "uneven skin tone": "피부톤 불균일", redness: "홍조", "visible pores": "모공", pores: "모공", "fine lines": "잔주름",
  wrinkles: "주름", "fine lines & wrinkles": "잔주름·주름", tan: "태닝", "oil control": "피지 조절", "sun protection": "자외선 차단", "dark circles": "다크서클", puffiness: "붓기",
};
const builtin = (s: string) => {
  const parts = s.split(/\s*\/\s*/);
  const ko = parts.map((p) => BUILTIN[p.trim().toLowerCase()]);
  return ko.every(Boolean) ? ko.join(" / ") : null;
};

/** The Korean for a data string, or the string itself when there is none (or the site is in English). */
export function tx<T extends string | null | undefined>(s: T): T {
  if (!s || !isKo()) return s;
  return (dict?.get(s) ?? dict?.get(s.trim()) ?? lower?.get(s.trim().toLowerCase()) ?? builtin(s) ?? s) as T;
}
/** `tx` over a list. */
export const txs = (xs: string[] | null | undefined) => (xs ?? []).map((x) => tx(x));

/** Loads the dictionary while the site is in Korean. AuthGate waits for it so a page never opens half-translated. */
export function useDictionary(): boolean {
  const ko = useLang() === "ko";
  const { data, error } = useSWR(ko ? "ko_dictionary" : null, async () => {
    const rows = await fetchAll<{ en: string; ko: string }>("ko_dictionary");
    dict = new Map(rows.map((r) => [r.en, r.ko]));
    lower = new Map(rows.map((r) => [r.en.trim().toLowerCase(), r.ko]));
    return true;
  }, { revalidateOnFocus: false, dedupingInterval: 60 * 60 * 1000 });
  // without the table (not yet translated, or offline) the page still opens: data text stays in English
  return !ko || !!data || !!error;
}
