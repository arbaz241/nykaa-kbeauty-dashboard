"use client";

import CompareGrid, { Chip, type ExtraRow, type GridCol } from "@/components/CompareGrid";
import { useOpenProduct } from "@/components/ProductDrawer";
import { ActionSection, Finding } from "@/components/Report";
import Sparkline from "@/components/Sparkline";
import { Card } from "@/components/ui";
import { strongestWeakest, standings, type Criterion, type Standing } from "@/lib/compete";
import { ROLE_LABEL, shortTitle, type BrandFacts, type ProductFacts, type ProductOption } from "@/lib/competeData";
import { CATEGORY_LABEL, compact, inr, signed } from "@/lib/format";
import type { UspComparison } from "@/lib/usp";

/* ---------------------------------------------------------------- product measures (one set, by pillar) */

export const PRODUCT_CRITERIA: Criterion<ProductFacts>[] = [
  { key: "price", label: "Price", help: "Selling price today", better: null, value: (p) => p.price, show: (p) => inr(p.price),
    sub: (p) => [p.mrp && p.price && p.mrp > p.price ? `MRP ${inr(p.mrp)}` : null, p.priceNote].filter(Boolean).join(" · ") || null },
  { key: "per100", label: "Price per 100 ml/g", help: "Where the pack size is known", better: null, value: (p) => p.perHundred, show: (p) => (p.perHundred ? `₹${Math.round(p.perHundred)}` : "–"), sub: (p) => p.pack },
  { key: "discount", label: "Discount", help: "% off MRP today", better: null, value: (p) => p.discount, show: (p) => (p.discount ? `${Math.round(p.discount)}%` : "none") },
  { key: "rank", label: "Shelf rank", help: "Position in this category's top 100 today (1 = top)", better: "low", value: (p) => p.rank ?? 101, show: (p) => (p.rank ? `#${p.rank}` : "Not in top 100"), sub: (p) => (p.paid ? "paid slot" : null) },
  { key: "rank7", label: "Rank 7 days ago", help: "Movement over the last week", better: null, value: (p) => p.rank7, show: (p) => (p.rank7 ? `#${p.rank7}` : "–"),
    sub: (p) => (p.gain7 ? `${p.gain7 > 0 ? "▲" : "▼"} ${Math.abs(p.gain7)} places${p.rank14 ? ` · 14 d ago #${p.rank14}` : ""}` : p.rank14 ? `14 d ago #${p.rank14}` : null) },
  { key: "rating", label: "Rating", help: "Nykaa star rating", better: "high", value: (p) => p.rating, show: (p) => (p.rating ? `★ ${p.rating.toFixed(1)}` : "–") },
  { key: "ratings", label: "Ratings", help: "Number of star ratings (lifetime popularity)", better: "high", value: (p) => p.ratings, show: (p) => compact(p.ratings), bar: true,
    sub: (p) => (p.reviewsTotal ? `${compact(p.reviewsTotal)} written reviews` : null) },
  { key: "demand", label: "Reviews, last 3 mo", help: "Dated reviews in the last 3 complete months: a proxy for recent sales", better: "high", value: (p) => p.recent, show: (p) => (p.recent === null ? "–" : compact(p.recent)), bar: true, sub: (p) => (p.recent === null ? "not tracked" : null) },
  { key: "momentum", label: "Momentum", help: "Reviews in the last 3 months vs the 3 before", better: "high", value: (p) => p.momentum, show: (p) => (p.momentum === null ? "–" : signed(p.momentum)) },
  { key: "search", label: "K-beauty searches", help: "Tracked searches where it is in the top 10 unpaid results today", better: "high", value: (p) => p.search, show: (p) => String(p.search), sub: (p) => (p.search ? "keywords in top 10" : null) },
];
const GROUPS = { price: "Buyability", rank: "Visibility", rating: "Reception", demand: "Velocity", search: "Discoverability" };

/** "leads on X; trails all 5 rivals on Y and Z" from the standings. */
export function standingsSentence(subject: string, st: Standing[], n: number) {
  const { strong, weak } = strongestWeakest(st, 2);
  const all = (s: Standing[], dir: "ahead" | "behind") => s.filter((x) => (dir === "ahead" ? x.ahead : x.behind) === x.of && x.of === n);
  const lead = strong.length ? `leads ${all(strong, "ahead").length === strong.length ? `all ${n} rivals` : "most rivals"} on ${strong.map((s) => s.label.toLowerCase()).join(" and ")}` : null;
  const trail = weak.length ? `trails ${all(weak, "behind").length === weak.length ? `all ${n} rivals` : "most rivals"} on ${weak.map((s) => s.label.toLowerCase()).join(" and ")}` : null;
  if (lead && trail) return `${subject} ${lead} but ${trail}`;
  return `${subject} ${lead ?? trail ?? `is broadly on par with its ${n} rivals`}`;
}

/* ---------------------------------------------------------------- §1 summary */

export function Summary({ hero, products, brands, anchor, cat }: { hero: UspComparison | null; products: ProductFacts[]; brands: BrandFacts[]; anchor: string; cat: string }) {
  const a = products.find((p) => p.role === "anchor");
  const rivals = products.filter((p) => p !== a);
  const st = a ? standings(a, rivals, PRODUCT_CRITERIA) : [];
  const { strong, weak } = strongestWeakest(st);
  const ab = brands.find((b) => b.brand === anchor);
  const rb = brands.filter((b) => b.brand !== anchor && b.basket.vsAnchor !== null);
  const cheaperBrands = rb.filter((b) => b.basket.vsAnchor! < 0.95).length;
  const name = a ? shortTitle(a.name, a.brand) : null;

  const priceFinding = a?.price ? (() => {
    const below = rivals.filter((r) => r.price !== null && r.price > a.price! * 1.05).length;
    const above = rivals.filter((r) => r.price !== null && r.price < a.price! * 0.95).length;
    return <>At <b>{inr(a.price)}</b>, {name} is cheaper than {below} and pricier than {above} of its {rivals.length} rivals. Innisfree&rsquo;s core basket ({inr(ab?.basket.overall)}) is pricier than {cheaperBrands} of {rb.length} rival brands.</>;
  })() : <>Innisfree&rsquo;s core basket costs {inr(ab?.basket.overall)}, pricier than {cheaperBrands} of {rb.length} rival brands.</>;
  const bestRival = [...rivals].filter((r) => r.rank).sort((x, y) => x.rank! - y.rank!)[0];
  const visFinding = a ? <>{a.rank ? <>#{a.rank} in {CATEGORY_LABEL[cat]}</> : <>Not in the {CATEGORY_LABEL[cat]} top 100</>}; {rivals.filter((r) => r.rank && (!a.rank || r.rank < a.rank)).length} of {rivals.length} rivals rank higher{bestRival ? <> (best: {bestRival.brand} #{bestRival.rank}{bestRival.paid ? ", paid slot" : ""})</> : null}.</> : null;
  const topDemand = [...rivals].filter((r) => r.recent !== null).sort((x, y) => y.recent! - x.recent!)[0];
  const demFinding = a ? <>{a.recent !== null ? <><b>{compact(a.recent)}</b> reviews in 3 months{a.momentum !== null ? <> ({signed(a.momentum)})</> : null}</> : <>Demand not tracked</>}{topDemand ? <>, against {compact(topDemand.recent)} for {topDemand.brand}&rsquo;s {shortTitle(topDemand.name, topDemand.brand)}</> : null}.</> : null;
  const u = a?.usp?.analysis;
  const promise = u ? (() => { const t = u.main_usp.statement.split(/[.;]/)[0]; if (t.length <= 110) return t; const c = t.slice(0, 110); return `${c.slice(0, c.lastIndexOf(" "))}…`; })() : "";
  const msgFinding = u ? <>Leads on &ldquo;{promise}&rdquo;; proof is <b>{u.proof_strength.rating}</b>, buyers {u.review_check.usp_verdict === "echoed" ? "echo it" : u.review_check.usp_verdict === "contradicted" ? "contradict it" : "rarely mention it"}. {hero?.comparison.white_space.length ? `${hero.comparison.white_space.length} white-space openings found.` : ""}</> : null;

  return (
    <section id="summary" className="mt-6 scroll-mt-32">
      <Card className="px-6 py-5">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Verdict for Innisfree{name ? ` · ${name}` : ""}</div>
        {hero ? (() => {
          const v = hero.comparison.anchor_position.verdict;
          const [lead, ...rest] = v.split(/(?<=[.!?])\s+/);
          return (<>
            <p className="mt-2 max-w-[110ch] font-display text-[18px] font-medium leading-snug tracking-tight">{lead}</p>
            {rest.length > 0 && <p className="mt-2 max-w-[110ch] text-[13.5px] leading-relaxed text-ink-2">{rest.join(" ")}</p>}
          </>);
        })() : (
          <p className="mt-2 max-w-[110ch] font-display text-[18px] font-medium leading-snug tracking-tight">
            {a ? standingsSentence(name ?? "Innisfree", st, rivals.length) + "." : `Innisfree sells nothing in ${CATEGORY_LABEL[cat]} on Nykaa; rivals are compared with each other below.`}
          </p>
        )}
        {a && (
          <div className="mt-4 grid gap-2 border-t border-line pt-3 md:grid-cols-2">
            <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-good">Strengths</span>
              {strong.length ? strong.map((s) => <Chip key={s.key} tone="good">{s.label} · ahead of {s.ahead}/{s.of}</Chip>) : <span className="text-[12px] text-muted">No clear lead on the numbers</span>}</div>
            <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-bad">Gaps</span>
              {weak.length ? weak.map((s) => <Chip key={s.key} tone="bad">{s.label} · behind {s.behind}/{s.of}</Chip>) : <span className="text-[12px] text-muted">No clear gap on the numbers</span>}</div>
          </div>
        )}
      </Card>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Finding label="Price" href="#price">{priceFinding}</Finding>
        {visFinding && <Finding label="Visibility" tone={a?.rank && rivals.every((r) => !r.rank || r.rank > a.rank!) ? "good" : "bad"} href="#scorecard">{visFinding}</Finding>}
        {demFinding && <Finding label="Demand" tone={a?.momentum != null ? (a.momentum > 0.05 ? "good" : a.momentum < -0.05 ? "bad" : undefined) : undefined} href="#scorecard">{demFinding}</Finding>}
        {msgFinding && <Finding label="Message" tone={u?.review_check.usp_verdict === "echoed" ? "good" : undefined} href="#proposition">{msgFinding}</Finding>}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- §2 product scorecard */

export function ProductHead({ p, color, options, onSwap }: { p: ProductFacts; color?: string; options?: ProductOption[]; onSwap?: (pid: string) => void }) {
  const open = useOpenProduct();
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
        {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}{ROLE_LABEL[p.role] ?? ""}
      </div>
      <div className="mt-2 flex items-start gap-2.5">
        <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-page ring-1 ring-line">
          {/* eslint-disable-next-line @next/next/no-img-element -- Nykaa CDN image */}
          {p.image ? <img src={p.image} alt="" className="h-12 w-12 object-contain" /> : null}
        </span>
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold text-ink-2">{p.brand}</span>
          <span className="block text-[12.5px] leading-snug" title={p.name}>{shortTitle(p.name, p.brand)}</span>
        </span>
      </div>
      <div className="mt-2 flex gap-1.5 text-[11.5px]">
        {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="rounded-md px-1.5 py-0.5 text-ink-2 ring-1 ring-line hover:bg-sunken">Nykaa ↗</a>}
        <button onClick={() => open({ product_id: p.pid, name: p.name, brand: p.brand, url: p.url, image: p.image, price: p.price, mrp: p.mrp, rating: p.rating, rating_count: p.ratings, usp: p.whatItIs, phrases: p.phrases, splitup: p.split, madeIn: p.madeIn })}
          className="rounded-md px-1.5 py-0.5 text-ink-2 ring-1 ring-line hover:bg-sunken">History →</button>
      </div>
      {options && options.length > 1 && onSwap && (
        <select value={p.pid} onChange={(e) => onSwap(e.target.value)} className="mt-1.5 w-full rounded-md bg-surface px-1.5 py-1 text-[11px] text-ink-2 ring-1 ring-line">
          {options.map((o) => <option key={o.product_id} value={o.product_id}>{o.rank ? `#${o.rank} ` : ""}{shortTitle(o.name, o.brand).slice(0, 34)} · {inr(o.price)}</option>)}
        </select>
      )}
    </div>
  );
}

function StarSplit({ split }: { split: Record<string, number> | null }) {
  if (!split) return <span className="text-[11.5px] text-muted">–</span>;
  const tot = Object.values(split).reduce((x, y) => x + y, 0) || 1;
  return (
    <div className="w-full max-w-[160px] space-y-0.5">
      {["5", "4", "3", "2", "1"].map((k) => (
        <div key={k} className="flex items-center gap-1.5 text-[10.5px] text-muted tabular">
          <span className="w-2">{k}</span>
          <div className="h-1.5 flex-1 rounded-full bg-sunken"><div className="h-1.5 rounded-full" style={{ width: `${((split[k] ?? 0) / tot) * 100}%`, background: Number(k) >= 4 ? "#121211" : Number(k) === 3 ? "#8a8880" : "#c0352b" }} /></div>
          <span className="w-7 text-right">{Math.round(((split[k] ?? 0) / tot) * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

export function ProductScorecard({ products, colors, optionsFor, onSwap, cat }: {
  products: ProductFacts[]; colors: Record<string, string>; optionsFor: ((b: string) => ProductOption[]) | null; onSwap: (brand: string, pid: string) => void; cat: string;
}) {
  const a = products.find((p) => p.role === "anchor");
  const rivals = products.filter((p) => p !== a);
  const title = a ? standingsSentence(shortTitle(a.name, a.brand), standings(a, rivals, PRODUCT_CRITERIA), rivals.length) : `${products.length} products compared in ${CATEGORY_LABEL[cat]}`;
  const cols: GridCol[] = products.map((p) => ({ key: p.pid, anchor: p === a, head: <ProductHead p={p} color={colors[p.brand]} options={optionsFor?.(p.brand)} onSwap={(pid) => onSwap(p.brand, pid)} /> }));
  const extra: ExtraRow<ProductFacts>[] = [
    { after: "discount", label: "Offer", help: "Gift, bundle or coupon on the listing", has: (p) => !!p.offer, render: (p) => <span className="text-[12px] leading-snug">{p.offer ?? <span className="text-muted">none</span>}</span> },
    { after: "ratings", label: "Star split", help: "Share of all ratings by stars", has: (p) => !!p.split, render: (p) => <StarSplit split={p.split} /> },
    { after: "momentum", label: "12-month reviews", help: "Monthly reviews over the last 12 complete months", has: (p) => !!p.spark, render: (p) => <Sparkline values={p.spark!} color={colors[p.brand] ?? "#8a8880"} width={140} height={30} /> },
  ];
  return (
    <ActionSection id="scorecard" kicker="Scorecard · product vs product" title={`${title}.`}
      note="Shading is from Innisfree's side: green where Innisfree beats that rival, red where it trails, grey on par (within 5% or 3 places). LEAD marks the best value in the row. Price is never shaded: cheaper is a position, not a win. No blended total score.">
      <CompareGrid cols={cols} items={products} criteria={PRODUCT_CRITERIA} extra={extra} groups={GROUPS} colors={products.map((p) => colors[p.brand])} labelWidth={160} />
    </ActionSection>
  );
}
