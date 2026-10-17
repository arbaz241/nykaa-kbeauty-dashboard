"use client";

import { useSyncExternalStore } from "react";
import { monthShort, monthYear, tr } from "./i18n";

/** The period picker (Round 4, owner 17 Oct 2026: "a month of data but it looks like one day"). One choice for the
 *  whole site, remembered in this browser, so every tab reads the same period.
 *
 *  Two clocks, because the data has two:
 *  - shelf clock: daily top-100 places, prices, offers and rating counts since 13 Sep 2026 → `days`
 *  - review clock: monthly reviews by the date they were written, back to 2024 → `months` and `compare`
 *  Defaults (owner): last 30 days on the shelf, last 12 months for demand, compared with a year earlier. */

export type ShelfSpan = 7 | 14 | 30 | 0;   // 0 = since tracking began
export type MonthSpan = 3 | 6 | 12;
export type Compare = "yoy" | "prev";
export interface Period { days: ShelfSpan; months: MonthSpan; compare: Compare }

const KEY = "nmi.period";
const DEFAULT: Period = { days: 30, months: 12, compare: "yoy" };
let current: Period = DEFAULT;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const p = JSON.parse(window.localStorage.getItem(KEY) ?? "null") as Partial<Period> | null;
    if (p) current = {
      days: ([7, 14, 30, 0] as number[]).includes(Number(p.days)) ? (Number(p.days) as ShelfSpan) : DEFAULT.days,
      months: ([3, 6, 12] as number[]).includes(Number(p.months)) ? (Number(p.months) as MonthSpan) : DEFAULT.months,
      compare: p.compare === "prev" ? "prev" : "yoy",
    };
  } catch { /* storage unavailable: defaults */ }
}

export function setPeriod(p: Partial<Period>) {
  current = { ...current, ...p };
  try { window.localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage unavailable */ }
  listeners.forEach((f) => f());
}

const subscribe = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export function usePeriod(): Period {
  return useSyncExternalStore(subscribe, () => { load(); return current; }, () => DEFAULT);
}

/* ------------------------------------------------------------------ shelf clock */

export interface ShelfWindow {
  /** Collected days inside the period, oldest first. */
  days: string[];
  start: string; end: string;
  /** The same number of collected days just before, when the data reaches that far back. */
  prev: { start: string; end: string; days: string[] } | null;
  label: string;
}

/** The collected days in the chosen span, ending on the latest day. Span 0 = every day since tracking began. */
export function shelfWindow(allDays: string[], span: ShelfSpan): ShelfWindow | null {
  const days = [...new Set(allDays)].sort();
  if (!days.length) return null;
  const end = days[days.length - 1];
  const from = span ? addDays(end, -span) : days[0];
  const inWin = days.filter((d) => d > from || (!span && d >= from));
  const win = inWin.length ? inWin : [end];
  const start = win[0];
  let prev: ShelfWindow["prev"] = null;
  if (span) {
    const pFrom = addDays(start, -span);
    const pDays = days.filter((d) => d >= pFrom && d <= start);
    // the earlier window must reach back the full span (a day or two of slack for a missed night)
    if (pDays.length && pDays[0] <= addDays(pFrom, 2)) prev = { start: pDays[0], end: start, days: pDays };
  }
  return { days: win, start, end, prev, label: spanLabel(span) };
}

export function spanLabel(span: ShelfSpan) {
  return span ? tr(`last ${span} days`, `최근 ${span}일`) : tr("since tracking began", "수집 시작 이후");
}

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/* ------------------------------------------------------------------ review clock */

export interface MonthWindow {
  /** First day of each month, oldest first. */
  recent: string[];
  base: string[];
  recentLabel: string; baseLabel: string;
  compare: Compare;
}

/** The last `span` complete months, and what they are compared with: the same months a year earlier (yoy) or the
 *  months just before (prev). `today` is the latest collection day. */
export function monthWindow(today: string, span: MonthSpan, compare: Compare): MonthWindow {
  const t = new Date(`${today}T00:00:00Z`);
  const month = (offset: number) => { const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + offset, 1)); return d.toISOString().slice(0, 10); };
  const recent = Array.from({ length: span }, (_, i) => month(i - span));
  const shift = compare === "yoy" ? -12 : -span;
  const base = recent.map((m) => { const d = new Date(`${m}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + shift); return d.toISOString().slice(0, 10); });
  return { recent, base, recentLabel: monthsLabel(recent), baseLabel: monthsLabel(base), compare };
}

export function monthsLabel(ms: string[]) {
  if (!ms.length) return "";
  const a = ms[0]; const b = ms[ms.length - 1];
  if (a === b) return monthYear(a);
  const sameYear = a.slice(0, 4) === b.slice(0, 4);
  return sameYear ? tr(`${monthShort(a)}–${monthShort(b)} ${a.slice(0, 4)}`, `${a.slice(0, 4)}년 ${monthShort(a)}–${monthShort(b)}`) : `${monthYear(a)} – ${monthYear(b)}`;
}

export const compareWord = (c: Compare) => (c === "yoy" ? tr("vs a year earlier", "전년 동기 대비") : tr("vs the period before", "직전 기간 대비"));
