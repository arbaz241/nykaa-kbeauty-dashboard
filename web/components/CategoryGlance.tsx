"use client";

import { useMemo, useState } from "react";
import PeriodBar from "./PeriodBar";
import { Card } from "./ui";
import { Basis, Def } from "./Tiered";
import { DetailsButton, ProductQuick } from "./Quick";
import { ORIGIN_COLOR, ORIGIN_LABEL } from "@/lib/brands";
import { useBrandOffers, useCategoryBrands, useCategoryStats, useEvents, useHomepage } from "@/lib/data";
import { CATEGORY_LABEL, pct, shortName } from "@/lib/format";
import { aggregate, isCombo, REASON_COLOR } from "@/lib/market";
import { listingMoves, runsFrom, type ListingMove } from "@/lib/profile";
import { spanLabel } from "@/lib/period";
import { useMarket } from "@/lib/useMarket";
import { dayMonth, tr } from "@/lib/i18n";

/** Round 4: one category at a glance, above its top-100 table. How many brands sell in it, how Korean its shelf is,
 *  its top seller, how concentrated it is, and what rose and fell over the chosen period, with the likely reasons
 *  (plan v2: the moves live here and on the brand and product pages, no longer on Demand). */
export default function CategoryGlance({ cat, part = "all" }: { cat: string; part?: "all" | "facts" | "moves" }) {
  const m = useMarket(); const stats = useCategoryStats(); const cb = useCategoryBrands();
  const events = useEvents(); const home = useHomepage(); const offers = useBrandOffers();
  const { win, flow, ix } = m;
  const runs = useMemo(() => runsFrom(home.data ?? []), [home.data]);
  const moves = useMemo(() => (win ? listingMoves({ ix, dims: m.dims, start: win.start, end: win.end, events: events.data ?? [], runs, offers: offers.data ?? [] }, null).filter((x) => x.subcategory === cat && !isCombo(x.name)) : []),
    [win, ix, m.dims, events.data, runs, offers.data, cat]);
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
  const singles = rows.filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
  const topSeller = singles[0];
  const kShare = rows.filter((r) => r.origin === "kbeauty").length / (rows.length || 1);
  const risers = moves.filter((x) => x.gain >= 5 && !x.entered && x.from !== null).sort((a, b) => b.gain - a.gain).slice(0, 6);
  const fallers = moves.filter((x) => x.gain <= -5 && !x.left && x.to !== null).sort((a, b) => a.gain - b.gain).slice(0, 6);
  const entrants = moves.filter((x) => x.entered).sort((a, b) => (a.to ?? 999) - (b.to ?? 999)).slice(0, 6);

  if (!m.ready || !win) return <div className="skeleton mt-6 h-40 rounded-[16px]" />;
  const spark = (pid: string) => {
    const s = (ix.series.get(`${cat}|${pid}`) ?? []).filter((x) => x.scrape_date >= win.start);
    if (s.length < 2) return null;
    const W = 90, H = 22; const xs = (i: number) => (i / (s.length - 1)) * W; const y = (rk: number) => ((rk - 1) / 99) * H;
    return <svg width={W} height={H} className="shrink-0" aria-hidden><path d={s.map((x, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${y(x.rank).toFixed(1)}`).join("")} fill="none" stroke="#2c6e5a" strokeWidth={1.5} /></svg>;
  };

  return (
    <section className={part === "all" ? "mt-6" : ""}>
      {part === "all" && <>      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-strong">{CATEGORY_LABEL[cat]} · {tr("at a glance", "한눈에")}</div>
          <p className="mt-1 max-w-[760px] text-[13px] text-muted">{tr(`Buying and moves over the ${spanLabel(m.period.days)} (${dayMonth(win.start)}–${dayMonth(win.end)}); buying is new ratings × price, single products only.`, `구매·순위 변동: ${spanLabel(m.period.days)} 기준(${dayMonth(win.start)}–${dayMonth(win.end)}). 구매 = 신규 평가 × 가격, 단일 제품만.`)}</p>
        </div>
        <PeriodBar />
      </div></>}
      {part !== "moves" && <div className="mt-4 grid gap-3 md:grid-cols-4">
        <Card className="px-5 py-4">
          <div className="text-[12.5px] text-muted"><Def k="brandCount">{tr("Brands on Nykaa", "Nykaa 입점 브랜드")}</Def></div>
          <div className="mt-1 font-display text-[28px] font-semibold tabular">{stat ? stat.brands.toLocaleString("en-IN") : "–"}</div>
          <Basis>{stat ? tr(`${stat.products.toLocaleString("en-IN")} products · ${new Set(rows.map((r) => r.brand)).size} brands in the top 100`, `제품 ${stat.products.toLocaleString("en-IN")}개 · 상위 100위 브랜드 ${new Set(rows.map((r) => r.brand)).size}개`) : tr("collected nightly from 17 Oct", "10월 17일부터 매일 수집")}</Basis>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-2">{byOriginCount.filter((x) => x.n).map((x) => <span key={x.o} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: ORIGIN_COLOR[x.o].fill }} />{ORIGIN_LABEL[x.o]} {x.n}</span>)}</div>
          <Basis className="mt-1">{newBrands.length ? tr(`New this period: ${newBrands.map((b) => b.brand).slice(0, 5).join(", ")}`, `이번 기간 신규: ${newBrands.map((b) => b.brand).slice(0, 5).join(", ")}`) : tr("New brands show here as the nightly list builds up.", "매일 목록이 쌓이면 신규 브랜드 표시.")}</Basis>
        </Card>
        <Card className="px-5 py-4">
          <div className="text-[12.5px] text-muted">{tr("Korean share of top-100 products", "상위 100위 제품 중 K-뷰티 비중")}</div>
          <div className="mt-1 font-display text-[28px] font-semibold tabular">{pct(kShare)}</div>
          <Basis>{tr(`${rows.filter((r) => r.origin === "kbeauty").length} of ${rows.length} products today`, `오늘 제품 ${rows.length}개 중 ${rows.filter((r) => r.origin === "kbeauty").length}개`)}</Basis>
        </Card>
        <Card className="px-5 py-4">
          <div className="text-[12.5px] text-muted"><Def k="ratingFlow">{tr("Best seller's share of all buying", "베스트셀러의 전체 구매 점유율")}</Def></div>
          {topSeller ? <>
            <div className="mt-1 font-display text-[28px] font-semibold tabular">{pct(topSeller.value / tot, 1)}</div>
            <Basis><b className="font-medium text-ink">{topSeller.brand}</b> {shortName(topSeller.name, topSeller.brand)}</Basis>
          </> : <div className="mt-1 font-display text-[28px] font-semibold">–</div>}
        </Card>
        <Card className="px-5 py-4">
          <div className="text-[12.5px] text-muted">{tr("Top 5 brands' share of all buying", "상위 5개 브랜드의 전체 구매 점유율")}</div>
          <div className="mt-1 font-display text-[28px] font-semibold tabular">{pct(top5)}</div>
          <Basis>{brands.slice(0, 5).map((b, i) => <span key={b.key}>{i ? " · " : ""}<b className="font-medium text-ink">{b.key}</b> {pct(b.value / tot)}</span>)}</Basis>
        </Card>
      </div>}
      {part !== "facts" && <><div className="mt-3 grid gap-3 lg:grid-cols-3">
        <MoveList title={tr(`Climbed most, ${dayMonth(win.start)} → ${dayMonth(win.end)}`, `가장 많이 오른 제품, ${dayMonth(win.start)} → ${dayMonth(win.end)}`)} items={risers} spark={spark} empty={tr("Nothing climbed 5+ places.", "5계단 이상 오른 제품 없음.")} />
        <MoveList title={tr(`Fell most, ${dayMonth(win.start)} → ${dayMonth(win.end)}`, `가장 많이 내린 제품, ${dayMonth(win.start)} → ${dayMonth(win.end)}`)} items={fallers} spark={spark} empty={tr("Nothing fell 5+ places.", "5계단 이상 내린 제품 없음.")} />
        <MoveList title={tr("New in the top 100 this period", "이번 기간 상위 100위 신규 진입")} items={entrants} spark={spark} empty={tr("No new entries in this period.", "이 기간 신규 진입 없음.")} />
      </div>
      <p className="mt-2 text-[12px] text-muted">{tr("Moves: the middle of the first three days to the middle of the last three. Reasons are what changed on the same dates (price, paid slot, offer, stock, homepage, sale, ratings, rivals); none is proof.", "변화: 처음 3일 중앙값 → 마지막 3일 중앙값. 이유 = 같은 날짜에 달라진 것(가격, 광고, 프로모션, 재고, 홈페이지, 세일, 평가, 경쟁), 증거는 아님.")}</p></>}
    </section>
  );
}

function MoveList({ title, items, spark, empty }: { title: string; items: ListingMove[]; spark: (pid: string) => React.ReactNode; empty: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card className="px-5 py-4">
      <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{title}</div>
      <ul className="mt-2 divide-y divide-line/60">{items.length ? items.map((x) => (
        <li key={x.key} className="py-2 text-[13px]">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1 truncate"><b className="font-medium">{x.brand}</b> {shortName(x.name, x.brand)}</span>
            {spark(x.product_id)}
            <span className="shrink-0 text-right tabular text-ink-2">{x.entered ? <b className="text-ink">#{x.to}</b> : <>#{x.from} → <b className="text-ink">#{x.to}</b></>}</span>
            <DetailsButton open={open === x.key} onClick={() => setOpen(open === x.key ? null : x.key)} />
          </div>
          {!x.entered && <div className="mt-1 flex flex-wrap gap-1">{x.why.length ? x.why.slice(0, 2).map((w) => <span key={w.text} className="rounded-full px-2 py-0.5 text-[11px] text-white" style={{ background: REASON_COLOR[w.kind] }}>{w.text}</span>) : <span className="text-[11.5px] text-muted">{tr("nothing we track changed", "추적 항목 변화 없음")}</span>}</div>}
          {open === x.key && <ProductQuick pid={x.product_id} cat={x.subcategory} />}
        </li>)) : <li className="py-2 text-[12.5px] text-muted">{empty}</li>}</ul>
    </Card>
  );
}
