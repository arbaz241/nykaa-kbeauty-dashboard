"use client";

import { tr } from "@/lib/i18n";

/** "How this page works", at the bottom of every tab, always open (plan v4, owner 18 Oct 2026: "show what the
 *  assumptions are, how we have calculated and reached a particular answer"). One layout everywhere: where the
 *  numbers come from, how they're calculated, what we assume, and the limits. */
export interface MethodParts { sources: React.ReactNode[]; calc: React.ReactNode[]; assume: React.ReactNode[]; limits: React.ReactNode[] }

export default function MethodNotes({ parts, id = "method" }: { parts: MethodParts; id?: string }) {
  const cols: [string, React.ReactNode[]][] = [
    [tr("Where the numbers come from", "숫자의 출처"), parts.sources],
    [tr("How they're calculated", "계산 방법"), parts.calc],
    [tr("What we assume", "가정"), parts.assume],
    [tr("Limits", "한계"), parts.limits],
  ];
  return (
    <section id={id} className="mt-14 scroll-mt-32 border-t border-line pt-8">
      <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-strong">{tr("How this page works", "이 페이지의 계산 방법")}</div>
      <h2 className="mt-1 font-display text-[22px] font-semibold tracking-tight">{tr("Sources, calculations, assumptions and limits", "출처, 계산, 가정, 한계")}</h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {cols.filter(([, xs]) => xs.length).map(([t, xs]) => (
          <div key={t} className="rounded-[16px] bg-sunken px-5 py-4">
            <div className="text-[13px] font-semibold text-ink">{t}</div>
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[13px] leading-relaxed text-ink-2">{xs.map((x, i) => <li key={i}>{x}</li>)}</ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The parts every tab built on share of buying repeats. */
export const BUYING_METHOD = () => ({
  calc: [
    tr(<><b>Share of buying</b> = a product&rsquo;s new ratings over the period × its price, out of all products in the same category (all brands = 100%). <b>Units</b> = new ratings alone.</>,
      <><b>구매 점유율</b> = 기간 중 제품의 신규 평가 수 × 가격을, 같은 카테고리 전체 제품(모든 브랜드 = 100%) 대비로 계산. <b>수량</b> = 신규 평가 수만.</>),
    tr(<><b>Own category only:</b> a product counts in a list only when Nykaa files it under that category that day (its L3 label); ranks are renumbered among those products. Nykaa&rsquo;s own position is shown in Details.</>,
      <><b>자기 카테고리만:</b> 그날 Nykaa가 해당 카테고리(L3 라벨)로 분류한 제품만 집계하고, 그 제품들 사이에서 순위를 다시 매깁니다. Nykaa 페이지 순위는 상세 정보에 표시합니다.</>),
    tr(<><b>Shared ratings counted once:</b> when Nykaa shows one rating count for several of a brand&rsquo;s products (e.g. 20 Nykaa sheet masks share 7.6 million ratings), it counts once, at the median price of those products.</>,
      <><b>공유 평가는 한 번만:</b> Nykaa가 한 브랜드의 여러 제품에 하나의 평가 수를 보여주면(예: Nykaa 시트 마스크 20종이 760만 건 공유) 그 제품들의 중간 가격으로 한 번만 셉니다.</>),
    tr("Combos and kits are left out: Nykaa shows them with their contents' ratings.", "세트·키트는 제외: Nykaa가 구성품의 평가를 합쳐 보여줍니다."),
  ],
  assume: [
    tr("Ratings rise in step with sales, at a similar rate across brands in a category.", "평가는 판매와 함께 늘고, 같은 카테고리 안에서는 브랜드 간 비율이 비슷하다고 가정합니다."),
    tr("Nykaa's rank order reflects what sells, plus paid spots and new launches.", "Nykaa 순위는 판매에 광고 자리와 신제품을 더해 반영한다고 봅니다."),
  ],
  limits: [
    tr("Nykaa has not updated rating counts since 10 Oct, so buying figures end on 9 Oct. Written-review counts are collected nightly from 18 Oct as a stand-in, not yet used.", "Nykaa가 10월 10일부터 평가 수를 갱신하지 않아 구매 수치는 10월 9일에 멈춰 있습니다. 대안으로 10월 18일부터 작성 리뷰 수를 매일 수집하지만 아직 쓰지 않습니다."),
    tr("A brand that asks buyers for ratings more often looks bigger than it is. Compare shares within a category, not across categories.", "평가를 더 자주 요청하는 브랜드는 실제보다 커 보입니다. 점유율은 카테고리 안에서만 비교하세요."),
  ],
});
