"use client";

import Link from "next/link";
import { ORIGIN_COLOR, ORIGIN_LABEL } from "@/lib/brands";
import { useScope, type OriginCount, type Scope } from "@/lib/scope";
import { tr } from "@/lib/i18n";
import type { Origin } from "@/lib/types";

/** What we track, the same counts on every tab (owner 19 Oct 2026: "start with showing what is the actual measures";
 *  four loose tiles still read as four unrelated totals). Two things are counted, brands and products, at three
 *  depths inside the same categories, each a smaller group than the one before. The Brief shows them large; every
 *  other tab shows one line with the depths that tab uses lit. */
export type ScopeKey = "selling" | "top100" | "followed";
const ORDER: Origin[] = ["kbeauty", "local", "global", "unknown"];
const n = (v: number) => v.toLocaleString("en-IN");

function OriginBar({ counts }: { counts: OriginCount }) {
  const tot = ORDER.reduce((a, o) => a + counts[o], 0) || 1;
  return (
    <div className="mt-2">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-sunken">
        {ORDER.filter((o) => counts[o]).map((o) => <span key={o} style={{ width: `${(counts[o] / tot) * 100}%`, background: ORIGIN_COLOR[o].fill }} />)}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-ink-2">
        {ORDER.filter((o) => counts[o]).map((o) => <span key={o} className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: ORIGIN_COLOR[o].fill }} />{ORIGIN_LABEL[o]} <b className="tabular text-ink">{n(counts[o])}</b></span>)}
      </div>
    </div>
  );
}

const depths = (s: Scope) => [
  { key: "selling" as const, title: tr(`Sell in our ${s.lists} categories`, `우리 ${s.lists}개 카테고리에서 판매`),
    brands: s.selling.brands, products: s.selling.products, productsNote: tr("listings", "개 등록"), origin: s.selling.byOrigin,
    what: tr("Every brand with at least one product in these categories, at any rank: Nykaa's own brand filter. Nykaa sells 6,000+ brands across all its categories.", "이 카테고리에 제품이 하나라도 있는 모든 브랜드(순위 무관), Nykaa 브랜드 필터 기준. Nykaa 전체 입점 브랜드는 6,000개 이상."),
    use: tr("Counting brands; spotting new ones", "브랜드 수, 신규 브랜드") },
  { key: "top100" as const, title: tr("Reach a top 100 today", "오늘 상위 100위 안"),
    brands: s.top100.brands, products: s.top100.products, origin: s.top100.byOrigin,
    what: tr("Of those, the brands with a product in today's top 100 of a category, and those products: what shoppers actually see and buy.", "그중 오늘 카테고리 상위 100위에 제품이 든 브랜드와 그 제품: 소비자가 실제로 보고 사는 것."),
    use: tr("Share of buying, ranks, prices, moves", "구매 점유율, 순위, 가격, 변동") },
  { key: "followed" as const, title: tr("Followed month by month", "월별 추적"),
    brands: s.followed.brands, products: s.followed.products, origin: s.followed.byOrigin,
    what: tr("Products whose written reviews we read back two years, to compare with a year ago. Not a slice of step 2: Innisfree's whole range and the main brands' best sellers, about half of them in today's top 100s; from 19 Oct also the top 30 of every category (filling in over about a week).", "1년 전과 비교하려고 작성 리뷰를 2년 전까지 읽는 제품. 2단계의 일부가 아님: Innisfree 전체 라인업과 주요 브랜드 베스트셀러(약 절반이 오늘 상위 100위 안), 10월 19일부터 카테고리별 상위 30위도 추가(약 1주에 걸쳐 채워짐)."),
    use: tr("Growth against a year ago", "전년 대비 성장률") },
];

/** The Brief's opening: brands and products at three depths, with origin splits. */
export function ScopePanel() {
  const s = useScope();
  if (!s) return <div className="h-[260px] animate-pulse rounded-[18px] bg-sunken" />;
  return (
    <div className="rounded-[20px] bg-sunken/60 p-3 md:p-4">
      <div className="px-2 pb-3 text-[13px] text-ink-2">{tr(<>Everything below is inside the same <b className="text-ink">{s.lists} Nykaa categories</b>. Step 2 is taken from step 1. Step 3 is a deeper read of chosen products, not a smaller slice of step 2.</>, <>아래 숫자는 모두 같은 <b className="text-ink">Nykaa 카테고리 {s.lists}개</b> 안. 2단계는 1단계에서 추린 것, 3단계는 고른 제품을 깊이 읽는 것(2단계의 일부가 아님).</>)}</div>
      <div className="grid gap-3 lg:grid-cols-3">
        {depths(s).map((d, i) => (
          <div key={d.key} className="relative flex flex-col rounded-[16px] bg-surface px-5 py-4 shadow-card ring-1 ring-line">
            {i === 1 && <span aria-hidden className="absolute -left-[13px] top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-surface text-[13px] text-muted ring-1 ring-line lg:grid">›</span>}
            <div className="flex items-center gap-2 text-[13px] font-semibold"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] text-on-brand">{i + 1}</span>{d.title}</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div><div className="font-display text-[34px] font-semibold leading-none tracking-tight tabular">{n(d.brands)}</div><div className="mt-1 text-[12px] font-semibold text-ink-2">{tr("brands", "브랜드")}</div></div>
              <div><div className="font-display text-[34px] font-semibold leading-none tracking-tight tabular text-ink-2">{n(d.products)}</div><div className="mt-1 text-[12px] font-semibold text-ink-2">{tr("products", "제품")}{d.productsNote ? <span className="font-normal text-muted"> ({d.productsNote})</span> : null}</div></div>
            </div>
            <OriginBar counts={d.origin} />
            <p className="mt-3 text-[12.5px] leading-snug text-ink-2">{d.what}</p>
            <div className="mt-auto pt-3 text-[12px]"><span className="text-muted">{tr("Used for: ", "용도: ")}</span><b>{d.use}</b></div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One line under each tab's title: the same three depths, the ones this tab uses lit, and what it measures. */
export function ScopeLine({ uses, measure }: { uses: ScopeKey[]; measure: React.ReactNode }) {
  const s = useScope();
  return (
    <div className="mt-5 rounded-[16px] bg-sunken/70 px-4 py-3 text-[12.5px] leading-snug">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{s ? tr(`What we track · ${s.lists} categories`, `추적 범위 · 카테고리 ${s.lists}개`) : tr("What we track", "추적 범위")}</span>
        {s ? depths(s).map((d, i) => (
          <span key={d.key} title={d.what} className={`rounded-full px-2.5 py-0.5 ${uses.includes(d.key) ? "bg-brand text-on-brand" : "text-ink-2 ring-1 ring-line"}`}>
            {i + 1}. {d.title}: <b className="tabular">{n(d.brands)}</b> {tr("brands", "브랜드")} · <b className="tabular">{n(d.products)}</b> {tr("products", "제품")}
          </span>
        )) : <span className="text-muted">…</span>}
        <Link href="/overview/#scope" className="ml-1 text-[12px] text-accent-strong underline decoration-line-2 underline-offset-2">{tr("How we count", "집계 기준")}</Link>
      </div>
      <div className="mt-2 text-ink-2"><b className="text-ink">{tr("This tab measures: ", "이 탭의 지표: ")}</b>{measure}</div>
    </div>
  );
}
