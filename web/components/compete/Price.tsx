"use client";

import CompareGrid, { type ExtraRow, type GridCol } from "@/components/CompareGrid";
import { DetailHead, Missing, Opens, Points } from "@/components/Detail";
import { ActionSection } from "@/components/Report";
import type { Criterion } from "@/lib/compete";
import { shortTitle, type ProductFacts, type ProductOption } from "@/lib/competeData";
import { CATEGORY_LABEL, compact, inr } from "@/lib/format";
import type { Bench } from "@/lib/price";
import { ProductHead } from "./Overview";
import { tr } from "@/lib/i18n";

const r100 = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

/** MRP first (the list price everyone compares), selling price and discount second. */
export function Mrp({ p }: { p: ProductFacts }) {
  if (!p.mrp && !p.price) return <Missing>{tr("No price on Nykaa", "Nykaa 가격 없음")}</Missing>;
  const off = p.discount && p.discount >= 1 ? Math.round(p.discount) : 0;
  return (
    <div className="tabular">
      <div className="text-[15px] font-semibold">{inr(p.mrp ?? p.price)}<span className="ml-1 text-[10.5px] font-normal text-muted">{p.mrp ? tr("MRP", "정가") : tr("price", "가격")}</span></div>
      <div className="text-[11.5px] text-ink-2">{off ? <>{tr("sells at", "판매가")} {inr(p.price)} · <span className="text-good">{tr(`${off}% off`, `${off}% 할인`)}</span></> : tr("no discount today", "오늘 할인 없음")}</div>
      {p.priceNote && <div className="text-[11px] text-muted">{p.priceNote}</div>}
    </div>
  );
}

function sizesDetail(p: ProductFacts, std: number | null, perSheet = false) {
  return {
    kicker: tr(`${p.brand} · sizes and prices`, `${p.brand} · 용량과 가격`), title: shortTitle(p.name, p.brand),
    body: (<>
      {p.sizes.length ? (
        <table className="w-full text-left text-[12.5px] tabular">
          <thead><tr className="border-b border-line text-[11px] uppercase tracking-[0.08em] text-muted"><th className="py-1.5 font-semibold">{tr("Size", "용량")}</th><th className="font-semibold">{tr("MRP", "정가")}</th><th className="font-semibold">{tr("Per 100 ml/g", "100 ml/g당")}</th><th className="font-semibold">{tr("Sells at", "판매가")}</th></tr></thead>
          <tbody>{p.sizes.map((s) => (
            <tr key={s.pack + s.mrp} className={`border-b border-line last:border-0 ${p.sizeUsed && s.ml === p.sizeUsed.ml ? "font-semibold" : ""}`}>
              <td className="py-1.5">{s.pack}{s.ml !== null && s.ml < 15 ? <span className="ml-1 text-[11px] font-normal text-muted">{tr("mini", "미니")}</span> : null}</td>
              <td>{inr(s.mrp)}</td><td>{s.ml && s.mrp ? r100((s.mrp / s.ml) * 100) : <Missing>{tr("size unclear", "용량 불명")}</Missing>}</td><td>{s.price ? inr(s.price) : <Missing>{tr("not listed", "표시 없음")}</Missing>}</td>
            </tr>))}</tbody>
        </table>
      ) : <p className="text-muted">{tr("Nykaa lists no size options for this product.", "Nykaa에 이 제품의 용량 옵션 없음.")}</p>}
      <DetailHead>{tr("How it is compared", "비교 방법")}</DetailHead>
      <Points items={perSheet ? [tr(`Sheet masks are compared per sheet: MRP ÷ sheets in the pack (${p.unitNote ?? "count not listed"}).`, `시트 마스크는 1매당 비교: 정가 ÷ 매수 (${p.unitNote ?? "매수 표시 없음"}).`)] : [
        std ? tr(`Products are compared at the size closest to this category's usual ${std} ml/g (the most common full size in the top 100).`, `이 카테고리 표준 용량 ${std} ml/g(상위 100위에서 가장 흔한 정규 용량)에 가장 가까운 용량으로 비교.`) : tr("This category has no usual size, so the listed size is used.", "이 카테고리는 표준 용량이 없어 표시된 용량 사용."),
        p.sizeUsed ? tr(`Used here: ${p.sizeUsed.ml} ml/g at MRP ${inr(p.sizeUsed.mrp)} (${p.sizeUsed.how === "matched" ? "closest size option" : "the listed size"}).`, `사용한 용량: ${p.sizeUsed.ml} ml/g, 정가 ${inr(p.sizeUsed.mrp)} (${p.sizeUsed.how === "matched" ? "가장 가까운 용량 옵션" : "표시된 용량"}).`) : tr("No size could be used.", "사용할 수 있는 용량 없음."),
        tr("Minis and travel sizes under 15 ml/g are never used.", "15 ml/g 미만 미니·여행용 용량은 제외."),
      ]} />
    </>),
  };
}

export function PriceSection({ products, colors, bench, std, cat, optionsFor, onSwap }: {
  products: ProductFacts[]; colors: Record<string, string>; bench: Bench | null; std: number | null; cat: string;
  optionsFor: ((b: string) => ProductOption[]) | null; onSwap: (brand: string, pid: string) => void;
}) {
  const a = products.find((p) => p.role === "anchor");
  const perSheet = bench?.unit === "sheet" || cat === "sheet_mask"; const unit = perSheet ? tr("sheet", "1매") : "100 ml/g";
  const cols: GridCol[] = products.map((p) => ({ key: p.pid, anchor: p === a, head: <ProductHead p={p} color={colors[p.brand]} options={optionsFor?.(p.brand)} onSwap={(pid) => onSwap(p.brand, pid)} /> }));
  const criteria: Criterion<ProductFacts>[] = [
    { key: "mrp", label: tr("MRP", "정가"), help: tr("List price on Nykaa (selling price and discount underneath)", "Nykaa 정가 (아래는 판매가와 할인율)"), better: null, value: (p) => p.mrp ?? p.price, show: () => "", cell: (p) => <Mrp p={p} /> },
    { key: "per100", label: tr(`MRP per ${unit}`, `${unit}당 정가`), help: perSheet ? tr("MRP ÷ number of sheets in the pack", "정가 ÷ 매수") : tr("MRP ÷ pack size × 100, at the size closest to the category's usual size", "정가 ÷ 용량 × 100, 카테고리 표준 용량에 가장 가까운 용량 기준"), better: null,
      value: (p) => p.unit ?? p.perPiece, show: (p) => (p.unit ? r100(p.unit) : p.perPiece ? tr(`${r100(p.perPiece)} / piece`, `개당 ${r100(p.perPiece)}`) : ""),
      sub: (p) => p.unitNote, missing: (p) => (p.unit ?? p.perPiece ? null : p.per100Why ?? tr("No size to compare", "비교할 용량 없음")) },
    { key: "vslead", label: tr("vs K-beauty leader", "K-뷰티 선두 대비"), help: tr("MRP per unit against the K-beauty leader: the K-beauty product with the most reviews in this category's top 100", "K-뷰티 선두 제품(이 카테고리 상위 100위에서 리뷰가 가장 많은 K-뷰티 제품) 대비 단위당 정가"), better: null,
      value: (p) => (p.unit && bench ? p.unit / bench.value - 1 : null),
      show: (p) => (p.pid === bench?.leader.product_id ? tr("The leader", "선두 제품") : (() => { const d = p.unit! / bench!.value - 1; return Math.abs(d) < 0.05 ? tr("In line", "비슷함") : tr(`${Math.round(Math.abs(d) * 100)}% ${d > 0 ? "above" : "below"}`, `${Math.round(Math.abs(d) * 100)}% ${d > 0 ? "비쌈" : "저렴"}`); })()),
      missing: (p) => (!bench ? tr("No K-beauty product in today's top 100", "오늘 상위 100위에 K-뷰티 제품 없음") : p.unit ? null : tr("No size to compare", "비교할 용량 없음")) },
  ];
  const extra: ExtraRow<ProductFacts>[] = [
    { key: "more", label: tr("Sizes and offer", "용량·프로모션"), render: (p) => (
      <div className="space-y-1 text-[12px]">
        <Opens detail={sizesDetail(p, std, perSheet)}><span className="text-ink-2">{p.sizes.length > 1 ? tr(`${p.sizes.length} sizes`, `용량 ${p.sizes.length}종`) : p.sizes[0] ? tr(`1 size (${p.sizes[0].pack})`, `용량 1종 (${p.sizes[0].pack})`) : tr("Size not listed", "용량 표시 없음")}</span></Opens>
        <div className="leading-snug">{p.offer ? <Opens detail={{ kicker: tr(`${p.brand} · offer on the listing`, `${p.brand} · 상품 프로모션`), title: shortTitle(p.name, p.brand), body: <p>{p.offer}</p> }}><span className="text-good">{tr("Offer on listing", "프로모션 있음")}</span></Opens> : <span className="text-muted">{tr("No offer", "프로모션 없음")}</span>}</div>
      </div>) },
  ];
  const pos = a?.unit && bench ? a.unit / bench.value - 1 : null;
  const cheaper = a?.unit ? products.filter((p) => p !== a && p.unit && p.unit < a.unit! * 0.95).length : 0;
  const lead = bench ? tr(`${bench.leader.brand}'s ${shortTitle(bench.leader.name, bench.leader.brand)}`, `${bench.leader.brand} ${shortTitle(bench.leader.name, bench.leader.brand)}`) : "";
  const title = a && pos !== null && bench
    ? tr(`At ${r100(a.unit!)} per ${unit}, ${shortTitle(a.name, a.brand)} is ${Math.abs(pos) < 0.05 ? "in line with" : `${Math.round(Math.abs(pos) * 100)}% ${pos > 0 ? "above" : "below"}`} the K-beauty leader, ${lead}; ${cheaper} of ${products.length - 1} rivals cost less.`,
      `${unit}당 ${r100(a.unit!)}인 ${shortTitle(a.name, a.brand)}: K-뷰티 선두 제품 ${lead} ${Math.abs(pos) < 0.05 ? "수준 가격" : `대비 ${Math.round(Math.abs(pos) * 100)}% ${pos > 0 ? "비쌈" : "저렴"}`}. 경쟁 제품 ${products.length - 1}개 중 ${cheaper}개가 더 저렴.`)
    : a?.mrp ? tr(`${shortTitle(a.name, a.brand)} lists at ${inr(a.mrp)} MRP.`, `${shortTitle(a.name, a.brand)} 정가: ${inr(a.mrp)}.`) : tr(`Prices in ${CATEGORY_LABEL[cat]}.`, `${CATEGORY_LABEL[cat]} 가격.`);
  return (
    <ActionSection id="price" kicker={tr("Price · on MRP", "가격 · 정가 기준")} title={title}
      note={bench ? tr(<>Benchmark: the K-beauty leader, <b>{lead}</b> ({compact(bench.leader.reviews)} reviews, the most of any K-beauty product in today&rsquo;s {CATEGORY_LABEL[cat]} top 100{a?.brand ? `, ${a.brand}'s own excluded` : ""}): MRP {inr(bench.leader.mrp)} for {bench.leader.size} = <b>{r100(bench.value)}</b> per {unit}. For context, the whole top 100{bench.median ? <> has a median of {r100(bench.median)} (range {r100(bench.min!)}–{r100(bench.max!)}, {bench.n} products)</> : " has too few comparable products for a median"}. Price is a position, so it is never shaded green or red.</>,
        <>기준: K-뷰티 선두 제품 <b>{lead}</b> (리뷰 {compact(bench.leader.reviews)}건, 오늘 {CATEGORY_LABEL[cat]} 상위 100위 K-뷰티 제품 중 최다{a?.brand ? `, ${a.brand} 제품 제외` : ""}): {bench.leader.size} 정가 {inr(bench.leader.mrp)} = {unit}당 <b>{r100(bench.value)}</b>. 참고로 상위 100위 전체{bench.median ? <>의 중앙값은 {r100(bench.median)} (범위 {r100(bench.min!)}–{r100(bench.max!)}, 제품 {bench.n}개)</> : "는 비교 가능한 제품이 적어 중앙값 없음"}. 가격은 위치일 뿐이라 초록·빨강 표시 안 함.</>)
        : tr("No K-beauty product in today's top 100 to benchmark against.", "오늘 상위 100위에 기준으로 삼을 K-뷰티 제품 없음.")}>
      <CompareGrid cols={cols} items={products} criteria={criteria} extra={extra} labelWidth={150} />
    </ActionSection>
  );
}
