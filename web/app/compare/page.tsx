"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import BrandPicker from "@/components/BrandPicker";
import PresenceMatrix from "@/components/PresenceMatrix";
import ProductCompare, { type CompareRow, type Pick } from "@/components/ProductCompare";
import Scorecard from "@/components/Scorecard";
import Segmented from "@/components/Segmented";
import Shell from "@/components/Shell";
import { SectionHead } from "@/components/ui";
import { ANCHOR_BRAND, FOCUS_BRANDS, resolveBrand } from "@/lib/brands";
import { useAspectsFor, useAssortment, useCatalog, useDemand, useMovement, useReviewMonths, useSearch, useShelf } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/format";
import { brandInsights, brandScore } from "@/lib/metrics";
import { useBrandSelection } from "@/lib/selection";

type Mode = "brands" | "products";
const readUrl = () => (typeof window === "undefined" ? {} : Object.fromEntries(new URLSearchParams(window.location.search).entries())) as Record<string, string>;

function ComparePage() {
  const shelf = useShelf(); const months = useReviewMonths(); const search = useSearch(); const assort = useAssortment(); const catalog = useCatalog();
  const rows = useMemo(() => shelf.data ?? [], [shelf.data]);
  const known = useMemo(() => [...new Set([...rows.map((r) => r.brand), ...(catalog.data ?? []).map((r) => r.brand)])], [rows, catalog.data]);
  const focus = useMemo(() => FOCUS_BRANDS.map((b) => resolveBrand(b, known) ?? b), [known]);
  const allBrands = useMemo(() => {
    const c = new Map<string, number>(); rows.forEach((r) => c.set(r.brand, (c.get(r.brand) ?? 0) + 1));
    return [...c.entries()].map(([brand, slots]) => ({ brand, slots })).sort((a, b) => b.slots - a.slots);
  }, [rows]);
  const { selected, colors, toggle } = useBrandSelection(known);

  const [url] = useState(readUrl);
  const [mode, setMode] = useState<Mode>(url.mode === "products" ? "products" : "brands");
  const [catChoice, setCat] = useState<string | null>(url.cat && CATEGORIES.includes(url.cat) ? url.cat : null);
  const [override, setOverride] = useState<Record<string, string>>({});

  // every product each selected brand sells in each category: top-100 shelf first, then its wider catalogue
  const options = useMemo(() => {
    const out = new Map<string, CompareRow[]>();
    for (const b of selected) for (const c of CATEGORIES) {
      const onShelf: CompareRow[] = rows.filter((r) => r.subcategory === c && r.brand === b).sort((x, y) => x.rank - y.rank);
      const seen = new Set(onShelf.map((r) => r.product_id));
      const more: CompareRow[] = (catalog.data ?? []).filter((r) => r.brand === b && r.subcategories.includes(c) && !seen.has(r.product_id))
        .map((r) => ({ ...r, subcategory: c, rank: null, origin: rows.find((x) => x.brand === b)?.origin ?? "unknown", k_marketing: false, is_ad: false, is_pinned: false,
          first_review_date: null, review_count: null, preferences: null, description_text: null, image_url: r.best_image, scrape_date: r.scrape_date,
          is_bestseller: false, is_new_tag: false, tags: null, nykaa_l3: r.l3 }));
      out.set(`${c}|${b}`, [...onShelf, ...more]);
    }
    return out;
  }, [selected, rows, catalog.data]);

  const cat = useMemo(() => catChoice ?? [...CATEGORIES].sort((a, b) =>
    selected.filter((x) => (options.get(`${b}|${x}`) ?? []).some((r) => r.rank !== null)).length -
    selected.filter((x) => (options.get(`${a}|${x}`) ?? []).some((r) => r.rank !== null)).length)[0], [catChoice, selected, options]);

  useEffect(() => {
    if (!selected.length) return;
    const p = new URLSearchParams({ mode, brands: selected.join(","), ...(mode === "products" ? { cat } : {}) });
    window.history.replaceState(null, "", `?${p.toString()}`);
  }, [mode, selected, cat]);

  const scores = useMemo(() => selected.map((b) => brandScore(b, rows, months.data ?? [], search.data ?? [], assort.data ?? [])), [selected, rows, months.data, search.data, assort.data]);
  const insights = useMemo(() => brandInsights(scores), [scores]);
  const picks: Pick[] = useMemo(() => selected.map((b) => {
    const opts = options.get(`${cat}|${b}`) ?? [];
    return { brand: b, options: opts, product: opts.find((o) => o.product_id === override[`${cat}|${b}`]) ?? opts[0] ?? null };
  }), [selected, options, cat, override]);

  const pickedIds = useMemo(() => picks.map((p) => p.product?.product_id).filter((x): x is string => !!x), [picks]);
  const aspects = useAspectsFor(mode === "products" ? pickedIds : []);
  const demand = useDemand(); const movement = useMovement();
  const extras = useMemo(() => ({
    aspects: aspects.data,
    demand: new Map((demand.data ?? []).filter((d) => pickedIds.includes(d.product_id)).map((d) => [d.product_id, d])),
    movement: new Map((movement.data ?? []).filter((m) => m.category === cat && pickedIds.includes(m.product_id)).map((m) => [m.product_id, m])),
  }), [aspects.data, demand.data, movement.data, pickedIds, cat]);

  const asOf = rows[0] ? new Date(rows[0].scrape_date) : null;
  const err = shelf.error || months.error || search.error || assort.error || catalog.error;

  return (
    <Shell active="Compare" asOf={asOf?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <h1 className="font-display text-[34px] font-semibold leading-tight tracking-[-0.02em]">Compare</h1>
          <p className="mt-1.5 max-w-[640px] text-[15px] text-ink-2">Put brands side by side across the Nykaa shelf, or pick a category and compare their products directly.</p>
        </div>
        <Segmented<Mode> value={mode} onChange={setMode} options={[
          { value: "brands", label: "Brands", hint: "Scorecard across the market" },
          { value: "products", label: "Products in a category", hint: "Pick a category, compare products" },
        ]} />
      </div>

      <div className="mt-7 rounded-2xl bg-surface/70 p-4 ring-1 ring-line">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Brands · focus set first, {ANCHOR_BRAND} is the anchor</div>
        <BrandPicker focus={focus} all={allBrands} selected={selected} colors={colors} onToggle={toggle} />
      </div>

      {err && <div className="mt-6 rounded-xl bg-[#fbecea] px-4 py-3 text-[13px] text-bad">Could not load data: {String(err.message ?? err)}</div>}
      {!shelf.data && !err && <div className="mt-10 text-[14px] text-muted">Loading the latest shelf…</div>}
      {shelf.data && selected.length < 2 && <div className="mt-10 text-[14px] text-muted">Select at least two brands to compare.</div>}

      {shelf.data && selected.length >= 2 && mode === "brands" && (
        <>
          {insights.length > 0 && (
            <section className="mt-8 grid gap-3 md:grid-cols-2">
              {insights.map((t) => <div key={t} className="rounded-2xl bg-surface px-5 py-4 text-[14px] leading-relaxed shadow-card ring-1 ring-line">{t}</div>)}
            </section>
          )}
          <section className="mt-8">
            <SectionHead title="Scorecard" note="Hover a metric for its definition. “Lead” marks the strongest value in the row." />
            <Scorecard scores={scores} colors={colors} />
          </section>
          <section className="mt-10">
            <SectionHead title="Where they compete" note="Each cell: top-100 listings today, or how much the brand sells there without ranking, or nothing at all. Click a category to compare its products." />
            <PresenceMatrix shelf={rows} catalog={catalog.data} anchor={resolveBrand(ANCHOR_BRAND, known) ?? ANCHOR_BRAND} brands={selected} colors={colors} onPick={(c) => { setCat(c); setMode("products"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
          </section>
        </>
      )}

      {shelf.data && selected.length >= 2 && mode === "products" && (
        <section className="mt-8">
          <div className="mb-5 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const sells = selected.filter((b) => (options.get(`${c}|${b}`) ?? []).length).length;
              return (
                <button key={c} onClick={() => setCat(c)}
                  className={`rounded-full px-4 py-2 text-[13.5px] transition ${cat === c ? "bg-ink font-medium text-white" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink"}`}>
                  {CATEGORY_LABEL[c]}<span className={`ml-2 text-[11.5px] ${cat === c ? "text-white/70" : "text-muted"}`}>{sells}/{selected.length}</span>
                </button>
              );
            })}
          </div>
          <SectionHead title={`${CATEGORY_LABEL[cat]}: product vs product`} note="Default: each brand's best-ranked product, else its most popular in this category. “Change” lists its full range here. Photos open Nykaa." />
          {!catalog.data && <p className="mb-3 text-[12.5px] text-muted">Loading full brand ranges…</p>}
          {asOf && <ProductCompare picks={picks} colors={colors} asOf={asOf} onChoose={(b, r) => setOverride({ ...override, [`${cat}|${b}`]: r.product_id })} extras={extras} />}
        </section>
      )}
    </Shell>
  );
}

export default function Page() {
  return <AuthGate><ComparePage /></AuthGate>;
}
