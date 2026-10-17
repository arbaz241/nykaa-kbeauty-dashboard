"use client";

import Link from "next/link";
import { dayMonth, tr } from "@/lib/i18n";
import type { Freeze } from "@/lib/market";
import { setPeriod, usePeriod, type ShelfSpan, type ShelfWindow } from "@/lib/period";

/** The period picker shown where shelf facts are (Round 4; plan v2 keeps the days only). One choice for the whole
 *  site: change it here and every tab follows. When Nykaa's rating counts are frozen it says how far buying runs. */
export default function PeriodBar({ shelf, freeze }: { shelf?: ShelfWindow | null; freeze?: Freeze | null }) {
  const p = usePeriod();
  const chip = (on: boolean) => `rounded-full px-3 py-1 text-[12.5px] transition ${on ? "bg-brand font-medium text-on-brand" : "text-ink-2 hover:bg-sunken hover:text-ink"}`;
  const frozenIn = !!(freeze && shelf && freeze.lastLive < shelf.end);
  return (
    <div className="max-w-[330px] rounded-2xl bg-surface px-3 py-2 ring-1 ring-line">
      <div className="px-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">{tr("Period on the shelf", "진열 기간")}</div>
      <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label={tr("Shelf period", "진열 기간")}>
        {([7, 14, 30, 0] as ShelfSpan[]).map((d) => (
          <button key={d} aria-pressed={p.days === d} onClick={() => setPeriod({ days: d })} className={chip(p.days === d)}>
            {d ? tr(`${d} days`, `${d}일`) : tr("All", "전체")}
          </button>
        ))}
      </div>
      {shelf && <div className="mt-1 px-1 text-[11.5px] text-muted tabular">{dayMonth(shelf.start)} – {dayMonth(shelf.end)} · {tr(`${shelf.days.length} days collected`, `수집 ${shelf.days.length}일`)}</div>}
      {frozenIn && <div className="mt-1 px-1 text-[11.5px] leading-snug text-warn">{tr(`Nykaa has not updated rating counts since ${dayMonth(freeze!.since)}, so buying figures run to ${dayMonth(freeze!.lastLive)}. Ranks, prices and offers are current.`,
        `Nykaa가 ${dayMonth(freeze!.since)}부터 평가 수를 갱신하지 않아 구매 수치는 ${dayMonth(freeze!.lastLive)}까지입니다. 순위·가격·프로모션은 최신입니다.`)} <Link href="/overview/#how" className="underline underline-offset-2">{tr("Why", "이유")}</Link></div>}
    </div>
  );
}
