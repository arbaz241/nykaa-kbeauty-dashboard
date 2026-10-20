"use client";

import Sparkline from "./Sparkline";
import { DetailHead, useDetail } from "./Detail";
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
  : <span className={s.small ? "text-muted" : s.mom > 0.05 ? "text-good" : s.mom < -0.05 ? "text-bad" : "text-ink-2"} title={s.small ? tr(`under ${SMALL} reviews the month before`, `전월 리뷰 ${SMALL}건 미만`) : undefined}>{Math.abs(s.mom) < 0.005 ? "0%" : signed(s.mom)}{s.small ? "*" : ""}</span>;

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

/** The same cell, clickable (owner 21 Oct 2026): opens a panel with all 12 months as bars, each month's change, and for
 *  a brand the products its reviews come from. */
export function MonthOnMonthButton({ values, win, color, open = false, kicker, title, products }: {
  values: (number | null)[]; win: string[]; color: string; open?: boolean; kicker: string; title: string;
  products?: { pid: string; name: string; values: (number | null)[] }[];
}) {
  const show = useDetail();
  const total = (v: (number | null)[]) => v.reduce<number>((a, x) => a + (x ?? 0), 0);
  const all = total(values);
  const panel = () => show({
    kicker, title,
    body: (<>
      <MonthBars values={values} win={win} color={color} open={open} />
      {products && products.length > 0 && (<>
        <DetailHead>{tr(`Where the reviews come from · ${products.length} product${products.length === 1 ? "" : "s"}`, `리뷰 출처 · 제품 ${products.length}개`)}</DetailHead>
        <div className="space-y-1">
          {[...products].sort((a, b) => total(b.values) - total(a.values)).slice(0, 12).map((p) => {
            const last = monthSteps(p.values, win, 3, open);
            return (
              <div key={p.pid} className="grid grid-cols-[minmax(0,1fr)_96px_44px_minmax(150px,auto)] items-center gap-2 px-1 py-1 text-[12px]">
                <span className="truncate" title={p.name}>{p.name}</span>
                <Sparkline values={p.values} color={color} width={90} height={20} />
                <span className="text-right tabular"><b className="font-medium">{all ? Math.round((total(p.values) / all) * 100) : 0}%</b></span>
                <span className="whitespace-nowrap text-right text-[11px] tabular text-muted">{last.map((s) => `${monthShort(s.month)} ${s.n}`).join(" · ")}</span>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-[11.5px] text-muted">{tr("% = the product's part of the brand's reviews over these 12 months.", "% = 12개월 동안 브랜드 리뷰 중 이 제품 비중.")}</p>
      </>)}
    </>),
  });
  return (
    <button type="button" onClick={panel} className="group w-full rounded-lg text-left hover:bg-sunken/60" title={tr("Open the 12-month chart", "12개월 차트 보기")}>
      <MonthOnMonth values={values} win={win} color={color} open={open} />
      <span className="mt-0.5 block text-[11px] font-medium text-accent-strong group-hover:underline">{tr("12 months ›", "12개월 ›")}</span>
    </button>
  );
}

/** Twelve months as bars, the count on top and the change on the month before underneath. */
export function MonthBars({ values, win, color, open = false }: { values: (number | null)[]; win: string[]; color: string; open?: boolean }) {
  const steps = new Map(monthSteps(values, win, values.length, open).map((s) => [s.month, s]));
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[520px] items-end gap-1.5" style={{ gridTemplateColumns: `repeat(${win.length}, minmax(0, 1fr))` }}>
        {win.map((m, i) => { const v = values[i]; const s = steps.get(m); return (
          <div key={m} className="flex flex-col items-center gap-1 text-[11px] tabular">
            <span className="font-medium">{v ?? "–"}</span>
            <span className="flex h-28 w-full items-end rounded-sm bg-sunken/60">{v !== null && v !== undefined && <span className="block w-full rounded-sm" style={{ height: `${Math.max(2, (v / max) * 100)}%`, background: color, opacity: s?.open ? 0.45 : 0.85 }} />}</span>
            <span className="text-muted">{monthShort(m)}</span>
            <span className="h-4">{s ? <Pct s={s} /> : null}</span>
          </div>
        ); })}
      </div>
      <p className="mt-2 text-[11.5px] text-muted">{tr(`Written reviews per month; under each bar, the change on the month before. * = under ${SMALL} reviews the month before. – = before our history starts.`, `월별 리뷰. 막대 아래 = 전월 대비. * = 전월 리뷰 ${SMALL}건 미만. – = 이력 시작 전.`)}</p>
    </div>
  );
}

export const momHelp = () => tr(`Written reviews per month over the last 12 complete months; the last three months with their change on the month before (month on month). * = under ${SMALL} reviews the month before, so the percentage swings a lot.`,
  `최근 완결된 12개월의 월별 리뷰. 최근 3개월은 전월 대비 증감(MoM) 표시. * = 전월 리뷰 ${SMALL}건 미만이라 비율 변동 큼.`);

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

/** The latest complete month against the one before, in one short line ("Sept +18% m/m"), for lists. */
export function MoMInline({ values, win, open = false }: { values: (number | null)[]; win: string[]; open?: boolean }) {
  const s = monthSteps(values, win, 1, open)[0];
  if (!s) return null;
  return <span className="block text-[10.5px] text-muted" title={momHelp()}>{monthShort(s.month)} {s.n} · <Pct s={s} />{tr(" m/m", " 전월비")}</span>;
}
