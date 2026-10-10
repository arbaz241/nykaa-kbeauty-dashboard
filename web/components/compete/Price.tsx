"use client";

import CompareGrid, { type ExtraRow, type GridCol } from "@/components/CompareGrid";
import { DetailHead, Missing, Opens, Points } from "@/components/Detail";
import { ActionSection } from "@/components/Report";
import type { Criterion } from "@/lib/compete";
import { shortTitle, type ProductFacts, type ProductOption } from "@/lib/competeData";
import { CATEGORY_LABEL, inr } from "@/lib/format";
import { ProductHead, type Bench } from "./Overview";

const r100 = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

/** MRP first (the list price everyone compares), selling price and discount second. */
export function Mrp({ p }: { p: ProductFacts }) {
  if (!p.mrp && !p.price) return <Missing>No price on Nykaa</Missing>;
  const off = p.discount && p.discount >= 1 ? Math.round(p.discount) : 0;
  return (
    <div className="tabular">
      <div className="text-[15px] font-semibold">{inr(p.mrp ?? p.price)}<span className="ml-1 text-[10.5px] font-normal text-muted">{p.mrp ? "MRP" : "price"}</span></div>
      <div className="text-[11.5px] text-ink-2">{off ? <>sells at {inr(p.price)} · <span className="text-good">{off}% off</span></> : "no discount today"}</div>
      {p.priceNote && <div className="text-[11px] text-muted">{p.priceNote}</div>}
    </div>
  );
}

function sizesDetail(p: ProductFacts, std: number | null) {
  return {
    kicker: `${p.brand} · sizes and prices`, title: shortTitle(p.name, p.brand),
    body: (<>
      {p.sizes.length ? (
        <table className="w-full text-left text-[12.5px] tabular">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-[0.08em] text-muted"><th className="py-1.5 font-semibold">Size</th><th className="font-semibold">MRP</th><th className="font-semibold">Per 100 ml/g</th><th className="font-semibold">Sells at</th></tr></thead>
          <tbody>{p.sizes.map((s) => (
            <tr key={s.pack + s.mrp} className={`border-b border-line last:border-0 ${p.sizeUsed && s.ml === p.sizeUsed.ml ? "font-semibold" : ""}`}>
              <td className="py-1.5">{s.pack}{s.ml !== null && s.ml < 15 ? <span className="ml-1 text-[11px] font-normal text-muted">mini</span> : null}</td>
              <td>{inr(s.mrp)}</td><td>{s.ml && s.mrp ? r100((s.mrp / s.ml) * 100) : <Missing>size unclear</Missing>}</td><td>{s.price ? inr(s.price) : <Missing>not listed</Missing>}</td>
            </tr>))}</tbody>
        </table>
      ) : <p className="text-muted">Nykaa lists no size options for this product.</p>}
      <DetailHead>How it is compared</DetailHead>
      <Points items={[
        std ? `Products are compared at the size closest to this category's usual ${std} ml/g (the most common full size in the top 100).` : "This category has no usual size, so the listed size is used.",
        p.sizeUsed ? `Used here: ${p.sizeUsed.ml} ml/g at MRP ${inr(p.sizeUsed.mrp)} (${p.sizeUsed.how === "matched" ? "closest size option" : "the listed size"}).` : "No size could be used.",
        "Minis and travel sizes under 15 ml/g are never used.",
      ]} />
    </>),
  };
}

export function PriceSection({ products, colors, bench, cat, optionsFor, onSwap }: {
  products: ProductFacts[]; colors: Record<string, string>; bench: Bench | null; cat: string;
  optionsFor: ((b: string) => ProductOption[]) | null; onSwap: (brand: string, pid: string) => void;
}) {
  const a = products.find((p) => p.role === "anchor");
  const cols: GridCol[] = products.map((p) => ({ key: p.pid, anchor: p === a, head: <ProductHead p={p} color={colors[p.brand]} options={optionsFor?.(p.brand)} onSwap={(pid) => onSwap(p.brand, pid)} /> }));
  const criteria: Criterion<ProductFacts>[] = [
    { key: "mrp", label: "MRP", help: "List price on Nykaa (selling price and discount underneath)", better: null, value: (p) => p.mrp ?? p.price, show: () => "", cell: (p) => <Mrp p={p} /> },
    { key: "per100", label: "MRP per 100 ml/g", help: "MRP ÷ pack size × 100, at the size closest to the category's usual size", better: null, value: (p) => p.mrpPer100 ?? p.perPiece,
      show: (p) => (p.mrpPer100 ? r100(p.mrpPer100) : p.perPiece ? `${r100(p.perPiece)} / piece` : ""),
      sub: (p) => (p.sizeUsed ? `at ${p.sizeUsed.ml} ml/g${p.sizeUsed.how === "matched" ? " (closest size)" : ""}` : null), missing: (p) => p.per100Why },
    { key: "vsmed", label: "vs category median", help: "MRP per 100 ml/g against the median of comparable products in this category", better: null,
      value: (p) => (p.mrpPer100 && bench ? p.mrpPer100 / bench.median - 1 : null),
      show: (p) => { const d = p.mrpPer100! / bench!.median - 1; return Math.abs(d) < 0.05 ? "In line" : `${Math.round(Math.abs(d) * 100)}% ${d > 0 ? "above" : "below"}`; },
      missing: (p) => (!bench ? "Too few comparable products" : p.mrpPer100 ? null : "No size to compare") },
  ];
  const extra: ExtraRow<ProductFacts>[] = [
    { key: "more", label: "Sizes and offer", render: (p) => (
      <div className="space-y-1 text-[12px]">
        <Opens detail={sizesDetail(p, bench?.std ?? null)}><span className="text-ink-2">{p.sizes.length > 1 ? `${p.sizes.length} sizes` : p.sizes[0] ? `1 size (${p.sizes[0].pack})` : "Size not listed"}</span></Opens>
        <div className="leading-snug">{p.offer ? <Opens detail={{ kicker: `${p.brand} · offer on the listing`, title: shortTitle(p.name, p.brand), body: <p>{p.offer}</p> }}><span className="text-good">Offer on listing</span></Opens> : <span className="text-muted">No offer</span>}</div>
      </div>) },
  ];
  const pos = a?.mrpPer100 && bench ? a.mrpPer100 / bench.median - 1 : null;
  const cheaper = a?.mrpPer100 ? products.filter((p) => p !== a && p.mrpPer100 && p.mrpPer100 < a.mrpPer100! * 0.95).length : 0;
  const title = a && pos !== null
    ? `At ${r100(a.mrpPer100!)} per 100 ml/g, ${shortTitle(a.name, a.brand)} is ${Math.abs(pos) < 0.05 ? "in line with" : `${Math.round(Math.abs(pos) * 100)}% ${pos > 0 ? "above" : "below"}`} the category median; ${cheaper} of ${products.length - 1} rivals cost less.`
    : a?.mrp ? `${shortTitle(a.name, a.brand)} lists at ${inr(a.mrp)} MRP.` : `Prices in ${CATEGORY_LABEL[cat]}.`;
  return (
    <ActionSection id="price" kicker="Price · on MRP" title={title}
      note={bench ? <>Category median: <b>{r100(bench.median)}</b> per 100 ml/g (cheapest {r100(bench.min)}, dearest {r100(bench.max)}), from {bench.n} full-size products in today&rsquo;s {CATEGORY_LABEL[cat]} top 100{bench.std ? `, packs of ${Math.round(bench.std / 2)}–${bench.std * 2} ml/g` : ""}. Price is a position, so it is never shaded green or red.</> : "Too few comparable full-size products in today's top 100 for a category median."}>
      <CompareGrid cols={cols} items={products} criteria={criteria} extra={extra} labelWidth={150} />
    </ActionSection>
  );
}
