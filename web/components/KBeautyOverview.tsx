"use client";

import { useMemo } from "react";
import PeriodBar from "./PeriodBar";
import { Card, Stat } from "./ui";
import { ActionSection } from "./Report";
import { Basis, Def } from "./Tiered";
import { FOCUS_BRANDS, norm, resolveBrand } from "@/lib/brands";
import { useBrandOffers, useCategoryBrands, useHomepage } from "@/lib/data";
import { compact, pct, signed } from "@/lib/format";
import { aggregate, catsOn, classifyOffer, homepageRuns, placesOn, uniqueFlow } from "@/lib/market";
import { spanLabel } from "@/lib/period";
import { LATEST_REPORTED, NYKAA_REPORTED } from "@/lib/reference";
import { reviewTrend } from "@/lib/profile";
import { BrandLink } from "./Links";
import type { Tiers } from "@/lib/tiers";
import { useMarket } from "@/lib/useMarket";
import { dayMonth, tr } from "@/lib/i18n";

const pts = (v: number) => signed(v, 1).replace("%", tr(" pts", "%p"));

/** Round 4, step 4 of the story: K-beauty as a whole on Nykaa, then a scorecard for every Korean focus brand. The
 *  anchor brief (the old Analysis tab) follows below it unchanged. */
export default function KBeautyOverview({ tiers }: { tiers: Tiers }) {
  const m = useMarket(); const cb = useCategoryBrands(); const offers = useBrandOffers(); const home = useHomepage();
  const { win, flow, prevFlow, ix, dims } = m;
  const flowU = useMemo(() => uniqueFlow(flow), [flow]);
  const prevU = useMemo(() => (prevFlow ? uniqueFlow(prevFlow) : null), [prevFlow]);
  const known = useMemo(() => [...new Set([...flow.map((r) => r.brand), ...m.pool.map((p) => p.brand)])], [flow, m.pool]);
  // the Korean focus brands: the tiering's Korean group, then the tracked Korean set
  const korean = useMemo(() => {
    const list = [tiers.pinned, ...tiers.focus.filter((b) => tiers.group(b) === "korean"), ...FOCUS_BRANDS];
    const out: string[] = [];
    for (const b of list) { const r = resolveBrand(b, known) ?? b; if (!out.some((x) => norm(x) === norm(r))) out.push(r); }
    return out;
  }, [tiers, known]);

  if (!m.ready || !win) return <div className="skeleton mt-8 h-48 rounded-[16px]" />;
  const tot = flowU.reduce((a, r) => a + r.value, 0) || 1;
  const kVal = flowU.filter((r) => r.origin === "kbeauty").reduce((a, r) => a + r.value, 0);
  const kPrev = prevU ? prevU.filter((r) => r.origin === "kbeauty").reduce((a, r) => a + r.value, 0) / (prevU.reduce((a, r) => a + r.value, 0) || 1) : null;
  const nykaa = LATEST_REPORTED();
  const c0 = catsOn(ix, win.start); const c1 = catsOn(ix, win.end); const both = new Set([...c1].filter((c) => c0.has(c)));
  // places today on every category; the change is counted on the categories tracked on both days
  const p0 = placesOn(ix, dims, win.start, both); const p1 = placesOn(ix, dims, win.end, both); const pAll = placesOn(ix, dims, win.end);
  const kPlaces = (p: Map<string, number>) => [...p.entries()].filter(([b]) => m.originOf(b) === "kbeauty").reduce((a, [, n]) => a + n, 0);
  const allPlaces = (p: Map<string, number>) => [...p.values()].reduce((a, n) => a + n, 0) || 1;
  const latestBrands = (cb.data ?? []).reduce((a, b) => (b.last_seen > a ? b.last_seen : a), "");
  const kBrandsOnNykaa = new Set((cb.data ?? []).filter((b) => b.last_seen === latestBrands && b.origin === "kbeauty" && b.subcategory !== "kbeauty_store").map((b) => b.brand)).size;
  const reportedK = NYKAA_REPORTED()[2];

  const byBrand = aggregate(flowU, (r) => r.brand);
  const ranked = [...byBrand.values()].sort((a, b) => b.value - a.value).map((a) => a.key);
  const prevByBrand = prevU ? aggregate(prevU, (r) => r.brand) : null; const prevTot = prevU ? prevU.reduce((a, r) => a + r.value, 0) || 1 : 1;
  const lastOfferDay = (offers.data ?? []).reduce((a, o) => (o.scrape_date > a ? o.scrape_date : a), "");
  const runs = homepageRuns(home.data ?? []);
  const rows = korean.map((b) => {
    const a = [...byBrand.values()].find((x) => norm(x.key) === norm(b));
    const pa = prevByBrand ? [...prevByBrand.values()].find((x) => norm(x.key) === norm(b)) : undefined;
    const tr12 = m.latest ? reviewTrend(m.pool.filter((p) => norm(p.brand) === norm(b)), m.latest) : null;
    const pick = (p: Map<string, number>) => [...p.entries()].find(([k]) => norm(k) === norm(b))?.[1] ?? 0; const pn = pick(pAll); const pt = pick(p0); const pl = pick(p1);
    const off = (offers.data ?? []).filter((o) => o.scrape_date === lastOfferDay && norm(o.brand) === norm(b) && o.offer_id !== "none").filter((o) => classifyOffer(o).brandOwn);
    const hp = runs.filter((r) => r.brand && norm(r.brand) === norm(b) && r.end >= win.start).reduce((s, r) => s + r.days, 0);
    return { b, share: (a?.value ?? 0) / tot, rank: a ? ranked.indexOf(a.key) + 1 : null, change: prevByBrand ? (a?.value ?? 0) / tot - (pa?.value ?? 0) / prevTot : null, flow: a?.flow ?? 0,
      places: pn, placesD: pl - pt, best: a?.best ?? null, growth: tr12 && tr12.products >= 2 && tr12.base >= 30 ? tr12.change : null, gN: tr12?.products ?? 0, offers: off.length, offer: off[0]?.description ?? off[0]?.title ?? null, hp };
  }).sort((x, y) => y.share - x.share);

  return (
    <ActionSection id="kbeauty" kicker={tr("K-beauty on Nykaa", "Nykaa의 K-뷰티")}
      title={tr(<>K-beauty takes {pct(kVal / tot)} of shoppers&rsquo; buying on Nykaa&rsquo;s shelves; Nykaa says its Korean beauty sales grew {signed(reportedK.value)} last year</>,
        <>K-뷰티는 Nykaa 진열 구매의 {pct(kVal / tot)}, Nykaa 발표 K-뷰티 매출 성장률은 지난해 {signed(reportedK.value)}</>)}
      note={tr(<>Buying: <Def k="ratingFlow">share of new ratings × price</Def> in the {spanLabel(m.period.days)} ({dayMonth(win.start)}–{dayMonth(win.end)}). Reviews: each brand&rsquo;s tracked products, latest 3 months vs the same months a year earlier. Click a brand for its page.</>,
        <>구매: {spanLabel(m.period.days)} ({dayMonth(win.start)}–{dayMonth(win.end)}) <Def k="ratingFlow">신규 평가 × 가격 점유</Def>. 리뷰: 브랜드별 추적 제품, 최근 3개월 vs 1년 전 같은 달. 브랜드를 누르면 페이지가 열립니다.</>)}
      right={<PeriodBar shelf={win} freeze={m.freeze} />}>
      <div className="grid gap-3 md:grid-cols-4">
        <Stat label={tr("K-beauty share of buying", "K-뷰티 구매 점유")} value={pct(kVal / tot, 1)} sub={kPrev !== null ? tr(`${pts(kVal / tot - kPrev)} on the period before`, `직전 기간 대비 ${pts(kVal / tot - kPrev)}`) : tr(`${compact(flowU.filter((r) => r.origin === "kbeauty").reduce((a, r) => a + r.flow, 0))} new ratings`, `신규 평가 ${compact(flowU.filter((r) => r.origin === "kbeauty").reduce((a, r) => a + r.flow, 0))}건`)} />
        <Stat label={tr("Korean beauty on Nykaa, Nykaa's figure", "Nykaa K-뷰티 (Nykaa 발표)")} value={signed(reportedK.value)} tone="good"
          sub={<>{tr(`${reportedK.period}; all of Nykaa beauty ${signed(nykaa.value)} (${nykaa.label}). `, `${reportedK.period}. Nykaa 뷰티 전체 ${signed(nykaa.value)} (${nykaa.label}). `)}<a href={reportedK.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{reportedK.source} ↗</a></>} />
        <Stat label={tr("K-beauty top-100 places", "K-뷰티 상위 100위 자리")} value={`${kPlaces(pAll)}`} sub={tr(`${pct(kPlaces(pAll) / allPlaces(pAll))} of places in 13 categories; ${kPlaces(p1) - kPlaces(p0) >= 0 ? "+" : ""}${kPlaces(p1) - kPlaces(p0)} since ${dayMonth(win.start)} (${both.size} categories tracked both days)`, `13개 카테고리 전체 자리의 ${pct(kPlaces(pAll) / allPlaces(pAll))}; ${dayMonth(win.start)} 대비 ${kPlaces(p1) - kPlaces(p0) >= 0 ? "+" : ""}${kPlaces(p1) - kPlaces(p0)} (양일 추적 ${both.size}개 카테고리)`)} />
        <Stat label={tr("Korean brands on Nykaa", "Nykaa 입점 한국 브랜드")} value={kBrandsOnNykaa ? `${kBrandsOnNykaa}` : "–"} sub={tr(`in the 13 tracked categories, from Nykaa's brand filter${latestBrands ? ` on ${dayMonth(latestBrands)}` : ""}; brands with a known origin only`, `추적 13개 카테고리, Nykaa 브랜드 필터 기준${latestBrands ? ` (${dayMonth(latestBrands)})` : ""}. 국적이 확인된 브랜드만`)} />
      </div>
      <Card className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <th className="px-4 py-2.5">{tr("Korean focus brand", "한국 주요 브랜드")}</th><th className="px-2 py-2.5"><Def k="ratingFlow">{tr("Share of buying", "구매 점유")}</Def></th>
            <th className="px-2 py-2.5">{tr("Places", "자리")}</th><th className="px-2 py-2.5">{tr("Best rank", "최고 순위")}</th><th className="px-2 py-2.5">{tr("Reviews vs a year earlier", "리뷰, 1년 전 대비")}</th>
            <th className="px-2 py-2.5">{tr("Offer tonight", "오늘 프로모션")}</th><th className="px-2 py-2.5">{tr("Homepage days", "홈페이지 노출일")}</th>
          </tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.b} className={`border-b border-line/60 last:border-0 ${tiers.isPinned(r.b) ? "bg-accent-soft/40" : ""}`}>
              <td className="px-4 py-2 font-medium"><BrandLink brand={r.b} />{tiers.isPinned(r.b) && <span className="ml-1.5 rounded bg-brand px-1.5 py-px text-[10px] font-semibold uppercase text-on-brand">{tr("anchor", "기준")}</span>}</td>
              <td className="px-2 py-2 tabular">{r.share > 0 ? pct(r.share, 2) : <span className="text-[11.5px] text-muted">{tr("no new ratings", "신규 평가 없음")}</span>}{r.rank && r.share > 0 && <Basis>{tr(`#${r.rank} of ${ranked.length} brands`, `${ranked.length}개 중 ${r.rank}위`)}{r.change !== null ? ` · ${pts(r.change)}` : ""}</Basis>}</td>
              <td className="px-2 py-2 tabular">{r.places}<Basis className={r.placesD > 0 ? "text-good" : r.placesD < 0 ? "text-bad" : ""}>{r.placesD > 0 ? "+" : ""}{r.placesD}</Basis></td>
              <td className="px-2 py-2 tabular">{r.best ? `#${r.best}` : <span className="text-[11.5px] text-muted">{tr("not in a top 100", "상위 100위 없음")}</span>}</td>
              <td className="px-2 py-2 tabular">{r.growth !== null ? <span className={r.growth >= nykaa.value! ? "text-good" : "text-bad"}>{signed(r.growth)}</span> : <span className="text-[11.5px] text-muted">{tr("too few reviews", "리뷰 부족")}</span>}{r.growth !== null && <Basis>{tr(`${r.gN} tracked products`, `추적 제품 ${r.gN}개`)}</Basis>}</td>
              <td className="max-w-[260px] px-2 py-2 text-[12px] text-ink-2">{r.offer ?? <span className="text-muted">{tr("none", "없음")}</span>}{r.offers > 1 && <Basis>{tr(`+${r.offers - 1} more`, `외 ${r.offers - 1}개`)}</Basis>}</td>
              <td className="px-2 py-2 tabular">{r.hp || "–"}</td>
            </tr>))}</tbody>
        </table>
      </Card>
      <Basis className="mt-2">{tr(`Reviews are green when they grew faster than Nykaa's beauty sales (${signed(nykaa.value)}). They count launches, so they are the brand's own trend, not a like-for-like figure. Offers and homepage are read nightly from 17 Oct. The brief for the anchor brand (switchable) follows below.`, `리뷰가 Nykaa 뷰티 매출(${signed(nykaa.value)})보다 빨리 늘면 초록색. 신제품 포함이라 브랜드 자체 추세입니다. 프로모션과 홈페이지는 10월 17일부터 매일 수집. 기준 브랜드(변경 가능) 보고서는 아래에 이어집니다.`)}</Basis>
    </ActionSection>
  );
}
