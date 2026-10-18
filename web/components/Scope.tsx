"use client";

import Link from "next/link";
import { ORIGIN_COLOR, ORIGIN_LABEL } from "@/lib/brands";
import { useScope, type OriginCount, type Scope } from "@/lib/scope";
import { tr } from "@/lib/i18n";
import type { Origin } from "@/lib/types";

/** What we track, the same four counts on every tab (owner 19 Oct 2026: "start with showing what is the actual
 *  measures"). The Brief shows them large; every other tab shows one line with the groups that tab uses lit. */
export type ScopeKey = "lists" | "selling" | "top100" | "followed";
const ORDER: Origin[] = ["kbeauty", "local", "global", "unknown"];
const n = (v: number) => v.toLocaleString("en-IN");

function OriginBar({ counts, unit }: { counts: OriginCount; unit: string }) {
  const tot = ORDER.reduce((a, o) => a + counts[o], 0) || 1;
  return (
    <div className="mt-3">
      <div className="flex h-2 overflow-hidden rounded-full bg-sunken">
        {ORDER.filter((o) => counts[o]).map((o) => <span key={o} style={{ width: `${(counts[o] / tot) * 100}%`, background: ORIGIN_COLOR[o].fill }} />)}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ink-2">
        {ORDER.filter((o) => counts[o]).map((o) => <span key={o} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: ORIGIN_COLOR[o].fill }} />{ORIGIN_LABEL[o]} <b className="tabular text-ink">{n(counts[o])}</b></span>)}
        <span className="text-muted">{unit}</span>
      </div>
    </div>
  );
}

const tiles = (s: Scope) => [
  { key: "lists" as const, big: n(s.lists), label: tr("Nykaa categories", "Nykaa 카테고리"),
    what: tr("Category lists we read every night: skincare and makeup (Nykaa's own lists, ranked by Nykaa's popularity order).", "매일 밤 읽는 카테고리 목록: 스킨케어·메이크업 (Nykaa 자체 목록, Nykaa 인기순)."),
    use: tr("Every tab", "모든 탭") },
  { key: "selling" as const, big: n(s.selling.brands), label: tr("brands selling in them", "판매 브랜드"),
    what: tr(`Every brand with at least one product in those categories, from Nykaa's brand filter (${n(s.selling.products)} product listings, all ranks). Nykaa sells 6,000+ brands overall.`, `해당 카테고리에 제품이 1개 이상 있는 모든 브랜드, Nykaa 브랜드 필터 기준 (제품 ${n(s.selling.products)}개, 전체 순위). Nykaa 전체 입점 브랜드는 6,000개 이상.`),
    use: tr("Brand counts, new brands", "브랜드 수, 신규 브랜드"), origin: s.selling.byOrigin, unit: tr("brands", "브랜드") },
  { key: "top100" as const, big: n(s.top100.products), label: tr(`products in today's top 100s · ${n(s.top100.brands)} brands`, `오늘 상위 100위 제품 · 브랜드 ${n(s.top100.brands)}개`),
    what: tr("The top 100 of each category, the products shoppers actually see and buy. Counted only where Nykaa files the product under that category.", "카테고리별 상위 100위: 소비자가 실제로 보고 사는 제품. Nykaa가 해당 카테고리로 분류한 제품만."),
    use: tr("Share of buying, places, prices, moves", "구매 점유율, 순위, 가격, 변동"), origin: s.top100.productsByOrigin, unit: tr("products", "제품") },
  { key: "followed" as const, big: n(s.followed.products), label: tr(`products followed month by month · ${n(s.followed.brands)} brands`, `월별 추적 제품 · 브랜드 ${n(s.followed.brands)}개`),
    what: tr("Products whose written reviews we read back through their whole history: the main brands' ranges, their closest rivals and, from 19 Oct, every category's top 30 (filling in over about a week). Growth is weighted by origin, so the mix of products we follow doesn't tilt it.", "작성 리뷰를 전체 이력까지 읽는 제품: 주요 브랜드 라인업, 가장 가까운 경쟁 제품, 10월 19일부터 카테고리별 상위 30위(약 1주에 걸쳐 채워짐). 성장률은 출신별로 가중 → 추적 제품 구성에 치우치지 않음."),
    use: tr("Growth, year on year", "전년 대비 성장률"), origin: s.followed.productsByOrigin, unit: tr("products", "제품") },
];

/** The Brief's opening: the four groups, large, with origin splits. */
export function ScopePanel() {
  const s = useScope();
  if (!s) return <div className="h-[220px] animate-pulse rounded-[18px] bg-sunken" />;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {tiles(s).map((t, i) => (
        <div key={t.key} className="relative flex flex-col rounded-[18px] bg-surface px-5 py-4 shadow-card ring-1 ring-line">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] text-on-brand">{i + 1}</span>{t.use}</div>
          <div className="mt-2 font-display text-[40px] font-semibold leading-none tracking-tight tabular">{t.big}</div>
          <div className="mt-1 text-[14px] font-semibold leading-snug">{t.label}</div>
          <p className="mt-2 text-[12.5px] leading-snug text-ink-2">{t.what}</p>
          {"origin" in t && t.origin && <OriginBar counts={t.origin} unit={t.unit!} />}
        </div>
      ))}
    </div>
  );
}

/** One line under each tab's title: the same four counts, the ones this tab uses lit, and what it measures. */
export function ScopeLine({ uses, measure }: { uses: ScopeKey[]; measure: React.ReactNode }) {
  const s = useScope();
  return (
    <div className="mt-5 rounded-[16px] bg-sunken/70 px-4 py-3 text-[12.5px] leading-snug">
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{tr("What we track", "추적 범위")}</span>
        {s ? tiles(s).map((t) => (
          <span key={t.key} title={t.what} className={`rounded-full px-2.5 py-0.5 ${uses.includes(t.key) ? "bg-brand text-on-brand" : "text-ink-2 ring-1 ring-line"}`}>
            <b className="tabular">{t.big}</b> {t.label}
          </span>
        )) : <span className="text-muted">…</span>}
        <Link href="/overview/#scope" className="ml-1 text-[12px] text-accent-strong underline decoration-line-2 underline-offset-2">{tr("How we count", "집계 기준")}</Link>
      </div>
      <div className="mt-2 text-ink-2"><b className="text-ink">{tr("This tab measures: ", "이 탭의 지표: ")}</b>{measure}</div>
    </div>
  );
}
