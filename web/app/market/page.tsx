"use client";

import { useMemo } from "react";
import AuthGate from "@/components/AuthGate";
import BrandPicker from "@/components/BrandPicker";
import LineChart from "@/components/LineChart";
import { useOpenProduct, type ProductRef } from "@/components/ProductDrawer";
import Shell from "@/components/Shell";
import { Card, Insight, Loading, PageHead, SectionHead, Stat } from "@/components/ui";
import { ANCHOR_BRAND, FOCUS_BRANDS, ORIGIN_LABEL, norm, resolveBrand } from "@/lib/brands";
import { useBrandDaily, useKoreanStore, useShareDaily, useShelf, useShelfDays } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL, compact, inr, median, shortName } from "@/lib/format";
import { useBrandSelection } from "@/lib/selection";
import type { ShelfRow } from "@/lib/types";

const ORIGINS = ["kbeauty", "local", "global", "unknown"] as const;
const OC: Record<string, string> = { kbeauty: "#2a78d6", local: "#eb6834", global: "#1baf7a", unknown: "#c9c7bf" };
const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const isFocus = (b: string) => FOCUS_BRANDS.some((f) => norm(f) === norm(b));
const ref = (r: ShelfRow): ProductRef => ({ product_id: r.product_id, name: r.name, brand: r.brand, url: r.url, image: r.image_url, price: r.price, mrp: r.mrp, rating: r.rating, rating_count: r.rating_count, usp: r.usp_summary, phrases: r.review_key_phrases, splitup: r.review_splitup, madeIn: r.country_name });

function MarketPage() {
  const shelf = useShelf(); const share = useShareDaily(); const bd = useBrandDaily(); const kstore = useKoreanStore();
  const open = useOpenProduct();
  const rows = useMemo(() => shelf.data ?? [], [shelf.data]);
  const days = useMemo(() => [...new Set((share.data ?? []).map((s) => s.scrape_date))].sort(), [share.data]);
  const first = days[0]; const last = days[days.length - 1];
  const moversData = useShelfDays(first && last && first !== last ? [first, last] : []);
  const known = useMemo(() => [...new Set((bd.data ?? []).map((r) => r.brand))], [bd.data]);
  const focus = useMemo(() => FOCUS_BRANDS.map((b) => resolveBrand(b, known) ?? b).filter((b) => known.includes(b)), [known]);
  const { selected, colors, toggle } = useBrandSelection(known);

  const shareOn = (d: string, sub?: string) => {
    const s = (share.data ?? []).filter((x) => x.scrape_date === d && (!sub || x.subcategory === sub));
    const tot = s.reduce((a, x) => a + Number(x.slots), 0) || 1;
    return Object.fromEntries(ORIGINS.map((o) => [o, s.filter((x) => x.origin === o).reduce((a, x) => a + Number(x.slots), 0) / tot])) as Record<string, number>;
  };
  const kNow = last ? shareOn(last).kbeauty : 0; const kFirst = first ? shareOn(first).kbeauty : 0;
  const focusSlots = rows.filter((r) => isFocus(r.brand)).length;

  const brandSeries = useMemo(() => selected.map((b) => ({ name: b, color: colors[b], values: days.map((d) => {
    const v = (bd.data ?? []).filter((r) => r.brand === b && r.scrape_date === d && r.subcategory !== "kbeauty_store").reduce((a, r) => a + Number(r.slots), 0);
    return v; }) })), [selected, colors, days, bd.data]);

  const launches = useMemo(() => {
    if (!last) return [];
    const now = new Date(last).getTime();   // ages are measured from the latest collection day
    return rows.filter((r) => r.first_review_date && now - new Date(r.first_review_date).getTime() <= 90 * 864e5)
      .map((r) => ({ r, perDay: (r.rating_count ?? 0) / Math.max(1, (now - new Date(r.first_review_date!).getTime()) / 864e5) }))
      .sort((a, b) => b.perDay - a.perDay);
  }, [rows, last]);

  const movers = useMemo(() => {
    const d = moversData.data ?? []; if (!d.length) return { up: [], down: [] };
    const a = new Map(d.filter((x) => x.scrape_date === first).map((x) => [`${x.subcategory}|${x.product_id}`, x.rank]));
    const cur = rows.map((r) => ({ r, from: a.get(`${r.subcategory}|${r.product_id}`) })).filter((x) => x.from !== undefined).map((x) => ({ ...x, change: x.from! - x.r.rank }));
    return { up: [...cur].sort((x, y) => y.change - x.change).slice(0, 8), down: [...cur].sort((x, y) => x.change - y.change).slice(0, 8) };
  }, [moversData.data, rows, first]);

  const storeLeaders = useMemo(() => {
    const k = kstore.data ?? []; const m = new Map<string, ShelfRow[]>(); k.forEach((r) => m.set(r.brand, [...(m.get(r.brand) ?? []), r]));
    return [...m.entries()].map(([b, rs]) => ({ b, n: rs.length, best: Math.min(...rs.map((r) => r.rank)), price: median(rs.map((r) => r.price ?? 0)), top: rs.sort((x, y) => x.rank - y.rank)[0] })).sort((a, b) => b.n - a.n || a.best - b.best).slice(0, 10);
  }, [kstore.data]);

  const ready = shelf.data && share.data && bd.data;
  return (
    <Shell active="Market" asOf={last ? day(last) : undefined}>
      <PageHead title="Market" sub={`The Nykaa shelf across ${CATEGORIES.length} categories: who holds the top-100 positions, how that is moving day by day, which products are climbing, and which launches are catching on.`} />
      {!ready ? <Loading what="market data" /> : (
        <>
          <section className="mt-8 grid gap-3 md:grid-cols-4">
            <Stat label="K-beauty share of the shelf" value={`${(kNow * 100).toFixed(1)}%`} sub={days.length > 1 ? `${kNow >= kFirst ? "▲" : "▼"} ${Math.abs((kNow - kFirst) * 100).toFixed(1)} pts since ${day(first)} · ${days.length} days tracked` : "first day of data"} />
            <Stat label="Focus brands' listings" value={String(focusSlots)} sub={`${((focusSlots / Math.max(1, rows.length)) * 100).toFixed(1)}% of all top-100 slots`} />
            <Stat label="Launches on the shelf" value={String(launches.length)} sub={`first reviewed in the last 90 days · ${launches.filter((l) => l.r.origin === "kbeauty").length} K-beauty`} />
            <Stat label="Korean store leader" value={storeLeaders[0]?.b ?? "–"} sub={storeLeaders[0] ? `${storeLeaders[0].n} of the store's top 100 · best #${storeLeaders[0].best}` : ""} />
          </section>

          <section className="mt-10">
            <SectionHead title="Who holds the shelf" note={`Share of each category's top-100 slots by brand origin, ${day(last)}. Top 20 is where most clicks land.`} />
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap gap-4 text-[12.5px] text-ink-2">{ORIGINS.map((o) => <span key={o} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: OC[o] }} />{ORIGIN_LABEL[o]}</span>)}</div>
              <div className="space-y-2.5">
                {CATEGORIES.map((c) => {
                  const s = shareOn(last, c); const t20 = (share.data ?? []).filter((x) => x.scrape_date === last && x.subcategory === c);
                  const k20 = t20.filter((x) => x.origin === "kbeauty").reduce((a, x) => a + Number(x.top20), 0) / Math.max(1, t20.reduce((a, x) => a + Number(x.top20), 0));
                  return (
                    <div key={c} className="grid grid-cols-[130px_1fr_150px] items-center gap-4">
                      <span className="text-[13.5px] font-medium">{CATEGORY_LABEL[c]}</span>
                      <div className="flex h-7 overflow-hidden rounded-lg bg-sunken">
                        {ORIGINS.map((o) => s[o] > 0 && <div key={o} title={`${ORIGIN_LABEL[o]} ${(s[o] * 100).toFixed(0)}%`} className="flex items-center justify-center text-[11.5px] font-semibold text-white" style={{ width: `${s[o] * 100}%`, background: OC[o], borderRight: "2px solid #fff" }}>{s[o] >= 0.07 ? `${Math.round(s[o] * 100)}%` : ""}</div>)}
                      </div>
                      <span className="text-[12.5px] text-ink-2 tabular">K-beauty in top 20: <b>{Math.round(k20 * 100)}%</b></span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>

          <section className="mt-10">
            <SectionHead title="Focus brands on the shelf, day by day" note="Total top-100 listings across the seven categories. Hover for values." />
            <div className="mb-3 rounded-2xl bg-surface/70 p-4 ring-1 ring-line"><BrandPicker focus={focus} all={known.map((b) => ({ brand: b, slots: rows.filter((r) => r.brand === b).length }))} selected={selected} colors={colors} onToggle={toggle} /></div>
            <Card className="p-5">{days.length > 1 ? <LineChart labels={days.map(day)} series={brandSeries} height={260} yLabel="top-100 listings" /> : <p className="text-[13px] text-muted">Trends appear after a second day of data.</p>}</Card>
          </section>

          {days.length > 1 && (
            <section className="mt-10">
              <SectionHead title="Biggest movers" note={`Rank change between ${day(first)} and ${day(last)}. Click a product for its detail.`} />
              <div className="grid gap-4 lg:grid-cols-2">
                {([["Climbing", movers.up], ["Falling", movers.down]] as const).map(([title, list]) => (
                  <Card key={title} className="p-4">
                    <div className="mb-2 px-2 text-[14px] font-semibold">{title}</div>
                    {!moversData.data ? <p className="px-2 text-[12.5px] text-muted">Loading…</p> : list.map(({ r, from, change }) => (
                      <button key={`${r.subcategory}${r.product_id}`} onClick={() => open(ref(r))} className="grid w-full grid-cols-[1fr_auto_70px] items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-page">
                        <span className="min-w-0"><span className="block text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-2">{r.brand} · {CATEGORY_LABEL[r.subcategory]}</span><span className="block truncate text-[13px]">{shortName(r.name, r.brand)}</span></span>
                        <span className="text-[12.5px] text-muted tabular">#{from} → <b className="text-ink">#{r.rank}</b></span>
                        <span className={`text-right text-[13px] font-semibold tabular ${change > 0 ? "text-good" : "text-bad"}`}>{change > 0 ? "▲" : "▼"} {Math.abs(change)}</span>
                      </button>
                    ))}
                  </Card>
                ))}
              </div>
            </section>
          )}

          <section className="mt-10 grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            <div>
              <SectionHead title="Inside Nykaa's Korean Beauty store" note="Top-100 of the storefront K-beauty shoppers browse." />
              <Card className="p-4">
                {storeLeaders.map((s) => (
                  <button key={s.b} onClick={() => open(ref(s.top))} className="grid w-full grid-cols-[1fr_130px_60px] items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-page">
                    <span className="text-[13.5px] font-medium">{s.b}{isFocus(s.b) && <span className="ml-1.5 rounded bg-sunken px-1 text-[10px] font-normal text-muted">focus</span>}</span>
                    <span className="h-1.5 rounded-full bg-sunken"><span className="block h-1.5 rounded-full" style={{ width: `${(s.n / storeLeaders[0].n) * 100}%`, background: "#2a78d6" }} /></span>
                    <span className="text-right text-[12.5px] tabular"><b>{s.n}</b> <span className="text-muted">#{s.best}</span></span>
                  </button>
                ))}
              </Card>
            </div>
            <div>
              <SectionHead title="Launches catching on" note="First reviewed in the last 90 days and already in a top 100, ranked by ratings gained per day." />
              <Card className="p-4">
                {launches.slice(0, 10).map(({ r, perDay }) => (
                  <button key={`${r.subcategory}${r.product_id}`} onClick={() => open(ref(r))} className="grid w-full grid-cols-[44px_1fr_90px_70px] items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-page">
                    <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg bg-page ring-1 ring-line">
                      {/* eslint-disable-next-line @next/next/no-img-element -- Nykaa CDN image */}
                      {r.image_url ? <img src={r.image_url} alt="" className="h-8 w-8 object-contain" /> : null}
                    </span>
                    <span className="min-w-0"><span className="block text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-2">{r.brand} · {ORIGIN_LABEL[r.origin]}</span><span className="block truncate text-[13px]">{shortName(r.name, r.brand)}</span></span>
                    <span className="text-[12px] text-muted tabular">#{r.rank} {CATEGORY_LABEL[r.subcategory]} · {inr(r.price)}</span>
                    <span className="text-right text-[13px] tabular"><b>{perDay.toFixed(1)}</b><span className="text-[11px] text-muted">/day</span></span>
                  </button>
                ))}
              </Card>
            </div>
          </section>

          <section className="mt-10 grid gap-3 md:grid-cols-2">
            <Insight><b>{ANCHOR_BRAND}</b> holds {rows.filter((r) => norm(r.brand) === norm(ANCHOR_BRAND)).length} top-100 listings today, best rank #{Math.min(...rows.filter((r) => norm(r.brand) === norm(ANCHOR_BRAND)).map((r) => r.rank), 999)}. Its ratings on listed products total {compact(rows.filter((r) => norm(r.brand) === norm(ANCHOR_BRAND)).reduce((a, r) => a + (r.rating_count ?? 0), 0))}.</Insight>
            <Insight>Of the {storeLeaders.length} brands leading Nykaa&apos;s Korean store, {storeLeaders.filter((s) => isFocus(s.b)).length} are in your focus set; the store&apos;s top three brands hold {storeLeaders.slice(0, 3).reduce((a, s) => a + s.n, 0)} of its 100 slots.</Insight>
          </section>
        </>
      )}
    </Shell>
  );
}

export default function Page() {
  return <AuthGate><MarketPage /></AuthGate>;
}
