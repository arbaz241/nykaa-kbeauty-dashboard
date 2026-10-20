"use client";

import { TrackedLink } from "@/components/TrackedProducts";
import MethodNotes, { BUYING_METHOD } from "@/components/MethodNotes";
import { useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { DetailHead, Missing, Opens, Points, useDetail, type DetailContent } from "@/components/Detail";
import KBeautyOverview, { useKFights } from "@/components/KBeautyOverview";
import CategoryBoard from "@/components/analysis/CategoryBoard";
import { useOpenProduct } from "@/components/ProductDrawer";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import Shell from "@/components/Shell";
import { Basis, BrandSelect, Def, TieredList } from "@/components/Tiered";
import { Card, Loading, PageHead, Verdict } from "@/components/ui";
import { norm } from "@/lib/brands";
import { useAvailability, useBrandDaily, useBrandShares, useCatalog, useCategoryCoverage, useDemand, useMovement, useReviewMonths, useSearch, useSearchHistory, useShelf } from "@/lib/data";
import { BANDS, QUAD, categoryMap, demandRows, demandWindow, rangeGrid, scoreboard, type CategoryCell, type DemandRow, type GapCell, type ScoreRow } from "@/lib/analysis";
import { buildFindings, type Finding } from "@/lib/findings";
import { CATEGORIES, CATEGORY_LABEL, compact, inr, shortName } from "@/lib/format";
import { useMarket } from "@/lib/useMarket";
import { heroProducts } from "@/lib/hero";
import { useTiers } from "@/lib/tiers";
import type { BrandDaily, CatalogRow, SearchRow } from "@/lib/types";
import { push } from "@/lib/group";
import { bandLabel } from "@/lib/analysis";
import { dayMonth, josa, tr } from "@/lib/i18n";
import { ScopeLine } from "@/components/Scope";

/** Analysis: the landing page, as one story (Round 3 plan, owner decisions 12 Oct 2026).
 *  Verdict → scoreboard vs the rival set → where the anchor wins and loses by category → what changed →
 *  hero products → range gaps → next steps → events. Every number carries what it is compared against. */

// plan v3: the anchor first, against its Korean rivals only; Nykaa-wide events live on Offers & events
const NAV = (anchor: string): NavItem[] => [
  { id: "summary", label: tr(`${anchor} in one line`, `${anchor} 요약`) }, { id: "fights", label: tr("Category by category", "카테고리별 대결") }, { id: "rivals", label: tr("Rivals scorecard", "경쟁사 스코어카드") },
  { id: "standing", label: tr("Seen vs bought", "노출 vs 구매") },
  { id: "changes", label: tr("Rivals' moves", "경쟁사 동향") }, { id: "heroes", label: tr("Hero products", "히어로 제품") }, { id: "gaps", label: tr("Range gaps", "라인업 공백") }, { id: "next", label: tr("Worth a look", "더 볼 곳") }, { id: "method", label: tr("How this page works", "계산 방법") },
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
  const detail = useDetail(); const open = useOpenProduct(); const m = useMarket();
  // shelf counts on the same basis as every other tab (audit 19 Oct: the brand-daily summary counted the hidden
  // cleansing-balm list and products Nykaa files under another category, so this tab said 1,497 top-100 products while
  // the others say 1,306 and Nykaa Skin had 43 here, 40 on Market): own-category rows of the 15 lists, per brand and day
  const ownDaily = useMemo<BrandDaily[] | null>(() => {
    if (!m.ready) return null;
    const by = new Map<string, BrandDaily>();
    for (const [day, rows] of m.ix.byDay) for (const r of rows.values()) {
      if (!CATEGORIES.includes(r.subcategory)) continue;
      const d = m.dims.get(r.product_id); if (!d) continue;
      const k = `${day}|${r.subcategory}|${norm(d.brand)}`; const x = by.get(k);
      if (x) { x.slots++; x.best_rank = Math.min(x.best_rank, r.rank); if (r.rank <= 20) x.top20++; }
      else by.set(k, { scrape_date: day, brand: d.brand, origin: (d.origin ?? "unknown") as BrandDaily["origin"], subcategory: r.subcategory, slots: 1, best_rank: r.rank, top20: r.rank <= 20 ? 1 : 0 });
    }
    return [...by.values()];
  }, [m.ready, m.ix, m.dims]);

  const known = useMemo(() => [...new Set([...(shelf.data ?? []).map((r) => r.brand), ...(months.data ?? []).map((m) => m.brand)])].sort(), [shelf.data, months.data]);
  const tiers = useTiers(known);
  // plan v2: the brand page links here with ?brand=, so the brief opens on that brand
  const [picked, setPicked] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("brand")));
  const anchor = picked ?? tiers.pinned;
  const deep = tiers.inSet(anchor);
  // this tab's rivals are the Korean brands in the tiers (audit 19 Oct: range gaps counted Dot & Key and Foxtale as
  // "K-beauty rivals", "17 from 17 K-beauty rivals" with only 10 rivals)
  const isRival = useMemo(() => (b: string) => tiers.inSet(b) && tiers.group(b) === "korean", [tiers]);
  const [scope, setScope] = useState<"set" | "all">("set");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [openTheme, setOpenTheme] = useState<string | null>(null);
  const win = demandWindow();

  const ready = !!(m.ready && ownDaily && shelf.data && movement.data && shares.data && demand.data && months.data && daily.data && catalog.data && searchHist.data);
  const rows = useMemo(() => (ready ? demandRows(months.data!, demand.data!, shelf.data!, catalog.data!) : []), [ready, months.data, demand.data, shelf.data, catalog.data]);
  const complete = useMemo(() => {
    // every product whose own history covers both windows (variants included), for the demand rules
    const cov = new Map<string, string>(); for (const m of months.data ?? []) if (!cov.has(m.product_id) || m.coverage_start > cov.get(m.product_id)!) cov.set(m.product_id, m.coverage_start);
    return new Set([...cov.entries()].filter(([, c]) => c <= win.priorMonths[0]).map(([p]) => p));
  }, [months.data, win.priorMonths]);
  // plan v3: compared with the Korean rivals only (owner: "I'm not fighting with Minimalist... I'm fighting with Beauty of Joseon, Anua")
  const setBrands = useMemo(() => [...new Set([tiers.pinned, ...tiers.focus.filter((b) => tiers.group(b) === "korean"), anchor])], [tiers, anchor]);
  const korean = useMemo(() => new Set((shelf.data ?? []).filter((r) => r.origin === "kbeauty").map((r) => norm(r.brand))), [shelf.data]);
  const rivals = useMemo(() => tiers.focus.filter((b) => tiers.group(b) === "korean"), [tiers]);
  const fights = useKFights(anchor, rivals);
  const board = useMemo(() => {
    if (!ready) return null;
    const others = known.filter((b) => !setBrands.some((x) => same(x, b)));
    return scoreboard([...setBrands, ...others], ownDaily!, shares.data!, rows, searchHist.data!, m.flow, CATEGORIES);
  }, [ready, known, setBrands, ownDaily, shares.data, rows, searchHist.data, m.flow]);
  const setRows = useMemo(() => (board ? board.rows.filter((r) => setBrands.some((b) => same(b, r.brand))) : []), [board, setBrands]);
  const me = setRows.find((r) => same(r.brand, anchor));
  const poolOf = useMemo(() => { const p = new Map((demand.data ?? []).map((d) => [d.product_id, d.pool_id || d.product_id])); return (pid: string) => p.get(pid) ?? pid; }, [demand.data]);
  const cmap = useMemo(() => (ready ? categoryMap(anchor, rows, (b) => tiers.inSet(b), m.flow, poolOf, CATEGORIES) : null), [ready, anchor, rows, tiers, m.flow, poolOf]);
  // owner 20 Oct 2026: "0.3% of all buying" read as meaningless; on this tab a brand is put against Korean brands' buying
  const koreanBuying = useMemo(() => { const cs = new Set(CATEGORIES); return m.flow.filter((f) => cs.has(f.subcategory) && f.origin === "kbeauty" && f.value > 0).reduce((a, f) => a + f.value, 0); }, [m.flow]);
  const buySpan = m.flowSpan ? `${dayMonth(m.flowSpan.start)}–${dayMonth(m.flowSpan.end)}` : "";
  const findings = useMemo(() => (ready ? buildFindings({ anchor, movement: movement.data!, shares: shares.data!, demand: demand.data!, availability: availability.data ?? [], coverage: coverage.data ?? [], complete })
    .filter((f) => !f.brand || korean.has(norm(f.brand))) : []),
    [ready, anchor, movement.data, shares.data, demand.data, availability.data, coverage.data, complete, korean]);
  const heroes = useMemo(() => (ready ? heroProducts(anchor, movement.data!, demand.data!, catalog.data!).slice(0, 4) : []), [ready, anchor, movement.data, demand.data, catalog.data]);
  const gaps = useMemo(() => (catalog.data ? rangeGrid(anchor, catalog.data, isRival) : []), [catalog.data, anchor, isRival]);
  const kw = useMemo(() => keywordView(search.data ?? [], anchor, isRival), [search.data, anchor, isRival]);

  if (!ready || !board || !cmap) return <Shell active="Analysis"><PageHead eyebrow={tr("K-beauty", "K-뷰티")} title={tr(`${anchor} against its Korean rivals`, `${anchor} vs K-뷰티 경쟁사`)} sub={tr("Where the brand stands, where it wins and loses, what changed and what to do next.", "브랜드의 현재 위치, 강점·약점, 달라진 점, 다음에 할 일.")} /><Loading what={tr("today's analysis", "오늘의 분석")} /></Shell>;

  /* ---------------- relevance: the brands that matter first */
  const anchorCats = new Set((shelf.data ?? []).filter((r) => same(r.brand, anchor)).map((r) => r.subcategory));
  const relevant = (f: Finding) => !f.brand || same(f.brand, anchor) || tiers.inSet(f.brand);
  const weight = (f: Finding) => f.weight * (f.brand && same(f.brand, anchor) ? 1.6 : !f.brand ? 1.1 : tiers.inSet(f.brand) ? 1.3 : 0.5) * (f.category && anchorCats.has(f.category) ? 1.2 : 1);
  const ranked = [...findings].sort((a, b) => weight(b) - weight(a));
  // one card per brand when one rule fires on several of its products (owner 20 Oct 2026: say it once): the anchor's
  // out-of-stock products were 4 of the top 5, and one rival's price cuts can fill two more
  const rel = ranked.filter(relevant);
  const name = (f: Finding) => shortName(f.product?.name ?? "", f.brand ?? "");
  const groups = new Map<string, Finding[]>();
  for (const f of rel) { const rule = f.id.split("-")[0]; if ((rule === "oos" || rule === "price") && f.brand) push(groups, `${rule}|${norm(f.brand)}`, f); }
  const merged = new Map<Finding, Finding>(); const absorbed = new Set<Finding>();
  for (const [k, fs] of groups) {
    if (fs.length < 2) continue;
    const rule = k.split("|")[0]; const b = fs[0].brand!;
    merged.set(fs[0], { ...fs[0], id: `${k}-group`,
      headline: rule === "oos"
        ? tr(`${b} is out of stock on ${fs.length} products: ${fs.map(name).join("; ")}`, `${b} 제품 ${fs.length}개 품절: ${fs.map(name).join("; ")}`)
        : tr(`${b} cut prices on ${fs.length} products: ${fs.map((f) => `${name(f)} (${f.category ? cat(f.category) : ""}, ${f.evidence.find((e) => e.label === tr("Was", "이전"))?.value ?? ""} → ${f.evidence.find((e) => e.label === tr("Now", "현재"))?.value ?? ""})`).join("; ")}`,
          `${b} 제품 ${fs.length}개 가격 인하: ${fs.map((f) => `${name(f)} (${f.category ? cat(f.category) : ""}, ${f.evidence.find((e) => e.label === tr("Was", "이전"))?.value ?? ""} → ${f.evidence.find((e) => e.label === tr("Now", "현재"))?.value ?? ""})`).join("; ")}`),
      ...(rule === "price" && !same(b, anchor) ? { soWhat: tr(`${anchor}'s products in ${[...new Set(fs.map((f) => cat(f.category)))].join(", ").toLowerCase()} now look relatively more expensive.`, `${[...new Set(fs.map((f) => cat(f.category)))].join(", ")}에서 ${anchor} 제품이 상대적으로 비싸 보이게 됨.`) } : {}),
      evidence: fs.map((f) => ({ label: name(f), value: f.evidence.map((e) => `${e.label} ${e.value}`).join(" · ") })) });
    fs.slice(1).forEach((f) => absorbed.add(f));
  }
  const listed = rel.filter((f) => !absorbed.has(f)).map((f) => merged.get(f) ?? f);
  const top5 = listed.slice(0, 5);
  const shownN = top5.reduce((a, f) => a + (groups.get(f.id.replace(/-group$/, ""))?.length ?? 1), 0);
  const inScope = (f: Finding) => (scope === "all" || relevant(f)) && (catFilter === "all" || f.category === catFilter);
  const findingCats = [...new Set(findings.map((f) => f.category).filter((c): c is string => !!c))].sort();

  /* ---------------- verdict */
  const n = setRows.length;
  const lead = (k: "shelf" | "search" | "demand") => [...setRows].filter((r) => !same(r.brand, anchor)).sort((a, b) => b[k] - a[k])[0];
  const mkt = board.market.growth;
  const gapCells = gaps.flatMap((g) => g.bands.filter((b) => b.gap).map((b) => ({ category: g.category, ...b })));
  const oos = (availability.data ?? []).filter((a) => same(a.brand, anchor));
  const absentCats = cmap.cells.filter((c) => c.buying > 0 && c.anchorPlace === null);
  const topFive = cmap.cells.filter((c) => c.anchorPlace !== null && c.anchorPlace <= 5).sort((a, b) => a.anchorPlace! - b.anchorPlace!);
  const inTop = cmap.cells.filter((c) => c.anchorPlace !== null);
  const fastAbsent = absentCats.filter((c) => c.growth !== null && mkt !== null && c.growth >= mkt && !c.thin).sort((a, b) => b.growth! - a.growth!);
  const sellsIn = (c: string) => (catalog.data ?? []).filter((r) => same(r.brand, anchor) && r.subcategories.includes(c)).length;
  // overall view (owner 20 Oct 2026: "be gentle… don't give statements too leaning on some front"; shelf and search
  // places move with buying, offers and ads, so they are positions, not levers): the three ratios to the rivals' median
  const idx = me ? (["demand", "shelf", "search"] as const).map((k) => ({ k, r: me[k] / (median(setRows.map((x) => x[k])) || 1e-9) })) : [];
  const word = { get shelf() { return tr("places in the top 100s", "상위 100위 자리"); }, get search() { return tr("unpaid search places", "비광고 검색 자리"); }, get demand() { return tr("share of buying", "구매 점유율"); } };
  const overall = !idx.length ? "" : tr(`against its ${n - 1} Korean rivals, ${anchor} sits at ${idx.map((x) => `${x.r.toFixed(1)}× their median on ${word[x.k]}`).join(", ")}. Places on Nykaa's lists and in search follow buying, offers and ads, so read them as where the brand shows up today rather than as the cause`,
    `K-뷰티 경쟁사 ${n - 1}곳 대비 ${anchor}: ${idx.map((x) => `${word[x.k]} 중앙값의 ${x.r.toFixed(1)}배`).join(", ")}. 목록·검색 자리는 구매·프로모션·광고에 따라 움직이므로 원인이 아니라 오늘의 노출 위치로 읽기`);
  const wins = fights.filter((f) => f.anchor.place === 1);
  const nearest = fights.filter((f) => f.anchor.place && f.anchor.place > 1).sort((a, b) => (a.anchor.place ?? 99) - (b.anchor.place ?? 99) || b.anchor.share - a.anchor.share)[0];
  const biggestGap = fights.filter((f) => f.korean[0] && !same(f.korean[0].brand, anchor)).sort((a, b) => b.total - a.total)[0];
  const headline = fights.length ? tr(`${anchor} leads the Korean brands in ${wins.length} of the ${fights.filter((f) => f.total > 0).length} categories with buying data where it or its rivals sell${wins.length ? ` (${wins.map((w) => cat(w.cat).toLowerCase()).join(", ")})` : ""}.${wins[0] ? ` In ${cat(wins[0].cat).toLowerCase()} it has ${pct(wins[0].anchor.share, 1)} of all buying and ${pct(wins[0].anchor.ofKorean)} of Korean buying.` : ""}${nearest ? ` It comes closest in ${cat(nearest.cat).toLowerCase()}, #${nearest.anchor.place} among Korean brands with ${pct(nearest.anchor.share, 1)} of all buying.` : ""}${biggestGap ? ` The biggest Korean seller it faces is ${biggestGap.korean[0].brand} in ${cat(biggestGap.cat).toLowerCase()} (${pct(biggestGap.korean[0].share)} of all buying).` : ""}`,
      `${josa(anchor, "은/는")} 자신이나 경쟁사가 파는, 구매 데이터가 있는 ${fights.filter((f) => f.total > 0).length}개 카테고리 중 ${wins.length}곳에서 K-뷰티 1위${wins.length ? ` (${wins.map((w) => cat(w.cat)).join(", ")})` : ""}.${wins[0] ? ` ${cat(wins[0].cat)}: 전체 구매의 ${pct(wins[0].anchor.share, 1)}, K-뷰티 구매의 ${pct(wins[0].anchor.ofKorean)}.` : ""}${nearest ? ` 가장 근접한 곳은 ${cat(nearest.cat)}: K-뷰티 브랜드 중 ${nearest.anchor.place}위, 전체 구매의 ${pct(nearest.anchor.share, 1)}.` : ""}${biggestGap ? ` 가장 큰 K-뷰티 경쟁자: ${cat(biggestGap.cat)}의 ${biggestGap.korean[0].brand} (전체 구매의 ${pct(biggestGap.korean[0].share)}).` : ""}`)
    : tr(`${anchor} has no listing or tracked demand today.`, `${josa(anchor, "은/는")} 오늘 진열 제품도, 추적 중인 수요도 없음.`);
  const verdictPoints = me ? tr([
    <><b className="text-on-brand">Products in Nykaa&rsquo;s top 100s:</b> {me.shelfSlots} of {board.shelfTotal.toLocaleString("en-IN")} ({pct(me.shelf)}); {lead("shelf")?.brand} leads the rival set with {lead("shelf")?.shelfSlots}. {me.slotsChange !== null && <>{me.slotsChange === 0 ? "No change from" : `${Math.abs(me.slotsChange)} ${me.slotsChange > 0 ? "more" : "fewer"} than`} 14 days ago, counted on the {board.likeForLikeCats} categories tracked throughout.</>}</>,
    <><b className="text-on-brand">Search results:</b> {pct(me.search)} of unpaid top-10 results across today&rsquo;s keywords; {lead("search")?.brand} leads with {pct(lead("search")?.search ?? 0)}.{kw.total ? ` Absent from the top 10 on ${kw.absent} of ${kw.total} keywords.` : ""}</>,
    <><b className="text-on-brand">Buying:</b> {pct(koreanBuying ? me.buying / koreanBuying : 0, 1)} of all Korean brands&rsquo; buying across the {CATEGORIES.length} top 100s ({buySpan}); the biggest of its rivals, {lead("demand")?.brand}, has {pct(koreanBuying && lead("demand") ? lead("demand")!.buying / koreanBuying : 0, 1)}. Written-review growth {signed(me.growth)} vs <TrackedLink /> {signed(mkt)} ({win.recent} vs {win.prior}, same products).</>,
    <><b className="text-on-brand">Range and stock:</b> {gapCells.length ? `${gapCells.length} price band${gapCells.length === 1 ? "" : "s"} where K-beauty rivals sell 3+ products and ${anchor} none` : "no price band left open to the K-beauty rivals"}; {oos.length ? `${oos.length} product${oos.length === 1 ? "" : "s"} out of stock today` : "nothing out of stock today"}.</>,
  ], [
    <><b className="text-on-brand">Nykaa 상위 100위 제품:</b> {board.shelfTotal.toLocaleString("en-IN")}개 중 {me.shelfSlots}개({pct(me.shelf)}). K-뷰티 경쟁사 중 선두: {lead("shelf")?.brand}({lead("shelf")?.shelfSlots}개). {me.slotsChange !== null && <>14일 전 대비 {me.slotsChange === 0 ? "변화 없음" : `${me.slotsChange > 0 ? "+" : ""}${me.slotsChange}개`} (기간 내내 추적한 카테고리 {board.likeForLikeCats}개 기준).</>}</>,
    <><b className="text-on-brand">검색:</b> 오늘 키워드 전체의 비광고 상위 10개 결과 중 {pct(me.search)}. 선두: {lead("search")?.brand}({pct(lead("search")?.search ?? 0)}).{kw.total ? ` 키워드 ${kw.total}개 중 ${kw.absent}개에서 상위 10위 밖.` : ""}</>,
    <><b className="text-on-brand">구매:</b> 상위 100위 {CATEGORIES.length}개의 K-뷰티 브랜드 전체 구매 중 {pct(koreanBuying ? me.buying / koreanBuying : 0, 1)} ({buySpan}). 최대 경쟁사 {lead("demand")?.brand}: {pct(koreanBuying && lead("demand") ? lead("demand")!.buying / koreanBuying : 0, 1)}. 작성 리뷰 성장률 {signed(me.growth)}, <TrackedLink /> {signed(mkt)} ({win.recent} vs {win.prior}, 동일 제품).</>,
    <><b className="text-on-brand">라인업·재고:</b> {gapCells.length ? `K-뷰티 경쟁사는 3개 이상 파는데 ${anchor} 제품은 없는 가격대 ${gapCells.length}곳` : "K-뷰티 경쟁사에 내준 가격대 없음"}. {oos.length ? `오늘 품절 제품 ${oos.length}개` : "오늘 품절 제품 없음"}.</>,
  ]) : [];

  /* ---------------- next steps: up to five, ranked by impact, each tied to its evidence */
  const steps = nextSteps({ anchor, cmap: cmap.cells, market: mkt, gapCells, gaps, me, kw, oos, findings: ranked.filter((f) => f.tone === "threat" && f.brand && isRival(f.brand) && !same(f.brand, anchor)), rows, span: buySpan });

  const catDetail = (c: CategoryCell): DetailContent => {
    const ps = rows.filter((r) => r.category === c.category).sort((a, b) => b.recent - a.recent);
    const mine = ps.filter((r) => same(r.brand, anchor));
    return {
      kicker: `${cat(c.category)} · ${c.quadrant ? QUAD[c.quadrant].label : tr("not placed", "미배치")}`,
      title: c.quadrant ? tr(QUAD[c.quadrant].read.replace("the anchor's", `${anchor}'s`), QUAD[c.quadrant].read.replace("기준 브랜드의", `${anchor}의`)) : tr(`Not placed: ${c.thin ?? "no growth reading"}`, `미배치: ${c.thin ?? "성장률 판단 불가"}`),
      body: (<>
        <Points items={tr([
          <>Written-review growth <b>{signed(c.growth)}</b>: {c.growthBase.recent.toLocaleString("en-IN")} reviews in {win.recent} vs {c.growthBase.prior.toLocaleString("en-IN")} in {win.prior}, from {c.growthBase.products} products that hold {pct(c.coverage)} of the category&rsquo;s buying. All tracked products: {signed(mkt)}.</>,
          <>{anchor}: {c.buying ? `${pct(c.anchorShare, 1)} of the category's buying (${buySpan}), ${c.anchorProducts} product${c.anchorProducts === 1 ? "" : "s"} in the top 100` : "no buying counted in this list yet"}{c.anchorPlace ? `; #${c.anchorPlace} of the ${c.brandsCounted} brands with buying here` : ""}.</>,
          <>Biggest seller: {c.leader.brand} ({pct(c.leader.share)} of buying){c.focusLeader && !same(c.focusLeader.brand, c.leader.brand) ? `; biggest main brand ${c.focusLeader.brand} (${pct(c.focusLeader.share)})` : ""}.</>,
        ], [
          <>작성 리뷰 성장률 <b>{signed(c.growth)}</b>: {win.recent} 리뷰 {c.growthBase.recent.toLocaleString("en-IN")}건, {win.prior} {c.growthBase.prior.toLocaleString("en-IN")}건 (카테고리 구매의 {pct(c.coverage)}를 차지하는 제품 {c.growthBase.products}개). 추적 전체: {signed(mkt)}.</>,
          <>{anchor}: {c.buying ? `카테고리 구매의 ${pct(c.anchorShare, 1)} (${buySpan}), 상위 100위 제품 ${c.anchorProducts}개` : "이 목록은 아직 구매 집계 없음"}{c.anchorPlace ? `, 구매 집계 브랜드 ${c.brandsCounted}곳 중 ${c.anchorPlace}위` : ""}.</>,
          <>최대 판매: {c.leader.brand}(구매의 {pct(c.leader.share)}){c.focusLeader && !same(c.focusLeader.brand, c.leader.brand) ? `. 주요 브랜드 중 최대: ${c.focusLeader.brand}(${pct(c.focusLeader.share)})` : ""}.</>,
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
    title: b.gap ? tr(`${anchor} has nothing here; ${b.rivalBrands.length} K-beauty rival${b.rivalBrands.length === 1 ? "" : "s"} sell ${b.rivals.length} products`, `${anchor} 제품 없음 · K-뷰티 경쟁사 ${b.rivalBrands.length}곳이 ${b.rivals.length}개 판매`) : tr(`${anchor} ${b.anchor.length} · K-beauty rivals ${b.rivals.length}`, `${anchor} ${b.anchor.length}개 · K-뷰티 경쟁사 ${b.rivals.length}개`),
    body: (<>
      <p className="text-muted">{tr(<>Products in {cat(category).toLowerCase()} with an MRP of {b.label.toLowerCase()}, from each brand&rsquo;s own Nykaa catalogue. K-beauty rivals only.</>, <>{cat(category)} 중 정가 {bandLabel(b.label)}인 제품. 브랜드별 Nykaa 카탈로그 기준, K-뷰티 경쟁사만 포함.</>)}</p>
      <DetailHead>{anchor} ({b.anchor.length})</DetailHead>
      {b.anchor.length ? <CatalogList rows={b.anchor} /> : <Missing>{tr(`No ${anchor} product in this band`, `이 가격대에 ${anchor} 제품 없음`)}</Missing>}
      <DetailHead>{tr("K-beauty rivals", "K-뷰티 경쟁사")} ({b.rivals.length})</DetailHead>
      {b.rivals.length ? <CatalogList rows={[...b.rivals].sort((x, y) => (y.rating_count ?? 0) - (x.rating_count ?? 0))} /> : <Missing>{tr("No K-beauty rival sells here", "이 가격대를 파는 K-뷰티 경쟁사 없음")}</Missing>}
    </>),
  });

  const asOf = shelf.data?.[0]?.scrape_date;
  return (
    <Shell active="Analysis" asOf={asOf}>
      <PageHead eyebrow={tr("K-beauty", "K-뷰티")} title={tr(`${anchor} against its Korean rivals`, `${anchor} vs K-뷰티 경쟁사`)} sub={tr(<>{anchor} first, category by category against its {n - 1} Korean rivals, judged on what shoppers buy. Then every other Korean brand we watch, K-beauty on Nykaa as a whole, and the deeper brief. Press &ldquo;Details&rdquo; on any row to see more here.</>,
        <>{anchor} 먼저, K-뷰티 경쟁사 {n - 1}곳과 카테고리별 구매 비교 → 기타 K-뷰티 브랜드 → Nykaa의 K-뷰티 전체 → 상세 보고서. 어느 행이든 &ldquo;자세히&rdquo;를 누르면 여기서 바로 확인.</>)}
        right={<BrandSelect value={anchor} onChange={setPicked} tiers={tiers} all={known} />} />
      <ScopeLine uses={["top100", "followed"]} measure={tr("share of buying within each category (top 100s), and growth: written reviews in the last 3 complete months against the same months a year earlier, same products only.", "카테고리 안 구매 점유율(상위 100위)과 성장률: 최근 완결된 3개월 작성 리뷰를 전년 같은 달과 비교, 동일 제품만.")} />
      <SectionNav items={NAV(anchor)} />
      {!deep && <p className="mt-4 rounded-xl bg-accent-soft px-4 py-2.5 text-[13px] text-ink-2">{tr(<><b>{anchor}</b> is outside the rival set, so this is a scorecard: it is compared with the K-beauty rivals, and sections without data for it say so.</>, <><b>{anchor}</b>는 K-뷰티 경쟁사 밖이라 간이 평가로 표시. K-뷰티 경쟁사와 비교하며, 데이터 없는 영역은 따로 표시.</>)}</p>}

      <section id="summary" className="mt-6 scroll-mt-32">
        <Verdict eyebrow={tr(<>{anchor} in one line</>, <>{anchor} 요약</>)} points={verdictPoints}
          foot={me && overall && <div className="min-w-0"><b>{tr("Overall:", "종합:")}</b> {overall}. <a href="#standing" className="text-accent underline underline-offset-2">{tr("See the scoreboard ↓", "스코어보드 보기 ↓")}</a></div>}>
          {headline}
        </Verdict>
      </section>

      <KBeautyOverview tiers={tiers} anchor={anchor} />

      <ActionSection id="standing" kicker={tr("Scoreboard · against the K-beauty rivals", "스코어보드 · K-뷰티 경쟁사 대비")} title={scoreTitle(anchor, setRows)}
        note={tr(<>Three views of the same brands: places on Nykaa&rsquo;s top-100 lists, places in unpaid search, and share of buying ({buySpan}). Places follow buying, offers and ads, so they describe where a brand shows up, not why it sells. The grey tick on each bar is the rivals&rsquo; median.</>, <>같은 브랜드를 보는 세 가지 시각: Nykaa 상위 100위 자리, 비광고 검색 자리, 구매 점유율({buySpan}). 자리는 구매·프로모션·광고를 따라 움직이므로 판매 이유가 아니라 노출 위치. 막대 위 회색 눈금 = K-뷰티 경쟁사 중앙값.</>)}>
        <Scoreboard rows={board.rows} setRows={setRows} anchor={anchor} tiers={tiers} board={board} win={win.recent} span={buySpan} />
      </ActionSection>

      <ActionSection id="portfolio" kicker={tr("By category · growth, and where the brand stands", "카테고리별 · 성장과 브랜드 위치")} title={tr(`${anchor} is in the top 100 of ${inTop.length} categories and among the 5 biggest brands in ${topFive.length}${topFive.length ? ` (${topFive.slice(0, 3).map((c) => `${cat(c.category).toLowerCase()} #${c.anchorPlace}`).join(", ")})` : ""}${fastAbsent.length ? `; it has no top-100 product in ${fastAbsent.length} categor${fastAbsent.length === 1 ? "y" : "ies"} growing faster than average (${fastAbsent.slice(0, 3).map((c) => `${cat(c.category).toLowerCase()} ${signed(c.growth)}`).join(", ")})` : ""}.`,
          `${anchor}: 상위 100위에 든 카테고리 ${inTop.length}곳, 상위 5개 브랜드인 곳 ${topFive.length}곳${topFive.length ? ` (${topFive.slice(0, 3).map((c) => `${cat(c.category)} #${c.anchorPlace}`).join(", ")})` : ""}${fastAbsent.length ? `. 평균보다 빠르게 크는데 상위 100위 제품이 없는 카테고리 ${fastAbsent.length}곳 (${fastAbsent.slice(0, 3).map((c) => `${cat(c.category)} ${signed(c.growth)}`).join(", ")})` : ""}.`)}
        note={tr(<>Growth: written reviews {win.recent} vs {win.prior} on the same products, against <TrackedLink /> ({signed(mkt)}, the blue line); under each bar, how much of the category&rsquo;s buying those products hold (dashed bar = fewer than 6 products or under a quarter of its buying). {anchor}: its share of the category&rsquo;s buying ({buySpan}) and its place among the brands with buying there. Click a row for its products.</>,
          <>성장률: 작성 리뷰 {win.recent} vs {win.prior}, 동일 제품, <TrackedLink />({signed(mkt)}, 파란 선) 대비. 막대 아래 = 그 제품들이 카테고리 구매에서 차지하는 비중 (점선 막대 = 제품 6개 미만 또는 구매의 4분의 1 미만). {anchor}: 카테고리 구매 점유율({buySpan})과 구매가 집계된 브랜드 중 순위. 행을 누르면 제품 표시.</>)}>
        <CategoryBoard cells={cmap.cells} market={mkt} anchor={anchor} sells={sellsIn} onPick={(c) => detail(catDetail(c))} />
      </ActionSection>

      <ActionSection id="changes" kicker={tr("What changed · today's findings", "변화 · 오늘의 발견")} title={top5.length ? tr(`${top5.length} moves matter most today; ${findings.length - shownN} more are grouped below.`, `오늘 가장 중요한 변화 ${top5.length}건. 나머지 ${findings.length - shownN}건은 아래에 유형별로 정리.`) : tr("Nothing involving the brands that matter crossed a threshold today.", "오늘은 K-뷰티 경쟁사 관련 기준을 넘은 변화 없음.")}
        note={tr("Ranked by impact on the anchor: its own products first, then the K-beauty rivals, then its categories. Each rule states its threshold; click a finding for the numbers.", "기준 브랜드에 미치는 영향 순 (자사 제품 → K-뷰티 경쟁사 → 자사 카테고리). 규칙마다 기준값이 있고, 항목을 누르면 수치 표시.")}>
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
          {(["set", "all"] as const).map((s) => <button key={s} onClick={() => setScope(s)} className={`rounded-full px-3 py-1 ring-1 ${scope === s ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line"}`}>{s === "set" ? tr("K-beauty rivals", "K-뷰티 경쟁사") : tr("All brands", "전체 브랜드")}</button>)}
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
                        <Opens detail={findingDetail(f)}>{f.headline}{f.brand && !isRival(f.brand) && !same(f.brand, anchor) && <span className="ml-1.5 rounded bg-sunken px-1 text-[10.5px] text-muted ring-1 ring-line">{tr("outside rival set", "K-뷰티 경쟁사 외")}</span>}</Opens>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </Card>
      </ActionSection>

      <ActionSection id="heroes" kicker={tr("Hero products", "히어로 제품")} title={heroes.length ? tr(`${anchor}'s strongest product is ${shortName(heroes[0].name, anchor)}${heroes[0].edge ? `, which beats its category on ${heroes[0].edge.label.toLowerCase()}` : ""}.`, `${anchor}의 가장 강한 제품: ${shortName(heroes[0].name, anchor)}${heroes[0].edge ? ` (${heroes[0].edge.label}에서 카테고리 평균보다 앞섬)` : ""}.`) : tr(`${anchor} has no product on a tracked shelf or catalogue.`, `추적 중인 진열 목록·카탈로그에 ${anchor} 제품 없음.`)}
        note={tr(<><Def k="hero">How heroes are picked</Def>: shelf rank, reviews in {win.recent}, rating and buyer base, each scored against the median product of the same category. The bars compare each hero with the category&rsquo;s best sellers on reviews.</>, <><Def k="hero">히어로 선정 방법</Def>: 진열 순위, {win.recent} 리뷰 수, 평점, 구매자 규모를 같은 카테고리 중앙값 제품과 비교해 점수화. 막대 = 각 히어로와 카테고리 베스트셀러의 리뷰 수 비교.</>)}>
        {heroes.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {heroes.map((h, i) => {
              // sizes and shades that share one review history (Nykaa Skin's sheet masks, Innisfree's clay mask and its mini)
              // show once, so a pool is not three "best sellers" and the hero's own mini is not its rival (audit 19 Oct)
              // the hero's reviews can sit on a sibling listing of the same pool (the clay mask's ₹250 mini): that row is the hero
              const self = rows.find((r) => r.product_id === h.product_id) ?? (h.recent >= 20 ? rows.find((r) => r.category === h.category && same(r.brand, h.brand) && r.recent === h.recent) : undefined);
              const poolKey = (r: DemandRow) => (r.recent >= 20 ? `${norm(r.brand)}|${r.recent}|${r.prior}` : r.product_id);
              const seen = new Set<string>(self ? [poolKey(self)] : []);
              const peers = h.category ? rows.filter((r) => r.category === h.category).sort((a, b) => b.recent - a.recent)
                .filter((r) => { if (r.product_id === self?.product_id) return true; const k = poolKey(r); if (seen.has(k)) return false; seen.add(k); return true; }) : [];
              const shown = [...peers.filter((r) => r.product_id !== self?.product_id).slice(0, 4), ...(self ? [{ ...self, name: h.name, product_id: h.product_id }] : [])].sort((a, b) => b.recent - a.recent);
              const pos = self ? peers.findIndex((r) => r.product_id === self.product_id) + 1 : 0;
              return (
                <Card key={h.product_id} className="px-5 py-4">
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-display text-[13px] font-semibold tabular text-muted">{i + 1}</span>
                    <button onClick={() => open({ product_id: h.product_id, name: h.name, brand: h.brand, price: h.price })} className="text-left text-[14px] font-medium leading-snug hover:underline">{shortName(h.name, anchor)} ›</button>
                  </div>
                  <Basis className="mt-1">{cat(h.category)}{(() => { // the rank shown everywhere else: among products Nykaa files under the category (Nykaa's raw position differs)
                    const rk = m.shelf.find((r) => r.product_id === h.product_id && r.subcategory === h.category)?.rank ?? h.rank; return rk ? tr(` · shelf #${rk}`, ` · 진열 ${rk}위`) : ""; })()}{h.rating ? ` · ★ ${h.rating.toFixed(1)}` : ""}{h.ratingCount ? tr(` · ${compact(h.ratingCount)} ratings`, ` · 평가 ${compact(h.ratingCount)}건`) : ""}{h.edge ? tr(` · leads on ${h.edge.label.toLowerCase()}: ${h.edge.detail}`, ` · 강점 ${h.edge.label}: ${h.edge.detail}`) : ""}</Basis>
                  {shown.length > 1 ? (<>
                    <div className="mb-1 mt-3 text-[11.5px] font-medium text-ink-2">{tr(<>Reviews in {win.recent} vs the category&rsquo;s best sellers{pos ? ` (it ranks #${pos} of ${peers.length})` : ""}</>, <>{win.recent} 리뷰 수, 카테고리 베스트셀러 대비{pos ? ` (${peers.length}개 중 ${pos}위)` : ""}</>)}</div>
                    <ProductBars rows={shown} anchor={anchor} highlight={h.product_id} compactNames />
                  </>) : <p className="mt-3"><Missing>{tr("No review history to compare in this category", "이 카테고리엔 비교할 리뷰 이력 없음")}</Missing></p>}
                </Card>
              );
            })}
          </div>
        ) : <Missing>{tr("Nothing to rank", "순위를 매길 제품 없음")}</Missing>}
      </ActionSection>

      <ActionSection id="gaps" kicker={tr("Range gaps · where the K-beauty rivals sell and the brand doesn't", "라인업 공백 · K-뷰티 경쟁사는 파는데 우리는 없는 곳")} title={!gaps.length ? tr(`No catalogue is collected for ${anchor}, so its range cannot be compared.`, `${anchor} 카탈로그가 수집되지 않아 라인업 비교 불가.`) : gapCells.length ? tr(`${gapCells.length} price band${gapCells.length === 1 ? "" : "s"} across ${new Set(gapCells.map((g) => g.category)).size} categor${new Set(gapCells.map((g) => g.category)).size === 1 ? "y" : "ies"} have 3+ K-beauty rival products and no ${anchor} product.`, `카테고리 ${new Set(gapCells.map((g) => g.category)).size}곳, 가격대 ${gapCells.length}개에서 K-뷰티 경쟁사 제품은 3개 이상인데 ${anchor} 제품은 없음.`) : tr(`${anchor} has a product in every price band where the K-beauty rivals sell three or more.`, `K-뷰티 경쟁사가 3개 이상 파는 모든 가격대에 ${anchor} 제품 있음.`)}
        note={tr(<><Def k="rangeGap">How a gap is defined</Def>: each brand&rsquo;s full Nykaa range, by category and MRP band; only the K-beauty rivals count as rivals. Red = a gap. Click any cell for the exact products.</>, <><Def k="rangeGap">공백의 정의</Def>: 브랜드별 Nykaa 전체 라인업을 카테고리·정가 구간으로 나눠 봄. 경쟁사는 K-뷰티 경쟁사만 집계. 빨간 칸 = 공백, 칸을 누르면 해당 제품 표시.</>)}>
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
                          <span className={`block text-[11.5px] ${b.gap ? "" : "text-muted"}`}>{b.rivals.length ? tr(`${b.rivals.length} from ${b.rivalBrands.length} K-beauty rival${b.rivalBrands.length === 1 ? "" : "s"} ›`, `K-뷰티 경쟁사 ${b.rivalBrands.length}곳 ${b.rivals.length}개 ›`) : tr("no K-beauty rival", "K-뷰티 경쟁사 없음")}</span>
                        </>}
                      </button>
                    </td>
                  ))}
                </tr>))}</tbody>
            </table>
          </Card>
        )}
      </ActionSection>

      <ActionSection id="next" kicker={tr("Worth a closer look", "더 볼 만한 곳")} title={steps.length ? tr(`${steps.length} points from the evidence above.`, `위 근거에서 나온 ${steps.length}가지.`) : tr("Nothing stands out today.", "오늘은 눈에 띄는 것 없음.")}
        note={tr("Picked by rule from the sections above (stock, categories, range, search, the K-beauty rivals' moves); each states what the numbers show and links to them. They are prompts for discussion, not instructions.", "위 섹션(재고, 카테고리, 라인업, 검색, K-뷰티 경쟁사 움직임)에서 규칙으로 뽑은 항목. 수치가 보여 주는 것만 적고 근거로 연결. 논의 출발점이지 지시가 아님.")}>
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
      <MethodNotes parts={{
        sources: [tr("Nykaa's top 100 of each tracked category (nightly), Nykaa search results for the tracked keywords (daily), written reviews of the tracked products (monthly, up to two years back), the brands' product pages for offers, and Nykaa's own brand filter.", "추적 카테고리별 Nykaa 상위 100위(매일), 추적 키워드의 Nykaa 검색 결과(매일), 추적 제품의 작성 리뷰(월별, 최대 2년), 브랜드 상품 페이지 프로모션, Nykaa 브랜드 필터."),
          tr("Korean brands = brands from Korea (Admin › Brand origins). Indian brands \"formulated in Korea\" are Indian. The 10 rivals are the Korean brands in Admin › Brand tiers.", "K-뷰티 브랜드 = 한국 본사 브랜드(관리 › 브랜드 국적). \"한국 제조\" 인도 브랜드는 인도로 분류. 경쟁사 10곳 = 관리 › 브랜드 등급의 K-뷰티 브랜드.")],
        calc: [...BUYING_METHOD().calc, tr("Share of Korean buying: a brand's buying out of Korean brands only (= 100%), always shown next to its share of all buying.", "K-뷰티 구매 점유율: K-뷰티 브랜드만(= 100%) 놓고 본 브랜드 구매 비중. 항상 전체 구매 점유율 옆에 표시."),
          tr("Seen vs bought: share of top-100 products (seen on the shelf), of unpaid top-10 search results (found in search) and of written reviews (bought), each across the rival set. They explain why a brand wins or loses; buying decides who wins.", "노출 vs 구매: 상위 100위 제품 점유(진열), 비광고 상위 10위 검색 결과 점유(검색), 작성 리뷰 점유(구매), 경쟁사 기준. 승패의 이유를 설명할 뿐, 승자는 구매로 결정.")],
        assume: BUYING_METHOD().assume,
        limits: [...BUYING_METHOD().limits, tr("Written reviews cover the products we track for review history (the rivals' key products), not every product.", "작성 리뷰는 리뷰 이력을 추적하는 제품(경쟁사 핵심 제품)만 포함.")],
      }} />
    </Shell>
  );
}

/* ================================================================ pieces */

function scoreTitle(anchor: string, rows: ScoreRow[]) {
  const me = rows.find((r) => same(r.brand, anchor)); if (!me) return tr(`${anchor} is not on any tracked shelf today.`, `오늘 추적 중인 진열 목록에 ${anchor} 없음.`);
  const m = (k: "shelf" | "search" | "demand") => median(rows.map((r) => r[k])) || 1e-9;
  const xs = ([["demand", tr("share of buying", "구매 점유율")], ["shelf", tr("top-100 places", "상위 100위 자리")], ["search", tr("unpaid search places", "비광고 검색 자리")]] as const).map(([k, l]) => ({ l, r: me[k] / m(k) }));
  return tr(`Against the Korean rivals' median, ${anchor} is at ${xs.map((x) => `${x.r.toFixed(1)}× on ${x.l}`).join(", ")}.`, `K-뷰티 경쟁사 중앙값 대비 ${anchor}: ${xs.map((x) => `${x.l} ${x.r.toFixed(1)}배`).join(", ")}.`);
}

function Scoreboard({ rows, setRows, anchor, tiers, board, win, span }: { rows: ScoreRow[]; setRows: ScoreRow[]; anchor: string; tiers: ReturnType<typeof useTiers>; board: NonNullable<ReturnType<typeof scoreboard>>; win: string; span: string }) {
  // the K-beauty tab compares with the Korean rivals: Innisfree and its rivals first, the other focus brands one click away
  const inRivals = (b: string) => setRows.some((r) => same(r.brand, b));
  const sorted = [...rows].sort((a, b) => (same(a.brand, anchor) ? -1 : same(b.brand, anchor) ? 1 : Number(inRivals(b.brand)) - Number(inRivals(a.brand)) || b.demand - a.demand));
  const max = { shelf: Math.max(...setRows.map((r) => r.shelf), 1e-9), search: Math.max(...setRows.map((r) => r.search), 1e-9), demand: Math.max(...setRows.map((r) => r.demand), 1e-9) };
  const med = { shelf: median(setRows.map((r) => r.shelf)), search: median(setRows.map((r) => r.search)), demand: median(setRows.map((r) => r.demand)) };
  const cols = "grid-cols-[minmax(130px,1fr)_minmax(150px,1.3fr)_minmax(150px,1.3fr)_minmax(150px,1.3fr)_110px]";
  const Cell = ({ v, k, sub, hl }: { v: number; k: "shelf" | "search" | "demand"; sub: React.ReactNode; hl: boolean }) => (
    <span className="pr-4">
      <span className="flex items-center gap-2"><b className="w-12 text-[13px] tabular">{pct(v)}</b>
        <span className="relative h-2 flex-1 rounded-full bg-sunken"><span className={`block h-2 rounded-full ${hl ? "bg-accent-strong" : "bg-brand/70"}`} style={{ width: `${Math.min(100, (v / max[k]) * 100)}%` }} />
          <span className="absolute -top-0.5 h-3 w-0.5 rounded bg-ink/35" style={{ left: `${Math.min(100, (med[k] / max[k]) * 100)}%` }} title={tr(`K-beauty rivals' median ${pct(med[k])}`, `K-뷰티 경쟁사 중앙값 ${pct(med[k])}`)} /></span></span>
      <span className="block text-[11px] text-muted">{sub}</span>
    </span>
  );
  return (
    <Card className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className={`grid ${cols} border-b border-line px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted`}>
          <span>{tr("Brand", "브랜드")}</span>
          <span><Def k="shelf">{tr("Share of top-100 products", "상위 100위 제품 점유율")}</Def><span className="block font-normal normal-case tracking-normal">{tr("products today · change in 14 days", "오늘 제품 수 · 14일 변화")}</span></span>
          <span><Def k="search">{tr("Share of top-10 search", "상위 10위 검색 점유율")}</Def><span className="block font-normal normal-case tracking-normal">{tr("unpaid results today · change in 7 days", "오늘 비광고 결과 · 7일 변화")}</span></span>
          <span><Def k="ratingFlow">{tr("Share of buying", "구매 점유율")}</Def><span className="block font-normal normal-case tracking-normal">{tr(`all top 100s · ${span}`, `상위 100위 전체 · ${span}`)}</span></span>
          <span><Def k="growth">{tr("Written-review growth", "작성 리뷰 성장률")}</Def><span className="block font-normal normal-case tracking-normal">{tr(<>vs <TrackedLink /> {signed(board.market.growth)}</>, <><TrackedLink /> {signed(board.market.growth)}</>)}</span></span>
        </div>
        <TieredList rows={sorted} brandOf={(r) => r.brand} tiers={tiers} top={setRows.length} render={(r) => {
          const hl = same(r.brand, anchor); const out = !hl && !inRivals(r.brand);
          return (
            <div key={r.brand} className={`grid ${cols} items-center border-b border-line px-4 py-2 ${hl ? "bg-accent-soft/50" : ""}`}>
              <span className="text-[13px]"><span className={hl ? "font-semibold" : "font-medium"}>{r.brand}</span>{out && <span className="ml-1.5 rounded bg-sunken px-1 text-[10px] text-muted ring-1 ring-line">{tr("not in rival set", "K-뷰티 경쟁사 외")}</span>}</span>
              <Cell v={r.shelf} k="shelf" hl={hl} sub={<>{tr(`${r.shelfSlots} products`, `제품 ${r.shelfSlots}개`)}{r.slotsChange !== null ? ` · ${moved(r.slotsChange)}` : ""}</>} />
              <Cell v={r.search} k="search" hl={hl} sub={<>{r.searchChange !== null ? pts(r.searchChange) : tr("no earlier day", "이전 데이터 없음")}{r.paid ? tr(` · ${Math.round(r.paid * 100)}% paid`, ` · 광고 ${Math.round(r.paid * 100)}%`) : ""}</>} />
              <Cell v={r.demand} k="demand" hl={hl} sub={<>{r.buying ? tr(`${compact(r.demandRecent)} written reviews in ${win}`, `${win} 작성 리뷰 ${compact(r.demandRecent)}건`) : tr("no buying counted", "구매 집계 없음")}</>} />
              <span className="text-[12.5px] tabular">{r.growth === null ? <Missing>{tr("no full history", "이력 불완전")}</Missing> : <><b className={board.market.growth !== null && r.growth >= board.market.growth ? "text-good" : "text-bad"}>{signed(r.growth)}</b><span className="block text-[11px] text-muted">{tr(`${r.growthProducts} products`, `제품 ${r.growthProducts}개`)}</span></>}</span>
            </div>
          );
        }} />
      </div>
      <Basis className="border-t border-line px-4 py-2.5">
        {tr(<>Shelf: {board.shelfTotal.toLocaleString("en-IN")} products in the top 100s on {dayLabel(board.shelfDay)} (only products Nykaa files under each category); the 14-day change counts only the {board.likeForLikeCats} categories tracked on both days. Search: unpaid top 10 of every tracked keyword on {dayLabel(board.searchDay)}. Buying: new ratings × MRP in every top 100, {span} (Nykaa froze rating counts on 10 Oct), a brand&rsquo;s ₹ over all brands&rsquo;. Growth: written reviews, same products, {win} vs a year earlier. Grey tick = median of the K-beauty rivals.</>,
          <>진열: {dayLabel(board.shelfDay)} 상위 100위 제품 {board.shelfTotal.toLocaleString("en-IN")}개(Nykaa가 해당 카테고리로 분류한 제품만). 14일 변화 = 두 날짜 모두 추적한 카테고리 {board.likeForLikeCats}개 기준. 검색: {dayLabel(board.searchDay)} 추적 키워드 전체의 비광고 상위 10개. 구매: 상위 100위 전체의 신규 평가 × 정가, {span} (Nykaa가 10월 10일 평가 수 갱신 중단), 브랜드 금액 ÷ 전체 금액. 성장률: 작성 리뷰, 동일 제품, {win} vs 전년. 회색 눈금 = K-뷰티 경쟁사 중앙값.</>)}
      </Basis>
    </Card>
  );
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

/** Points worth a closer look (owner 20 Oct 2026: describe, don't instruct; each says what the evidence shows). */
function nextSteps({ anchor, cmap, market, gapCells, gaps, me, kw, oos, findings, rows, span }: {
  anchor: string; cmap: CategoryCell[]; market: number | null; gapCells: (GapCell & { category: string })[]; gaps: ReturnType<typeof rangeGrid>;
  me: ScoreRow | undefined; kw: ReturnType<typeof keywordView>; oos: { name: string; brand: string; rating_count: number | null }[]; findings: Finding[]; rows: DemandRow[]; span: string;
}): Step[] {
  const out: Step[] = [];
  const best = (c: string) => rows.filter((r) => r.category === c && same(r.brand, anchor)).sort((a, b) => b.recent - a.recent)[0];
  const growthOf = (c: string) => cmap.find((x) => x.category === c)?.growth ?? null;
  for (const o of oos.filter((x) => (x.rating_count ?? 0) >= 1000).slice(0, 2)) out.push({ what: tr(`Out of stock: ${shortName(o.name, o.brand)}`, `품절: ${shortName(o.name, o.brand)}`), who: tr(`${anchor} supply`, `${anchor} 공급`), why: tr(`Out of stock on Nykaa today; it has ${compact(o.rating_count ?? 0)} ratings. Unavailable products tend to drop out of Nykaa's lists.`, `오늘 Nykaa 품절, 누적 평가 ${compact(o.rating_count ?? 0)}건. 구매 불가 제품은 Nykaa 목록에서 빠지는 경향.`), href: "#changes", tone: "bad", impact: 70 + Math.min(25, (o.rating_count ?? 0) / 1000) });
  for (const c of cmap.filter((x) => x.quadrant === "opportunity").sort((a, b) => b.buying - a.buying).slice(0, 2)) {
    const b = best(c.category);
    out.push({ what: tr(`${cat(c.category)}: growing faster than average, ${anchor} outside the top 5 brands`, `${cat(c.category)}: 평균보다 빠른 성장, ${anchor} 상위 5개 브랜드 밖`), who: b ? tr(`${anchor}'s most-reviewed product here: ${shortName(b.name, anchor).split(/,| - | with /)[0]} (${b.recent} reviews in 3 months)`, `이 카테고리 ${anchor} 리뷰 최다 제품: ${shortName(b.name, anchor).split(/,| - | with /)[0]} (3개월 리뷰 ${b.recent}건)`) : tr(`${anchor} has no tracked product here yet`, `아직 추적 중인 ${anchor} 제품 없음`),
      why: tr(`Written reviews here grow ${signed(c.growth)} (same products, ${pct(c.coverage)} of the category's buying) against ${signed(market)} for all tracked products; ${c.anchorPlace ? `${anchor} holds ${pct(c.anchorShare, 1)} of the category's buying (${span}), #${c.anchorPlace} of ${c.brandsCounted} brands` : `${anchor} has no product in its top 100`}. ${c.focusLeader?.brand ?? c.leader.brand} holds ${pct(c.focusLeader?.share ?? c.leader.share)}.`,
        `작성 리뷰 성장 ${signed(c.growth)} (동일 제품, 카테고리 구매의 ${pct(c.coverage)}), 추적 전체 ${signed(market)}. ${c.anchorPlace ? `${anchor} 카테고리 구매 점유율 ${pct(c.anchorShare, 1)} (${span}), 브랜드 ${c.brandsCounted}곳 중 ${c.anchorPlace}위` : `${anchor} 상위 100위 제품 없음`}. ${c.focusLeader?.brand ?? c.leader.brand}: ${pct(c.focusLeader?.share ?? c.leader.share)}.`), href: "#portfolio", impact: 80 + Math.min(15, c.recent / 1000) });
  }
  const growingGaps = [...gapCells].sort((a, b) => (growthOf(b.category) ?? -1) - (growthOf(a.category) ?? -1) || b.rivals.length - a.rivals.length);
  for (const g of growingGaps.slice(0, 1)) out.push({ what: tr(`Range: ${cat(g.category).toLowerCase()} at ${g.label}`, `라인업: ${cat(g.category)} ${bandLabel(g.label)}`), who: tr(`${anchor} range planning`, `${anchor} 상품 기획`), why: tr(`${g.rivals.length} K-beauty rival products (${g.rivalBrands.slice(0, 3).join(", ")}${g.rivalBrands.length > 3 ? "…" : ""}) sell at this MRP and ${anchor} lists none; written reviews in the category grow ${signed(growthOf(g.category))}.`, `이 정가대에 K-뷰티 경쟁사 제품 ${g.rivals.length}개(${g.rivalBrands.slice(0, 3).join(", ")}${g.rivalBrands.length > 3 ? "…" : ""}), ${anchor} 제품은 없음. 카테고리 작성 리뷰 성장률 ${signed(growthOf(g.category))}.`), href: "#gaps", impact: 70 + g.rivals.length });
  if (me && me.search < me.demand * 0.8 && kw.total) {
    const lost = kw.rows.filter((x) => x.pos === null && x.focusTop3).slice(0, 3);
    out.push({ what: tr(`Search${lost.length ? `: "${lost.map((x) => x.q).join('", "')}"` : ""}`, `검색${lost.length ? `: "${lost.map((x) => x.q).join('", "')}"` : ""}`), who: tr(`${anchor} search and ads`, `${anchor} 검색·광고`), why: tr(`${anchor} holds ${pct(me.search)} of unpaid top-10 search places and ${pct(me.demand, 1)} of buying. ${lost.length ? `On these keywords a K-beauty rival is in the unpaid top 3 and ${anchor} is not in the top 10.` : ""} Unpaid places follow sales and listing quality; paid slots are bought separately.`, `${anchor}: 비광고 상위 10 검색 자리의 ${pct(me.search)}, 구매의 ${pct(me.demand, 1)}. ${lost.length ? `이 키워드에선 K-뷰티 경쟁사가 비광고 상위 3위, ${anchor}는 상위 10위 밖.` : ""} 비광고 자리는 판매·상품 페이지 품질을 따라감, 광고 자리는 별도 구매.`), href: "#standing", impact: 75 });
  }
  for (const f of findings.slice(0, 1)) out.push({ what: tr(`${f.brand}'s move${f.category ? ` in ${cat(f.category).toLowerCase()}` : ""}`, `${f.category ? `${cat(f.category)} · ` : ""}${f.brand}의 움직임`), who: tr(`${anchor} category team`, `${anchor} 카테고리 담당`), why: `${f.headline}. ${f.soWhat}`, href: "#changes", tone: "bad", impact: 60 + Math.min(20, f.weight / 5) });
  for (const c of cmap.filter((x) => x.quadrant === "invest").slice(0, 1)) {
    const b = best(c.category);
    out.push({ what: tr(`${cat(c.category)}: growing faster than average, ${anchor} a top-5 brand`, `${cat(c.category)}: 평균보다 빠른 성장, ${anchor} 상위 5개 브랜드`), who: b ? `${shortName(b.name, anchor).split(/,| - | with /)[0]}` : anchor, why: tr(`Written reviews grow ${signed(c.growth)} (same products) and ${anchor} holds ${pct(c.anchorShare, 1)} of the category's buying (${span}), #${c.anchorPlace} of ${c.brandsCounted} brands.`, `작성 리뷰 ${signed(c.growth)} 성장(동일 제품), ${anchor} 카테고리 구매 점유율 ${pct(c.anchorShare, 1)} (${span}), 브랜드 ${c.brandsCounted}곳 중 ${c.anchorPlace}위.`), href: "#portfolio", tone: "good", impact: 55 });
  }
  if (!gaps.length) out.push({ what: tr("Collect this brand's catalogue", "이 브랜드 카탈로그 수집"), who: tr("Data", "데이터"), why: tr("Range gaps and heroes need the brand's full Nykaa range.", "라인업 공백·히어로 분석엔 브랜드의 Nykaa 전체 라인업이 필요."), href: "#gaps", impact: 10 });
  return out.sort((a, b) => b.impact - a.impact).slice(0, 5);
}
