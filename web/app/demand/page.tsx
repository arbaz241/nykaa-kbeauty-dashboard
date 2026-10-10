"use client";

import { Fragment, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import BrandPicker from "@/components/BrandPicker";
import { Chip } from "@/components/CompareGrid";
import LineChart from "@/components/LineChart";
import { eventsInWindow } from "@/components/EventLog";
import { useOpenProduct } from "@/components/ProductDrawer";
import { ActionSection, SectionNav, ShowAll, type NavItem } from "@/components/Report";
import { Missing, Opens, Points, useDetail } from "@/components/Detail";
import Shell from "@/components/Shell";
import Sparkline from "@/components/Sparkline";
import { Card, Loading } from "@/components/ui";
import { ANCHOR_BRAND, FOCUS_BRANDS, ORIGIN_LABEL, norm, resolveBrand } from "@/lib/brands";
import { useCatalog, useEvents, useReviewMonths, useSearchHistory, useShelf, useSuggestions } from "@/lib/data";
import { compact, inr, shortName, signed } from "@/lib/format";
import { demandLines, momentumWord, monthsWindow } from "@/lib/metrics";
import { useBrandSelection } from "@/lib/selection";
import type { SearchRow, Suggestion } from "@/lib/types";

/** Demand: the old Demand and Search & Ads tabs as one report (docs/restructure-v2-plan.md).
 *  Answer first, then demand → share of search vs demand → search → ads → what shoppers type. */

// Keep in sync with scraper/signals.py SEARCH_QUERIES
const CORE = ["korean skincare", "korean sunscreen", "korean serum", "korean moisturizer", "korean face wash", "korean toner", "korean sheet mask", "korean lip tint", "glass skin", "snail mucin", "cica", "rice toner", "centella", "niacinamide serum", "sunscreen for oily skin"];
const isFocus = (b: string) => FOCUS_BRANDS.some((f) => norm(f) === norm(b));
const isAnchor = (b: string) => norm(b) === norm(ANCHOR_BRAND);
const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const monthLabel = (m: string) => new Date(m).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

const NAV: NavItem[] = [
  { id: "summary", label: "Summary" }, { id: "demand", label: "Demand" }, { id: "sos", label: "Search vs demand" },
  { id: "search", label: "Search" }, { id: "ads", label: "Ads" }, { id: "suggest", label: "What shoppers type" },
];

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

function Thumb({ src, cls }: { src: string | null; cls: string }) {
  return (
    <span className={`grid h-9 w-9 place-items-center overflow-hidden rounded-lg ring-1 ring-line ${cls}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- Nykaa CDN image */}
      {src ? <img src={src} alt="" className="h-8 w-8 object-contain" /> : null}
    </span>
  );
}

function Kpi({ label, value, sub, delta, href }: { label: string; value: React.ReactNode; sub?: React.ReactNode; delta?: number | null; href: string }) {
  return (
    <a href={href} className="block rounded-2xl bg-surface px-4 py-3.5 shadow-card ring-1 ring-line transition hover:ring-line-2">
      <div className="text-[11.5px] font-medium text-muted">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-[20px] font-semibold leading-tight tracking-tight tabular">{value}</span>
        {delta !== undefined && delta !== null && <span className={`text-[12.5px] font-semibold tabular ${delta > 0.02 ? "text-good" : delta < -0.02 ? "text-bad" : "text-ink-2"}`}>{delta > 0 ? "▲" : delta < 0 ? "▼" : ""}{Math.abs(Math.round(delta * 100))}%</span>}
      </div>
      {sub && <div className="mt-1 text-[12px] leading-snug text-ink-2">{sub}</div>}
    </a>
  );
}

function DemandPage() {
  const months = useReviewMonths(); const shelf = useShelf(); const catalog = useCatalog(); const events = useEvents();
  const hist = useSearchHistory(); const sugg = useSuggestions();
  const open = useOpenProduct(); const detail = useDetail();

  /* ---- demand (reviews) */
  const data = useMemo(() => months.data ?? [], [months.data]);
  const known = useMemo(() => [...new Set(data.map((m) => m.brand))], [data]);
  const focus = useMemo(() => FOCUS_BRANDS.map((b) => resolveBrand(b, known) ?? b).filter((b) => known.includes(b)), [known]);
  const { selected, colors, toggle } = useBrandSelection(known);
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
  const anchorD = brands.find((b) => isAnchor(b.brand));
  const ranked = brands.filter((b) => b.last3 !== null);
  const anchorRank = anchorD ? ranked.findIndex((b) => b.brand === anchorD.brand) + 1 : 0;
  const topProducts = products.filter((p) => p.last3 !== null).slice(0, 10);
  const table = onlySelected ? brands.filter((b) => selected.includes(b.brand)) : brands;
  const maxLast3 = Math.max(1, ...table.map((b) => b.last3 ?? 0));
  const imgFor = (pid: string) => (shelf.data ?? []).find((r) => r.product_id === pid)?.image_url ?? (catalog.data ?? []).find((r) => r.product_id === pid)?.best_image ?? null;
  const shelfFor = (pid: string) => (shelf.data ?? []).find((r) => r.product_id === pid);
  const openProduct = (pid: string, label: string, brand: string, url?: string | null) => {
    const s = shelfFor(pid);
    open({ product_id: pid, name: label, brand, url, image: imgFor(pid), price: s?.price, mrp: s?.mrp, rating: s?.rating, rating_count: s?.rating_count, usp: s?.usp_summary, phrases: s?.review_key_phrases, splitup: s?.review_splitup, madeIn: s?.country_name });
  };

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
  const totalTop10 = sov.reduce((a, s) => a + s.top10, 0);
  const focusAds = sov.filter((s) => isFocus(s.brand)).reduce((a, s) => a + s.ads, 0);
  const totalAds = sov.reduce((a, s) => a + s.ads, 0);
  const anchorS = sov.find((s) => isAnchor(s.brand));
  const topAdv = [...sov].sort((a, b) => b.ads - a.ads || b.adDays - a.adDays)[0];

  // Innisfree keyword by keyword: best unpaid place, who is #1, Innisfree ads
  const anchorKw = useMemo(() => keywords.map((k) => {
    const { unpaid, ads } = split(byKw.get(k) ?? []);
    const pos = unpaid.findIndex((r) => isAnchor(r.brand));
    return { k, pos: pos >= 0 ? pos + 1 : null, first: unpaid[0]?.brand ?? null, ads: ads.filter((r) => isAnchor(r.brand)).length };
  }), [keywords, byKw]);
  const absent = anchorKw.filter((x) => x.pos === null || x.pos > 10).length;

  // share of search (unpaid top-10 places) vs share of demand (reviews, last 3 months): Binet's "excess share of search"
  const sos = useMemo(() => {
    const demTot = brands.reduce((a, b) => a + (b.last3 ?? 0), 0);
    const names = new Set([...sov.filter((s) => s.top10 > 0).map((s) => s.brand), ...brands.filter((b) => (b.last3 ?? 0) > 0).slice(0, 25).map((b) => b.brand)]);
    return [...names].map((b) => {
      const s = sov.find((x) => norm(x.brand) === norm(b)); const d = brands.find((x) => norm(x.brand) === norm(b));
      const search = s ? s.top10 / Math.max(1, totalTop10) : 0; const demand = d?.last3 ? d.last3 / Math.max(1, demTot) : 0;
      return { brand: b, search, demand, excess: search - demand, origin: s?.origin ?? origin.get(b) ?? "unknown", tracked: !!d?.last3 };
    }).filter((x) => x.search > 0 || x.demand > 0.01).sort((a, b) => b.excess - a.excess);
  }, [brands, sov, totalTop10, origin]);
  const ahead = sos.filter((x) => x.tracked && x.excess > 0.02).slice(0, 3).map((x) => x.brand);
  const behind = sos.filter((x) => x.excess < -0.02).slice(-3).reverse().map((x) => x.brand);
  const anchorSos = sos.find((x) => isAnchor(x.brand));

  const Tile = ({ r, pos, paid }: { r: SearchRow; pos: number; paid?: boolean }) => (
    <button onClick={() => open({ product_id: r.product_id, name: r.name, brand: r.brand, image: imgFor(r.product_id), price: r.price, url: `https://www.nykaa.com/search/result/?q=${encodeURIComponent(r.name)}` })}
      className={`group flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-page ${isAnchor(r.brand) ? "bg-[#eef4fc]" : ""}`}>
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${paid ? "bg-[#fff4e5] text-[#8a5a00]" : "bg-ink text-white"}`}>{paid ? "AD" : pos}</span>
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-page ring-1 ring-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- Nykaa CDN image */}
        {imgFor(r.product_id) ? <img src={imgFor(r.product_id)!} alt="" className="h-9 w-9 object-contain" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-2">{r.brand}{isFocus(r.brand) && <span className="ml-1.5 rounded bg-sunken px-1 text-[10px] text-muted">focus</span>}</span>
        <span className="block text-[12.5px] leading-snug group-hover:underline">{shortName(r.name, r.brand)}</span>
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
  const suggestions = useMemo(() => {
    const bySeed = new Map<string, Suggestion[]>();
    (sugg.data ?? []).forEach((s) => bySeed.set(s.seed, [...(bySeed.get(s.seed) ?? []), s]));
    return [...bySeed.entries()].sort((a, b) => (a[0] === "" ? -1 : b[0] === "" ? 1 : 0));
  }, [sugg.data]);

  const verdict = anchorD ? `${ANCHOR_BRAND}'s demand is ${momentumWord(anchorD.growth, anchorD.last3)} (${signed(anchorD.growth)} reviews, #${anchorRank} of ${ranked.length} brands), but in K-beauty search it holds only ${anchorS?.top5 ?? 0} of ${totalTop5} unpaid top-5 places and ${anchorS?.ads ?? 0} of ${totalAds} ad slots today.` : "";

  return (
    <Shell active="Demand" asOf={latest ? day(latest) : undefined}>
      <h1 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.02em]">Demand</h1>
      <p className="mt-1 max-w-[860px] text-[14px] text-ink-2">Who is selling more (monthly reviews as the sales signal), and who shoppers find when they search for K-beauty on Nykaa: unpaid results, paid ads, and what Nykaa suggests as they type.</p>
      {(!months.data || !hist.data) ? <Loading what="demand and search data" /> : (
        <>
          <SectionNav items={NAV} />

          <section id="summary" className="mt-6 scroll-mt-32">
            {verdict && <Card className="px-6 py-5"><div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Verdict for {ANCHOR_BRAND}</div><p className="mt-2 max-w-[110ch] font-display text-[18px] font-medium leading-snug tracking-tight">{verdict}</p></Card>}
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi href="#demand" label={`${ANCHOR_BRAND} reviews, last 3 mo`} value={anchorD?.last3 != null ? compact(anchorD.last3) : <Missing>not tracked</Missing>} delta={anchorD?.growth ?? null} sub={anchorD?.last3 != null ? `#${anchorRank} of ${ranked.length} brands` : "not tracked"} />
              <Kpi href="#demand" label="Fastest-rising brand" value={up?.brand ?? <Missing>too little history</Missing>} delta={up?.growth ?? null} sub={up ? `${compact(up.last3)} reviews in 3 months` : undefined} />
              <Kpi href="#demand" label="Sharpest decline" value={dn?.brand ?? <Missing>too little history</Missing>} delta={dn?.growth ?? null} sub={dn ? `${compact(dn.last3)} reviews in 3 months` : undefined} />
              <Kpi href="#demand" label="Top product by demand" value={topProducts[0]?.brand ?? <Missing>none tracked</Missing>} sub={topProducts[0] ? `${shortName(topProducts[0].label, topProducts[0].brand)} · ${compact(topProducts[0].last3)} reviews` : undefined} />
              <Kpi href="#search" label="Focus brands' unpaid top-5 share" value={`${Math.round((focusTop5 / Math.max(1, totalTop5)) * 100)}%`} sub={`${ANCHOR_BRAND}: ${anchorS?.top5 ?? 0} top-5 · ${anchorS?.top10 ?? 0} top-10 · outside the top 10 on ${absent} of ${keywords.length} keywords`} />
              <Kpi href="#ads" label="Focus brands' share of ad slots" value={`${Math.round((focusAds / Math.max(1, totalAds)) * 100)}%`} sub={`${ANCHOR_BRAND}: ${anchorS?.ads ?? 0} of ${totalAds} ads today; top advertiser ${topAdv?.brand ?? "none today"}`} />
            </div>
            <p className="mt-2 text-[11.5px] text-muted">Reviews: {period}. Search: {keywords.length} keywords ({keywords.filter((k) => CORE.includes(k)).length} K-beauty terms, {keywords.filter((k) => !CORE.includes(k)).length} from Nykaa suggestions) on {latest ? day(latest) : "the latest day"}.</p>
          </section>

          <ActionSection id="demand" kicker="Demand · who is selling more" title={`${up ? `${up.brand} is rising fastest (${signed(up.growth)}) and ${dn?.brand} falling hardest (${signed(dn?.growth ?? null)})` : "Demand by brand"}; ${ANCHOR_BRAND} is ${anchorD ? momentumWord(anchorD.growth, anchorD.last3) : "not tracked"}.`}
            note={<>Monthly reviews track sales. Rising = more reviews in the last 3 complete months than the 3 before. <Opens detail={{ kicker: "Method", title: "How demand is measured", body: <Points items={["Nykaa does not publish sales; buyers write reviews at a steady rate, so monthly review volume tracks sales momentum.", "Tracked products: each focus brand's best-ranked products plus the leading products of the most visible rival brands.", "Nykaa serves about 1,000 reviews per product, so for big bestsellers only recent months are complete; earlier months are left blank rather than counted as zero, and such products are left out of the 3-vs-3 comparison.", "Under 30 reviews in 3 months is marked as low volume."]} /> }}>Method</Opens></>}>
            <Card className="p-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><div className="text-[14px] font-semibold">Monthly reviews, last 12 complete months</div><span className="text-[12px] text-muted">Hover for values; logged market events are marked</span></div>
              <div className="mb-3"><BrandPicker focus={focus} all={brands.map((b) => ({ brand: b.brand, slots: b.last3 ?? 0 }))} selected={selected} colors={colors} onToggle={toggle} /></div>
              {sel.length ? <LineChart labels={win.map(monthLabel)} series={sel.map((b) => ({ name: b.brand, color: colors[b.brand], values: b.spark }))} height={280} yLabel="reviews per month"
                markers={eventsInWindow(events.data, win).map((e) => ({ from: Math.max(0, win.findIndex((m) => m.slice(0, 7) === e.happened_on.slice(0, 7))), to: e.ends_on ? win.findIndex((m) => m.slice(0, 7) === e.ends_on!.slice(0, 7)) : undefined, label: e.label, color: e.color })).filter((m) => m.from >= 0)} />
                : <p className="text-[13px] text-muted">None of the selected brands has review history yet.</p>}
            </Card>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
              <div>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-3">
                  <div className="text-[14px] font-semibold">Review growth by brand <span className="text-[12px] font-normal text-muted">· click a brand for its products</span></div>
                  <label className="flex items-center gap-2 text-[12.5px] text-ink-2"><input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} className="accent-ink" />Selected brands only</label>
                </div>
                <Card className="overflow-hidden">
                  <div className="grid grid-cols-[minmax(170px,1.4fr)_110px_1fr_90px_1.1fr] border-b border-line px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                    <span>Brand</span><span>12 months</span><span>Reviews, 3 mo</span><span className="pr-4 text-right">Prior 3</span><span>Change</span>
                  </div>
                  {(allRows ? table : table.slice(0, 15)).map((b) => {
                    const ps = products.filter((p) => p.brand === b.brand); const c = colors[b.brand] ?? "#8a8880";
                    return (
                      <Fragment key={b.brand}>
                        <button onClick={() => detail({ kicker: `${b.brand} · tracked products`, title: `${b.brand}: ${b.last3 === null ? "partial history" : `${compact(b.last3)} reviews in 3 months`}`, body: (<>
                          <p className="text-muted">{ps.length} tracked product{ps.length === 1 ? "" : "s"}, ranked by recent reviews. Click one for its history.</p>
                          <div className="mt-3 space-y-1">{ps.map((p) => { const s = shelfFor(p.key); return (
                            <button key={p.key} onClick={() => openProduct(p.key, p.label, p.brand, p.url)} className="grid w-full grid-cols-[40px_1fr_auto] items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-surface">
                              <Thumb src={imgFor(p.key)} cls="bg-surface" />
                              <span className="min-w-0 text-[12.5px] leading-snug">{shortName(p.label, p.brand)}{s ? <span className="ml-2 text-[11px] text-muted">#{s.rank} on shelf</span> : null}<span className="mt-0.5 block"><Sparkline values={p.spark} color={c} width={120} height={20} /></span></span>
                              <span className="text-right text-[12.5px]"><b className="tabular">{p.last3 === null ? <Missing>partial</Missing> : compact(p.last3)}</b><span className="block"><Change g={p.growth} vol={p.last3} /></span></span>
                            </button>); })}</div>
                        </>) })} className={`grid w-full grid-cols-[minmax(170px,1.4fr)_110px_1fr_90px_1.1fr] items-center border-b border-line px-4 py-2 text-left transition hover:bg-page/70 ${isAnchor(b.brand) ? "bg-page/70" : ""}`}>
                          <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: colors[b.brand] ?? "#d9d7cf" }} /><span className={`text-[13.5px] ${isAnchor(b.brand) ? "font-semibold" : "font-medium"}`}>{b.brand} <span className="text-muted">›</span></span><span className="text-[11px] text-muted">{ORIGIN_LABEL[origin.get(b.brand) ?? "unknown"]}</span></span>
                          <Sparkline values={b.spark} color={c} width={96} height={24} />
                          <span className="flex items-center gap-2 pr-4"><b className="w-12 text-[13.5px] tabular">{b.last3 === null ? <Missing>partial</Missing> : compact(b.last3)}</b><span className="h-1.5 flex-1 rounded-full bg-sunken"><span className="block h-1.5 rounded-full" style={{ width: `${((b.last3 ?? 0) / maxLast3) * 100}%`, background: c }} /></span></span>
                          <span className="pr-4 text-right text-[12.5px] text-ink-2 tabular">{b.prev3 === null ? <Missing>partial</Missing> : compact(b.prev3)}</span>
                          <Change g={b.growth} vol={b.last3} />
                        </button>
                      </Fragment>
                    );
                  })}
                </Card>
                {table.length > 15 && <button onClick={() => setAllRows(!allRows)} className="mt-2 rounded-lg px-2.5 py-1 text-[12.5px] text-ink-2 ring-1 ring-line hover:bg-surface">{allRows ? "Show top 15" : `Show all ${table.length} brands`}</button>}
              </div>
              <div>
                <div className="mb-2 text-[14px] font-semibold">Top products by demand <span className="text-[12px] font-normal text-muted">· reviews, last 3 months</span></div>
                <Card className="px-2 py-2">
                  {topProducts.map((p, i) => (
                    <button key={p.key} onClick={() => openProduct(p.key, p.label, p.brand, p.url)} className={`grid w-full grid-cols-[20px_36px_1fr_auto] items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-page ${isAnchor(p.brand) ? "bg-page/70" : ""}`}>
                      <span className="text-[11.5px] text-muted tabular">{i + 1}</span>
                      <Thumb src={imgFor(p.key)} cls="bg-page" />
                      <span className="min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-2">{p.brand}</span><span className="block text-[12.5px] leading-snug">{shortName(p.label, p.brand)}</span></span>
                      <span className="text-right text-[12.5px] tabular"><b>{compact(p.last3)}</b><span className={`block text-[11px] ${p.growth !== null && p.growth > 0.05 ? "text-good" : p.growth !== null && p.growth < -0.05 ? "text-bad" : "text-muted"}`}>{p.growth === null ? "" : signed(p.growth)}</span></span>
                    </button>
                  ))}
                </Card>
              </div>
            </div>
          </ActionSection>

          <ActionSection id="sos" kicker="Search vs demand · a leading signal" title={`${ahead.length ? `${ahead.join(", ")} take more of K-beauty search than of demand` : "No brand's search share clearly runs ahead of its demand"}${anchorSos ? `; ${ANCHOR_BRAND} is ${anchorSos.excess > 0.02 ? "ahead" : anchorSos.excess < -0.02 ? "behind" : "level"} (${(anchorSos.search * 100).toFixed(1)}% of search vs ${(anchorSos.demand * 100).toFixed(1)}% of demand)` : ""}.`}
            note={<>Brands whose share of search runs ahead of their share of demand tend to grow next (Binet &amp; Field); those behind tend to lose ground. <Opens detail={{ kicker: "Method", title: "Share of search vs share of demand", body: <Points items={["Share of search: share of all unpaid top-10 places across today's tracked K-beauty keywords.", "Share of demand: share of reviews in the last 3 months across tracked brands.", "Gap: search minus demand, in percentage points. Green = search ahead (a leading signal of growth), red = behind.", "Indicative only: demand covers tracked products, and search is one day's sample."]} /> }}>Method</Opens></>}>
            <Card className="overflow-hidden">
              <div className="grid grid-cols-[minmax(160px,1.2fr)_1fr_1fr_120px] border-b border-line px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted"><span>Brand</span><span>Share of search</span><span>Share of demand</span><span className="text-right">Gap</span></div>
              <ShowAll n={12} more="brands" items={sos} render={(x) => {
                const mx = Math.max(0.01, ...sos.map((s) => Math.max(s.search, s.demand)));
                return (
                  <div key={x.brand} className={`grid grid-cols-[minmax(160px,1.2fr)_1fr_1fr_120px] items-center border-b border-line px-4 py-2 text-[12.5px] last:border-0 ${isAnchor(x.brand) ? "bg-page/70 font-semibold" : ""}`}>
                    <span>{x.brand} <span className="text-[11px] font-normal text-muted">{ORIGIN_LABEL[x.origin]}{!x.tracked ? " · demand not tracked" : ""}</span></span>
                    <span className="flex items-center gap-2 pr-4 tabular"><span className="w-10">{(x.search * 100).toFixed(1)}%</span><span className="h-1.5 flex-1 rounded-full bg-sunken"><span className="block h-1.5 rounded-full bg-ink" style={{ width: `${(x.search / mx) * 100}%` }} /></span></span>
                    <span className="flex items-center gap-2 pr-4 tabular"><span className="w-10">{(x.demand * 100).toFixed(1)}%</span><span className="h-1.5 flex-1 rounded-full bg-sunken"><span className="block h-1.5 rounded-full bg-[#2a78d6]" style={{ width: `${(x.demand / mx) * 100}%` }} /></span></span>
                    <span className={`text-right tabular ${x.excess > 0.02 ? "text-good" : x.excess < -0.02 ? "text-bad" : "text-ink-2"}`}>{x.excess > 0 ? "+" : ""}{(x.excess * 100).toFixed(1)} pts</span>
                  </div>
                );
              }} />
            </Card>
            {behind.length > 0 && <p className="mt-2 text-[12px] text-ink-2">Search share furthest behind demand: {behind.join(", ")}.</p>}
          </ActionSection>

          <ActionSection id="search" kicker="Search · who shoppers find" title={`${sov[0]?.brand ?? "No brand"} holds the most unpaid top-5 places (${sov[0]?.top5 ?? 0}); ${ANCHOR_BRAND} holds ${anchorS?.top5 ?? 0} and is outside the top 10 on ${absent} of ${keywords.length} keywords.`}
            note="Unpaid results are the same for every shopper. Pick a keyword to see its results; the right-hand table shows Innisfree keyword by keyword (click a row to open it).">
            {keywordChips}
            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="min-w-0 p-4">
                <div className="mb-1 px-2 text-[14px] font-semibold">Top 5 unpaid · &ldquo;{active}&rdquo;</div>
                <div className="mb-2 px-2 text-[12px] text-muted">{latest ? day(latest) : ""} · {cur.unpaid[0]?.total_found ? `${cur.unpaid[0].total_found} results on Nykaa` : "redirects to a category or brand page"}</div>
                {cur.unpaid.slice(0, 5).map((r, i) => <Tile key={r.product_id} r={r} pos={i + 1} />)}
              </Card>
              <Card className="min-w-0 p-4">
                <div className="mb-1 px-2 text-[14px] font-semibold">Paid slots today · &ldquo;{active}&rdquo;</div>
                <div className="mb-2 px-2 text-[12px] text-muted">{cur.ads.length ? `${cur.ads.length} AD tiles in the first 20 results` : "No ads on this keyword today"}</div>
                {cur.ads.slice(0, 6).map((r, i) => <Tile key={`${r.product_id}-${i}`} r={r} pos={i + 1} paid />)}
              </Card>
              <Card className="min-w-0 overflow-hidden">
                <div className="px-4 pb-1 pt-3 text-[14px] font-semibold">{ANCHOR_BRAND}, keyword by keyword</div>
                <div className="grid grid-cols-[1fr_84px_1fr] border-b border-line px-4 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted"><span>Keyword</span><span>Its place</span><span>#1 unpaid</span></div>
                <div className="max-h-[380px] overflow-y-auto">
                  {anchorKw.map((x) => (
                    <button key={x.k} onClick={() => setKw(x.k)} className={`grid w-full grid-cols-[1fr_84px_1fr] items-center border-b border-line px-4 py-1.5 text-left text-[12px] last:border-0 hover:bg-page ${active === x.k ? "bg-page" : ""}`}>
                      <span className="truncate" title={x.k}>{x.k}</span>
                      <span className="tabular">{x.pos ? <Chip tone={x.pos <= 5 ? "good" : x.pos <= 10 ? undefined : "bad"}>#{x.pos}</Chip> : <Chip tone="bad">absent</Chip>}{x.ads ? <span className="ml-1 text-[10.5px] text-[#8a5a00]">+{x.ads} ad</span> : null}</span>
                      <span className="truncate text-ink-2" title={x.first ?? ""}>{x.first ?? <Missing>no results</Missing>}</span>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
            <Card className="mt-4 overflow-hidden">
              <div className="grid grid-cols-[minmax(180px,1.5fr)_1fr_1fr] border-b border-line px-5 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted"><span>Unpaid share by brand, all keywords</span><span>Top 5</span><span>Top 10</span></div>
              <ShowAll n={12} more="brands" items={sov.filter((s) => s.top10 > 0)} render={(s) => {
                const mx = Math.max(1, sov[0].top5);
                return (
                  <div key={s.brand} className={`grid grid-cols-[minmax(180px,1.5fr)_1fr_1fr] items-center border-b border-line px-5 py-2 text-[13px] last:border-0 ${isAnchor(s.brand) ? "bg-page/70 font-semibold" : ""}`}>
                    <span className="flex items-center gap-2"><span>{s.brand}</span><span className="text-[11px] font-normal text-muted">{ORIGIN_LABEL[s.origin]}</span>{isFocus(s.brand) && <span className="rounded bg-sunken px-1 text-[10px] font-normal text-muted">focus</span>}</span>
                    <span className="flex items-center gap-2 pr-6 tabular"><b className="w-6">{s.top5}</b><span className="h-1.5 flex-1 rounded-full bg-sunken"><span className="block h-1.5 rounded-full bg-ink" style={{ width: `${(s.top5 / mx) * 100}%` }} /></span></span>
                    <span className="tabular">{s.top10}</span>
                  </div>
                );
              }} />
            </Card>
          </ActionSection>

          <ActionSection id="ads" kicker="Ads · who is paying for attention" title={`${topAdv?.brand ?? "No brand"} buys the most ad slots (${topAdv?.ads ?? 0} today, ${topAdv?.adDays ?? 0} keyword-days this week); ${ANCHOR_BRAND} holds ${anchorS?.ads ?? 0} today and ${anchorS?.adDays ?? 0} keyword-days.`}
            note={<>A daily sample of the paid tiles Nykaa shows, not every shopper&rsquo;s view. <Opens detail={{ kicker: "Method", title: "How ads are sampled", body: <Points items={["Ads are what Nykaa showed our collector at about 07:00 IST from a data centre outside India.", "A 22 Sep test found identical ads across fresh sessions minutes apart, but different ads by location.", "Treat ad counts as a daily sample, comparable day to day, not as every shopper's view."]} /> }}>Method</Opens></>}>
            {keywordChips}
            <Card className="overflow-x-auto p-5">
              <div className="mb-1 text-[14px] font-semibold">Ad placements over time · &ldquo;{active}&rdquo;</div>
              <div className="mb-3 text-[12px] text-muted">AD tiles each brand held per day. Last row: the #1 unpaid result, for comparison.</div>
              <table className="w-full min-w-[620px] text-[12.5px] tabular">
                <thead><tr><th className="pb-2 pr-3 text-left font-medium text-muted">Brand</th>{adGrid.ds.map((d) => <th key={d} className="pb-2 text-center font-medium text-muted">{day(d)}</th>)}</tr></thead>
                <tbody>
                  {adGrid.brands.map(([b, m]) => (
                    <tr key={b} className={`border-t border-line ${isAnchor(b) ? "bg-page/70" : ""}`}>
                      <td className="py-1.5 pr-3 font-medium">{b}{isFocus(b) && <span className="ml-1.5 rounded bg-sunken px-1 text-[10px] text-muted">focus</span>}</td>
                      {adGrid.ds.map((d) => { const n = m.get(d) ?? 0; return <td key={d} className="py-1.5 text-center">{n ? <span className="inline-grid h-6 w-6 place-items-center rounded-md text-[11.5px] font-semibold text-white" style={{ background: `rgba(237,161,0,${0.45 + Math.min(n, 3) * 0.18})` }}>{n}</span> : <span className="text-line-2">·</span>}</td>; })}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-line"><td className="py-1.5 pr-3 text-muted">#1 unpaid</td>{adGrid.unpaid1.map((b, i) => <td key={i} className="py-1.5 text-center text-[11px] text-ink-2">{b ?? <Missing>not collected</Missing>}</td>)}</tr>
                </tbody>
              </table>
              {adGrid.brands.length === 0 && <p className="mt-2 text-[12.5px] text-muted">No ads recorded on this keyword.</p>}
            </Card>
            <Card className="mt-4 overflow-hidden">
              <div className="grid grid-cols-[minmax(180px,1.5fr)_1fr_1fr_1fr] border-b border-line px-5 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted"><span>Ads by brand, all keywords</span><span>Ad slots today</span><span>Ad keyword-days, 7 d</span><span>Unpaid top 10 today</span></div>
              <ShowAll n={12} more="brands" items={[...sov].filter((s) => s.ads || s.adDays).sort((a, b) => b.adDays - a.adDays || b.ads - a.ads)} render={(s) => {
                const mx = Math.max(1, ...sov.map((x) => x.adDays));
                return (
                  <div key={s.brand} className={`grid grid-cols-[minmax(180px,1.5fr)_1fr_1fr_1fr] items-center border-b border-line px-5 py-2 text-[13px] last:border-0 ${isAnchor(s.brand) ? "bg-page/70 font-semibold" : ""}`}>
                    <span className="flex items-center gap-2"><span>{s.brand}</span><span className="text-[11px] font-normal text-muted">{ORIGIN_LABEL[s.origin]}</span>{isFocus(s.brand) && <span className="rounded bg-sunken px-1 text-[10px] font-normal text-muted">focus</span>}</span>
                    <span className="tabular">{s.ads || <span className="text-muted">0</span>}</span>
                    <span className="flex items-center gap-2 pr-6 tabular"><b className="w-6">{s.adDays}</b><span className="h-1.5 flex-1 rounded-full bg-sunken"><span className="block h-1.5 rounded-full bg-[#eda100]" style={{ width: `${(s.adDays / mx) * 100}%` }} /></span></span>
                    <span className="tabular text-ink-2">{s.top10}</span>
                  </div>
                );
              }} />
            </Card>
          </ActionSection>

          <ActionSection id="suggest" kicker="What shoppers type" title={`Nykaa suggests ${new Set((sugg.data ?? []).filter((s) => s.kind !== "product").map((s) => s.suggestion)).size} search terms across ${suggestions.length} seeds as shoppers type.`}
            note="Autosuggest keywords and products for each seed, plus Nykaa's current popular searches. New terms here feed the tracked keyword list.">
            {!sugg.data ? <Loading what="suggestions" /> : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <ShowAll n={6} more="seeds" items={suggestions} render={([seed, ss]) => (
                  <Card key={seed || "popular"} className="p-4">
                    <div className="mb-2 text-[13px] font-semibold">{seed ? <>Typing &ldquo;{seed}&rdquo;</> : "Popular searches on Nykaa"}</div>
                    <div className="flex flex-wrap gap-1.5">{ss.filter((s) => s.kind !== "product").sort((a, b) => a.position - b.position).map((s) => <span key={`${s.kind}${s.position}`} className="rounded-full bg-sunken px-2.5 py-1 text-[12px] text-ink-2">{s.suggestion}</span>)}</div>
                    {ss.some((s) => s.kind === "product") && <div className="mt-3 text-[11.5px] text-muted">Suggested products: {ss.filter((s) => s.kind === "product").sort((a, b) => a.position - b.position).map((s) => s.suggestion.split(" ").slice(0, 3).join(" ")).join(" · ")}</div>}
                  </Card>
                )} />
              </div>
            )}
          </ActionSection>
        </>
      )}
    </Shell>
  );
}

export default function Page() {
  return <AuthGate><DemandPage /></AuthGate>;
}
