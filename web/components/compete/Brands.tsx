"use client";

import BrandPicker from "@/components/BrandPicker";
import CompareGrid, { type ExtraRow, type GridCol } from "@/components/CompareGrid";
import PresenceMatrix from "@/components/PresenceMatrix";
import { ActionSection } from "@/components/Report";
import { MonthOnMonthButton, momHelp } from "@/components/MonthOnMonth";
import { monthsWindow } from "@/lib/metrics";
import { Card } from "@/components/ui";
import { Missing, Points, useDetail } from "@/components/Detail";
import { ORIGIN_LABEL } from "@/lib/brands";
import { demandWindow } from "@/lib/analysis";
import { standings, strongestWeakest, type Criterion } from "@/lib/compete";
import { productOptions, shelfCat, shortTitle, type BrandFacts } from "@/lib/competeData";
import { CATEGORIES, CATEGORY_LABEL, compact, inr, pct, signed } from "@/lib/format";
import { basketLabel, PRICE_BASKET } from "@/lib/price";
import type { CatalogRow, ShelfRow } from "@/lib/types";
import type { UspComparison, UspProduct } from "@/lib/usp";
import { tr } from "@/lib/i18n";
import { tx } from "@/lib/dict";

const SKINCARE = ["toner", "serum", "face_moisturizer", "face_wash", "sunscreen", "masks", "sheet_mask", "eye_care", "lip_care"];

/** A brand's share of all buying across the tracked top 100s, and the window it covers. */
export interface BuyingShare { of: (brand: string) => number | null; span: string }

function criteriaFor(cat: string, anchor: string, buy: BuyingShare): Criterion<BrandFacts>[] {
  const inBasket = (PRICE_BASKET as readonly string[]).includes(cat);
  const crawl = (f: BrandFacts) => (f.basket.source === "shelf" ? tr("Full range crawl pending (from 12 Oct)", "전체 라인업 수집 대기 (10월 12일부터)") : tr("Sells none of these on Nykaa", "Nykaa에서 해당 제품 미판매"));
  const notOnShelf = () => tr("No listing in today's top 100", "오늘 상위 100위 제품 없음");
  const notTracked = () => tr("Not in review tracking", "리뷰 추적 대상 아님");
  return [
    { key: "price", label: tr("MRP, core basket", "정가, 핵심 바스켓"), help: tr(`Average of the brand's median full-size MRP per basket category (${basketLabel()})`, `바스켓 카테고리별 정규 용량 정가 중앙값의 평균 (${basketLabel()})`), better: null, value: (f) => f.basket.overall, show: (f) => inr(f.basket.overall),
      sub: (f) => (f.brand === anchor ? tr(`${f.basket.categories} of 5 categories`, `5개 카테고리 중 ${f.basket.categories}개`) : f.basket.vsAnchor ? tr(`${f.basket.vsAnchor.toFixed(2)}× Innisfree, on ${f.basket.shared} shared`, `Innisfree의 ${f.basket.vsAnchor.toFixed(2)}배 (공통 ${f.basket.shared}개 기준)`) : tr(`${f.basket.categories} of 5 categories`, `5개 카테고리 중 ${f.basket.categories}개`)),
      missing: (f) => (f.basket.overall === null ? crawl(f) : null) },
    { key: "catprice", label: tr(`MRP, ${CATEGORY_LABEL[cat]} (Part 2's category)`, `정가, ${CATEGORY_LABEL[cat]} (2부 카테고리)`), help: inBasket ? tr("Median full-size MRP in this category", "이 카테고리 정규 용량 정가 중앙값") : tr("Median full-size MRP in this category (outside the core basket)", "이 카테고리 정규 용량 정가 중앙값 (핵심 바스켓 외)"), better: null,
      value: (f) => f.catPrice?.price ?? null, show: (f) => inr(f.catPrice?.price),
      sub: (f) => (f.catPrice ? `${f.catPrice.perHundred ? `₹${Math.round(f.catPrice.perHundred).toLocaleString("en-IN")}/100 ml · ` : ""}${tr(`${f.catPrice.n} product${f.catPrice.n === 1 ? "" : "s"}`, `제품 ${f.catPrice.n}개`)}` : null),
      missing: (f) => (f.catPrice ? null : f.basket.source === "shelf" ? tr("Not in today's top 100; full range from 12 Oct", "오늘 상위 100위 없음, 전체 라인업은 10월 12일부터") : tr("Does not sell this category on Nykaa", "Nykaa에서 이 카테고리 미판매")) },
    { key: "discount", label: tr("Average discount", "평균 할인율"), help: tr("Average % off MRP across its top-100 listings", "상위 100위 제품의 정가 대비 평균 할인율"), better: null, value: (f) => f.avgDiscount, show: (f) => `${Math.round(f.avgDiscount!)}%`, bar: true,
      missing: (f) => (f.avgDiscount === null ? notOnShelf() : null) },
    { key: "offer", label: tr("Listings with an offer", "프로모션 제품 비중"), help: tr("Share of its top-100 listings carrying a gift, bundle or coupon", "상위 100위 제품 중 사은품·묶음·쿠폰이 붙은 비중"), better: null, value: (f) => f.offerShare, show: (f) => pct(f.offerShare), bar: true,
      missing: (f) => (f.offerShare === null ? notOnShelf() : null) },
    { key: "listings", label: tr("Top-100 listings", "상위 100위 제품 수"), help: tr("Product slots in the top 100 of all tracked categories today", "오늘 추적 중인 전체 카테고리 상위 100위 안의 제품 수"), better: "high", value: (f) => f.slots, show: (f) => String(f.slots), sub: (f) => tr(`${f.categories.length} categories`, `카테고리 ${f.categories.length}개`), bar: true,
      up: tr("More top-100 listings than", "상위 100위 제품이 더 많음"), down: tr("Fewer top-100 listings than", "상위 100위 제품이 더 적음") },
    { key: "top20", label: tr("In the top 20", "상위 20위 안"), help: tr("Slots in the first 20 positions, where most clicks happen", "클릭이 가장 많이 일어나는 상위 20위 안의 제품 수"), better: "high", value: (f) => f.top20, show: (f) => String(f.top20), bar: true },
    { key: "rank", label: tr("Best shelf position", "최고 진열 순위"), help: tr("Highest position of any of its products today", "오늘 이 브랜드 제품 중 가장 높은 순위"), better: "low", value: (f) => f.bestRank, show: (f) => `#${f.bestRank}`,
      sub: (f) => (f.medianRank ? tr(`typical #${Math.round(f.medianRank)}`, `보통 #${Math.round(f.medianRank)}`) : null), missing: (f) => (f.bestRank ? null : tr("Not in any top 100 today", "오늘 어느 상위 100위에도 없음")) },
    { key: "paid", label: tr("Paid placements", "광고 노출 비중"), help: tr("Share of its top-100 slots that are ads or featured", "상위 100위 제품 중 광고·추천 자리 비중"), better: null, value: (f) => f.paidShare, show: (f) => pct(f.paidShare), bar: true,
      missing: (f) => (f.paidShare === null ? notOnShelf() : null) },
    { key: "rating", label: tr("Star rating", "별점"), help: tr("Average star rating of its top-100 products", "상위 100위 제품의 평균 별점"), better: "high", value: (f) => f.rating, show: (f) => `★ ${f.rating!.toFixed(2)}`,
      missing: (f) => (f.rating ? null : tr("No rated product in today's top 100", "오늘 상위 100위에 평가된 제품 없음")) },
    { key: "ratings", label: tr("Ratings, all time", "누적 평가 수"), help: tr("Total star ratings on its top-100 products; sizes that share one set of ratings on Nykaa count once", "상위 100위 제품의 별점 평가 합계. Nykaa에서 평가를 공유하는 용량별 제품은 한 번만 집계"), better: "high", value: (f) => f.ratings, show: (f) => compact(f.ratings), bar: true },
    // owner 20 Oct 2026: shares must hold up. Buying is measured on every top-100 product alike; review counts depend on
    // how many of a brand's products we follow, so they are context (no ahead/behind colour, no LEAD)
    { key: "buying", label: tr("Share of buying, all top 100s", "구매 점유율, 상위 100위 전체"), help: tr(`The brand's new ratings × MRP over all brands' in every tracked top 100, ${buy.span}`, `상위 100위 전체에서 브랜드 신규 평가 × 정가 ÷ 전체 브랜드, ${buy.span}`), better: "high",
      value: (f) => buy.of(f.brand), show: (f) => pct(buy.of(f.brand)!, 1), sub: () => buy.span, bar: true, missing: (f) => (buy.of(f.brand) ? null : tr("No buying counted in the top 100s", "상위 100위 구매 집계 없음")) },
    { key: "demand", label: tr("Reviews, last 3 months", "최근 3개월 리뷰"), help: tr("Dated reviews on its tracked products in the last 3 complete months (one count per product, sizes pooled). Depends on how many of its products we follow, so it is not coloured", "최근 완결된 3개월 동안 추적 제품에 작성된 리뷰 (제품당 한 번, 용량 합산). 추적 제품 수에 따라 달라지므로 색 표시 없음"), better: null, value: (f) => f.last3, show: (f) => compact(f.last3),
      sub: (f) => tr(`${DW().recent} · ${f.demandProducts} products`, `${DW().recent} · 제품 ${f.demandProducts}개`), bar: true, missing: (f) => (f.last3 === null ? notTracked() : null) },
    { key: "momentum", label: tr("Review growth", "리뷰 성장률"), help: tr(`Reviews ${DW().recent} against ${DW().prior}, products with complete history only`, `${DW().recent} 리뷰 vs ${DW().prior} 리뷰. 이력이 완전한 제품만`), better: "high", value: (f) => f.growth, show: (f) => signed(f.growth), sub: () => tr(`vs ${DW().prior}`, `${DW().prior} 대비`),
      missing: (f) => (f.growth === null ? (f.last3 === null ? notTracked() : tr("Too new to compare", "비교하기엔 너무 새 제품")) : null) },
    { key: "search", label: tr("K-beauty searches", "K-뷰티 검색"), help: tr("Tracked Korean-beauty searches where it shows in the first 10 unpaid results", "비광고 상위 10개 결과에 나오는 추적 K-뷰티 검색어 수"), better: "high", value: (f) => f.searchTerms,
      show: (f) => (f.searchTerms ? String(f.searchTerms) : tr("In none", "없음")), sub: (f) => (f.bestSearch ? tr(`best #${f.bestSearch}`, `최고 #${f.bestSearch}`) : null), bar: true },
    { key: "range", label: tr("Products on Nykaa", "Nykaa 판매 제품 수"), help: tr("All products the brand lists on Nykaa", "브랜드가 Nykaa에 올린 전체 제품"), better: null, value: (f) => f.range, show: (f) => String(f.range),
      sub: (f) => (f.conversion !== null ? tr(`${pct(f.conversion)} reach a top 100`, `${pct(f.conversion)}가 상위 100위 진입`) : null), missing: (f) => (f.range === null ? tr("Range not counted for this brand", "이 브랜드는 라인업 미집계") : null) },
  ];
}
const GROUPS = () => ({ price: tr("Price and promotion", "가격·프로모션"), listings: tr("Shelf visibility", "진열 노출"), rating: tr("Buyer response", "구매자 반응"), buying: tr("Demand (sales signal)", "수요 (판매 신호)"), search: tr("Search", "검색"), range: tr("Range", "라인업") });

/* ---------------------------------------------------------------- §7 brands */

const DW = () => demandWindow();
export function Brands({ facts, anchor, cat, colors, brands, known, rows, isDefault, onToggle, onReset, focusSet, inSet, buy, productsOf }: {
  facts: BrandFacts[]; anchor: string; cat: string; colors: Record<string, string>; brands: string[]; known: string[]; rows: ShelfRow[];
  isDefault: boolean; onToggle: (b: string) => void; onReset: () => void; focusSet: string[]; inSet: (b: string) => boolean; buy: BuyingShare;
  /** each tracked product of a brand with its 12-month review series, for the month-by-month panel */
  productsOf: (brand: string) => { pid: string; name: string; values: (number | null)[] }[];
}) {
  const criteria = criteriaFor(cat, anchor, buy);
  const a = facts.find((f) => f.brand === anchor);
  const rivals = facts.filter((f) => f.brand !== anchor);
  const priced = rivals.filter((f) => f.basket.vsAnchor !== null);
  const cheaper = priced.filter((f) => f.basket.vsAnchor! < 0.95).length;
  const { strong, weak } = a ? strongestWeakest(standings(a, rivals, criteria), 2) : { strong: [], weak: [] };
  const list = (xs: { label: string }[]) => xs.map((x) => x.label.toLowerCase()).join(tr(" and ", ", "));
  const title = a ? tr(`${strong.length ? `Innisfree beats most of these brands on ${list(strong)}` : "Innisfree leads these brands on no measure"}${weak.length ? ` and trails on ${list(weak)}` : ""}; its core basket costs more than ${cheaper} of ${priced.length} of them.`,
      `${strong.length ? `Innisfree는 ${list(strong)}에서 이 브랜드들 대부분을 앞서고` : "Innisfree가 이 브랜드들보다 앞서는 지표는 없고"}${weak.length ? `, ${list(weak)}에서는 뒤처짐` : ""}. 핵심 바스켓 가격은 ${priced.length}개 브랜드 중 ${cheaper}개보다 비쌈.`) : tr("Brand vs brand.", "브랜드 대 브랜드.");

  const focus = focusSet.filter((b) => known.includes(b));
  const all = [...new Set(rows.map((r) => r.brand))].map((b) => ({ brand: b, slots: rows.filter((r) => r.brand === b).length })).sort((x, y) => y.slots - x.slots);

  const cols: GridCol[] = facts.map((f) => ({ key: f.brand, anchor: f.brand === anchor, short: f.brand, head: (
    <div>
      <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[f.brand] }} /><span className="text-[14px] font-semibold">{f.brand}</span>{!inSet(f.brand) && <span className="whitespace-nowrap rounded bg-sunken px-1 text-[10px] font-normal text-muted ring-1 ring-line">{tr("not in focus set", "주요 브랜드 외")}</span>}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-muted">{ORIGIN_LABEL[f.origin]}{f.madeIn ? tr(` · made in ${f.madeIn}`, ` · ${tx(f.madeIn)} 생산`) : ""}{f.kMarketing ? tr(" · sells as Korean", " · K-뷰티 브랜드로 마케팅") : ""}{f.basket.source === "shelf" ? tr(" · prices from today's top 100 until its full range is crawled", " · 전체 라인업 수집 전까지 오늘 상위 100위 가격 사용") : ""}</div>
    </div>
  ) }));
  const extra: ExtraRow<BrandFacts>[] = [
    { after: "momentum", label: tr("By month · month on month", "월별 · 전월 대비"), help: momHelp(), has: (f) => f.spark.some((v) => v !== null), missing: () => tr("Not in review tracking", "리뷰 추적 대상 아님"), render: (f) => <MonthOnMonthButton values={f.spark} win={monthsWindow(12)} color={colors[f.brand]}
      kicker={tr(`${f.brand} · written reviews by month`, `${f.brand} · 월별 작성 리뷰`)} title={tr(`${f.brand}: the last 12 months`, `${f.brand}: 최근 12개월`)} products={productsOf(f.brand)} /> },
  ];

  return (
    <ActionSection id="brands" kicker={tr("Brand scorecard · Innisfree vs the main rival brands", "브랜드 스코어카드 · Innisfree vs 주요 경쟁 브랜드")} title={title}
      note={isDefault ? tr("Opens on the main brands with the most top-100 places in Innisfree's categories (3 Korean, 1 Indian, 1 global). Change the set below; the brand names stay pinned at the top as you scroll the table.", "기본값: Innisfree 카테고리에서 상위 100위 자리가 가장 많은 주요 브랜드 (K-뷰티 3, 인도 1, 글로벌 1). 아래에서 변경 가능, 표를 내려도 브랜드 이름은 위에 고정.") : tr("Your brand set. The brand names stay pinned at the top as you scroll the table.", "직접 고른 브랜드. 표를 내려도 브랜드 이름은 위에 고정.")}>
      <Card className="mb-4 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          <span>{tr("Brands compared · up to 6, Innisfree always included", "비교 브랜드 · 최대 6개, Innisfree 항상 포함")}</span>
          {!isDefault && <button onClick={onReset} className="normal-case tracking-normal text-ink-2 underline decoration-line-2 underline-offset-2 hover:text-ink">{tr("Back to the default brands", "기본 브랜드로 되돌리기")}</button>}
        </div>
        <BrandPicker focus={focus} all={all} selected={brands} colors={colors} onToggle={onToggle} max={6} />
      </Card>
      <CompareGrid cols={cols} items={facts} criteria={criteria} extra={extra} groups={GROUPS()} colors={facts.map((f) => colors[f.brand])} labelWidth={160} />
      <p className="mt-2 text-[11.5px] text-muted">{tr("Shelf, rating and paid figures are from today’s top-100 listings; prices from each brand’s full Nykaa range where tracked. Hover a row name for its definition.", "진열·평점·광고 수치는 오늘 상위 100위 제품 기준, 가격은 추적 브랜드의 Nykaa 전체 라인업 기준. 행 이름에 마우스를 올리면 정의 표시.")}</p>
    </ActionSection>
  );
}

/* ---------------------------------------------------------------- §8 where they compete */

export function WhereCompete({ anchor, rows, catalog, colors, brands, onPickCat }: {
  anchor: string; rows: ShelfRow[]; catalog: CatalogRow[]; colors: Record<string, string>; brands: string[]; onPickCat: (c: string) => void;
}) {
  // owner 20 Oct 2026: the brand × category grid was "cluttered… so many numbers, so many blank spaces… no clear-cut
  // insight". Each category is now put in one of four plain groups, with the one fact that decides it; the grid stays
  // one click away.
  const cats = [...SKINCARE, ...CATEGORIES.filter((c) => !SKINCARE.includes(c))].filter((c) => SKINCARE.includes(c) || brands.some((b) => productOptions(b, c, rows, catalog).length));
  const rivals = brands.filter((b) => b !== anchor);
  const best = (b: string, c: string) => { const g = rows.filter((r) => r.subcategory === c && r.brand === b); return g.length ? { n: g.length, best: Math.min(...g.map((r) => r.rank)) } : null; };
  const lines = cats.map((c) => {
    const a = best(anchor, c); const sells = productOptions(anchor, c, rows, catalog).length;
    const ranked = rivals.map((b) => ({ b, x: best(b, c) })).filter((r): r is { b: string; x: { n: number; best: number } } => !!r.x).sort((p, q) => p.x.best - q.x.best);
    const group = a ? (!ranked.length || a.best < ranked[0].x.best ? "lead" : "trail") : sells ? (ranked.length ? "unranked" : null) : ranked.length ? "absent" : null;
    return { c, a, sells, ranked, group };
  }).filter((l) => l.group);
  const who = (r: { b: string; x: { n: number; best: number } }[]) => r.slice(0, 3).map(({ b, x }) => tr(`${b} #${x.best}${x.n > 1 ? ` (${x.n} places)` : ""}`, `${b} #${x.best}${x.n > 1 ? ` (${x.n}개)` : ""}`)).join(", ");
  const G = [
    { k: "lead", t: tr(`${anchor} ranks highest of these brands`, `이 브랜드들 중 ${anchor} 최고 순위`), tone: "bg-good-soft text-good",
      line: (l: (typeof lines)[number]) => tr(`best #${l.a!.best}${l.a!.n > 1 ? `, ${l.a!.n} places` : ""}${l.ranked.length ? `; next: ${who(l.ranked.slice(0, 1))}` : "; none of the others rank"}`, `최고 #${l.a!.best}${l.a!.n > 1 ? `, ${l.a!.n}개` : ""}${l.ranked.length ? `. 다음: ${who(l.ranked.slice(0, 1))}` : ". 다른 브랜드 순위 없음"}`) },
    { k: "trail", t: tr(`${anchor} ranks, these brands rank higher`, `${anchor} 순위권, 이 브랜드들이 더 높음`), tone: "bg-warn-soft text-warn",
      line: (l: (typeof lines)[number]) => tr(`${anchor} #${l.a!.best}; ahead: ${who(l.ranked.filter((r) => r.x.best < l.a!.best))}`, `${anchor} #${l.a!.best}. 앞선 곳: ${who(l.ranked.filter((r) => r.x.best < l.a!.best))}`) },
    { k: "unranked", t: tr(`${anchor} sells here, nothing in the top 100`, `${anchor} 판매 중, 상위 100위 없음`), tone: "bg-bad-soft text-bad",
      line: (l: (typeof lines)[number]) => tr(`${l.sells} ${anchor} product${l.sells === 1 ? "" : "s"} on Nykaa; ranking: ${who(l.ranked)}`, `${anchor} 제품 ${l.sells}개 판매. 순위권: ${who(l.ranked)}`) },
    { k: "absent", t: tr(`${anchor} doesn't sell here; these brands rank`, `${anchor} 미판매, 이 브랜드들은 순위권`), tone: "bg-sunken text-ink-2",
      line: (l: (typeof lines)[number]) => who(l.ranked) },
  ];
  const n = (k: string) => lines.filter((l) => l.group === k);
  const un = n("unranked");
  // owner 21 Oct 2026 ("isn't that clear already from the other information?"): the scorecard already says where
  // Innisfree leads or trails; the one fact found only here is where it sells but nothing reaches the top 100. That
  // stays in view; leads, trails and the full grid are one click away.
  const title = un.length ? tr(`${anchor} sells in ${un.length} categor${un.length === 1 ? "y" : "ies"} without a top-100 product, where these brands rank.`, `${anchor}가 팔지만 상위 100위 제품이 없고 이 브랜드들은 순위권인 카테고리 ${un.length}곳.`)
    : tr(`${anchor} has a top-100 product in every category it sells.`, `${anchor}는 판매하는 모든 카테고리에 상위 100위 제품 있음.`);
  const rest = [G[1], G[0], G[3]].filter((g) => n(g.k).length);
  return (
    <ActionSection id="compete" kicker={tr("Where they compete", "경쟁 지점")} title={title}
      note={tr("Places in each category's top 100 tonight (own-category rank, best product). Click a category to compare its products in Part 2.", "오늘 카테고리별 상위 100위 자리(카테고리 자체 순위, 최고 제품). 카테고리를 누르면 2부에서 제품 비교.")}>
      {un.length > 0 && (
        <Card className="px-4 py-3.5">
          <ul className="space-y-1.5">{un.map((l) => (
            <li key={l.c}><button onClick={() => onPickCat(l.c)} className="w-full text-left text-[13.5px] leading-snug hover:underline"><b className="font-medium">{CATEGORY_LABEL[l.c]}</b> <span className="text-ink-2">· {G[2].line(l)}</span></button></li>))}</ul>
        </Card>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-[13px] font-medium text-accent-strong">{tr(`Every category: ${rest.map((g) => `${g.t.toLowerCase()} (${n(g.k).length})`).join(", ")}, and the full grid`, `전체 카테고리: ${rest.map((g) => `${g.t} (${n(g.k).length})`).join(", ")}, 전체 표`)}</summary>
        <div className="mt-3 grid items-start gap-3 md:grid-cols-2">
          {rest.map((g) => (
            <Card key={g.k} className="px-4 py-3.5">
              <div className="flex items-center justify-between gap-2"><span className="text-[13.5px] font-semibold">{g.t}</span><span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular ${g.tone}`}>{n(g.k).length}</span></div>
              <ul className="mt-2 space-y-1.5">{n(g.k).map((l) => (
                <li key={l.c}><button onClick={() => onPickCat(l.c)} className="w-full text-left text-[13px] leading-snug hover:underline"><b className="font-medium">{CATEGORY_LABEL[l.c]}</b> <span className="text-ink-2">· {g.line(l)}</span></button></li>))}</ul>
            </Card>))}
        </div>
        <div className="mt-3"><PresenceMatrix shelf={rows} catalog={catalog} anchor={anchor} brands={brands} colors={colors} onPick={onPickCat} categories={cats} /></div>
      </details>
    </ActionSection>
  );
}

/** The analysed product pairings (moved from Part 1, owner 20 Oct 2026: products belong with products): every Innisfree
 *  hero the USP analysis set against rival products, by category, with each rival's lead benefit. Click to compare. */
export function HeadToHead({ anchor, uspBy, comps, colors, onPick }: {
  anchor: string; uspBy: Map<string, UspProduct>; comps: UspComparison[]; colors: Record<string, string>; onPick: (cat: string, hero: string) => void;
}) {
  if (!comps.length) return null;
  return (
    <details className="mt-4 rounded-2xl bg-surface px-4 py-3 shadow-card ring-1 ring-line">
      <summary className="cursor-pointer text-[13px] font-semibold text-ink">{tr(`Every analysed pairing: ${comps.length} ${anchor} heroes and the rival products set against them`, `분석된 모든 짝: ${anchor} 히어로 ${comps.length}개와 맞붙인 경쟁 제품`)} <span className="font-normal text-muted">{tr("· click one to compare it below", "· 누르면 아래에서 비교")}</span></summary>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {comps.map((g) => (
          <button key={g.anchor_product_id} onClick={() => onPick(shelfCat(g.category), g.anchor_product_id)} className="rounded-xl px-3 py-2.5 text-left ring-1 ring-line transition hover:bg-page hover:ring-brand">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{CATEGORY_LABEL[shelfCat(g.category)]}</div>
            <div className="mt-0.5 text-[12.5px] font-semibold leading-snug">{shortTitle(g.anchor_name, anchor)}</div>
            <ul className="mt-1.5 space-y-1">{g.products.filter((id) => id !== g.anchor_product_id).map((id) => { const p = uspBy.get(id); if (!p) return null;
              const benefit = [...p.analysis.key_benefits].sort((x, y) => y.emphasis - x.emphasis)[0]?.benefit;
              return <li key={id} className="text-[12px] leading-snug"><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: colors[p.brand] ?? "#8a8880" }} /><b className="font-medium">{p.brand}</b> {shortTitle(p.name, p.brand)}{benefit && <span className="block pl-3 text-[11.5px] text-ink-2">{tr("Leads on", "대표 효능")}: {tx(benefit)}</span>}</li>; })}</ul>
          </button>
        ))}
      </div>
    </details>
  );
}

/* ---------------------------------------------------------------- §9 price */

export function PriceBasket({ facts, anchor }: { facts: BrandFacts[]; anchor: string }) {
  const open = useDetail();
  const a = facts.find((f) => f.brand === anchor);
  const rivals = facts.filter((f) => f.brand !== anchor && f.basket.vsAnchor !== null).sort((x, y) => x.basket.vsAnchor! - y.basket.vsAnchor!);
  const title = a?.basket.overall ? tr(`Innisfree's core basket averages ${inr(a.basket.overall)} MRP${rivals.length ? `; ${rivals[0].brand} is the cheapest rival at ${rivals[0].basket.vsAnchor!.toFixed(2)}× and ${rivals[rivals.length - 1].brand} the dearest at ${rivals[rivals.length - 1].basket.vsAnchor!.toFixed(2)}×` : ""}.`,
      `Innisfree 핵심 바스켓 평균 정가: ${inr(a.basket.overall)}${rivals.length ? `. 가장 저렴한 경쟁사 ${rivals[0].brand}(${rivals[0].basket.vsAnchor!.toFixed(2)}배), 가장 비싼 곳 ${rivals[rivals.length - 1].brand}(${rivals[rivals.length - 1].basket.vsAnchor!.toFixed(2)}배)` : ""}.`) : tr("Like-for-like MRP by category.", "카테고리별 동일 조건 정가 비교.");
  const cellDetail = (f: BrandFacts, c: string) => {
    const v = f.basket.byCategory[c]; const av = a?.basket.byCategory[c];
    return { kicker: `${f.brand} · ${CATEGORY_LABEL[c]}`, title: tr(`Median MRP ${inr(v.price)}`, `정가 중앙값 ${inr(v.price)}`), body: <Points items={[
      tr(`${v.n} full-size product${v.n === 1 ? "" : "s"} counted${f.basket.source === "shelf" ? " (from today's top 100; full range from 12 Oct)" : " (its full Nykaa range)"}`, `정규 용량 제품 ${v.n}개 집계${f.basket.source === "shelf" ? " (오늘 상위 100위 기준, 전체 라인업은 10월 12일부터)" : " (Nykaa 전체 라인업 기준)"}`),
      v.perHundred ? tr(`Median ₹${Math.round(v.perHundred).toLocaleString("en-IN")} per 100 ml/g`, `100 ml/g당 중앙값 ₹${Math.round(v.perHundred).toLocaleString("en-IN")}`) : tr("Pack sizes not listed, so no per-100 ml figure", "용량 표시가 없어 100 ml당 가격 없음"),
      ...(av && f.brand !== anchor ? [tr(`${(v.price / av.price).toFixed(2)}× Innisfree's ${inr(av.price)}`, `Innisfree(${inr(av.price)})의 ${(v.price / av.price).toFixed(2)}배`)] : []),
      tr("Combos, gift sets, minis under 15 ml/g and out-of-stock products are left out", "세트, 기획 세트, 15 ml/g 미만 미니, 품절 제품은 제외"),
    ]} /> };
  };
  const gap = (f: BrandFacts) => (f.basket.source === "shelf" ? tr("Crawl pending", "수집 대기") : tr("Not sold", "미판매"));
  return (
    <ActionSection id="basket" kicker={tr("Price · like for like, on MRP", "가격 · 정가 기준 동일 조건 비교")} title={title} note={tr(`What the scorecard's core basket is made of: median full-size MRP in each core category (${basketLabel()}). "×" compares with Innisfree on the categories both sell; click a price for how it was built.`, `스코어카드 핵심 바스켓의 구성: 핵심 카테고리별 정규 용량 정가 중앙값 (${basketLabel()}). "×" = 둘 다 판매하는 카테고리에서 Innisfree 대비 값, 가격을 누르면 계산 방법 표시.`)}>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12.5px] tabular">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-muted">
              <th className="px-4 py-2.5 font-semibold">{tr("Brand", "브랜드")}</th>
              {PRICE_BASKET.map((c) => <th key={c} className="px-3 py-2.5 font-semibold">{CATEGORY_LABEL[c]}</th>)}
            </tr>
          </thead>
          <tbody>
            {facts.map((f) => (
              <tr key={f.brand} className={`border-b border-line last:border-0 ${f.brand === anchor ? "bg-page/70" : ""}`}>
                <td className="px-4 py-2 font-medium">{f.brand}</td>
                {PRICE_BASKET.map((c) => { const v = f.basket.byCategory[c]; const av = a?.basket.byCategory[c]; return (
                  <td key={c} className="px-3 py-2">{v ? <button onClick={() => open(cellDetail(f, c))} className="text-left hover:underline">
                    <b>{inr(v.price)}</b>{av && f.brand !== anchor && <span className={`ml-1 text-[10.5px] ${v.price > av.price * 1.05 ? "text-bad" : v.price < av.price * 0.95 ? "text-good" : "text-muted"}`}>{(v.price / av.price).toFixed(2)}×</span>}
                    {v.perHundred ? <span className="block text-[10.5px] text-muted">₹{Math.round(v.perHundred).toLocaleString("en-IN")}/100 ml</span> : null}</button> : <Missing>{gap(f)}</Missing>}</td>
                ); })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-[11.5px] text-muted">{tr("“Not sold”: the brand has no full-size product in that category on Nykaa. “Crawl pending”: brands outside the 22 tracked K-beauty brands are priced from today’s top 100 until the weekly catalogue run (first run 12 Oct) collects their full range. Green/red ×: cheaper/dearer than Innisfree.", "“미판매”: 해당 카테고리에 Nykaa 정규 용량 제품 없음. “수집 대기”: 추적 중인 K-뷰티 22개 브랜드 외 브랜드는 주간 카탈로그 수집(첫 수집 10월 12일)이 전체 라인업을 모을 때까지 오늘 상위 100위 가격 사용. 초록/빨강 ×: Innisfree보다 저렴/비쌈.")}</p>
    </ActionSection>
  );
}
