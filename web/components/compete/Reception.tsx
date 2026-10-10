"use client";

import CompareGrid, { Chip, type ExtraRow, type GridCol } from "@/components/CompareGrid";
import { ActionSection, More, ShowAll } from "@/components/Report";
import { Card } from "@/components/ui";
import { shortTitle, type ProductFacts } from "@/lib/competeData";
import { VERDICT, type UspComparison } from "@/lib/usp";
import { ProductHead } from "./Overview";
import { ListCard } from "./Proposition";

/* ---------------------------------------------------------------- §5 reception */

export function Reception({ hero, products, colors, loading }: { hero: UspComparison | null; products: ProductFacts[]; colors: Record<string, string>; loading: boolean }) {
  const a = products.find((p) => p.role === "anchor");
  const r = a?.usp?.analysis.review_check;
  const echoed = r?.benefit_verdicts.filter((b) => b.verdict === "echoed").length ?? 0;
  const title = r
    ? `Buyers echo ${echoed} of ${r.benefit_verdicts.length} Innisfree claims${r.recurring_complaints[0] ? `; the top complaint is "${r.recurring_complaints[0].theme.toLowerCase()}"` : ""}.`
    : "What reviewers single out, product by product.";
  const cols: GridCol[] = products.map((p) => ({ key: p.pid, anchor: p === a, head: <ProductHead p={p} color={colors[p.brand]} /> }));
  const pos = (p: ProductFacts) => p.phrases.filter((x) => x.sentiment === "Positive");
  const neg = (p: ProductFacts) => p.phrases.filter((x) => x.sentiment !== "Positive");
  const rows: ExtraRow<ProductFacts>[] = [
    { label: "What reviewers single out", help: "Tags reviewers attach to their review, with the share that were positive (most-mentioned first); green = positive share", has: (p) => !!p.aspects?.length,
      render: (p) => <div className="space-y-1">{p.aspects!.slice(0, 6).map((x) => { const pc = Math.round((x.positive / x.total) * 100); return (
        <div key={x.label} className="text-[11.5px]"><div className="flex justify-between gap-2"><span className="truncate" title={x.label}>{x.label}</span><span className="shrink-0 text-muted tabular">{x.total}</span></div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-[#fbecea]"><div className="h-full bg-good" style={{ width: `${pc}%` }} /></div></div>); })}</div> },
    { label: "Shoppers praise (Nykaa)", help: "Review themes Nykaa extracts", has: (p) => pos(p).length > 0, render: (p) => <div className="flex flex-wrap gap-1"><ShowAll n={8} items={pos(p)} render={(x) => <Chip key={x.text} tone="good">{x.text}</Chip>} /></div> },
    { label: "Shoppers criticise (Nykaa)", has: (p) => neg(p).length > 0, render: (p) => <div className="flex flex-wrap gap-1">{neg(p).map((x) => <Chip key={x.text} tone="bad">{x.text}</Chip>)}</div> },
    { label: "Valued but not advertised", help: "What buyers praise that the listing never claims", has: (p) => !!p.usp?.analysis.review_check.valued_but_not_advertised.length,
      render: (p) => <ul className="space-y-1"><ShowAll n={3} items={p.usp!.analysis.review_check.valued_but_not_advertised} render={(x) => <li key={x.theme} className="text-[12px] leading-snug text-good">{x.theme}<span className="block text-[11px] text-muted">{x.how_often}</span></li>} /></ul> },
    { label: "Recurring complaints", has: (p) => !!p.usp?.analysis.review_check.recurring_complaints.length,
      render: (p) => <ul className="space-y-1"><ShowAll n={3} items={p.usp!.analysis.review_check.recurring_complaints} render={(x) => <li key={x.theme} className="text-[12px] leading-snug text-bad">{x.theme}<span className="block text-[11px] text-muted">{x.how_often}</span></li>} /></ul> },
    { label: "Reviews read", has: (p) => !!p.usp, render: (p) => <span className="text-[12px] text-muted">{p.usp!.analysis.review_check.reviews_considered} reviews (most-liked and most-recent)</span> },
  ];
  return (
    <ActionSection id="reception" kicker="Reception · what buyers say" title={title}
      note="Claims checked against reviews by the USP read; review tags come from up to 600 recent reviews per product.">
      {hero && <Card className="mb-4 px-5 py-4"><div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Innisfree&rsquo;s buyers vs rivals&rsquo; buyers</div><p className="mt-1.5 max-w-[120ch] text-[13.5px] leading-relaxed text-ink-2"><More text={hero.comparison.anchor_position.review_resonance_vs_rivals} /></p></Card>}
      {r && a && (
        <div className="mb-4 grid gap-3 lg:grid-cols-3">
          <Card className="px-5 py-4">
            <div className="text-[13.5px] font-semibold">Each Innisfree claim, checked</div>
            <div className="text-[11.5px] text-muted">{shortTitle(a.name, a.brand)} · {r.reviews_considered} reviews</div>
            <ul className="mt-2 space-y-2"><ShowAll n={4} items={r.benefit_verdicts} render={(b) => { const v = VERDICT[b.verdict]; return (
              <li key={b.benefit} className="text-[12.5px] leading-snug"><span className="font-medium">{b.benefit}</span> <span className={`text-[11.5px] ${v.tone}`}>{v.label}</span>
                <span className="block text-ink-2"><More text={b.explanation} /></span>{b.quotes[0] && <span className="mt-0.5 block text-[11.5px] italic text-muted">&ldquo;{b.quotes[0]}&rdquo;</span>}</li>); }} /></ul>
          </Card>
          <ListCard title="Valued but not advertised" tone="good" items={r.valued_but_not_advertised.map((x) => ({ head: x.theme, body: x.how_often, foot: x.quotes[0] ? `“${x.quotes[0]}”` : undefined }))} empty="Nothing beyond what the listing says." />
          <ListCard title="Recurring complaints" tone="bad" items={r.recurring_complaints.map((x) => ({ head: x.theme, body: x.how_often, foot: x.quotes[0] ? `“${x.quotes[0]}”` : undefined }))} empty="No recurring complaint." />
        </div>
      )}
      {loading && <p className="mb-2 text-[12px] text-muted">Loading review tags…</p>}
      <CompareGrid cols={cols} items={products} criteria={[]} extra={rows} labelWidth={150} />
    </ActionSection>
  );
}

/* ---------------------------------------------------------------- §6 shelf presentation */

const SHOT = (s: string | null) => (s ?? "").replaceAll("_", " ");

export function Shelf({ products, colors }: { products: ProductFacts[]; colors: Record<string, string> }) {
  const withThumb = products.filter((p) => p.thumb?.shot_type);
  if (!withThumb.length) return null;
  const a = products.find((p) => p.role === "anchor");
  const rivals = withThumb.filter((p) => p !== a);
  const count = (f: (p: ProductFacts) => string | null | undefined) => { const m = new Map<string, number>(); rivals.forEach((p) => { const k = f(p); if (k) m.set(k, (m.get(k) ?? 0) + 1); }); return [...m.entries()].sort((x, y) => y[1] - x[1])[0]; };
  const shot = count((p) => SHOT(p.thumb!.shot_type)); const dens = count((p) => p.thumb!.text_density);
  const at = a?.thumb;
  const title = at?.shot_type
    ? `Innisfree's thumbnail is a ${SHOT(at.shot_type)} with ${at.text_density ?? "no"} text and ${at.on_image_claims?.length ?? 0} printed claims; ${shot ? `${shot[1]} of ${rivals.length} rivals use a ${shot[0]}` : "rivals vary"}${dens ? `, ${dens[1]} with ${dens[0]} text` : ""}.`
    : `How each product looks on the shelf (${withThumb.length} of ${products.length} thumbnails read).`;
  return (
    <ActionSection id="shelf" kicker="Shelf presentation · the thumbnail" title={title}
      note="Nykaa ranks partly on clicks, and the main image is what a shopper decides on in the grid. Read from each product's main image.">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => {
          const t = p.thumb;
          return (
            <Card key={p.pid} className={`px-4 py-4 ${p === a ? "ring-2 ring-ink" : ""}`}>
              <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted"><span className="h-2 w-2 rounded-full" style={{ background: colors[p.brand] }} />{p.brand}</div>
              <div className="mt-0.5 text-[12.5px] leading-snug">{shortTitle(p.name, p.brand)}</div>
              <div className="mt-3 grid aspect-square place-items-center overflow-hidden rounded-xl bg-page ring-1 ring-line">
                {/* eslint-disable-next-line @next/next/no-img-element -- Nykaa CDN image */}
                {(t?.image_url ?? p.image) ? <img src={t?.image_url ?? p.image!} alt="" className="h-[86%] w-[86%] object-contain" /> : <span className="text-[12px] text-muted">No image</span>}
              </div>
              {t?.shot_type ? (<>
                <div className="mt-3 flex flex-wrap gap-1">
                  <Chip>{SHOT(t.shot_type)}</Chip><Chip>{t.model_present ? "shows a person" : "no person"}</Chip>
                  <Chip>{t.text_density === "heavy" ? "text-heavy" : t.text_density === "light" ? "light text" : "no text"}</Chip>
                  {t.background && <Chip>{t.background} background</Chip>}{t.packaging_style && <Chip>{t.packaging_style}</Chip>}{t.mood && <Chip>{t.mood}</Chip>}
                </div>
                {!!t.dominant_colors?.length && <div className="mt-2 flex h-2.5 overflow-hidden rounded-full ring-1 ring-line">{t.dominant_colors.slice(0, 5).map((c) => <span key={c.hex} style={{ background: c.hex, width: `${c.share * 100}%` }} />)}</div>}
                {!!t.on_image_claims?.length && (<div className="mt-2.5"><div className="text-[11px] text-muted">Printed on the image</div>
                  <div className="mt-1 flex flex-wrap gap-1">{t.on_image_claims.map((c) => <Chip key={c} tone="plain">{c}</Chip>)}</div></div>)}
                {t.summary && <p className="mt-2.5 text-[12px] leading-snug text-ink-2">{t.summary}</p>}
              </>) : <p className="mt-3 text-[12px] text-muted">Thumbnail not analysed yet.</p>}
            </Card>
          );
        })}
      </div>
    </ActionSection>
  );
}
