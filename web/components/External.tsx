"use client";

import { useMemo } from "react";
import { norm } from "@/lib/brands";
import { useExternalNews } from "@/lib/data";
import { dayMonth, tr } from "@/lib/i18n";
import type { ExternalNews } from "@/lib/types";

/** Headlines from outside Nykaa (plan v4, owner 18 Oct 2026: "refresh automatically daily and show that it is
 *  external info, highlighted"). Read nightly from Google News' search feed for the main brands and the day's movers;
 *  context next to a move, never a proven cause. */
/** Only headlines about the brand in India can bear on its place on Nykaa (owner, 18 Oct 2026: "if you cannot find
 *  something related, don't put anything"): a UK sale, a US launch or a Korean M&A story is left out. */
export const INDIA = /\b(india|indian|nykaa|mumbai|delhi|bengaluru|bangalore|hyderabad|chennai|kolkata|pune)\b/i;
export const isRelevant = (n: ExternalNews) => INDIA.test(n.title);   // the headline itself, not the paper (a Times of India story can be about the US)

export function useNewsFor(brand: string | null, window?: { from: string; to: string }) {
  const news = useExternalNews();
  return useMemo(() => {
    if (!brand) return [] as ExternalNews[];
    // default window: the 30 days before the latest night the feed was read (no clock read while rendering)
    const last = (news.data ?? []).reduce((a, n) => (n.first_seen > a ? n.first_seen : a), "");
    const from = window?.from ?? (last ? new Date(+new Date(last) - 30 * 864e5).toISOString().slice(0, 10) : "");
    const to = window?.to ?? "9999";
    return (news.data ?? []).filter((n) => { const d = (n.published_at ?? n.first_seen).slice(0, 10); return norm(n.brand) === norm(brand) && d >= from && d <= to && isRelevant(n); })
      .sort((a, b) => (b.published_at ?? b.first_seen).localeCompare(a.published_at ?? a.first_seen));
  }, [news.data, brand, window?.from, window?.to]);
}

export function ExternalTag() {
  return <span className="mr-1.5 inline-flex shrink-0 items-center rounded-full bg-warn-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.06em] text-warn ring-1 ring-warn/30">{tr("External", "외부")}</span>;
}

/** A short list of a brand's outside headlines about India; nothing when there are none. */
export default function ExternalNewsList({ brand, max = 3, compact = false, window }: { brand: string; max?: number; compact?: boolean; window?: { from: string; to: string } }) {
  const items = useNewsFor(brand, window).slice(0, max);
  if (!items.length) return null;
  return (
    <ul className={`${compact ? "mt-1 space-y-1" : "mt-2 space-y-1.5"} text-[12.5px]`}>
      {items.map((n) => (
        <li key={n.url} className="flex items-start rounded-lg bg-warn-soft/40 px-2 py-1 ring-1 ring-warn/20">
          <ExternalTag />
          <span className="min-w-0">
            <a href={n.url} target="_blank" rel="noreferrer" className="text-ink underline decoration-warn/40 underline-offset-2 hover:decoration-ink">{n.title}</a>
            <span className="text-muted"> · {n.source ?? tr("news", "뉴스")}{n.published_at ? `, ${dayMonth(n.published_at.slice(0, 10))}` : ""}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
