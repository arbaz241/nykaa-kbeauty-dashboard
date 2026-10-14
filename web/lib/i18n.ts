"use client";

import { useSyncExternalStore } from "react";

/** Korean / English (owner request 14 Oct 2026). The Korean wording sits next to the English at every call site,
 *  `tr("Share of shelf", "진열 점유율")`, so the two never drift apart and a missing translation is visible in the code.
 *  Brand names, product names and English-only terms (SPF, BHA, PA++++, Nykaa, Hot Pink sale) stay in English;
 *  text the owner types (events, data notes) is shown as typed.
 *
 *  The language is one module-level value: AuthGate re-mounts the page under a `key` when it changes, so module
 *  constants read through `tr` (glossary, labels) and memoised findings are rebuilt in the new language. */

export type Lang = "en" | "ko";
const KEY = "nmi.lang";

let current: Lang = "en";
const listeners = new Set<() => void>();

export const lang = () => current;
export const isKo = () => current === "ko";

/** The wording for the current language (text or JSX). */
export function tr<T>(en: T, ko: T): T { return current === "ko" ? ko : en; }

export function setLang(l: Lang) {
  if (l === current) return;
  current = l;
  try { window.localStorage.setItem(KEY, l); } catch { /* storage unavailable */ }
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}

/** Read the saved choice once the page is in the browser (the static HTML is always English). */
export function loadLang() {
  let saved: string | null = null;
  try { saved = window.localStorage.getItem(KEY); } catch { /* storage unavailable */ }
  if (saved === "ko" || saved === "en") setLang(saved);
}

const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export const useLang = () => useSyncExternalStore(subscribe, () => current, () => "en" as Lang);

/** A record of labels whose values follow the language: `labels({ a: ["Toner", "토너"] }).a`. */
export function labels<K extends string>(o: Record<K, readonly [string, string]>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of Object.keys(o) as K[]) Object.defineProperty(out, k, { get: () => tr(o[k][0], o[k][1]), enumerable: true });
  return out;
}

/* ---- dates ---- */

const D = (iso: string | Date) => (typeof iso === "string" ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso) : iso);
/** "12 Oct" / "10월 12일" */
export const dayMonth = (d: string | Date) => { const x = D(d); return isKo() ? `${x.getMonth() + 1}월 ${x.getDate()}일` : x.toLocaleDateString("en-IN", { day: "numeric", month: "short" }); };
/** "12 Oct 2026" / "2026년 10월 12일" */
export const dayMonthYear = (d: string | Date) => { const x = D(d); return isKo() ? `${x.getFullYear()}년 ${x.getMonth() + 1}월 ${x.getDate()}일` : x.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); };
/** "Oct" / "10월" */
export const monthShort = (d: string | Date) => { const x = D(d); return isKo() ? `${x.getMonth() + 1}월` : x.toLocaleDateString("en-IN", { month: "short" }); };
/** "Oct 2026" / "2026년 10월" */
export const monthYear = (d: string | Date) => { const x = D(d); return isKo() ? `${x.getFullYear()}년 ${x.getMonth() + 1}월` : x.toLocaleDateString("en-IN", { month: "short", year: "numeric" }); };
/** "Oct 26" / "26년 10월" (chart axes) */
export const monthYY = (d: string | Date) => { const x = D(d); return isKo() ? `${String(x.getFullYear()).slice(2)}년 ${x.getMonth() + 1}월` : x.toLocaleDateString("en-IN", { month: "short", year: "2-digit" }); };

/* ---- Korean particles after English names ---- */

/** Does the Korean reading of a (mostly English) word end in a consonant (받침)? Hangul is exact; Latin and digits
 *  follow how Korean speakers read them ("Shop" 샵, "Joseon" 조선 → yes; "Innisfree" 이니스프리, "Anua" → no). */
function batchim(word: string): boolean {
  const w = word.trim().replace(/[)\]'"’.!?\s]+$/, "");
  const ch = w.at(-1) ?? "";
  const code = ch.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/[0-9]/.test(ch)) return "013678".includes(ch);
  const low = w.toLowerCase();
  if (/(m|n|ng|l)$/.test(low)) return true;
  if (/[aeiou](p|b|k|ck)$/.test(low) && !/(ee|oo|ea|ai)(p|k)$/.test(low)) return true; // shop, lab, pack
  return false;
}
/** Attach the right particle: josa("Innisfree", "은/는") → "Innisfree는"; josa("Beauty of Joseon", "이/가") → "…Joseon이". */
export function josa(word: string, pair: "은/는" | "이/가" | "을/를" | "과/와" | "으로/로" | "이다/다") {
  const [withB, without] = pair.split("/");
  if (pair === "으로/로") { const ch = word.trim().at(-1)?.toLowerCase() ?? ""; return word + (batchim(word) && ch !== "l" ? withB : without); }
  return word + (batchim(word) ? withB : without);
}
