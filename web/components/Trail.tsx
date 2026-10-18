"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { enterPage, parseTrail, subscribeTrail, trailText, type Trail as TrailT } from "@/lib/trail";
import { tr } from "@/lib/i18n";

/** The trail on brand and product pages: Back, then every step from the tab the reader started on (lib/trail).
 *  Returns the tab to keep highlighted. */
export function useTrail(label: string | null): TrailT | null {
  useEffect(() => { if (label) enterPage(label, { tab: "Top by category", href: "/categories/", label: tr("Market", "시장") }); }, [label]);
  const text = useSyncExternalStore(subscribeTrail, trailText, () => null);
  return useMemo(() => (label ? parseTrail(text) : null), [text, label]);
}

export default function TrailBar({ trail }: { trail: TrailT | null }) {
  const router = useRouter();
  if (!trail || trail.crumbs.length < 2) return <div className="h-7" />;
  const prev = trail.crumbs[trail.crumbs.length - 2];
  return (
    <nav aria-label={tr("You came from", "이동 경로")} className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px]">
      <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.push(prev.href))}
        className="mr-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium text-accent-strong ring-1 ring-line hover:bg-sunken">
        <span aria-hidden>←</span>{tr("Back", "뒤로")}
      </button>
      {trail.crumbs.map((c, i) => {
        const last = i === trail.crumbs.length - 1;
        return (
          <span key={c.href + i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-muted">›</span>}
            {last ? <span aria-current="page" className="max-w-[320px] truncate font-semibold text-ink">{c.label}</span>
              : <Link href={c.href} className="max-w-[260px] truncate text-ink-2 underline decoration-line-2 underline-offset-2 hover:text-ink hover:decoration-ink">{c.label}</Link>}
          </span>
        );
      })}
    </nav>
  );
}
