"use client";

import CompareGrid, { type ExtraRow, type GridCol } from "@/components/CompareGrid";
import { ActionSection } from "@/components/Report";
import type { Criterion } from "@/lib/compete";
import { shortTitle, type ProductFacts, type ProductOption } from "@/lib/competeData";
import type { Bench } from "@/lib/price";
import { tr } from "@/lib/i18n";
import { ProductHead } from "./Overview";
import { pricePart } from "./Price";
import { buyersPart, shelfPart } from "./Reception";

/** Every measured fact about the compared products in one table (owner 20 Oct 2026: "show information in one way, in
 *  one place"; less space). Price, what buyers say, shelf and search, and demand were four sections, each repeating
 *  the product header; now one header, one table, and each group opens with the headline its section had. The
 *  message read (claims, from the AI run) stays its own section below. */
export function ProductTable({ products, colors, bench, std, cat, optionsFor, onSwap, loading, leaderName }: {
  products: ProductFacts[]; colors: Record<string, string>; bench: Bench | null; std: number | null; cat: string; leaderName?: string | null;
  optionsFor: ((b: string) => ProductOption[]) | null; onSwap: (brand: string, pid: string) => void; loading: boolean;
}) {
  const a = products.find((p) => p.role === "anchor");
  const price = pricePart({ products, bench, std, cat, leaderName });
  const buyers = buyersPart({ products, loading });
  const shelf = shelfPart({ products, colors, cat });
  const cols: GridCol[] = products.map((p) => ({ key: p.pid, anchor: p === a, short: <>{p.brand} <span className="font-normal text-ink-2">· {shortTitle(p.name, p.brand)}</span></>, head: <ProductHead p={p} color={colors[p.brand]} options={optionsFor?.(p.brand)} onSwap={(pid) => onSwap(p.brand, pid)} /> }));
  const criteria: Criterion<ProductFacts>[] = [...price.criteria, ...buyers.criteria, ...shelf.criteria];
  const extra: ExtraRow<ProductFacts>[] = [...price.extra, ...buyers.extra, ...shelf.extra];
  return (
    <ActionSection id="table" kicker={tr("Side by side · price, buyers, shelf and demand", "비교표 · 가격, 구매자 반응, 랭킹, 수요")}
      title={a ? tr(`${shortTitle(a.name, a.brand)} against ${products.length - 1} rival product${products.length === 2 ? "" : "s"}, measure by measure.`, `${shortTitle(a.name, a.brand)} vs 경쟁 제품 ${products.length - 1}개, 지표별 비교.`) : tr("The rival products, measure by measure.", "경쟁 제품 지표별 비교.")}
      note={shelf.note}>
      <CompareGrid cols={cols} items={products} criteria={criteria} extra={extra} colors={products.map((p) => colors[p.brand])} labelWidth={150}
        groups={{
          mrp: { id: "price", label: tr("Price · on MRP", "가격 · 정가 기준"), title: price.title },
          rating: { id: "buyers", label: tr("What buyers say · reviews", "구매자 반응 · 리뷰"), title: buyers.title },
          rank: { id: "visibility", label: tr("Shelf and search", "랭킹·검색"), title: shelf.shelfTitle },
          demand: { id: "demand", label: tr("Demand · written reviews", "수요 · 리뷰"), title: shelf.demandTitle },
        }} />
      <div className="mt-3 grid gap-2 text-[12px] leading-relaxed text-muted md:grid-cols-2">
        <p><b className="font-medium text-ink-2">{tr("Price: ", "가격: ")}</b>{price.note}</p>
        <p><b className="font-medium text-ink-2">{tr("Buyers: ", "구매자: ")}</b>{buyers.note}</p>
      </div>
    </ActionSection>
  );
}
