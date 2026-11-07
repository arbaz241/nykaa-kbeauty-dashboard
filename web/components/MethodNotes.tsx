"use client";

import { isValidElement } from "react";
import Link from "next/link";
import { dayMonth, tr } from "@/lib/i18n";

/** "How this page works", at the bottom of every tab, always open (plan v4, owner 18 Oct 2026: "show what the
 *  assumptions are, how we have calculated and reached a particular answer"). One layout everywhere: where the
 *  numbers come from, how they're calculated, what we assume, and the limits. */
export interface MethodParts { sources: React.ReactNode[]; calc: React.ReactNode[]; assume: React.ReactNode[]; limits: React.ReactNode[] }

/** A rule every tab shares (share of buying, growth, own category…). Written out in full once, on the Brief
 *  (owner 20 Oct 2026: "show information in one way, in one place"); the other tabs link to it. */
export function Shared({ children }: { children: React.ReactNode }) { return <>{children}</>; }
const isShared = (x: React.ReactNode) => isValidElement(x) && x.type === Shared;

export default function MethodNotes({ parts, id = "method", full = false }: { parts: MethodParts; id?: string; full?: boolean }) {
  const own = (xs: React.ReactNode[]) => (full ? xs : xs.filter((x) => !isShared(x)));
  const hadShared = !full && [...parts.calc, ...parts.assume, ...parts.limits].some(isShared);
  const cols: [string, React.ReactNode[]][] = [
    [tr("Where the numbers come from", "숫자의 출처"), own(parts.sources)],
    [tr("How they're calculated", "계산 방법"), [...(hadShared ? [tr(<>The rules every tab shares (share of buying, own category only, shared ratings counted once, the buying window, growth) and their assumptions and limits are on the Brief: <Link href="/overview/#method" className="font-medium text-accent-strong underline underline-offset-2">how the numbers work</Link>.</>, <>모든 탭 공통 규칙(판매 점유율, 자기 카테고리만, 공유 평가 1회 집계, 판매 집계 기간, 성장률)과 가정·한계는 브리핑에: <Link href="/overview/#method" className="font-medium text-accent-strong underline underline-offset-2">계산 방법</Link>.</>)] : []), ...own(parts.calc)]],
    [tr("What we assume", "가정"), own(parts.assume)],
    [tr("Limits", "한계"), own(parts.limits)],
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
export const BUYING_METHOD = (span?: { start: string; end: string } | null) => ({
  calc: [
    <Shared key={2}>{tr(<><b>Share of buying</b> = a product&rsquo;s estimated buyers × its MRP (the printed price, which doesn&rsquo;t move with sales), out of all products in the same category (all brands = 100%). Estimated buyers = its reviews a month over the last two complete months × the category&rsquo;s typical ratings per review, the same figure for every brand (many top sellers show one rating count for a whole range, so brand-by-brand figures from those counts were unreliable). A week far above a product&rsquo;s usual week counts at most 4 × its usual week (one-off review bursts). A launch whose page shows fewer than 2 ratings per review (reviews from samples) counts only the ratings people leave without a review, at its recent pace. When Nykaa&rsquo;s list shows a mini size (15 ml or less) of a page whose reviews cover the full size too, its price is the average of the mini and the full size. A face sleeping mask counts in masks, even where Nykaa labels it a night cream.</>,
      <><b>판매 점유율</b> = 제품 추정 구매자 × 정가(MRP), 같은 카테고리 전체 제품(모든 브랜드 = 100%) 대비 비중. 추정 구매자 = 최근 완결 2개월 월평균 리뷰 × 카테고리 일반 리뷰당 평가 수(모든 브랜드 동일 — 상위 제품 다수가 라인 전체 평가 수를 하나로 표시해 브랜드별 수치는 신뢰도 낮음). 평소보다 크게 몰린 주의 리뷰는 평소 주의 최대 4배까지만 반영. 리뷰당 평가 2건 미만인 신제품(샘플 리뷰) → 리뷰 없이 남긴 평가만 최근 속도로 반영. 리스트에 미니 용량(15ml 이하)이 표시되고 리뷰가 정규 용량과 같이 묶인 경우 → 가격 = 미니와 정규 용량 가격의 평균. 페이스 슬리핑 마스크는 Nykaa가 나이트 크림으로 분류해도 마스크로 집계.</>)}</Shared>,
    <Shared key={3}>{tr(<><b>Own category only:</b> a product counts in a list only when Nykaa files it under that category that day (its L3 label); ranks are renumbered among those products. Nykaa&rsquo;s own position is shown in Details.</>,
      <><b>자기 카테고리만:</b> 그날 Nykaa가 해당 카테고리(L3 라벨)로 분류한 제품만 집계, 그 제품끼리 순위를 다시 매김. Nykaa 페이지 순위는 상세 정보에 표시.</>)}</Shared>,
    <Shared key={4}>{tr(<><b>Typical ratings per review:</b> for each category, the middle product among those whose Nykaa page shows both a rating count and a review count (e.g. about 5 for lip tint, 10 for serum, 16 for moisturiser). A middle product ignores the few pages whose one rating count covers a whole range. Sizes that share one set of reviews count once.</>,
      <><b>리뷰당 평가 수:</b> 카테고리별로 Nykaa 페이지에 평가 수와 리뷰 수가 모두 보이는 제품 중 중간값 (예: 립 틴트 약 5, 세럼 10, 모이스처라이저 16). 중간값이라 라인 전체 평가 수를 하나로 표시하는 일부 페이지 영향 없음. 용량별 공유 리뷰는 한 번만.</>)}</Shared>,
    <Shared key={5}>{tr("Combos and kits are left out: they carry their contents' reviews.", "세트·키트 제외: 구성품 리뷰가 합쳐져 있기 때문.")}</Shared>,
    <Shared key={6}>{tr(`Share of buying covers the last two complete months, as a monthly average${span ? ` (${dayMonth(span.start)} – ${dayMonth(span.end)})` : ""} and moves on each month; the "moves over" switch changes rank moves only.`,
      `판매 점유율: 최근 완결 2개월 월평균${span ? ` (${dayMonth(span.start)}–${dayMonth(span.end)})` : ""}, 매달 갱신. "변동 기간" 선택은 순위 변동에만 적용.`)}</Shared>,
    <Shared key={7}>{tr("Growth (same rule on every page): written reviews in the last 3 complete months against the same months a year earlier, only products that already had reviews then; launches since are counted apart.", "성장률 (모든 페이지 동일 기준): 최근 완결된 3개월 리뷰를 전년 같은 달과 비교, 그때도 리뷰가 있던 제품만. 이후 출시 제품은 따로 집계.")}</Shared>,
  ],
  assume: [
    <Shared key={10}>{tr("A brand's buyers keep writing reviews at about the rate seen 13 Sep – 9 Oct.", "브랜드 구매자의 리뷰 작성 비율이 9월 13일–10월 9일 수준으로 유지된다고 가정.")}</Shared>,
    <Shared key={11}>{tr("Nykaa's rank order reflects what sells, plus paid spots and new launches.", "Nykaa 순위 = 판매 + 광고 구좌 + 신제품이 반영된 것으로 봄.")}</Shared>,
  ],
  limits: [
    <Shared key={14}>{tr("An estimate: tested on 13 Sep – 9 Oct, a brand's share was within about 2 points (median). A share resting on a few dozen reviews is rougher, and a brand that starts asking buyers for reviews would look bigger. Rates are learned again if Nykaa's rating counts move.", "추정치: 9월 13일–10월 9일 검증 시 브랜드 점유율 오차 중앙값 약 2%p. 리뷰 수십 건 기준 점유율은 오차 큼, 리뷰 요청을 늘린 브랜드는 크게 보일 수 있음. Nykaa 평가 수가 다시 움직이면 작성률 재계산.")}</Shared>,
    <Shared key={15}>{tr("Compare shares within a category; across categories they assume buyers rate at similar rates everywhere.", "점유율은 같은 카테고리 안에서 비교. 카테고리 간 비교는 평가 습관이 비슷하다는 가정.")}</Shared>,
  ],
});
