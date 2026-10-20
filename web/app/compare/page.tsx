"use client";

import MethodNotes from "@/components/MethodNotes";
import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { Summary } from "@/components/compete/Overview";
import { ProductTable } from "@/components/compete/ProductTable";
import { Message } from "@/components/compete/Proposition";
import { Brands, HeadToHead, PriceBasket, WhereCompete } from "@/components/compete/Brands";
import RivalPicker, { loadEdits, saveEdits, MAX_PRODUCTS, type RivalEdit } from "@/components/compete/RivalPicker";
import { useMarket } from "@/lib/useMarket";
import { SectionNav, type NavItem } from "@/components/Report";
import Shell from "@/components/Shell";
import { Card, Loading, PageHead } from "@/components/ui";
import { ANCHOR_BRAND, SLOT_COLORS, norm, resolveBrand } from "@/lib/brands";
import { HERO_ORDER, brandFacts, productFacts, productOptions, searchCounts, shelfCat, shortTitle, standardSize, type Sources } from "@/lib/competeData";
import { useReviewsFor, useVariants, useAssortment, useCatalog, useDemand, useLastPrices, useMovement, useReviewMonths, useSearch, useShelf, useThumbnails } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/format";
import { monthsWindow } from "@/lib/metrics";
import { demandRows } from "@/lib/analysis";
import { useTiers } from "@/lib/tiers";
import { kBeautyBenchmark } from "@/lib/price";
import type { ReviewMonth } from "@/lib/types";
import { useUspComparisons, useUspProducts, type UspComparison } from "@/lib/usp";
import { push } from "@/lib/group";
import { dayMonth, dayMonthYear, tr } from "@/lib/i18n";
import { ScopeLine } from "@/components/Scope";

/** Competitive Analysis: the old USP and Compare tabs as one report (docs/restructure-v2-plan.md), layered in round 2
 *  (docs/competitive-round2-plan.md). Owner 19 Oct 2026: no view switch (few would find it); one page, brand to
 *  brand first, then product to product. Detail opens in the side panel. */

const ORDER = [...HERO_ORDER, ...CATEGORIES.filter((c) => !HERO_ORDER.includes(c))];
const readUrl = () => (typeof window === "undefined" ? {} : Object.fromEntries(new URLSearchParams(window.location.search).entries())) as Record<string, string>;

const NAV = (): NavItem[] => [
  { id: "brands", label: tr("1 · Brand scorecard", "1부 · 브랜드 스코어카드") },
  { id: "compete", label: tr("Where they compete", "경쟁 지점") },
  { id: "basket", label: tr("Price basket", "가격 바스켓") },
  { id: "part-products", label: tr("2 · Pick a product", "2부 · 제품 선택") },
  { id: "summary", label: tr("Product verdict", "제품 결론") },
  { id: "price", label: tr("Price", "가격") },
  { id: "buyers", label: tr("What buyers say", "구매자 반응") },
  { id: "visibility", label: tr("Shelf and search", "진열·검색") },
  { id: "demand", label: tr("Demand", "수요") },
  { id: "message", label: tr("Message", "메시지") },
];
// owner 20 Oct 2026: brands and products should read as two clearly separate halves
const PartHead = ({ id, n, title, sub, kind }: { id: string; n: number; title: string; sub: React.ReactNode; kind: "brands" | "products" }) => (
  <div id={id} className={`mt-12 scroll-mt-32 rounded-2xl px-5 py-4 ${kind === "brands" ? "bg-brand text-on-brand" : "bg-ink text-page"}`}>
    <div className="text-[12px] font-semibold uppercase tracking-[0.14em] opacity-80">{tr(`Part ${n} of 2 · ${kind === "brands" ? "brands" : "products"}`, `2부 중 ${n}부 · ${kind === "brands" ? "브랜드" : "제품"}`)}</div>
    <h2 className="mt-1 font-display text-[26px] font-semibold tracking-tight">{title}</h2>
    <p className="mt-1 max-w-[760px] text-[13.5px] leading-relaxed opacity-85">{sub}</p>
  </div>
);

function CompetitivePage() {
  const shelf = useShelf(); const catalog = useCatalog(); const months = useReviewMonths(); const search = useSearch(); const assort = useAssortment();
  const demand = useDemand(); const movement = useMovement(); const thumbs = useThumbnails(); const uspP = useUspProducts(); const uspC = useUspComparisons();
  const rows = useMemo(() => shelf.data ?? [], [shelf.data]);
  const cat0 = useMemo(() => catalog.data ?? [], [catalog.data]);
  const known = useMemo(() => [...new Set([...rows.map((r) => r.brand), ...cat0.map((r) => r.brand)])], [rows, cat0]);
  const tiers = useTiers(known);
  const anchor = resolveBrand(tiers.pinned || ANCHOR_BRAND, known) ?? ANCHOR_BRAND;

  const [url] = useState(readUrl);
  const [cat, setCat] = useState<string>(url.cat && ORDER.includes(url.cat) ? url.cat : "toner");
  const [heroPick, setHeroPick] = useState<string | null>(url.hero ?? null);
  const [brandOverride, setBrandOverride] = useState<string[] | null>(null);
  const [swap, setSwap] = useState<Record<string, string>>({});
  // Round 4: rivals anyone can drop or add, kept per hero (or per category without one) in this browser
  const [edits, setEdits] = useState<Record<string, RivalEdit>>(() => (typeof window === "undefined" ? {} : loadEdits()));
  const market = useMarket();

  const heroes = useMemo(() => (uspC.data ?? []).filter((g) => shelfCat(g.category) === cat), [uspC.data, cat]);
  const hero: UspComparison | null = heroes.find((g) => g.anchor_product_id === heroPick) ?? heroes[0] ?? null;
  const uspBy = useMemo(() => new Map((uspP.data ?? []).map((p) => [p.product_id, p])), [uspP.data]);

  useEffect(() => {
    const p = new URLSearchParams({ cat, ...(hero ? { hero: hero.anchor_product_id } : {}), });
    window.history.replaceState(null, "", `?${p.toString()}${window.location.hash}`);
  }, [cat, hero]);

  // without an analysed hero: the focus brands selling best in this category (2 Korean, 1 Indian, 1 global where they exist)
  const focusRivals = useMemo(() => {
    const best = (b: string) => Math.min(...rows.filter((r) => r.subcategory === cat && r.brand === b).map((r) => r.rank), 999);
    const sells = tiers.focus.filter((b) => productOptions(b, cat, rows, cat0).length).sort((a, b) => best(a) - best(b));
    const pick = [...sells.filter((b) => tiers.group(b) === "korean").slice(0, 2), ...sells.filter((b) => tiers.group(b) === "indian").slice(0, 1), ...sells.filter((b) => tiers.group(b) === "global").slice(0, 1)];
    return [...pick, ...sells.filter((b) => !pick.includes(b))].slice(0, 4);
  }, [tiers, rows, cat0, cat]);
  // Part 1's brands (owner 20 Oct 2026: the brand side should not depend on the product picked below): the main brands
  // with the most top-100 places in the categories Innisfree sells, 3 Korean, 1 Indian and 1 global; the picker overrides
  const brandDefault = useMemo(() => {
    const mine = new Set(CATEGORIES.filter((c) => productOptions(anchor, c, rows, cat0).length));
    const places = (b: string) => rows.filter((r) => r.brand === b && mine.has(r.subcategory)).length;
    const ranked = tiers.focus.filter((b) => b !== anchor && places(b) > 0).sort((a, b) => places(b) - places(a));
    const pick = [...ranked.filter((b) => tiers.group(b) === "korean").slice(0, 3), ...ranked.filter((b) => tiers.group(b) === "indian").slice(0, 1), ...ranked.filter((b) => tiers.group(b) === "global").slice(0, 1)];
    return [anchor, ...pick, ...ranked.filter((b) => !pick.includes(b))].slice(0, 6);
  }, [tiers, rows, cat0, anchor]);
  const brands = useMemo(() => {
    const base = brandOverride ?? brandDefault;
    return [anchor, ...base.filter((b) => b !== anchor)].slice(0, 6);
  }, [brandOverride, brandDefault, anchor]);
  const toggleBrand = (b: string) => {
    if (b === anchor) return;
    setBrandOverride(brands.includes(b) ? brands.filter((x) => x !== b) : brands.length >= 6 ? brands : [...brands, b]);
  };


  // products in view: the hero and its analysed rivals, else each brand's best-ranked product here
  const editKey = hero ? `hero|${hero.anchor_product_id}` : `cat|${cat}`;
  const edit = edits[editKey];
  const productIds = useMemo(() => {
    const base = hero ? [hero.anchor_product_id, ...hero.products.filter((x) => x !== hero.anchor_product_id)]
      .map((pid) => ({ pid, brand: uspBy.get(pid)?.brand ?? "", role: hero.roles?.[pid] ?? "anchor" }))
      : [anchor, ...focusRivals].map((b) => { const o = productOptions(b, cat, rows, cat0); const pid = swap[`${cat}|${b}`] ?? o[0]?.product_id; return pid ? { pid, brand: b, role: b === anchor ? "anchor" : "rival" } : null; })
        .filter((x): x is { pid: string; brand: string; role: string } => !!x);
    if (!edit) return base;
    const kept = base.filter((p, i) => i === 0 || !edit.removed.includes(p.pid));
    const added = edit.added.filter((a) => !kept.some((k) => k.pid === a.pid)).map((a) => ({ pid: a.pid, brand: a.brand, role: "added" }));
    return [...kept, ...added].slice(0, MAX_PRODUCTS);
  }, [hero, uspBy, focusRivals, cat, rows, cat0, swap, anchor, edit]);
  const changeEdit = (f: (e: RivalEdit) => RivalEdit | null) => {
    const next = { ...edits }; const v = f(edits[editKey] ?? { removed: [], added: [] });
    if (v && (v.removed.length || v.added.length)) next[editKey] = v; else delete next[editKey];
    setEdits(next); saveEdits(next);
  };
  // colour follows the brand: the brands in view, then any brand a user added
  const colors = useMemo(() => {
    const all = [...brands, ...productIds.map((p) => p.brand).filter((b) => b && !brands.includes(b)), ...tiers.focus];
    return Object.fromEntries([...new Set(all)].map((b, i) => [b, i === 0 ? "#0e3b2e" : SLOT_COLORS[(i - 1) % SLOT_COLORS.length]]));
  }, [brands, productIds, tiers.focus]);
  const ids = useMemo(() => productIds.map((p) => p.pid), [productIds]);
  const reviews = useReviewsFor(ids); const variants = useVariants(ids);
  const stdMl = useMemo(() => standardSize(rows, cat), [rows, cat]);
  const bench = useMemo(() => kBeautyBenchmark(rows, cat, anchor, stdMl), [rows, cat, anchor, stdMl]);
  const lastPrices = useLastPrices(useMemo(() => ids.filter((id) => !rows.some((r) => r.product_id === id) && !cat0.some((r) => r.product_id === id)), [ids, rows, cat0]));
  const win = useMemo(() => monthsWindow(12), []);
  const monthsBy = useMemo(() => { const m = new Map<string, ReviewMonth[]>(); (months.data ?? []).forEach((r) => push(m, r.product_id, r)); return m; }, [months.data]);
  // one row per review pool, the same counting as Analysis and Demand; every product of a pool gets the pool's numbers
  const pooled = useMemo(() => {
    if (!months.data || !demand.data || !shelf.data || !catalog.data) return undefined;
    const byPool = new Map(demandRows(months.data, demand.data, shelf.data, catalog.data).map((r) => [demand.data!.find((d) => d.product_id === r.product_id)?.pool_id || r.product_id, r]));
    return new Map(demand.data.map((d) => [d.product_id, byPool.get(d.pool_id || d.product_id)]).filter((x): x is [string, NonNullable<ReturnType<typeof byPool.get>>] => !!x[1]));
  }, [months.data, demand.data, shelf.data, catalog.data]);
  const poolMonths = useMemo(() => { if (!pooled || !months.data) return months.data ?? []; const keep = new Set([...pooled.values()].map((r) => r.product_id)); return months.data.filter((m) => keep.has(m.product_id)); }, [pooled, months.data]);
  const src: Sources = useMemo(() => ({
    cat, rows, catalog: cat0, demand: new Map((demand.data ?? []).map((d) => [d.product_id, d])), movement: movement.data ?? [], months: monthsBy, win,
    search: searchCounts(search.data ?? []), thumbs: new Map((thumbs.data ?? []).map((t) => [t.product_id, t])), usp: uspBy, reviews: reviews.data, variants: variants.data, stdMl, lastPrices: lastPrices.data, hero, pooled,
  }), [cat, rows, cat0, demand.data, movement.data, monthsBy, win, search.data, thumbs.data, uspBy, reviews.data, variants.data, stdMl, lastPrices.data, hero, pooled]);
  const products = useMemo(() => productIds.map(({ pid, brand, role }) => productFacts(pid, brand, role, src)), [productIds, src]);
  const bfacts = useMemo(() => brandFacts(brands, anchor, cat, rows, cat0, poolMonths, search.data ?? [], assort.data ?? []), [brands, anchor, cat, rows, cat0, poolMonths, search.data, assort.data]);

  // share of all top-100 buying, the site's one share measure (owner 20 Oct 2026)
  const buy = useMemo(() => {
    const cats = new Set(CATEGORIES); const by = new Map<string, number>(); let total = 0;
    for (const f of market.flow) if (cats.has(f.subcategory) && f.value > 0) { const k = norm(f.brand); by.set(k, (by.get(k) ?? 0) + f.value); total += f.value; }
    const span = market.flowSpan ? `${dayMonth(market.flowSpan.start)}–${dayMonth(market.flowSpan.end)}` : "";
    return { of: (b: string) => (total && by.get(norm(b)) ? by.get(norm(b))! / total : null), span };
  }, [market.flow, market.flowSpan]);
  const asOf = rows[0]?.scrape_date;
  const err = shelf.error || catalog.error || uspC.error || uspP.error;
  const loading = !shelf.data || !catalog.data || !uspC.data || !uspP.data;
  const sells = (c: string) => [anchor, ...tiers.focus].some((b) => productOptions(b, c, rows, cat0).length);

  return (
    <Shell active="Competitive Analysis" asOf={asOf ? dayMonthYear(asOf) : undefined}>
      <PageHead eyebrow={tr("Competitive analysis", "경쟁 분석")} title={tr("Competitive analysis", "경쟁 분석")} sub={tr(<>Part 1 compares Innisfree with the main rival brands, across every category. Part 2 picks one category and one Innisfree hero product and puts it against the rival products. Click anything with › for the detail.</>, <>1부: Innisfree vs 주요 경쟁 브랜드, 전체 카테고리. 2부: 카테고리와 Innisfree 히어로 제품을 골라 경쟁 제품과 비교. › 표시를 누르면 상세 표시.</>)} />
      <ScopeLine uses={["top100", "followed"]} measure={tr("Part 1, brands: places in the top 100s, written reviews and growth, and a like-for-like price basket. Part 2, products in one category: rank, price per ml or g, written reviews, and what each product page claims.", "1부 브랜드: 상위 100위 자리, 작성 리뷰·성장률, 동일 조건 가격 바스켓. 2부 한 카테고리 제품: 순위, ml·g당 가격, 작성 리뷰, 상품 페이지 주장.")} />
      {err && <div className="mt-6 rounded-xl bg-[#fbecea] px-4 py-3 text-[13px] text-bad">{tr("Could not load data", "데이터 불러오기 실패")}: {String(err.message ?? err)}</div>}
      {loading && !err ? <Loading what={tr("the comparison", "비교 데이터")} /> : !err && (
        <>
          <SectionNav items={NAV()} />

          <PartHead id="part-brands" n={1} kind="brands" title={tr("Brand to brand", "브랜드 대 브랜드")} sub={tr(<>Innisfree against up to five main brands, across every category: the scorecard, the categories where they meet, and a like-for-like price basket. It opens on the main brands with the most top-100 places in Innisfree&rsquo;s categories; change them in the scorecard.</>, <>Innisfree vs 주요 브랜드 최대 5곳, 전체 카테고리 기준: 스코어카드, 맞붙는 카테고리, 동일 조건 가격 바스켓. 기본값은 Innisfree 카테고리에서 상위 100위 자리가 가장 많은 주요 브랜드, 스코어카드에서 변경 가능.</>)} />
          <Brands facts={bfacts} anchor={anchor} cat={cat} colors={colors} brands={brands} known={known} rows={rows} isDefault={!brandOverride} focusSet={[tiers.pinned, ...tiers.focus]} inSet={tiers.inSet} buy={buy}
            onToggle={toggleBrand} onReset={() => setBrandOverride(null)} />
          <WhereCompete anchor={anchor} rows={rows} catalog={cat0} colors={colors} brands={brands}
            onPickCat={(c) => { setCat(c); setHeroPick(null); setTimeout(() => document.getElementById("part-products")?.scrollIntoView({ behavior: "smooth" }), 50); }} />
          <PriceBasket facts={bfacts} anchor={anchor} />

          <PartHead id="part-products" n={2} kind="products" title={tr(`Product to product · ${CATEGORY_LABEL[cat]}`, `제품 대 제품 · ${CATEGORY_LABEL[cat]}`)} sub={tr(<>{hero ? <>{shortTitle(hero.anchor_name, "Innisfree")} against its rival products</> : <>Each brand&rsquo;s best-ranked product in {CATEGORY_LABEL[cat]}</>}: the verdict, then price, what buyers say, shelf and demand side by side, then the message. Drop a rival or add any product with the bar below.</>, <>{hero ? <>{shortTitle(hero.anchor_name, "Innisfree")} vs 경쟁 제품</> : <>{CATEGORY_LABEL[cat]} 브랜드별 최고 순위 제품</>}: 결론, 가격·구매자 반응·진열·수요 비교표, 그다음 메시지 순. 아래 막대에서 경쟁 제품을 빼거나 원하는 제품 추가 가능.</>)} />
          {hero && productIds.some((p) => !tiers.inSet(p.brand)) && <p className="mt-4 rounded-xl bg-accent-soft px-4 py-2.5 text-[13px] text-ink-2">{tr(<>{[...new Set(productIds.filter((p) => !tiers.inSet(p.brand)).map((p) => p.brand))].join(", ")} {productIds.filter((p) => !tiers.inSet(p.brand)).length === 1 ? "is" : "are"} compared here because the comparison was made before your main brands were chosen; it is not one of them.</>,
            <>이 히어로의 경쟁 제품은 주요 브랜드 목록이 생기기 전에 AI 비교용으로 고른 것. {[...new Set(productIds.filter((p) => !tiers.inSet(p.brand)).map((p) => p.brand))].join(", ")}는 주요 브랜드가 아님. 비교 결과는 분석된 그대로 두고, </>)}</p>}
          <Card className="mt-5 px-4 py-3.5 ring-2 ring-brand/30">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{tr("Category", "카테고리")}</div>
            <div className="flex flex-wrap gap-1.5">
              {ORDER.filter((c) => HERO_ORDER.includes(c) || sells(c)).map((c) => {
                const n = (uspC.data ?? []).filter((g) => shelfCat(g.category) === c).length;
                return (
                  <button key={c} onClick={() => { setCat(c); setHeroPick(null); }}
                    className={`rounded-full px-3 py-1.5 text-[13px] transition ${cat === c ? "bg-brand font-medium text-on-brand" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink"}`}>
                    {CATEGORY_LABEL[c]}{n > 0 && <span className={`ml-1.5 text-[11px] ${cat === c ? "text-on-brand-muted" : "text-muted"}`}>{tr(`${n} hero${n > 1 ? "es" : ""}`, `히어로 ${n}`)}</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{tr("Innisfree hero", "Innisfree 히어로")}</span>
              {heroes.length ? heroes.map((g) => (
                <button key={g.anchor_product_id} onClick={() => setHeroPick(g.anchor_product_id)}
                  className={`rounded-full px-3 py-1 text-[12.5px] ring-1 transition ${g === hero ? "bg-brand text-on-brand ring-brand" : "bg-surface text-ink-2 ring-line hover:text-ink"}`}>
                  {shortTitle(g.anchor_name, "Innisfree")}
                </button>
              )) : <span className="text-[12.5px] text-muted">{tr(<>No Innisfree hero analysed in {CATEGORY_LABEL[cat]}: each brand&rsquo;s best-ranked product is compared instead, without the USP sections.</>, <>{CATEGORY_LABEL[cat]}에는 분석된 Innisfree 히어로가 없어, 브랜드별 최고 순위 제품을 소구점 섹션 없이 비교.</>)}</span>}
            </div>
          </Card>

          <HeadToHead anchor={anchor} uspBy={uspBy} comps={uspC.data ?? []} colors={colors}
            onPick={(c, h) => { setCat(c); setHeroPick(h); }} />
          <RivalPicker cat={cat} anchorBrand={anchor} edited={!!edit} rows={rows} catalog={cat0} flow={market.flow}
            current={products.map((p) => ({ pid: p.pid, brand: p.brand, role: p.role === "anchor" || p.pid === productIds[0]?.pid ? "anchor" : p.role, name: p.name }))}
            onRemove={(pid) => changeEdit((e) => ({ removed: e.added.some((a) => a.pid === pid) ? e.removed : [...e.removed, pid], added: e.added.filter((a) => a.pid !== pid) }))}
            onAdd={(pid, brand) => changeEdit((e) => ({ removed: e.removed.filter((x) => x !== pid), added: [...e.added, { pid, brand }] }))}
            onReset={() => changeEdit(() => null)} />
          <Summary hero={hero} products={products} bench={bench} cat={cat} />
          <ProductTable products={products} colors={colors} bench={bench} std={stdMl} cat={cat} loading={reviews.isLoading}
            optionsFor={hero ? null : (b) => productOptions(b, cat, rows, cat0)} onSwap={(b, pid) => setSwap({ ...swap, [`${cat}|${b}`]: pid })} />
          <Message hero={hero} products={products} colors={colors} />
        </>
      )}
      <MethodNotes parts={{
        sources: [tr("Each product's Nykaa page (price per pack size, offers, claims, ingredients, buyers' review highlights), its written reviews, Nykaa's top 100 and search results. The written comparison of messages was made earlier with AI (paused since October) and is shown as analysed.", "제품별 Nykaa 페이지(용량별 가격, 프로모션, 소구점, 성분, 리뷰 요약), 작성 리뷰, Nykaa 상위 100위와 검색 결과. 메시지 비교 글은 이전 AI 분석 결과(10월부터 중단)를 그대로 표시.")],
        calc: [tr("Price per 100 ml/g: the closest standard pack (minis, kits and combos left out), so different pack sizes compare fairly.", "100 ml/g당 가격: 가장 가까운 표준 용량 기준(미니·키트·세트 제외), 용량이 달라도 공정하게 비교."),
          tr("Rank: place among the category's own products (Nykaa files them under the category); reviews: last 3 complete months.", "순위: 카테고리 자체 제품 중 위치(Nykaa가 해당 카테고리로 분류); 리뷰: 최근 완결된 3개월.")],
        assume: [tr("What buyers repeat in reviews reflects what the product is bought for.", "리뷰에서 반복되는 표현 = 구매 이유로 봄.")],
        limits: [tr("Message and image comparisons are from the last AI run and do not update until AI spend resumes.", "메시지·이미지 비교는 마지막 AI 분석 결과이며, AI 사용 재개 전까지 갱신 안 됨.")],
      }} />
    </Shell>
  );
}

export default function Page() {
  return <AuthGate><CompetitivePage /></AuthGate>;
}
