"use client";

import MethodNotes, { BUYING_METHOD } from "@/components/MethodNotes";
import { useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { DetailHead, Missing, Opens, Points, useDetail, type DetailContent } from "@/components/Detail";
import { GoodToKnow, KSummary, KTable, goodToKnow, useKBeauty, type Good } from "@/components/KBeautyOverview";
import { useOpenProduct } from "@/components/ProductDrawer";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import Shell from "@/components/Shell";
import { Basis, BrandSelect, Def } from "@/components/Tiered";
import { Card, Loading, PageHead } from "@/components/ui";
import { norm } from "@/lib/brands";
import { useAvailability, useBrandShares, useCatalog, useCategoryCoverage, useDemand, useMovement, useReviewMonths, useShelf } from "@/lib/data";
import { BANDS, demandRows, demandWindow, rangeGrid, type DemandRow, type GapCell } from "@/lib/analysis";
import { buildFindings, type Finding } from "@/lib/findings";
import { CATEGORY_LABEL, compact, inr, shortName } from "@/lib/format";
import { useMarket } from "@/lib/useMarket";
import { heroProducts } from "@/lib/hero";
import { useTiers } from "@/lib/tiers";
import type { CatalogRow } from "@/lib/types";
import { push } from "@/lib/group";
import { bandLabel } from "@/lib/analysis";
import { tr } from "@/lib/i18n";
import { ScopeLine } from "@/components/Scope";

/** K-beauty (owner 21 Oct 2026): about Korean brands as a whole — how big, where they sell, who leads — then
 *  Innisfree's own products and range. Brand-against-brand scoring lives on Competitive analysis and every origin's
 *  categories on Market, so neither is repeated here. Explanations sit behind "How to read this". */

const NAV = (): NavItem[] => [
  { id: "summary", label: tr("K-beauty in one line", "K-뷰티 요약") }, { id: "where", label: tr("Where it sells", "판매 분포") },
  { id: "changes", label: tr("What changed", "주요 변동") }, { id: "heroes", label: tr("Hero products", "히어로 제품") }, { id: "gaps", label: tr("Range gaps", "라인업 공백") },
  { id: "good", label: tr("Good to know", "주목할 점") }, { id: "method", label: tr("How this page works", "계산 방법") },
];
const TONE_DOT = { threat: "bg-bad", opening: "bg-good", watch: "bg-muted" } as const;
const TONE_WORD = { get threat() { return tr("Threat", "위협"); }, get opening() { return tr("Opening", "기회"); }, get watch() { return tr("Watch", "주시"); } };
const SOURCE_WORD = (s: Finding["source"]) => tr(s, { Market: "시장", Demand: "수요", "Search & Ads": "검색·광고", Compare: "경쟁 분석" }[s]);
const cat = (c: string | null | undefined) => (c ? CATEGORY_LABEL[c] ?? c : tr("uncategorised", "미분류"));
const same = (a: string, b: string) => norm(a) === norm(b);

export default function AnalysisPage() {
  return <AuthGate><Analysis /></AuthGate>;
}

function Analysis() {
  const shelf = useShelf(); const movement = useMovement(); const shares = useBrandShares(); const demand = useDemand(); const months = useReviewMonths();
  const availability = useAvailability(); const catalog = useCatalog(); const coverage = useCategoryCoverage();
  const detail = useDetail(); const open = useOpenProduct(); const m = useMarket();

  const known = useMemo(() => [...new Set([...(shelf.data ?? []).map((r) => r.brand), ...(months.data ?? []).map((m) => m.brand)])].sort(), [shelf.data, months.data]);
  const tiers = useTiers(known);
  // the brand page links here with ?brand=, so the page opens on that brand
  const [picked, setPicked] = useState<string | null>(() => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("brand")));
  const anchor = picked ?? tiers.pinned;
  const isRival = useMemo(() => (b: string) => tiers.inSet(b) && tiers.group(b) === "korean", [tiers]);
  const rivals = useMemo(() => tiers.focus.filter((b) => tiers.group(b) === "korean" && !same(b, anchor)), [tiers, anchor]);
  const [showAll, setShowAll] = useState(false);
  const win = demandWindow();
  const k = useKBeauty(anchor);

  const ready = !!(m.ready && k && shelf.data && movement.data && shares.data && demand.data && months.data && catalog.data);
  const rows = useMemo(() => (ready ? demandRows(months.data!, demand.data!, shelf.data!, catalog.data!) : []), [ready, months.data, demand.data, shelf.data, catalog.data]);
  const complete = useMemo(() => {
    // every product whose own history covers both windows (variants included), for the demand rules
    const cov = new Map<string, string>(); for (const m of months.data ?? []) if (!cov.has(m.product_id) || m.coverage_start > cov.get(m.product_id)!) cov.set(m.product_id, m.coverage_start);
    return new Set([...cov.entries()].filter(([, c]) => c <= win.priorMonths[0]).map(([p]) => p));
  }, [months.data, win.priorMonths]);
  const korean = useMemo(() => new Set((shelf.data ?? []).filter((r) => r.origin === "kbeauty").map((r) => norm(r.brand))), [shelf.data]);
  const findings = useMemo(() => (ready ? buildFindings({ anchor, movement: movement.data!, shares: shares.data!, demand: demand.data!, availability: availability.data ?? [], coverage: coverage.data ?? [], complete })
    .filter((f) => !f.brand || korean.has(norm(f.brand))) : []),
    [ready, anchor, movement.data, shares.data, demand.data, availability.data, coverage.data, complete, korean]);
  const heroes = useMemo(() => (ready ? heroProducts(anchor, movement.data!, demand.data!, catalog.data!).slice(0, 4) : []), [ready, anchor, movement.data, demand.data, catalog.data]);
  const gaps = useMemo(() => (catalog.data ? rangeGrid(anchor, catalog.data, isRival) : []), [catalog.data, anchor, isRival]);

  if (!ready || !k) return <Shell active="Analysis"><PageHead eyebrow={tr("K-beauty", "K-뷰티")} title={tr("K-beauty on Nykaa", "Nykaa의 K-뷰티")} sub={tr("Korean brands as a whole, then Innisfree's products.", "K-뷰티 전체 현황, 이어서 Innisfree 제품.")} /><Loading what={tr("today's analysis", "오늘의 분석")} /></Shell>;

  /* ---------------- what changed: the Korean brands' moves, one line each, details on click */
  const anchorCats = new Set((shelf.data ?? []).filter((r) => same(r.brand, anchor)).map((r) => r.subcategory));
  const relevant = (f: Finding) => !f.brand || same(f.brand, anchor) || tiers.inSet(f.brand);
  const weight = (f: Finding) => f.weight * (f.brand && same(f.brand, anchor) ? 1.6 : !f.brand ? 1.1 : tiers.inSet(f.brand) ? 1.3 : 0.5) * (f.category && anchorCats.has(f.category) ? 1.2 : 1);
  const ranked = [...findings].sort((a, b) => weight(b) - weight(a));
  // one line per brand when one rule fires on several of its products (owner 21 Oct 2026: name one or two, the rest on click)
  const name = (f: Finding) => shortName(f.product?.name ?? "", f.brand ?? "").split(/,| - | with /)[0];
  const groups = new Map<string, Finding[]>();
  for (const f of ranked) { const rule = f.id.split("-")[0]; if ((rule === "oos" || rule === "price") && f.brand) push(groups, `${rule}|${norm(f.brand)}`, f); }
  const merged = new Map<Finding, Finding>(); const absorbed = new Set<Finding>();
  for (const [key, fs] of groups) {
    if (fs.length < 2) continue;
    const rule = key.split("|")[0]; const b = fs[0].brand!;
    const offs = fs.map((f) => { const was = Number((f.evidence.find((e) => e.label === tr("Was", "이전"))?.value ?? "").replace(/[^\d.]/g, "")); const now = Number((f.evidence.find((e) => e.label === tr("Now", "현재"))?.value ?? "").replace(/[^\d.]/g, "")); return was ? Math.round((1 - now / was) * 100) : 0; }).filter((x) => x > 0);
    const eg = fs.slice(0, 2).map(name).join(", ");
    merged.set(fs[0], { ...fs[0], id: `${key}-group`,
      headline: rule === "oos" ? tr(`${b}: ${fs.length} products out of stock`, `${b}: 제품 ${fs.length}개 품절`)
        : tr(`${b}: ${Math.min(...offs)}–${Math.max(...offs)}% off on ${fs.length} products, MRP unchanged`, `${b}: 제품 ${fs.length}개 ${Math.min(...offs)}–${Math.max(...offs)}% 할인 (정가 유지)`),
      soWhat: rule === "oos" ? tr(`e.g. ${eg}`, `예: ${eg}`) : tr(`A promotion to watch, not a new price. e.g. ${eg}`, `정가 인하 아닌 할인 프로모션. 예: ${eg}`),
      evidence: fs.map((f) => ({ label: `${name(f)}${f.category ? ` (${cat(f.category)})` : ""}`, value: f.evidence.map((e) => `${e.label} ${e.value}`).join(" · ") })) });
    fs.slice(1).forEach((f) => absorbed.add(f));
  }
  const listed = ranked.filter((f) => !absorbed.has(f)).map((f) => merged.get(f) ?? f);
  const main = listed.filter(relevant);
  const top5 = main.slice(0, 5);
  const others = listed.filter((f) => !top5.includes(f));

  const findingDetail = (f: Finding): DetailContent => ({
    kicker: tr(`${TONE_WORD[f.tone]} · evidence from ${f.source}`, `${TONE_WORD[f.tone]} · 근거: ${SOURCE_WORD(f.source)}`), title: f.headline,
    body: (<>
      {f.detail && <p className="text-ink-2">{f.detail}</p>}
      {f.soWhat && <p className="mt-2 font-medium">{f.soWhat}</p>}
      <DetailHead>{tr("The numbers", "수치")}</DetailHead>
      <Points items={f.evidence.map((e) => <><span className="text-muted">{e.label}:</span> <b className="font-medium tabular">{e.value}</b></>)} />
      {f.product && <button onClick={() => open(f.product!)} className="mt-4 rounded-lg px-3 py-1.5 text-[13px] text-ink-2 ring-1 ring-line hover:bg-surface">{tr("Open the product ›", "제품 보기 ›")}</button>}
    </>),
  });
  const gapDetail = (category: string, b: GapCell): DetailContent => ({
    kicker: tr(`Range · ${cat(category)} · ${b.label} (by MRP)`, `라인업 · ${cat(category)} · ${bandLabel(b.label)} (정가 기준)`),
    title: b.gap ? tr(`${anchor} has nothing here; ${b.rivalBrands.length} K-beauty rival${b.rivalBrands.length === 1 ? "" : "s"} sell ${b.rivals.length} products`, `${anchor} 제품 없음 · K-뷰티 경쟁사 ${b.rivalBrands.length}곳이 ${b.rivals.length}개 판매`) : tr(`${anchor} ${b.anchor.length} · K-beauty rivals ${b.rivals.length}`, `${anchor} ${b.anchor.length}개 · K-뷰티 경쟁사 ${b.rivals.length}개`),
    body: (<>
      <DetailHead>{anchor} ({b.anchor.length})</DetailHead>
      {b.anchor.length ? <CatalogList rows={b.anchor} /> : <Missing>{tr(`No ${anchor} product in this band`, `이 가격대에 ${anchor} 제품 없음`)}</Missing>}
      <DetailHead>{tr("K-beauty rivals", "K-뷰티 경쟁사")} ({b.rivals.length})</DetailHead>
      {b.rivals.length ? <CatalogList rows={[...b.rivals].sort((x, y) => (y.rating_count ?? 0) - (x.rating_count ?? 0))} /> : <Missing>{tr("No K-beauty rival sells here", "이 가격대를 파는 K-뷰티 경쟁사 없음")}</Missing>}
    </>),
  });
  const gapCells = gaps.flatMap((g) => g.bands.filter((b) => b.gap).map((b) => ({ category: g.category, ...b })));

  /* ---------------- good to know: K-beauty-wide first, then the anchor's own stock and the biggest promotion */
  const oos = (availability.data ?? []).filter((a) => same(a.brand, anchor) && (a.rating_count ?? 0) >= 1000);
  const promo = top5.find((f) => f.id.startsWith("price|"));
  const extra: Good[] = [
    ...oos.slice(0, 1).map((o) => ({ what: tr(`${anchor}: ${shortName(o.name, o.brand)} is out of stock`, `${anchor}: ${shortName(o.name, o.brand)} 품절`), why: tr(`It has ${compact(o.rating_count ?? 0)} ratings; products that can't be bought tend to drop down Nykaa's lists.`, `누적 평가 ${compact(o.rating_count ?? 0)}건. 구매 불가 제품은 Nykaa 목록에서 밀리는 경향.`), href: "#changes", tone: "bad" as const })),
    ...(promo ? [{ what: promo.headline, why: promo.soWhat, href: "#changes" }] : []),
  ];
  const good = goodToKnow(k, anchor, extra);

  const asOf = shelf.data?.[0]?.scrape_date;
  return (
    <Shell active="Analysis" asOf={asOf}>
      <PageHead eyebrow={tr("K-beauty", "K-뷰티")} title={tr("K-beauty on Nykaa", "Nykaa의 K-뷰티")} sub={tr(<>How big Korean brands are, where they sell and who leads; then {anchor}&rsquo;s products and range.</>, <>K-뷰티 규모·판매 분포·선두 브랜드, 이어서 {anchor} 제품·라인업.</>)}
        right={<BrandSelect value={anchor} onChange={setPicked} tiers={tiers} all={known} />} />
      <ScopeLine uses={["top100", "followed"]} measure={tr("share of buying in each category's top 100; review growth on the same products, a year apart.", "카테고리 상위 100위 판매 점유율, 동일 제품 리뷰의 전년 대비 성장.")} />
      <SectionNav items={NAV()} />

      <section id="summary" className="mt-6 scroll-mt-32"><KSummary k={k} anchor={anchor} /></section>

      <KTable k={k} anchor={anchor} rivals={rivals} />

      <ActionSection id="changes" kicker={tr("What changed", "주요 변동")} title={top5.length ? tr(`${top5.length} moves by Korean brands this fortnight.`, `최근 2주 K-뷰티 주요 변동 ${top5.length}건.`) : tr("No Korean brand crossed a threshold this fortnight.", "최근 2주 기준치를 넘은 K-뷰티 변동 없음.")}
        note={tr("Over the last 14 days: shelf moves, demand, ads, discounts and stock. A discount at an unchanged MRP is a promotion to watch, not a new price. Click a line for the numbers.", "최근 14일 기준: 랭킹·수요·광고·할인·재고. 정가 유지 할인은 가격 인하가 아닌 프로모션으로 분류. 항목 클릭 시 상세 수치.")}>
        <div className="grid gap-2">
          {top5.map((f) => (
            <Card key={f.id} className="lift px-5 py-3">
              <Opens detail={findingDetail(f)} className="w-full">
                <span className="flex items-start gap-3">
                  <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${TONE_DOT[f.tone]}`} />
                  <span className="min-w-0"><span className="block text-[14px] font-medium leading-snug">{f.headline}</span>{f.soWhat && <span className="mt-0.5 block truncate text-[12.5px] text-ink-2">{f.soWhat}</span>}</span>
                  <span className="ml-auto shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{TONE_WORD[f.tone]} ›</span>
                </span>
              </Opens>
            </Card>
          ))}
        </div>
        {others.length > 0 && (
          <div className="mt-3">
            <button onClick={() => setShowAll(!showAll)} className="text-[12.5px] font-medium text-accent-strong hover:underline">{showAll ? tr("Hide the other moves", "나머지 숨기기") : tr(`Show ${others.length} more`, `${others.length}건 더 보기`)}</button>
            {showAll && (
              <ul className="mt-2 space-y-1.5 rounded-[16px] bg-sunken/40 px-5 py-3">
                {others.map((f) => (
                  <li key={f.id} className="flex items-start gap-2 text-[13px] leading-snug">
                    <span className={`mt-[6px] h-2 w-2 shrink-0 rounded-full ${TONE_DOT[f.tone]}`} />
                    <Opens detail={findingDetail(f)}>{f.headline}</Opens>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </ActionSection>

      <ActionSection id="heroes" kicker={tr(`${anchor}'s hero products`, `${anchor} 히어로 제품`)} title={heroes.length ? tr(`Strongest: ${shortName(heroes[0].name, anchor)}.`, `대표 제품: ${shortName(heroes[0].name, anchor)}.`) : tr(`${anchor} has no product on a tracked shelf or catalogue.`, `추적 중인 랭킹 목록·카탈로그에 ${anchor} 제품 없음.`)}
        note={tr(<><Def k="hero">How heroes are picked</Def>: shelf rank, reviews in {win.recent}, rating and buyer base, each against the median product of the same category. Bars: reviews against the category&rsquo;s best sellers.</>, <><Def k="hero">히어로 선정 방법</Def>: 랭킹 순위, {win.recent} 리뷰 수, 평점, 구매자 규모를 같은 카테고리 중앙값 제품과 비교. 막대 = 카테고리 베스트셀러 대비 리뷰 수.</>)}>
        {heroes.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {heroes.map((h, i) => {
              // sizes sharing one review history show once, and a hero's own mini is never its rival (audit 19 Oct)
              const self = rows.find((r) => r.product_id === h.product_id) ?? (h.recent >= 20 ? rows.find((r) => r.category === h.category && same(r.brand, h.brand) && r.recent === h.recent) : undefined);
              const poolKey = (r: DemandRow) => (r.recent >= 20 ? `${norm(r.brand)}|${r.recent}|${r.prior}` : r.product_id);
              const seen = new Set<string>(self ? [poolKey(self)] : []);
              const peers = h.category ? rows.filter((r) => r.category === h.category).sort((a, b) => b.recent - a.recent)
                .filter((r) => { if (r.product_id === self?.product_id) return true; const pk = poolKey(r); if (seen.has(pk)) return false; seen.add(pk); return true; }) : [];
              const shown = [...peers.filter((r) => r.product_id !== self?.product_id).slice(0, 4), ...(self ? [{ ...self, name: h.name, product_id: h.product_id }] : [])].sort((a, b) => b.recent - a.recent);
              const pos = self ? peers.findIndex((r) => r.product_id === self.product_id) + 1 : 0;
              return (
                <Card key={h.product_id} className="px-5 py-4">
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-display text-[13px] font-semibold tabular text-muted">{i + 1}</span>
                    <button onClick={() => open({ product_id: h.product_id, name: h.name, brand: h.brand, price: h.price })} className="text-left text-[14px] font-medium leading-snug hover:underline">{shortName(h.name, anchor)} ›</button>
                  </div>
                  <Basis className="mt-1">{cat(h.category)}{(() => { const rk = m.shelf.find((r) => r.product_id === h.product_id && r.subcategory === h.category)?.rank ?? h.rank; return rk ? tr(` · shelf #${rk}`, ` · 랭킹 ${rk}위`) : ""; })()}{h.rating ? ` · ★ ${h.rating.toFixed(1)}` : ""}{h.ratingCount ? tr(` · ${compact(h.ratingCount)} ratings`, ` · 평가 ${compact(h.ratingCount)}건`) : ""}</Basis>
                  {shown.length > 1 ? (<>
                    <div className="mb-1 mt-3 text-[11.5px] font-medium text-ink-2">{tr(<>Reviews in {win.recent}{pos ? ` · #${pos} of ${peers.length}` : ""}</>, <>{win.recent} 리뷰 수{pos ? ` · ${peers.length}개 중 ${pos}위` : ""}</>)}</div>
                    <ProductBars rows={shown} anchor={anchor} highlight={h.product_id} />
                  </>) : <p className="mt-3"><Missing>{tr("No review history to compare in this category", "이 카테고리엔 비교할 리뷰 이력 없음")}</Missing></p>}
                </Card>
              );
            })}
          </div>
        ) : <Missing>{tr("Nothing to rank", "순위를 매길 제품 없음")}</Missing>}
      </ActionSection>

      <ActionSection id="gaps" kicker={tr("Range gaps", "라인업 공백")} title={!gaps.length ? tr(`No catalogue is collected for ${anchor}.`, `${anchor} 카탈로그 미수집.`) : gapCells.length ? tr(`${gapCells.length} price band${gapCells.length === 1 ? "" : "s"} where Korean rivals sell 3+ products and ${anchor} none.`, `K-뷰티 경쟁사는 3개 이상 파는데 ${anchor} 제품은 없는 가격대 ${gapCells.length}곳.`) : tr(`${anchor} sells in every price band where Korean rivals sell three or more.`, `K-뷰티 경쟁사가 3개 이상 파는 모든 가격대에 ${anchor} 제품 있음.`)}
        note={tr(<><Def k="rangeGap">How a gap is defined</Def>: each brand&rsquo;s full Nykaa range by category and MRP band; Korean rivals only. Red = a gap; click a cell for the products.</>, <><Def k="rangeGap">공백의 정의</Def>: 브랜드별 Nykaa 전체 라인업을 카테고리·정가 구간으로. K-뷰티 경쟁사만. 빨간 칸 = 공백, 칸을 누르면 제품 표시.</>)}>
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
                          <span className={`block text-[11.5px] ${b.gap ? "" : "text-muted"}`}>{b.rivals.length ? tr(`${b.rivals.length} Korean rival ›`.replace("rival ›", b.rivals.length === 1 ? "rival ›" : "rivals ›"), `K-뷰티 경쟁사 ${b.rivals.length}개 ›`) : tr("no Korean rival", "K-뷰티 경쟁사 없음")}</span>
                        </>}
                      </button>
                    </td>
                  ))}
                </tr>))}</tbody>
            </table>
          </Card>
        )}
      </ActionSection>

      <GoodToKnow items={good} />

      <MethodNotes parts={{
        sources: [tr("Nykaa's top 100 of each tracked category (nightly), written reviews of the tracked products (monthly, years back), brand catalogues (weekly).", "추적 카테고리별 Nykaa 상위 100위(매일), 추적 제품 리뷰(월별), 브랜드 카탈로그(주간)."),
          tr("Korean brands = brands from Korea (Admin › Brand origins). Indian brands \"formulated in Korea\" are Indian. Rivals = the Korean brands in Admin › Brand tiers.", "K-뷰티 브랜드 = 한국 본사 브랜드(관리 › 브랜드 국적). \"한국 제조\" 인도 브랜드는 인도로 분류. 경쟁사 = 관리 › 브랜드 등급의 K-뷰티 브랜드.")],
        calc: [...BUYING_METHOD().calc, tr("K-beauty share: Korean brands' buying out of all buying in the category. Of Korean buying: Korean brands only = 100%.", "K-뷰티 점유율: 카테고리 전체 판매 중 K-뷰티 비중. K-뷰티 판매 중: K-뷰티만 100%.")],
        assume: BUYING_METHOD().assume,
        limits: [...BUYING_METHOD().limits, tr("Review growth covers the products we follow for review history, not every product.", "리뷰 성장은 리뷰 이력을 추적하는 제품만 포함.")],
      }} />
    </Shell>
  );
}

/* ================================================================ pieces */

function ProductBars({ rows, anchor, highlight }: { rows: DemandRow[]; anchor: string; highlight?: string }) {
  const open = useOpenProduct();
  const max = Math.max(1, ...rows.map((r) => r.recent));
  return (
    <div className="space-y-1">
      {rows.map((r) => {
        const hl = highlight ? r.product_id === highlight : same(r.brand, anchor);
        return (
          <button key={r.product_id} onClick={() => open({ product_id: r.product_id, name: r.name, brand: r.brand, url: r.url })} className="grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_44px] items-center gap-2 rounded-md px-1 py-0.5 text-left text-[12px] hover:bg-sunken/60">
            <span className={`truncate ${hl ? "font-semibold" : ""}`} title={r.name}><span className="text-muted">{r.brand}</span> {shortName(r.name, r.brand).split(/,| - | with /)[0]}</span>
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
