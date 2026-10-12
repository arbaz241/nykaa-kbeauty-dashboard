"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { Summary } from "@/components/compete/Overview";
import { PriceSection } from "@/components/compete/Price";
import { Message } from "@/components/compete/Proposition";
import { Buyers, Demand, Visibility } from "@/components/compete/Reception";
import { Brands, PriceBasket, WhereCompete } from "@/components/compete/Brands";
import { SectionNav, type NavItem } from "@/components/Report";
import Segmented from "@/components/Segmented";
import Shell from "@/components/Shell";
import { Card, Loading, PageHead, Verdict } from "@/components/ui";
import { ANCHOR_BRAND, SLOT_COLORS, resolveBrand } from "@/lib/brands";
import { HERO_ORDER, brandFacts, productFacts, productOptions, searchCounts, shelfCat, shortTitle, standardSize, type Sources } from "@/lib/competeData";
import { useReviewsFor, useVariants, useAssortment, useCatalog, useDemand, useLastPrices, useMovement, useReviewMonths, useSearch, useShelf, useThumbnails } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/format";
import { monthsWindow } from "@/lib/metrics";
import { kBeautyBenchmark } from "@/lib/price";
import type { ReviewMonth } from "@/lib/types";
import { useUspComparisons, useUspProducts, type UspComparison } from "@/lib/usp";

/** Competitive Analysis: the old USP and Compare tabs as one report (docs/restructure-v2-plan.md), layered in round 2
 *  (docs/competitive-round2-plan.md): Product view answers first, then price, message, buyers, visibility, demand;
 *  brand-vs-brand lives in its own Brand view so the two never repeat each other. Detail opens in the side panel. */

const ORDER = [...HERO_ORDER, ...CATEGORIES.filter((c) => !HERO_ORDER.includes(c))];
const DEFAULT_RIVALS = ["Beauty of Joseon", "Laneige", "The Face Shop", "COSRX"];
const readUrl = () => (typeof window === "undefined" ? {} : Object.fromEntries(new URLSearchParams(window.location.search).entries())) as Record<string, string>;

const PRODUCT_NAV: NavItem[] = [
  { id: "summary", label: "Verdict" },
  { id: "price", label: "Price" },
  { id: "message", label: "Message" },
  { id: "buyers", label: "What buyers say" },
  { id: "visibility", label: "Visibility" },
  { id: "demand", label: "Demand" },
];
const BRAND_NAV: NavItem[] = [
  { id: "brands", label: "Brand scorecard" },
  { id: "compete", label: "Where they compete" },
  { id: "price", label: "Price basket" },
];
type View = "product" | "brand";

function CompetitivePage() {
  const shelf = useShelf(); const catalog = useCatalog(); const months = useReviewMonths(); const search = useSearch(); const assort = useAssortment();
  const demand = useDemand(); const movement = useMovement(); const thumbs = useThumbnails(); const uspP = useUspProducts(); const uspC = useUspComparisons();
  const rows = useMemo(() => shelf.data ?? [], [shelf.data]);
  const cat0 = useMemo(() => catalog.data ?? [], [catalog.data]);
  const known = useMemo(() => [...new Set([...rows.map((r) => r.brand), ...cat0.map((r) => r.brand)])], [rows, cat0]);
  const anchor = resolveBrand(ANCHOR_BRAND, known) ?? ANCHOR_BRAND;

  const [url] = useState(readUrl);
  const [cat, setCat] = useState<string>(url.cat && ORDER.includes(url.cat) ? url.cat : "toner");
  const [heroPick, setHeroPick] = useState<string | null>(url.hero ?? null);
  const [brandOverride, setBrandOverride] = useState<string[] | null>(null);
  const [swap, setSwap] = useState<Record<string, string>>({});
  const [view, setView] = useState<View>(url.view === "brand" ? "brand" : "product");

  const heroes = useMemo(() => (uspC.data ?? []).filter((g) => shelfCat(g.category) === cat), [uspC.data, cat]);
  const hero: UspComparison | null = heroes.find((g) => g.anchor_product_id === heroPick) ?? heroes[0] ?? null;
  const uspBy = useMemo(() => new Map((uspP.data ?? []).map((p) => [p.product_id, p])), [uspP.data]);

  useEffect(() => {
    const p = new URLSearchParams({ cat, ...(hero ? { hero: hero.anchor_product_id } : {}), ...(view === "brand" ? { view } : {}) });
    window.history.replaceState(null, "", `?${p.toString()}${window.location.hash}`);
  }, [cat, hero, view]);

  // brands in view: the hero's rival brands, else a default set; the brand picker (§7) overrides either
  const heroBrands = useMemo(() => hero ? [...new Set([anchor, ...hero.products.map((id) => uspBy.get(id)?.brand).filter((b): b is string => !!b)])] : null, [hero, uspBy, anchor]);
  const brands = useMemo(() => {
    const base = brandOverride ?? heroBrands ?? [anchor, ...DEFAULT_RIVALS.map((b) => resolveBrand(b, known)).filter((b): b is string => !!b)];
    return [anchor, ...base.filter((b) => b !== anchor)].slice(0, 6);
  }, [brandOverride, heroBrands, anchor, known]);
  const toggleBrand = (b: string) => {
    if (b === anchor) return;
    setBrandOverride(brands.includes(b) ? brands.filter((x) => x !== b) : brands.length >= 6 ? brands : [...brands, b]);
  };
  const colors = useMemo(() => Object.fromEntries(brands.map((b, i) => [b, i === 0 ? "#0e3b2e" : SLOT_COLORS[(i - 1) % SLOT_COLORS.length]])), [brands]);

  // products in view: the hero and its analysed rivals, else each brand's best-ranked product here
  const productIds = useMemo(() => {
    if (hero) return [hero.anchor_product_id, ...hero.products.filter((x) => x !== hero.anchor_product_id)]
      .map((pid) => ({ pid, brand: uspBy.get(pid)?.brand ?? "", role: hero.roles?.[pid] ?? "anchor" }));
    return brands.map((b) => { const o = productOptions(b, cat, rows, cat0); const pid = swap[`${cat}|${b}`] ?? o[0]?.product_id; return pid ? { pid, brand: b, role: b === anchor ? "anchor" : "rival" } : null; })
      .filter((x): x is { pid: string; brand: string; role: string } => !!x);
  }, [hero, uspBy, brands, cat, rows, cat0, swap, anchor]);
  const ids = useMemo(() => productIds.map((p) => p.pid), [productIds]);
  const reviews = useReviewsFor(ids); const variants = useVariants(ids);
  const stdMl = useMemo(() => standardSize(rows, cat), [rows, cat]);
  const bench = useMemo(() => kBeautyBenchmark(rows, cat, anchor, stdMl), [rows, cat, anchor, stdMl]);
  const lastPrices = useLastPrices(useMemo(() => ids.filter((id) => !rows.some((r) => r.product_id === id) && !cat0.some((r) => r.product_id === id)), [ids, rows, cat0]));
  const win = useMemo(() => monthsWindow(12), []);
  const monthsBy = useMemo(() => { const m = new Map<string, ReviewMonth[]>(); (months.data ?? []).forEach((r) => m.set(r.product_id, [...(m.get(r.product_id) ?? []), r])); return m; }, [months.data]);
  const src: Sources = useMemo(() => ({
    cat, rows, catalog: cat0, demand: new Map((demand.data ?? []).map((d) => [d.product_id, d])), movement: movement.data ?? [], months: monthsBy, win,
    search: searchCounts(search.data ?? []), thumbs: new Map((thumbs.data ?? []).map((t) => [t.product_id, t])), usp: uspBy, reviews: reviews.data, variants: variants.data, stdMl, lastPrices: lastPrices.data, hero,
  }), [cat, rows, cat0, demand.data, movement.data, monthsBy, win, search.data, thumbs.data, uspBy, reviews.data, variants.data, stdMl, lastPrices.data, hero]);
  const products = useMemo(() => productIds.map(({ pid, brand, role }) => productFacts(pid, brand, role, src)), [productIds, src]);
  const bfacts = useMemo(() => brandFacts(brands, anchor, cat, rows, cat0, months.data ?? [], search.data ?? [], assort.data ?? []), [brands, anchor, cat, rows, cat0, months.data, search.data, assort.data]);

  const asOf = rows[0]?.scrape_date;
  const err = shelf.error || catalog.error || uspC.error || uspP.error;
  const loading = !shelf.data || !catalog.data || !uspC.data || !uspP.data;
  const sells = (c: string) => brands.some((b) => productOptions(b, c, rows, cat0).length);

  return (
    <Shell active="Competitive Analysis" asOf={asOf ? new Date(asOf).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : undefined}>
      <PageHead eyebrow="Innisfree vs its rivals" title="Competitive Analysis" sub={<>Innisfree against its direct rivals in one category. The verdict first, then the evidence; click anything with › for the detail.</>} />
      {err && <div className="mt-6 rounded-xl bg-[#fbecea] px-4 py-3 text-[13px] text-bad">Could not load data: {String(err.message ?? err)}</div>}
      {loading && !err ? <Loading what="the comparison" /> : !err && (
        <>
          <Card className="mt-5 px-4 py-3.5">
            <div className="flex flex-wrap gap-1.5">
              {ORDER.filter((c) => HERO_ORDER.includes(c) || sells(c)).map((c) => {
                const n = (uspC.data ?? []).filter((g) => shelfCat(g.category) === c).length;
                return (
                  <button key={c} onClick={() => { setCat(c); setHeroPick(null); setBrandOverride(null); }}
                    className={`rounded-full px-3 py-1.5 text-[13px] transition ${cat === c ? "bg-brand font-medium text-on-brand" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink"}`}>
                    {CATEGORY_LABEL[c]}{n > 0 && <span className={`ml-1.5 text-[11px] ${cat === c ? "text-on-brand-muted" : "text-muted"}`}>{n} hero{n > 1 ? "es" : ""}</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Innisfree hero</span>
              {heroes.length ? heroes.map((g) => (
                <button key={g.anchor_product_id} onClick={() => { setHeroPick(g.anchor_product_id); setBrandOverride(null); }}
                  className={`rounded-full px-3 py-1 text-[12.5px] ring-1 transition ${g === hero ? "bg-brand text-on-brand ring-brand" : "bg-surface text-ink-2 ring-line hover:text-ink"}`}>
                  {shortTitle(g.anchor_name, "Innisfree")}
                </button>
              )) : <span className="text-[12.5px] text-muted">No Innisfree hero analysed in {CATEGORY_LABEL[cat]}: each brand&rsquo;s best-ranked product is compared instead, without the USP sections.</span>}
            </div>
          </Card>

          <div className="mt-4">
            <Segmented value={view} onChange={(v) => { setView(v); window.scrollTo({ top: 0 }); }} options={[
              { value: "product", label: "Product view", hint: hero ? `${shortTitle(hero.anchor_name, "Innisfree")} vs its rivals` : `Best product per brand in ${CATEGORY_LABEL[cat]}` },
              { value: "brand", label: "Brand view", hint: "Innisfree vs the brands behind them" },
            ]} />
          </div>
          {view === "product" ? (<>
            <SectionNav key="p" items={PRODUCT_NAV} />
            <Summary hero={hero} products={products} bench={bench} cat={cat} />
            <PriceSection products={products} colors={colors} bench={bench} std={stdMl} cat={cat} optionsFor={hero ? null : (b) => productOptions(b, cat, rows, cat0)} onSwap={(b, pid) => setSwap({ ...swap, [`${cat}|${b}`]: pid })} />
            <Message hero={hero} products={products} colors={colors} />
            <Buyers products={products} colors={colors} loading={reviews.isLoading} />
            <Visibility products={products} colors={colors} cat={cat} />
            <Demand products={products} colors={colors} />
          </>) : (<>
            <SectionNav key="b" items={BRAND_NAV} />
            <Brands facts={bfacts} anchor={anchor} cat={cat} colors={colors} brands={brands} known={known} rows={rows} isHeroSet={!brandOverride}
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
