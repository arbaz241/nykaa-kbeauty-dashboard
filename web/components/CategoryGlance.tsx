"use client";

import { useMemo } from "react";
import PeriodBar from "./PeriodBar";
import { Card } from "./ui";
import { Basis, Def } from "./Tiered";
import { useOpenProduct } from "./ProductDrawer";
import { ORIGIN_COLOR, ORIGIN_LABEL } from "@/lib/brands";
import { useCategoryBrands, useCategoryStats } from "@/lib/data";
import { CATEGORY_LABEL, compact, pct, shortName, signed } from "@/lib/format";
import { aggregate, smoothedMove } from "@/lib/market";
import { compareWord, spanLabel } from "@/lib/period";
import { useMarket } from "@/lib/useMarket";
import { dayMonth, tr } from "@/lib/i18n";

/** Round 4: one category at a glance, above its top-100 table. Size, growth, how many brands sell in it, how
 *  concentrated it is, and what rose over the chosen period, with each product's rank line. */
export default function CategoryGlance({ cat }: { cat: string }) {
  const m = useMarket(); const stats = useCategoryStats(); const cb = useCategoryBrands(); const open = useOpenProduct();
  const { win, mwin, flow, prevFlow, growth, ix } = m;
  const latest = useMemo(() => [...new Set((stats.data ?? []).map((s) => s.scrape_date))].sort().pop() ?? null, [stats.data]);
  const stat = (stats.data ?? []).find((s) => s.scrape_date === latest && s.subcategory === cat);
  const brandsHere = (cb.data ?? []).filter((b) => b.subcategory === cat && b.last_seen === latest);
  const firstSeenDay = useMemo(() => (cb.data ?? []).reduce((a, b) => (!a || b.first_seen < a ? b.first_seen : a), ""), [cb.data]);
  const newBrands = win ? brandsHere.filter((b) => b.first_seen > firstSeenDay && b.first_seen >= win.start) : [];
  const byOriginCount = ["kbeauty", "local", "global", "unknown"].map((o) => ({ o, n: brandsHere.filter((b) => b.origin === o).length }));

  const rows = flow.filter((r) => r.subcategory === cat);
  const tot = rows.reduce((a, r) => a + r.value, 0) || 1;
  const brands = [...aggregate(rows, (r) => r.brand).values()].sort((a, b) => b.value - a.value);
  const top5 = brands.slice(0, 5).reduce((a, b) => a + b.value, 0) / tot;
  const allTot = flow.reduce((a, r) => a + r.value, 0) || 1;
  const prevShare = prevFlow ? prevFlow.filter((r) => r.subcategory === cat).reduce((a, r) => a + r.value, 0) / (prevFlow.reduce((a, r) => a + r.value, 0) || 1) : null;
  const g = growth?.byCategory.get(cat);
  const risers = win ? rows.filter((r) => r.rankStart !== null && r.rankEnd !== null).flatMap((r) => {
    const mv = smoothedMove(ix, `${cat}|${r.product_id}`, win.start, win.end); // typical rank, first vs last three days
    return mv ? [{ r: { ...r, rankStart: mv.from, rankEnd: mv.to }, gain: mv.from - mv.to }] : [];
  }).sort((a, b) => b.gain - a.gain).slice(0, 6) : [];
  const entrants = rows.filter((r) => r.rankStart === null).sort((a, b) => (a.rankEnd ?? 999) - (b.rankEnd ?? 999)).slice(0, 6);

  if (!m.ready || !win || !mwin) return <div className="skeleton mt-6 h-40 rounded-[16px]" />;
  const spark = (pid: string) => {
    const s = (ix.series.get(`${cat}|${pid}`) ?? []).filter((x) => x.scrape_date >= win.start);
    if (s.length < 2) return null;
    const W = 90, H = 22; const xs = (i: number) => (i / (s.length - 1)) * W; const y = (rk: number) => ((rk - 1) / 99) * H;
    return <svg width={W} height={H} className="shrink-0" aria-hidden><path d={s.map((x, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${y(x.rank).toFixed(1)}`).join("")} fill="none" stroke="#2c6e5a" strokeWidth={1.5} /></svg>;
  };

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-strong">{CATEGORY_LABEL[cat]} · {tr("at a glance", "한눈에")}</div>
          <p className="mt-1 max-w-[760px] text-[13px] text-muted">{tr(`Size and growth from review value (${mwin.recentLabel} ${compareWord(mwin.compare)}); buying and movers over the ${spanLabel(m.period.days)} (${dayMonth(win.start)}–${dayMonth(win.end)}).`, `규모·성장률은 리뷰 금액 기준(${mwin.recentLabel}, ${compareWord(mwin.compare)}), 구매·순위 변동은 ${spanLabel(m.period.days)} 기준(${dayMonth(win.start)}–${dayMonth(win.end)}).`)}</p>
        </div>
        <PeriodBar shelf={win} months={mwin} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Card className="px-5 py-4">
          <div className="text-[12.5px] text-muted"><Def k="brandCount">{tr("Brands on Nykaa", "Nykaa 입점 브랜드")}</Def></div>
          <div className="mt-1 font-display text-[28px] font-semibold tabular">{stat ? stat.brands.toLocaleString("en-IN") : "–"}</div>
          <Basis>{stat ? tr(`${stat.products.toLocaleString("en-IN")} products · ${new Set(rows.map((r) => r.brand)).size} brands in the top 100`, `제품 ${stat.products.toLocaleString("en-IN")}개 · 상위 100위 브랜드 ${new Set(rows.map((r) => r.brand)).size}개`) : tr("collected nightly from 17 Oct", "10월 17일부터 매일 수집")}</Basis>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-2">{byOriginCount.filter((x) => x.n).map((x) => <span key={x.o} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: ORIGIN_COLOR[x.o].fill }} />{ORIGIN_LABEL[x.o]} {x.n}</span>)}</div>
          <Basis className="mt-1">{newBrands.length ? tr(`New this period: ${newBrands.map((b) => b.brand).slice(0, 5).join(", ")}`, `이번 기간 신규: ${newBrands.map((b) => b.brand).slice(0, 5).join(", ")}`) : tr("New brands show here as the nightly list builds up.", "매일 목록이 쌓이면 신규 브랜드가 여기에 표시됩니다.")}</Basis>
        </Card>
        <Card className="px-5 py-4">
          <div className="text-[12.5px] text-muted"><Def k="valueGrowth">{tr("Growth, like for like", "성장률 (동일 제품)")}</Def></div>
          <div className={`mt-1 font-display text-[28px] font-semibold tabular ${g?.existing !== null && g?.existing !== undefined ? (g.existing >= 0 ? "text-good" : "text-bad") : ""}`}>{g?.existing !== null && g?.existing !== undefined ? signed(g.existing) : "–"}</div>
          <Basis>{tr(`${g?.products ?? 0} products; launches add up to +${g?.launch ? (g.launch * 100).toFixed(0) : 0} pts (${g?.launches ?? 0} products). Market: ${signed(growth?.total.existing ?? null)}`, `제품 ${g?.products ?? 0}개, 신제품 최대 +${g?.launch ? (g.launch * 100).toFixed(0) : 0}%p (${g?.launches ?? 0}개). 시장: ${signed(growth?.total.existing ?? null)}`)}</Basis>
        </Card>
        <Card className="px-5 py-4">
          <div className="text-[12.5px] text-muted"><Def k="ratingFlow">{tr("Share of all buying", "전체 구매 중 비중")}</Def></div>
          <div className="mt-1 font-display text-[28px] font-semibold tabular">{pct(tot / allTot, 1)}</div>
          <Basis>{prevShare !== null ? tr(`${signed(tot / allTot - prevShare, 1).replace("%", " pts")} on the period before`, `직전 기간 대비 ${signed(tot / allTot - prevShare, 1).replace("%", "%p")}`) : tr(`${compact(rows.reduce((a, r) => a + r.flow, 0))} new ratings in the period`, `기간 중 신규 평가 ${compact(rows.reduce((a, r) => a + r.flow, 0))}건`)}</Basis>
        </Card>
        <Card className="px-5 py-4">
          <div className="text-[12.5px] text-muted">{tr("Top 5 brands hold", "상위 5개 브랜드 점유")}</div>
          <div className="mt-1 font-display text-[28px] font-semibold tabular">{pct(top5)}</div>
          <Basis>{brands.slice(0, 5).map((b) => `${b.key} ${pct(b.value / tot)}`).join(" · ")}</Basis>
        </Card>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Card className="px-5 py-4">
          <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{tr(`Climbed most, ${dayMonth(win.start)} → ${dayMonth(win.end)}`, `가장 많이 오른 제품, ${dayMonth(win.start)} → ${dayMonth(win.end)}`)}</div>
          <ul className="mt-2 divide-y divide-line/60">{risers.filter((x) => x.gain > 0).map(({ r, gain }) => (
            <li key={r.product_id} className="flex items-center gap-3 py-1.5 text-[13px]">
              <button onClick={() => open({ product_id: r.product_id, name: r.name, brand: r.brand, url: r.url })} className="min-w-0 flex-1 truncate text-left underline decoration-line-2 underline-offset-2"><b className="font-medium">{r.brand}</b> {shortName(r.name, r.brand)}</button>
              {spark(r.product_id)}
              <span className="w-[92px] shrink-0 text-right tabular text-ink-2">#{r.rankStart} → <b className="text-ink">#{r.rankEnd}</b></span>
              <span className="w-10 shrink-0 text-right font-semibold tabular text-good">▲{gain}</span>
            </li>))}</ul>
        </Card>
        <Card className="px-5 py-4">
          <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{tr("New in the top 100 this period", "이번 기간 상위 100위 신규 진입")}</div>
          <ul className="mt-2 divide-y divide-line/60">{entrants.length ? entrants.map((r) => (
            <li key={r.product_id} className="flex items-center gap-3 py-1.5 text-[13px]">
              <button onClick={() => open({ product_id: r.product_id, name: r.name, brand: r.brand, url: r.url })} className="min-w-0 flex-1 truncate text-left underline decoration-line-2 underline-offset-2"><b className="font-medium">{r.brand}</b> {shortName(r.name, r.brand)}</button>
              <span className="shrink-0 rounded px-1.5 py-px text-[10px] font-semibold uppercase" style={{ background: ORIGIN_COLOR[r.origin]?.soft, color: ORIGIN_COLOR[r.origin]?.ink }}>{ORIGIN_LABEL[r.origin]}</span>
              <span className="w-12 shrink-0 text-right tabular"><b>#{r.rankEnd}</b></span>
            </li>)) : <li className="py-2 text-[12.5px] text-muted">{tr("No new entries in this period.", "이 기간에는 신규 진입이 없습니다.")}</li>}</ul>
        </Card>
      </div>
    </section>
  );
}
