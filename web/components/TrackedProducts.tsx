"use client";

import { useMemo } from "react";
import { useDetail } from "./Detail";
import { BrandLink } from "./Links";
import { useMarket } from "@/lib/useMarket";
import { monthWindow } from "@/lib/period";
import { ORIGIN_LABEL } from "@/lib/brands";
import { pct, signed } from "@/lib/format";
import { tr } from "@/lib/i18n";

/** "All tracked products" (owner 19 Oct 2026: keep the comparison, label it properly, and on a click show which brands
 *  and products it is). The products whose full review history we read; growth counts those that already had reviews
 *  a year earlier (the site-wide rule, lib/profile sameProductGrowth). Not Nykaa: the panel says how much of today's
 *  top-100 buying they cover. */
export function TrackedLink({ children }: { children?: React.ReactNode }) {
  const open = useDetail();
  return (
    <button type="button" onClick={() => open({ kicker: tr("What “all tracked products” means", "‘추적 전체 제품’이란"), title: tr("The products whose reviews we follow", "리뷰를 추적하는 제품"), body: <TrackedPanel /> })}
      className="cursor-pointer underline decoration-line-2 decoration-dotted underline-offset-2 hover:decoration-ink">
      {children ?? tr("all tracked products", "추적 전체 제품")}
    </button>
  );
}

const ORDER = ["kbeauty", "local", "global", "unknown"];

function TrackedPanel() {
  const { latest, pool, flow, originOf } = useMarket();
  const data = useMemo(() => {
    if (!latest || !pool.length) return null;
    const w = monthWindow(latest, 3, "yoy");
    const sum = (by: Map<string, number>, ms: string[]) => ms.reduce((a, k) => a + (by.get(k) ?? 0), 0);
    const brands = new Map<string, { brand: string; origin: string; products: number; counted: number; recent: number; base: number }>();
    const countedIds = new Set<string>();
    for (const p of pool) {
      const b = brands.get(p.brand) ?? { brand: p.brand, origin: originOf(p.brand), products: 0, counted: 0, recent: 0, base: 0 };
      b.products++;
      const base = p.coverage <= w.base[0] ? sum(p.byMonth, w.base) : 0;
      if (base > 0) { b.counted++; b.base += base; b.recent += sum(p.byMonth, w.recent); for (const id of p.members ?? [p.product_id]) countedIds.add(id); }
      brands.set(p.brand, b);
    }
    const all = [...brands.values()];
    const recent = all.reduce((a, b) => a + b.recent, 0); const base = all.reduce((a, b) => a + b.base, 0);
    // how much of today's top-100 buying these products are (one row per product)
    const seen = new Set<string>(); let tot = 0; let cov = 0;
    for (const r of flow) { if (seen.has(r.product_id)) continue; seen.add(r.product_id); tot += r.value; if (countedIds.has(r.product_id)) cov += r.value; }
    const groups = ORDER.map((o) => ({ o, rows: all.filter((b) => b.origin === o).sort((a, b) => b.products - a.products || a.brand.localeCompare(b.brand)) })).filter((g) => g.rows.length);
    return { w, brands: all.length, products: pool.length, counted: all.reduce((a, b) => a + b.counted, 0), growth: base > 0 ? recent / base - 1 : null, cover: tot > 0 ? cov / tot : null, groups };
  }, [latest, pool, flow, originOf]);

  if (!data) return <p className="text-muted">{tr("Loading…", "불러오는 중…")}</p>;
  const { w, groups } = data;
  return (
    <div className="space-y-4 text-[13px] leading-relaxed">
      <p>{tr(<>The products whose full history of written reviews we read from Nykaa, each review with its date: <b>{data.products} products from {data.brands} brands</b> (sizes that share one set of reviews count once). They were picked from Innisfree, the main brands and their rivals; every list&rsquo;s top 30 is being added from 19 Oct.</>,
        <>Nykaa에서 작성 리뷰 전체 이력(리뷰마다 작성일 포함)을 읽는 제품: <b>{data.brands}개 브랜드, {data.products}개 제품</b> (같은 리뷰를 공유하는 용량은 1개로 집계). Innisfree·주요 브랜드·경쟁 브랜드에서 선정, 10월 19일부터 목록별 상위 30위 추가 중.</>)}</p>
      <div className="rounded-xl bg-sunken px-4 py-3">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{tr("Their growth", "성장률")}</div>
        <div className="mt-1"><b className="text-[18px] tabular">{signed(data.growth)}</b> {tr(`written reviews in ${w.recentLabel} vs ${w.baseLabel}, counting the ${data.counted} products that already had reviews a year earlier.`, `${w.recentLabel} 작성 리뷰 vs ${w.baseLabel}, 1년 전에도 리뷰가 있던 ${data.counted}개 제품 기준.`)}</div>
      </div>
      <p className="text-ink-2">{tr(<>This is the bar a brand has to beat <b>inside our data</b>, not Nykaa&rsquo;s growth. Most of these products are Korean, and the {data.counted} products in the growth figure are {data.cover !== null ? <b>{pct(data.cover, 0)}</b> : "a small part"} of the buying on today&rsquo;s top-100 lists. Nykaa&rsquo;s own reported growth is on the Brief.</>,
        <>우리 데이터 <b>안에서</b> 브랜드가 넘어야 할 기준선일 뿐 Nykaa 성장률 아님. 대부분 K-뷰티 제품이고, 성장률에 들어간 {data.counted}개 제품은 오늘 상위 100위 구매의 {data.cover !== null ? <b>{pct(data.cover, 0)}</b> : "일부"}. Nykaa 공식 성장률은 브리핑 참고.</>)}</p>
      {groups.map((g) => (
        <div key={g.o}>
          <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{ORIGIN_LABEL[g.o]} · {tr(`${g.rows.length} brands, ${g.rows.reduce((a, b) => a + b.products, 0)} products`, `브랜드 ${g.rows.length}개, 제품 ${g.rows.reduce((a, b) => a + b.products, 0)}개`)}</div>
          <table className="w-full text-[12.5px]">
            <thead><tr className="border-b border-line text-left text-[11px] text-muted"><th className="py-1 font-medium">{tr("Brand", "브랜드")}</th><th className="py-1 text-right font-medium">{tr("Products", "제품")}</th><th className="py-1 text-right font-medium">{tr("In growth", "성장률 포함")}</th><th className="py-1 text-right font-medium">{tr("Growth", "성장률")}</th></tr></thead>
            <tbody>{g.rows.map((b) => (
              <tr key={b.brand} className="border-b border-line/50">
                <td className="py-1"><BrandLink brand={b.brand} /></td>
                <td className="py-1 text-right tabular">{b.products}</td>
                <td className="py-1 text-right tabular">{b.counted}</td>
                <td className="py-1 text-right tabular">{b.base <= 0 ? "–" : b.base < 30 ? <span className="text-muted" title={tr(`${b.base} reviews a year earlier`, `1년 전 리뷰 ${b.base}건`)}>{signed(b.recent / b.base - 1)}*</span> : signed(b.recent / b.base - 1)}</td>
              </tr>))}</tbody>
          </table>
        </div>
      ))}
      <p className="text-[12px] text-muted">{tr("* Small base: under 30 reviews a year earlier, so the percentage swings a lot. ", "* 표본 적음: 1년 전 리뷰 30건 미만 → 비율 변동 큼. ")}{tr("“In growth” = products that already had reviews a year earlier and whose history reaches back that far (Nykaa shows only a product’s latest ~1,000 reviews). The others launched since, sold too little then, or sell so much that their older reviews are hidden.", "‘성장률 포함’ = 1년 전에도 리뷰가 있고 이력이 그 시점까지 닿는 제품 (Nykaa는 제품별 최근 약 1,000개 리뷰만 표시). 나머지는 이후 출시, 당시 판매 적음, 또는 판매가 많아 과거 리뷰가 가려진 제품.")}</p>
    </div>
  );
}
