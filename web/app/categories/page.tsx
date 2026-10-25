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
import { BrandQuick, DetailsButton } from "@/components/Quick";
import { ANCHOR_BRAND, ORIGIN_COLOR, ORIGIN_LABEL, norm } from "@/lib/brands";
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_URL, inr, pct, shortName, signed } from "@/lib/format";
import { aggregate } from "@/lib/market";
import { shareIn } from "@/lib/profile";
import { spanLabel } from "@/lib/period";
import { useTiers } from "@/lib/tiers";
import { useMarket } from "@/lib/useMarket";
import { dayMonth, monthsName, tr } from "@/lib/i18n";
import { ScopeLine } from "@/components/Scope";
import { useScope } from "@/lib/scope";

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
  const m = useMarket();
  const known = useMemo(() => [...new Set(m.shelf.map((r) => r.brand))], [m.shelf]);
  const tiers = useTiers(known);
  const [cat, setCat] = useState<string>(() => { const c = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("cat"); return c && CATEGORIES.includes(c) ? c : "all"; });
  useEffect(() => { window.history.replaceState(null, "", cat === "all" ? window.location.pathname : `?cat=${cat}`); }, [cat]);


  if (!m.ready || !m.win) return <Shell active="Top by category"><PageHead eyebrow={tr("Market", "시장")} title={tr("Who is winning each category", "카테고리별 선두 브랜드")} sub="" /><Loading what={tr("the market", "시장")} /></Shell>;
  const span = m.flowSpan!;

  const NAV: NavItem[] = cat === "all"
    ? [{ id: "snapshot", label: tr("Category snapshot", "카테고리 요약") }, { id: "origins", label: tr("Korean, Indian, global", "국적별 · K-뷰티·인도·글로벌") }]
    : [{ id: "facts", label: tr("At a glance", "한눈에") }, { id: "leaders", label: tr("Who leads", "선두 브랜드") }, { id: "moved", label: tr("What moved and why", "변동과 이유") }, { id: "origins", label: tr("Korean, Indian, global", "국적별 · K-뷰티·인도·글로벌") }];

  return (
    <Shell active="Top by category" asOf={m.latest ?? undefined}>
      <PageHead eyebrow={tr("Market", "시장")} title={tr("Who is winning each category", "카테고리별 선두 브랜드")}
        sub={tr("Pick one category, or all of them: how big each category is, who leads it, what moved and how Korean, Indian and global brands split it. Press \"Details\" on any row to see more without leaving the page.", "카테고리 하나 또는 전체 선택: 카테고리 규모, 선두 브랜드, 변동, K-뷰티·인도·글로벌 비중. 어느 행이든 \"자세히\"를 누르면 이 페이지에서 바로 더 보기.")} />
      <ScopeLine uses={["selling", "top100"]} measure={tr(`share of buying (reviews ${dayMonth(span.start)}–${dayMonth(span.end)}, turned into buyers with each brand's review rate, × MRP, within one category) and places in each top 100; brand counts come from Nykaa's brand filter.`, `판매 점유율(${dayMonth(span.start)}–${dayMonth(span.end)} 리뷰를 브랜드별 리뷰 작성률로 구매자 수로 환산 × 정가(MRP), 카테고리 안)과 상위 100위 순위. 브랜드 수는 Nykaa 브랜드 필터 기준.`)} />
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label={tr("Category", "카테고리")}>
        <button className={pill(cat === "all")} onClick={() => setCat("all")}>{tr(`All ${CATEGORIES.length} categories`, `${CATEGORIES.length}개 카테고리 전체`)}</button>
        {CATEGORIES.map((c) => <button key={c} className={pill(cat === c)} onClick={() => setCat(c)}>{catName(c)}</button>)}
      </div>
      <SectionNav items={NAV} />
      {cat === "all" ? <AllView m={m} onPick={setCat} span={span} />
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

function AllView({ m, onPick, span }: { m: M; onPick: (c: string) => void; span: { start: string; end: string } }) {
  const [open5, setOpen5] = useState<string | null>(null);
  const scope = useScope();
  // owner 22 Oct 2026: categories ranked by their part of all buying in our 15 (= 100%); per category the brands in its
  // top 100, the leader, the leading Korean brand, the top 5 (click for names) and the best seller (links to Nykaa).
  // "Brands that sell here" moves to the category's own view; review growth and Main brands leave this page.
  const grand = m.flow.filter((r) => CATEGORIES.includes(r.subcategory)).reduce((a, r) => a + r.value, 0);
  const rows = CATEGORIES.map((c) => {
    const sh = shareIn(m.flow, c); const top = sh.rows[0];
    const ranked = [...aggregate(sh.rows, (r) => r.brand).values()].sort((a, b) => b.value - a.value);
    const kRanked = [...aggregate(sh.rows.filter((r) => r.origin === "kbeauty"), (r) => r.brand).values()].sort((a, b) => b.value - a.value);
    const of = (v: number) => (sh.total ? v / sh.total : 0);
    return { c, size: grand ? sh.total / grand : 0, inTop: new Set(m.shelf.filter((r) => r.subcategory === c).map((r) => norm(r.brand))).size,
      leader: ranked[0] ? { b: ranked[0].key, s: of(ranked[0].value) } : null, kLeader: kRanked[0] ? { b: kRanked[0].key, s: of(kRanked[0].value) } : null,
      top5: ranked.slice(0, 5).map((x) => ({ b: x.key, s: of(x.value) })), top, topShare: top ? of(top.value) : null, tracked: !!sh.total };
  }).sort((a, b) => b.size - a.size);
  const maxSize = Math.max(1e-9, ...rows.map((r) => r.size));
  const skin = rows.filter((r) => (CATEGORY_URL[r.c] ?? "").includes("/skin/")).reduce((a, r) => a + r.size, 0);
  const originRows = CATEGORIES.map((c) => {
    const rs = m.flow.filter((r) => r.subcategory === c); const tot = rs.reduce((a, r) => a + r.value, 0);
    const agg = aggregate(rs, (r) => r.origin);
    const kLeader = [...aggregate(rs.filter((r) => r.origin === "kbeauty"), (r) => r.brand).values()].sort((a, b) => b.value - a.value)[0];
    return { c, agg, tot, kLeader };
  }).sort((a, b) => b.tot - a.tot);

  return (
    <>
      <ActionSection id="snapshot" kicker={tr("Category snapshot", "카테고리 요약")}
        title={rows[0] ? tr(`${catName(rows[0].c)} is the biggest of our ${CATEGORIES.length} categories with ${pct(rows[0].size, 0)} of all buying; ${scope?.selling.brands ?? "–"} brands sell in them and ${scope?.top100.brands ?? "–"} reach a top 100 today`,
          `추적 ${CATEGORIES.length}개 카테고리 중 최대: ${catName(rows[0].c)} (전체 판매의 ${pct(rows[0].size, 0)}). 판매 브랜드 ${scope?.selling.brands ?? "–"}개, 오늘 상위 100위 진입 ${scope?.top100.brands ?? "–"}개`) : tr("Category snapshot", "카테고리 요약")}
        note={tr(<>Categories ranked by their part of all <Def k="ratingFlow">buying</Def> in our {CATEGORIES.length} categories together (= 100%), {monthsName(span.start, span.end)}: skincare {pct(skin, 0)}, makeup {pct(1 - skin, 0)}. Brands in the top 100 = brands with a product in that category&rsquo;s top 100 today (how many brands sell in each category at any rank is on the category&rsquo;s own page). Leader, leading Korean brand and top 5: share of the category. Click the top-5 figure for the names; the best seller opens on Nykaa.</>,
          <>추적 {CATEGORIES.length}개 카테고리 전체 <Def k="ratingFlow">판매</Def>(= 100%) 중 비중 순, {monthsName(span.start, span.end)}: 스킨케어 {pct(skin, 0)}, 메이크업 {pct(1 - skin, 0)}. 상위 100위 브랜드 = 오늘 해당 카테고리 상위 100위에 제품이 있는 브랜드 (순위와 무관한 전체 판매 브랜드 수는 카테고리 페이지에). 선두·K-뷰티 1위·상위 5개: 카테고리 점유율. 상위 5개 수치를 누르면 브랜드명, 베스트셀러는 Nykaa에서 열림.</>)}>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted">
              <th className="px-4 py-2.5">#</th><th className="px-2">{tr("Category", "카테고리")}</th><th className="px-2">{tr("Share of all buying", "전체 판매 비중")}</th><th className="px-2">{tr("Brands in the top 100", "상위 100위 브랜드")}</th>
              <th className="px-2">{tr("Leading brand", "선두 브랜드")}</th><th className="px-2">{tr("Leading Korean brand", "K-뷰티 1위")}</th><th className="px-2">{tr("Top 5 brands", "상위 5개")}</th><th className="px-2">{tr("Best-selling product", "최다 판매 제품")}</th><th className="px-4" /></tr></thead>
            <tbody>{rows.map((r, i) => (
              <Fragment key={r.c}>
                <tr className="border-b border-line/60 align-top">
                  <td className="px-4 py-2.5 tabular text-muted">{r.tracked ? i + 1 : "–"}</td>
                  <td className="px-2 py-2.5 font-medium">{catName(r.c)}</td>
                  <td className="px-2 py-2.5">{r.tracked ? <span className="flex items-center gap-2"><b className="w-12 tabular">{pct(r.size, 1)}</b><span className="h-2 w-24 rounded-full bg-sunken"><span className="block h-2 rounded-full bg-brand/70" style={{ width: `${(r.size / maxSize) * 100}%` }} /></span></span> : <span className="text-muted">–</span>}</td>
                  <td className="px-2 py-2.5 tabular">{r.inTop}</td>
                  <td className="px-2 py-2.5">{r.leader ? <><b className="font-medium">{r.leader.b}</b> <span className="tabular text-ink-2">{pct(r.leader.s, 0)}</span></> : <Missing>{tr("no buying counted", "판매 집계 없음")}</Missing>}</td>
                  <td className="px-2 py-2.5">{r.kLeader ? <>{r.kLeader.b} <span className="tabular text-ink-2">{pct(r.kLeader.s, 1)}</span></> : <span className="text-muted">{tr("none", "없음")}</span>}</td>
                  <td className="px-2 py-2.5 tabular">{r.top5.length ? <button type="button" onClick={() => setOpen5(open5 === r.c ? null : r.c)} aria-expanded={open5 === r.c} className="rounded-full px-2 py-0.5 font-medium text-accent-strong ring-1 ring-line hover:bg-sunken">{pct(r.top5.reduce((a, x) => a + x.s, 0), 0)} {open5 === r.c ? "▴" : "▾"}</button> : "–"}</td>
                  <td className="max-w-[300px] px-2 py-2.5">{r.top ? <>{r.top.url ? <a href={r.top.url} target="_blank" rel="noreferrer" className="hover:underline">{r.top.brand} {shortName(r.top.name, r.top.brand)} ↗</a> : <>{r.top.brand} {shortName(r.top.name, r.top.brand)}</>} <span className="tabular text-muted">{pct(r.topShare, 1)}</span></> : "–"}</td>
                  <td className="px-4 py-2.5 text-right"><button onClick={() => { onPick(r.c); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-full px-2.5 py-0.5 text-[12px] font-medium text-accent-strong ring-1 ring-line hover:bg-sunken">{tr("Open ›", "열기 ›")}</button></td>
                </tr>
                {open5 === r.c && <tr className="border-b border-line/60"><td /><td colSpan={8} className="px-2 pb-3 pt-1">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">{r.top5.map((x, j) => <span key={x.b}><span className="text-muted">#{j + 1}</span> <b className="font-medium">{x.b}</b> <span className="tabular text-ink-2">{pct(x.s, 1)}</span></span>)}</div>
                </td></tr>}
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
  const [openB, setOpenB] = useState<string | null>(null);
  const [allBrands, setAllBrands] = useState(false);
  const [find, setFind] = useState<string | null>(null); const [ahead, setAhead] = useState(false);
  const win = m.win!;
  const today = useMemo(() => m.shelf.filter((r) => r.subcategory === cat).sort((a, b) => a.rank - b.rank), [m.shelf, cat]);
  const sh = useMemo(() => shareIn(m.flow, cat), [m.flow, cat]);
  const prevMonths = m.rmonths ? monthsName(m.rmonths.prev[0], m.rmonths.prev[m.rmonths.prev.length - 1]) : monthsName(span.start, span.end);
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
  const fReviews = fx ? sh.rows.filter((r) => r.brand === fx.b).reduce((a, r) => a + (r.reviews ?? 0), 0) : 0;
  const upTo = fx ? (fx.share > 0 ? fi : withBuying) : 0; // brands ahead of the focus brand
  const gap = !allBrands && fx && upTo > 10 ? upTo - 10 : 0;
  const shownBrands: (typeof brands[number] | "gap")[] = allBrands ? brands
    : !fx || fi < 10 ? brands.slice(0, 10)
    : [...brands.slice(0, 10), ...(ahead ? brands.slice(10, upTo) : gap ? ["gap" as const] : []), fx];
  const top10 = brands.slice(0, 10).reduce((a, x) => a + x.share, 0);
  const leader = brands[0];
  const ours = brands.find((x) => tiers.isPinned(x.b));
  const rivals = brands.filter((x) => x.origin === "kbeauty" && !tiers.isPinned(x.b));

  return (
    <>
      <section id="facts" className="mt-8 scroll-mt-32"><CategoryGlance cat={cat} part="facts" /></section>

      <ActionSection id="leaders" kicker={tr(`${catName(cat)} · who leads`, `${catName(cat)} · 선두`)}
        title={leader && leader.share > 0 ? tr(`${leader.b} leads ${catName(cat).toLowerCase()} with ${pct(leader.share, 1)} of all buying${rivals[0] ? `; the top K-beauty rival is ${rivals[0].b} (${pct(rivals[0].share, 1)})` : ""}${ours ? `; ${ours.b} ${ours.share > 0 ? `has ${pct(ours.share, 1)}` : "has none counted"}` : ""}`,
          `${catName(cat)} 1위 ${leader.b} (전체 판매의 ${pct(leader.share, 1)})${rivals[0] ? `, K-뷰티 경쟁사 1위 ${rivals[0].b} (${pct(rivals[0].share, 1)})` : ""}${ours ? `, ${ours.b} ${ours.share > 0 ? pct(ours.share, 1) : "집계 없음"}` : ""}`) : tr("Who leads", "선두 브랜드")}
        note={tr(<>Brands ranked by <Def k="ratingFlow">share of buying</Def>: their ₹ out of all brands in {catName(cat).toLowerCase()} (= 100%), {dayMonth(span.start)}–{dayMonth(span.end)}, single products filed under this category. Buying decides who is winning; products in the top 100, price and offers explain why (press Details).</>,
          <>{catName(cat)} 전체 브랜드(= 100%) 중 금액 기준 <Def k="ratingFlow">판매 점유율</Def> 순 ({dayMonth(span.start)}–{dayMonth(span.end)}), 이 카테고리로 분류된 단일 제품. 승자는 판매로 판단, 상위 100위 제품 수·가격·프로모션은 이유 설명용.</>)}>
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
            ? tr(<><b>{fx.b}</b> is <b>#{fRank}</b> of {withBuying} brands with buying counted in {catName(cat).toLowerCase()}, with {pct(fx.share, 1)} (from {fReviews.toLocaleString("en-IN")} reviews). {fRank > 1 ? <>The {fRank - 1} brand{fRank > 2 ? "s" : ""} ahead hold <b>{pct(aheadShare, 1)}</b>.</> : "No brand is ahead."}</>,
              <><b>{fx.b}</b>: {catName(cat)} 판매 집계 브랜드 {withBuying}개 중 <b>{fRank}위</b> ({pct(fx.share, 1)}, 리뷰 {fReviews.toLocaleString("ko-KR")}건 기준). {fRank > 1 ? <>앞선 {fRank - 1}개 브랜드 합계 <b>{pct(aheadShare, 1)}</b>.</> : "1위."}</>)
            : tr(<><b>{fx.b}</b> has no buying counted in {catName(cat).toLowerCase()} ({fx.places ? `${fx.places} product${fx.places > 1 ? "s" : ""} in today's top 100, no reviews read yet` : "no product in the top 100 today"}); all {withBuying} brands with buying are ahead.</>,
              <><b>{fx.b}</b>: {catName(cat)} 판매 집계 없음 ({fx.places ? `오늘 상위 100위 제품 ${fx.places}개, 리뷰 미수집` : "오늘 상위 100위 제품 없음"}). 판매 집계 브랜드 {withBuying}개 모두 앞섬.</>)}</p>}
          <p className="mt-1 text-[12px] text-muted">{tr(`An estimate from our data, not Nykaa's sales: each product's reviews ${dayMonth(span.start)}–${dayMonth(span.end)}, divided by how many of its brand's buyers write a review (learned 13 Sep–9 Oct, when Nykaa still showed rating counts), × its MRP; only products in Nykaa's top 100 of this list. How sure: tested on that month, a brand's share was within about 2 points; a share built on a few dozen reviews is rougher.`, `Nykaa 매출이 아닌 자체 추정: ${dayMonth(span.start)}–${dayMonth(span.end)} 제품별 리뷰 ÷ 브랜드 구매자 중 리뷰 작성 비율(Nykaa가 평가 수를 보여주던 9월 13일–10월 9일 기준) × 정가(MRP), 이 목록 상위 100위 제품만. 신뢰도: 해당 기간 검증 시 브랜드 점유율 오차 약 2%p, 리뷰 수십 건 기준 점유율은 오차 큼.`)}</p>
        </Card>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">#</th><th className="px-2">{tr("Brand", "브랜드")}</th><th className="px-2">{tr("Share of all buying (est.)", "전체 판매 점유율 (추정)")}</th><th className="px-2">{tr("Products in the top 100", "상위 100위 제품")}</th><th className="px-2">{tr("Best seller", "베스트셀러")}</th><th className="px-4" /></tr></thead>
            <tbody>{shownBrands.map((x) => x === "gap" ? (
              <tr key="gap" className="border-b border-line/60"><td colSpan={6} className="px-4 py-2"><button onClick={() => setAhead(true)} className="text-[12.5px] font-medium text-accent-strong">{tr(`… #11–#${upTo}: ${gap} more brand${gap > 1 ? "s" : ""} ahead of ${fx!.b} (show)`, `… 11–${upTo}위: ${fx!.b} 앞 브랜드 ${gap}개 더 보기`)}</button></td></tr>
            ) : (
              <Fragment key={x.b}>
                <tr className={`border-b border-line/60 align-top ${x.b === focus ? "bg-accent-soft" : tiers.isPinned(x.b) ? "bg-accent-soft/40" : ""}`}>
                  <td className="px-4 py-2.5 tabular text-muted">{x.share > 0 ? brands.indexOf(x) + 1 : "–"}</td>
                  <td className="px-2 py-2.5"><b className="font-medium">{x.b}</b> <span className={`ml-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${ORIGIN_CHIP[x.origin] ?? ORIGIN_CHIP.unknown}`}>{ORIGIN_LABEL[x.origin] ?? x.origin}</span>{tiers.isPinned(x.b) ? <span className="ml-1 rounded bg-brand px-1.5 py-px text-[10px] font-semibold uppercase text-on-brand">{tr("ours", "자사")}</span> : tiers.inSet(x.b) ? <span className="ml-1 text-[10.5px] font-semibold uppercase text-accent-strong">{tiers.group(x.b) === "korean" ? tr("K-beauty rival", "K-뷰티 경쟁사") : tr("main brand", "주요 브랜드")}</span> : null}</td>
                  <td className="px-2 py-2.5 tabular"><div className="flex items-center gap-2"><span className="w-12">{x.share > 0 ? pct(x.share, 1) : "–"}</span><span className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.max(2, (x.share / (leader?.share || 1)) * 120)}px` }} /></div>{x.change !== null && <Basis>{pts(x.change)} {tr(`vs ${prevMonths}`, `${prevMonths} 대비`)}</Basis>}</td>
                  <td className="px-2 py-2.5 tabular">{x.places}</td>
                  <td className="max-w-[300px] px-2 py-2.5">{x.seller ? <>{shortName(x.seller.name, x.b)} <span className="text-muted tabular">#{x.seller.rankEnd} · {inr(x.seller.price)}</span></> : <span className="text-muted">{x.places ? tr("no buying counted", "판매 집계 없음") : tr("left the top 100", "상위 100위 이탈")}</span>}</td>
                  <td className="px-4 py-2.5 text-right"><DetailsButton open={openB === x.b} onClick={() => setOpenB(openB === x.b ? null : x.b)} /></td>
                </tr>
                {openB === x.b && <tr><td colSpan={6} className="px-4 pb-3"><BrandQuick brand={x.b} cat={cat} /></td></tr>}
              </Fragment>))}</tbody>
          </table>
          {brands.length > 10 && <div className="border-t border-line px-4 py-2.5 text-[12.5px] text-ink-2">{tr(<>The top 10 together hold <b>{pct(top10, 0)}</b> of {catName(cat).toLowerCase()} buying. </>, <>상위 10개 브랜드 합계 <b>{pct(top10, 0)}</b>. </>)}<button onClick={() => setAllBrands(!allBrands)} className="text-[12.5px] font-medium text-accent-strong">{allBrands ? tr("Show the top 10", "상위 10개만") : tr(`Show all ${brands.length} brands`, `브랜드 ${brands.length}개 모두 보기`)}</button></div>}
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
