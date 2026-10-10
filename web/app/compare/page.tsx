"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { ProductScorecard, Summary } from "@/components/compete/Overview";
import { Battlecards, Proposition } from "@/components/compete/Proposition";
import { Reception, Shelf } from "@/components/compete/Reception";
import { SectionNav, type NavItem } from "@/components/Report";
import Shell from "@/components/Shell";
import { Card, Loading } from "@/components/ui";
import { ANCHOR_BRAND, SLOT_COLORS, resolveBrand } from "@/lib/brands";
import { HERO_ORDER, brandFacts, productFacts, productOptions, searchCounts, shelfCat, shortTitle, type Sources } from "@/lib/competeData";
import { useAspectsFor, useAssortment, useCatalog, useDemand, useLastPrices, useMovement, useReviewMonths, useSearch, useShelf, useThumbnails } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/format";
import { monthsWindow } from "@/lib/metrics";
import type { ReviewMonth } from "@/lib/types";
import { useUspComparisons, useUspProducts, type UspComparison } from "@/lib/usp";

/** Competitive Analysis: the old USP and Compare tabs as one report (docs/restructure-v2-plan.md).
 *  Answer first, then one section per pillar; every element of the old pages has a visible place. */

const ORDER = [...HERO_ORDER, ...CATEGORIES.filter((c) => !HERO_ORDER.includes(c))];
const DEFAULT_RIVALS = ["Beauty of Joseon", "Laneige", "The Face Shop", "COSRX"];
const readUrl = () => (typeof window === "undefined" ? {} : Object.fromEntries(new URLSearchParams(window.location.search).entries())) as Record<string, string>;

const NAV: NavItem[] = [
  { id: "summary", label: "Summary" },
  { id: "scorecard", label: "Scorecard" },
  { id: "proposition", label: "Proposition" },
  { id: "rivals", label: "Rival by rival" },
  { id: "reception", label: "What buyers say" },
  { id: "shelf", label: "Shelf presentation" },
];

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

  const heroes = useMemo(() => (uspC.data ?? []).filter((g) => shelfCat(g.category) === cat), [uspC.data, cat]);
  const hero: UspComparison | null = heroes.find((g) => g.anchor_product_id === heroPick) ?? heroes[0] ?? null;
  const uspBy = useMemo(() => new Map((uspP.data ?? []).map((p) => [p.product_id, p])), [uspP.data]);

  useEffect(() => {
    const p = new URLSearchParams({ cat, ...(hero ? { hero: hero.anchor_product_id } : {}) });
    window.history.replaceState(null, "", `?${p.toString()}${window.location.hash}`);
  }, [cat, hero]);

  // brands in view: the hero's rival brands, else a default set; the brand picker (§7) overrides either
  const heroBrands = useMemo(() => hero ? [...new Set([anchor, ...hero.products.map((id) => uspBy.get(id)?.brand).filter((b): b is string => !!b)])] : null, [hero, uspBy, anchor]);
  const brands = useMemo(() => {
    const base = brandOverride ?? heroBrands ?? [anchor, ...DEFAULT_RIVALS.map((b) => resolveBrand(b, known)).filter((b): b is string => !!b)];
    return [anchor, ...base.filter((b) => b !== anchor)].slice(0, 6);
  }, [brandOverride, heroBrands, anchor, known]);
  const colors = useMemo(() => Object.fromEntries(brands.map((b, i) => [b, i === 0 ? "#121211" : SLOT_COLORS[(i - 1) % SLOT_COLORS.length]])), [brands]);

  // products in view: the hero and its analysed rivals, else each brand's best-ranked product here
  const productIds = useMemo(() => {
    if (hero) return [hero.anchor_product_id, ...hero.products.filter((x) => x !== hero.anchor_product_id)]
      .map((pid) => ({ pid, brand: uspBy.get(pid)?.brand ?? "", role: hero.roles?.[pid] ?? "anchor" }));
    return brands.map((b) => { const o = productOptions(b, cat, rows, cat0); const pid = swap[`${cat}|${b}`] ?? o[0]?.product_id; return pid ? { pid, brand: b, role: b === anchor ? "anchor" : "rival" } : null; })
      .filter((x): x is { pid: string; brand: string; role: string } => !!x);
  }, [hero, uspBy, brands, cat, rows, cat0, swap, anchor]);
  const ids = useMemo(() => productIds.map((p) => p.pid), [productIds]);
  const aspects = useAspectsFor(ids);
  const lastPrices = useLastPrices(useMemo(() => ids.filter((id) => !rows.some((r) => r.product_id === id) && !cat0.some((r) => r.product_id === id)), [ids, rows, cat0]));
  const win = useMemo(() => monthsWindow(12), []);
  const monthsBy = useMemo(() => { const m = new Map<string, ReviewMonth[]>(); (months.data ?? []).forEach((r) => m.set(r.product_id, [...(m.get(r.product_id) ?? []), r])); return m; }, [months.data]);
  const src: Sources = useMemo(() => ({
    cat, rows, catalog: cat0, demand: new Map((demand.data ?? []).map((d) => [d.product_id, d])), movement: movement.data ?? [], months: monthsBy, win,
    search: searchCounts(search.data ?? []), thumbs: new Map((thumbs.data ?? []).map((t) => [t.product_id, t])), usp: uspBy, aspects: aspects.data, lastPrices: lastPrices.data, hero,
  }), [cat, rows, cat0, demand.data, movement.data, monthsBy, win, search.data, thumbs.data, uspBy, aspects.data, lastPrices.data, hero]);
  const products = useMemo(() => productIds.map(({ pid, brand, role }) => productFacts(pid, brand, role, src)), [productIds, src]);
  const bfacts = useMemo(() => brandFacts(brands, anchor, cat, rows, cat0, months.data ?? [], search.data ?? [], assort.data ?? []), [brands, anchor, cat, rows, cat0, months.data, search.data, assort.data]);

  const asOf = rows[0]?.scrape_date;
  const err = shelf.error || catalog.error || uspC.error || uspP.error;
  const loading = !shelf.data || !catalog.data || !uspC.data || !uspP.data;
  const sells = (c: string) => brands.some((b) => productOptions(b, c, rows, cat0).length);

  return (
    <Shell active="Competitive Analysis" asOf={asOf ? new Date(asOf).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : undefined}>
      <h1 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.02em]">Competitive Analysis</h1>
      <p className="mt-1 max-w-[860px] text-[14px] text-ink-2">Innisfree against its direct rivals in one category: the answer first, then the evidence by pillar: price, shelf visibility, demand, search, what each product promises, what buyers say, how it looks on the shelf, and the brands behind them.</p>
      {err && <div className="mt-6 rounded-xl bg-[#fbecea] px-4 py-3 text-[13px] text-bad">Could not load data: {String(err.message ?? err)}</div>}
      {loading && !err ? <Loading what="the comparison" /> : !err && (
        <>
          <Card className="mt-5 px-4 py-3.5">
            <div className="flex flex-wrap gap-1.5">
              {ORDER.filter((c) => HERO_ORDER.includes(c) || sells(c)).map((c) => {
                const n = (uspC.data ?? []).filter((g) => shelfCat(g.category) === c).length;
                return (
                  <button key={c} onClick={() => { setCat(c); setHeroPick(null); setBrandOverride(null); }}
                    className={`rounded-full px-3 py-1.5 text-[13px] transition ${cat === c ? "bg-ink font-medium text-white" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink"}`}>
                    {CATEGORY_LABEL[c]}{n > 0 && <span className={`ml-1.5 text-[11px] ${cat === c ? "text-white/70" : "text-muted"}`}>{n} hero{n > 1 ? "es" : ""}</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Innisfree hero</span>
              {heroes.length ? heroes.map((g) => (
                <button key={g.anchor_product_id} onClick={() => { setHeroPick(g.anchor_product_id); setBrandOverride(null); }}
                  className={`rounded-full px-3 py-1 text-[12.5px] ring-1 transition ${g === hero ? "bg-ink text-white ring-ink" : "bg-surface text-ink-2 ring-line hover:text-ink"}`}>
                  {shortTitle(g.anchor_name, "Innisfree")}
                </button>
              )) : <span className="text-[12.5px] text-muted">No Innisfree hero analysed in {CATEGORY_LABEL[cat]}: each brand&rsquo;s best-ranked product is compared instead, without the USP sections.</span>}
            </div>
          </Card>

          <SectionNav items={hero ? NAV : NAV.filter((n) => n.id !== "rivals")} />
          <Summary hero={hero} products={products} brands={bfacts} anchor={anchor} cat={cat} />
          <ProductScorecard products={products} colors={colors} cat={cat} optionsFor={hero ? null : (b) => productOptions(b, cat, rows, cat0)} onSwap={(b, pid) => setSwap({ ...swap, [`${cat}|${b}`]: pid })} />
          <Proposition hero={hero} products={products} colors={colors} />
          {hero && <Battlecards hero={hero} products={products} colors={colors} />}
          <Reception hero={hero} products={products} colors={colors} loading={aspects.isLoading} />
          <Shelf products={products} colors={colors} />
        </>
      )}
    </Shell>
  );
}

export default function Page() {
  return <AuthGate><CompetitivePage /></AuthGate>;
}
