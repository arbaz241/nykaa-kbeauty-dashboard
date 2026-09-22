"use client";

import { useState } from "react";
import { compact, inr, shortName } from "@/lib/format";
import { perMl } from "@/lib/metrics";
import type { ShelfRow } from "@/lib/types";
import { useOpenProduct } from "./ProductDrawer";

/** rank is null for catalogue products that are not in the category's top 100 */
export type CompareRow = Omit<ShelfRow, "rank"> & { rank: number | null; image_url: string | null };
type Pick = { brand: string; product: CompareRow | null; options: CompareRow[] };

const nykaa = (r: CompareRow) => r.url ?? `https://www.nykaa.com/search/result/?q=${encodeURIComponent(r.name)}`;

function StarBars({ split }: { split: Record<string, number> | null }) {
  if (!split) return <span className="text-muted">–</span>;
  const tot = Object.values(split).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="space-y-1">
      {["5", "4", "3", "2", "1"].map((k) => (
        <div key={k} className="flex items-center gap-2 text-[11px] text-muted tabular">
          <span className="w-3">{k}</span>
          <div className="h-1.5 flex-1 rounded-full bg-sunken"><div className="h-1.5 rounded-full" style={{ width: `${((split[k] ?? 0) / tot) * 100}%`, background: Number(k) >= 4 ? "#121211" : Number(k) === 3 ? "#8a8880" : "#c0352b" }} /></div>
          <span className="w-9 text-right">{Math.round(((split[k] ?? 0) / tot) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

function Tags({ items, tone }: { items: string[] | null | undefined; tone?: "pos" | "neg" }) {
  if (!items?.length) return <span className="text-[12.5px] text-muted">Not listed on Nykaa</span>;
  const cls = tone === "pos" ? "bg-[#eaf6ee] text-good" : tone === "neg" ? "bg-[#fbecea] text-bad" : "bg-sunken text-ink-2";
  return <div className="flex flex-wrap gap-1.5">{items.map((t) => <span key={t} className={`rounded-full px-2.5 py-1 text-[12px] ${cls}`}>{t}</span>)}</div>;
}

function Chooser({ pick, onChoose }: { pick: Pick; onChoose: (r: CompareRow) => void }) {
  const [open, setOpen] = useState(false);
  if (pick.options.length < 2) return null;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="rounded-full px-2.5 py-1 text-[11.5px] text-ink-2 ring-1 ring-line hover:bg-sunken">{pick.options.length} products · change ▾</button>
      {open && (
        <div className="absolute right-0 top-8 z-20 max-h-80 w-72 overflow-auto rounded-xl bg-surface shadow-pop ring-1 ring-line">
          {pick.options.map((o) => (
            <button key={o.product_id} onClick={() => { onChoose(o); setOpen(false); }}
              className={`flex w-full items-start gap-2 px-3.5 py-2.5 text-left text-[12.5px] hover:bg-sunken ${o.product_id === pick.product?.product_id ? "bg-sunken" : ""}`}>
              <span className="mt-0.5 w-9 shrink-0 text-muted tabular">{o.rank ? `#${o.rank}` : "—"}</span>
              <span className="flex-1">{shortName(o.name, o.brand)}</span>
              <span className="text-muted tabular">{inr(o.price)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProductCompare({ picks, colors, asOf, onChoose }: { picks: Pick[]; colors: Record<string, string>; asOf: Date; onChoose: (brand: string, r: CompareRow) => void }) {
  const open = useOpenProduct();
  const cols = `180px repeat(${picks.length}, minmax(0, 1fr))`;
  const live = picks.map((p) => p.product).filter((p): p is CompareRow => !!p);
  const bestOf = (f: (r: CompareRow) => number | null, dir: "high" | "low") => {
    const v = live.map(f).filter((x): x is number => x !== null);
    return v.length > 1 ? (dir === "high" ? Math.max(...v) : Math.min(...v)) : null;
  };
  const bests = { rank: bestOf((r) => r.rank, "low"), rating: bestOf((r) => r.rating, "high"), ratings: bestOf((r) => r.rating_count, "high"), perMl: bestOf((r) => perMl(r as ShelfRow), "low"), price: bestOf((r) => r.price, "low") };
  const Lead = ({ on }: { on: boolean }) => (on ? <span className="ml-2 rounded-full bg-ink px-1.5 py-px align-middle text-[10px] font-semibold uppercase tracking-wide text-white">lead</span> : null);

  const rows: { label: string; render: (r: CompareRow) => React.ReactNode }[] = [
    { label: "Price", render: (r) => <div><span className="font-display text-[22px] font-semibold tabular">{inr(r.price)}</span>{r.mrp && r.price && r.mrp > r.price ? <span className="ml-2 text-[12.5px] text-muted line-through">{inr(r.mrp)}</span> : null}<Lead on={r.price === bests.price} />
      <div className="mt-1 text-[12.5px] text-ink-2">{r.discount_pct ? `${Math.round(r.discount_pct)}% off MRP` : "No discount"}</div></div> },
    { label: "Offer", render: (r) => <span className="text-[13px]">{r.has_offer ? (r.offer_message ?? "Offer available") : <span className="text-muted">None</span>}</span> },
    { label: "Price per ml", render: (r) => { const v = perMl(r as ShelfRow); return <span className="text-[14px] tabular">{v ? `₹${v.toFixed(1)}` : "–"}<span className="ml-2 text-[12px] text-muted">{r.pack_size ?? ""}</span><Lead on={v !== null && v === bests.perMl} /></span>; } },
    { label: "Rank", render: (r) => r.rank === null ? <span className="text-[13px] text-muted">Not in this category&apos;s top 100</span> : <span className="text-[14px] tabular">#{r.rank} <span className="text-[12px] text-muted">of 100</span>{(r.is_ad || r.is_pinned) && <span className="ml-2 rounded-full bg-[#fff4e5] px-2 py-0.5 text-[11px] text-[#8a5a00]">paid slot</span>}<Lead on={r.rank === bests.rank} /></span> },
    { label: "Rating", render: (r) => <div><span className="text-[14px] tabular">★ {r.rating?.toFixed(1) ?? "–"}</span><span className="ml-2 text-[12px] text-muted">{compact(r.rating_count)} ratings{r.detail_review_count ? ` · ${compact(r.detail_review_count)} reviews` : ""}</span><Lead on={r.rating === bests.rating} /><div className="mt-2"><StarBars split={r.review_splitup} /></div></div> },
    { label: "What it is", render: (r) => <span className="text-[13px] leading-relaxed">{r.usp_summary ?? <span className="text-muted">No summary on Nykaa</span>}</span> },
    { label: "Claims", render: (r) => r.usp_points?.length ? <ul className="list-disc space-y-1 pl-4 text-[12.5px] leading-relaxed text-ink-2">{r.usp_points.map((p) => <li key={p}>{p}</li>)}</ul> : <span className="text-[12.5px] text-muted">Not listed on Nykaa</span> },
    { label: "Targets", render: (r) => <Tags items={r.concerns} /> },
    { label: "Key ingredients", render: (r) => <Tags items={r.key_ingredients?.slice(0, 6)} /> },
    { label: "Shoppers praise", render: (r) => <Tags items={(r.review_key_phrases ?? []).filter((p) => p.sentiment === "Positive").map((p) => p.text).slice(0, 6)} tone="pos" /> },
    { label: "Shoppers criticise", render: (r) => <Tags items={(r.review_key_phrases ?? []).filter((p) => p.sentiment === "Negative").map((p) => p.text).slice(0, 5)} tone="neg" /> },
    { label: "Details", render: (r) => <div className="space-y-0.5 text-[12.5px] text-ink-2">
      <div>{[r.formulation, r.country_name ? `Made in ${r.country_name}` : null].filter(Boolean).join(" · ") || "–"}</div>
      {r.skin_types?.length ? <div>Skin: {r.skin_types.join(", ")}</div> : null}
      {r.first_review_date ? <div>On Nykaa since {new Date(r.first_review_date).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</div> : null}
    </div> },
  ];

  return (
    <div className="overflow-x-auto rounded-2xl bg-surface shadow-card ring-1 ring-line">
      <div className="min-w-[860px]">
        <div className="grid border-b border-line" style={{ gridTemplateColumns: cols }}>
          <div className="px-5 py-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">As of {asOf.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
          {picks.map((p) => (
            <div key={p.brand} className="border-l border-line px-5 py-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: colors[p.brand] }} /><span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-2">{p.brand}</span></div>
                <Chooser pick={p} onChoose={(r) => onChoose(p.brand, r)} />
              </div>
              {p.product ? (
                <a href={nykaa(p.product)} target="_blank" rel="noreferrer" className="group block">
                  <div className="grid aspect-square place-items-center overflow-hidden rounded-xl bg-page">
                    {/* eslint-disable-next-line @next/next/no-img-element -- static export: images come straight from Nykaa's CDN */}
                    {p.product.image_url ? <img src={p.product.image_url} alt="" className="h-[82%] w-[82%] object-contain transition duration-300 group-hover:scale-[1.04]" /> : <span className="text-[12px] text-muted">No image</span>}
                  </div>
                  <div className="mt-3 text-[14.5px] font-medium leading-snug group-hover:underline">{shortName(p.product.name, p.brand)}</div>
                  <div className="mt-1 text-[12px] text-muted">View on Nykaa ↗</div>
                </a>
              ) : null}
              {p.product ? (
                <button onClick={() => open({ product_id: p.product!.product_id, name: p.product!.name, brand: p.brand, url: nykaa(p.product!), image: p.product!.image_url, price: p.product!.price, mrp: p.product!.mrp,
                  rating: p.product!.rating, rating_count: p.product!.rating_count, usp: p.product!.usp_summary, phrases: p.product!.review_key_phrases, splitup: p.product!.review_splitup, madeIn: p.product!.country_name })}
                  className="mt-2 rounded-lg px-2.5 py-1 text-[12px] text-ink-2 ring-1 ring-line hover:bg-sunken">Demand, rank &amp; reviews →</button>
              ) : (
                <div className="grid aspect-square place-items-center rounded-xl bg-page px-6 text-center text-[12.5px] text-muted">{p.brand} has no product in this category on Nykaa</div>
              )}
            </div>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row.label} className="grid border-b border-line last:border-0 hover:bg-page/50" style={{ gridTemplateColumns: cols }}>
            <div className="px-5 py-3.5 text-[13px] text-ink-2">{row.label}</div>
            {picks.map((p) => <div key={p.brand} className="border-l border-line px-5 py-3.5">{p.product ? row.render(p.product) : <span className="text-[12px] text-muted">—</span>}</div>)}
          </div>
        ))}
      </div>
    </div>
  );
}

export type { Pick };
