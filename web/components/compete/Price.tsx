"use client";

import CompareGrid, { type ExtraRow, type GridCol } from "@/components/CompareGrid";
import { DetailHead, Missing, Opens, Points } from "@/components/Detail";
import { ActionSection } from "@/components/Report";
import type { Criterion } from "@/lib/compete";
import { shortTitle, type ProductFacts, type ProductOption } from "@/lib/competeData";
import { CATEGORY_LABEL, compact, inr } from "@/lib/format";
import type { Bench } from "@/lib/price";
import { ProductHead } from "./Overview";

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

function sizesDetail(p: ProductFacts, std: number | null, perSheet = false) {
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
      <Points items={perSheet ? [`Sheet masks are compared per sheet: MRP ÷ sheets in the pack (${p.unitNote ?? "count not listed"}).`] : [
        std ? `Products are compared at the size closest to this category's usual ${std} ml/g (the most common full size in the top 100).` : "This category has no usual size, so the listed size is used.",
        p.sizeUsed ? `Used here: ${p.sizeUsed.ml} ml/g at MRP ${inr(p.sizeUsed.mrp)} (${p.sizeUsed.how === "matched" ? "closest size option" : "the listed size"}).` : "No size could be used.",
        "Minis and travel sizes under 15 ml/g are never used.",
      ]} />
    </>),
  };
}

export function PriceSection({ products, colors, bench, std, cat, optionsFor, onSwap }: {
  products: ProductFacts[]; colors: Record<string, string>; bench: Bench | null; std: number | null; cat: string;
  optionsFor: ((b: string) => ProductOption[]) | null; onSwap: (brand: string, pid: string) => void;
}) {
  const a = products.find((p) => p.role === "anchor");
  const perSheet = bench?.unit === "sheet" || cat === "sheet_mask"; const unit = perSheet ? "sheet" : "100 ml/g";
  const cols: GridCol[] = products.map((p) => ({ key: p.pid, anchor: p === a, head: <ProductHead p={p} color={colors[p.brand]} options={optionsFor?.(p.brand)} onSwap={(pid) => onSwap(p.brand, pid)} /> }));
  const criteria: Criterion<ProductFacts>[] = [
    { key: "mrp", label: "MRP", help: "List price on Nykaa (selling price and discount underneath)", better: null, value: (p) => p.mrp ?? p.price, show: () => "", cell: (p) => <Mrp p={p} /> },
    { key: "per100", label: `MRP per ${unit}`, help: perSheet ? "MRP ÷ number of sheets in the pack" : "MRP ÷ pack size × 100, at the size closest to the category's usual size", better: null,
      value: (p) => p.unit ?? p.perPiece, show: (p) => (p.unit ? r100(p.unit) : p.perPiece ? `${r100(p.perPiece)} / piece` : ""),
      sub: (p) => p.unitNote, missing: (p) => (p.unit ?? p.perPiece ? null : p.per100Why ?? "No size to compare") },
    { key: "vslead", label: "vs K-beauty leader", help: "MRP per unit against the K-beauty leader: the K-beauty product with the most reviews in this category's top 100", better: null,
      value: (p) => (p.unit && bench ? p.unit / bench.value - 1 : null),
      show: (p) => (p.pid === bench?.leader.product_id ? "The leader" : (() => { const d = p.unit! / bench!.value - 1; return Math.abs(d) < 0.05 ? "In line" : `${Math.round(Math.abs(d) * 100)}% ${d > 0 ? "above" : "below"}`; })()),
      missing: (p) => (!bench ? "No K-beauty product in today's top 100" : p.unit ? null : "No size to compare") },
  ];
  const extra: ExtraRow<ProductFacts>[] = [
    { key: "more", label: "Sizes and offer", render: (p) => (
      <div className="space-y-1 text-[12px]">
        <Opens detail={sizesDetail(p, std, perSheet)}><span className="text-ink-2">{p.sizes.length > 1 ? `${p.sizes.length} sizes` : p.sizes[0] ? `1 size (${p.sizes[0].pack})` : "Size not listed"}</span></Opens>
        <div className="leading-snug">{p.offer ? <Opens detail={{ kicker: `${p.brand} · offer on the listing`, title: shortTitle(p.name, p.brand), body: <p>{p.offer}</p> }}><span className="text-good">Offer on listing</span></Opens> : <span className="text-muted">No offer</span>}</div>
      </div>) },
  ];
  const pos = a?.unit && bench ? a.unit / bench.value - 1 : null;
  const cheaper = a?.unit ? products.filter((p) => p !== a && p.unit && p.unit < a.unit! * 0.95).length : 0;
  const lead = bench ? `${bench.leader.brand}'s ${shortTitle(bench.leader.name, bench.leader.brand)}` : "";
  const title = a && pos !== null && bench
    ? `At ${r100(a.unit!)} per ${unit}, ${shortTitle(a.name, a.brand)} is ${Math.abs(pos) < 0.05 ? "in line with" : `${Math.round(Math.abs(pos) * 100)}% ${pos > 0 ? "above" : "below"}`} the K-beauty leader, ${lead}; ${cheaper} of ${products.length - 1} rivals cost less.`
    : a?.mrp ? `${shortTitle(a.name, a.brand)} lists at ${inr(a.mrp)} MRP.` : `Prices in ${CATEGORY_LABEL[cat]}.`;
  return (
    <ActionSection id="price" kicker="Price · on MRP" title={title}
      note={bench ? <>Benchmark: the K-beauty leader, <b>{lead}</b> ({compact(bench.leader.reviews)} reviews, the most of any K-beauty product in today&rsquo;s {CATEGORY_LABEL[cat]} top 100{a?.brand ? `, ${a.brand}'s own excluded` : ""}): MRP {inr(bench.leader.mrp)} for {bench.leader.size} = <b>{r100(bench.value)}</b> per {unit}. For context, the whole top 100{bench.median ? <> has a median of {r100(bench.median)} (range {r100(bench.min!)}–{r100(bench.max!)}, {bench.n} products)</> : " has too few comparable products for a median"}. Price is a position, so it is never shaded green or red.</> : "No K-beauty product in today's top 100 to benchmark against."}>
      <CompareGrid cols={cols} items={products} criteria={criteria} extra={extra} labelWidth={150} />
    </ActionSection>
  );
}
