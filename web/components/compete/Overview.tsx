"use client";

import { Chip } from "@/components/CompareGrid";
import { DetailHead, LEVEL_SCORE, LEVEL_WORD, Opens, Points, useDetail, type DetailContent } from "@/components/Detail";
import { useOpenProduct } from "@/components/ProductDrawer";
import { Card, Verdict } from "@/components/ui";
import { TONE_CLASS, TONE_WORD, tone, type Criterion, type Standing } from "@/lib/compete";
import { ROLE_LABEL, shortTitle, type ProductFacts, type ProductOption } from "@/lib/competeData";
import { CATEGORY_LABEL, compact, inr, signed } from "@/lib/format";
import type { Bench } from "@/lib/price";
import type { UspComparison } from "@/lib/usp";
import { demandWindow } from "@/lib/analysis";
import { useTiers } from "@/lib/tiers";

const DW = demandWindow();

/* ---------------------------------------------------------------- product measures, one set per section */

const rupee100 = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

export const VIS_CRITERIA: Criterion<ProductFacts>[] = [
  { key: "rank", label: "Shelf position today", help: "Position in this category's top 100 on Nykaa today (1 = top of the page)", better: "low", value: (p) => p.rank ?? 101,
    show: (p) => (p.rank ? `#${p.rank}` : "Not in top 100"), sub: (p) => (p.paid ? "paid (ad) slot" : p.rank ? "unpaid" : null),
    up: "Ranks higher on the shelf than", down: "Ranks lower on the shelf than" },
  { key: "rankmove", label: "Change in 7 days", help: "Places gained or lost on the shelf since a week ago", better: "high", value: (p) => (p.rank && p.rank7 ? p.gain7 ?? 0 : null),
    show: (p) => (!p.gain7 ? "No change" : `${p.gain7 > 0 ? "▲" : "▼"} ${Math.abs(p.gain7)} place${Math.abs(p.gain7) === 1 ? "" : "s"}`),
    sub: (p) => (p.rank7 ? `#${p.rank7} a week ago` : null),
    missing: (p) => (p.rank && p.rank7 ? null : p.rank ? "New in the top 100 this week" : p.rank7 ? `Dropped out (was #${p.rank7})` : "Not in the top 100 either week"),
    up: "Climbing faster than", down: "Slipping more than" },
  { key: "search", label: "K-beauty searches", help: "Tracked Korean-beauty searches where it shows in the first 10 unpaid results today", better: "high", value: (p) => p.search,
    show: (p) => (p.search ? `${p.search} search${p.search === 1 ? "" : "es"}` : "In none"), sub: (p) => (p.search ? "top 10, unpaid" : "of the tracked searches"),
    up: "Shows up in more K-beauty searches than", down: "Shows up in fewer K-beauty searches than" },
];

export const DEMAND_CRITERIA: Criterion<ProductFacts>[] = [
  { key: "demand", label: "Reviews, last 3 months", help: "Dated reviews in the last 3 complete months (sizes of one product pooled): a stand-in for recent sales", better: "high", value: (p) => p.recent, show: (p) => compact(p.recent), sub: () => DW.recent, bar: true,
    missing: (p) => (p.recent === null ? "Not in review tracking" : null), up: "More recent reviews (a sales signal) than", down: "Fewer recent reviews (a sales signal) than" },
  { key: "momentum", label: "Review growth", help: `Reviews ${DW.recent} against ${DW.prior}; products with complete history only`, better: "high", value: (p) => p.momentum, show: (p) => signed(p.momentum),
    sub: () => `vs ${DW.prior}`, missing: (p) => (p.momentum === null ? (p.recent === null ? "Not in review tracking" : "Too new to compare") : null),
    up: "Reviews growing faster than", down: "Reviews growing slower than" },
  { key: "ratings", label: "Ratings, all time", help: "Number of star ratings: lifetime popularity", better: "high", value: (p) => p.ratings, show: (p) => compact(p.ratings), bar: true,
    sub: (p) => (p.reviewsTotal ? `${compact(p.reviewsTotal)} written reviews` : null), missing: (p) => (p.ratings === null ? "No ratings yet" : null),
    up: "More lifetime ratings than", down: "Fewer lifetime ratings than" },
];

export const BUYER_CRITERIA: Criterion<ProductFacts>[] = [
  { key: "rating", label: "Star rating", help: "Nykaa star rating", better: "high", value: (p) => p.rating, show: (p) => (p.rating ? `★ ${p.rating.toFixed(1)}` : ""),
    missing: (p) => (p.rating === null ? "No ratings yet" : null), up: "Rated higher than", down: "Rated lower than" },
];

/** Not shown as grid rows (they are levels in the Message section) but counted for strengths and gaps. */
const MESSAGE_CRITERIA: Criterion<ProductFacts>[] = [
  { key: "proof", label: "Proof of claims", help: "", better: "high", value: (p) => (p.proof.level ? LEVEL_SCORE[p.proof.level] : null), show: (p) => (p.proof.level ? LEVEL_WORD[p.proof.level] : ""),
    up: "Better-proven claims than", down: "Less-proven claims than" },
  { key: "echo", label: "Buyers repeat its claims", help: "", better: "high", value: (p) => (p.echo.level ? LEVEL_SCORE[p.echo.level] : null), show: (p) => (p.echo.level ? LEVEL_WORD[p.echo.level] : ""),
    up: "Buyers repeat its claims more than for", down: "Buyers repeat its claims less than for" },
];

const ALL = [...BUYER_CRITERIA, ...MESSAGE_CRITERIA, ...VIS_CRITERIA, ...DEMAND_CRITERIA];

function standingsOf(a: ProductFacts, rivals: ProductFacts[]): (Standing & { c: Criterion<ProductFacts> })[] {
  return ALL.filter((c) => c.better && c.value(a) !== null).map((c) => {
    const ts = rivals.map((r) => tone(c.value(a), c.value(r), c.better, c.key.startsWith("rank") ? "rank" : "ratio")).filter((t) => t !== null);
    return { key: c.key, label: c.label, ahead: ts.filter((t) => t === "ahead").length, behind: ts.filter((t) => t === "behind").length, of: ts.length, c };
  }).filter((s) => s.of > 0);
}

/** Evidence behind a strength or gap: Innisfree's value against each rival's. */
function evidence(c: Criterion<ProductFacts>, a: ProductFacts, rivals: ProductFacts[]): DetailContent {
  const v = (p: ProductFacts) => c.missing?.(p) ?? c.show(p);
  return {
    kicker: "Strength or gap · evidence", title: c.label,
    body: (<>
      <p className="text-muted">{c.help}</p>
      <DetailHead>Innisfree</DetailHead>
      <p><b>{shortTitle(a.name, a.brand)}</b>: {v(a)}</p>
      <DetailHead>Against each rival</DetailHead>
      <ul className="space-y-1.5">{rivals.map((r) => { const t = tone(c.value(a), c.value(r), c.better, c.key.startsWith("rank") ? "rank" : "ratio"); return (
        <li key={r.pid} className="flex items-start justify-between gap-3"><span><b className="font-medium">{r.brand}</b> {shortTitle(r.name, r.brand)}: {v(r)}</span>
          {t && <span className={`shrink-0 rounded px-1.5 py-px text-[11px] ${TONE_CLASS[t]}`}>{TONE_WORD[t]}</span>}</li>); })}</ul>
      <p className="mt-4 text-[12px] text-muted">On par = within 5% (or 3 shelf places).</p>
    </>),
  };
}


/* ---------------------------------------------------------------- §1 verdict, strengths and gaps */

type Dim = { id: string; label: string; href: string; tone?: "good" | "bad"; good?: string; bad?: string; point: React.ReactNode };

export function Summary({ hero, products, bench, cat }: { hero: UspComparison | null; products: ProductFacts[]; bench: Bench | null; cat: string }) {
  const open = useDetail();
  const a = products.find((p) => p.role === "anchor");
  const rivals = products.filter((p) => p !== a);
  if (!a) return (
    <section id="summary" className="mt-6 scroll-mt-32"><Card className="px-6 py-5">
      <p className="font-display text-[18px] font-medium">Innisfree sells nothing in {CATEGORY_LABEL[cat]} on Nykaa; the rivals are compared with each other below.</p>
    </Card></section>
  );
  const name = shortTitle(a.name, a.brand);
  const st = standingsOf(a, rivals);
  const strong = st.filter((s) => s.ahead > s.behind).sort((x, y) => (y.ahead - y.behind) / y.of - (x.ahead - x.behind) / x.of).slice(0, 4);
  const weak = st.filter((s) => s.behind > s.ahead).sort((x, y) => (y.behind - y.ahead) / y.of - (x.behind - x.ahead) / x.of).slice(0, 4);
  const get = (k: string) => st.find((s) => s.key === k);
  const most = (s?: Standing) => (s ? (s.ahead > s.behind ? "ahead" : s.behind > s.ahead ? "behind" : null) : null);

  // price: position, not a win or a loss
  const unit = bench?.unit ?? (cat === "sheet_mask" ? "sheet" : "100 ml/g");
  const diff = a.unit && bench ? a.unit / bench.value - 1 : null;
  const leader = bench ? `${bench.leader.brand}'s ${shortTitle(bench.leader.name, bench.leader.brand)}` : "";
  const pricePhrase = diff === null ? null : Math.abs(diff) < 0.05 ? `priced in line with the K-beauty leader (${leader})` : `priced ${Math.round(Math.abs(diff) * 100)}% ${diff > 0 ? "above" : "below"} the K-beauty leader (${leader})`;
  const cheaper = rivals.filter((r) => r.unit && a.unit && r.unit < a.unit * 0.95).length;
  const ps = a.proof.level ? LEVEL_SCORE[a.proof.level] : null; const es = a.echo.level ? LEVEL_SCORE[a.echo.level] : null;
  const unique = hero?.comparison.anchor_position.unique_to_anchor.length ?? 0;
  const msgScore = ps !== null && es !== null ? ps + es : null;
  const praise = a.themes?.praise[0]; const complaint = a.themes?.complaints[0];
  const rivalRatings = rivals.map((r) => r.rating).filter((x): x is number => x !== null).sort((x, y) => x - y);
  const rivalMed = rivalRatings.length ? rivalRatings[Math.floor(rivalRatings.length / 2)] : null;
  const rank = get("rank"); const dem = get("demand");

  const dims: Dim[] = [
    { id: "price", label: "Price", href: "#price",
      point: a.mrp ? <>MRP <b>{inr(a.mrp)}</b>{a.unit ? <> · {rupee100(a.unit)} per {unit}</> : null}{bench ? <> vs {rupee100(bench.value)} for the K-beauty leader</> : null}; {cheaper} of {rivals.length} rivals cost less</> : <>MRP not shown on Nykaa</> },
    { id: "message", label: "Message", href: "#message",
      tone: msgScore === null ? undefined : msgScore >= 5 ? "good" : msgScore <= 3 ? "bad" : undefined,
      good: es === 3 ? "a message buyers repeat" : "a well-proven message",
      bad: ps === 1 && es !== 3 ? "weakly proven claims" : "claims buyers rarely repeat",
      point: a.proof.level ? <>Proof <b>{LEVEL_WORD[a.proof.level].toLowerCase()}</b> · buyer echo <b>{a.echo.level ? LEVEL_WORD[a.echo.level].toLowerCase() : "too few reviews"}</b>{hero ? <> · {unique} claim{unique === 1 ? "" : "s"} no rival makes</> : null}</> : <>No message analysis for this product</> },
    { id: "buyers", label: "Buyers", href: "#buyers",
      tone: most(get("rating")) === "ahead" ? "good" : most(get("rating")) === "behind" ? "bad" : undefined,
      good: "rated higher than most rivals", bad: "rated lower than most rivals",
      point: <>{a.rating ? <>★ <b>{a.rating.toFixed(1)}</b>{rivalMed ? <> (rivals ★ {rivalMed.toFixed(1)})</> : null}</> : "No rating yet"}{praise ? <> · most praised: {praise.label.toLowerCase()} ({Math.round(praise.share * 100)}%)</> : null}{complaint ? <> · top complaint: {complaint.label.toLowerCase()} ({Math.round(complaint.share * 100)}%)</> : null}</> },
    { id: "reach", label: "Shelf and demand", href: "#visibility",
      tone: most(rank) === "ahead" && most(dem) !== "behind" ? "good" : most(rank) === "behind" && most(dem) !== "ahead" ? "bad" : undefined,
      good: (a.momentum ?? 0) > 0.05 ? "a strong shelf position and rising demand" : "a strong shelf position",
      bad: (a.momentum ?? 0) < -0.05 ? "a weak shelf position and falling demand" : "a weak shelf position",
      point: <>{a.rank ? <>#{a.rank} on the shelf</> : <>Not in the top 100</>} ({rivals.filter((r) => r.rank && (!a.rank || r.rank < a.rank)).length} of {rivals.length} rivals higher){a.recent !== null ? <> · {compact(a.recent)} reviews in 3 months{a.momentum !== null ? <> ({signed(a.momentum)})</> : null}</> : null}</> },
  ];
  const goods = dims.filter((d) => d.tone === "good").map((d) => d.good!);
  const bads = dims.filter((d) => d.tone === "bad").map((d) => d.bad!);
  const join = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  const headline = `${name} is ${pricePhrase ?? "priced without a comparable size"}${goods.length ? `, with ${join(goods)}` : ""}${bads.length ? `${goods.length ? ", but" : ", and"} has ${join(bads)}` : ""}.`;

  const chip = (s: Standing & { c: Criterion<ProductFacts> }, good: boolean) => (
    <button key={s.key} onClick={() => open(evidence(s.c, a, rivals))} className="text-left">
      <Chip tone={good ? "good" : "bad"}>{good ? s.c.up : s.c.down} {good ? s.ahead : s.behind} of {s.of} rival{s.of === 1 ? "" : "s"} ›</Chip>
    </button>
  );
  return (
    <section id="summary" className="mt-6 scroll-mt-32">
      <Verdict eyebrow={<>Verdict for Innisfree · {name}</>}>{headline}</Verdict>
      <Card className="mt-3 px-6 py-4">
        {hero && (
          <Opens className="mb-3 text-[12.5px] font-medium text-accent-strong" detail={{ kicker: "AI read of the message, in full", title: "Message verdict", body: <Points items={hero.comparison.anchor_position.verdict.split(/(?<=[.!?])\s+/)} /> }}>
            Read the full message verdict
          </Opens>
        )}
        <div className={`grid gap-3 md:grid-cols-2 ${hero ? "border-t border-line pt-3" : ""}`}>
          <div><div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-good">Strengths</div>
            <div className="flex flex-wrap gap-1.5">{strong.length ? strong.map((s) => chip(s, true)) : <span className="text-[12px] text-muted">No measure where it beats most rivals</span>}</div></div>
          <div><div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-bad">Gaps</div>
            <div className="flex flex-wrap gap-1.5">{weak.length ? weak.map((s) => chip(s, false)) : <span className="text-[12px] text-muted">No measure where it trails most rivals</span>}</div></div>
        </div>
      </Card>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {dims.map((d) => (
          <a key={d.id} href={d.href} className="lift relative block overflow-hidden rounded-[16px] bg-surface px-5 py-4 shadow-card ring-1 ring-line">
            <span className={`absolute left-0 top-0 h-full w-1 ${d.tone === "good" ? "bg-good" : d.tone === "bad" ? "bg-bad" : "bg-line-2"}`} />
            <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"><span>{d.label}</span><span className="font-normal normal-case tracking-normal">see ↓</span></div>
            <div className="mt-1.5 text-[13.5px] leading-snug">{d.point}</div>
          </a>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- product column header (image opens the shelf read) */

const SHOT = (s: string | null) => (s ?? "").replaceAll("_", " ");

export function thumbDetail(p: ProductFacts): DetailContent {
  const t = p.thumb;
  return {
    kicker: `${p.brand} · how it looks on the shelf`, title: shortTitle(p.name, p.brand),
    body: (<>
      <div className="grid aspect-square w-full max-w-[360px] place-items-center overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
        {/* eslint-disable-next-line @next/next/no-img-element -- Nykaa CDN image */}
        {(t?.image_url ?? p.image) ? <img src={t?.image_url ?? p.image!} alt="" className="h-[88%] w-[88%] object-contain" /> : <span className="text-muted">No image</span>}
      </div>
      {t?.shot_type ? (<>
        <DetailHead>What the thumbnail shows</DetailHead>
        <div className="flex flex-wrap gap-1">
          <Chip>{SHOT(t.shot_type)}</Chip><Chip>{t.model_present ? "shows a person" : "no person"}</Chip>
          <Chip>{t.text_density === "heavy" ? "text-heavy" : t.text_density === "light" ? "light text" : "no text"}</Chip>
          {t.background && <Chip>{t.background} background</Chip>}{t.packaging_style && <Chip>{t.packaging_style}</Chip>}{t.mood && <Chip>{t.mood}</Chip>}
        </div>
        {!!t.dominant_colors?.length && <><DetailHead>Main colours</DetailHead><div className="flex h-3 max-w-[360px] overflow-hidden rounded-full ring-1 ring-line">{t.dominant_colors.slice(0, 5).map((c) => <span key={c.hex} style={{ background: c.hex, width: `${c.share * 100}%` }} />)}</div></>}
        {!!t.on_image_claims?.length && <><DetailHead>Printed on the image</DetailHead><Points items={t.on_image_claims} /></>}
        {t.summary && <><DetailHead>Summary</DetailHead><p className="text-ink-2">{t.summary}</p></>}
      </>) : <p className="mt-4 text-muted">This thumbnail has not been analysed yet (image analysis covers the focus brands and the analysed rival groups).</p>}
    </>),
  };
}

export function ProductHead({ p, color, options, onSwap }: { p: ProductFacts; color?: string; options?: ProductOption[]; onSwap?: (pid: string) => void }) {
  const open = useOpenProduct(); const detail = useDetail(); const tiers = useTiers();
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
        {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}{ROLE_LABEL[p.role] ?? ""}
      </div>
      <div className="mt-2 flex items-start gap-2.5">
        <button onClick={() => detail(thumbDetail(p))} title="Larger image and how it looks on the shelf"
          className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-page ring-1 ring-line transition hover:ring-brand">
          {/* eslint-disable-next-line @next/next/no-img-element -- Nykaa CDN image */}
          {p.image ? <img src={p.image} alt="" className="h-12 w-12 object-contain" /> : <span className="text-[10px] text-muted">No image</span>}
        </button>
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold text-ink-2">{p.brand}{!tiers.inSet(p.brand) && <span className="ml-1.5 whitespace-nowrap rounded bg-sunken px-1 text-[10px] font-normal text-muted ring-1 ring-line">not in focus set</span>}</span>
          <span className="block text-[12.5px] leading-snug" title={p.name}>{shortTitle(p.name, p.brand)}</span>
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11.5px]">
        {p.url && <a href={p.url} target="_blank" rel="noreferrer" className="rounded-md px-1.5 py-0.5 text-ink-2 ring-1 ring-line hover:bg-sunken">Nykaa ↗</a>}
        <button onClick={() => open({ product_id: p.pid, name: p.name, brand: p.brand, url: p.url, image: p.image, price: p.price, mrp: p.mrp, rating: p.rating, rating_count: p.ratings, usp: p.whatItIs, phrases: p.phrases, splitup: p.split, madeIn: p.madeIn })}
          className="rounded-md px-1.5 py-0.5 text-ink-2 ring-1 ring-line hover:bg-sunken">History ›</button>
      </div>
      {options && options.length > 1 && onSwap && (
        <select value={p.pid} onChange={(e) => onSwap(e.target.value)} className="mt-1.5 w-full rounded-md bg-surface px-1.5 py-1 text-[11px] text-ink-2 ring-1 ring-line">
          {options.map((o) => <option key={o.product_id} value={o.product_id}>{o.rank ? `#${o.rank} ` : ""}{shortTitle(o.name, o.brand).slice(0, 34)} · {inr(o.price)}</option>)}
        </select>
      )}
    </div>
  );
}

