"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { Summary } from "@/components/compete/Overview";
import { PriceSection } from "@/components/compete/Price";
import { Message } from "@/components/compete/Proposition";
import { Buyers, Demand, Visibility } from "@/components/compete/Reception";
import { Brands, PriceBasket, WhereCompete } from "@/components/compete/Brands";
import RivalPicker, { loadEdits, saveEdits, MAX_PRODUCTS, type RivalEdit } from "@/components/compete/RivalPicker";
import { useMarket } from "@/lib/useMarket";
import { SectionNav, type NavItem } from "@/components/Report";
import Segmented from "@/components/Segmented";
import Shell from "@/components/Shell";
import { Card, Loading, PageHead, Verdict } from "@/components/ui";
import { ANCHOR_BRAND, SLOT_COLORS, resolveBrand } from "@/lib/brands";
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
import { dayMonthYear, tr } from "@/lib/i18n";

/** Competitive Analysis: the old USP and Compare tabs as one report (docs/restructure-v2-plan.md), layered in round 2
 *  (docs/competitive-round2-plan.md): Product view answers first, then price, message, buyers, visibility, demand;
 *  brand-vs-brand lives in its own Brand view so the two never repeat each other. Detail opens in the side panel. */

const ORDER = [...HERO_ORDER, ...CATEGORIES.filter((c) => !HERO_ORDER.includes(c))];
const readUrl = () => (typeof window === "undefined" ? {} : Object.fromEntries(new URLSearchParams(window.location.search).entries())) as Record<string, string>;

const PRODUCT_NAV = (): NavItem[] => [
  { id: "summary", label: tr("Verdict", "결론") },
  { id: "price", label: tr("Price", "가격") },
  { id: "message", label: tr("Message", "메시지") },
  { id: "buyers", label: tr("What buyers say", "구매자 반응") },
  { id: "visibility", label: tr("Visibility", "노출") },
  { id: "demand", label: tr("Demand", "수요") },
];
const BRAND_NAV = (): NavItem[] => [
  { id: "brands", label: tr("Brand scorecard", "브랜드 스코어카드") },
  { id: "compete", label: tr("Where they compete", "경쟁 지점") },
  { id: "price", label: tr("Price basket", "가격 바스켓") },
];
type View = "product" | "brand";

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
  const [view, setView] = useState<View>(url.view === "brand" ? "brand" : "product");
  // Round 4: rivals anyone can drop or add, kept per hero (or per category without one) in this browser
  const [edits, setEdits] = useState<Record<string, RivalEdit>>(() => (typeof window === "undefined" ? {} : loadEdits()));
  const market = useMarket();

  const heroes = useMemo(() => (uspC.data ?? []).filter((g) => shelfCat(g.category) === cat), [uspC.data, cat]);
  const hero: UspComparison | null = heroes.find((g) => g.anchor_product_id === heroPick) ?? heroes[0] ?? null;
  const uspBy = useMemo(() => new Map((uspP.data ?? []).map((p) => [p.product_id, p])), [uspP.data]);

  useEffect(() => {
    const p = new URLSearchParams({ cat, ...(hero ? { hero: hero.anchor_product_id } : {}), ...(view === "brand" ? { view } : {}) });
    window.history.replaceState(null, "", `?${p.toString()}${window.location.hash}`);
  }, [cat, hero, view]);

  // without an analysed hero: the focus brands selling best in this category (2 Korean, 1 Indian, 1 global where they exist)
  const focusRivals = useMemo(() => {
    const best = (b: string) => Math.min(...rows.filter((r) => r.subcategory === cat && r.brand === b).map((r) => r.rank), 999);
    const sells = tiers.focus.filter((b) => productOptions(b, cat, rows, cat0).length).sort((a, b) => best(a) - best(b));
    const pick = [...sells.filter((b) => tiers.group(b) === "korean").slice(0, 2), ...sells.filter((b) => tiers.group(b) === "indian").slice(0, 1), ...sells.filter((b) => tiers.group(b) === "global").slice(0, 1)];
    return [...pick, ...sells.filter((b) => !pick.includes(b))].slice(0, 4);
  }, [tiers, rows, cat0, cat]);
  // brands in view: the hero's rival brands, else the focus rivals above; the brand picker (§7) overrides either
  const heroBrands = useMemo(() => hero ? [...new Set([anchor, ...hero.products.map((id) => uspBy.get(id)?.brand).filter((b): b is string => !!b)])] : null, [hero, uspBy, anchor]);
  const brands = useMemo(() => {
    const base = brandOverride ?? heroBrands ?? [anchor, ...focusRivals];
    return [anchor, ...base.filter((b) => b !== anchor)].slice(0, 6);
  }, [brandOverride, heroBrands, anchor, focusRivals]);
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
      : brands.map((b) => { const o = productOptions(b, cat, rows, cat0); const pid = swap[`${cat}|${b}`] ?? o[0]?.product_id; return pid ? { pid, brand: b, role: b === anchor ? "anchor" : "rival" } : null; })
        .filter((x): x is { pid: string; brand: string; role: string } => !!x);
    if (!edit) return base;
    const kept = base.filter((p, i) => i === 0 || !edit.removed.includes(p.pid));
    const added = edit.added.filter((a) => !kept.some((k) => k.pid === a.pid)).map((a) => ({ pid: a.pid, brand: a.brand, role: "added" }));
    return [...kept, ...added].slice(0, MAX_PRODUCTS);
  }, [hero, uspBy, brands, cat, rows, cat0, swap, anchor, edit]);
  const changeEdit = (f: (e: RivalEdit) => RivalEdit | null) => {
    const next = { ...edits }; const v = f(edits[editKey] ?? { removed: [], added: [] });
    if (v && (v.removed.length || v.added.length)) next[editKey] = v; else delete next[editKey];
    setEdits(next); saveEdits(next);
  };
  // colour follows the brand: the brands in view, then any brand a user added
  const colors = useMemo(() => {
    const all = [...brands, ...productIds.map((p) => p.brand).filter((b) => b && !brands.includes(b))];
    return Object.fromEntries([...new Set(all)].map((b, i) => [b, i === 0 ? "#0e3b2e" : SLOT_COLORS[(i - 1) % SLOT_COLORS.length]]));
  }, [brands, productIds]);
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

  const asOf = rows[0]?.scrape_date;
  const err = shelf.error || catalog.error || uspC.error || uspP.error;
  const loading = !shelf.data || !catalog.data || !uspC.data || !uspP.data;
  const sells = (c: string) => brands.some((b) => productOptions(b, c, rows, cat0).length);

  return (
    <Shell active="Competitive Analysis" asOf={asOf ? dayMonthYear(asOf) : undefined}>
      <PageHead eyebrow={tr("Competitive · step 5", "경쟁 분석 · 5단계")} title={tr("Competitive Analysis", "경쟁 분석")} sub={tr(<>Innisfree against its direct rivals in one category. The verdict first, then the evidence; click anything with › for the detail. Drop a rival or add any product with the bar under the hero.</>, <>한 카테고리 안에서 Innisfree와 직접 경쟁 제품을 비교합니다. 결론을 먼저, 근거를 뒤에 두었으며 › 표시를 누르면 상세가 나옵니다. 히어로 아래 막대에서 경쟁 제품을 빼거나 아무 제품이나 추가할 수 있습니다.</>)} />
      {err && <div className="mt-6 rounded-xl bg-[#fbecea] px-4 py-3 text-[13px] text-bad">{tr("Could not load data", "데이터를 불러오지 못했습니다")}: {String(err.message ?? err)}</div>}
      {loading && !err ? <Loading what={tr("the comparison", "비교 데이터")} /> : !err && (
        <>
          {hero && productIds.some((p) => !tiers.inSet(p.brand)) && <p className="mt-4 rounded-xl bg-accent-soft px-4 py-2.5 text-[13px] text-ink-2">{tr(<>This hero&rsquo;s rivals were picked for the AI comparison before the focus set existed: {[...new Set(productIds.filter((p) => !tiers.inSet(p.brand)).map((p) => p.brand))].join(", ")} {productIds.filter((p) => !tiers.inSet(p.brand)).length === 1 ? "is" : "are"} outside your focus brands. The comparison stays as analysed; the brand view below uses the focus set when you change brands.</>,
            <>이 히어로의 경쟁 제품은 주요 브랜드 목록이 생기기 전에 AI 비교용으로 골랐습니다. {[...new Set(productIds.filter((p) => !tiers.inSet(p.brand)).map((p) => p.brand))].join(", ")}는 주요 브랜드 밖입니다. 비교 결과는 분석된 그대로 두며, 아래 브랜드 보기에서 브랜드를 바꾸면 주요 브랜드 기준으로 보여 줍니다.</>)}</p>}
          <Card className="mt-5 px-4 py-3.5">
            <div className="flex flex-wrap gap-1.5">
              {ORDER.filter((c) => HERO_ORDER.includes(c) || sells(c)).map((c) => {
                const n = (uspC.data ?? []).filter((g) => shelfCat(g.category) === c).length;
                return (
                  <button key={c} onClick={() => { setCat(c); setHeroPick(null); setBrandOverride(null); }}
                    className={`rounded-full px-3 py-1.5 text-[13px] transition ${cat === c ? "bg-brand font-medium text-on-brand" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink"}`}>
                    {CATEGORY_LABEL[c]}{n > 0 && <span className={`ml-1.5 text-[11px] ${cat === c ? "text-on-brand-muted" : "text-muted"}`}>{tr(`${n} hero${n > 1 ? "es" : ""}`, `히어로 ${n}`)}</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{tr("Innisfree hero", "Innisfree 히어로")}</span>
              {heroes.length ? heroes.map((g) => (
                <button key={g.anchor_product_id} onClick={() => { setHeroPick(g.anchor_product_id); setBrandOverride(null); }}
                  className={`rounded-full px-3 py-1 text-[12.5px] ring-1 transition ${g === hero ? "bg-brand text-on-brand ring-brand" : "bg-surface text-ink-2 ring-line hover:text-ink"}`}>
                  {shortTitle(g.anchor_name, "Innisfree")}
                </button>
              )) : <span className="text-[12.5px] text-muted">{tr(<>No Innisfree hero analysed in {CATEGORY_LABEL[cat]}: each brand&rsquo;s best-ranked product is compared instead, without the USP sections.</>, <>{CATEGORY_LABEL[cat]}에는 분석된 Innisfree 히어로가 없어, 브랜드별 최고 순위 제품을 소구점 섹션 없이 비교합니다.</>)}</span>}
            </div>
          </Card>

          <div className="mt-4">
            <Segmented value={view} onChange={(v) => { setView(v); window.scrollTo({ top: 0 }); }} options={[
              { value: "product", label: tr("Product view", "제품 보기"), hint: hero ? tr(`${shortTitle(hero.anchor_name, "Innisfree")} vs its rivals`, `${shortTitle(hero.anchor_name, "Innisfree")} vs 경쟁 제품`) : tr(`Best product per brand in ${CATEGORY_LABEL[cat]}`, `${CATEGORY_LABEL[cat]} 브랜드별 최고 제품`) },
              { value: "brand", label: tr("Brand view", "브랜드 보기"), hint: tr("Innisfree vs the brands behind them", "Innisfree vs 경쟁 브랜드") },
            ]} />
          </div>
          {view === "product" ? (<>
            <RivalPicker cat={cat} anchorBrand={anchor} edited={!!edit} rows={rows} catalog={cat0} flow={market.flow}
              current={products.map((p) => ({ pid: p.pid, brand: p.brand, role: p.role === "anchor" || p.pid === productIds[0]?.pid ? "anchor" : p.role, name: p.name }))}
              onRemove={(pid) => changeEdit((e) => ({ removed: e.added.some((a) => a.pid === pid) ? e.removed : [...e.removed, pid], added: e.added.filter((a) => a.pid !== pid) }))}
              onAdd={(pid, brand) => changeEdit((e) => ({ removed: e.removed.filter((x) => x !== pid), added: [...e.added, { pid, brand }] }))}
              onReset={() => changeEdit(() => null)} />
            <SectionNav key="p" items={PRODUCT_NAV()} />
            <Summary hero={hero} products={products} bench={bench} cat={cat} />
            <PriceSection products={products} colors={colors} bench={bench} std={stdMl} cat={cat} optionsFor={hero ? null : (b) => productOptions(b, cat, rows, cat0)} onSwap={(b, pid) => setSwap({ ...swap, [`${cat}|${b}`]: pid })} />
            <Message hero={hero} products={products} colors={colors} />
            <Buyers products={products} colors={colors} loading={reviews.isLoading} />
            <Visibility products={products} colors={colors} cat={cat} />
            <Demand products={products} colors={colors} />
          </>) : (<>
            <SectionNav key="b" items={BRAND_NAV()} />
            <Brands facts={bfacts} anchor={anchor} cat={cat} colors={colors} brands={brands} known={known} rows={rows} isHeroSet={!brandOverride} focusSet={[tiers.pinned, ...tiers.focus]} inSet={tiers.inSet}
              onToggle={toggleBrand} onReset={() => setBrandOverride(null)} />
            <WhereCompete facts={bfacts} anchor={anchor} rows={rows} catalog={cat0} uspBy={uspBy} comps={uspC.data ?? []} colors={colors} brands={brands}
              onPickCat={(c) => { setCat(c); setHeroPick(null); setView("product"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
            <PriceBasket facts={bfacts} anchor={anchor} />
          </>)}
        </>
      )}
    </Shell>
  );
}

export default function Page() {
  return <AuthGate><CompetitivePage /></AuthGate>;
}
