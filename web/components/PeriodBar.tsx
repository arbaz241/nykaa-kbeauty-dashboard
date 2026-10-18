"use client";

import { tr } from "@/lib/i18n";
import { setPeriod, usePeriod, type ShelfSpan } from "@/lib/period";

/** How far back rank moves are read (owner 19 Oct 2026: the period picker isn't needed on every tab). Shown only
 *  next to sections that list moves; share of buying has its own fixed window (lib/useMarket). One choice for the
 *  site, remembered in this browser. */
export default function MovesWindow() {
  const p = usePeriod();
  const chip = (on: boolean) => `rounded-full px-2.5 py-0.5 text-[12px] transition ${on ? "bg-brand font-medium text-on-brand" : "text-ink-2 ring-1 ring-line hover:bg-sunken hover:text-ink"}`;
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={tr("Moves over", "변동 기간")}>
      <span className="mr-0.5 text-[11.5px] text-muted">{tr("Moves over", "변동 기간")}</span>
      {([7, 14, 30] as ShelfSpan[]).map((d) => (
        <button key={d} aria-pressed={p.days === d} onClick={() => setPeriod({ days: d })} className={chip(p.days === d)}>{tr(`${d} days`, `${d}일`)}</button>
      ))}
    </div>
  );
}
