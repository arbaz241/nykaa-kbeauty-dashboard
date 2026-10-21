"use client";

import MethodNotes, { BUYING_METHOD } from "@/components/MethodNotes";
import { Fragment, useEffect, useMemo, useState } from "react";
import CategoryGlance from "@/components/CategoryGlance";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import PeriodBar from "@/components/PeriodBar";
import { Card, Loading, PageHead, pill } from "@/components/ui";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import { Basis, Def } from "@/components/Tiered";
import { Missing } from "@/components/Detail";
import { BrandQuick, DetailsButton, ProductQuick } from "@/components/Quick";
import { ANCHOR_BRAND, ORIGIN_COLOR, ORIGIN_LABEL, norm } from "@/lib/brands";
import { useCategoryBrands, useCategoryStats } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_URL, inr, pct, shortName, signed } from "@/lib/format";
import { aggregate, catsOn, isCombo, placesOn } from "@/lib/market";
import { brandShareIn, shareIn } from "@/lib/profile";
import { spanLabel } from "@/lib/period";
import { useTiers } from "@/lib/tiers";
import { useMarket } from "@/lib/useMarket";
import { dayMonth, tr } from "@/lib/i18n";
import type { ShelfRow } from "@/lib/types";
import { ScopeLine } from "@/components/Scope";

/** Market (plan v3, owner 18 Oct 2026: "a comprehensive tab which has both the categories and the brands... why are you
 *  making me work from tab to tab"). The old Categories and Brands tabs on one page: pick a category, or all of them,
 *  and its brands, its products and what moved are together. Details open in place under each row. */

const ORIGINS = ["kbeauty", "local", "global", "unknown"] as const;
const ORIGIN_CHIP: Record<string, string> = { kbeauty: "bg-[#e4f0eb] text-[#1f5646]", local: "bg-[#faefe2] text-[#8a5a22]", global: "bg-[#e9eff5] text-[#3d5670]", unknown: "bg-sunken text-muted" };
const catName = (c: string) => CATEGORY_LABEL[c] ?? c;
const pts = (v: number) => signed(v, 1).replace("%", tr(" pts", "%p"));

function OriginBar({ agg, total }: { agg: Map<string, { value: number }>; total: number }) {
  return (
    <div className="flex h-5 min-w-[220px] overflow-hidden rounded-md text-[10.5px] font-semibold">
      {ORIGINS.map((o) => { const v = (agg.get(o)?.value ?? 0) / (total || 1); return v > 0.004 ? <div key={o} title={`${ORIGIN_LABEL[o]} ${pct(v, 1)}`} style={{ width: `${v * 100}%`, background: ORIGIN_COLOR[o].fill, color: ORIGIN_COLOR[o].text }} className="grid place-items-center">{v >= 0.12 ? pct(v) : ""}</div> : null; })}
    </div>
  );
}

function MarketPage() {
  const m = useMarket(); const stats = useCategoryStats(); const cb = useCategoryBrands();
  const known = useMemo(() => [...new Set(m.shelf.map((r) => r.brand))], [m.shelf]);
  const tiers = useTiers(known);
  const [cat, setCat] = useState<string>(() => { const c = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("cat"); return c && CATEGORIES.includes(c) ? c : "all"; });
  useEffect(() => { window.history.replaceState(null, "", cat === "all" ? window.location.pathname : `?cat=${cat}`); }, [cat]);

  const latestStat = useMemo(() => [...new Set((stats.data ?? []).map((s) => s.scrape_date))].sort().pop() ?? null, [stats.data]);
  const allBrands = useMemo(() => new Set((cb.data ?? []).filter((b) => b.last_seen === latestStat && b.subcategory !== "kbeauty_store").map((b) => b.brand)).size, [cb.data, latestStat]);

  if (!m.ready || !m.win) return <Shell active="Top by category"><PageHead eyebrow={tr("Market", "시장")} title={tr("Who is winning each category", "카테고리별 선두 브랜드")} sub="" /><Loading what={tr("the market", "시장")} /></Shell>;
  const span = m.flowSpan!;

  const NAV: NavItem[] = cat === "all"
    ? [{ id: "snapshot", label: tr("Category snapshot", "카테고리 요약") }, { id: "mainbrands", label: tr("Main brands", "주요 브랜드") }, { id: "origins", label: tr("Korean, Indian, global", "국적별 · K-뷰티·인도·글로벌") }]
    : [{ id: "facts", label: tr("At a glance", "한눈에") }, { id: "leaders", label: tr("Who leads", "선두 브랜드") }, { id: "products", label: tr("Top products", "상위 제품") }, { id: "moved", label: tr("What moved and why", "변동과 이유") }, { id: "origins", label: tr("Korean, Indian, global", "국적별 · K-뷰티·인도·글로벌") }];

  return (
    <Shell active="Top by category" asOf={m.latest ?? undefined}>
      <PageHead eyebrow={tr("Market", "시장")} title={tr("Who is winning each category", "카테고리별 선두 브랜드")}
        sub={tr("Pick one category, or all of them. Its brands, its top products and what moved are on this page together. Press \"Details\" on any row to see more without leaving the page.", "카테고리 하나 또는 전체 선택. 브랜드, 상위 제품, 변동을 한 페이지에서 확인. 어느 행이든 \"자세히\"를 누르면 이 페이지에서 바로 더 보기.")} />
      <ScopeLine uses={["selling", "top100"]} measure={tr(`share of buying (new ratings × MRP within one category, ${dayMonth(span.start)}–${dayMonth(span.end)}: the last stretch before Nykaa froze its public rating counts on 10 Oct) and places in each top 100; brand counts come from Nykaa's brand filter.`, `판매 점유율(카테고리 안 신규 평가 수 × 정가(MRP), ${dayMonth(span.start)}–${dayMonth(span.end)}: Nykaa가 10월 10일 평가 수 공개를 멈추기 전 마지막 구간)과 상위 100위 순위. 브랜드 수는 Nykaa 브랜드 필터 기준.`)} />
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label={tr("Category", "카테고리")}>
        <button className={pill(cat === "all")} onClick={() => setCat("all")}>{tr(`All ${CATEGORIES.length} categories`, `${CATEGORIES.length}개 카테고리 전체`)}</button>
        {CATEGORIES.map((c) => <button key={c} className={pill(cat === c)} onClick={() => setCat(c)}>{catName(c)}</button>)}
      </div>
      <SectionNav items={NAV} />
      {cat === "all" ? <AllView m={m} tiers={tiers} allBrands={allBrands} latestStat={latestStat} stats={stats.data ?? []} onPick={setCat} span={span} />
        : <CategoryView key={cat} cat={cat} m={m} tiers={tiers} span={span} />}
      <MethodNotes parts={{
        sources: [tr(`Nykaa's top 100 of each of the ${CATEGORIES.length} lists, read every night (lists added later start on their own first day); Nykaa's brand filter for each list (every brand selling in it, from 17 Oct); each product's Nykaa category label.`, `${CATEGORIES.length}개 목록 각각의 Nykaa 상위 100위(매일 밤, 나중에 추가된 목록은 그날부터), 목록별 Nykaa 브랜드 필터(판매 브랜드 전체, 10월 17일부터), 제품별 Nykaa 카테고리 라벨.`),
          tr("“Cleansing balm” is still collected but not shown: Nykaa's page is mostly makeup removers and wipes (owner, 18 Oct).", "“클렌징 밤”은 수집만 하고 표시 안 함: Nykaa 페이지가 대부분 메이크업 리무버·티슈 (10월 18일 결정).")],
        calc: [...BUYING_METHOD(m.flowSpan).calc, tr("Brands selling: Nykaa's own brand filter for the list; a brand selling in several lists counts once in the total. Moves: middle of the first three days to the middle of the last three.", "판매 브랜드: 목록별 Nykaa 브랜드 필터, 여러 목록 판매 브랜드는 합계에서 한 번만. 변화: 처음 3일 중앙값 → 마지막 3일 중앙값.")],
        assume: BUYING_METHOD(m.flowSpan).assume,
        limits: BUYING_METHOD(m.flowSpan).limits,
      }} />
    </Shell>
  );
}

type M = ReturnType<typeof useMarket>;
type T = ReturnType<typeof useTiers>;

/* ------------------------------------------------------------------ all categories */

function AllView({ m, tiers, allBrands, latestStat, stats, onPick, span }: { m: M; tiers: T; allBrands: number; latestStat: string | null; stats: { scrape_date: string; subcategory: string; brands: number }[]; onPick: (c: string) => void; span: { start: string; end: string } }) {
  const [open, setOpen] = useState<string | null>(null);
  const win = m.win!;
  const rows = CATEGORIES.map((c) => {
    const sh = shareIn(m.flow, c); const top = sh.rows[0];
    const byB = aggregate(sh.rows, (r) => r.brand); const ranked = [...byB.values()].sort((a, b) => b.value - a.value);
    const k = sh.rows.filter((r) => r.origin === "kbeauty").reduce((a, r) => a + r.value, 0) / (sh.total || 1);
    const stat = stats.find((s) => s.scrape_date === latestStat && s.subcategory === c);
    return { c, brands: stat?.brands ?? null, leader: ranked[0], leaderShare: ranked[0] && sh.total ? ranked[0].value / sh.total : null, top, topShare: top && sh.total ? top.value / sh.total : null,
      top5: sh.total ? ranked.slice(0, 5).reduce((a, x) => a + x.value, 0) / sh.total : null, k, tracked: !!sh.total };
  });
  const c0 = catsOn(m.ix, win.start); const c1 = catsOn(m.ix, win.end); const both = new Set([...c1].filter((c) => c0.has(c)));
  const p0 = placesOn(m.ix, m.dims, win.start, both); const p1 = placesOn(m.ix, m.dims, win.end, both);
  const main = [...new Set([tiers.pinned, ...tiers.focus])].filter(Boolean).map((b) => {
    const today = m.shelf.filter((r) => norm(r.brand) === norm(b)).sort((x, y) => x.rank - y.rank);
    const key = [...p1.keys(), ...p0.keys()].find((x) => norm(x) === norm(b)) ?? b;
    const cats = [...new Set(today.map((r) => r.subcategory))];
    const best = cats.map((c) => ({ c, s: brandShareIn(m.flow, c, b) })).filter((x) => x.s).sort((x, y) => y.s!.share - x.s!.share)[0];
    // best seller = most buying (plan v4), not the best rank
    const seller = m.flow.filter((r) => norm(r.brand) === norm(b) && r.value > 0).sort((x, y) => y.value - x.value)[0] ?? null;
    return { b, origin: m.originOf(b), group: tiers.group(b), now: today.length, was7: p0.get(key) ?? 0, now7: p1.get(key) ?? 0, d: (p1.get(key) ?? 0) - (p0.get(key) ?? 0), cats: cats.length, seller, sellerShare: seller ? brandShareIn(m.flow, seller.subcategory, b) : null, best };
  }).sort((a, b) => b.now - a.now);
  const originRows = CATEGORIES.map((c) => {
    const rs = m.flow.filter((r) => r.subcategory === c); const tot = rs.reduce((a, r) => a + r.value, 0);
    const agg = aggregate(rs, (r) => r.origin);
    const kLeader = [...aggregate(rs.filter((r) => r.origin === "kbeauty"), (r) => r.brand).values()].sort((a, b) => b.value - a.value)[0];
    return { c, agg, tot, kLeader };
  }).sort((a, b) => b.tot - a.tot);

  return (
    <>
      <ActionSection id="snapshot" kicker={tr("Category snapshot", "카테고리 요약")} title={(() => { const ls = rows.map((r) => r.leaderShare).filter((x): x is number => x !== null); const lo = ls.length ? Math.min(...ls) : 0; const hi = ls.length ? Math.max(...ls) : 0;
          return tr(`${allBrands || "–"} brands sell across the ${CATEGORIES.length} categories; the leading brand takes between ${pct(lo, 0)} and ${pct(hi, 0)} of a category's buying`, `${CATEGORIES.length}개 카테고리, 판매 브랜드 ${allBrands || "–"}개. 카테고리 선두 브랜드의 판매 점유율 ${pct(lo, 0)}–${pct(hi, 0)}`); })()}
        note={tr(<>Brands: Nykaa&rsquo;s own brand filter{latestStat ? ` on ${dayMonth(latestStat)}` : ""}; a brand selling in several categories counts once in the total. Shares: <Def k="ratingFlow">share of buying</Def> ({dayMonth(span.start)}–{dayMonth(span.end)}), single products. Press &ldquo;Open&rdquo; for the category.</>,
          <>브랜드: Nykaa 브랜드 필터{latestStat ? ` (${dayMonth(latestStat)})` : ""}. 여러 카테고리에서 파는 브랜드는 합계에서 한 번만. 점유율: <Def k="ratingFlow">판매 점유율</Def> ({dayMonth(span.start)}–{dayMonth(span.end)}), 단일 제품. &ldquo;열기&rdquo;를 누르면 해당 카테고리로 이동.</>)}>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Category", "카테고리")}</th><th className="px-2">{tr("Brands selling", "판매 브랜드")}</th><th className="px-2">{tr("Leading brand", "선두 브랜드")}</th><th className="px-2">{tr("Top 5 brands", "상위 5개")}</th><th className="px-2">{tr("Best-selling product", "최다 판매 제품")}</th><th className="px-4" /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.c} className="border-b border-line/60 align-top">
                <td className="px-4 py-2.5 font-medium">{catName(r.c)}</td>
                <td className="px-2 py-2.5 tabular">{r.brands ?? "–"}{r.brands && allBrands ? <Basis>{pct(r.brands / allBrands)} {tr("of all brands", "전체 브랜드 중")}</Basis> : null}</td>
                <td className="px-2 py-2.5">{r.leader ? <><b className="font-medium">{r.leader.key}</b> <span className="tabular text-ink-2">{pct(r.leaderShare, 0)}</span>{r.top && r.top.brand === r.leader.key && r.top.poolSize >= 5 && (r.topShare ?? 0) > 0.3 ? <Basis>{tr(`mostly one rating count Nykaa shows on ${r.top.poolSize} of its listings at once`, `Nykaa가 제품 ${r.top.poolSize}개에 함께 표시하는 평가 수 하나에 크게 기댐`)}</Basis> : null}</> : <Missing>{tr("no buying counted: list added after Nykaa froze rating counts (10 Oct)", "판매 집계 없음: Nykaa 평가 수 동결(10월 10일) 뒤 추가된 목록")}</Missing>}</td>
                <td className="px-2 py-2.5 tabular">{r.top5 !== null ? pct(r.top5, 0) : "–"}</td>
                <td className="max-w-[300px] px-2 py-2.5">{r.top ? <>{r.top.brand} {shortName(r.top.name, r.top.brand)} <span className="tabular text-muted">{pct(r.topShare, 1)}</span></> : "–"}</td>
                <td className="px-4 py-2.5 text-right"><button onClick={() => { onPick(r.c); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-full px-2.5 py-0.5 text-[12px] font-medium text-accent-strong ring-1 ring-line hover:bg-sunken">{tr("Open ›", "열기 ›")}</button></td>
              </tr>))}</tbody>
          </table>
        </Card>
      </ActionSection>

      <ActionSection id="mainbrands" kicker={tr("Main brands", "주요 브랜드")} title={tr(`${main.filter((x) => x.d > 0).length} of ${main.length} main brands have more products in the top 100 than on ${dayMonth(win.start)}, ${main.filter((x) => x.d < 0).length} have fewer`, `주요 브랜드 ${main.length}개 중 ${main.filter((x) => x.d > 0).length}개는 ${dayMonth(win.start)}보다 상위 100위 제품 증가, ${main.filter((x) => x.d < 0).length}개 감소`)}
        note={tr(`Your ${main.length} main brands (Admin › Brand tiers). Products in the top 100: today, all categories; the change counts only the ${both.size} categories tracked for the whole ${spanLabel(m.period.days)} (${[...both].map(catName).join(", ").toLowerCase()}), so the two columns are on different bases. Strongest: the category where it takes the biggest share of that category's buying. Best seller: its product with the most buying.`, `주요 브랜드 ${main.length}개 (관리 › 브랜드 등급). 상위 100위 제품: 오늘, 전체 카테고리. 변화는 ${spanLabel(m.period.days)} 내내 추적한 ${both.size}개 카테고리(${[...both].map(catName).join(", ")})만 기준, 두 열의 기준이 다름. 강세 카테고리: 카테고리 안 판매 점유율이 가장 큰 곳. 베스트셀러: 판매가 가장 많은 제품.`)}>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Brand", "브랜드")}</th><th className="px-2">{tr("Products in the top 100", "상위 100위 제품")}</th><th className="px-2">{tr(`Change since ${dayMonth(win.start)}`, `${dayMonth(win.start)} 대비`)}</th><th className="px-2">{tr("Strongest category (share of that category's buying)", "주력 카테고리 (해당 카테고리 판매 점유율)")}</th><th className="px-2">{tr("Best seller", "베스트셀러")}</th><th className="px-4" /></tr></thead>
            <tbody>{main.map((r) => (
              <Fragment key={r.b}>
                <tr className="border-b border-line/60 align-top">
                  <td className="px-4 py-2.5"><b className="font-medium">{r.b}</b>{tiers.isPinned(r.b) && <span className="ml-1.5 rounded bg-brand px-1.5 py-px text-[10px] font-semibold uppercase text-on-brand">{tr("ours", "자사")}</span>}<div className="text-[11.5px] text-muted">{r.group === "korean" && !tiers.isPinned(r.b) ? tr("K-beauty rival", "K-뷰티 경쟁사") : ORIGIN_LABEL[r.origin] ?? r.origin}</div></td>
                  <td className="px-2 py-2.5 tabular">{r.now}<Basis>{tr(`${r.cats} ${r.cats === 1 ? "category" : "categories"}`, `${r.cats}개 카테고리`)}</Basis></td>
                  <td className={`px-2 py-2.5 tabular ${r.d > 0 ? "text-good" : r.d < 0 ? "text-bad" : "text-muted"}`}>{!r.was7 && !r.now7 ? <span className="text-[12px]">{tr(`none in those ${both.size} lists`, `기존 ${both.size}개 목록엔 없음`)}</span> : <>{r.d === 0 ? tr("no change", "변화 없음") : tr(`${Math.abs(r.d)} ${r.d > 0 ? "more" : "fewer"}`, `${r.d > 0 ? "+" : ""}${r.d}개`)}<Basis>{tr(`${r.was7} → ${r.now7} in those ${both.size} lists`, `기존 ${both.size}개 목록 기준 ${r.was7} → ${r.now7}`)}</Basis></>}</td>
                  <td className="px-2 py-2.5">{r.best ? <>{catName(r.best.c)}: <b className="tabular">{pct(r.best.s!.share, 1)}</b> <span className="text-muted">{tr(`#${r.best.s!.place} of ${r.best.s!.of} brands with buying counted`, `판매 집계 브랜드 ${r.best.s!.of}개 중 ${r.best.s!.place}위`)}</span></> : "–"}</td>
                  <td className="max-w-[280px] px-2 py-2.5">{r.seller ? <>{shortName(r.seller.name, r.b)}<div className="text-[11.5px] text-muted">{catName(r.seller.subcategory)}{r.sellerShare ? tr(` · brand has ${pct(r.sellerShare.share, 1)} of ${catName(r.seller.subcategory).toLowerCase()} buying`, ` · 브랜드 점유율 ${pct(r.sellerShare.share, 1)}`) : ""}</div></> : <span className="text-muted">{tr("no buying counted", "판매 집계 없음")}</span>}</td>
                  <td className="px-4 py-2.5 text-right"><DetailsButton open={open === r.b} onClick={() => setOpen(open === r.b ? null : r.b)} /></td>
                </tr>
                {open === r.b && <tr><td colSpan={6} className="px-4 pb-3"><BrandQuick brand={r.b} /></td></tr>}
              </Fragment>))}</tbody>
          </table>
        </Card>
      </ActionSection>

      <OriginsSection rows={originRows} span={span} />
    </>
  );
}

function OriginsSection({ rows, span }: { rows: { c: string; agg: Map<string, { value: number }>; tot: number; kLeader?: { key: string; value: number } }[]; span: { start: string; end: string } }) {
  return (
    <ActionSection id="origins" kicker={tr("Korean, Indian, global", "국적별 · K-뷰티·인도·글로벌")} title={(() => {
      const live = rows.filter((r) => r.tot > 0); const sh = (r: (typeof rows)[number], o: string) => (r.agg.get(o)?.value ?? 0) / (r.tot || 1);
      if (live.length === 1) { const r = live[0]; return tr(`In ${catName(r.c).toLowerCase()}: Korean ${pct(sh(r, "kbeauty"), 0)}, Indian ${pct(sh(r, "local"), 0)}, global ${pct(sh(r, "global"), 0)} of buying`, `${catName(r.c)}: K-뷰티 ${pct(sh(r, "kbeauty"), 0)}, 인도 ${pct(sh(r, "local"), 0)}, 글로벌 ${pct(sh(r, "global"), 0)}`); }
      const kLead = live.filter((r) => sh(r, "kbeauty") >= Math.max(sh(r, "local"), sh(r, "global"))).map((r) => catName(r.c).toLowerCase());
      return kLead.length ? tr(`Korean brands take the biggest slice only in ${kLead.join(", ")}`, `K-뷰티 브랜드가 가장 큰 곳: ${kLead.join(", ")}`) : tr("Korean brands lead no category's buying", "K-뷰티 브랜드가 선두인 카테고리 없음");
    })()}
      note={tr(`Each bar is one category's share of buying by brand origin (${dayMonth(span.start)}–${dayMonth(span.end)}). Origin is where the brand is from; Indian brands "formulated in Korea" count as Indian.`, `막대 = 카테고리별 브랜드 국적의 판매 점유율 (${dayMonth(span.start)}–${dayMonth(span.end)}). 국적은 브랜드 본사 기준, "한국 제조" 인도 브랜드는 인도로 분류.`)}>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[13px]">
          <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Category", "카테고리")}</th><th className="px-2">{tr("Share of buying by origin", "국적별 판매 점유율")}</th><th className="px-2">{tr("Korean", "K-뷰티")}</th><th className="px-2 pr-4">{tr("Top Korean brand", "K-뷰티 1위")}</th></tr></thead>
          <tbody>{rows.filter((r) => r.tot > 0).map((r) => (
            <tr key={r.c} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-2.5 font-medium">{catName(r.c)}</td>
              <td className="px-2 py-2.5"><OriginBar agg={r.agg} total={r.tot} /></td>
              <td className="px-2 py-2.5 tabular">{pct((r.agg.get("kbeauty")?.value ?? 0) / (r.tot || 1), 1)}</td>
              <td className="px-2 py-2.5 pr-4">{r.kLeader ? <>{r.kLeader.key} <span className="text-muted tabular">{pct(r.kLeader.value / (r.tot || 1))}</span></> : <span className="text-muted">{tr("none", "없음")}</span>}</td>
            </tr>))}</tbody>
        </table>
      </Card>
      <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-ink-2">{ORIGINS.map((o) => <span key={o} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: ORIGIN_COLOR[o].fill }} />{ORIGIN_LABEL[o]}</span>)}</div>
    </ActionSection>
  );
}

/* ------------------------------------------------------------------ one category */

function CategoryView({ cat, m, tiers, span }: { cat: string; m: M; tiers: T; span: { start: string; end: string } }) {
  const [openB, setOpenB] = useState<string | null>(null); const [openP, setOpenP] = useState<string | null>(null);
  const [allBrands, setAllBrands] = useState(false); const [allProducts, setAllProducts] = useState(false);
  const [filters, setFilters] = useState(false); const [origin, setOrigin] = useState<string>("all"); const [q, setQ] = useState("");
  const [find, setFind] = useState<string | null>(null); const [ahead, setAhead] = useState(false);
  const win = m.win!;
  const today = useMemo(() => m.shelf.filter((r) => r.subcategory === cat).sort((a, b) => a.rank - b.rank), [m.shelf, cat]);
  const nykaaShown = Math.max(today.length, ...today.map((r) => r.nykaa_rank ?? r.rank));
  const sh = useMemo(() => shareIn(m.flow, cat), [m.flow, cat]);
  const prev = useMemo(() => (m.prevFlow ? shareIn(m.prevFlow, cat) : null), [m.prevFlow, cat]);
  const brands = useMemo(() => {
    const val = new Map<string, number>(); for (const r of sh.rows) val.set(r.brand, (val.get(r.brand) ?? 0) + r.value);
    const pv = new Map<string, number>(); if (prev) for (const r of prev.rows) pv.set(r.brand, (pv.get(r.brand) ?? 0) + r.value);
    const names = [...new Set([...val.keys(), ...today.map((r) => r.brand)])];
    return names.map((b) => {
      const mine = today.filter((r) => r.brand === b);
      const share = sh.total ? (val.get(b) ?? 0) / sh.total : 0;
      const change = prev && prev.total ? share - (pv.get(b) ?? 0) / prev.total : null;
      const seller = sh.rows.filter((r) => r.brand === b).sort((x, y) => y.value - x.value)[0] ?? null;
      const units = sh.rows.reduce((a, r) => a + r.flow, 0);
      return { b, origin: mine[0]?.origin ?? m.originOf(b), share, units: units ? sh.rows.filter((r) => r.brand === b).reduce((a, r) => a + r.flow, 0) / units : 0, change, places: mine.length, seller };
    }).sort((a, b) => b.share - a.share || b.places - a.places);
  }, [sh, prev, today, m]);
  // "Who is ahead of a brand" (owner, 21 Oct): its place in the buying order and the brands in front of it
  // owner 21 Oct: always opens on Innisfree; top 10, then "…" (opens the brands between), then Innisfree
  const focus = find ?? brands.find((x) => norm(x.b) === norm(ANCHOR_BRAND))?.b ?? null;
  const fi = focus ? brands.findIndex((x) => x.b === focus) : -1; const fx = fi >= 0 ? brands[fi] : null;
  const withBuying = brands.filter((x) => x.share > 0).length;
  const fRank = fx ? (fx.share > 0 ? fi + 1 : null) : null;
  const aheadShare = fx ? brands.slice(0, fx.share > 0 ? fi : withBuying).reduce((a, x) => a + x.share, 0) : 0;
  const fRatings = fx ? sh.rows.filter((r) => r.brand === fx.b).reduce((a, r) => a + r.flow, 0) : 0;
  const upTo = fx ? (fx.share > 0 ? fi : withBuying) : 0; // brands ahead of the focus brand
  const gap = !allBrands && fx && upTo > 10 ? upTo - 10 : 0;
  const shownBrands: (typeof brands[number] | "gap")[] = allBrands ? brands
    : !fx || fi < 10 ? brands.slice(0, 10)
    : [...brands.slice(0, 10), ...(ahead ? brands.slice(10, upTo) : gap ? ["gap" as const] : []), fx];
  const cum = new Map<string, number>(); brands.reduce((a, x) => { cum.set(x.b, a + x.share); return a + x.share; }, 0);
  const products = today.filter((r) => (origin === "all" || r.origin === origin) && (!q || `${r.brand} ${r.name}`.toLowerCase().includes(q.toLowerCase())));
  const shownProducts = allProducts || q || origin !== "all" ? products : products.slice(0, 20);
  const leader = brands[0];
  const ours = brands.find((x) => tiers.isPinned(x.b));
  const rivals = brands.filter((x) => x.origin === "kbeauty" && !tiers.isPinned(x.b));

  return (
    <>
      <section id="facts" className="mt-8 scroll-mt-32"><CategoryGlance cat={cat} part="facts" /></section>

      <ActionSection id="leaders" kicker={tr(`${catName(cat)} · who leads`, `${catName(cat)} · 선두`)}
        title={leader && leader.share > 0 ? tr(`${leader.b} leads ${catName(cat).toLowerCase()} with ${pct(leader.share, 1)} of all buying${rivals[0] ? `; the top K-beauty rival is ${rivals[0].b} (${pct(rivals[0].share, 1)})` : ""}${ours ? `; ${ours.b} ${ours.share > 0 ? `has ${pct(ours.share, 1)}` : "has none counted"}` : ""}`,
          `${catName(cat)} 1위 ${leader.b} (전체 판매의 ${pct(leader.share, 1)})${rivals[0] ? `, K-뷰티 경쟁사 1위 ${rivals[0].b} (${pct(rivals[0].share, 1)})` : ""}${ours ? `, ${ours.b} ${ours.share > 0 ? pct(ours.share, 1) : "집계 없음"}` : ""}`) : tr("Who leads", "선두 브랜드")}
        note={tr(<>Brands ranked by <Def k="ratingFlow">share of buying</Def>: their ₹ out of all brands in {catName(cat).toLowerCase()} (= 100%), {dayMonth(span.start)}–{dayMonth(span.end)}, single products filed under this category. Units = share of new ratings (items, not ₹). Buying decides who is winning; products in the top 100, price and offers explain why (press Details).</>,
          <>{catName(cat)} 전체 브랜드(= 100%) 중 금액 기준 <Def k="ratingFlow">판매 점유율</Def> 순 ({dayMonth(span.start)}–{dayMonth(span.end)}), 이 카테고리로 분류된 단일 제품. 수량 = 신규 평가 점유(금액이 아닌 개수). 승자는 판매로 판단, 상위 100위 제품 수·가격·프로모션은 이유 설명용.</>)}>
        <Card className="mb-3 px-4 py-3 text-[13px]">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="ahead-of" className="text-muted">{tr("Where does a brand stand?", "브랜드 순위 찾기")}</label>
            <select id="ahead-of" value={focus ?? ""} onChange={(e) => { setFind(e.target.value || null); setAhead(false); }} className="rounded-full border border-line bg-page px-3 py-1 text-[12.5px]">
              {!fx && <option value="">–</option>}
              {brands.map((x, i) => <option key={x.b} value={x.b}>{x.share > 0 ? `#${i + 1} ` : ""}{x.b}</option>)}
            </select>
          </div>
          {!fx && <p className="mt-2">{tr(`${ANCHOR_BRAND} has no product in the ${catName(cat).toLowerCase()} top 100 in the window; pick another brand above.`, `${ANCHOR_BRAND}: 기간 중 ${catName(cat)} 상위 100위 제품 없음. 위에서 다른 브랜드 선택.`)}</p>}
          {fx && <p className="mt-2">{fRank
            ? tr(<><b>{fx.b}</b> is <b>#{fRank}</b> of {withBuying} brands with buying counted in {catName(cat).toLowerCase()}, with {pct(fx.share, 1)} (from {fRatings.toLocaleString("en-IN")} new ratings). {fRank > 1 ? <>The {fRank - 1} brand{fRank > 2 ? "s" : ""} ahead hold <b>{pct(aheadShare, 1)}</b>.</> : "No brand is ahead."}</>,
              <><b>{fx.b}</b>: {catName(cat)} 판매 집계 브랜드 {withBuying}개 중 <b>{fRank}위</b> ({pct(fx.share, 1)}, 신규 평가 {fRatings.toLocaleString("ko-KR")}건 기준). {fRank > 1 ? <>앞선 {fRank - 1}개 브랜드 합계 <b>{pct(aheadShare, 1)}</b>.</> : "1위."}</>)
            : tr(<><b>{fx.b}</b> has no buying counted in {catName(cat).toLowerCase()} ({fx.places ? `${fx.places} product${fx.places > 1 ? "s" : ""} in today's top 100, no new ratings counted in the window` : "no product in the top 100 in the window"}); all {withBuying} brands with buying are ahead.</>,
              <><b>{fx.b}</b>: {catName(cat)} 판매 집계 없음 ({fx.places ? `오늘 상위 100위 제품 ${fx.places}개, 기간 중 신규 평가 집계 없음` : "기간 중 상위 100위 제품 없음"}). 판매 집계 브랜드 {withBuying}개 모두 앞섬.</>)}</p>}
          <p className="mt-1 text-[12px] text-muted">{tr(`An estimate from our data, not Nykaa's sales: new ratings each product gained ${dayMonth(span.start)}–${dayMonth(span.end)} × its MRP, counting only products in Nykaa's top 100 of this list. Brands outside the top 100 are not counted, so shares are of the top 100's buying. How sure: splitting the window in two, the top brands' shares moved by 0–3 points and 9 of the top 10 stayed the same; a share built on a few hundred ratings is rougher.`, `Nykaa 매출이 아닌 자체 추정: ${dayMonth(span.start)}–${dayMonth(span.end)} 제품별 신규 평가 수 × 정가(MRP), 이 목록 Nykaa 상위 100위 제품만. 상위 100위 밖 브랜드는 미집계 → 점유율은 상위 100위 판매 기준. 신뢰도: 기간을 둘로 나눠도 상위 브랜드 점유율 변화 0–3%p, 상위 10개 중 9개 동일. 평가 수백 건 기준 점유율은 오차 큼.`)}</p>
        </Card>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">#</th><th className="px-2">{tr("Brand", "브랜드")}</th><th className="px-2">{tr("Share of all buying (est.)", "전체 판매 점유율 (추정)")}</th><th className="px-2">{tr("Running total", "누적")}</th><th className="px-2">{tr("Units", "수량")}</th><th className="px-2">{tr("Products in the top 100", "상위 100위 제품")}</th><th className="px-2">{tr("Best seller", "베스트셀러")}</th><th className="px-4" /></tr></thead>
            <tbody>{shownBrands.map((x) => x === "gap" ? (
              <tr key="gap" className="border-b border-line/60"><td colSpan={8} className="px-4 py-2"><button onClick={() => setAhead(true)} className="text-[12.5px] font-medium text-accent-strong">{tr(`… #11–#${upTo}: ${gap} more brand${gap > 1 ? "s" : ""} ahead of ${fx!.b} (show)`, `… 11–${upTo}위: ${fx!.b} 앞 브랜드 ${gap}개 더 보기`)}</button></td></tr>
            ) : (
              <Fragment key={x.b}>
                <tr className={`border-b border-line/60 align-top ${x.b === focus ? "bg-accent-soft" : tiers.isPinned(x.b) ? "bg-accent-soft/40" : ""}`}>
                  <td className="px-4 py-2.5 tabular text-muted">{x.share > 0 ? brands.indexOf(x) + 1 : "–"}</td>
                  <td className="px-2 py-2.5"><b className="font-medium">{x.b}</b> <span className={`ml-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${ORIGIN_CHIP[x.origin] ?? ORIGIN_CHIP.unknown}`}>{ORIGIN_LABEL[x.origin] ?? x.origin}</span>{tiers.isPinned(x.b) ? <span className="ml-1 rounded bg-brand px-1.5 py-px text-[10px] font-semibold uppercase text-on-brand">{tr("ours", "자사")}</span> : tiers.inSet(x.b) ? <span className="ml-1 text-[10.5px] font-semibold uppercase text-accent-strong">{tiers.group(x.b) === "korean" ? tr("K-beauty rival", "K-뷰티 경쟁사") : tr("main brand", "주요 브랜드")}</span> : null}</td>
                  <td className="px-2 py-2.5 tabular"><div className="flex items-center gap-2"><span className="w-12">{x.share > 0 ? pct(x.share, 1) : "–"}</span><span className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.max(2, (x.share / (leader?.share || 1)) * 120)}px` }} /></div>{x.change !== null && <Basis>{pts(x.change)} {tr("vs the period before", "직전 기간 대비")}</Basis>}</td>
                  <td className="px-2 py-2.5 tabular text-muted">{x.share > 0 ? pct(cum.get(x.b) ?? 0, 1) : "–"}</td>
                  <td className="px-2 py-2.5 tabular text-ink-2">{x.units > 0 ? pct(x.units, 1) : "–"}</td>
                  <td className="px-2 py-2.5 tabular">{x.places}</td>
                  <td className="max-w-[300px] px-2 py-2.5">{x.seller ? <>{shortName(x.seller.name, x.b)} <span className="text-muted tabular">#{x.seller.rankEnd} · {inr(x.seller.price)}</span></> : <span className="text-muted">{x.places ? tr("no buying counted", "판매 집계 없음") : tr("left the top 100", "상위 100위 이탈")}</span>}</td>
                  <td className="px-4 py-2.5 text-right"><DetailsButton open={openB === x.b} onClick={() => setOpenB(openB === x.b ? null : x.b)} /></td>
                </tr>
                {openB === x.b && <tr><td colSpan={8} className="px-4 pb-3"><BrandQuick brand={x.b} cat={cat} /></td></tr>}
              </Fragment>))}</tbody>
          </table>
          {brands.length > 10 && <div className="border-t border-line px-4 py-2.5"><button onClick={() => setAllBrands(!allBrands)} className="text-[12.5px] font-medium text-accent-strong">{allBrands ? tr("Show the top 10", "상위 10개만") : tr(`Show all ${brands.length} brands`, `브랜드 ${brands.length}개 모두 보기`)}</button></div>}
        </Card>
      </ActionSection>

      <ActionSection id="products" kicker={tr(`${catName(cat)} · top products`, `${catName(cat)} · 상위 제품`)} title={tr(`Today's top ${today.length} ${catName(cat).toLowerCase()} products, in Nykaa's order`, `오늘의 ${catName(cat)} 상위 ${today.length}개 제품 (Nykaa 순서)`)}
        note={<>{tr(`Collected ${m.latest ? dayMonth(m.latest) : ""}. Nykaa's page shows ${nykaaShown} products; ${today.length} are filed by Nykaa under ${catName(cat).toLowerCase()} and are ranked here among themselves (the rest count in their own category). Nykaa's own position is under the rank when different. Share = share of all ${catName(cat).toLowerCase()} buying (${dayMonth(span.start)}–${dayMonth(span.end)}).`, `${m.latest ? dayMonth(m.latest) : ""} 수집. Nykaa 페이지 제품 ${nykaaShown}개 중 Nykaa가 ${catName(cat)}로 분류한 ${today.length}개만 그들끼리 순위 (나머지는 자기 카테고리에서 집계). Nykaa 페이지 순위가 다르면 순위 아래 표시. 점유율 = ${catName(cat)} 전체 판매 중 비중 (${dayMonth(span.start)}–${dayMonth(span.end)}).`)} <a href={CATEGORY_URL[cat]} target="_blank" rel="noreferrer" className="underline underline-offset-2">{tr("This list on Nykaa ↗", "Nykaa에서 보기 ↗")}</a> · <a href={`/top100/?cat=${cat}`} className="underline underline-offset-2">{tr("All 100 places, with filters →", "100위 전체·필터 →")}</a></>}
        right={<button onClick={() => setFilters(!filters)} className="rounded-full px-3 py-1 text-[12.5px] text-ink-2 ring-1 ring-line hover:bg-sunken">{filters ? tr("Hide filters", "필터 닫기") : tr("Filter", "필터")}</button>}>
        <Card className="overflow-x-auto">
          {filters && <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
            <input id="product-filter" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Brand or product", "브랜드 또는 제품")} className="w-56 rounded-full border border-line bg-page px-3 py-1 text-[12.5px] outline-none focus:border-accent-strong" />
            {[["all", tr("All origins", "전체")], ["kbeauty", ORIGIN_LABEL.kbeauty], ["local", ORIGIN_LABEL.local], ["global", ORIGIN_LABEL.global]].map(([k, l]) => <button key={k} onClick={() => setOrigin(k)} className={pill(origin === k, "sm")}>{l}</button>)}
          </div>}
          <table className="w-full min-w-[900px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5 text-right">#</th><th className="px-2">{tr("Product", "제품")}</th><th className="px-2">{tr("Price", "가격")}</th><th className="px-2">{tr("Rating", "별점")}</th><th className="px-2">{tr("Share of buying", "판매 점유율")}</th><th className="px-2">{tr("Tags", "표시")}</th><th className="px-4" /></tr></thead>
            <tbody>{shownProducts.map((r: ShelfRow) => { const s = sh.of(r.product_id); const k = r.product_id; return (
              <Fragment key={k}>
                <tr className={`border-b border-line/60 align-top ${tiers.isPinned(r.brand) ? "bg-accent-soft/40" : ""}`}>
                  <td className="px-4 py-2.5 text-right font-semibold tabular">{r.rank}{r.nykaa_rank && r.nykaa_rank !== r.rank ? <div className="text-[10.5px] font-normal text-muted">{tr(`Nykaa #${r.nykaa_rank}`, `Nykaa ${r.nykaa_rank}위`)}</div> : null}</td>
                  <td className="max-w-[380px] px-2 py-2.5"><b className="font-medium">{r.brand}</b> <span className={`ml-1 rounded-full px-1.5 py-px text-[10px] font-semibold ${ORIGIN_CHIP[r.origin] ?? ORIGIN_CHIP.unknown}`}>{ORIGIN_LABEL[r.origin]}</span><div className="leading-snug text-ink-2">{shortName(r.name, r.brand)}</div></td>
                  <td className="whitespace-nowrap px-2 py-2.5 tabular">{inr(r.price)}{r.mrp && r.price && r.mrp > r.price ? <div className="text-[11.5px] text-muted">{tr(`${Math.round((1 - r.price / r.mrp) * 100)}% off ${inr(r.mrp)}`, `정가 ${inr(r.mrp)}에서 ${Math.round((1 - r.price / r.mrp) * 100)}%`)}</div> : null}</td>
                  <td className="whitespace-nowrap px-2 py-2.5 tabular">{r.rating ? <>★ {r.rating.toFixed(1)}</> : "–"}</td>
                  <td className="px-2 py-2.5 tabular">{isCombo(r.name) ? <span className="text-[11.5px] text-muted">{tr("combo, not counted", "콤보, 제외")}</span> : s ? <>{pct(s.share, 1)}<div className="text-[11px] text-muted">{tr(`${pct(s.units, 1)} of units`, `수량 ${pct(s.units, 1)}`)}{s.poolSize > 1 ? tr(` · shared ratings (${s.poolSize})`, ` · 평가 공유(${s.poolSize})`) : ""}</div></> : "–"}</td>
                  <td className="px-2 py-2.5"><div className="flex flex-wrap gap-1">
                    {r.is_ad && <span className="rounded bg-[#fff4d6] px-1.5 text-[10.5px] font-semibold text-[#8a6100]">{tr("SPONSORED", "광고")}</span>}
                    {r.has_offer && <span className="rounded bg-warn-soft px-1.5 text-[10.5px] font-semibold text-warn">{tr("OFFER", "프로모션")}</span>}
                    {r.is_bestseller && <span className="rounded bg-[#fce8f1] px-1.5 text-[10.5px] font-semibold text-[#b03a72]">{tr("BESTSELLER", "베스트셀러")}</span>}
                    {r.is_new_tag && <span className="rounded bg-[#e6effb] px-1.5 text-[10.5px] font-semibold text-[#1f5fae]">{tr("NEW", "신상품")}</span>}
                  </div></td>
                  <td className="px-4 py-2.5 text-right"><DetailsButton open={openP === k} onClick={() => setOpenP(openP === k ? null : k)} /></td>
                </tr>
                {openP === k && <tr><td colSpan={7} className="px-4 pb-3"><ProductQuick pid={r.product_id} cat={cat} /></td></tr>}
              </Fragment>); })}</tbody>
          </table>
          {!shownProducts.length && <p className="px-5 py-6 text-[13px] text-muted">{tr("Nothing matches.", "일치하는 제품 없음.")}</p>}
          {!q && origin === "all" && products.length > 20 && <div className="border-t border-line px-4 py-2.5"><button onClick={() => setAllProducts(!allProducts)} className="text-[12.5px] font-medium text-accent-strong">{allProducts ? tr("Show the top 20", "상위 20개만") : tr(`Show all ${products.length}`, `${products.length}개 모두 보기`)}</button></div>}
        </Card>
      </ActionSection>

      <ActionSection id="moved" kicker={tr(`${catName(cat)} · what moved and why`, `${catName(cat)} · 변동과 이유`)} title={tr(`Biggest moves over the ${spanLabel(m.period.days)}, with what changed at the same time`, `${spanLabel(m.period.days)} 최대 변동과 같은 시기의 변화`)} right={<PeriodBar />}>
        <CategoryGlance cat={cat} part="moves" />
      </ActionSection>

      <OriginsSection rows={[{ c: cat, agg: aggregate(sh.rows, (r) => r.origin), tot: sh.total, kLeader: [...aggregate(sh.rows.filter((r) => r.origin === "kbeauty"), (r) => r.brand).values()].sort((a, b) => b.value - a.value)[0] }]} span={span} />
      <Basis className="mt-2">{tr(`${win.days.length} days collected in the period; ${catName(cat).toLowerCase()} tracked since ${dayMonth(m.ix.catStart.get(cat) ?? win.start)}.`, `기간 중 수집 ${win.days.length}일, ${catName(cat)} 추적 시작 ${dayMonth(m.ix.catStart.get(cat) ?? win.start)}.`)}</Basis>
    </>
  );
}

export default function Page() {
  return <AuthGate><MarketPage /></AuthGate>;
}
