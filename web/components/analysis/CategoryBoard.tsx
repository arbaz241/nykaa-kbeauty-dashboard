"use client";

import { CATEGORY_LABEL, pct, signed } from "@/lib/format";
import type { CategoryCell } from "@/lib/analysis";
import { tr } from "@/lib/i18n";

/** Category board (owner 20 Oct 2026, replacing the bubble map): "0.3%… doesn't really make much sense". One row per
 *  category: how fast its written reviews grow (same products, with how much of its buying they hold), and where the
 *  anchor stands in it: its share of the category's buying and its place among the brands. Grouped by whether the
 *  anchor has a product in the top 100, so the reader sees presence first and growth next to it. */
export default function CategoryBoard({ cells, market, anchor, sells, onPick }: {
  cells: CategoryCell[]; market: number | null; anchor: string; sells: (cat: string) => number; onPick: (c: CategoryCell) => void;
}) {
  const placed = cells.filter((c) => c.growth !== null);
  const lo = Math.min(-0.2, ...placed.map((c) => c.growth!)); const hi = Math.max(0.4, ...placed.map((c) => c.growth!), market ?? 0);
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const groups = [
    { k: "in", t: tr(`${anchor} has a product in the top 100`, `${anchor} 상위 100위 제품 있음`), xs: cells.filter((c) => c.buying > 0 && c.anchorPlace !== null).sort((a, b) => (a.anchorPlace ?? 99) - (b.anchorPlace ?? 99)) },
    { k: "out", t: tr(`${anchor} has no product in the top 100`, `${anchor} 상위 100위 제품 없음`), xs: cells.filter((c) => c.buying > 0 && c.anchorPlace === null).sort((a, b) => (b.growth ?? -9) - (a.growth ?? -9)) },
    { k: "none", t: tr("Lists added after Nykaa froze rating counts (no buying yet)", "Nykaa 평가 수 동결 뒤 추가된 목록 (구매 집계 전)"), xs: cells.filter((c) => !c.buying) },
  ];
  const cols = "grid-cols-[minmax(130px,1fr)_minmax(220px,2fr)_minmax(170px,1.3fr)_minmax(150px,1fr)]";
  return (
    <div className="overflow-x-auto rounded-2xl bg-surface shadow-card ring-1 ring-line">
      <div className="min-w-[760px]">
        <div className={`grid ${cols} gap-4 border-b border-line px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted`}>
          <span>{tr("Category", "카테고리")}</span>
          <span>{tr("Written-review growth, same products", "작성 리뷰 성장률, 동일 제품")}<span className="block font-normal normal-case tracking-normal">{tr(`line = all tracked products ${signed(market)}`, `선 = 추적 전체 ${signed(market)}`)}</span></span>
          <span>{tr(`${anchor} in the category`, `카테고리 안 ${anchor}`)}<span className="block font-normal normal-case tracking-normal">{tr("share of its buying · place among brands", "구매 점유율 · 브랜드 순위")}</span></span>
          <span>{tr("Biggest brand", "최대 브랜드")}</span>
        </div>
        {groups.map((g) => g.xs.length > 0 && (
          <div key={g.k}>
            <div className="border-b border-line bg-page/60 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{g.t} · {g.xs.length}</div>
            {g.xs.map((c) => {
              const thin = !!c.thin && c.buying > 0;
              return (
                <button key={c.category} onClick={() => onPick(c)} className={`grid w-full ${cols} items-center gap-4 border-b border-line px-4 py-2.5 text-left last:border-0 hover:bg-sunken/60`}>
                  <span className="text-[13.5px] font-medium">{CATEGORY_LABEL[c.category] ?? c.category} <span className="text-muted">›</span></span>
                  <span>
                    {c.growth === null ? <span className="text-[12px] italic text-muted">{tr("no reading", "판단 불가")}</span> : (
                      <span className="flex items-center gap-2">
                        <span className="relative h-3 flex-1 rounded-sm bg-sunken">
                          <span className={`absolute top-0 h-3 rounded-sm ${thin ? "border border-dashed border-ink-2/50 bg-transparent" : c.growth >= (market ?? 0) ? "bg-brand" : "bg-brand/45"}`}
                            style={{ left: `${Math.min(x(0), x(c.growth))}%`, width: `${Math.max(0.8, Math.abs(x(c.growth) - x(0)))}%` }} />
                          <span className="absolute -top-0.5 h-4 w-px bg-ink/30" style={{ left: `${x(0)}%` }} />
                          {market !== null && <span className="absolute -top-1 h-5 w-0.5 rounded bg-accent-strong" style={{ left: `${x(market)}%` }} title={tr(`all tracked ${signed(market)}`, `추적 전체 ${signed(market)}`)} />}
                        </span>
                        <b className="w-12 text-right text-[13px] tabular">{signed(c.growth)}</b>
                      </span>
                    )}
                    <span className="mt-0.5 block text-[11px] text-muted">{c.buying ? tr(`${c.growthBase.products} products · ${pct(c.coverage)} of its buying${thin ? " · thin" : ""}`, `제품 ${c.growthBase.products}개 · 구매의 ${pct(c.coverage)}${thin ? " · 근거 부족" : ""}`) : tr(`${c.growthBase.products} products`, `제품 ${c.growthBase.products}개`)}</span>
                  </span>
                  <span className="text-[13px] tabular">
                    {!c.buying ? <span className="text-[12px] italic text-muted">{tr("no buying counted yet", "구매 집계 전")}</span>
                      : c.anchorPlace ? <><b>{c.anchorShare < 0.0005 ? "<0.1%" : pct(c.anchorShare, 1)}</b> <span className="text-ink-2">· #{c.anchorPlace} {tr(`of ${c.brandsCounted} brands`, `/ 브랜드 ${c.brandsCounted}곳`)}</span><span className="block text-[11px] text-muted">{tr(`${c.anchorProducts} product${c.anchorProducts === 1 ? "" : "s"} in the top 100`, `상위 100위 제품 ${c.anchorProducts}개`)}</span></>
                      : <span className="text-[12px] text-ink-2">{sells(c.category) ? tr(`sells ${sells(c.category)} on Nykaa, none ranks`, `Nykaa ${sells(c.category)}개 판매, 순위권 없음`) : tr("doesn't sell here", "미판매")}</span>}
                  </span>
                  <span className="text-[12.5px]">{c.leader.brand ? <><b className="font-medium">{c.leader.brand}</b> <span className="tabular text-ink-2">{pct(c.leader.share)}</span></> : <span className="text-muted">–</span>}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
