"use client";

import useSWR from "swr";
import { fetchAll } from "./supabase";
import { hasStatic, openSite, staticThenLive } from "./staticData";
import { isKo, useLang } from "./i18n";

/** Korean for text that comes from the data rather than the code: Nykaa's own product-page wording (claims,
 *  skin types, concerns, review tags) and the AI reads (USP, comparisons, image reads). Translated once by
 *  scraper/translate.py into the `ko_dictionary` table, keyed by the exact English string, and topped up after each
 *  nightly run. The data itself stays English, so every rule that matches on it keeps working; only display
 *  goes through `tx`. Customer reviews are shown as written (they are quotations). */

let dict: Map<string, string> | null = null;
/** Same strings by lower case: the site capitalises some short phrases (skin types, concerns) before showing them. */
let lower: Map<string, string> | null = null;

/** The Korean for a data string, or the string itself when there is none (or the site is in English). */
export function tx<T extends string | null | undefined>(s: T): T {
  if (!s || !dict || !isKo()) return s;
  return (dict.get(s) ?? dict.get(s.trim()) ?? lower?.get(s.trim().toLowerCase()) ?? s) as T;
}
/** `tx` over a list. */
export const txs = (xs: string[] | null | undefined) => (xs ?? []).map((x) => tx(x));

/** Loads the dictionary while the site is in Korean. AuthGate waits for it so a page never opens half-translated. */
export function useDictionary(): boolean {
  const ko = useLang() === "ko";
  // with the nightly files and no dictionary among them (not translated yet), there is nothing to wait for
  const none = openSite && !hasStatic("ko_dictionary");
  const { data, error } = useSWR(ko && !none ? "ko_dictionary" : null, async () => {
    const rows = await staticThenLive("ko_dictionary", "ko_dictionary_rows", () => fetchAll<{ en: string; ko: string }>("ko_dictionary"));
    dict = new Map(rows.map((r) => [r.en, r.ko]));
    lower = new Map(rows.map((r) => [r.en.trim().toLowerCase(), r.ko]));
    return true;
  }, { revalidateOnFocus: false, dedupingInterval: 60 * 60 * 1000 });
  // without the table (not yet translated, or offline) the page still opens: data text stays in English
  return !ko || none || !!data || !!error;
}
