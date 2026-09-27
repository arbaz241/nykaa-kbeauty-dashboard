"use client";

import { Fragment, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import BrandPicker from "@/components/BrandPicker";
import LineChart from "@/components/LineChart";
import { eventsInWindow } from "@/components/EventLog";
import { useOpenProduct } from "@/components/ProductDrawer";
import Shell from "@/components/Shell";
import Sparkline from "@/components/Sparkline";
import { Card, Insight, Loading, PageHead, SectionHead } from "@/components/ui";
import { ANCHOR_BRAND, FOCUS_BRANDS, ORIGIN_LABEL, norm, resolveBrand } from "@/lib/brands";
import { useCatalog, useEvents, useReviewMonths, useShelf } from "@/lib/data";
import { compact, shortName } from "@/lib/format";
import { demandLines, momentumWord, monthsWindow } from "@/lib/metrics";
import { useBrandSelection } from "@/lib/selection";

const monthLabel = (m: string) => new Date(m).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

function Change({ g, vol }: { g: number | null; vol: number | null }) {
  const w = momentumWord(g, vol);
  if (g === null || vol === null) return <span className="text-[12px] text-muted">{w}</span>;
  const tone = w.startsWith("rising") ? "text-good" : w.startsWith("falling") ? "text-bad" : "text-ink-2";
  return <span className={`tabular ${tone}`}><b>{g > 0 ? "▲" : g < 0 ? "▼" : ""} {Math.abs(Math.round(g * 100))}%</b><span className="ml-2 text-[12px] font-normal text-muted">{w}</span></span>;
}

function DemandPage() {
  const months = useReviewMonths(); const shelf = useShelf(); const catalog = useCatalog(); const events = useEvents();
  const open = useOpenProduct();
  const data = useMemo(() => months.data ?? [], [months.data]);
  const known = useMemo(() => [...new Set(data.map((m) => m.brand))], [data]);
  const focus = useMemo(() => FOCUS_BRANDS.map((b) => resolveBrand(b, known) ?? b).filter((b) => known.includes(b)), [known]);
  const { selected, colors, toggle } = useBrandSelection(known);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [onlySelected, setOnlySelected] = useState(false);

  const brands = useMemo(() => demandLines(data, "brand"), [data]);
  const products = useMemo(() => demandLines(data, "product"), [data]);
  const origin = useMemo(() => { const m = new Map<string, string>(); (shelf.data ?? []).forEach((r) => m.set(r.brand, r.origin)); return m; }, [shelf.data]);
  const win = monthsWindow(12);
  const period = `${monthLabel(win[9])}–${monthLabel(win[11])} vs ${monthLabel(win[6])}–${monthLabel(win[8])}`;
  const sel = brands.filter((b) => selected.includes(b.brand) && b.last3 !== null);

  const insights = useMemo(() => {
    const valid = brands.filter((b) => b.growth !== null && (b.last3 ?? 0) >= 30);
    const out: React.ReactNode[] = [];
    if (valid.length) {
      const up = [...valid].sort((a, b) => b.growth! - a.growth!)[0]; const dn = [...valid].sort((a, b) => a.growth! - b.growth!)[0];
      out.push(<>Fastest-rising brand with real volume: <b>{up.brand}</b>, {Math.round(up.growth! * 100)}% more reviews in {period.split(" vs ")[0]} than the three months before.</>);
      out.push(<>Sharpest decline: <b>{dn.brand}</b>, {Math.round(dn.growth! * 100)}% over the same window.</>);
    }
    const anchor = brands.find((b) => norm(b.brand) === norm(ANCHOR_BRAND));
    if (anchor && anchor.last3 !== null) {
      const rank = brands.filter((b) => b.last3 !== null).findIndex((b) => b.brand === anchor.brand) + 1;
      out.push(<><b>{anchor.brand}</b> is {momentumWord(anchor.growth, anchor.last3)} ({anchor.growth !== null ? `${anchor.growth > 0 ? "+" : ""}${Math.round(anchor.growth * 100)}%` : "–"}), #{rank} of {brands.filter((b) => b.last3 !== null).length} tracked brands by recent review volume.</>);
    }
    const tp = products.filter((p) => p.last3 !== null)[0];
    if (tp) out.push(<>The single highest-demand product is <b>{tp.brand} {shortName(tp.label, tp.brand).slice(0, 48)}</b> with {compact(tp.last3)} reviews in three months.</>);
    return out;
  }, [brands, products, period]);

  const table = onlySelected ? brands.filter((b) => selected.includes(b.brand)) : brands;
  const maxLast3 = Math.max(1, ...table.map((b) => b.last3 ?? 0));
  const imgFor = (pid: string) => (shelf.data ?? []).find((r) => r.product_id === pid)?.image_url ?? (catalog.data ?? []).find((r) => r.product_id === pid)?.best_image ?? null;
  const shelfFor = (pid: string) => (shelf.data ?? []).find((r) => r.product_id === pid);

  return (
    <Shell active="Demand">
      <PageHead title="Demand" sub="Reviews are written at a steady rate by buyers, so monthly review volume on a brand's leading products tracks its sales momentum. Rising means more reviews in the last three complete months than in the three before." />
      <div className="mt-7 rounded-2xl bg-surface/70 p-4 ring-1 ring-line">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Brands on the chart</div>
        <BrandPicker focus={focus} all={brands.map((b) => ({ brand: b.brand, slots: b.last3 ?? 0 }))} selected={selected} colors={colors} onToggle={toggle} />
      </div>
      {!months.data ? <Loading what="review history" /> : (
        <>
          <section className="mt-8 grid gap-3 md:grid-cols-2">{insights.map((t, i) => <Insight key={i}>{t}</Insight>)}</section>

          <section className="mt-8">
            <SectionHead title="Monthly reviews" note={`Last 12 complete months for the selected brands. Hover for values. Period compared below: ${period}.`} />
            <Card className="p-5">
              {sel.length ? <LineChart labels={win.map(monthLabel)} series={sel.map((b) => ({ name: b.brand, color: colors[b.brand], values: b.spark }))} height={300} yLabel="reviews per month"
                markers={eventsInWindow(events.data, win).map((e) => ({
                  from: Math.max(0, win.findIndex((m) => m.slice(0, 7) === e.happened_on.slice(0, 7))),
                  to: e.ends_on ? win.findIndex((m) => m.slice(0, 7) === e.ends_on!.slice(0, 7)) : undefined,
                  label: e.label, color: e.color,
                })).filter((m) => m.from >= 0)} />
                : <p className="text-[13px] text-muted">None of the selected brands has review history yet.</p>}
            </Card>
          </section>

          <section className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <SectionHead title="Momentum by brand" note="Click a brand to see the products driving it; click a product for its full detail." />
              <label className="flex items-center gap-2 text-[13px] text-ink-2"><input type="checkbox" checked={onlySelected} onChange={(e) => setOnlySelected(e.target.checked)} className="accent-ink" />Selected brands only</label>
            </div>
            <Card className="overflow-hidden">
              <div className="grid grid-cols-[minmax(200px,1.4fr)_140px_1fr_120px_1.2fr] border-b border-line px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                <span>Brand</span><span>12 months</span><span>Reviews, last 3 mo</span><span className="text-right pr-6">Prior 3 mo</span><span>Change</span>
              </div>
              {table.map((b) => {
                const isOpen = expanded === b.brand; const ps = products.filter((p) => p.brand === b.brand);
                const c = colors[b.brand] ?? "#8a8880";
                return (
                  <Fragment key={b.brand}>
                    <button onClick={() => setExpanded(isOpen ? null : b.brand)} className={`grid w-full grid-cols-[minmax(200px,1.4fr)_140px_1fr_120px_1.2fr] items-center border-b border-line px-5 py-3 text-left transition hover:bg-page/70 ${isOpen ? "bg-page/70" : ""}`}>
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
            <p className="mt-3 text-[12px] leading-relaxed text-muted">Tracked products: each focus brand&apos;s five best-ranked products plus the leading products of the ten most visible brands. Nykaa serves about 1,000 reviews per product, so for big bestsellers only recent months are complete; earlier months are left blank rather than counted as zero, and such products are excluded from the 3-vs-3 comparison.</p>
          </section>
        </>
      )}
    </Shell>
  );
}

export default function Page() {
  return <AuthGate><DemandPage /></AuthGate>;
}
