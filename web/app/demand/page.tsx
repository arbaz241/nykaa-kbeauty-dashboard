"use client";

import { Fragment, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import BrandPicker from "@/components/BrandPicker";
import LineChart from "@/components/LineChart";
import { eventsInWindow } from "@/components/EventLog";
import { useOpenProduct } from "@/components/ProductDrawer";
import Segmented from "@/components/Segmented";
import Shell from "@/components/Shell";
import Sparkline from "@/components/Sparkline";
import { Card, Loading, SectionHead } from "@/components/ui";
import { ANCHOR_BRAND, FOCUS_BRANDS, ORIGIN_LABEL, norm, resolveBrand } from "@/lib/brands";
import { useCatalog, useEvents, useReviewMonths, useSearchHistory, useShelf, useSuggestions } from "@/lib/data";
import { compact, inr, shortName } from "@/lib/format";
import { demandLines, momentumWord, monthsWindow } from "@/lib/metrics";
import { useBrandSelection } from "@/lib/selection";
import type { SearchRow } from "@/lib/types";

// Keep in sync with scraper/signals.py SEARCH_QUERIES
const CORE = ["korean skincare", "korean sunscreen", "korean serum", "korean moisturizer", "korean face wash", "korean toner", "korean sheet mask", "korean lip tint", "glass skin", "snail mucin", "cica", "rice toner", "centella", "niacinamide serum", "sunscreen for oily skin"];
const isFocus = (b: string) => FOCUS_BRANDS.some((f) => norm(f) === norm(b));
const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const monthLabel = (m: string) => new Date(m).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
type Tab = "demand" | "search" | "ads";

/** Unpaid order from one sample per (day, query); ads counted across samples. */
function split(rows: SearchRow[]) {
  const minS = Math.min(...rows.map((r) => r.sample));
  const unpaid = rows.filter((r) => !r.is_ad && r.sample === minS).sort((a, b) => a.rank - b.rank);
  const ads = rows.filter((r) => r.is_ad).sort((a, b) => a.sample - b.sample || a.rank - b.rank);
  return { unpaid, ads };
}

function Change({ g, vol }: { g: number | null; vol: number | null }) {
  const w = momentumWord(g, vol);
  if (g === null || vol === null) return <span className="text-[12px] text-muted">{w}</span>;
  const tone = w.startsWith("rising") ? "text-good" : w.startsWith("falling") ? "text-bad" : "text-ink-2";
  return <span className={`tabular ${tone}`}><b>{g > 0 ? "▲" : g < 0 ? "▼" : ""} {Math.abs(Math.round(g * 100))}%</b><span className="ml-2 text-[12px] font-normal text-muted">{w}</span></span>;
}

function Kpi({ label, value, sub, delta }: { label: string; value: React.ReactNode; sub?: React.ReactNode; delta?: number | null }) {
  return (
    <div className="rounded-2xl bg-surface px-4 py-3.5 shadow-card ring-1 ring-line">
      <div className="text-[11.5px] font-medium text-muted">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="truncate font-display text-[22px] font-semibold leading-tight tracking-tight tabular">{value}</span>
        {delta !== undefined && delta !== null && <span className={`text-[12.5px] font-semibold tabular ${delta > 0.02 ? "text-good" : delta < -0.02 ? "text-bad" : "text-ink-2"}`}>{delta > 0 ? "▲" : delta < 0 ? "▼" : ""}{Math.abs(Math.round(delta * 100))}%</span>}
      </div>
      {sub && <div className="mt-1 truncate text-[12px] text-ink-2">{sub}</div>}
    </div>
  );
}

function DemandPage() {
  const months = useReviewMonths(); const shelf = useShelf(); const catalog = useCatalog(); const events = useEvents();
  const hist = useSearchHistory(); const sugg = useSuggestions();
  const open = useOpenProduct();
  const [tab, setTab] = useState<Tab>("demand");

  /* ---- demand (reviews) */
  const data = useMemo(() => months.data ?? [], [months.data]);
  const known = useMemo(() => [...new Set(data.map((m) => m.brand))], [data]);
  const focus = useMemo(() => FOCUS_BRANDS.map((b) => resolveBrand(b, known) ?? b).filter((b) => known.includes(b)), [known]);
  const { selected, colors, toggle } = useBrandSelection(known);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [onlySelected, setOnlySelected] = useState(false);
  const [allRows, setAllRows] = useState(false);
  const brands = useMemo(() => demandLines(data, "brand"), [data]);
  const products = useMemo(() => demandLines(data, "product"), [data]);
  const origin = useMemo(() => { const m = new Map<string, string>(); (shelf.data ?? []).forEach((r) => m.set(r.brand, r.origin)); return m; }, [shelf.data]);
  const win = monthsWindow(12);
  const period = `${monthLabel(win[9])}–${monthLabel(win[11])} vs ${monthLabel(win[6])}–${monthLabel(win[8])}`;
  const sel = brands.filter((b) => selected.includes(b.brand) && b.last3 !== null);
  const valid = brands.filter((b) => b.growth !== null && (b.last3 ?? 0) >= 30);
  const up = [...valid].sort((a, b) => b.growth! - a.growth!)[0]; const dn = [...valid].sort((a, b) => a.growth! - b.growth!)[0];
  const anchorD = brands.find((b) => norm(b.brand) === norm(ANCHOR_BRAND));
  const ranked = brands.filter((b) => b.last3 !== null);
  const anchorRank = anchorD ? ranked.findIndex((b) => b.brand === anchorD.brand) + 1 : 0;
  const topProduct = products.filter((p) => p.last3 !== null)[0];
  const table = onlySelected ? brands.filter((b) => selected.includes(b.brand)) : brands;
  const maxLast3 = Math.max(1, ...table.map((b) => b.last3 ?? 0));
  const imgFor = (pid: string) => (shelf.data ?? []).find((r) => r.product_id === pid)?.image_url ?? (catalog.data ?? []).find((r) => r.product_id === pid)?.best_image ?? null;
  const shelfFor = (pid: string) => (shelf.data ?? []).find((r) => r.product_id === pid);

  /* ---- search & ads */
  const rows = useMemo(() => hist.data ?? [], [hist.data]);
  const days = useMemo(() => [...new Set(rows.map((r) => r.scrape_date))].sort(), [rows]);
  const latest = days[days.length - 1];
  const today = useMemo(() => rows.filter((r) => r.scrape_date === latest), [rows, latest]);
  const keywords = useMemo(() => [...new Set(today.map((r) => r.query))].sort((a, b) => (CORE.includes(a) ? 0 : 1) - (CORE.includes(b) ? 0 : 1) || a.localeCompare(b)), [today]);
  const [kw, setKw] = useState<string | null>(null);
  const active = kw ?? keywords.find((k) => k === "korean sunscreen") ?? keywords[0];
  const byKw = useMemo(() => { const m = new Map<string, SearchRow[]>(); today.forEach((r) => m.set(r.query, [...(m.get(r.query) ?? []), r])); return m; }, [today]);
  const sov = useMemo(() => {
    const t = new Map<string, { brand: string; origin: string; top5: number; top10: number; ads: number; adDays: number }>();
    const get = (b: string, o: string) => t.get(b) ?? t.set(b, { brand: b, origin: o, top5: 0, top10: 0, ads: 0, adDays: 0 }).get(b)!;
    for (const [, rs] of byKw) {
      const { unpaid, ads } = split(rs);
      unpaid.slice(0, 10).forEach((r, i) => { const e = get(r.brand, r.origin); e.top10++; if (i < 5) e.top5++; });
      ads.forEach((r) => get(r.brand, r.origin).ads++);
    }
    const week = new Set(days.slice(-7)); const seen = new Set<string>();
    rows.filter((r) => r.is_ad && week.has(r.scrape_date)).forEach((r) => { const k = `${r.brand}|${r.scrape_date}|${r.query}`; if (!seen.has(k)) { seen.add(k); get(r.brand, r.origin).adDays++; } });
    return [...t.values()].sort((a, b) => b.top5 - a.top5 || b.top10 - a.top10 || b.ads - a.ads);
  }, [byKw, rows, days]);
  const cur = byKw.get(active) ? split(byKw.get(active)!) : { unpaid: [], ads: [] };
  const adGrid = useMemo(() => {
    const ds = days.slice(-10); const bs = new Map<string, Map<string, number>>();
    rows.filter((r) => r.query === active && r.is_ad && ds.includes(r.scrape_date)).forEach((r) => {
      const m = bs.get(r.brand) ?? new Map<string, number>(); m.set(r.scrape_date, (m.get(r.scrape_date) ?? 0) + 1); bs.set(r.brand, m);
    });
    const unpaid1 = ds.map((d) => { const rs = rows.filter((r) => r.query === active && r.scrape_date === d); return rs.length ? split(rs).unpaid[0]?.brand ?? null : null; });
    return { ds, brands: [...bs.entries()].sort((a, b) => [...b[1].values()].reduce((x, y) => x + y, 0) - [...a[1].values()].reduce((x, y) => x + y, 0)), unpaid1 };
  }, [rows, days, active]);
  const focusTop5 = sov.filter((s) => isFocus(s.brand)).reduce((a, s) => a + s.top5, 0);
  const totalTop5 = sov.reduce((a, s) => a + s.top5, 0);
  const focusAds = sov.filter((s) => isFocus(s.brand)).reduce((a, s) => a + s.ads, 0);
  const totalAds = sov.reduce((a, s) => a + s.ads, 0);
  const anchorS = sov.find((s) => norm(s.brand) === norm(ANCHOR_BRAND));

  const img = (pid: string) => (shelf.data ?? []).find((r) => r.product_id === pid)?.image_url ?? (catalog.data ?? []).find((r) => r.product_id === pid)?.best_image ?? null;
  const Tile = ({ r, pos, paid }: { r: SearchRow; pos: number; paid?: boolean }) => (
    <button onClick={() => open({ product_id: r.product_id, name: r.name, brand: r.brand, image: img(r.product_id), price: r.price, url: `https://www.nykaa.com/search/result/?q=${encodeURIComponent(r.name)}` })}
      className="group flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-page">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${paid ? "bg-[#fff4e5] text-[#8a5a00]" : "bg-ink text-white"}`}>{paid ? "AD" : pos}</span>
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-page ring-1 ring-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- Nykaa CDN image */}
        {img(r.product_id) ? <img src={img(r.product_id)!} alt="" className="h-9 w-9 object-contain" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-2">{r.brand}{isFocus(r.brand) && <span className="ml-1.5 rounded bg-sunken px-1 text-[10px] text-muted">focus</span>}</span>
        <span className="block truncate text-[12.5px] group-hover:underline">{shortName(r.name, r.brand)}</span>
      </span>
      <span className="text-[12px] text-ink-2 tabular">{inr(r.price)}</span>
    </button>
  );
  const keywordChips = (
    <div className="mb-4 flex flex-wrap gap-1.5">
      {keywords.map((k) => (
        <button key={k} onClick={() => setKw(k)} className={`rounded-full px-3 py-1 text-[12.5px] transition ${active === k ? "bg-ink font-medium text-white" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink"}`}>
          {k}{!CORE.includes(k) && <span className={`ml-1.5 text-[10.5px] ${active === k ? "text-white/60" : "text-muted"}`}>suggested</span>}
        </button>
      ))}
    </div>
  );

  const sovTop = sov.slice(0, 8); const sovMax = Math.max(1, ...sovTop.map((s) => s.top5 + s.ads));

  return (
    <Shell active="Demand" asOf={latest ? day(latest) : undefined}>
      <div>
        <h1 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.02em]">Demand</h1>
        <p className="mt-1 text-[14px] text-ink-2">Who is selling more (reviews as the sales signal), and who shoppers find when they search for K-beauty: unpaid results and paid ads.</p>
      </div>

      {(!months.data || !hist.data) ? <Loading what="demand and search data" /> : (
        <>
          {/* headline numbers */}
          <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label={`${ANCHOR_BRAND} reviews, last 3 mo`} value={anchorD?.last3 != null ? compact(anchorD.last3) : "–"} delta={anchorD?.growth ?? null}
              sub={anchorD?.last3 != null ? `#${anchorRank} of ${ranked.length} brands · ${momentumWord(anchorD.growth, anchorD.last3)}` : "not tracked"} />
            <Kpi label="Fastest-rising brand" value={up?.brand ?? "–"} delta={up?.growth ?? null} sub={up ? `${compact(up.last3)} reviews, 3 mo` : undefined} />
            <Kpi label="Sharpest decline" value={dn?.brand ?? "–"} delta={dn?.growth ?? null} sub={dn ? `${compact(dn.last3)} reviews, 3 mo` : undefined} />
            <Kpi label="Top product by demand" value={topProduct?.brand ?? "–"} sub={topProduct ? `${shortName(topProduct.label, topProduct.brand).slice(0, 30)} · ${compact(topProduct.last3)}` : undefined} />
            <Kpi label="Focus brands, unpaid top 5" value={`${Math.round((focusTop5 / Math.max(1, totalTop5)) * 100)}%`}
              sub={anchorS ? `${ANCHOR_BRAND}: ${anchorS.top5} top-5 · ${anchorS.top10} top-10` : `${ANCHOR_BRAND}: absent`} />
            <Kpi label="Focus brands, ad slots" value={`${Math.round((focusAds / Math.max(1, totalAds)) * 100)}%`}
              sub={`${ANCHOR_BRAND}: ${anchorS?.ads ?? 0} of ${totalAds} ads today`} />
          </section>
          <p className="mt-2 text-[11.5px] text-muted">Reviews: {period}. Search: {keywords.length} keywords on {latest ? day(latest) : "–"}.</p>

          {/* the two main visuals */}
          <section className="mt-6 grid gap-4 lg:grid-cols-[1.6fr_1fr]">
            <Card className="p-5">
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-[14px] font-semibold">Monthly reviews</div>
                <details className="text-[12px]"><summary className="cursor-pointer text-ink-2 hover:text-ink">Brands on the chart ({selected.length})</summary>
                  <div className="mt-2 max-w-[560px]"><BrandPicker focus={focus} all={brands.map((b) => ({ brand: b.brand, slots: b.last3 ?? 0 }))} selected={selected} colors={colors} onToggle={toggle} /></div>
                </details>
              </div>
              {sel.length ? <LineChart labels={win.map(monthLabel)} series={sel.map((b) => ({ name: b.brand, color: colors[b.brand], values: b.spark }))} height={260} yLabel="reviews per month"
                markers={eventsInWindow(events.data, win).map((e) => ({
                  from: Math.max(0, win.findIndex((m) => m.slice(0, 7) === e.happened_on.slice(0, 7))),
                  to: e.ends_on ? win.findIndex((m) => m.slice(0, 7) === e.ends_on!.slice(0, 7)) : undefined,
                  label: e.label, color: e.color,
                })).filter((m) => m.from >= 0)} />
                : <p className="text-[13px] text-muted">None of the selected brands has review history yet.</p>}
            </Card>
            <Card className="p-5">
              <div className="text-[14px] font-semibold">Share of voice in K-beauty search</div>
              <div className="mb-3 text-[12px] text-muted">Unpaid top-5 positions and ad slots across all keywords today</div>
              <div className="space-y-2">
                {sovTop.map((s) => (
                  <div key={s.brand} className="grid grid-cols-[110px_1fr_44px] items-center gap-2 text-[12.5px]">
                    <span className={`truncate ${norm(s.brand) === norm(ANCHOR_BRAND) ? "font-semibold" : ""}`}>{s.brand}</span>
                    <span className="flex h-3 overflow-hidden rounded-full bg-sunken">
                      <span className="h-3 bg-ink" style={{ width: `${(s.top5 / sovMax) * 100}%` }} />
                      <span className="h-3 bg-[#eda100]" style={{ width: `${(s.ads / sovMax) * 100}%` }} />
                    </span>
                    <span className="text-right text-muted tabular">{s.top5}{s.ads ? `+${s.ads}` : ""}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-4 text-[11.5px] text-muted"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-ink" />unpaid top 5</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#eda100]" />ad slots</span></div>
            </Card>
          </section>

          {/* detail, by section */}
          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-[18px] font-semibold tracking-tight">Detail</h2>
            <Segmented<Tab> value={tab} onChange={setTab} options={[{ value: "demand", label: "Demand" }, { value: "search", label: "Search" }, { value: "ads", label: "Ads" }]} />
          </div>

          {tab === "demand" && (
            <section className="mt-4">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
                <p className="text-[12.5px] text-muted">Momentum by brand, {period}. Click a brand for the products driving it; click a product for its detail.</p>
                <label className="flex items-center gap-2 text-[13px] text-ink-2"><input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} className="accent-ink" />Selected brands only</label>
              </div>
              <Card className="overflow-hidden">
                <div className="grid grid-cols-[minmax(200px,1.4fr)_140px_1fr_120px_1.2fr] border-b border-line px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                  <span>Brand</span><span>12 months</span><span>Reviews, last 3 mo</span><span className="pr-6 text-right">Prior 3 mo</span><span>Change</span>
                </div>
                {(allRows ? table : table.slice(0, 15)).map((b) => {
                  const isOpen = expanded === b.brand; const ps = products.filter((p) => p.brand === b.brand);
                  const c = colors[b.brand] ?? "#8a8880";
                  return (
                    <Fragment key={b.brand}>
                      <button onClick={() => setExpanded(isOpen ? null : b.brand)} className={`grid w-full grid-cols-[minmax(200px,1.4fr)_140px_1fr_120px_1.2fr] items-center border-b border-line px-5 py-2.5 text-left transition hover:bg-page/70 ${isOpen ? "bg-page/70" : ""}`}>
                        <span className="flex items-center gap-2.5">
                          <span className={`text-[11px] text-muted transition ${isOpen ? "rotate-90" : ""}`}>▶</span>
                          <span className="h-2 w-2 rounded-full" style={{ background: colors[b.brand] ?? "#d9d7cf" }} />
                          <span className="text-[14px] font-medium">{b.brand}</span>
                          <span className="text-[11.5px] text-muted">{ORIGIN_LABEL[origin.get(b.brand) ?? "unknown"]}</span>
                        </span>
                        <Sparkline values={b.spark} color={c} width={120} height={28} />
                        <span className="flex items-center gap-3 pr-6">
                          <b className="w-14 text-[14px] tabular">{b.last3 === null ? "–" : compact(b.last3)}</b>
                          <span className="h-1.5 flex-1 rounded-full bg-sunken"><span className="block h-1.5 rounded-full" style={{ width: `${((b.last3 ?? 0) / maxLast3) * 100}%`, background: c }} /></span>
                        </span>
                        <span className="pr-6 text-right text-[13px] text-ink-2 tabular">{b.prev3 === null ? "–" : compact(b.prev3)}</span>
                        <Change g={b.growth} vol={b.last3} />
                      </button>
                      {isOpen && (
                        <div className="border-b border-line bg-page/50 px-5 py-3">
                          <div className="mb-2 text-[12px] text-muted">{ps.length} tracked product{ps.length === 1 ? "" : "s"} · ranked by recent reviews</div>
                          {ps.map((p) => {
                            const s = shelfFor(p.key);
                            return (
                              <button key={p.key} onClick={() => open({ product_id: p.key, name: p.label, brand: p.brand, url: p.url, image: imgFor(p.key), price: s?.price, mrp: s?.mrp, rating: s?.rating, rating_count: s?.rating_count, usp: s?.usp_summary, phrases: s?.review_key_phrases, splitup: s?.review_splitup, madeIn: s?.country_name })}
                                className="grid w-full grid-cols-[48px_minmax(200px,1.3fr)_140px_1fr_1.2fr] items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface">
                                <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-lg bg-surface ring-1 ring-line">
                                  {/* eslint-disable-next-line @next/next/no-img-element -- Nykaa CDN image */}
                                  {imgFor(p.key) ? <img src={imgFor(p.key)!} alt="" className="h-9 w-9 object-contain" /> : null}
                                </span>
                                <span className="text-[13px] leading-snug">{shortName(p.label, p.brand)}{s ? <span className="ml-2 text-[11.5px] text-muted">#{s.rank} on shelf</span> : null}</span>
                                <Sparkline values={p.spark} color={c} width={120} height={24} />
                                <b className="text-[13px] tabular">{p.last3 === null ? <span className="font-normal text-muted">partial history</span> : compact(p.last3)}</b>
                                <Change g={p.growth} vol={p.last3} />
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </Fragment>
                  );
                })}
              </Card>
              {table.length > 15 && <button onClick={() => setAllRows(!allRows)} className="mt-2 rounded-lg px-2.5 py-1 text-[12.5px] text-ink-2 ring-1 ring-line hover:bg-surface">{allRows ? "Show top 15" : `Show all ${table.length} brands`}</button>}
              <p className="mt-3 text-[12px] leading-relaxed text-muted">Reviews are written at a steady rate by buyers, so monthly review volume tracks sales momentum. Tracked products: each focus brand&apos;s five best-ranked products plus the leading products of the ten most visible brands. Nykaa serves about 1,000 reviews per product, so for big bestsellers only recent months are complete; earlier months are left blank rather than counted as zero, and such products are excluded from the 3-vs-3 comparison.</p>
            </section>
          )}

          {tab === "search" && (
            <section className="mt-4">
              <p className="mb-3 text-[12.5px] text-muted">{keywords.length} keywords tracked: {keywords.filter((k) => CORE.includes(k)).length} K-beauty terms, {keywords.filter((k) => !CORE.includes(k)).length} from Nykaa suggestions. Unpaid results are the same for every shopper.</p>
              {keywordChips}
              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="min-w-0 p-4">
                  <div className="mb-1 px-2 text-[14px] font-semibold">Top 5 unpaid results</div>
                  <div className="mb-2 px-2 text-[12px] text-muted">&ldquo;{active}&rdquo; · {latest ? day(latest) : ""} · {cur.unpaid[0]?.total_found ? `${cur.unpaid[0].total_found} results on Nykaa` : "redirects to a category or brand page"}</div>
                  {cur.unpaid.slice(0, 5).map((r, i) => <Tile key={r.product_id} r={r} pos={i + 1} />)}
                </Card>
                <Card className="min-w-0 p-4">
                  <div className="mb-1 px-2 text-[14px] font-semibold">Unpaid share by brand, all keywords</div>
                  <div className="mb-2 px-2 text-[12px] text-muted">Top-5 and top-10 unpaid positions today</div>
                  <table className="w-full text-[12.5px] tabular">
                    <thead><tr className="text-left text-[11px] uppercase tracking-[0.08em] text-muted"><th className="px-2 pb-1.5 font-semibold">Brand</th><th className="pb-1.5 font-semibold">Top 5</th><th className="pb-1.5 font-semibold">Top 10</th></tr></thead>
                    <tbody>{sov.slice(0, 10).map((s) => (
                      <tr key={s.brand} className={`border-t border-line ${isFocus(s.brand) ? "bg-page/60" : ""}`}><td className="px-2 py-1.5 font-medium">{s.brand}<span className="ml-1.5 text-[11px] font-normal text-muted">{ORIGIN_LABEL[s.origin]}</span></td><td>{s.top5}</td><td>{s.top10}</td></tr>
                    ))}</tbody>
                  </table>
                </Card>
              </div>
              <details className="mt-5">
                <summary className="cursor-pointer text-[13px] font-medium text-ink-2 hover:text-ink">What Nykaa suggests as shoppers type</summary>
                {!sugg.data ? <Loading what="suggestions" /> : (
                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {(() => {
                      const bySeed = new Map<string, typeof sugg.data>();
                      sugg.data.forEach((s) => bySeed.set(s.seed, [...(bySeed.get(s.seed) ?? []), s]));
                      return [...bySeed.entries()].sort((a, b) => (a[0] === "" ? -1 : b[0] === "" ? 1 : 0)).map(([seed, ss]) => (
                        <Card key={seed || "popular"} className="p-4">
                          <div className="mb-2 text-[13px] font-semibold">{seed ? <>Typing &ldquo;{seed}&rdquo;</> : "Popular searches on Nykaa"}</div>
                          <div className="flex flex-wrap gap-1.5">{ss.filter((s) => s.kind !== "product").sort((a, b) => a.position - b.position).map((s) => <span key={`${s.kind}${s.position}`} className="rounded-full bg-sunken px-2.5 py-1 text-[12px] text-ink-2">{s.suggestion}</span>)}</div>
                          {ss.some((s) => s.kind === "product") && <div className="mt-3 text-[11.5px] text-muted">Suggested products: {ss.filter((s) => s.kind === "product").sort((a, b) => a.position - b.position).map((s) => s.suggestion.split(" ").slice(0, 3).join(" ")).join(" · ")}</div>}
                        </Card>
                      ));
                    })()}
                  </div>
                )}
              </details>
            </section>
          )}

          {tab === "ads" && (
            <section className="mt-4">
              {keywordChips}
              <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
                <Card className="min-w-0 p-4">
                  <div className="mb-1 px-2 text-[14px] font-semibold">Paid slots today</div>
                  <div className="mb-2 px-2 text-[12px] text-muted">&ldquo;{active}&rdquo; · {cur.ads.length ? `${cur.ads.length} AD tiles in the first 20 results` : "no ads on this keyword today"}</div>
                  {cur.ads.slice(0, 6).map((r, i) => <Tile key={`${r.product_id}-${i}`} r={r} pos={i + 1} paid />)}
                </Card>
                <Card className="min-w-0 overflow-x-auto p-5">
                  <div className="mb-1 text-[14px] font-semibold">Ad placements over time · &ldquo;{active}&rdquo;</div>
                  <div className="mb-3 text-[12px] text-muted">AD tiles per brand per day. Last row: the #1 unpaid result.</div>
                  <table className="w-full min-w-[560px] text-[12.5px] tabular">
                    <thead><tr><th className="pb-2 pr-3 text-left font-medium text-muted">Brand</th>{adGrid.ds.map((d) => <th key={d} className="pb-2 text-center font-medium text-muted">{day(d)}</th>)}</tr></thead>
                    <tbody>
                      {adGrid.brands.map(([b, m]) => (
                        <tr key={b} className="border-t border-line">
                          <td className="py-1.5 pr-3 font-medium">{b}{isFocus(b) && <span className="ml-1.5 rounded bg-sunken px-1 text-[10px] text-muted">focus</span>}</td>
                          {adGrid.ds.map((d) => { const n = m.get(d) ?? 0; return <td key={d} className="py-1.5 text-center">{n ? <span className="inline-grid h-6 w-6 place-items-center rounded-md text-[11.5px] font-semibold text-white" style={{ background: `rgba(237,161,0,${0.45 + Math.min(n, 3) * 0.18})` }}>{n}</span> : <span className="text-line-2">·</span>}</td>; })}
                        </tr>
                      ))}
                      <tr className="border-t-2 border-line"><td className="py-1.5 pr-3 text-muted">#1 unpaid</td>{adGrid.unpaid1.map((b, i) => <td key={i} className="py-1.5 text-center text-[11.5px] text-ink-2">{b ?? "–"}</td>)}</tr>
                    </tbody>
                  </table>
                  {adGrid.brands.length === 0 && <p className="mt-2 text-[12.5px] text-muted">No ads recorded on this keyword.</p>}
                </Card>
              </div>
              <div className="mt-8" />
              <SectionHead title="Ads and search by brand, all keywords" note="Unpaid top-5 and top-10 positions today, ad slots today, and keyword-days with an ad over the last 7 days." />
              <Card className="overflow-hidden">
                <div className="grid grid-cols-[minmax(180px,1.5fr)_1fr_1fr_1fr_1fr] border-b border-line px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"><span>Brand</span><span>Unpaid top 5</span><span>Unpaid top 10</span><span>Ad slots today</span><span>Ad keyword-days, 7d</span></div>
                {sov.slice(0, 18).map((s) => {
                  const mx = Math.max(1, sov[0].top5);
                  return (
                    <div key={s.brand} className={`grid grid-cols-[minmax(180px,1.5fr)_1fr_1fr_1fr_1fr] items-center border-b border-line px-5 py-2 text-[13px] last:border-0 ${isFocus(s.brand) ? "bg-page/60" : ""}`}>
                      <span className="flex items-center gap-2"><span className="font-medium">{s.brand}</span><span className="text-[11.5px] text-muted">{ORIGIN_LABEL[s.origin]}</span>{isFocus(s.brand) && <span className="rounded bg-sunken px-1 text-[10px] text-muted">focus</span>}</span>
                      <span className="flex items-center gap-2 pr-6 tabular"><b className="w-6">{s.top5}</b><span className="h-1.5 flex-1 rounded-full bg-sunken"><span className="block h-1.5 rounded-full bg-ink" style={{ width: `${(s.top5 / mx) * 100}%` }} /></span></span>
                      <span className="tabular">{s.top10}</span>
                      <span className="tabular">{s.ads || <span className="text-muted">–</span>}</span>
                      <span className="tabular">{s.adDays || <span className="text-muted">–</span>}</span>
                    </div>
                  );
                })}
              </Card>
              <p className="mt-3 text-[12px] leading-relaxed text-muted">Ads are what Nykaa showed our collector at about 07:00 IST from a data centre outside India. A 22 Sep test found identical ads across fresh sessions minutes apart but different ads by location, so treat ad counts as a daily sample, not every shopper&apos;s view. Unpaid results match the site for everyone.</p>
            </section>
          )}
        </>
      )}
    </Shell>
  );
}

export default function Page() {
  return <AuthGate><DemandPage /></AuthGate>;
}
