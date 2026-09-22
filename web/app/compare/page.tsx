"use client";

import { useEffect, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import BrandPicker from "@/components/BrandPicker";
import PresenceMatrix from "@/components/PresenceMatrix";
import ProductCompare, { type Pick } from "@/components/ProductCompare";
import Scorecard from "@/components/Scorecard";
import Segmented from "@/components/Segmented";
import Shell from "@/components/Shell";
import { ANCHOR_BRAND, FOCUS_BRANDS, MAX_COMPARE, SLOT_COLORS, resolveBrand } from "@/lib/brands";
import { useAssortment, useReviewMonths, useSearch, useShelf } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL } from "@/lib/format";
import { brandInsights, brandScore } from "@/lib/metrics";
import type { ShelfRow } from "@/lib/types";

type Mode = "brands" | "products";

function readUrl() {
  if (typeof window === "undefined") return {} as Record<string, string>;
  return Object.fromEntries(new URLSearchParams(window.location.search).entries());
}

function ComparePage() {
  const shelf = useShelf(); const months = useReviewMonths(); const search = useSearch(); const assort = useAssortment();
  const rows = useMemo(() => shelf.data ?? [], [shelf.data]);
  const known = useMemo(() => [...new Set(rows.map((r) => r.brand))], [rows]);
  const focus = useMemo(() => FOCUS_BRANDS.map((b) => resolveBrand(b, known) ?? b), [known]);
  const allBrands = useMemo(() => {
    const c = new Map<string, number>(); rows.forEach((r) => c.set(r.brand, (c.get(r.brand) ?? 0) + 1));
    return [...c.entries()].map(([brand, slots]) => ({ brand, slots })).sort((a, b) => b.slots - a.slots);
  }, [rows]);

  // Starting state comes from the URL (shareable links), else the anchor plus three focus brands.
  const [url] = useState(readUrl);
  const [mode, setMode] = useState<Mode>(url.mode === "products" ? "products" : "brands");
  const [catChoice, setCat] = useState<string | null>(url.cat && CATEGORIES.includes(url.cat) ? url.cat : null);
  const [override, setOverride] = useState<Record<string, string>>({}); // `${cat}|${brand}` -> product_id
  const [userSel, setUserSel] = useState<{ selected: string[]; slots: Record<string, number> } | null>(null);
  const initial = useMemo(() => {
    const fromUrl = (url.brands ?? "").split(",").filter((b) => b.trim()).map((b) => resolveBrand(b, known)).filter((b): b is string => !!b);
    const init = (fromUrl.length ? fromUrl : ["Innisfree", "Beauty of Joseon", "Laneige", "The Face Shop"].map((b) => resolveBrand(b, known)).filter((b): b is string => !!b)).slice(0, MAX_COMPARE);
    return { selected: init, slots: Object.fromEntries(init.map((b, i) => [b, i])) };
  }, [url, known]);
  const { selected, slots } = userSel ?? initial;

  // default category: where most of the selected brands have products on the shelf
  const cat = useMemo(() => catChoice ?? [...CATEGORIES].sort((a, b) =>
    selected.filter((x) => rows.some((r) => r.subcategory === b && r.brand === x)).length -
    selected.filter((x) => rows.some((r) => r.subcategory === a && r.brand === x)).length)[0], [catChoice, selected, rows]);


  // keep the URL shareable
  useEffect(() => {
    if (!selected.length) return;
    const p = new URLSearchParams({ mode, brands: selected.join(","), ...(mode === "products" ? { cat } : {}) });
    window.history.replaceState(null, "", `?${p.toString()}`);
  }, [mode, selected, cat]);

  const colors = useMemo(() => Object.fromEntries(selected.map((b) => [b, SLOT_COLORS[slots[b] ?? 0]])), [selected, slots]);
  function toggle(b: string) {
    if (selected.includes(b)) { setUserSel({ selected: selected.filter((x) => x !== b), slots }); return; }
    if (selected.length >= MAX_COMPARE) return;
    const used = new Set(selected.map((x) => slots[x])); const free = SLOT_COLORS.findIndex((_, i) => !used.has(i));
    setUserSel({ selected: [...selected, b], slots: { ...slots, [b]: free } });
  }

  const scores = useMemo(() => selected.map((b) => brandScore(b, rows, months.data ?? [], search.data ?? [], assort.data ?? [])), [selected, rows, months.data, search.data, assort.data]);
  const insights = useMemo(() => brandInsights(scores), [scores]);
  const picks: Pick[] = useMemo(() => selected.map((b) => {
    const options = rows.filter((r) => r.subcategory === cat && r.brand === b).sort((x, y) => x.rank - y.rank);
    const chosen = options.find((o) => o.product_id === override[`${cat}|${b}`]) ?? options[0] ?? null;
    return { brand: b, product: chosen, options };
  }), [selected, rows, cat, override]);

  const asOf = rows[0] ? new Date(rows[0].scrape_date) : null;
  const err = shelf.error || months.error || search.error || assort.error;

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
            <SectionHead title="Where they compete" note="Top-100 listings per category, best rank and typical price. Click a category to compare its products." />
            <PresenceMatrix shelf={rows} brands={selected} colors={colors} onPick={(c) => { setCat(c); setMode("products"); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
          </section>
        </>
      )}

      {shelf.data && selected.length >= 2 && mode === "products" && (
        <section className="mt-8">
          <div className="mb-5 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const present = selected.filter((b) => rows.some((r) => r.subcategory === c && r.brand === b)).length;
              return (
                <button key={c} onClick={() => setCat(c)}
                  className={`rounded-full px-4 py-2 text-[13.5px] transition ${cat === c ? "bg-ink font-medium text-white" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink"}`}>
                  {CATEGORY_LABEL[c]}<span className={`ml-2 text-[11.5px] ${cat === c ? "text-white/70" : "text-muted"}`}>{present}/{selected.length}</span>
                </button>
              );
            })}
          </div>
          <SectionHead title={`${CATEGORY_LABEL[cat]}: product vs product`} note="Each brand's best-ranked product by default; use “change” to pick another. Everything shown comes from Nykaa's listing and product pages. Click a product to open it on Nykaa." />
          {asOf && <ProductCompare picks={picks} colors={colors} asOf={asOf} onChoose={(b, r: ShelfRow) => setOverride({ ...override, [`${cat}|${b}`]: r.product_id })} />}
        </section>
      )}
    </Shell>
  );
}

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-display text-[20px] font-semibold tracking-tight">{title}</h2>
      <p className="text-[12.5px] text-muted">{note}</p>
    </div>
  );
}

export default function Page() {
  return <AuthGate><ComparePage /></AuthGate>;
}
