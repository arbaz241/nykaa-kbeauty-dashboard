"use client";

import { useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { useOpenProduct } from "@/components/ProductDrawer";
import Shell from "@/components/Shell";
import { Card, Loading, PageHead, SectionHead, Stat } from "@/components/ui";
import { ANCHOR_BRAND, FOCUS_BRANDS, ORIGIN_LABEL, norm } from "@/lib/brands";
import { useCatalog, useSearchHistory, useShelf, useSuggestions } from "@/lib/data";
import { inr, shortName } from "@/lib/format";
import type { SearchRow } from "@/lib/types";

// Keep in sync with scraper/signals.py SEARCH_QUERIES
const CORE = ["korean skincare", "korean sunscreen", "korean serum", "korean moisturizer", "korean face wash", "korean toner", "korean sheet mask", "korean lip tint", "glass skin", "snail mucin", "cica", "rice toner", "centella", "niacinamide serum", "sunscreen for oily skin"];
const isFocus = (b: string) => FOCUS_BRANDS.some((f) => norm(f) === norm(b));
const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** Unpaid order from one sample per (day, query); ads counted across samples. */
function split(rows: SearchRow[]) {
  const minS = Math.min(...rows.map((r) => r.sample));
  const unpaid = rows.filter((r) => !r.is_ad && r.sample === minS).sort((a, b) => a.rank - b.rank);
  const ads = rows.filter((r) => r.is_ad).sort((a, b) => a.sample - b.sample || a.rank - b.rank);
  return { unpaid, ads };
}

function SearchPage() {
  const hist = useSearchHistory(); const sugg = useSuggestions(); const shelf = useShelf(); const catalog = useCatalog();
  const open = useOpenProduct();
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
    const week = new Set(days.slice(-7));
    const seen = new Set<string>();
    rows.filter((r) => r.is_ad && week.has(r.scrape_date)).forEach((r) => { const k = `${r.brand}|${r.scrape_date}|${r.query}`; if (!seen.has(k)) { seen.add(k); get(r.brand, r.origin).adDays++; } });
    return [...t.values()].sort((a, b) => b.top5 - a.top5 || b.top10 - a.top10 || b.ads - a.ads);
  }, [byKw, rows, days]);

  const cur = byKw.get(active) ? split(byKw.get(active)!) : { unpaid: [], ads: [] };
  const adGrid = useMemo(() => {
    const ds = days.slice(-10); const brands = new Map<string, Map<string, number>>();
    rows.filter((r) => r.query === active && r.is_ad && ds.includes(r.scrape_date)).forEach((r) => {
      const m = brands.get(r.brand) ?? new Map<string, number>(); m.set(r.scrape_date, (m.get(r.scrape_date) ?? 0) + 1); brands.set(r.brand, m);
    });
    const unpaid1 = ds.map((d) => { const rs = rows.filter((r) => r.query === active && r.scrape_date === d); return rs.length ? split(rs).unpaid[0]?.brand ?? null : null; });
    return { ds, brands: [...brands.entries()].sort((a, b) => [...b[1].values()].reduce((x, y) => x + y, 0) - [...a[1].values()].reduce((x, y) => x + y, 0)), unpaid1 };
  }, [rows, days, active]);

  const focusTop5 = sov.filter((s) => isFocus(s.brand)).reduce((a, s) => a + s.top5, 0);
  const totalTop5 = sov.reduce((a, s) => a + s.top5, 0);
  const focusAds = sov.filter((s) => isFocus(s.brand)).reduce((a, s) => a + s.ads, 0);
  const totalAds = sov.reduce((a, s) => a + s.ads, 0);
  const anchor = sov.find((s) => norm(s.brand) === norm(ANCHOR_BRAND));

  const img = (pid: string) => (shelf.data ?? []).find((r) => r.product_id === pid)?.image_url ?? (catalog.data ?? []).find((r) => r.product_id === pid)?.best_image ?? null;
  const Tile = ({ r, pos, paid }: { r: SearchRow; pos: number; paid?: boolean }) => (
    <button onClick={() => open({ product_id: r.product_id, name: r.name, brand: r.brand, image: img(r.product_id), price: r.price, url: `https://www.nykaa.com/search/result/?q=${encodeURIComponent(r.name)}` })}
      className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-page">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${paid ? "bg-[#fff4e5] text-[#8a5a00]" : "bg-ink text-white"}`}>{paid ? "AD" : pos}</span>
      <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-page ring-1 ring-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- Nykaa CDN image */}
        {img(r.product_id) ? <img src={img(r.product_id)!} alt="" className="h-10 w-10 object-contain" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-2">{r.brand}{isFocus(r.brand) && <span className="ml-1.5 rounded bg-sunken px-1 text-[10px] text-muted">focus</span>}</span>
        <span className="block truncate text-[13px] group-hover:underline">{shortName(r.name, r.brand)}</span>
      </span>
      <span className="text-[12.5px] text-ink-2 tabular">{inr(r.price)}</span>
    </button>
  );

  return (
    <Shell active="Search & Ads" asOf={latest ? day(latest) : undefined}>
      <PageHead title="Search & Ads" sub="Who shows up when shoppers search for K-beauty on Nykaa: the unpaid results everyone sees, and who is paying for the ad slots on each keyword." />
      {!hist.data ? <Loading what="search results" /> : (
        <>
          <section className="mt-8 grid gap-3 md:grid-cols-4">
            <Stat label="Keywords tracked" value={String(keywords.length)} sub={`${keywords.filter((k) => CORE.includes(k)).length} K-beauty terms · ${keywords.filter((k) => !CORE.includes(k)).length} from Nykaa suggestions`} />
            <Stat label="Focus brands' unpaid top-5 share" value={`${Math.round((focusTop5 / Math.max(1, totalTop5)) * 100)}%`} sub={`${focusTop5} of ${totalTop5} top-5 positions across all keywords`} />
            <Stat label="Focus brands' share of ad slots" value={`${Math.round((focusAds / Math.max(1, totalAds)) * 100)}%`} sub={`${focusAds} of ${totalAds} ad slots today`} />
            <Stat label={`${ANCHOR_BRAND} in search`} value={anchor ? `${anchor.top5} top-5` : "absent"} sub={anchor ? `${anchor.top10} top-10 positions · ${anchor.ads} ad slot${anchor.ads === 1 ? "" : "s"} today` : "no unpaid top-10 or ad placement today"} />
          </section>

          <section className="mt-10">
            <SectionHead title="Keyword explorer" note="Pick a keyword. Unpaid results are the same for every shopper; ads vary by time and location." />
            <div className="mb-4 flex flex-wrap gap-2">
              {keywords.map((k) => (
                <button key={k} onClick={() => setKw(k)} className={`rounded-full px-3.5 py-1.5 text-[13px] transition ${active === k ? "bg-ink font-medium text-white" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink"}`}>
                  {k}{!CORE.includes(k) && <span className={`ml-1.5 text-[10.5px] ${active === k ? "text-white/60" : "text-muted"}`}>suggested</span>}
                </button>
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
              <Card className="min-w-0 p-4">
                <div className="mb-1 px-2 text-[14px] font-semibold">Top 5 unpaid results</div>
                <div className="mb-2 px-2 text-[12px] text-muted">&ldquo;{active}&rdquo; · {day(latest)} · {cur.unpaid[0]?.total_found ? `${cur.unpaid[0].total_found} results on Nykaa` : "redirects to a category or brand page"}</div>
                {cur.unpaid.slice(0, 5).map((r, i) => <Tile key={r.product_id} r={r} pos={i + 1} />)}
              </Card>
              <Card className="min-w-0 p-4">
                <div className="mb-1 px-2 text-[14px] font-semibold">Paid slots today</div>
                <div className="mb-2 px-2 text-[12px] text-muted">{cur.ads.length ? `${cur.ads.length} AD tiles in the first 20 results` : "No ads on this keyword today"}</div>
                {cur.ads.slice(0, 6).map((r, i) => <Tile key={`${r.product_id}-${i}`} r={r} pos={i + 1} paid />)}
              </Card>
            </div>
            <Card className="mt-4 overflow-x-auto p-5">
              <div className="mb-1 text-[14px] font-semibold">Ad placements over time · &ldquo;{active}&rdquo;</div>
              <div className="mb-4 text-[12px] text-muted">Number of AD tiles each brand held per day. The last row shows the #1 unpaid result for comparison.</div>
              <table className="w-full min-w-[640px] text-[12.5px] tabular">
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
          </section>

          <section className="mt-10">
            <SectionHead title="Share of voice across all keywords" note="Unpaid top-5 and top-10 positions today, ad slots today, and keyword-days with an ad over the last 7 days." />
            <Card className="overflow-hidden">
              <div className="grid grid-cols-[minmax(180px,1.5fr)_1fr_1fr_1fr_1fr] border-b border-line px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"><span>Brand</span><span>Unpaid top 5</span><span>Unpaid top 10</span><span>Ad slots today</span><span>Ad keyword-days, 7d</span></div>
              {sov.slice(0, 18).map((s) => {
                const mx = Math.max(1, sov[0].top5);
                return (
                  <div key={s.brand} className={`grid grid-cols-[minmax(180px,1.5fr)_1fr_1fr_1fr_1fr] items-center border-b border-line px-5 py-2.5 text-[13.5px] last:border-0 ${isFocus(s.brand) ? "bg-page/60" : ""}`}>
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

          <section className="mt-10">
            <SectionHead title="What Nykaa suggests as shoppers type" note="Autosuggest keywords and products for each seed, plus Nykaa's current popular searches." />
            {!sugg.data ? <Loading what="suggestions" /> : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
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
          </section>
        </>
      )}
    </Shell>
  );
}

export default function Page() {
  return <AuthGate><SearchPage /></AuthGate>;
}
