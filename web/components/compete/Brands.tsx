"use client";

import BrandPicker from "@/components/BrandPicker";
import CompareGrid, { type ExtraRow, type GridCol } from "@/components/CompareGrid";
import PresenceMatrix from "@/components/PresenceMatrix";
import { ActionSection, Finding } from "@/components/Report";
import Sparkline from "@/components/Sparkline";
import { Card } from "@/components/ui";
import { Missing, Points, useDetail } from "@/components/Detail";
import { FOCUS_BRANDS, ORIGIN_LABEL, norm, resolveBrand } from "@/lib/brands";
import { standings, strongestWeakest, type Criterion } from "@/lib/compete";
import { productOptions, shelfCat, shortTitle, type BrandFacts } from "@/lib/competeData";
import { CATEGORIES, CATEGORY_LABEL, compact, inr, pct, signed } from "@/lib/format";
import { BASKET_LABEL, PRICE_BASKET } from "@/lib/price";
import type { CatalogRow, ShelfRow } from "@/lib/types";
import type { UspComparison, UspProduct } from "@/lib/usp";

const SKINCARE = ["toner", "serum", "face_moisturizer", "face_wash", "sunscreen", "cleansing_balm", "masks", "sheet_mask", "eye_care", "lip_care"];

function criteriaFor(cat: string, anchor: string): Criterion<BrandFacts>[] {
  const inBasket = (PRICE_BASKET as readonly string[]).includes(cat);
  const crawl = (f: BrandFacts) => (f.basket.source === "shelf" ? "Full range crawl pending (from 12 Oct)" : "Sells none of these on Nykaa");
  return [
    { key: "price", label: "MRP, core basket", help: `Average of the brand's median full-size MRP per basket category (${BASKET_LABEL})`, better: null, value: (f) => f.basket.overall, show: (f) => inr(f.basket.overall),
      sub: (f) => (f.brand === anchor ? `${f.basket.categories} of 5 categories` : f.basket.vsAnchor ? `${f.basket.vsAnchor.toFixed(2)}× Innisfree, on ${f.basket.shared} shared` : `${f.basket.categories} of 5 categories`),
      missing: (f) => (f.basket.overall === null ? crawl(f) : null) },
    { key: "catprice", label: `MRP, ${CATEGORY_LABEL[cat]}`, help: inBasket ? "Median full-size MRP in this category" : "Median full-size MRP in this category (outside the core basket)", better: null,
      value: (f) => f.catPrice?.price ?? null, show: (f) => inr(f.catPrice?.price),
      sub: (f) => (f.catPrice ? `${f.catPrice.perHundred ? `₹${Math.round(f.catPrice.perHundred).toLocaleString("en-IN")}/100 ml · ` : ""}${f.catPrice.n} product${f.catPrice.n === 1 ? "" : "s"}` : null),
      missing: (f) => (f.catPrice ? null : f.basket.source === "shelf" ? "Not in today's top 100; full range from 12 Oct" : "Does not sell this category on Nykaa") },
    { key: "discount", label: "Average discount", help: "Average % off MRP across its top-100 listings", better: null, value: (f) => f.avgDiscount, show: (f) => `${Math.round(f.avgDiscount!)}%`, bar: true,
      missing: (f) => (f.avgDiscount === null ? "No listing in today's top 100" : null) },
    { key: "offer", label: "Listings with an offer", help: "Share of its top-100 listings carrying a gift, bundle or coupon", better: null, value: (f) => f.offerShare, show: (f) => pct(f.offerShare), bar: true,
      missing: (f) => (f.offerShare === null ? "No listing in today's top 100" : null) },
    { key: "listings", label: "Top-100 listings", help: "Product slots in the top 100 of all tracked categories today", better: "high", value: (f) => f.slots, show: (f) => String(f.slots), sub: (f) => `${f.categories.length} categories`, bar: true,
      up: "More top-100 listings than", down: "Fewer top-100 listings than" },
    { key: "top20", label: "In the top 20", help: "Slots in the first 20 positions, where most clicks happen", better: "high", value: (f) => f.top20, show: (f) => String(f.top20), bar: true },
    { key: "rank", label: "Best shelf position", help: "Highest position of any of its products today", better: "low", value: (f) => f.bestRank, show: (f) => `#${f.bestRank}`,
      sub: (f) => (f.medianRank ? `typical #${Math.round(f.medianRank)}` : null), missing: (f) => (f.bestRank ? null : "Not in any top 100 today") },
    { key: "paid", label: "Paid placements", help: "Share of its top-100 slots that are ads or featured", better: null, value: (f) => f.paidShare, show: (f) => pct(f.paidShare), bar: true,
      missing: (f) => (f.paidShare === null ? "No listing in today's top 100" : null) },
    { key: "rating", label: "Star rating", help: "Average star rating of its top-100 products", better: "high", value: (f) => f.rating, show: (f) => `★ ${f.rating!.toFixed(2)}`,
      missing: (f) => (f.rating ? null : "No rated product in today's top 100") },
    { key: "ratings", label: "Ratings, all time", help: "Total star ratings on its top-100 products", better: "high", value: (f) => f.ratings, show: (f) => compact(f.ratings), bar: true },
    { key: "demand", label: "Reviews, last 3 months", help: "Dated reviews on its tracked products in the last 3 complete months: a stand-in for recent sales", better: "high", value: (f) => f.last3, show: (f) => compact(f.last3),
      sub: (f) => `${f.demandProducts} products`, bar: true, missing: (f) => (f.last3 === null ? "Not in review tracking" : null) },
    { key: "momentum", label: "Review growth", help: "Reviews in the last 3 months against the 3 months before", better: "high", value: (f) => f.growth, show: (f) => signed(f.growth),
      missing: (f) => (f.growth === null ? (f.last3 === null ? "Not in review tracking" : "Too new to compare") : null) },
    { key: "search", label: "K-beauty searches", help: "Tracked Korean-beauty searches where it shows in the first 10 unpaid results", better: "high", value: (f) => f.searchTerms,
      show: (f) => (f.searchTerms ? String(f.searchTerms) : "In none"), sub: (f) => (f.bestSearch ? `best #${f.bestSearch}` : null), bar: true },
    { key: "range", label: "Products on Nykaa", help: "All products the brand lists on Nykaa", better: null, value: (f) => f.range, show: (f) => String(f.range),
      sub: (f) => (f.conversion !== null ? `${pct(f.conversion)} reach a top 100` : null), missing: (f) => (f.range === null ? "Range not counted for this brand" : null) },
  ];
}
const GROUPS = { price: "Price and promotion", listings: "Shelf visibility", rating: "Buyer response", demand: "Demand (sales signal)", search: "Search", range: "Range" };

/* ---------------------------------------------------------------- §7 brands */

export function Brands({ facts, anchor, cat, colors, brands, known, rows, isHeroSet, onToggle, onReset }: {
  facts: BrandFacts[]; anchor: string; cat: string; colors: Record<string, string>; brands: string[]; known: string[]; rows: ShelfRow[];
  isHeroSet: boolean; onToggle: (b: string) => void; onReset: () => void;
}) {
  const criteria = criteriaFor(cat, anchor);
  const a = facts.find((f) => f.brand === anchor);
  const rivals = facts.filter((f) => f.brand !== anchor);
  const priced = rivals.filter((f) => f.basket.vsAnchor !== null);
  const cheaper = priced.filter((f) => f.basket.vsAnchor! < 0.95).length;
  const { strong, weak } = a ? strongestWeakest(standings(a, rivals, criteria), 2) : { strong: [], weak: [] };
  const list = (xs: { label: string }[]) => xs.map((x) => x.label.toLowerCase()).join(" and ");
  const title = a ? `${strong.length ? `Innisfree beats most of these brands on ${list(strong)}` : "Innisfree leads these brands on no measure"}${weak.length ? ` and trails on ${list(weak)}` : ""}; its core basket costs more than ${cheaper} of ${priced.length} of them.` : "Brand vs brand.";

  const on = facts.filter((f) => f.slots > 0);
  const widest = [...on].sort((x, y) => y.slots - x.slots);
  const byPrice = [...facts].filter((f) => f.basket.overall !== null).sort((x, y) => x.basket.overall! - y.basket.overall!);
  const mom = facts.filter((f) => f.growth !== null && (f.last3 ?? 0) >= 30).sort((x, y) => y.growth! - x.growth!);
  const srch = [...facts].sort((x, y) => y.searchTerms - x.searchTerms);
  const focus = FOCUS_BRANDS.map((b) => resolveBrand(b, known) ?? b).filter((b) => known.includes(b));
  const all = [...new Set(rows.map((r) => r.brand))].map((b) => ({ brand: b, slots: rows.filter((r) => r.brand === b).length })).sort((x, y) => y.slots - x.slots);

  const cols: GridCol[] = facts.map((f) => ({ key: f.brand, anchor: f.brand === anchor, head: (
    <div>
      <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colors[f.brand] }} /><span className="text-[14px] font-semibold">{f.brand}</span></div>
      <div className="mt-0.5 text-[11px] leading-snug text-muted">{ORIGIN_LABEL[f.origin]}{f.madeIn ? ` · made in ${f.madeIn}` : ""}{f.kMarketing ? " · sells as Korean" : ""}{f.basket.source === "shelf" ? " · prices from today's top 100 until its full range is crawled" : ""}</div>
    </div>
  ) }));
  const extra: ExtraRow<BrandFacts>[] = [
    { after: "momentum", label: "12-month trend", help: "Monthly reviews over the last 12 complete months", has: (f) => f.spark.some((v) => v !== null), missing: () => "Not in review tracking", render: (f) => <Sparkline values={f.spark} color={colors[f.brand]} width={140} height={30} /> },
  ];

  return (
    <ActionSection id="brands" kicker="Brand scorecard · Innisfree vs the brands behind these products" title={title}
      note={isHeroSet ? "Brands of the selected hero's rivals. Change the set below; the products above stay the analysed group." : "Change the brand set below."}>
      <Card className="mb-4 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
          <span>Brands compared · up to 6, Innisfree always included</span>
          {!isHeroSet && <button onClick={onReset} className="normal-case tracking-normal text-ink-2 underline decoration-line-2 underline-offset-2 hover:text-ink">Reset to the hero&rsquo;s rivals</button>}
        </div>
        <BrandPicker focus={focus} all={all} selected={brands} colors={colors} onToggle={onToggle} max={6} />
      </Card>
      {on.length >= 2 && (
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <Finding label="Shelf presence"><b>{widest[0].brand}</b> has the widest presence: {widest[0].slots} top-100 listings across {widest[0].categories.length} categories, against {widest[widest.length - 1].slots} for {widest[widest.length - 1].brand}.</Finding>
          {byPrice.length >= 2 && <Finding label="Price (core basket)"><b>{byPrice[0].brand}</b> is the most affordable at {inr(byPrice[0].basket.overall)}; <b>{byPrice[byPrice.length - 1].brand}</b> the most premium at {inr(byPrice[byPrice.length - 1].basket.overall)}.</Finding>}
          {mom.length >= 2 && <Finding label="Demand momentum" tone={norm(mom[0].brand) === norm(anchor) ? "good" : undefined}>Momentum favours <b>{mom[0].brand}</b> ({signed(mom[0].growth)} reviews, last 3 months vs the 3 before); <b>{mom[mom.length - 1].brand}</b> is weakest ({signed(mom[mom.length - 1].growth)}).</Finding>}
          {srch[0]?.searchTerms > 0 && <Finding label="Search"><b>{srch[0].brand}</b> shows up in the most K-beauty searches: top 10 unpaid for {srch[0].searchTerms} tracked terms{a ? `, against ${a.searchTerms} for Innisfree` : ""}.</Finding>}
        </div>
      )}
      <CompareGrid cols={cols} items={facts} criteria={criteria} extra={extra} groups={GROUPS} colors={facts.map((f) => colors[f.brand])} labelWidth={160} />
      <p className="mt-2 text-[11.5px] text-muted">Shelf, rating and paid figures are from today&rsquo;s top-100 listings; prices from each brand&rsquo;s full Nykaa range where tracked. Hover a row name for its definition.</p>
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
  const title = `Innisfree meets these brands head-to-head in ${h2hCats.size} categor${h2hCats.size === 1 ? "y" : "ies"}${gaps.length ? `; it sells nothing in ${gaps.map((c) => CATEGORY_LABEL[c].toLowerCase()).join(", ")}, where rivals rank` : ""}.`;
  return (
    <ActionSection id="compete" kicker="Where they compete" title={title}
      note="Head-to-head: a rival product the USP analysis set against an Innisfree hero, with that rival's lead benefit. Grid: top-100 listings today, or how much a brand sells there without ranking (full range for tracked brands). Click a category row to open it.">
      <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {lines.map(({ f, h2h, rest }) => (
          <Card key={f.brand} className="px-4 py-3.5">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: colors[f.brand] }} />{f.brand}</div>
            {h2h.length ? (
              <ul className="mt-1.5 space-y-1.5">{h2h.map(({ g, p }) => {
                const benefit = [...p.analysis.key_benefits].sort((x, y) => y.emphasis - x.emphasis)[0]?.benefit;
                return <li key={g.anchor_product_id + p.product_id} className="text-[12px] leading-snug"><b className="font-semibold">{CATEGORY_LABEL[shelfCat(g.category)]}</b>: {shortTitle(p.name, p.brand)} vs {shortTitle(g.anchor_name, "Innisfree")}{benefit && <span className="block text-ink-2">Leads on: {benefit}</span>}</li>;
              })}</ul>
            ) : <p className="mt-1.5 text-[12px] text-muted">No head-to-head pairing in the USP analysis.</p>}
            {rest.length > 0 && <p className="mt-2 text-[11.5px] text-muted">Also both sell: {rest.map((c) => CATEGORY_LABEL[c]).join(", ")}</p>}
            {!h2h.length && !rest.length && <p className="mt-1 text-[11.5px] text-muted">No overlap with Innisfree&rsquo;s range{f.basket.source === "shelf" ? " (top 100 only)" : ""}.</p>}
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
  const title = a?.basket.overall ? `Innisfree's core basket averages ${inr(a.basket.overall)} MRP${rivals.length ? `; ${rivals[0].brand} is the cheapest rival at ${rivals[0].basket.vsAnchor!.toFixed(2)}× and ${rivals[rivals.length - 1].brand} the dearest at ${rivals[rivals.length - 1].basket.vsAnchor!.toFixed(2)}×` : ""}.` : "Like-for-like MRP by category.";
  const cellDetail = (f: BrandFacts, c: string) => {
    const v = f.basket.byCategory[c]; const av = a?.basket.byCategory[c];
    return { kicker: `${f.brand} · ${CATEGORY_LABEL[c]}`, title: `Median MRP ${inr(v.price)}`, body: <Points items={[
      `${v.n} full-size product${v.n === 1 ? "" : "s"} counted${f.basket.source === "shelf" ? " (from today's top 100; full range from 12 Oct)" : " (its full Nykaa range)"}`,
      v.perHundred ? `Median ₹${Math.round(v.perHundred).toLocaleString("en-IN")} per 100 ml/g` : "Pack sizes not listed, so no per-100 ml figure",
      ...(av && f.brand !== anchor ? [`${(v.price / av.price).toFixed(2)}× Innisfree's ${inr(av.price)}`] : []),
      "Combos, gift sets, minis under 15 ml/g and out-of-stock products are left out",
    ]} /> };
  };
  const gap = (f: BrandFacts) => (f.basket.source === "shelf" ? "Crawl pending" : "Not sold");
  return (
    <ActionSection id="price" kicker="Price · like for like, on MRP" title={title} note={`Median full-size MRP in each core category (${BASKET_LABEL}). "×" compares with Innisfree on the categories both sell; click a price for how it was built.`}>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12.5px] tabular">
          <thead>
            <tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-muted">
              <th className="px-4 py-2.5 font-semibold">Brand</th>
              <th className="px-3 py-2.5 font-semibold">Basket</th>
              {PRICE_BASKET.map((c) => <th key={c} className="px-3 py-2.5 font-semibold">{CATEGORY_LABEL[c]}</th>)}
              <th className="px-3 py-2.5 font-semibold">Avg discount</th>
            </tr>
          </thead>
          <tbody>
            {facts.map((f) => (
              <tr key={f.brand} className={`border-b border-line last:border-0 ${f.brand === anchor ? "bg-page/70" : ""}`}>
                <td className="px-4 py-2 font-medium">{f.brand}</td>
                <td className="px-3 py-2">{f.basket.overall ? <><b>{inr(f.basket.overall)}</b>{f.basket.vsAnchor && f.brand !== anchor ? <span className="block text-[10.5px] text-muted">{f.basket.vsAnchor.toFixed(2)}× Innisfree</span> : null}</> : <Missing>{gap(f)}</Missing>}</td>
                {PRICE_BASKET.map((c) => { const v = f.basket.byCategory[c]; const av = a?.basket.byCategory[c]; return (
                  <td key={c} className="px-3 py-2">{v ? <button onClick={() => open(cellDetail(f, c))} className="text-left hover:underline">
                    <b>{inr(v.price)}</b>{av && f.brand !== anchor && <span className={`ml-1 text-[10.5px] ${v.price > av.price * 1.05 ? "text-bad" : v.price < av.price * 0.95 ? "text-good" : "text-muted"}`}>{(v.price / av.price).toFixed(2)}×</span>}
                    {v.perHundred ? <span className="block text-[10.5px] text-muted">₹{Math.round(v.perHundred).toLocaleString("en-IN")}/100 ml</span> : null}</button> : <Missing>{gap(f)}</Missing>}</td>
                ); })}
                <td className="px-3 py-2">{f.avgDiscount === null ? <Missing>No top-100 listing</Missing> : `${Math.round(f.avgDiscount)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <p className="mt-2 text-[11.5px] text-muted">&ldquo;Not sold&rdquo;: the brand has no full-size product in that category on Nykaa. &ldquo;Crawl pending&rdquo;: brands outside the 22 tracked K-beauty brands are priced from today&rsquo;s top 100 until the weekly catalogue run (first run 12 Oct) collects their full range. Green/red ×: cheaper/dearer than Innisfree.</p>
    </ActionSection>
  );
}
