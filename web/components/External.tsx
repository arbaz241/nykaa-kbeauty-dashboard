"use client";

import { useMemo } from "react";
import { norm } from "@/lib/brands";
import { useExternalNews } from "@/lib/data";
import { dayMonth, tr } from "@/lib/i18n";
import type { ExternalNews } from "@/lib/types";

/** Headlines from outside Nykaa (plan v4, owner 18 Oct 2026: "refresh automatically daily and show that it is
 *  external info, highlighted"). Read nightly from Google News' search feed for the main brands and the day's movers;
 *  context next to a move, never a proven cause. */
export function useNewsFor(brand: string | null, sinceDays = 30) {
  const news = useExternalNews();
  return useMemo(() => {
    if (!brand) return [] as ExternalNews[];
    // the window ends on the latest night the feed was read (no clock read while rendering)
    const last = (news.data ?? []).reduce((a, n) => (n.first_seen > a ? n.first_seen : a), "");
    const cut = last ? new Date(+new Date(last) - sinceDays * 864e5).toISOString().slice(0, 10) : "";
    return (news.data ?? []).filter((n) => norm(n.brand) === norm(brand) && (n.published_at ?? n.first_seen).slice(0, 10) >= cut)
      .sort((a, b) => (b.published_at ?? b.first_seen).localeCompare(a.published_at ?? a.first_seen));
  }, [news.data, brand, sinceDays]);
}

export function ExternalTag() {
  return <span className="mr-1.5 inline-flex shrink-0 items-center rounded-full bg-warn-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-[0.06em] text-warn ring-1 ring-warn/30">{tr("External", "외부")}</span>;
}

/** A short list of a brand's outside headlines; nothing when there are none. */
export default function ExternalNewsList({ brand, max = 3, compact = false }: { brand: string; max?: number; compact?: boolean }) {
  const items = useNewsFor(brand).slice(0, max);
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
