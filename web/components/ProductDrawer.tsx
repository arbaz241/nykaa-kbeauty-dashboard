"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useProduct } from "@/lib/data";
import { CATEGORY_LABEL, compact, inr, shortName } from "@/lib/format";
import { monthsWindow } from "@/lib/metrics";
import LineChart from "./LineChart";

/** Minimal info a caller already has; the drawer fetches history on demand. */
export interface ProductRef {
  product_id: string; name: string; brand: string; url?: string | null; image?: string | null; price?: number | null; mrp?: number | null;
  rating?: number | null; rating_count?: number | null; usp?: string | null; concerns?: string[] | null; phrases?: { text: string; sentiment: string }[] | null;
  splitup?: Record<string, number> | null; madeIn?: string | null;
}

const Ctx = createContext<(p: ProductRef) => void>(() => {});
export const useOpenProduct = () => useContext(Ctx);

export function ProductDrawerProvider({ children }: { children: React.ReactNode }) {
  const [p, setP] = useState<ProductRef | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setP(null);
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <Ctx.Provider value={setP}>
      {children}
      {p && <Drawer p={p} onClose={() => setP(null)} />}
    </Ctx.Provider>
  );
}

function Drawer({ p, onClose }: { p: ProductRef; onClose: () => void }) {
  const { data, error } = useProduct(p.product_id);
  const win = monthsWindow(12);
  const monthly = useMemo(() => {
    const m = new Map((data?.months ?? []).filter((r) => r.month >= r.coverage_start).map((r) => [r.month, r.reviews]));
    const start = data?.months[0]?.coverage_start ?? "1900-01-01";
    return win.map((mo) => (data?.months.length && mo >= start ? m.get(mo) ?? 0 : null));
  }, [data, win]);
  const byCat = useMemo(() => {
    const g = new Map<string, typeof data extends undefined ? never : NonNullable<typeof data>["history"]>();
    (data?.history ?? []).forEach((h) => g.set(h.subcategory, [...(g.get(h.subcategory) ?? []), h]));
    return g;
  }, [data]);
  const days = [...new Set((data?.history ?? []).map((h) => h.scrape_date))].sort();
  const priceSeries = days.map((d) => (data?.history ?? []).find((h) => h.scrape_date === d)?.price ?? null);
  const tot = p.splitup ? Object.values(p.splitup).reduce((a, b) => a + b, 0) || 1 : 1;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[720px] overflow-y-auto bg-page shadow-pop">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-page/90 px-7 py-3 backdrop-blur">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Product</span>
          <button onClick={onClose} className="rounded-lg px-2.5 py-1 text-[13px] text-ink-2 ring-1 ring-line hover:bg-surface">Close · Esc</button>
        </div>
        <div className="px-7 py-6">
          <div className="flex gap-6">
            <div className="grid h-40 w-40 shrink-0 place-items-center rounded-2xl bg-surface ring-1 ring-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- images served by Nykaa's CDN */}
              {p.image ? <img src={p.image} alt="" className="h-[85%] w-[85%] object-contain" /> : <span className="text-[12px] text-muted">No image</span>}
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{p.brand}{p.madeIn ? ` · Made in ${p.madeIn}` : ""}</div>
              <h3 className="mt-1 font-display text-[22px] font-semibold leading-snug tracking-tight">{shortName(p.name, p.brand)}</h3>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[14px] tabular">
                {p.price != null && <span><b className="text-[18px]">{inr(p.price)}</b>{p.mrp && p.price && p.mrp > p.price ? <span className="ml-1.5 text-muted line-through">{inr(p.mrp)}</span> : null}</span>}
                {p.rating != null && <span>★ {p.rating.toFixed(1)} <span className="text-muted">· {compact(p.rating_count)} ratings</span></span>}
              </div>
              {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-lg bg-ink px-3.5 py-2 text-[13px] font-medium text-white hover:opacity-90">Open on Nykaa ↗</a>}
            </div>
          </div>
          {p.usp && <p className="mt-6 text-[14.5px] leading-relaxed">{p.usp}</p>}

          {error && <p className="mt-6 text-[13px] text-bad">Could not load history: {String(error.message)}</p>}

          <Block title="Demand: reviews per month" note="Last 12 complete months. Months before the product's reliable history are blank.">
            {monthly.some((v) => v !== null) ? <LineChart labels={win.map((m) => new Date(m).toLocaleDateString("en-IN", { month: "short", year: "2-digit" }))} series={[{ name: "Reviews", color: "#2a78d6", values: monthly }]} height={200} />
              : <p className="text-[13px] text-muted">{data ? "This product is not in the review-history set (tracked for the focus brands' leading products and the most visible competitors)." : "Loading…"}</p>}
          </Block>

          <Block title="Rank on the shelf" note="Daily position in each category's top 100 (1 = top). Gaps are days it was outside the top 100.">
            {byCat.size ? <LineChart labels={days.map((d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }))} invert height={200}
              series={[...byCat.entries()].map(([cat, hs], i) => ({ name: CATEGORY_LABEL[cat] ?? "Korean store", color: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"][i % 4], values: days.map((d) => hs.find((h) => h.scrape_date === d)?.rank ?? null) }))} />
              : <p className="text-[13px] text-muted">{data ? "Not in any tracked top 100 during the collected period." : "Loading…"}</p>}
          </Block>

          {priceSeries.some((v) => v !== null) && (
            <Block title="Selling price" note="As listed on each collection day.">
              <LineChart labels={days.map((d) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" }))} series={[{ name: "Price", color: "#121211", values: priceSeries }]} height={160} format={(v) => inr(v)} />
            </Block>
          )}

          {p.splitup && (
            <Block title="Star split" note="Share of all ratings.">
              {["5", "4", "3", "2", "1"].map((k) => (
                <div key={k} className="flex items-center gap-3 py-0.5 text-[12px] text-muted tabular">
                  <span className="w-3">{k}★</span><div className="h-2 flex-1 rounded-full bg-sunken"><div className="h-2 rounded-full bg-ink" style={{ width: `${((p.splitup![k] ?? 0) / tot) * 100}%`, opacity: Number(k) >= 4 ? 1 : 0.45 }} /></div>
                  <span className="w-10 text-right">{Math.round(((p.splitup![k] ?? 0) / tot) * 100)}%</span>
                </div>
              ))}
            </Block>
          )}

          {!!p.phrases?.length && (
            <Block title="What shoppers say" note="Review themes Nykaa extracts from this product's reviews.">
              <div className="flex flex-wrap gap-1.5">{p.phrases.map((ph) => <span key={ph.text} className={`rounded-full px-2.5 py-1 text-[12px] ${ph.sentiment === "Positive" ? "bg-[#eaf6ee] text-good" : "bg-[#fbecea] text-bad"}`}>{ph.text}</span>)}</div>
            </Block>
          )}

          {!!data?.aspects.length && (
            <Block title="What reviewers single out" note="Nykaa asks reviewers to tag what stood out, with a sentiment. Share of mentions that were positive, most-mentioned first.">
              <div className="space-y-2">{data.aspects.slice(0, 8).map((a) => {
                const pct = Math.round((a.positive / a.total) * 100);
                return (
                  <div key={a.label} className="flex items-center gap-3">
                    <div className="w-40 shrink-0 truncate text-[13px] text-ink-2" title={a.label}>{a.label}</div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface ring-1 ring-line">
                      <div className="h-full rounded-full bg-good" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-24 shrink-0 text-right text-[12px] tabular-nums text-muted">{pct}% of {a.total}</div>
                  </div>
                );
              })}</div>
            </Block>
          )}

          {!!data?.texts.length && (
            <Block title="Recent reviews" note="Latest reviews collected for this product.">
              <div className="space-y-3">{data.texts.slice(0, 6).map((t) => (
                <div key={t.review_id} className="rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
                  <div className="flex items-center justify-between text-[12px] text-muted"><span>{"★".repeat(t.rating ?? 0)}{t.is_buyer ? " · verified buyer" : ""}{t.images ? ` · ${t.images} photo${t.images > 1 ? "s" : ""}` : ""}{t.likes ? ` · ${t.likes} found helpful` : ""}</span><span>{new Date(t.created_on).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span></div>
                  {t.title && <div className="mt-1 text-[13.5px] font-medium">{t.title}</div>}
                  {t.body && <div className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{t.body.slice(0, 280)}{t.body.length > 280 ? "…" : ""}</div>}
                </div>
              ))}</div>
            </Block>
          )}
        </div>
      </aside>
    </div>
  );
}

function Block({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mt-7 rounded-2xl bg-surface p-5 ring-1 ring-line">
      <div className="mb-3"><div className="text-[14px] font-semibold">{title}</div><div className="text-[12px] text-muted">{note}</div></div>
      {children}
    </section>
  );
}
