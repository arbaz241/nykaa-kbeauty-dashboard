"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import BrandPicker from "@/components/BrandPicker";
import CompareGrid, { Chip, type ExtraRow, type GridCol } from "@/components/CompareGrid";
import PresenceMatrix from "@/components/PresenceMatrix";
import { useOpenProduct } from "@/components/ProductDrawer";
import Segmented from "@/components/Segmented";
import Shell from "@/components/Shell";
import { Card, Loading } from "@/components/ui";
import UspDetail from "@/components/UspDetail";
import { ANCHOR_BRAND, FOCUS_BRANDS, SLOT_COLORS, resolveBrand } from "@/lib/brands";
import { standings, strongestWeakest, type Criterion, type Standing } from "@/lib/compete";
import { useAspectsFor, useAssortment, useCatalog, useDemand, useLastPrices, useReviewMonths, useSearch, useShelf, useThumbnails } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL, compact, inr, packMl, pct, shortName, signed } from "@/lib/format";
import { brandScore, type AspectStat, type BrandScore } from "@/lib/metrics";
import { BASKET_LABEL, PRICE_BASKET, basketPrice, categoryPrice, withAnchor, type BasketPrice } from "@/lib/price";
import type { CatalogRow, SearchRow, ShelfRow, Thumbnail } from "@/lib/types";
import { VERDICT, useUspComparisons, useUspProducts, type UspComparison, type UspProduct } from "@/lib/usp";

/** Hero categories in the order the owner reads them, then the rest of the tracked shelves. The USP analysis
 *  files lip balms as "lip_balm"; on the shelf they are the Lip care category. */
const HERO_ORDER = ["toner", "face_moisturizer", "serum", "sunscreen", "face_wash", "masks", "eye_care", "lip_care"];
const ORDER = [...HERO_ORDER, ...CATEGORIES.filter((c) => !HERO_ORDER.includes(c))];
const shelfCat = (c: string | null) => (c === "lip_balm" ? "lip_care" : c ?? "");
/** Categories a skincare brand can sensibly be compared in; make-up rows only when someone sells there. */
const SKINCARE = ["toner", "serum", "face_moisturizer", "face_wash", "sunscreen", "cleansing_balm", "masks", "sheet_mask", "eye_care", "lip_care"];
const DEFAULT_RIVALS = ["Beauty of Joseon", "Laneige", "The Face Shop", "COSRX"];
type View = "brands" | "products";

const readUrl = () => (typeof window === "undefined" ? {} : Object.fromEntries(new URLSearchParams(window.location.search).entries())) as Record<string, string>;
const short = (name: string, brand: string, n = 34) => { const s = shortName(name, brand).split(/,| [-–|] | SPF | For | with /i)[0]; return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
const clip = (s: string, n = 30) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** First sentence, cut at a clause break when it is still long. */
function oneLine(s: string, n = 170) {
  const first = s.split(/(?<=[.!?])\s/)[0];
  if (first.length <= n) return first;
  const cut = first.slice(0, n); const at = Math.max(cut.lastIndexOf(", but"), cut.lastIndexOf(";"), cut.lastIndexOf(","));
  return `${(at > 60 ? cut.slice(0, at) : cut).trim()}…`;
}

interface ProductFacts {
  pid: string; brand: string; name: string; url: string | null; image: string | null; role: string;
  price: number | null; mrp: number | null; perHundred: number | null; pack: string | null; priceNote: string | null;
  rank: number | null; paid: boolean; rating: number | null; ratings: number | null;
  recent: number | null; momentum: number | null; search: number;
  usp?: UspProduct; thumb?: Thumbnail; angle?: string; aspects?: AspectStat[]; phrases: { text: string; sentiment: string }[];
}
type BrandFacts = BrandScore & { basket: BasketPrice; catPrice: { price: number; perHundred: number | null; n: number } | null };

function CompetitivePage() {
  const shelf = useShelf(); const catalog = useCatalog(); const months = useReviewMonths(); const search = useSearch(); const assort = useAssortment();
  const demand = useDemand(); const thumbs = useThumbnails(); const uspP = useUspProducts(); const uspC = useUspComparisons();
  const rows = useMemo(() => shelf.data ?? [], [shelf.data]);
  const cat0 = useMemo(() => catalog.data ?? [], [catalog.data]);
  const known = useMemo(() => [...new Set([...rows.map((r) => r.brand), ...cat0.map((r) => r.brand)])], [rows, cat0]);
  const anchor = resolveBrand(ANCHOR_BRAND, known) ?? ANCHOR_BRAND;

  const [url] = useState(readUrl);
  const [cat, setCat] = useState<string>(url.cat && ORDER.includes(url.cat) ? url.cat : "toner");
  const [heroPick, setHeroPick] = useState<string | null>(url.hero ?? null);
  const [view, setView] = useState<View>(url.view === "products" ? "products" : "brands");
  const [brandOverride, setBrandOverride] = useState<string[] | null>(null);
  const [swap, setSwap] = useState<Record<string, string>>({});

  const heroes = useMemo(() => (uspC.data ?? []).filter((g) => shelfCat(g.category) === cat), [uspC.data, cat]);
  const hero: UspComparison | null = heroes.find((g) => g.anchor_product_id === heroPick) ?? heroes[0] ?? null;
  const uspBy = useMemo(() => new Map((uspP.data ?? []).map((p) => [p.product_id, p])), [uspP.data]);

  useEffect(() => {
    const p = new URLSearchParams({ cat, view, ...(hero ? { hero: hero.anchor_product_id } : {}) });
    window.history.replaceState(null, "", `?${p.toString()}`);
  }, [cat, view, hero]);

  // ---- brands: the hero's rival brands, else a default set; the picker overrides either
  const heroBrands = useMemo(() => hero ? [...new Set([anchor, ...hero.products.map((id) => uspBy.get(id)?.brand).filter((b): b is string => !!b)])] : null, [hero, uspBy, anchor]);
  const brands = useMemo(() => {
    const base = brandOverride ?? heroBrands ?? [anchor, ...DEFAULT_RIVALS.map((b) => resolveBrand(b, known)).filter((b): b is string => !!b)];
    return [anchor, ...base.filter((b) => b !== anchor)].slice(0, 6);
  }, [brandOverride, heroBrands, anchor, known]);
  const colors = useMemo(() => Object.fromEntries(brands.map((b, i) => [b, i === 0 ? "#121211" : SLOT_COLORS[(i - 1) % SLOT_COLORS.length]])), [brands]);
  const toggleBrand = (b: string) => {
    if (b === anchor) return;
    setBrandOverride(brands.includes(b) ? brands.filter((x) => x !== b) : brands.length >= 6 ? brands : [...brands, b]);
  };

  // ---- products in view
  const searchTop10 = useMemo(() => searchCounts(search.data ?? []), [search.data]);
  const demandBy = useMemo(() => new Map((demand.data ?? []).map((d) => [d.product_id, d])), [demand.data]);
  const thumbBy = useMemo(() => new Map((thumbs.data ?? []).map((t) => [t.product_id, t])), [thumbs.data]);
  const optionsFor = (b: string) => productOptions(b, cat, rows, cat0);
  const productIds: { pid: string; brand: string; role: string }[] = useMemo(() => {
    if (hero) {
      const ids = [hero.anchor_product_id, ...hero.products.filter((x) => x !== hero.anchor_product_id)];
      return ids.map((pid) => ({ pid, brand: uspBy.get(pid)?.brand ?? "", role: hero.roles?.[pid] ?? "anchor" }));
    }
    return brands.map((b) => { const o = productOptions(b, cat, rows, cat0); const pid = swap[`${cat}|${b}`] ?? o[0]?.product_id; return pid ? { pid, brand: b, role: b === anchor ? "anchor" : "rival" } : null; })
      .filter((x): x is { pid: string; brand: string; role: string } => !!x);
  }, [hero, uspBy, brands, cat, rows, cat0, swap, anchor]);
  const ids = productIds.map((p) => p.pid);
  const aspects = useAspectsFor(view === "products" ? ids : []);
  const unknownPrice = useMemo(() => ids.filter((id) => !rows.some((r) => r.product_id === id) && !cat0.some((r) => r.product_id === id)), [ids, rows, cat0]);
  const lastPrices = useLastPrices(unknownPrice);

  const products: ProductFacts[] = useMemo(() => productIds.map(({ pid, brand, role }) => {
    const onCat = rows.filter((r) => r.product_id === pid && r.subcategory === cat).sort((a, b) => a.rank - b.rank)[0];
    const anyShelf = onCat ?? rows.find((r) => r.product_id === pid);
    const inCatalog = cat0.find((r) => r.product_id === pid);
    const u = uspBy.get(pid); const lp = lastPrices.data?.get(pid);
    const name = anyShelf?.name ?? inCatalog?.name ?? u?.name ?? pid;
    const price = anyShelf?.price ?? inCatalog?.price ?? lp?.price ?? null;
    const pack = anyShelf?.pack_size ?? inCatalog?.pack_size ?? null;
    const ml = packMl(pack) ?? packMl(name);
    const d = demandBy.get(pid);
    const angle = hero?.comparison.products.find((x) => x.product.toLowerCase().includes(name.toLowerCase().slice(0, 24)) || name.toLowerCase().includes(x.product.toLowerCase().slice(0, 24)))?.distinct_angle;
    return {
      pid, brand: brand || anyShelf?.brand || inCatalog?.brand || "", name, url: anyShelf?.url ?? inCatalog?.url ?? u?.url ?? null,
      image: anyShelf?.image_url ?? inCatalog?.best_image ?? thumbBy.get(pid)?.image_url ?? null, role,
      price, mrp: anyShelf?.mrp ?? inCatalog?.mrp ?? lp?.mrp ?? null, perHundred: ml && price ? (price / ml) * 100 : null, pack,
      priceNote: !anyShelf && !inCatalog && lp ? `last seen ${new Date(lp.scrape_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}` : null,
      rank: onCat?.rank ?? null, paid: !!(onCat?.is_ad || onCat?.is_pinned),
      rating: anyShelf?.rating ?? inCatalog?.rating ?? null, ratings: anyShelf?.rating_count ?? inCatalog?.rating_count ?? null,
      recent: d?.recent ?? null, momentum: d?.momentum ?? null, search: searchTop10.get(pid) ?? 0,
      usp: u, thumb: thumbBy.get(pid), angle, aspects: aspects.data?.get(pid),
      phrases: (anyShelf?.review_key_phrases ?? inCatalog?.review_key_phrases ?? []) as { text: string; sentiment: string }[],
    };
  }), [productIds, rows, cat0, uspBy, lastPrices.data, demandBy, thumbBy, searchTop10, aspects.data, cat, hero]);

  // ---- brand facts: one scorecard per brand, basket price on the same rules for everyone
  const brandFacts: BrandFacts[] = useMemo(() => {
    const prices = withAnchor(brands.map((b) => basketPrice(b, cat0, rows)), anchor);
    return brands.map((b, i) => ({ ...brandScore(b, rows, months.data ?? [], search.data ?? [], assort.data ?? []), basket: prices[i], catPrice: prices[i].byCategory[cat] ?? categoryPrice(b, cat, cat0, rows) }));
  }, [brands, cat0, rows, months.data, search.data, assort.data, anchor, cat]);

  const asOf = rows[0]?.scrape_date;
  const err = shelf.error || catalog.error || uspC.error || uspP.error;
  const loading = !shelf.data || !catalog.data || !uspC.data || !uspP.data;
  const sells = (c: string) => brands.filter((b) => productOptions(b, c, rows, cat0).length).length;

  return (
    <Shell active="Competitive Analysis" asOf={asOf ? new Date(asOf).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : undefined}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.02em]">Competitive Analysis</h1>
          <p className="mt-1 text-[14px] text-ink-2">Innisfree against its rivals, brand by brand and product by product, on one set of measures.</p>
        </div>
        <Segmented<View> value={view} onChange={setView} options={[{ value: "brands", label: "Brands" }, { value: "products", label: "Products" }]} />
      </div>

      {err && <div className="mt-6 rounded-xl bg-[#fbecea] px-4 py-3 text-[13px] text-bad">Could not load data: {String(err.message ?? err)}</div>}
      {loading && !err ? <Loading what="the comparison" /> : !err && (
        <>
          {/* Level 1: category, then the Innisfree hero product in it */}
          <Card className="mt-6 px-4 py-3.5">
            <div className="flex flex-wrap gap-1.5">
              {ORDER.filter((c) => HERO_ORDER.includes(c) || sells(c) > 0).map((c) => {
                const n = (uspC.data ?? []).filter((g) => shelfCat(g.category) === c).length;
                return (
                  <button key={c} onClick={() => { setCat(c); setHeroPick(null); setBrandOverride(null); }}
                    className={`rounded-full px-3 py-1.5 text-[13px] transition ${cat === c ? "bg-ink font-medium text-white" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink"}`}>
                    {CATEGORY_LABEL[c]}{n > 0 && <span className={`ml-1.5 text-[11px] ${cat === c ? "text-white/70" : "text-muted"}`}>{n}</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3">
              <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Innisfree hero</span>
              {heroes.length ? heroes.map((g) => (
                <button key={g.anchor_product_id} onClick={() => { setHeroPick(g.anchor_product_id); setBrandOverride(null); }}
                  className={`rounded-full px-3 py-1 text-[12.5px] ring-1 transition ${g === hero ? "bg-ink text-white ring-ink" : "bg-surface text-ink-2 ring-line hover:text-ink"}`}>
                  {short(g.anchor_name, "Innisfree", 40)}
                </button>
              )) : <span className="text-[12.5px] text-muted">None analysed in {CATEGORY_LABEL[cat]}: comparing each brand&rsquo;s best-ranked product instead.</span>}
            </div>
          </Card>

          {view === "brands"
            ? <BrandView facts={brandFacts} anchor={anchor} cat={cat} colors={colors} brands={brands} known={known} rows={rows} catalog={cat0} hero={hero} uspBy={uspBy}
                onToggle={toggleBrand} onPickCat={(c) => { setCat(c); setHeroPick(null); setView("products"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
            : <ProductView products={products} hero={hero} uspBy={uspBy} colors={colors} optionsFor={hero ? null : optionsFor}
                onSwap={(b, pid) => setSwap({ ...swap, [`${cat}|${b}`]: pid })} aspectsLoading={aspects.isLoading} />}
        </>
      )}
    </Shell>
  );
}

/* ---------------------------------------------------------------- brand view */

const groupsFor = (first: string): Record<string, string> => ({ [first]: "Price", listings: "Visibility", rating: "Reception", demand: "Demand", search: "Search" });

function BrandView({ facts, anchor, cat, colors, brands, known, rows, catalog, hero, uspBy, onToggle, onPickCat }: {
  facts: BrandFacts[]; anchor: string; cat: string; colors: Record<string, string>; brands: string[]; known: string[]; rows: ShelfRow[]; catalog: CatalogRow[];
  hero: UspComparison | null; uspBy: Map<string, UspProduct>; onToggle: (b: string) => void; onPickCat: (c: string) => void;
}) {
  const inBasket = (PRICE_BASKET as readonly string[]).includes(cat);
  const criteria: Criterion<BrandFacts>[] = [
    { key: "price", label: "Price, core basket", help: `Average of the brand's median price in each basket category (${BASKET_LABEL}). Combos, gift sets, minis excluded.`, better: null,
      value: (f) => f.basket.overall, show: (f) => inr(f.basket.overall),
      sub: (f) => f.brand === anchor ? `${f.basket.categories}/5 categories` : f.basket.vsAnchor ? `${f.basket.vsAnchor.toFixed(2)}× Innisfree · ${f.basket.shared} shared` : `${f.basket.categories}/5 categories` },
    ...([{ key: "catprice", label: `Price, ${CATEGORY_LABEL[cat]}`, help: inBasket ? "Median full-size price in this category" : "Median full-size price in this category (not part of the core basket)", better: null,
      value: (f: BrandFacts) => f.catPrice?.price ?? null, show: (f: BrandFacts) => inr(f.catPrice?.price),
      sub: (f: BrandFacts) => f.catPrice ? `${f.catPrice.perHundred ? `₹${Math.round(f.catPrice.perHundred)}/100ml · ` : ""}${f.catPrice.n} product${f.catPrice.n === 1 ? "" : "s"}` : "not sold" } as Criterion<BrandFacts>]),
    { key: "listings", label: "Top-100 listings", help: "Product slots in the top 100 of all tracked categories today", better: "high", value: (f) => f.slots, show: (f) => String(f.slots), sub: (f) => `${f.top20} in top 20` },
    { key: "rank", label: "Best shelf rank", help: "Highest position of any of its products today", better: "low", value: (f) => f.bestRank, show: (f) => (f.bestRank ? `#${f.bestRank}` : "–") },
    { key: "rating", label: "Rating", help: "Average star rating of its top-100 products", better: "high", value: (f) => f.rating, show: (f) => (f.rating ? `★ ${f.rating.toFixed(2)}` : "–") },
    { key: "ratings", label: "Ratings", help: "Total star ratings on its top-100 products", better: "high", value: (f) => f.ratings, show: (f) => compact(f.ratings) },
    { key: "demand", label: "Reviews, last 3 mo", help: "Dated reviews on its tracked products in the last 3 complete months: a proxy for recent sales", better: "high", value: (f) => f.last3, show: (f) => (f.last3 === null ? "–" : compact(f.last3)), sub: (f) => (f.last3 === null ? "not tracked" : `${f.demandProducts} products`) },
    { key: "momentum", label: "Momentum", help: "Reviews in the last 3 months vs the 3 before", better: "high", value: (f) => f.growth, show: (f) => (f.growth === null ? "–" : signed(f.growth)) },
    { key: "search", label: "K-beauty searches", help: "Tracked searches where it shows in the top 10 unpaid results", better: "high", value: (f) => f.searchTerms, show: (f) => String(f.searchTerms), sub: (f) => (f.bestSearch ? `best #${f.bestSearch}` : null) },
    { key: "paid", label: "Paid placement", help: "Share of its top-100 slots that are ads or featured", better: null, value: (f) => f.paidShare, show: (f) => pct(f.paidShare) },
  ];
  const a = facts.find((f) => f.brand === anchor)!;
  const st = standings(a, facts.filter((f) => f.brand !== anchor), criteria);
  const { strong, weak } = strongestWeakest(st);
  const rivals = facts.filter((f) => f.brand !== anchor);
  const cheaper = rivals.filter((f) => f.basket.vsAnchor !== null && f.basket.vsAnchor < 0.95).length;
  const dearer = rivals.filter((f) => f.basket.vsAnchor !== null && f.basket.vsAnchor > 1.05).length;
  const line = `Against ${rivals.length} rival brand${rivals.length === 1 ? "" : "s"}: ${dearer} price above Innisfree, ${cheaper} below${strong[0] ? `; Innisfree leads on ${strong[0].label.toLowerCase()}` : ""}${weak[0] ? `, trails on ${weak[0].label.toLowerCase()}` : ""}.`;

  const cats = [...SKINCARE, ...CATEGORIES.filter((c) => !SKINCARE.includes(c))].filter((c) => SKINCARE.includes(c) || brands.some((b) => productOptions(b, c, rows, catalog).length));
  const cols: GridCol[] = facts.map((f) => ({ key: f.brand, anchor: f.brand === anchor, head: <BrandHead f={f} color={colors[f.brand]} /> }));
  const focus = FOCUS_BRANDS.map((b) => resolveBrand(b, known) ?? b).filter((b) => known.includes(b));
  const all = [...new Set(rows.map((r) => r.brand))].map((b) => ({ brand: b, slots: rows.filter((r) => r.brand === b).length })).sort((x, y) => y.slots - x.slots);

  return (
    <>
      <Strip line={line} strong={strong} weak={weak} />
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[18px] font-semibold tracking-tight">Brand vs brand</h2>
        <span className="text-[12px] text-muted">{hero ? "Rival brands of the selected hero. " : ""}Price basket: {BASKET_LABEL}.</span>
      </div>
      <details className="mb-3 mt-2">
        <summary className="cursor-pointer text-[12.5px] text-ink-2 hover:text-ink">Change brands ({brands.length}/6)</summary>
        <div className="mt-2 rounded-xl bg-surface/70 p-3 ring-1 ring-line">
          <BrandPicker focus={focus} all={all} selected={brands} colors={colors} onToggle={onToggle} />
        </div>
      </details>
      <CompareGrid cols={cols} items={facts} criteria={criteria} groups={groupsFor("price")}
        extra={[{ label: "Where they compete", help: "Head-to-head: a rival product the USP analysis set against an Innisfree hero. Also sells: other categories both brands sell in.",
          render: (f) => <Compete f={f} anchor={anchor} rows={rows} catalog={catalog} uspBy={uspBy} cats={cats} />, has: (f) => f.brand !== anchor } as ExtraRow<BrandFacts>]} />

      <details className="mt-6">
        <summary className="cursor-pointer text-[13px] font-medium text-ink-2 hover:text-ink">Details: price by category, presence by category</summary>
        <div className="mt-3 space-y-5">
          <BasketTable facts={facts} anchor={anchor} />
          <PresenceMatrix shelf={rows} catalog={catalog} anchor={anchor} brands={brands} colors={colors} onPick={onPickCat} categories={cats} />
        </div>
      </details>
    </>
  );
}

function BrandHead({ f, color }: { f: BrandFacts; color: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} /><span className="truncate text-[13.5px] font-semibold">{f.brand}</span></div>
      <div className="mt-0.5 text-[11px] text-muted">{f.origin === "kbeauty" ? "K-beauty" : f.origin === "local" ? "Indian" : f.origin === "global" ? "Global" : "Unclassified"}{f.basket.source === "shelf" ? " · top 100 only" : ""}</div>
    </div>
  );
}

/** Which category each rival actually fights Innisfree in, and on what. */
function Compete({ f, anchor, rows, catalog, uspBy, cats }: { f: BrandFacts; anchor: string; rows: ShelfRow[]; catalog: CatalogRow[]; uspBy: Map<string, UspProduct>; cats: string[] }) {
  const comps = useUspComparisons().data ?? [];
  const h2h = comps.flatMap((g) => g.products.filter((id) => uspBy.get(id)?.brand === f.brand && id !== g.anchor_product_id).map((id) => ({ g, p: uspBy.get(id)! })));
  const shared = cats.filter((c) => productOptions(anchor, c, rows, catalog).length && productOptions(f.brand, c, rows, catalog).length);
  const h2hCats = new Set(h2h.map((x) => shelfCat(x.g.category)));
  const rest = shared.filter((c) => !h2hCats.has(c));
  if (!h2h.length && !shared.length) return <span className="text-[11.5px] text-muted">No overlap with Innisfree&rsquo;s range{f.basket.source === "shelf" ? " (top 100 only)" : ""}</span>;
  // one line per head-to-head category: the rival's lead benefit there; which Innisfree hero it faces is on hover
  const byCat = new Map<string, { benefit?: string; vs: string[] }>();
  for (const { g, p } of h2h) {
    const c = shelfCat(g.category); const e = byCat.get(c) ?? { vs: [] };
    e.benefit ??= [...p.analysis.key_benefits].sort((x, y) => y.emphasis - x.emphasis)[0]?.benefit;
    e.vs.push(short(g.anchor_name, "Innisfree", 40)); byCat.set(c, e);
  }
  return (
    <div className="space-y-1">
      {[...byCat.entries()].map(([c, e]) => (
        <div key={c} className="text-[11.5px] leading-snug" title={`Head-to-head with ${e.vs.join(", ")}`}>
          <b className="font-semibold">{CATEGORY_LABEL[c]}</b>{e.benefit && <span className="text-ink-2"> · {clip(e.benefit, 26)}</span>}
        </div>
      ))}
      {rest.length > 0 && <div className="text-[11px] text-muted">Also both sell: {rest.map((c) => CATEGORY_LABEL[c]).join(", ")}</div>}
    </div>
  );
}

function BasketTable({ facts, anchor }: { facts: BrandFacts[]; anchor: string }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[12.5px] tabular">
        <thead>
          <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-muted">
            <th className="px-4 py-2.5 font-semibold">Median full-size price</th>
            {PRICE_BASKET.map((c) => <th key={c} className="px-3 py-2.5 font-semibold">{CATEGORY_LABEL[c]}</th>)}
            <th className="px-3 py-2.5 font-semibold">Basket</th>
          </tr>
        </thead>
        <tbody>
          {facts.map((f) => (
            <tr key={f.brand} className={`border-b border-line last:border-0 ${f.brand === anchor ? "bg-page/70" : ""}`}>
              <td className="px-4 py-2 font-medium">{f.brand}{f.basket.source === "shelf" && <span className="ml-1.5 text-[10.5px] font-normal text-muted">top 100 only</span>}</td>
              {PRICE_BASKET.map((c) => { const v = f.basket.byCategory[c]; return (
                <td key={c} className="px-3 py-2">{v ? <><b>{inr(v.price)}</b><span className="block text-[10.5px] text-muted">{v.perHundred ? `₹${Math.round(v.perHundred)}/100ml · ` : ""}n={v.n}</span></> : <span className="text-muted">–</span>}</td>
              ); })}
              <td className="px-3 py-2"><b>{inr(f.basket.overall)}</b>{f.basket.vsAnchor && f.brand !== anchor ? <span className="block text-[10.5px] text-muted">{f.basket.vsAnchor.toFixed(2)}× Innisfree</span> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-line px-4 py-2.5 text-[11.5px] text-muted">Based on: {BASKET_LABEL}. Excludes combos, gift sets, kits, minis and samples (under 15 ml/g), and out-of-stock products. Full Nykaa range for the 22 tracked K-beauty brands; other brands from today&rsquo;s top-100 shelves only. &ldquo;× Innisfree&rdquo; compares only the categories both sell.</p>
    </Card>
  );
}

/* ---------------------------------------------------------------- product view */

function ProductView({ products, hero, uspBy, colors, optionsFor, onSwap, aspectsLoading }: {
  products: ProductFacts[]; hero: UspComparison | null; uspBy: Map<string, UspProduct>; colors: Record<string, string>;
  optionsFor: ((b: string) => CatalogLike[]) | null; onSwap: (brand: string, pid: string) => void; aspectsLoading: boolean;
}) {
  const open = useOpenProduct();
  const [details, setDetails] = useState(false);
  const criteria: Criterion<ProductFacts>[] = [
    { key: "price", label: "Price", help: "Selling price today; ₹ per 100 ml/g where the pack size is known", better: null, value: (p) => p.price, show: (p) => inr(p.price),
      sub: (p) => [p.perHundred ? `₹${Math.round(p.perHundred)}/100ml` : null, p.mrp && p.price && p.mrp > p.price ? `MRP ${inr(p.mrp)}` : null, p.priceNote].filter(Boolean).join(" · ") || null },
    { key: "rank", label: "Shelf rank", help: "Position in this category's top 100 today", better: "low", value: (p) => (p.rank ?? 101), show: (p) => (p.rank ? `#${p.rank}` : "Not top 100"), sub: (p) => (p.paid ? "paid slot" : null) },
    { key: "rating", label: "Rating", help: "Nykaa star rating", better: "high", value: (p) => p.rating, show: (p) => (p.rating ? `★ ${p.rating.toFixed(1)}` : "–") },
    { key: "ratings", label: "Ratings", help: "Number of star ratings", better: "high", value: (p) => p.ratings, show: (p) => compact(p.ratings) },
    { key: "demand", label: "Reviews, last 3 mo", help: "Dated reviews in the last 3 complete months: a proxy for recent sales", better: "high", value: (p) => p.recent, show: (p) => (p.recent === null ? "–" : compact(p.recent)), sub: (p) => (p.recent === null ? "not tracked" : null) },
    { key: "momentum", label: "Momentum", help: "Reviews in the last 3 months vs the 3 before", better: "high", value: (p) => p.momentum, show: (p) => (p.momentum === null ? "–" : signed(p.momentum)) },
    { key: "search", label: "K-beauty searches", help: "Tracked searches where this product is in the top 10 unpaid results today", better: "high", value: (p) => p.search, show: (p) => String(p.search) },
  ];
  const anchor = products.find((p) => p.role === "anchor");
  const { strong, weak } = anchor ? strongestWeakest(standings(anchor, products.filter((p) => p !== anchor), criteria)) : { strong: [], weak: [] };
  const line = hero ? oneLine(hero.comparison.anchor_position.verdict)
    : anchor ? "Each brand's best-ranked product in this category, compared on the same measures."
    : "Innisfree sells nothing in this category on Nykaa: the rivals below are compared with each other, without shading.";
  const cols: GridCol[] = products.map((p) => ({ key: p.pid, anchor: p === anchor, head: <ProductHead p={p} color={colors[p.brand]} onOpen={() => open({ product_id: p.pid, name: p.name, brand: p.brand, url: p.url, image: p.image, price: p.price, mrp: p.mrp, rating: p.rating, rating_count: p.ratings })}
    options={optionsFor?.(p.brand)} onSwap={(pid) => onSwap(p.brand, pid)} /> }));

  const praise = (p: ProductFacts, t: "pos" | "neg") => {
    const own = p.phrases.filter((x) => x.sentiment === (t === "pos" ? "Positive" : "Negative")).map((x) => ({ label: x.text, n: null as number | null }));
    if (own.length) return own.slice(0, 3);
    return (p.aspects ?? []).filter((x) => (t === "pos" ? x.positive : x.negative) >= 2).sort((x, y) => (t === "pos" ? y.positive - x.positive : y.negative - x.negative))
      .slice(0, t === "pos" ? 3 : 2).map((x) => ({ label: x.label, n: t === "pos" ? x.positive : x.negative }));
  };
  const extra: ExtraRow<ProductFacts>[] = [
    { label: "Main promise", help: "Top benefits the listing leads on, read from its gallery and page", has: (p) => !!p.usp,
      render: (p) => <div className="flex flex-wrap gap-1">{[...p.usp!.analysis.key_benefits].sort((x, y) => y.emphasis - x.emphasis).slice(0, 3).map((b) => <Chip key={b.benefit} tone="plain" title={b.benefit}>{clip(b.benefit, 26)}</Chip>)}</div> },
    { label: "Proof · buyers", help: "How well the promise is proven on the listing, and whether reviewers say it back", has: (p) => !!p.usp,
      render: (p) => { const a = p.usp!.analysis; const v = VERDICT[a.review_check.usp_verdict]; return (
        <div className="flex flex-wrap gap-1"><Chip tone={a.proof_strength.rating === "strong" ? "good" : a.proof_strength.rating === "weak" ? "bad" : undefined}>proof {a.proof_strength.rating}</Chip>
          <Chip tone={a.review_check.usp_verdict === "echoed" ? "good" : a.review_check.usp_verdict === "contradicted" ? "bad" : undefined}>{v.label.replace("Buyers ", "").replace("Too few reviews to judge", "few reviews")}</Chip></div>); } },
    { label: "Hero ingredients", has: (p) => !!p.usp?.analysis.hero_ingredients.length,
      render: (p) => <div className="flex flex-wrap gap-1">{p.usp!.analysis.hero_ingredients.slice(0, 3).map((h) => <Chip key={h.ingredient} title={h.claimed_role}>{clip(h.ingredient, 20)}</Chip>)}</div> },
    { label: "Shoppers praise", help: "Nykaa's review summary, else the tags reviewers attach (count of mentions)", has: (p) => praise(p, "pos").length > 0,
      render: (p) => <div className="flex flex-wrap gap-1">{praise(p, "pos").map((x) => <Chip key={x.label} tone="good">{clip(x.label, 22)}{x.n ? ` (${x.n})` : ""}</Chip>)}</div> },
    { label: "Shoppers criticise", has: (p) => praise(p, "neg").length > 0,
      render: (p) => <div className="flex flex-wrap gap-1">{praise(p, "neg").map((x) => <Chip key={x.label} tone="bad">{clip(x.label, 22)}{x.n ? ` (${x.n})` : ""}</Chip>)}</div> },
    { label: "Thumbnail", help: "What the main product image shows", has: (p) => !!p.thumb?.shot_type,
      render: (p) => { const t = p.thumb!; return <div className="flex flex-wrap gap-1">
        <Chip>{t.shot_type!.replaceAll("_", " ")}</Chip>{t.model_present && <Chip>person</Chip>}
        <Chip>{t.text_density === "heavy" ? "text-heavy" : t.text_density === "light" ? "light text" : "no text"}</Chip>
        {!!t.on_image_claims?.length && <Chip tone="plain" title={t.on_image_claims.join(" · ")}>{t.on_image_claims.length} claim{t.on_image_claims.length === 1 ? "" : "s"}</Chip>}</div>; } },
    ...(details ? [
      { label: "Promise, in full", has: (p: ProductFacts) => !!p.usp, render: (p: ProductFacts) => <p className="text-[12px] leading-snug">{p.usp!.analysis.main_usp.statement}</p> },
      { label: "Distinct angle", has: (p: ProductFacts) => !!p.angle, render: (p: ProductFacts) => <p className="text-[12px] leading-snug text-ink-2">{p.angle}</p> },
      { label: "Who it's for", has: (p: ProductFacts) => !!p.usp, render: (p: ProductFacts) => <p className="text-[12px] leading-snug text-ink-2">{p.usp!.analysis.target_consumer.summary}</p> },
      { label: "Complaints", has: (p: ProductFacts) => !!p.usp?.analysis.review_check.recurring_complaints.length,
        render: (p: ProductFacts) => <ul className="space-y-0.5 text-[12px] leading-snug text-bad">{p.usp!.analysis.review_check.recurring_complaints.slice(0, 3).map((c) => <li key={c.theme}>{c.theme} <span className="text-muted">· {c.how_often}</span></li>)}</ul> },
      { label: "Image, read", has: (p: ProductFacts) => !!p.thumb?.summary, render: (p: ProductFacts) => <p className="text-[12px] leading-snug text-ink-2">{p.thumb!.summary}</p> },
    ] as ExtraRow<ProductFacts>[] : []),
  ];

  return (
    <>
      <Strip line={line} strong={strong} weak={weak} />
      <div className="mb-3 mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-[18px] font-semibold tracking-tight">{hero ? `${short(hero.anchor_name, "Innisfree", 40)} vs ${products.length - 1} rivals` : "Product vs product"}</h2>
        <button onClick={() => setDetails(!details)} className="rounded-lg px-2.5 py-1 text-[12.5px] text-ink-2 ring-1 ring-line hover:bg-surface">{details ? "Hide details" : "Show details"}</button>
      </div>
      {aspectsLoading && <p className="mb-2 text-[12px] text-muted">Loading review tags…</p>}
      <CompareGrid cols={cols} items={products} criteria={criteria} extra={extra} groups={{ price: "Price", rank: "Visibility", rating: "Reception", demand: "Demand", search: "Search", }} />
      {hero && (
        <details className="mt-6">
          <summary className="cursor-pointer text-[13px] font-medium text-ink-2 hover:text-ink">Full USP analysis: verdict, strengths and weaknesses by rival, white space, buyer check</summary>
          <div className="mt-3"><UspDetail g={hero} anchor={uspBy.get(hero.anchor_product_id)} /></div>
        </details>
      )}
    </>
  );
}

type CatalogLike = { product_id: string; name: string; brand: string; price: number | null; rank: number | null };

function ProductHead({ p, color, onOpen, options, onSwap }: { p: ProductFacts; color?: string; onOpen: () => void; options?: CatalogLike[]; onSwap: (pid: string) => void }) {
  const ROLE: Record<string, string> = { anchor: "Innisfree", korean_rival_1: "K-beauty", korean_rival_2: "K-beauty", korean_rival_3: "K-beauty", indian_leader: "Indian leader", global_rival: "Global", rival: "" };
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
        {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}{ROLE[p.role] ?? ""}
      </div>
      <button onClick={onOpen} className="mt-1.5 flex items-start gap-2 text-left">
        <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-page ring-1 ring-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- Nykaa CDN image */}
          {p.image ? <img src={p.image} alt="" className="h-10 w-10 object-contain" /> : null}
        </span>
        <span className="min-w-0">
          <span className="block text-[11.5px] font-semibold text-ink-2">{p.brand}</span>
          <span className="block text-[12px] leading-snug hover:underline" title={p.name}>{short(p.name, p.brand, 38)}</span>
        </span>
      </button>
      {options && options.length > 1 && (
        <select value={p.pid} onChange={(e) => onSwap(e.target.value)} className="mt-1.5 w-full rounded-md bg-surface px-1.5 py-1 text-[11px] text-ink-2 ring-1 ring-line">
          {options.map((o) => <option key={o.product_id} value={o.product_id}>{o.rank ? `#${o.rank} ` : ""}{short(o.name, o.brand, 30)} · {inr(o.price)}</option>)}
        </select>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- shared */

function Strip({ line, strong, weak }: { line: string; strong: Standing[]; weak: Standing[] }) {
  const f = (s: Standing, t: "a" | "b") => `${s.label} · ${t === "a" ? "ahead of" : "behind"} ${t === "a" ? s.ahead : s.behind}/${s.of}`;
  return (
    <Card className="mt-5 px-5 py-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Verdict for Innisfree</div>
      <p className="mt-1 max-w-[100ch] font-display text-[16.5px] font-medium leading-snug tracking-tight">{line}</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-good">Strongest</span>
          {strong.length ? strong.map((s) => <Chip key={s.key} tone="good">{f(s, "a")}</Chip>) : <span className="text-[12px] text-muted">No clear lead</span>}</div>
        <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-bad">Weakest</span>
          {weak.length ? weak.map((s) => <Chip key={s.key} tone="bad">{f(s, "b")}</Chip>) : <span className="text-[12px] text-muted">No clear gap</span>}</div>
      </div>
    </Card>
  );
}

/** Every product a brand sells in a category: today's top 100 first (by rank), then its wider catalogue by ratings. */
function productOptions(brand: string, cat: string, rows: ShelfRow[], catalog: CatalogRow[]): CatalogLike[] {
  const on = rows.filter((r) => r.subcategory === cat && r.brand === brand).sort((a, b) => a.rank - b.rank).map((r) => ({ product_id: r.product_id, name: r.name, brand, price: r.price, rank: r.rank }));
  const seen = new Set(on.map((r) => r.product_id));
  const more = catalog.filter((r) => r.brand === brand && r.subcategories.includes(cat) && !seen.has(r.product_id)).sort((a, b) => (b.rating_count ?? 0) - (a.rating_count ?? 0))
    .map((r) => ({ product_id: r.product_id, name: r.name, brand, price: r.price, rank: null }));
  return [...on, ...more];
}

/** Product id -> number of tracked searches where it is in the top 10 unpaid results (one sample per query). */
function searchCounts(rows: SearchRow[]) {
  const byQ = new Map<string, SearchRow[]>(); rows.forEach((r) => byQ.set(r.query, [...(byQ.get(r.query) ?? []), r]));
  const out = new Map<string, number>();
  for (const rs of byQ.values()) {
    const minS = Math.min(...rs.map((r) => r.sample));
    const top = rs.filter((r) => !r.is_ad && r.sample === minS).sort((a, b) => a.rank - b.rank).slice(0, 10);
    new Set(top.map((r) => r.product_id)).forEach((id) => out.set(id, (out.get(id) ?? 0) + 1));
  }
  return out;
}

export default function Page() {
  return <AuthGate><CompetitivePage /></AuthGate>;
}

