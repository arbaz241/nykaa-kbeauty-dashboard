"use client";

import Sparkline from "./Sparkline";
import { monthShort, tr } from "@/lib/i18n";
import { signed } from "@/lib/format";
export { openEnded } from "@/lib/metrics";

/** Owner 20 Oct 2026: month-on-month review growth beside every compared product (and brand). Written reviews per
 *  complete month, each month against the month before; months the history doesn't reach are left out. A month
 *  with fewer than SMALL reviews before it is marked: one review more or less swings the percentage. */
export const SMALL = 10;

export interface MonthStep { month: string; n: number; mom: number | null; small: boolean; open?: boolean }

/** The last `k` complete months of a 12-month series (oldest first, null = not covered), each with its change on the month before. */
export function monthSteps(values: (number | null)[], win: string[], k = 3, open = false): MonthStep[] {
  const out: MonthStep[] = [];
  for (let i = Math.max(0, values.length - k); i < values.length; i++) {
    const v = values[i]; if (v === null || v === undefined) continue;
    const p = i > 0 ? values[i - 1] : null;
    const last = i === values.length - 1 && open;
    out.push({ month: win[i], n: v, mom: !last && p !== null && p !== undefined && p > 0 ? v / p - 1 : null, small: p !== null && p !== undefined && p < SMALL, open: last });
  }
  return out;
}



/** The latest complete month against the one before, or null when either isn't covered. */
export function latestMoM(values: (number | null)[] | null | undefined, win: string[], open = false) {
  if (!values) return null;
  const s = monthSteps(values, win, 1, open)[0];
  return s && s.mom !== null ? s : null;
}

const OPEN = () => tr("No review read after this month yet: we may have read the product before the month ended, so its count can still grow. Shown without a change.", "이 달 이후 읽은 리뷰가 아직 없음: 월말 전에 읽었을 수 있어 수치가 늘 수 있음. 증감 미표시.");
const Pct = ({ s }: { s: MonthStep }) => s.open ? <span className="text-muted" title={OPEN()}>{tr("filling in?", "집계 중?")}</span> : s.mom === null ? <span className="text-muted">{tr("new", "신규")}</span>
  : <span className={s.small ? "text-muted" : s.mom > 0.05 ? "text-good" : s.mom < -0.05 ? "text-bad" : "text-ink-2"} title={s.small ? tr(`under ${SMALL} reviews the month before`, `전월 리뷰 ${SMALL}건 미만`) : undefined}>{signed(s.mom)}{s.small ? "*" : ""}</span>;

/** Sparkline of 12 months, then the last three months with month-on-month change. */
export function MonthOnMonth({ values, win, color, open = false }: { values: (number | null)[]; win: string[]; color: string; open?: boolean }) {
  const steps = monthSteps(values, win, 3, open);
  return (
    <div>
      <Sparkline values={values} color={color} width={140} height={26} />
      {steps.length > 0 && (
        <table className="mt-1 text-[11.5px] tabular leading-[1.45]">
          <tbody>{steps.map((s) => (
            <tr key={s.month}><td className="pr-2 text-muted">{monthShort(s.month)}</td><td className="pr-2 text-right font-medium">{s.n}</td><td className="text-right"><Pct s={s} /></td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

export const momHelp = () => tr(`Written reviews per month over the last 12 complete months; the last three months with their change on the month before (month on month). * = under ${SMALL} reviews the month before, so the percentage swings a lot.`,
  `최근 완결된 12개월의 월별 작성 리뷰. 최근 3개월은 전월 대비 증감(MoM) 표시. * = 전월 리뷰 ${SMALL}건 미만이라 비율 변동 큼.`);

/** One line under a monthly chart: the last three complete months, each against the month before. */
export function MoMStrip({ values, win, open = false }: { values: (number | null)[]; win: string[]; open?: boolean }) {
  const steps = monthSteps(values, win, 3, open);
  if (!steps.length) return null;
  return (
    <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-line pt-2.5 text-[12.5px] tabular">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted" title={momHelp()}>{tr("Month on month", "전월 대비")}</span>
      {steps.map((s) => <span key={s.month}><span className="text-muted">{monthShort(s.month)}</span> <b className="font-medium">{s.n}</b> <Pct s={s} /></span>)}
    </div>
  );
}
