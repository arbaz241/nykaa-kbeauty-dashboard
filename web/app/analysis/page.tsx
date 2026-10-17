"use client";

import { useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { DetailHead, Missing, Opens, Points, useDetail, type DetailContent } from "@/components/Detail";
import EventLog from "@/components/EventLog";
import KBeautyOverview from "@/components/KBeautyOverview";
import OpportunityMap from "@/components/analysis/OpportunityMap";
import { useOpenProduct } from "@/components/ProductDrawer";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import Shell from "@/components/Shell";
import { Basis, BrandSelect, Def, TieredList } from "@/components/Tiered";
import { Card, Loading, PageHead, Verdict } from "@/components/ui";
import { norm } from "@/lib/brands";
import { useAvailability, useBrandDaily, useBrandShares, useCatalog, useCategoryCoverage, useDemand, useMovement, useReviewMonths, useSearch, useSearchHistory, useShelf } from "@/lib/data";
import { BANDS, QUAD, categoryMap, demandRows, demandWindow, rangeGrid, rankOn, scoreboard, type CategoryCell, type DemandRow, type GapCell, type ScoreRow } from "@/lib/analysis";
import { buildFindings, type Finding } from "@/lib/findings";
import { CATEGORY_LABEL, compact, inr, shortName } from "@/lib/format";
import { heroProducts } from "@/lib/hero";
import { useTiers } from "@/lib/tiers";
import type { CatalogRow, SearchRow } from "@/lib/types";
import { push } from "@/lib/group";
import { bandLabel } from "@/lib/analysis";
import { dayMonth, josa, tr } from "@/lib/i18n";

/** Analysis: the landing page, as one story (Round 3 plan, owner decisions 12 Oct 2026).
 *  Verdict → scoreboard vs the focus set → where the anchor wins and loses by category → what changed →
 *  hero products → range gaps → next steps → events. Every number carries what it is compared against. */

const NAV = (): NavItem[] => [
  { id: "kbeauty", label: tr("K-beauty on Nykaa", "Nykaa의 K-뷰티") }, { id: "summary", label: tr("Brand brief", "브랜드 보고") }, { id: "standing", label: tr("Scoreboard", "스코어보드") }, { id: "portfolio", label: tr("By category", "카테고리별") },
  { id: "changes", label: tr("What changed", "변화") }, { id: "heroes", label: tr("Hero products", "히어로 제품") }, { id: "gaps", label: tr("Range gaps", "라인업 공백") },
  { id: "next", label: tr("Next steps", "다음 단계") }, { id: "events", label: tr("Events", "이벤트") },
];
const THEMES = (): { id: string; label: string; test: (f: Finding) => boolean }[] => [
  { id: "shelf", label: tr("Shelf position", "진열 순위"), test: (f) => /^(climb|slip|entry|origin)/.test(f.id) },
  { id: "demand", label: tr("Demand", "수요"), test: (f) => /^(demand|fade)/.test(f.id) },
  { id: "search", label: tr("Search & ads", "검색·광고"), test: (f) => f.id.startsWith("paid") },
  { id: "price", label: tr("Price", "가격"), test: (f) => f.id.startsWith("price") },
  { id: "stock", label: tr("Stock", "재고"), test: (f) => f.id.startsWith("oos") },
];
const TONE_DOT = { threat: "bg-bad", opening: "bg-good", watch: "bg-muted" } as const;
const TONE_WORD = { get threat() { return tr("Threat", "위협"); }, get opening() { return tr("Opening", "기회"); }, get watch() { return tr("Watch", "주시"); } };
const SOURCE_WORD = (s: Finding["source"]) => tr(s, { Market: "시장", Demand: "수요", "Search & Ads": "검색·광고", Compare: "경쟁 분석" }[s]);
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const signed = (v: number | null) => (v === null ? tr("n/a", "해당 없음") : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
const pts = (v: number) => (Math.abs(v) < 0.0005 ? tr("no change", "변화 없음") : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}${tr(" pts", "%p")}`);
const dayLabel = (d: string) => (d ? dayMonth(d) : "");
const moved = (n: number) => (n === 0 ? tr("no change", "변화 없음") : `${n > 0 ? "+" : ""}${n}`);
const cat = (c: string | null | undefined) => (c ? CATEGORY_LABEL[c] ?? c : tr("uncategorised", "미분류"));
const same = (a: string, b: string) => norm(a) === norm(b);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

export default function AnalysisPage() {
  return <AuthGate><Analysis /></AuthGate>;
}

function Analysis() {
  const shelf = useShelf(); const movement = useMovement(); const shares = useBrandShares(); const demand = useDemand(); const months = useReviewMonths();
  const daily = useBrandDaily(); const availability = useAvailability(); const catalog = useCatalog(); const coverage = useCategoryCoverage(); const search = useSearch(); const searchHist = useSearchHistory();
  const detail = useDetail(); const open = useOpenProduct();

  const known = useMemo(() => [...new Set([...(shelf.data ?? []).map((r) => r.brand), ...(months.data ?? []).map((m) => m.brand)])].sort(), [shelf.data, months.data]);
  const tiers = useTiers(known);
  // plan v2: the brand page links here with ?brand=, so the brief opens on that brand
  const [picked, setPicked] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("brand")));
  const anchor = picked ?? tiers.pinned;
  const deep = tiers.inSet(anchor);
  const [scope, setScope] = useState<"set" | "all">("set");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [openTheme, setOpenTheme] = useState<string | null>(null);
  const win = demandWindow();

  const ready = !!(shelf.data && movement.data && shares.data && demand.data && months.data && daily.data && catalog.data && searchHist.data);
  const rows = useMemo(() => (ready ? demandRows(months.data!, demand.data!, shelf.data!, catalog.data!) : []), [ready, months.data, demand.data, shelf.data, catalog.data]);
  const complete = useMemo(() => {
    // every product whose own history covers both windows (variants included), for the demand rules
    const cov = new Map<string, string>(); for (const m of months.data ?? []) if (!cov.has(m.product_id) || m.coverage_start > cov.get(m.product_id)!) cov.set(m.product_id, m.coverage_start);
    return new Set([...cov.entries()].filter(([, c]) => c <= win.priorMonths[0]).map(([p]) => p));
  }, [months.data, win.priorMonths]);
  const setBrands = useMemo(() => [...new Set([tiers.pinned, ...tiers.focus, anchor])], [tiers, anchor]);
  const board = useMemo(() => {
    if (!ready) return null;
    const others = known.filter((b) => !setBrands.some((x) => same(x, b)));
    return scoreboard([...setBrands, ...others], daily.data!, shares.data!, rows, searchHist.data!);
  }, [ready, known, setBrands, daily.data, shares.data, rows, searchHist.data]);
  const setRows = useMemo(() => (board ? board.rows.filter((r) => setBrands.some((b) => same(b, r.brand))) : []), [board, setBrands]);
  const me = setRows.find((r) => same(r.brand, anchor));
  const cmap = useMemo(() => (ready ? categoryMap(anchor, rows, (b) => tiers.inSet(b)) : null), [ready, anchor, rows, tiers]);
  const findings = useMemo(() => (ready ? buildFindings({ anchor, movement: movement.data!, shares: shares.data!, demand: demand.data!, availability: availability.data ?? [], coverage: coverage.data ?? [], complete }) : []),
    [ready, anchor, movement.data, shares.data, demand.data, availability.data, coverage.data, complete]);
  const heroes = useMemo(() => (ready ? heroProducts(anchor, movement.data!, demand.data!, catalog.data!).slice(0, 4) : []), [ready, anchor, movement.data, demand.data, catalog.data]);
  const gaps = useMemo(() => (catalog.data ? rangeGrid(anchor, catalog.data, (b) => tiers.inSet(b)) : []), [catalog.data, anchor, tiers]);
  const kw = useMemo(() => keywordView(search.data ?? [], anchor, (b) => tiers.inSet(b)), [search.data, anchor, tiers]);

  if (!ready || !board || !cmap) return <Shell active="Analysis"><PageHead eyebrow={tr("K-beauty · step 4", "K-뷰티 · 4단계")} title={tr("K-beauty and our focus brands", "K-뷰티와 주요 브랜드")} sub={tr("Where the brand stands, where it wins and loses, what changed and what to do next.", "브랜드의 현재 위치, 강점과 약점, 달라진 점, 다음에 할 일.")} /><Loading what={tr("today's analysis", "오늘의 분석")} /></Shell>;

  /* ---------------- relevance: the brands that matter first */
  const anchorCats = new Set((shelf.data ?? []).filter((r) => same(r.brand, anchor)).map((r) => r.subcategory));
  const relevant = (f: Finding) => !f.brand || same(f.brand, anchor) || tiers.inSet(f.brand);
  const weight = (f: Finding) => f.weight * (f.brand && same(f.brand, anchor) ? 1.6 : !f.brand ? 1.1 : tiers.inSet(f.brand) ? 1.3 : 0.5) * (f.category && anchorCats.has(f.category) ? 1.2 : 1);
  const ranked = [...findings].sort((a, b) => weight(b) - weight(a));
  const top5 = ranked.filter(relevant).slice(0, 5);
  const inScope = (f: Finding) => (scope === "all" || relevant(f)) && (catFilter === "all" || f.category === catFilter);
  const findingCats = [...new Set(findings.map((f) => f.category).filter((c): c is string => !!c))].sort();

  /* ---------------- verdict */
  const n = setRows.length;
  const rS = rankOn(setRows, anchor, "shelf"); const rQ = rankOn(setRows, anchor, "search"); const rD = rankOn(setRows, anchor, "demand");
  const lead = (k: "shelf" | "search" | "demand") => [...setRows].filter((r) => !same(r.brand, anchor)).sort((a, b) => b[k] - a[k])[0];
  const mkt = board.market.growth;
  const avgRank = (rS + rQ + rD) / 3;
  const standing = avgRank <= n / 3 ? tr("one of the leaders", "선두권") : avgRank <= (2 * n) / 3 ? tr("mid-table", "중위권") : tr("a small player", "하위권");
  const gapCells = gaps.flatMap((g) => g.bands.filter((b) => b.gap).map((b) => ({ category: g.category, ...b })));
  const oos = (availability.data ?? []).filter((a) => same(a.brand, anchor));
  const opps = cmap.cells.filter((c) => c.quadrant === "opportunity").sort((a, b) => b.recent - a.recent);
  // the lever: whichever of the three shares is weakest against the focus brands' median (same index as the scoreboard title)
  const idx = me ? (["shelf", "search", "demand"] as const).map((k) => ({ k, r: me[k] / (median(setRows.map((x) => x[k])) || 1e-9) })).sort((a, b) => a.r - b.r) : [];
  const weakest = idx[0]; const fx = (r: number) => tr(`${r.toFixed(1)}× the focus median`, `주요 브랜드 중앙값의 ${r.toFixed(1)}배`);
  const word = { get shelf() { return tr("the shelf", "진열"); }, get search() { return tr("search", "검색"); }, get demand() { return tr("buying", "구매"); } };
  const lever = !weakest ? { text: "", href: "#standing" }
    : idx[1].r - weakest.r < 0.15 ? { text: tr(`against the focus brands, ${anchor} is equally weak on ${word[weakest.k]} and ${word[idx[1].k]} (${fx(weakest.r)} and ${idx[1].r.toFixed(1)}×) and stronger on ${word[idx[2].k]} (${idx[2].r.toFixed(1)}×), so no single channel is the bottleneck: grow where the category is rising and ${anchor} under-indexes${opps[0] ? `, starting with ${cat(opps[0].category).toLowerCase()}` : ""}`,
        `주요 브랜드 대비 ${josa(anchor, "은/는")} ${josa(word[weakest.k], "과/와")} ${word[idx[1].k]}에서 똑같이 약하고(${fx(weakest.r)}, ${idx[1].r.toFixed(1)}배) ${word[idx[2].k]}에서는 더 강합니다(${idx[2].r.toFixed(1)}배). 한 채널이 병목이 아니므로, 카테고리가 성장하는데 ${josa(anchor, "이/가")} 평소보다 약한 곳부터 키우는 것이 맞습니다${opps[0] ? `. 출발점은 ${cat(opps[0].category)}` : ""}`), href: "#portfolio" }
    : weakest.k === "demand" ? { text: tr(`against the focus brands, ${anchor} is weakest on buying (${fx(weakest.r)}, vs ${fx(idx[1].r)} on ${idx[1].k}): it is seen more than it is bought, so the offer itself (price, range, claims) is the first lever`,
        `주요 브랜드 대비 ${josa(anchor, "은/는")} 구매에서 가장 약합니다(${fx(weakest.r)}, ${josa(word[idx[1].k], "은/는")} ${fx(idx[1].r)}). 보이는 만큼 팔리지 않으므로, 제안 자체(가격, 라인업, 소구점)가 첫 번째 레버입니다`), href: "#gaps" }
    : weakest.k === "search" ? { text: tr(`against the focus brands, ${anchor} is weakest in search (${fx(weakest.r)}, vs ${fx(idx[1].r)} on ${idx[1].k}): shoppers who search rarely find it, so search visibility is the first lever`,
        `주요 브랜드 대비 ${josa(anchor, "은/는")} 검색에서 가장 약합니다(${fx(weakest.r)}, ${josa(word[idx[1].k], "은/는")} ${fx(idx[1].r)}). 검색하는 소비자가 잘 찾지 못하므로, 검색 노출이 첫 번째 레버입니다`), href: "#standing" }
    : { text: tr(`against the focus brands, ${anchor} is weakest on the shelf (${fx(weakest.r)}, vs ${fx(idx[1].r)} on ${idx[1].k}): Nykaa's lists show it less than buyers choose it, so shelf visibility (offers, ads, listing quality) is the first lever`,
        `주요 브랜드 대비 ${josa(anchor, "은/는")} 진열에서 가장 약합니다(${fx(weakest.r)}, ${josa(word[idx[1].k], "은/는")} ${fx(idx[1].r)}). 구매자가 선택하는 만큼 Nykaa 목록에 노출되지 않으므로, 진열 노출(프로모션, 광고, 상품 페이지 품질)이 첫 번째 레버입니다`), href: "#standing" };
  const priority = me && mkt !== null && me.growth !== null && (me.growth < mkt - 0.05 || avgRank > n * 0.6) ? "High" : me && mkt !== null && me.growth !== null && (me.growth < mkt || avgRank > n / 3) ? "Medium" : "Watch";
  const priorityWord = { High: tr("High priority", "우선순위 높음"), Medium: tr("Medium priority", "우선순위 보통"), Watch: tr("Watch priority", "관찰") }[priority];
  const headline = me ? tr(`${anchor} is ${standing} among the ${n} focus brands on Nykaa (#${rS} on the shelf, #${rQ} in search, #${rD} in demand), and its demand is ${me.growth === null || mkt === null ? "too thinly tracked to call" : me.growth >= mkt ? `growing faster than all tracked products (${signed(me.growth)} vs ${signed(mkt)})` : `growing slower than all tracked products (${signed(me.growth)} vs ${signed(mkt)})`}.`,
      `${josa(anchor, "은/는")} Nykaa 주요 브랜드 ${n}개 중 ${standing}입니다(진열 ${rS}위, 검색 ${rQ}위, 수요 ${rD}위). 수요는 ${me.growth === null || mkt === null ? "추적 데이터가 부족해 판단하기 어렵습니다" : me.growth >= mkt ? `추적 전체보다 빠르게 성장하고 있습니다(${signed(me.growth)}, 시장 ${signed(mkt)})` : `추적 전체보다 느리게 성장하고 있습니다(${signed(me.growth)}, 시장 ${signed(mkt)})`}.`)
    : tr(`${anchor} has no listing or tracked demand today.`, `${josa(anchor, "은/는")} 오늘 진열 제품도, 추적 중인 수요도 없습니다.`);
  const verdictPoints = me ? tr([
    <><b className="text-on-brand">Shelf:</b> {me.shelfSlots} of {board.shelfTotal.toLocaleString("en-IN")} top-100 places ({pct(me.shelf)}); {lead("shelf")?.brand} leads the focus set with {lead("shelf")?.shelfSlots}. {me.slotsChange !== null && <>{me.slotsChange === 0 ? "No change" : `${me.slotsChange > 0 ? "+" : ""}${me.slotsChange} places`} in 14 days, counted on the {board.likeForLikeCats} categories tracked throughout.</>}</>,
    <><b className="text-on-brand">Search:</b> {pct(me.search)} of unpaid top-10 results across today&rsquo;s keywords; {lead("search")?.brand} leads with {pct(lead("search")?.search ?? 0)}.{kw.total ? ` Absent from the top 10 on ${kw.absent} of ${kw.total} keywords.` : ""}</>,
    <><b className="text-on-brand">Demand:</b> {pct(me.demand)} of tracked reviews in {win.recent}; {lead("demand")?.brand} leads with {pct(lead("demand")?.demand ?? 0)}. Growth {signed(me.growth)} vs all tracked {signed(mkt)} ({win.recent} vs {win.prior}).</>,
    <><b className="text-on-brand">Range and stock:</b> {gapCells.length ? `${gapCells.length} price band${gapCells.length === 1 ? "" : "s"} where focus brands sell 3+ products and ${anchor} none` : "no price band left open to the focus brands"}; {oos.length ? `${oos.length} product${oos.length === 1 ? "" : "s"} out of stock today` : "nothing out of stock today"}.</>,
  ], [
    <><b className="text-on-brand">진열:</b> 상위 100위 자리 {board.shelfTotal.toLocaleString("en-IN")}개 중 {me.shelfSlots}개({pct(me.shelf)}). 주요 브랜드 중 선두는 {lead("shelf")?.brand}({lead("shelf")?.shelfSlots}개). {me.slotsChange !== null && <>14일간 {me.slotsChange === 0 ? "변화 없음" : `${me.slotsChange > 0 ? "+" : ""}${me.slotsChange}자리`} (기간 내내 추적한 카테고리 {board.likeForLikeCats}개 기준).</>}</>,
    <><b className="text-on-brand">검색:</b> 오늘 키워드 전체의 비광고 상위 10개 결과 중 {pct(me.search)}. 선두는 {lead("search")?.brand}({pct(lead("search")?.search ?? 0)}).{kw.total ? ` 키워드 ${kw.total}개 중 ${kw.absent}개에서 상위 10위 밖.` : ""}</>,
    <><b className="text-on-brand">수요:</b> {win.recent} 추적 리뷰 중 {pct(me.demand)}. 선두는 {lead("demand")?.brand}({pct(lead("demand")?.demand ?? 0)}). 성장률 {signed(me.growth)}, 시장 {signed(mkt)} ({win.recent} vs {win.prior}).</>,
    <><b className="text-on-brand">라인업·재고:</b> {gapCells.length ? `주요 브랜드는 3개 이상 파는데 ${anchor} 제품은 없는 가격대 ${gapCells.length}곳` : "주요 브랜드에 내준 가격대 없음"}. {oos.length ? `오늘 품절 제품 ${oos.length}개` : "오늘 품절 제품 없음"}.</>,
  ]) : [];

  /* ---------------- next steps: up to five, ranked by impact, each tied to its evidence */
  const steps = nextSteps({ anchor, cmap: cmap.cells, market: mkt, usual: cmap.usual, gapCells, gaps, me, kw, oos, findings: ranked.filter((f) => f.tone === "threat" && f.brand && tiers.inSet(f.brand) && !same(f.brand, anchor)), rows });

  const catDetail = (c: CategoryCell): DetailContent => {
    const ps = rows.filter((r) => r.category === c.category).sort((a, b) => b.recent - a.recent);
    const mine = ps.filter((r) => same(r.brand, anchor));
    return {
      kicker: `${cat(c.category)} · ${c.quadrant ? QUAD[c.quadrant].label : tr("not classified", "미분류")}`,
      title: c.quadrant ? tr(QUAD[c.quadrant].read.replace("the anchor", anchor), QUAD[c.quadrant].read.replace("기준 브랜드는", josa(anchor, "은/는")).replace("기준 브랜드도", `${anchor}도`)) : tr(`Not classified: ${c.thin ?? "no growth reading"}`, `미분류: ${c.thin ?? "성장률 판단 불가"}`),
      body: (<>
        <Points items={tr([
          <>Category growth <b>{signed(c.growth)}</b>: {c.growthBase.recent.toLocaleString("en-IN")} reviews in {win.recent} vs {c.growthBase.prior.toLocaleString("en-IN")} in {win.prior}, from {c.growthBase.products} products with complete history. Market: {signed(mkt)}.</>,
          <>{anchor}: {c.anchorRecent} of {c.recent.toLocaleString("en-IN")} reviews ({pct(c.anchorShare)}), against its usual {pct(cmap.usual)} across all categories.</>,
          <>Leader: {c.leader.brand} ({pct(c.leader.share)}){c.focusLeader && !same(c.focusLeader.brand, c.leader.brand) ? `; leading focus brand ${c.focusLeader.brand} (${pct(c.focusLeader.share)})` : ""}.</>,
        ], [
          <>카테고리 성장률 <b>{signed(c.growth)}</b>: {win.recent} 리뷰 {c.growthBase.recent.toLocaleString("en-IN")}건, {win.prior} {c.growthBase.prior.toLocaleString("en-IN")}건 (이력이 완전한 제품 {c.growthBase.products}개 기준). 시장: {signed(mkt)}.</>,
          <>{anchor}: 리뷰 {c.recent.toLocaleString("en-IN")}건 중 {c.anchorRecent}건({pct(c.anchorShare)}). 전체 카테고리 평소 점유율은 {pct(cmap.usual)}.</>,
          <>선두: {c.leader.brand}({pct(c.leader.share)}){c.focusLeader && !same(c.focusLeader.brand, c.leader.brand) ? `. 주요 브랜드 중 선두는 ${c.focusLeader.brand}(${pct(c.focusLeader.share)})` : ""}.</>,
        ])} />
        <DetailHead>{tr(`Top products by reviews, ${win.recent}`, `리뷰 수 상위 제품, ${win.recent}`)}</DetailHead>
        <ProductBars rows={ps.slice(0, 8)} anchor={anchor} />
        {mine.length > 0 && !ps.slice(0, 8).some((r) => same(r.brand, anchor)) && <><DetailHead>{tr(`${anchor} here`, `이 카테고리의 ${anchor}`)}</DetailHead><ProductBars rows={mine} anchor={anchor} /></>}
      </>),
    };
  };
  const findingDetail = (f: Finding): DetailContent => ({
    kicker: tr(`${TONE_WORD[f.tone]} · evidence from ${f.source}`, `${TONE_WORD[f.tone]} · 근거: ${SOURCE_WORD(f.source)}`), title: f.headline,
    body: (<>
      <p className="text-ink-2">{f.detail}</p>
      <p className="mt-2 font-medium">{f.soWhat}</p>
      <DetailHead>{tr("The numbers", "수치")}</DetailHead>
      <Points items={f.evidence.map((e) => <><span className="text-muted">{e.label}:</span> <b className="font-medium tabular">{e.value}</b></>)} />
      {f.product && <button onClick={() => open(f.product!)} className="mt-4 rounded-lg px-3 py-1.5 text-[13px] text-ink-2 ring-1 ring-line hover:bg-surface">{tr("Open the product ›", "제품 보기 ›")}</button>}
    </>),
  });
  const gapDetail = (category: string, b: GapCell): DetailContent => ({
    kicker: tr(`Range · ${cat(category)} · ${b.label} (by MRP)`, `라인업 · ${cat(category)} · ${bandLabel(b.label)} (정가 기준)`),
    title: b.gap ? tr(`${anchor} has nothing here; ${b.rivalBrands.length} focus brand${b.rivalBrands.length === 1 ? "" : "s"} sell ${b.rivals.length} products`, `${anchor} 제품 없음. 주요 브랜드 ${b.rivalBrands.length}곳이 ${b.rivals.length}개 판매`) : tr(`${anchor} ${b.anchor.length} · focus brands ${b.rivals.length}`, `${anchor} ${b.anchor.length}개 · 주요 브랜드 ${b.rivals.length}개`),
    body: (<>
      <p className="text-muted">{tr(<>Products in {cat(category).toLowerCase()} with an MRP of {b.label.toLowerCase()}, from each brand&rsquo;s own Nykaa catalogue. Focus brands only.</>, <>{cat(category)} 중 정가 {bandLabel(b.label)}인 제품. 브랜드별 Nykaa 카탈로그 기준이며 주요 브랜드만 포함합니다.</>)}</p>
      <DetailHead>{anchor} ({b.anchor.length})</DetailHead>
      {b.anchor.length ? <CatalogList rows={b.anchor} /> : <Missing>{tr(`No ${anchor} product in this band`, `이 가격대에 ${anchor} 제품 없음`)}</Missing>}
      <DetailHead>{tr("Focus brands", "주요 브랜드")} ({b.rivals.length})</DetailHead>
      {b.rivals.length ? <CatalogList rows={[...b.rivals].sort((x, y) => (y.rating_count ?? 0) - (x.rating_count ?? 0))} /> : <Missing>{tr("No focus brand sells here", "이 가격대를 파는 주요 브랜드 없음")}</Missing>}
    </>),
  });

  const asOf = shelf.data?.[0]?.scrape_date;
  return (
    <Shell active="Analysis" asOf={asOf}>
      <PageHead eyebrow={tr("K-beauty · step 4", "K-뷰티 · 4단계")} title={tr("K-beauty and our focus brands", "K-뷰티와 주요 브랜드")} sub={tr(<>How K-beauty does on Nykaa and how each Korean focus brand does, then the full brief for {anchor}: where it stands against the {n - 1} brands that matter, where it wins and loses, what changed today and what to do next. Hover a measure for its definition; click anything with › for the evidence.</>,
        <>Nykaa에서 K-뷰티와 한국 주요 브랜드의 성과, 이어서 {anchor} 보고서: 주요 브랜드 {n - 1}곳과 비교한 위치, 강점과 약점, 오늘 달라진 점, 다음에 할 일. 지표에 마우스를 올리면 정의가, › 표시를 누르면 근거가 나옵니다.</>)}
        right={<BrandSelect value={anchor} onChange={setPicked} tiers={tiers} all={known} />} />
      <SectionNav items={NAV()} />
      <KBeautyOverview tiers={tiers} />
      <div className="mt-16 border-t border-line pt-2 text-[12px] font-semibold uppercase tracking-[0.14em] text-muted">{tr(`The ${anchor} brief`, `${anchor} 보고서`)}</div>
      {!deep && <p className="mt-4 rounded-xl bg-accent-soft px-4 py-2.5 text-[13px] text-ink-2">{tr(<><b>{anchor}</b> is outside the focus set, so this is a scorecard: it is compared with the focus brands, and sections without data for it say so.</>, <><b>{anchor}</b>는 주요 브랜드 밖이라 간이 평가로 보여 줍니다. 주요 브랜드와 비교하며, 데이터가 없는 영역은 그렇다고 표시합니다.</>)}</p>}

      <section id="summary" className="mt-6 scroll-mt-32">
        <Verdict eyebrow={tr(<>Verdict for {anchor}</>, <>{anchor} 종합 판단</>)} points={verdictPoints}
          foot={me && <div className="flex flex-wrap items-start gap-3"><span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] ${priority === "High" ? "bg-bad-soft text-bad" : priority === "Medium" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent-strong"}`}>{priorityWord}</span><span className="min-w-0 flex-1"><b>{tr("So what:", "시사점:")}</b> {lever.text}. <a href={lever.href} className="text-accent underline underline-offset-2">{tr("See the evidence ↓", "근거 보기 ↓")}</a></span></div>}>
          {headline}
        </Verdict>
      </section>

      <ActionSection id="standing" kicker={tr("Scoreboard · against the focus brands", "스코어보드 · 주요 브랜드 대비")} title={scoreTitle(anchor, setRows)}
        note={tr(<>Three ways to read the same market. Where a brand&rsquo;s bars disagree is the story: seen but not bought, or bought but not seen. The grey tick on each bar is the focus brands&rsquo; median.</>, <>같은 시장을 읽는 세 가지 방법. 막대들이 서로 어긋나는 곳이 핵심입니다: 보이지만 팔리지 않거나, 팔리지만 보이지 않거나. 막대 위 회색 눈금은 주요 브랜드 중앙값입니다.</>)}>
        <Scoreboard rows={board.rows} setRows={setRows} anchor={anchor} tiers={tiers} board={board} win={win.recent} />
      </ActionSection>

      <ActionSection id="portfolio" kicker={tr("By category · where it wins and loses", "카테고리별 · 강점과 약점")} title={opps.length ? tr(`${opps.length} growing categor${opps.length === 1 ? "y is" : "ies are"} where ${anchor} does worse than its usual share: ${opps.slice(0, 3).map((c) => cat(c.category).toLowerCase()).join(", ")}.`, `성장 카테고리 ${opps.length}곳에서 ${josa(anchor, "이/가")} 평소 점유율보다 약합니다: ${opps.slice(0, 3).map((c) => cat(c.category)).join(", ")}.`) : tr(`No growing category where ${anchor} under-indexes.`, `${josa(anchor, "이/가")} 평소보다 약한 성장 카테고리는 없습니다.`)}
        note={tr(<>Each category is placed by how fast its buying grows (up) and by {anchor}&rsquo;s slice of it (across). The dashed lines are the growth of all tracked products ({signed(mkt)}) and {anchor}&rsquo;s usual share ({pct(cmap.usual)}). Hollow bubbles have too little data to classify. Bubble size = reviews in {win.recent}.</>,
          <>세로축은 카테고리 구매 성장 속도, 가로축은 그 안에서 {anchor}의 점유율입니다. 점선은 추적 전체 성장률({signed(mkt)})과 {anchor}의 평소 점유율({pct(cmap.usual)}). 속이 빈 원은 데이터가 부족해 분류하지 않았습니다. 원 크기 = {win.recent} 리뷰 수.</>)}>
        <div className="grid gap-4">
          <Card className="p-4"><OpportunityMap cells={cmap.cells} usual={cmap.usual} market={mkt} anchor={anchor} onPick={(c) => detail(catDetail(c))} /></Card>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead><tr className="border-b border-line text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                <th className="px-4 py-2.5">{tr("Category", "카테고리")}</th><th className="px-2 py-2.5"><Def k="growth">{tr("Growth", "성장률")}</Def></th><th className="px-2 py-2.5"><Def k="catShare">{anchor}</Def></th><th className="px-4 py-2.5">{tr("Read", "판단")}</th>
              </tr></thead>
              <tbody>{cmap.cells.map((c) => (
                <tr key={c.category} onClick={() => detail(catDetail(c))} className="cursor-pointer border-b border-line last:border-0 hover:bg-sunken/60">
                  <td className="px-4 py-2 font-medium">{cat(c.category)} <span className="text-muted">›</span></td>
                  <td className="px-2 py-2 tabular"><span className={c.growth !== null && mkt !== null && c.growth >= mkt ? "text-good" : "text-ink-2"}>{signed(c.growth)}</span><Basis>{tr(`${c.growthBase.products} products`, `제품 ${c.growthBase.products}개`)}</Basis></td>
                  <td className="px-2 py-2 tabular">{c.anchorRecent ? pct(c.anchorShare) : <Missing>{tr("none", "없음")}</Missing>}<Basis>{tr(`${c.anchorRecent} of ${compact(c.recent)}`, `${compact(c.recent)}건 중 ${c.anchorRecent}건`)}</Basis></td>
                  <td className="px-4 py-2">{c.quadrant ? <QuadTag q={c.quadrant} /> : <Missing>{tr("thin data", "데이터 부족")}: {c.thin}</Missing>}</td>
                </tr>))}</tbody>
            </table>
            <Basis className="border-t border-line px-4 py-2.5">{tr(<>Growth = reviews {win.recent} vs {win.prior}, only products with complete history. {anchor} = its share of the category&rsquo;s reviews in {win.recent}.</>, <>성장률 = {win.recent} 리뷰 vs {win.prior} 리뷰 (이력이 완전한 제품만). {anchor} = {win.recent} 카테고리 리뷰 중 {anchor}의 비중.</>)}</Basis>
          </Card>
        </div>
      </ActionSection>

      <ActionSection id="changes" kicker={tr("What changed · today's findings", "변화 · 오늘의 발견")} title={top5.length ? tr(`${top5.length} moves matter most today; ${findings.length - top5.length} more are grouped below.`, `오늘 가장 중요한 변화 ${top5.length}건. 나머지 ${findings.length - top5.length}건은 아래에 유형별로 묶었습니다.`) : tr("Nothing involving the brands that matter crossed a threshold today.", "오늘은 주요 브랜드와 관련해 기준을 넘은 변화가 없습니다.")}
        note={tr("Ranked by impact on the anchor: its own products first, then the focus brands, then its categories. Each rule states its threshold; click a finding for the numbers.", "기준 브랜드에 미치는 영향 순: 자사 제품, 주요 브랜드, 자사 카테고리 순입니다. 규칙마다 기준값이 있으며, 항목을 누르면 수치가 나옵니다.")}>
        <div className="grid gap-2.5">
          {top5.map((f) => (
            <Card key={f.id} className="lift px-5 py-3.5">
              <Opens detail={findingDetail(f)} className="w-full">
                <span className="flex items-start gap-3">
                  <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${TONE_DOT[f.tone]}`} />
                  <span className="min-w-0"><span className="block text-[14px] font-medium leading-snug">{f.headline}</span><span className="mt-0.5 block text-[12.5px] text-ink-2">{f.soWhat}</span></span>
                  <span className="ml-auto shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{TONE_WORD[f.tone]}</span>
                </span>
              </Opens>
            </Card>
          ))}
        </div>
        <div className="mb-2 mt-6 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-muted">{tr("All findings by type:", "유형별 전체 발견:")}</span>
          {(["set", "all"] as const).map((s) => <button key={s} onClick={() => setScope(s)} className={`rounded-full px-3 py-1 ring-1 ${scope === s ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line"}`}>{s === "set" ? tr("Focus brands", "주요 브랜드") : tr("All brands", "전체 브랜드")}</button>)}
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="rounded-full border border-line bg-surface px-3 py-1 text-[12.5px]">
            <option value="all">{tr("All categories", "전체 카테고리")}</option>{findingCats.map((c) => <option key={c} value={c}>{cat(c)}</option>)}
          </select>
        </div>
        <Card className="overflow-hidden">
          {THEMES().map((th) => {
            const xs = ranked.filter(th.test).filter(inScope);
            const t = { threat: xs.filter((f) => f.tone === "threat").length, opening: xs.filter((f) => f.tone === "opening").length };
            const isOpen = openTheme === th.id;
            return (
              <div key={th.id} className="border-b border-line last:border-0">
                <button onClick={() => setOpenTheme(isOpen ? null : th.id)} disabled={!xs.length} className="grid w-full grid-cols-[150px_70px_1fr_20px] items-center gap-3 px-5 py-3 text-left enabled:hover:bg-sunken/60">
                  <span className="text-[13.5px] font-semibold">{th.label}</span>
                  <span className="text-[12.5px] tabular text-ink-2">{tr(`${xs.length} move${xs.length === 1 ? "" : "s"}`, `${xs.length}건`)}</span>
                  <span className="min-w-0 truncate text-[12.5px] text-ink-2">{xs.length ? tr(<>{t.threat} threat{t.threat === 1 ? "" : "s"}, {t.opening} opening{t.opening === 1 ? "" : "s"} · biggest: {xs[0].headline}</>, <>위협 {t.threat}, 기회 {t.opening} · 가장 큰 변화: {xs[0].headline}</>) : <Missing>{tr("nothing crossed this theme’s threshold", "이 유형에서 기준을 넘은 변화 없음")}</Missing>}</span>
                  <span className="text-muted">{xs.length ? (isOpen ? "▾" : "▸") : ""}</span>
                </button>
                {isOpen && (
                  <ul className="space-y-1.5 bg-sunken/40 px-5 py-3">
                    {xs.map((f) => (
                      <li key={f.id} className="flex items-start gap-2 text-[13px] leading-snug">
                        <span className={`mt-[6px] h-2 w-2 shrink-0 rounded-full ${TONE_DOT[f.tone]}`} />
                        <Opens detail={findingDetail(f)}>{f.headline}{f.brand && !tiers.inSet(f.brand) && <span className="ml-1.5 rounded bg-sunken px-1 text-[10.5px] text-muted ring-1 ring-line">{tr("outside focus set", "주요 브랜드 외")}</span>}</Opens>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </Card>
      </ActionSection>

      <ActionSection id="heroes" kicker={tr("Hero products", "히어로 제품")} title={heroes.length ? tr(`${anchor}'s strongest product is ${shortName(heroes[0].name, anchor)}${heroes[0].edge ? `, which beats its category on ${heroes[0].edge.label.toLowerCase()}` : ""}.`, `${anchor}의 가장 강한 제품은 ${shortName(heroes[0].name, anchor)}${heroes[0].edge ? `이며, ${heroes[0].edge.label}에서 카테고리 평균을 앞섭니다` : "입니다"}.`) : tr(`${anchor} has no product on a tracked shelf or catalogue.`, `${anchor} 제품이 추적 중인 진열 목록이나 카탈로그에 없습니다.`)}
        note={tr(<><Def k="hero">How heroes are picked</Def>: shelf rank, reviews in {win.recent}, rating and buyer base, each scored against the median product of the same category. The bars compare each hero with the category&rsquo;s best sellers on reviews.</>, <><Def k="hero">히어로 선정 방법</Def>: 진열 순위, {win.recent} 리뷰 수, 평점, 구매자 규모를 같은 카테고리 중앙값 제품과 비교해 점수화합니다. 막대는 각 히어로를 카테고리 베스트셀러와 리뷰 수로 비교합니다.</>)}>
        {heroes.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {heroes.map((h, i) => {
              const peers = h.category ? rows.filter((r) => r.category === h.category).sort((a, b) => b.recent - a.recent) : [];
              const self = rows.find((r) => r.product_id === h.product_id);
              const shown = [...peers.filter((r) => r.product_id !== h.product_id).slice(0, 4), ...(self ? [self] : [])].sort((a, b) => b.recent - a.recent);
              const pos = self ? peers.findIndex((r) => r.product_id === h.product_id) + 1 : 0;
              return (
                <Card key={h.product_id} className="px-5 py-4">
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-display text-[13px] font-semibold tabular text-muted">{i + 1}</span>
                    <button onClick={() => open({ product_id: h.product_id, name: h.name, brand: h.brand, price: h.price })} className="text-left text-[14px] font-medium leading-snug hover:underline">{shortName(h.name, anchor)} ›</button>
                  </div>
                  <Basis className="mt-1">{cat(h.category)}{h.rank ? tr(` · shelf #${h.rank}`, ` · 진열 ${h.rank}위`) : ""}{h.rating ? ` · ★ ${h.rating.toFixed(1)}` : ""}{h.ratingCount ? tr(` · ${compact(h.ratingCount)} ratings`, ` · 평가 ${compact(h.ratingCount)}건`) : ""}{h.edge ? tr(` · leads on ${h.edge.label.toLowerCase()}: ${h.edge.detail}`, ` · 강점 ${h.edge.label}: ${h.edge.detail}`) : ""}</Basis>
                  {shown.length > 1 ? (<>
                    <div className="mb-1 mt-3 text-[11.5px] font-medium text-ink-2">{tr(<>Reviews in {win.recent} vs the category&rsquo;s best sellers{pos ? ` (it ranks #${pos} of ${peers.length})` : ""}</>, <>{win.recent} 리뷰 수, 카테고리 베스트셀러 대비{pos ? ` (${peers.length}개 중 ${pos}위)` : ""}</>)}</div>
                    <ProductBars rows={shown} anchor={anchor} highlight={h.product_id} compactNames />
                  </>) : <p className="mt-3"><Missing>{tr("No review history to compare in this category", "이 카테고리에는 비교할 리뷰 이력이 없습니다")}</Missing></p>}
                </Card>
              );
            })}
          </div>
        ) : <Missing>{tr("Nothing to rank", "순위를 매길 제품 없음")}</Missing>}
      </ActionSection>

      <ActionSection id="gaps" kicker={tr("Range gaps · where the focus brands sell and the brand doesn't", "라인업 공백 · 주요 브랜드는 파는데 우리는 없는 곳")} title={!gaps.length ? tr(`No catalogue is collected for ${anchor}, so its range cannot be compared.`, `${anchor}의 카탈로그가 수집되지 않아 라인업을 비교할 수 없습니다.`) : gapCells.length ? tr(`${gapCells.length} price band${gapCells.length === 1 ? "" : "s"} across ${new Set(gapCells.map((g) => g.category)).size} categor${new Set(gapCells.map((g) => g.category)).size === 1 ? "y" : "ies"} have 3+ focus-brand products and no ${anchor} product.`, `카테고리 ${new Set(gapCells.map((g) => g.category)).size}곳의 가격대 ${gapCells.length}개에서 주요 브랜드 제품은 3개 이상인데 ${anchor} 제품은 없습니다.`) : tr(`${anchor} has a product in every price band where the focus brands sell three or more.`, `주요 브랜드가 3개 이상 파는 모든 가격대에 ${anchor} 제품이 있습니다.`)}
        note={tr(<><Def k="rangeGap">How a gap is defined</Def>: each brand&rsquo;s full Nykaa range, by category and MRP band; only the focus brands count as rivals. Red = a gap. Click any cell for the exact products.</>, <><Def k="rangeGap">공백의 정의</Def>: 브랜드별 Nykaa 전체 라인업을 카테고리와 정가 구간으로 나눠 봅니다. 경쟁사는 주요 브랜드만 셉니다. 빨간 칸 = 공백. 칸을 누르면 해당 제품이 나옵니다.</>)}>
        {gaps.length > 0 && (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"><th className="px-5 py-2.5">{tr("Category", "카테고리")}</th>{BANDS.map(([l]) => <th key={l} className="px-3 py-2.5">{bandLabel(l)}</th>)}</tr></thead>
              <tbody>{gaps.map((g) => (
                <tr key={g.category} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 font-medium">{cat(g.category)}</td>
                  {g.bands.map((b) => (
                    <td key={b.label} className="px-2 py-1.5">
                      <button onClick={() => detail(gapDetail(g.category, b))} disabled={!b.anchor.length && !b.rivals.length}
                        className={`w-full rounded-lg px-2.5 py-1.5 text-left tabular enabled:hover:ring-1 enabled:hover:ring-line-2 ${b.gap ? "bg-bad-soft text-bad" : ""}`}>
                        {!b.anchor.length && !b.rivals.length ? <span className="text-[12px] text-faint">{tr("nobody", "없음")}</span> : <>
                          <b className="font-semibold">{b.anchor.length}</b> <span className={b.gap ? "" : "text-muted"}>{anchor}</span>
                          <span className={`block text-[11.5px] ${b.gap ? "" : "text-muted"}`}>{tr(`${b.rivals.length} from ${b.rivalBrands.length} focus brand${b.rivalBrands.length === 1 ? "" : "s"} ›`, `주요 브랜드 ${b.rivalBrands.length}곳 ${b.rivals.length}개 ›`)}</span>
                        </>}
                      </button>
                    </td>
                  ))}
                </tr>))}</tbody>
            </table>
          </Card>
        )}
      </ActionSection>

      <ActionSection id="next" kicker={tr("Suggested next steps", "제안하는 다음 단계")} title={steps.length ? tr(`${steps.length} actions, ranked by expected impact.`, `예상 효과 순 실행 과제 ${steps.length}개.`) : tr("Nothing needs action today.", "오늘은 조치할 일이 없습니다.")}
        note={tr("Rule-based from the evidence above, limited to the focus brands and the anchor's own levers: range, price, search, stock and hero products. Each links to its evidence.", "위 근거에서 규칙으로 도출했으며, 주요 브랜드와 기준 브랜드가 직접 움직일 수 있는 레버(라인업, 가격, 검색, 재고, 히어로 제품)로 한정합니다. 각 항목은 근거로 연결됩니다.")}>
        <div className="grid gap-3 md:grid-cols-2">
          {steps.map((s, i) => (
            <Card key={i} className="relative overflow-hidden px-5 py-4">
              <span className={`absolute left-0 top-0 h-full w-1 ${s.tone === "good" ? "bg-good" : s.tone === "bad" ? "bg-bad" : "bg-accent-strong"}`} />
              <div className="flex items-baseline gap-2"><span className="font-display text-[13px] font-semibold tabular text-muted">{i + 1}</span><div className="text-[14.5px] font-semibold leading-snug">{s.what}</div></div>
              <dl className="mt-2 grid grid-cols-[44px_1fr] gap-x-2 gap-y-1 text-[12.5px] leading-snug">
                <dt className="text-muted">{tr("Who", "담당")}</dt><dd>{s.who}</dd>
                <dt className="text-muted">{tr("Why", "이유")}</dt><dd className="text-ink-2">{s.why}</dd>
              </dl>
              <a href={s.href} className="mt-2 inline-block text-[12px] font-medium text-accent-strong">{tr("Evidence ↑", "근거 ↑")}</a>
            </Card>
          ))}
        </div>
      </ActionSection>

      <EventLog />
    </Shell>
  );
}

/* ================================================================ pieces */

function scoreTitle(anchor: string, rows: ScoreRow[]) {
  const me = rows.find((r) => same(r.brand, anchor)); if (!me) return tr(`${anchor} is not on any tracked shelf today.`, `${josa(anchor, "은/는")} 오늘 추적 중인 진열 목록에 없습니다.`);
  const m = (k: "shelf" | "search" | "demand") => median(rows.map((r) => r[k])) || 1e-9;
  const xs = ([["shelf", tr("shelf share", "진열 점유율")], ["search", tr("search share", "검색 점유율")], ["demand", tr("demand share", "수요 점유율")]] as const).map(([k, l]) => ({ l, r: me[k] / m(k) })).sort((a, b) => b.r - a.r);
  const fx = (r: number) => `${r.toFixed(1)}×`;
  return tr(`${anchor}'s ${xs[0].l} is ${fx(xs[0].r)} the focus median, but its ${xs[2].l} only ${fx(xs[2].r)}.`, `${anchor}의 ${josa(xs[0].l, "은/는")} 주요 브랜드 중앙값의 ${xs[0].r.toFixed(1)}배지만, ${josa(xs[2].l, "은/는")} ${xs[2].r.toFixed(1)}배에 그칩니다.`);
}

function Scoreboard({ rows, setRows, anchor, tiers, board, win }: { rows: ScoreRow[]; setRows: ScoreRow[]; anchor: string; tiers: ReturnType<typeof useTiers>; board: NonNullable<ReturnType<typeof scoreboard>>; win: string }) {
  const sorted = [...rows].sort((a, b) => (same(a.brand, anchor) ? -1 : same(b.brand, anchor) ? 1 : b.demand - a.demand));
  const max = { shelf: Math.max(...setRows.map((r) => r.shelf), 1e-9), search: Math.max(...setRows.map((r) => r.search), 1e-9), demand: Math.max(...setRows.map((r) => r.demand), 1e-9) };
  const med = { shelf: median(setRows.map((r) => r.shelf)), search: median(setRows.map((r) => r.search)), demand: median(setRows.map((r) => r.demand)) };
  const cols = "grid-cols-[minmax(130px,1fr)_minmax(150px,1.3fr)_minmax(150px,1.3fr)_minmax(150px,1.3fr)_110px]";
  const Cell = ({ v, k, sub, hl }: { v: number; k: "shelf" | "search" | "demand"; sub: React.ReactNode; hl: boolean }) => (
    <span className="pr-4">
      <span className="flex items-center gap-2"><b className="w-12 text-[13px] tabular">{pct(v)}</b>
        <span className="relative h-2 flex-1 rounded-full bg-sunken"><span className={`block h-2 rounded-full ${hl ? "bg-accent-strong" : "bg-brand/70"}`} style={{ width: `${Math.min(100, (v / max[k]) * 100)}%` }} />
          <span className="absolute -top-0.5 h-3 w-0.5 rounded bg-ink/35" style={{ left: `${Math.min(100, (med[k] / max[k]) * 100)}%` }} title={tr(`Focus median ${pct(med[k])}`, `주요 브랜드 중앙값 ${pct(med[k])}`)} /></span></span>
      <span className="block text-[11px] text-muted">{sub}</span>
    </span>
  );
  return (
    <Card className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className={`grid ${cols} border-b border-line px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted`}>
          <span>{tr("Brand", "브랜드")}</span>
          <span><Def k="shelf">{tr("Share of top-100 shelf", "상위 100위 진열 점유율")}</Def><span className="block font-normal normal-case tracking-normal">{tr("places held today · change in 14 days", "오늘 차지한 자리 · 14일 변화")}</span></span>
          <span><Def k="search">{tr("Share of top-10 search", "상위 10위 검색 점유율")}</Def><span className="block font-normal normal-case tracking-normal">{tr("unpaid results today · change in 7 days", "오늘 비광고 결과 · 7일 변화")}</span></span>
          <span><Def k="demand">{tr("Share of reviews", "리뷰 점유율")}</Def><span className="block font-normal normal-case tracking-normal">{win}</span></span>
          <span><Def k="growth">{tr("Demand growth", "수요 성장률")}</Def><span className="block font-normal normal-case tracking-normal">{tr(`vs all tracked ${signed(board.market.growth)}`, `시장 ${signed(board.market.growth)}`)}</span></span>
        </div>
        <TieredList rows={sorted} brandOf={(r) => r.brand} tiers={tiers} top={9} render={(r) => {
          const hl = same(r.brand, anchor); const out = !tiers.inSet(r.brand);
          return (
            <div key={r.brand} className={`grid ${cols} items-center border-b border-line px-4 py-2 ${hl ? "bg-accent-soft/50" : ""}`}>
              <span className="text-[13px]"><span className={hl ? "font-semibold" : "font-medium"}>{r.brand}</span>{out && <span className="ml-1.5 rounded bg-sunken px-1 text-[10px] text-muted ring-1 ring-line">{tr("not in focus set", "주요 브랜드 외")}</span>}</span>
              <Cell v={r.shelf} k="shelf" hl={hl} sub={<>{tr(`${r.shelfSlots} places`, `${r.shelfSlots}자리`)}{r.slotsChange !== null ? ` · ${moved(r.slotsChange)}` : ""}</>} />
              <Cell v={r.search} k="search" hl={hl} sub={<>{r.searchChange !== null ? pts(r.searchChange) : tr("no earlier day", "이전 데이터 없음")}{r.paid ? tr(` · ${Math.round(r.paid * 100)}% paid`, ` · 광고 ${Math.round(r.paid * 100)}%`) : ""}</>} />
              <Cell v={r.demand} k="demand" hl={hl} sub={<>{tr(`${compact(r.demandRecent)} reviews`, `리뷰 ${compact(r.demandRecent)}건`)}</>} />
              <span className="text-[12.5px] tabular">{r.growth === null ? <Missing>{tr("no full history", "이력 불완전")}</Missing> : <><b className={board.market.growth !== null && r.growth >= board.market.growth ? "text-good" : "text-bad"}>{signed(r.growth)}</b><span className="block text-[11px] text-muted">{tr(`${r.growthProducts} products`, `제품 ${r.growthProducts}개`)}</span></>}</span>
            </div>
          );
        }} />
      </div>
      <Basis className="border-t border-line px-4 py-2.5">
        {tr(<>Shelf: {board.shelfTotal.toLocaleString("en-IN")} top-100 places on {dayLabel(board.shelfDay)}; the 14-day change counts only the {board.likeForLikeCats} categories tracked on both days. Search: unpaid top 10 of every tracked keyword on {dayLabel(board.searchDay)}. Reviews: {compact(board.demandTotal)} reviews for tracked products in {win}. Grey tick = median of the focus brands.</>,
          <>진열: {dayLabel(board.shelfDay)} 상위 100위 자리 {board.shelfTotal.toLocaleString("en-IN")}개. 14일 변화는 두 날짜 모두 추적한 카테고리 {board.likeForLikeCats}개만 셉니다. 검색: {dayLabel(board.searchDay)} 추적 키워드 전체의 비광고 상위 10개. 리뷰: {win} 추적 제품 리뷰 {compact(board.demandTotal)}건. 회색 눈금 = 주요 브랜드 중앙값.</>)}
      </Basis>
    </Card>
  );
}

function QuadTag({ q }: { q: NonNullable<CategoryCell["quadrant"]> }) {
  const c = { accent: "bg-accent-soft text-accent-strong", good: "bg-good-soft text-good", muted: "bg-sunken text-ink-2", bad: "bg-bad-soft text-bad" }[QUAD[q].tone];
  return <span title={QUAD[q].read} className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${c}`}>{QUAD[q].label}</span>;
}

function ProductBars({ rows, anchor, highlight, compactNames }: { rows: DemandRow[]; anchor: string; highlight?: string; compactNames?: boolean }) {
  const open = useOpenProduct();
  const max = Math.max(1, ...rows.map((r) => r.recent));
  return (
    <div className="space-y-1">
      {rows.map((r) => {
        const hl = highlight ? r.product_id === highlight : same(r.brand, anchor);
        return (
          <button key={r.product_id} onClick={() => open({ product_id: r.product_id, name: r.name, brand: r.brand, url: r.url })} className="grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_44px] items-center gap-2 rounded-md px-1 py-0.5 text-left text-[12px] hover:bg-sunken/60">
            <span className={`truncate ${hl ? "font-semibold" : ""}`} title={r.name}><span className="text-muted">{r.brand}</span> {compactNames ? shortName(r.name, r.brand).split(/,| - | with /)[0] : shortName(r.name, r.brand)}</span>
            <span className="h-2 rounded-full bg-sunken"><span className={`block h-2 rounded-full ${hl ? "bg-accent-strong" : "bg-brand/60"}`} style={{ width: `${(r.recent / max) * 100}%` }} /></span>
            <span className="text-right tabular">{compact(r.recent)}</span>
          </button>
        );
      })}
    </div>
  );
}

function CatalogList({ rows }: { rows: CatalogRow[] }) {
  const open = useOpenProduct();
  return (
    <div className="space-y-0.5">
      {rows.map((r) => (
        <button key={r.product_id} onClick={() => open({ product_id: r.product_id, name: r.name, brand: r.brand, url: r.url, price: r.price, mrp: r.mrp, rating: r.rating, rating_count: r.rating_count })}
          className="grid w-full grid-cols-[1fr_auto] gap-3 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-surface">
          <span className="min-w-0"><span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-2">{r.brand}</span> <span className="block truncate">{shortName(r.name, r.brand)}</span></span>
          <span className="text-right tabular">{inr(r.mrp ?? r.price)}<span className="block text-[11px] text-muted">{r.rating_count ? tr(`${compact(r.rating_count)} ratings`, `평가 ${compact(r.rating_count)}건`) : tr("no ratings", "평가 없음")}</span></span>
        </button>
      ))}
    </div>
  );
}

/* ================================================================ keyword view and next steps */

function keywordView(search: SearchRow[], anchor: string, inSet: (b: string) => boolean) {
  const byQ = new Map<string, SearchRow[]>(); search.forEach((r) => push(byQ, r.query, r));
  const out: { q: string; pos: number | null; leader: string | null; focusTop3: string | null }[] = [];
  for (const [q, rs] of byQ) {
    const minS = Math.min(...rs.map((r) => r.sample));
    const unpaid = rs.filter((r) => !r.is_ad && r.sample === minS).sort((a, b) => a.rank - b.rank).slice(0, 10);
    if (!unpaid.length) continue;
    const i = unpaid.findIndex((r) => same(r.brand, anchor));
    out.push({ q, pos: i >= 0 ? i + 1 : null, leader: unpaid[0]?.brand ?? null, focusTop3: unpaid.slice(0, 3).find((r) => inSet(r.brand) && !same(r.brand, anchor))?.brand ?? null });
  }
  return { rows: out, total: out.length, absent: out.filter((x) => x.pos === null).length };
}

interface Step { what: string; who: string; why: string; href: string; tone?: "good" | "bad"; impact: number }

function nextSteps({ anchor, cmap, market, usual, gapCells, gaps, me, kw, oos, findings, rows }: {
  anchor: string; cmap: CategoryCell[]; market: number | null; usual: number; gapCells: (GapCell & { category: string })[]; gaps: ReturnType<typeof rangeGrid>;
  me: ScoreRow | undefined; kw: ReturnType<typeof keywordView>; oos: { name: string; brand: string; rating_count: number | null }[]; findings: Finding[]; rows: DemandRow[];
}): Step[] {
  const out: Step[] = [];
  const best = (c: string) => rows.filter((r) => r.category === c && same(r.brand, anchor)).sort((a, b) => b.recent - a.recent)[0];
  const growthOf = (c: string) => cmap.find((x) => x.category === c)?.growth ?? null;
  for (const o of oos.filter((x) => (x.rating_count ?? 0) >= 1000).slice(0, 2)) out.push({ what: tr(`Restock ${shortName(o.name, o.brand)}`, `${shortName(o.name, o.brand)} 재입고`), who: tr(`${anchor} supply team`, `${anchor} 공급 담당`), why: tr(`Out of stock today with ${compact(o.rating_count ?? 0)} ratings of demand behind it; Nykaa drops unavailable products from its lists, so every day out sends buyers to rivals.`, `평가 ${compact(o.rating_count ?? 0)}건만큼의 수요가 있는데 오늘 품절입니다. Nykaa는 구매 불가 제품을 목록에서 빼므로, 품절인 하루하루 구매자가 경쟁사로 갑니다.`), href: "#changes", tone: "bad", impact: 70 + Math.min(25, (o.rating_count ?? 0) / 1000) });
  for (const c of cmap.filter((x) => x.quadrant === "opportunity").slice(0, 2)) {
    const b = best(c.category);
    out.push({ what: tr(`Push ${b ? shortName(b.name, anchor).split(/,| - | with /)[0] : "a product"} in ${cat(c.category).toLowerCase()}`, `${cat(c.category)}에서 ${b ? shortName(b.name, anchor).split(/,| - | with /)[0] : "제품"} 강화`), who: b ? tr(`${anchor}'s best seller here (${b.recent} reviews in 3 months)`, `이 카테고리 ${anchor} 베스트셀러 (3개월 리뷰 ${b.recent}건)`) : tr(`${anchor} has no tracked product here yet`, `아직 추적 중인 ${anchor} 제품 없음`),
      why: tr(`The category grows ${signed(c.growth)} vs all tracked products' ${signed(market)}, but ${anchor} holds ${pct(c.anchorShare)} of it against its usual ${pct(usual)}; ${c.focusLeader?.brand ?? c.leader.brand} leads with ${pct(c.focusLeader?.share ?? c.leader.share)}.`, `카테고리는 ${signed(c.growth)} 성장(추적 전체 ${signed(market)})하는데 ${anchor}의 점유율은 ${pct(c.anchorShare)}로 평소 ${pct(usual)}보다 낮습니다. 선두는 ${c.focusLeader?.brand ?? c.leader.brand}(${pct(c.focusLeader?.share ?? c.leader.share)}).`), href: "#portfolio", impact: 80 + Math.min(15, c.recent / 1000) });
  }
  const growingGaps = [...gapCells].sort((a, b) => (growthOf(b.category) ?? -1) - (growthOf(a.category) ?? -1) || b.rivals.length - a.rivals.length);
  for (const g of growingGaps.slice(0, 1)) out.push({ what: tr(`Fill the ${g.label} band in ${cat(g.category).toLowerCase()}`, `${cat(g.category)} ${bandLabel(g.label)} 가격대 채우기`), who: tr(`${anchor} range planning`, `${anchor} 상품 기획`), why: tr(`${g.rivals.length} focus-brand products (${g.rivalBrands.slice(0, 3).join(", ")}${g.rivalBrands.length > 3 ? "…" : ""}) sell at this MRP and ${anchor} has none; the category grows ${signed(growthOf(g.category))}.`, `이 정가대에서 주요 브랜드 제품 ${g.rivals.length}개(${g.rivalBrands.slice(0, 3).join(", ")}${g.rivalBrands.length > 3 ? "…" : ""})가 팔리는데 ${anchor} 제품은 없습니다. 카테고리 성장률 ${signed(growthOf(g.category))}.`), href: "#gaps", impact: 70 + g.rivals.length });
  if (me && me.search < me.demand * 0.8 && kw.total) {
    const lost = kw.rows.filter((x) => x.pos === null && x.focusTop3).slice(0, 3);
    out.push({ what: tr(`Win back search${lost.length ? ` on "${lost.map((x) => x.q).join('", "')}"` : ""}`, `${lost.length ? `"${lost.map((x) => x.q).join('", "')}" ` : ""}검색 노출 되찾기`), who: tr(`${anchor} search and ads`, `${anchor} 검색·광고 담당`), why: tr(`${anchor} gets ${pct(me.search)} of search but ${pct(me.demand)} of reviews: shoppers who search find it less often than buyers choose it. ${lost.length ? `A focus brand sits in the top 3 on these keywords where ${anchor} is absent.` : ""}`, `${anchor}의 검색 점유율은 ${pct(me.search)}인데 리뷰 점유율은 ${pct(me.demand)}입니다. 구매자가 선택하는 만큼 검색에서 찾지 못하고 있습니다. ${lost.length ? `이 키워드에서는 주요 브랜드가 상위 3위 안에 있고 ${anchor}는 없습니다.` : ""}`), href: "#standing", impact: 75 });
  }
  for (const f of findings.slice(0, 1)) out.push({ what: tr(`Answer ${f.brand}'s move${f.category ? ` in ${cat(f.category).toLowerCase()}` : ""}`, `${f.category ? `${cat(f.category)}에서 ` : ""}${f.brand}의 움직임에 대응`), who: tr(`${anchor} category team`, `${anchor} 카테고리 담당`), why: `${f.headline}. ${f.soWhat}`, href: "#changes", tone: "bad", impact: 60 + Math.min(20, f.weight / 5) });
  for (const c of cmap.filter((x) => x.quadrant === "invest").slice(0, 1)) {
    const b = best(c.category);
    out.push({ what: tr(`Protect ${cat(c.category).toLowerCase()}`, `${cat(c.category)} 방어`), who: b ? `${shortName(b.name, anchor).split(/,| - | with /)[0]}` : anchor, why: tr(`A growing category (${signed(c.growth)}) where ${anchor} does better than usual (${pct(c.anchorShare)} vs ${pct(usual)}); keep the hero visible and in stock.`, `${josa(anchor, "이/가")} 평소보다 강한(${pct(c.anchorShare)}, 평소 ${pct(usual)}) 성장 카테고리(${signed(c.growth)})입니다. 히어로 제품의 노출과 재고를 지키세요.`), href: "#portfolio", tone: "good", impact: 55 });
  }
  if (!gaps.length) out.push({ what: tr("Collect this brand's catalogue", "이 브랜드 카탈로그 수집"), who: tr("Data", "데이터"), why: tr("Range gaps and heroes need the brand's full Nykaa range.", "라인업 공백과 히어로 분석에는 브랜드의 Nykaa 전체 라인업이 필요합니다."), href: "#gaps", impact: 10 });
  return out.sort((a, b) => b.impact - a.impact).slice(0, 5);
}
