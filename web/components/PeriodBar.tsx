"use client";

import { dayMonth, tr } from "@/lib/i18n";
import { setPeriod, usePeriod, type Compare, type MonthSpan, type MonthWindow, type ShelfSpan, type ShelfWindow } from "@/lib/period";

/** The period picker shown at the top of each tab (Round 4). One choice for the whole site: change it here and every
 *  tab follows. The shelf clock is daily (since 13 Sep 2026); the review clock is monthly. */
export default function PeriodBar({ show = "both", shelf, months }: { show?: "shelf" | "review" | "both"; shelf?: ShelfWindow | null; months?: MonthWindow | null }) {
  const p = usePeriod();
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-[12.5px] transition ${on ? "bg-brand font-medium text-on-brand" : "text-ink-2 hover:bg-sunken hover:text-ink"}`;
  return (
    <div className="flex flex-wrap items-start gap-3">
      {show !== "review" && (
        <div className="rounded-2xl bg-surface px-3 py-2 ring-1 ring-line">
          <div className="px-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{tr("Shelf, daily", "진열 · 일별")}</div>
          <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={tr("Shelf period", "진열 기간")}>
            {([7, 14, 30, 0] as ShelfSpan[]).map((d) => (
              <button key={d} aria-pressed={p.days === d} onClick={() => setPeriod({ days: d })} className={chip(p.days === d)}>
                {d ? tr(`${d} days`, `${d}일`) : tr("All", "전체")}
              </button>
            ))}
          </div>
          {shelf && <div className="mt-1 px-1 text-[11.5px] text-muted tabular">{dayMonth(shelf.start)} – {dayMonth(shelf.end)} · {tr(`${shelf.days.length} days collected`, `수집 ${shelf.days.length}일`)}</div>}
        </div>
      )}
      {show !== "shelf" && (
        <div className="rounded-2xl bg-surface px-3 py-2 ring-1 ring-line">
          <div className="px-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{tr("Demand, monthly", "수요 · 월별")}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1" role="group" aria-label={tr("Demand period", "수요 기간")}>
            {([3, 6, 12] as MonthSpan[]).map((m) => (
              <button key={m} aria-pressed={p.months === m} onClick={() => setPeriod({ months: m })} className={chip(p.months === m)}>{tr(`${m} months`, `${m}개월`)}</button>
            ))}
            <span className="mx-1 h-4 w-px bg-line" aria-hidden />
            {(["yoy", "prev"] as Compare[]).map((c) => (
              <button key={c} aria-pressed={p.compare === c} onClick={() => setPeriod({ compare: c })} className={chip(p.compare === c)}>
                {c === "yoy" ? tr("vs a year ago", "전년 대비") : tr("vs period before", "직전 대비")}
              </button>
            ))}
          </div>
          {months && <div className="mt-1 px-1 text-[11.5px] text-muted">{months.recentLabel} {tr("vs", "vs")} {months.baseLabel}</div>}
        </div>
      )}
    </div>
  );
}
