"use client";

import BrandPicker from "@/components/BrandPicker";
import CompareGrid, { type ExtraRow, type GridCol } from "@/components/CompareGrid";
import PresenceMatrix from "@/components/PresenceMatrix";
import { ActionSection, Finding } from "@/components/Report";
import Sparkline from "@/components/Sparkline";
import { Card } from "@/components/ui";
import { Missing, Points, useDetail } from "@/components/Detail";
import { ORIGIN_LABEL, norm } from "@/lib/brands";
import { demandWindow } from "@/lib/analysis";
import { standings, strongestWeakest, type Criterion } from "@/lib/compete";
import { productOptions, shelfCat, shortTitle, type BrandFacts } from "@/lib/competeData";
import { CATEGORIES, CATEGORY_LABEL, compact, inr, pct, signed } from "@/lib/format";
import { basketLabel, PRICE_BASKET } from "@/lib/price";
import type { CatalogRow, ShelfRow } from "@/lib/types";
import type { UspComparison, UspProduct } from "@/lib/usp";
import { tr } from "@/lib/i18n";
import { tx } from "@/lib/dict";

const SKINCARE = ["toner", "serum", "face_moisturizer", "face_wash", "sunscreen", "cleansing_balm", "masks", "sheet_mask", "eye_care", "lip_care"];

function criteriaFor(cat: string, anchor: string): Criterion<BrandFacts>[] {
  const inBasket = (PRICE_BASKET as readonly string[]).includes(cat);
  const crawl = (f: BrandFacts) => (f.basket.source === "shelf" ? tr("Full range crawl pending (from 12 Oct)", "전체 라인업 수집 대기 (10월 12일부터)") : tr("Sells none of these on Nykaa", "Nykaa에서 해당 제품 미판매"));
  const notOnShelf = () => tr("No listing in today's top 100", "오늘 상위 100위 제품 없음");
  const notTracked = () => tr("Not in review tracking", "리뷰 추적 대상 아님");
  return [
    { key: "price", label: tr("MRP, core basket", "정가, 핵심 바스켓"), help: tr(`Average of the brand's median full-size MRP per basket category (${basketLabel()})`, `바스켓 카테고리별 정규 용량 정가 중앙값의 평균 (${basketLabel()})`), better: null, value: (f) => f.basket.overall, show: (f) => inr(f.basket.overall),
      sub: (f) => (f.brand === anchor ? tr(`${f.basket.categories} of 5 categories`, `5개 카테고리 중 ${f.basket.categories}개`) : f.basket.vsAnchor ? tr(`${f.basket.vsAnchor.toFixed(2)}× Innisfree, on ${f.basket.shared} shared`, `Innisfree의 ${f.basket.vsAnchor.toFixed(2)}배 (공통 ${f.basket.shared}개 기준)`) : tr(`${f.basket.categories} of 5 categories`, `5개 카테고리 중 ${f.basket.categories}개`)),
      missing: (f) => (f.basket.overall === null ? crawl(f) : null) },
    { key: "catprice", label: tr(`MRP, ${CATEGORY_LABEL[cat]}`, `정가, ${CATEGORY_LABEL[cat]}`), help: inBasket ? tr("Median full-size MRP in this category", "이 카테고리 정규 용량 정가 중앙값") : tr("Median full-size MRP in this category (outside the core basket)", "이 카테고리 정규 용량 정가 중앙값 (핵심 바스켓 외)"), better: null,
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
    { key: "demand", label: tr("Reviews, last 3 months", "최근 3개월 리뷰"), help: tr("Dated reviews on its tracked products in the last 3 complete months (one count per product, sizes pooled): a stand-in for recent sales", "최근 완결된 3개월 동안 추적 제품에 작성된 리뷰 (제품당 한 번, 용량 합산). 최근 판매의 대리 지표"), better: "high", value: (f) => f.last3, show: (f) => compact(f.last3),
      sub: (f) => tr(`${DW().recent} · ${f.demandProducts} products`, `${DW().recent} · 제품 ${f.demandProducts}개`), bar: true, missing: (f) => (f.last3 === null ? notTracked() : null) },
    { key: "momentum", label: tr("Review growth", "리뷰 성장률"), help: tr(`Reviews ${DW().recent} against ${DW().prior}, products with complete history only`, `${DW().recent} 리뷰 vs ${DW().prior} 리뷰. 이력이 완전한 제품만`), better: "high", value: (f) => f.growth, show: (f) => signed(f.growth), sub: () => tr(`vs ${DW().prior}`, `${DW().prior} 대비`),
      missing: (f) => (f.growth === null ? (f.last3 === null ? notTracked() : tr("Too new to compare", "비교하기엔 너무 새 제품")) : null) },
    { key: "search", label: tr("K-beauty searches", "K-뷰티 검색"), help: tr("Tracked Korean-beauty searches where it shows in the first 10 unpaid results", "비광고 상위 10개 결과에 나오는 추적 K-뷰티 검색어 수"), better: "high", value: (f) => f.searchTerms,
      show: (f) => (f.searchTerms ? String(f.searchTerms) : tr("In none", "없음")), sub: (f) => (f.bestSearch ? tr(`best #${f.bestSearch}`, `최고 #${f.bestSearch}`) : null), bar: true },
    { key: "range", label: tr("Products on Nykaa", "Nykaa 판매 제품 수"), help: tr("All products the brand lists on Nykaa", "브랜드가 Nykaa에 올린 전체 제품"), better: null, value: (f) => f.range, show: (f) => String(f.range),
      sub: (f) => (f.conversion !== null ? tr(`${pct(f.conversion)} reach a top 100`, `${pct(f.conversion)}가 상위 100위 진입`) : null), missing: (f) => (f.range === null ? tr("Range not counted for this brand", "이 브랜드는 라인업 미집계") : null) },
  ];
}
const GROUPS = () => ({ price: tr("Price and promotion", "가격·프로모션"), listings: tr("Shelf visibility", "진열 노출"), rating: tr("Buyer response", "구매자 반응"), demand: tr("Demand (sales signal)", "수요 (판매 신호)"), search: tr("Search", "검색"), range: tr("Range", "라인업") });

/* ---------------------------------------------------------------- §7 brands */

const DW = () => demandWindow();
export function Brands({ facts, anchor, cat, colors, brands, known, rows, isHeroSet, onToggle, onReset, focusSet, inSet }: {
  facts: BrandFacts[]; anchor: string; cat: string; colors: Record<string, string>; brands: string[]; known: string[]; rows: ShelfRow[];
  isHeroSet: boolean; onToggle: (b: string) => void; onReset: () => void; focusSet: string[]; inSet: (b: string) => boolean;
}) {
  const criteria = criteriaFor(cat, anchor);
  const a = facts.find((f) => f.brand === anchor);
  const rivals = facts.filter((f) => f.brand !== anchor);
  const priced = rivals.filter((f) => f.basket.vsAnchor !== null);
  const cheaper = priced.filter((f) => f.basket.vsAnchor! < 0.95).length;
  const { strong, weak } = a ? strongestWeakest(standings(a, rivals, criteria), 2) : { strong: [], weak: [] };
  const list = (xs: { label: string }[]) => xs.map((x) => x.label.toLowerCase()).join(tr(" and ", ", "));
  const title = a ? tr(`${strong.length ? `Innisfree beats most of these brands on ${list(strong)}` : "Innisfree leads these brands on no measure"}${weak.length ? ` and trails on ${list(weak)}` : ""}; its core basket costs more than ${cheaper} of ${priced.length} of them.`,
      `${strong.length ? `Innisfree는 ${list(strong)}에서 이 브랜드들 대부분을 앞서고` : "Innisfree가 이 브랜드들보다 앞서는 지표는 없고"}${weak.length ? `, ${list(weak)}에서는 뒤처짐` : ""}. 핵심 바스켓 가격은 ${priced.length}개 브랜드 중 ${cheaper}개보다 비쌈.`) : tr("Brand vs brand.", "브랜드 대 브랜드.");

  const on = facts.filter((f) => f.slots > 0);
  const widest = [...on].sort((x, y) => y.slots - x.slots);
  const byPrice = [...facts].filter((f) => f.basket.overall !== null).sort((x, y) => x.basket.overall! - y.basket.overall!);
  const mom = facts.filter((f) => f.growth !== null && (f.last3 ?? 0) >= 30).sort((x, y) => y.growth! - x.growth!);
  const srch = [...facts].sort((x, y) => y.searchTerms - x.searchTerms);
  const focus = focusSet.filter((b) => known.includes(b));
  const all = [...new Set(rows.map((r) => r.brand))].map((b) => ({ brand: b, slots: rows.filter((r) => r.brand === b).length })).sort((x, y) => y.slots - x.slots);

  const cols: GridCol[] = facts.map((f) => ({ key: f.brand, anchor: f.brand === anchor, head: (
    <div>
      <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[f.brand] }} /><span className="text-[14px] font-semibold">{f.brand}</span>{!inSet(f.brand) && <span className="whitespace-nowrap rounded bg-sunken px-1 text-[10px] font-normal text-muted ring-1 ring-line">{tr("not in focus set", "주요 브랜드 외")}</span>}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-muted">{ORIGIN_LABEL[f.origin]}{f.madeIn ? tr(` · made in ${f.madeIn}`, ` · ${tx(f.madeIn)} 생산`) : ""}{f.kMarketing ? tr(" · sells as Korean", " · K-뷰티 브랜드로 마케팅") : ""}{f.basket.source === "shelf" ? tr(" · prices from today's top 100 until its full range is crawled", " · 전체 라인업 수집 전까지 오늘 상위 100위 가격 사용") : ""}</div>
    </div>
  ) }));
  const extra: ExtraRow<BrandFacts>[] = [
    { after: "momentum", label: tr("12-month trend", "12개월 추이"), help: tr("Monthly reviews over the last 12 complete months", "최근 완결된 12개월의 월별 리뷰 수"), has: (f) => f.spark.some((v) => v !== null), missing: () => tr("Not in review tracking", "리뷰 추적 대상 아님"), render: (f) => <Sparkline values={f.spark} color={colors[f.brand]} width={140} height={30} /> },
  ];

  return (
    <ActionSection id="brands" kicker={tr("Brand scorecard · Innisfree vs the brands behind these products", "브랜드 스코어카드 · Innisfree vs 경쟁 제품의 브랜드")} title={title}
      note={isHeroSet ? tr("Brands of the selected hero's rivals. Change the set below; the products above stay the analysed group.", "선택한 히어로의 경쟁 제품 브랜드. 아래에서 브랜드 변경 가능, 위 제품은 분석된 그룹 그대로.") : tr("Change the brand set below.", "아래에서 브랜드 변경 가능.")}>
      <Card className="mb-4 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          <span>{tr("Brands compared · up to 6, Innisfree always included", "비교 브랜드 · 최대 6개, Innisfree 항상 포함")}</span>
          {!isHeroSet && <button onClick={onReset} className="normal-case tracking-normal text-ink-2 underline decoration-line-2 underline-offset-2 hover:text-ink">{tr("Reset to the hero’s rivals", "히어로의 경쟁 브랜드로 되돌리기")}</button>}
        </div>
        <BrandPicker focus={focus} all={all} selected={brands} colors={colors} onToggle={onToggle} max={6} />
      </Card>
      {on.length >= 2 && (
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <Finding label={tr("Shelf presence", "진열 존재감")}>{tr(<><b>{widest[0].brand}</b> has the widest presence: {widest[0].slots} top-100 listings across {widest[0].categories.length} categories, against {widest[widest.length - 1].slots} for {widest[widest.length - 1].brand}.</>, <><b>{widest[0].brand}</b>: 존재감이 가장 넓음. 카테고리 {widest[0].categories.length}개에 걸쳐 상위 100위 제품 {widest[0].slots}개 ({widest[widest.length - 1].brand}는 {widest[widest.length - 1].slots}개).</>)}</Finding>
          {byPrice.length >= 2 && <Finding label={tr("Price (core basket)", "가격 (핵심 바스켓)")}>{tr(<><b>{byPrice[0].brand}</b> is the most affordable at {inr(byPrice[0].basket.overall)}; <b>{byPrice[byPrice.length - 1].brand}</b> the most premium at {inr(byPrice[byPrice.length - 1].basket.overall)}.</>, <>가장 저렴한 곳: <b>{byPrice[0].brand}</b>({inr(byPrice[0].basket.overall)}), 가장 고가: <b>{byPrice[byPrice.length - 1].brand}</b>({inr(byPrice[byPrice.length - 1].basket.overall)}).</>)}</Finding>}
          {mom.length >= 2 && <Finding label={tr("Demand momentum", "수요 모멘텀")} tone={norm(mom[0].brand) === norm(anchor) ? "good" : undefined}>{tr(<>Momentum favours <b>{mom[0].brand}</b> ({signed(mom[0].growth)} reviews, {DW().recent} vs {DW().prior}); <b>{mom[mom.length - 1].brand}</b> is weakest ({signed(mom[mom.length - 1].growth)}).</>, <>모멘텀이 가장 좋은 곳: <b>{mom[0].brand}</b>(리뷰 {signed(mom[0].growth)}, {DW().recent} vs {DW().prior}), 가장 약한 곳: <b>{mom[mom.length - 1].brand}</b>({signed(mom[mom.length - 1].growth)}).</>)}</Finding>}
          {srch[0]?.searchTerms > 0 && <Finding label={tr("Search", "검색")}>{tr(<><b>{srch[0].brand}</b> shows up in the most K-beauty searches: top 10 unpaid for {srch[0].searchTerms} tracked terms{a ? `, against ${a.searchTerms} for Innisfree` : ""}.</>, <>K-뷰티 검색 노출이 가장 많은 곳: <b>{srch[0].brand}</b>— 추적 검색어 {srch[0].searchTerms}개에서 비광고 상위 10위{a ? ` (Innisfree는 ${a.searchTerms}개)` : ""}.</>)}</Finding>}
        </div>
      )}
      <CompareGrid cols={cols} items={facts} criteria={criteria} extra={extra} groups={GROUPS()} colors={facts.map((f) => colors[f.brand])} labelWidth={160} />
      <p className="mt-2 text-[11.5px] text-muted">{tr("Shelf, rating and paid figures are from today’s top-100 listings; prices from each brand’s full Nykaa range where tracked. Hover a row name for its definition.", "진열·평점·광고 수치는 오늘 상위 100위 제품 기준, 가격은 추적 브랜드의 Nykaa 전체 라인업 기준. 행 이름에 마우스를 올리면 정의 표시.")}</p>
    </ActionSection>
  );
}

/* ---------------------------------------------------------------- §8 where they compete */

export function WhereCompete({ facts, anchor, rows, catalog, uspBy, comps, colors, brands, onPickCat }: {
  facts: BrandFacts[]; anchor: string; rows: ShelfRow[]; catalog: CatalogRow[]; uspBy: Map<string, UspProduct>; comps: UspComparison[];
  colors: Record<string, string>; brands: string[]; onPickCat: (c: string) => void;
}) {
  const cats = [...SKINCARE, ...CATEGORIES.filter((c) => !SKINCARE.includes(c))].filter((c) => SKINCARE.includes(c) || brands.some((b) => productOptions(b, c, rows, catalog).length));
  const anchorSells = (c: string) => productOptions(anchor, c, rows, catalog).length > 0;
  const gaps = cats.filter((c) => !anchorSells(c) && brands.some((b) => b !== anchor && rows.some((r) => r.brand === b && r.subcategory === c)));
  const lines = facts.filter((f) => f.brand !== anchor).map((f) => {
    const h2h = comps.flatMap((g) => g.products.filter((id) => uspBy.get(id)?.brand === f.brand && id !== g.anchor_product_id).map((id) => ({ g, p: uspBy.get(id)! })));
    const shared = cats.filter((c) => anchorSells(c) && productOptions(f.brand, c, rows, catalog).length);
    return { f, h2h, rest: shared.filter((c) => !h2h.some((x) => shelfCat(x.g.category) === c)) };
  });
  const h2hCats = new Set(lines.flatMap((l) => l.h2h.map((x) => shelfCat(x.g.category))));
  const title = tr(`Innisfree meets these brands head-to-head in ${h2hCats.size} categor${h2hCats.size === 1 ? "y" : "ies"}${gaps.length ? `; it sells nothing in ${gaps.map((c) => CATEGORY_LABEL[c].toLowerCase()).join(", ")}, where rivals rank` : ""}.`,
    `Innisfree는 카테고리 ${h2hCats.size}곳에서 이 브랜드들과 정면 경쟁${gaps.length ? `. 경쟁사가 순위에 오른 ${gaps.map((c) => CATEGORY_LABEL[c]).join(", ")}에선 판매 제품 없음` : ""}.`);
  return (
    <ActionSection id="compete" kicker={tr("Where they compete", "경쟁 지점")} title={title}
      note={tr("Head-to-head: a rival product the USP analysis set against an Innisfree hero, with that rival's lead benefit. Grid: top-100 listings today, or how much a brand sells there without ranking (full range for tracked brands). Click a category row to open it.", "정면 경쟁: 소구점 분석에서 Innisfree 히어로와 맞붙인 경쟁 제품과 대표 효능. 표: 오늘 상위 100위 제품 수, 또는 순위 밖에서 판매 중인 제품 수(추적 브랜드는 전체 라인업 기준). 카테고리 행을 누르면 해당 카테고리로 이동.")}>
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {lines.map(({ f, h2h, rest }) => (
          <Card key={f.brand} className="px-4 py-3.5">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: colors[f.brand] }} />{f.brand}</div>
            {h2h.length ? (
              <ul className="mt-1.5 space-y-1.5">{h2h.map(({ g, p }) => {
                const benefit = [...p.analysis.key_benefits].sort((x, y) => y.emphasis - x.emphasis)[0]?.benefit;
                return <li key={g.anchor_product_id + p.product_id} className="text-[12px] leading-snug"><b className="font-semibold">{CATEGORY_LABEL[shelfCat(g.category)]}</b>: {shortTitle(p.name, p.brand)} vs {shortTitle(g.anchor_name, "Innisfree")}{benefit && <span className="block text-ink-2">{tr("Leads on", "대표 효능")}: {tx(benefit)}</span>}</li>;
              })}</ul>
            ) : <p className="mt-1.5 text-[12px] text-muted">{tr("No head-to-head pairing in the USP analysis.", "소구점 분석에 정면 경쟁 짝 없음.")}</p>}
            {rest.length > 0 && <p className="mt-2 text-[11.5px] text-muted">{tr("Also both sell", "둘 다 판매")}: {rest.map((c) => CATEGORY_LABEL[c]).join(", ")}</p>}
            {!h2h.length && !rest.length && <p className="mt-1 text-[11.5px] text-muted">{tr(`No overlap with Innisfree’s range${f.basket.source === "shelf" ? " (top 100 only)" : ""}.`, `Innisfree 라인업과 겹치는 곳 없음${f.basket.source === "shelf" ? " (상위 100위 기준)" : ""}.`)}</p>}
          </Card>
        ))}
      </div>
      <PresenceMatrix shelf={rows} catalog={catalog} anchor={anchor} brands={brands} colors={colors} onPick={onPickCat} categories={cats} />
    </ActionSection>
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
    <ActionSection id="basket" kicker={tr("Price · like for like, on MRP", "가격 · 정가 기준 동일 조건 비교")} title={title} note={tr(`Median full-size MRP in each core category (${basketLabel()}). "×" compares with Innisfree on the categories both sell; click a price for how it was built.`, `핵심 카테고리별 정규 용량 정가 중앙값 (${basketLabel()}). "×" = 둘 다 판매하는 카테고리에서 Innisfree 대비 값, 가격을 누르면 계산 방법 표시.`)}>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12.5px] tabular">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-muted">
              <th className="px-4 py-2.5 font-semibold">{tr("Brand", "브랜드")}</th>
              <th className="px-3 py-2.5 font-semibold">{tr("Basket", "바스켓")}</th>
              {PRICE_BASKET.map((c) => <th key={c} className="px-3 py-2.5 font-semibold">{CATEGORY_LABEL[c]}</th>)}
              <th className="px-3 py-2.5 font-semibold">{tr("Avg discount", "평균 할인율")}</th>
            </tr>
          </thead>
          <tbody>
            {facts.map((f) => (
              <tr key={f.brand} className={`border-b border-line last:border-0 ${f.brand === anchor ? "bg-page/70" : ""}`}>
                <td className="px-4 py-2 font-medium">{f.brand}</td>
                <td className="px-3 py-2">{f.basket.overall ? <><b>{inr(f.basket.overall)}</b>{f.basket.vsAnchor && f.brand !== anchor ? <span className="block text-[10.5px] text-muted">{tr(`${f.basket.vsAnchor.toFixed(2)}× Innisfree`, `Innisfree의 ${f.basket.vsAnchor.toFixed(2)}배`)}</span> : null}</> : <Missing>{gap(f)}</Missing>}</td>
                {PRICE_BASKET.map((c) => { const v = f.basket.byCategory[c]; const av = a?.basket.byCategory[c]; return (
                  <td key={c} className="px-3 py-2">{v ? <button onClick={() => open(cellDetail(f, c))} className="text-left hover:underline">
                    <b>{inr(v.price)}</b>{av && f.brand !== anchor && <span className={`ml-1 text-[10.5px] ${v.price > av.price * 1.05 ? "text-bad" : v.price < av.price * 0.95 ? "text-good" : "text-muted"}`}>{(v.price / av.price).toFixed(2)}×</span>}
                    {v.perHundred ? <span className="block text-[10.5px] text-muted">₹{Math.round(v.perHundred).toLocaleString("en-IN")}/100 ml</span> : null}</button> : <Missing>{gap(f)}</Missing>}</td>
                ); })}
                <td className="px-3 py-2">{f.avgDiscount === null ? <Missing>{tr("No top-100 listing", "상위 100위 제품 없음")}</Missing> : `${Math.round(f.avgDiscount)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-[11.5px] text-muted">{tr("“Not sold”: the brand has no full-size product in that category on Nykaa. “Crawl pending”: brands outside the 22 tracked K-beauty brands are priced from today’s top 100 until the weekly catalogue run (first run 12 Oct) collects their full range. Green/red ×: cheaper/dearer than Innisfree.", "“미판매”: 해당 카테고리에 Nykaa 정규 용량 제품 없음. “수집 대기”: 추적 중인 K-뷰티 22개 브랜드 외 브랜드는 주간 카탈로그 수집(첫 수집 10월 12일)이 전체 라인업을 모을 때까지 오늘 상위 100위 가격 사용. 초록/빨강 ×: Innisfree보다 저렴/비쌈.")}</p>
    </ActionSection>
  );
}
