"use client";

import { useMemo, useState } from "react";
import PeriodBar from "./PeriodBar";
import { Card, pill } from "./ui";
import { ActionSection } from "./Report";
import { useOpenProduct } from "./ProductDrawer";
import { ORIGIN_COLOR, ORIGIN_LABEL } from "@/lib/brands";
import { useBrandOffers, useEvents, useHomepage } from "@/lib/data";
import { CATEGORY_LABEL, shortName } from "@/lib/format";
import { explainMove, homepageRuns, REASON_COLOR, smoothedMove, type FlowRow, type Reason } from "@/lib/market";
import { spanLabel } from "@/lib/period";
import { useTiers } from "@/lib/tiers";
import { useMarket } from "@/lib/useMarket";
import { dayMonth, tr } from "@/lib/i18n";

/** Round 4 (owner 17 Oct 2026: "rather than just telling me it moved up or down, give the trend and a reason").
 *  Every big move in the chosen period, with its rank line and the likely reasons found on the same dates. */
export default function MovesWithReasons() {
  const m = useMarket(); const events = useEvents(); const home = useHomepage(); const offers = useBrandOffers(); const open = useOpenProduct();
  const { win, flow, ix, dims } = m;
  const [scope, setScope] = useState<"set" | "all">("set");
  const tiers = useTiers(useMemo(() => [...new Set(flow.map((r) => r.brand))], [flow]));
  const runs = useMemo(() => homepageRuns(home.data ?? []), [home.data]);

  const moves = useMemo(() => {
    if (!win) return { up: [], down: [] };
    const inScope = (r: FlowRow) => scope === "all" || tiers.inSet(r.brand) || r.origin === "kbeauty";
    // moves from the median of the first three days to the median of the last three (single days are noisy)
    const withMove = flow.filter((r) => r.rankStart !== null && r.rankEnd !== null && inScope(r)).flatMap((r) => {
      const mv = smoothedMove(ix, `${r.subcategory}|${r.product_id}`, win.start, win.end);
      return mv ? [{ r: { ...r, rankStart: mv.from, rankEnd: mv.to }, d: mv.from - mv.to }] : [];
    });
    const explain = (r: FlowRow, up: boolean): Reason[] => explainMove({ key: `${r.subcategory}|${r.product_id}`, productId: r.product_id, brand: r.brand, start: win.start, end: win.end, ix,
      events: events.data ?? [], runs, offers: offers.data ?? [], dims, firstReview: dims.get(r.product_id)?.first_review_date ?? null, up });
    // the biggest moves, weighted so a move near the top counts more than one at the bottom of the list
    const score = (x: { r: FlowRow; d: number }) => Math.abs(x.d) / Math.sqrt(Math.min(x.r.rankStart!, x.r.rankEnd!));
    const up = withMove.filter((x) => x.d >= 5).sort((a, b) => score(b) - score(a)).slice(0, 12).map((x) => ({ ...x, why: explain(x.r, true) }));
    const down = withMove.filter((x) => x.d <= -5).sort((a, b) => score(b) - score(a)).slice(0, 10).map((x) => ({ ...x, why: explain(x.r, false) }));
    return { up, down };
  }, [win, flow, scope, tiers, ix, events.data, runs, offers.data, dims]);

  if (!m.ready || !win) return <div className="skeleton mt-8 h-48 rounded-[16px]" />;
  const explained = [...moves.up, ...moves.down].filter((x) => x.why.length).length;
  const total = moves.up.length + moves.down.length;

  const spark = (r: FlowRow) => {
    const s = (ix.series.get(`${r.subcategory}|${r.product_id}`) ?? []).filter((x) => x.scrape_date >= win.start && x.scrape_date <= win.end);
    if (s.length < 2) return null;
    const W = 120, H = 30; const lo = Math.min(...s.map((x) => x.rank)); const hi = Math.max(...s.map((x) => x.rank));
    const xs = (i: number) => (i / (s.length - 1)) * W; const y = (rk: number) => 3 + ((rk - lo) / Math.max(1, hi - lo)) * (H - 6);
    const offerDays = s.map((x, i) => (x.has_offer ? i : -1)).filter((i) => i >= 0);
    return (
      <svg width={W} height={H} className="shrink-0" role="img" aria-label={tr(`rank from #${s[0].rank} to #${s[s.length - 1].rank}`, `순위 #${s[0].rank} → #${s[s.length - 1].rank}`)}>
        {offerDays.map((i) => <rect key={i} x={xs(i) - 1.5} y={0} width={3} height={H} fill="#c28a1b" fillOpacity={0.18} />)}
        <path d={s.map((x, i) => `${i ? "L" : "M"}${xs(i).toFixed(1)},${y(x.rank).toFixed(1)}`).join("")} fill="none" stroke="#2c6e5a" strokeWidth={1.6} />
        <circle cx={xs(s.length - 1)} cy={y(s[s.length - 1].rank)} r={2.6} fill="#2c6e5a" />
      </svg>
    );
  };
  const row = (x: { r: FlowRow; d: number; why: Reason[] }) => (
    <li key={`${x.r.subcategory}|${x.r.product_id}`} className="grid grid-cols-1 gap-2 py-2.5 md:grid-cols-[minmax(0,1.3fr)_120px_110px_minmax(0,1.6fr)] md:items-center">
      <div className="min-w-0">
        <button onClick={() => open({ product_id: x.r.product_id, name: x.r.name, brand: x.r.brand, url: x.r.url })} className="max-w-full truncate text-left text-[13px] underline decoration-line-2 underline-offset-2 hover:decoration-ink">
          <b className="font-medium">{x.r.brand}</b> {shortName(x.r.name, x.r.brand)}
        </button>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-muted"><span className="h-2 w-2 rounded-full" style={{ background: ORIGIN_COLOR[x.r.origin]?.fill }} />{ORIGIN_LABEL[x.r.origin]} · {CATEGORY_LABEL[x.r.subcategory]}</div>
      </div>
      {spark(x.r)}
      <div className="tabular text-[12.5px] text-ink-2">#{x.r.rankStart} → <b className="text-ink">#{x.r.rankEnd}</b> <span className={`ml-1 font-semibold ${x.d > 0 ? "text-good" : "text-bad"}`}>{x.d > 0 ? "▲" : "▼"}{Math.abs(x.d)}</span></div>
      <div className="flex flex-wrap gap-1.5">
        {x.why.length ? x.why.slice(0, 4).map((w, i) => (
          <span key={i} className="rounded-md px-2 py-0.5 text-[11.5px] leading-snug" style={{ background: `${REASON_COLOR[w.kind]}18`, color: REASON_COLOR[w.kind] }}>{w.text}</span>
        )) : <span className="text-[11.5px] italic text-muted">{tr("No clear cause on these dates: not a price, offer, stock, ad or event change we can see", "이 기간 보이는 원인 없음: 가격·프로모션·재고·광고·이벤트 변화 없음")}</span>}
      </div>
    </li>
  );

  return (
    <ActionSection id="why" kicker={tr("What moved and why", "무엇이 왜 움직였나")}
      title={tr(`The biggest rank moves in the ${spanLabel(m.period.days)}, and what changed on the same dates`, `${spanLabel(m.period.days)} 가장 큰 순위 변동과 같은 기간의 변화`)}
      note={tr(<>Each line is the listing&rsquo;s daily rank from {dayMonth(win.start)} to {dayMonth(win.end)} (higher = better; shaded days carried an offer tag); the move compares its typical rank over the first three days with the last three, because single days jump around. Reasons are checked on the same dates (a sale or banner counts only if the listing moved that way while it ran): a real price cut (MRP unchanged), an offer, a paid slot, stock, a burst of ratings, a recent launch, a Nykaa sale or homepage banner, or rivals above dropping out. They are likely causes, not proof. {explained} of {total} moves have at least one.</>,
        <>선 = {dayMonth(win.start)}–{dayMonth(win.end)} 일별 제품 순위(위쪽 = 상위, 음영 = 프로모션 표시일). 하루 순위는 출렁이기 때문에 처음 3일과 마지막 3일의 대표 순위를 비교. 같은 기간의 가격 인하(정가 동일), 프로모션, 광고 자리, 재고, 평가 급증, 신제품, Nykaa 세일·홈페이지 배너(같은 방향으로 움직였을 때만), 위 순위 제품 이탈을 확인. 원인 후보일 뿐 증명 아님. {total}건 중 {explained}건에 이유 1개 이상.</>)}
      right={<div className="flex flex-col items-end gap-2"><PeriodBar shelf={win} freeze={m.freeze} /><div className="flex gap-1.5"><button className={pill(scope === "set", "sm")} onClick={() => setScope("set")}>{tr("Focus & K-beauty", "주요·K-뷰티")}</button><button className={pill(scope === "all", "sm")} onClick={() => setScope("all")}>{tr("All brands", "전체 브랜드")}</button></div></div>}>
      <div className="grid gap-3">
        <Card className="px-5 py-3">
          <div className="pt-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-good">{tr("Climbed", "상승")}</div>
          <ul className="divide-y divide-line/60">{moves.up.length ? moves.up.map(row) : <li className="py-2 text-[12.5px] text-muted">{tr("No listing climbed 5+ places in this period.", "이 기간 5계단 이상 오른 제품 없음.")}</li>}</ul>
        </Card>
        <Card className="px-5 py-3">
          <div className="pt-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-bad">{tr("Slipped", "하락")}</div>
          <ul className="divide-y divide-line/60">{moves.down.length ? moves.down.map(row) : <li className="py-2 text-[12.5px] text-muted">{tr("No listing slipped 5+ places in this period.", "이 기간 5계단 이상 내린 제품 없음.")}</li>}</ul>
        </Card>
      </div>
    </ActionSection>
  );
}
