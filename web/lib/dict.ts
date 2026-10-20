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
/** Korean for the data notes written into the database in English (migration 019, owner-confirmed wording). */
const NOTES: Record<string, string> = {
  "Probable sale period (unconfirmed)": "세일 추정 기간 (미확인)",
  "Reviews across every tracked product peak in the weeks of 4–18 May (3,526 in the week of 11 May). No confirmed Nykaa sale found for these dates; log it in Events if you know what it was.":
    "5월 4–18일 주간 추적 제품 전체 리뷰 급증 (5월 11일 주간 3,526건). 해당 기간 Nykaa 세일 확인 안 됨, 알고 있으면 이벤트에 기록.",
  "Nykaa Hot Pink sale": "Nykaa Hot Pink 세일",
  "Reviews across every tracked product peak in the weeks of 13–27 July (5,129 in the week of 20 July vs about 2,000 normally). Dates from third-party sale calendars.":
    "7월 13–27일 주간 추적 제품 전체 리뷰 급증 (7월 20일 주간 5,129건, 평소 약 2,000건). 날짜는 외부 세일 캘린더 기준.",
  "Mamonde launches on Nykaa (exclusive)": "Mamonde, Nykaa 단독 입점",
  "Review history: Nykaa serves about 1,000 reviews per product": "리뷰 이력: Nykaa는 제품당 최근 리뷰 약 2,000건만 제공",
  "Demand growth uses today's products": "수요 성장률은 현재 랭킹 제품 기준",
  "Hot Pink Sale (estimated dates)": "Hot Pink 세일 (추정 일정)",
  "Mid-year sale. Deal sites give 10-19 July or 17-31 July; review counts peak 13-27 July.": "연중 세일. 할인 정보 사이트 기준 7월 10–19일 또는 17–31일, 리뷰 수는 7월 13–27일 최고.",
  "Probable May sale (unconfirmed)": "5월 세일 추정 (미확인)",
  "Review counts peak in May across the market; the sale itself is not confirmed.": "5월 시장 전체 리뷰 수 최고. 세일 자체는 미확인.",
  "Pink Love Sale (estimated dates)": "Pink Love 세일 (추정 일정)",
  "Valentine's sale. Dates from deal-site calendars, not confirmed by Nykaa.": "밸런타인 세일. 할인 정보 사이트 캘린더 기준, Nykaa 미확인.",
};
const builtin = (s: string) => {
  if (NOTES[s]) return NOTES[s];
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
