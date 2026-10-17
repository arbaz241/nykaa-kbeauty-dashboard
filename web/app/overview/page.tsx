"use client";

import { useMemo } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import PeriodBar from "@/components/PeriodBar";
import LineChart, { type Marker } from "@/components/LineChart";
import { Card, Loading, PageHead, Stat, Verdict } from "@/components/ui";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import { Basis, Def } from "@/components/Tiered";
import { Opens, Points } from "@/components/Detail";
import { ORIGIN_COLOR, ORIGIN_LABEL } from "@/lib/brands";
import { useCategoryBrands, useCategoryStats, useEvents, useHomepage } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL, compact, pct, signed } from "@/lib/format";
import { aggregate, catsOn, eventsBetween, homepageRuns, monthlyValue, placesOn, uniqueFlow, verticalOf, VERTICAL_LABEL, type GrowthCell } from "@/lib/market";
import { compareWord, daysBetween, spanLabel } from "@/lib/period";
import { MAKEUP_SHARE_NOTE, NYKAA_REPORTED } from "@/lib/reference";
import { useMarket } from "@/lib/useMarket";
import { dayMonth, monthYY, tr } from "@/lib/i18n";

const NAV = (): NavItem[] => [
  { id: "summary", label: tr("Summary", "요약") }, { id: "growth", label: tr("Growth", "성장") }, { id: "categories", label: tr("Categories", "카테고리") },
  { id: "trend", label: tr("Month by month", "월별 추이") }, { id: "origins", label: tr("Indian, Korean, global", "인도·한국·글로벌") }, { id: "changes", label: tr("What changed", "변화") },
];
const THIN = 8; // fewer like-for-like products than this: the growth figure is shown but marked thin
const ORIGINS = ["kbeauty", "local", "global", "unknown"] as const;

function growthText(c: GrowthCell | undefined) { return c?.existing === null || c?.existing === undefined ? "–" : signed(c.existing); }

function OverviewPage() {
  const m = useMarket(); const stats = useCategoryStats(); const catBrands = useCategoryBrands(); const home = useHomepage(); const events = useEvents();
  const { growth, mwin, win, flow, prevFlow, ix, dims } = m;

  // brands on Nykaa per category (latest night of the brand filter)
  const latestStat = useMemo(() => { const ds = [...new Set((stats.data ?? []).map((s) => s.scrape_date))].sort(); return ds[ds.length - 1] ?? null; }, [stats.data]);
  const statOf = (c: string) => (stats.data ?? []).find((s) => s.scrape_date === latestStat && s.subcategory === c) ?? null;
  const brandsTotal = useMemo(() => new Set((catBrands.data ?? []).filter((b) => b.last_seen === latestStat && b.subcategory !== "kbeauty_store").map((b) => b.brand)).size, [catBrands.data, latestStat]);

  const flowU = useMemo(() => uniqueFlow(flow), [flow]);
  const flowTotal = flowU.reduce((a, r) => a + r.value, 0) || 1;
  const byCatFlow = useMemo(() => aggregate(flow, (r) => r.subcategory), [flow]);
  const prevByCat = useMemo(() => (prevFlow ? aggregate(prevFlow, (r) => r.subcategory) : null), [prevFlow]);
  const prevTotal = prevFlow ? uniqueFlow(prevFlow).reduce((a, r) => a + r.value, 0) || 1 : 1;
  const byOrigin = useMemo(() => aggregate(flowU, (r) => r.origin), [flowU]);
  const prevOrigin = useMemo(() => (prevFlow ? aggregate(uniqueFlow(prevFlow), (r) => r.origin) : null), [prevFlow]);
  const top100Brands = (c: string) => new Set(flow.filter((r) => r.subcategory === c).map((r) => r.brand)).size;

  const rows = useMemo(() => CATEGORIES.map((c) => ({ c, g: growth?.byCategory.get(c), share: growth?.share.get(c) ?? 0, weight: growth?.weight.get(c) ?? 0, buy: (byCatFlow.get(c)?.value ?? 0) / flowTotal,
    buyPrev: prevByCat ? (prevByCat.get(c)?.value ?? 0) / prevTotal : null, stat: statOf(c), top: top100Brands(c), partial: flow.some((r) => r.subcategory === c && r.partial) }))
    .sort((a, b) => b.share - a.share),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [growth, byCatFlow, prevByCat, flowTotal, prevTotal, stats.data, latestStat, flow]);

  // month-by-month review value: every tracked product, and a fixed set on sale since the start of the chart
  const axis = useMemo(() => { if (!m.latest) return []; const t = new Date(`${m.latest}T00:00:00Z`); return Array.from({ length: 24 }, (_, i) => new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 24 + i, 1)).toISOString().slice(0, 10)); }, [m.latest]);
  const series = useMemo(() => {
    if (!axis.length) return null;
    // as an index (the first 12 months' average = 100), so the two lines' shapes can be compared
    const idx = (v: number[]) => { const b = v.slice(0, 12).reduce((a, x) => a + x, 0) / 12 || 1; return v.map((x) => (x / b) * 100); };
    const all = monthlyValue(m.pool, axis);
    const fixed = monthlyValue(m.pool.filter((p) => p.coverage <= axis[0] && (p.first ?? "9999") <= axis[0]), axis);
    const n = m.pool.filter((p) => p.coverage <= axis[0] && (p.first ?? "9999") <= axis[0] && p.price && p.category).length;
    return { all: { total: idx(all.total), makeup: idx(all.makeup) }, fixed: { total: idx(fixed.total) }, n };
  }, [m.pool, axis]);
  const markers: Marker[] = useMemo(() => (events.data ?? []).filter((e) => e.kind === "sale").flatMap((e): Marker[] => {
    const i = axis.findIndex((a) => a.slice(0, 7) === e.happened_on.slice(0, 7)); const j = axis.findIndex((a) => a.slice(0, 7) === (e.ends_on ?? e.happened_on).slice(0, 7));
    return i < 0 ? [] : [{ from: i, to: j >= 0 ? j : i, label: e.label, color: "#b4532a" }];
  }), [events.data, axis]);

  const runs = useMemo(() => homepageRuns(home.data ?? []), [home.data]);
  const liveToday = runs.filter((r) => r.end === (home.data ?? []).reduce((a, x) => (x.scrape_date > a ? x.scrape_date : a), "") && (r.kind === "sale" || r.kind === "campaign"));

  if (!m.ready || !growth || !mwin || !win) return <Shell active="Overview"><PageHead eyebrow={tr("Overview", "개요")} title={tr("How skin & makeup on Nykaa is doing", "Nykaa 스킨케어·메이크업 시장 현황")} sub="" /><Loading what={tr("the market", "시장 데이터")} /></Shell>;

  const t = growth.total; const sk = growth.byVertical.skin; const mk = growth.byVertical.makeup;
  const reportedAll = NYKAA_REPORTED();
  // hold our figure against Nykaa's figure for the same length of period: the year for 12 months, the quarter otherwise
  const reported = mwin.recent.length >= 12 ? [reportedAll[1], reportedAll[0], reportedAll[2]] : reportedAll;
  const fastest = rows.filter((r) => r.g?.existing !== null && r.g?.existing !== undefined && r.g.products >= THIN).sort((a, b) => b.g!.existing! - a.g!.existing!);
  const kShare = (byOrigin.get("kbeauty")?.value ?? 0) / flowTotal;
  const kPrev = prevOrigin ? (prevOrigin.get("kbeauty")?.value ?? 0) / prevTotal : null;
  const gap = t.existing !== null ? t.existing - reported[0].value : null;

  // what changed: share-of-buying moves by category, places gained by brands, homepage and events
  const cats0 = catsOn(ix, win.start); const cats1 = catsOn(ix, win.end); const both = new Set([...cats1].filter((c) => cats0.has(c)));
  const p0 = placesOn(ix, dims, win.start, both); const p1 = placesOn(ix, dims, win.end, both);
  const placeMoves = [...new Set([...p0.keys(), ...p1.keys()])].map((b) => ({ b, d: (p1.get(b) ?? 0) - (p0.get(b) ?? 0), now: p1.get(b) ?? 0 })).sort((a, b) => b.d - a.d);
  const catMoves = prevByCat ? rows.filter((r) => r.buyPrev !== null).map((r) => ({ c: r.c, d: r.buy - r.buyPrev! })).sort((a, b) => b.d - a.d) : [];
  const featured = runs.filter((r) => r.kind === "brand" && r.end >= win.start).sort((a, b) => b.days - a.days).slice(0, 5);
  const evs = eventsBetween(events.data ?? [], win.start, win.end);

  const changes: React.ReactNode[] = [];
  if (catMoves.length) {
    const up = catMoves[0]; const dn = catMoves[catMoves.length - 1];
    changes.push(tr(<><b>{CATEGORY_LABEL[up.c]}</b> took a bigger share of shoppers&rsquo; new ratings ({signed(up.d, 1).replace("%", " pts")}) than in the {spanLabel(m.period.days).replace("last", "previous")}; <b>{CATEGORY_LABEL[dn.c]}</b> the biggest drop ({signed(dn.d, 1).replace("%", " pts")}).</>,
      <><b>{CATEGORY_LABEL[up.c]}</b>의 신규 평가 점유가 직전 기간보다 늘었고({signed(up.d, 1).replace("%", "p")}), <b>{CATEGORY_LABEL[dn.c]}</b>는 가장 많이 줄었습니다({signed(dn.d, 1).replace("%", "p")}).</>));
  } else changes.push(tr(<>No earlier period of the same length is collected yet (tracking began {dayMonth(ix.days[0])}); choose 7 or 14 days above to compare with the period before.</>, <>같은 길이의 직전 기간 데이터가 아직 없습니다(수집 시작 {dayMonth(ix.days[0])}). 위에서 7일 또는 14일을 고르면 직전 기간과 비교합니다.</>));
  if (placeMoves[0]?.d > 0) changes.push(tr(<><b>{placeMoves[0].b}</b> gained the most top-100 places ({placeMoves[0].d > 0 ? "+" : ""}{placeMoves[0].d}, now {placeMoves[0].now}); <b>{placeMoves[placeMoves.length - 1].b}</b> lost the most ({placeMoves[placeMoves.length - 1].d}). Counted on the {both.size} categories tracked on both days.</>,
    <><b>{placeMoves[0].b}</b>가 상위 100위 자리를 가장 많이 늘렸고(+{placeMoves[0].d}, 현재 {placeMoves[0].now}), <b>{placeMoves[placeMoves.length - 1].b}</b>는 가장 많이 잃었습니다({placeMoves[placeMoves.length - 1].d}). 양일 모두 추적한 {both.size}개 카테고리 기준.</>));
  if (featured.length) changes.push(tr(<>Nykaa&rsquo;s homepage carousel featured <b>{featured.map((f) => f.label).join(", ")}</b>. Homepage tracking began 17 Oct.</>, <>Nykaa 홈페이지 배너에 <b>{featured.map((f) => f.label).join(", ")}</b>가 노출됐습니다. 홈페이지 수집은 10월 17일 시작.</>));
  if (evs.length) changes.push(tr(<>Events in the period: {evs.map((e) => e.label).join("; ")}.</>, <>기간 중 이벤트: {evs.map((e) => e.label).join("; ")}.</>));

  return (
    <Shell active="Overview" asOf={m.latest ?? undefined}>
      <PageHead eyebrow={tr("Overview · start here", "개요 · 여기서 시작")} title={tr("How skin & makeup on Nykaa is doing", "Nykaa 스킨케어·메이크업 시장 현황")}
        sub={tr("Nykaa as a whole first, then its categories and who is winning them. The next tabs go down a level each: categories, brands, K-beauty, products.", "먼저 Nykaa 전체를 보고, 이어서 카테고리와 승자를 봅니다. 다음 탭으로 갈수록 카테고리, 브랜드, K-뷰티, 제품 순으로 한 단계씩 내려갑니다.")}
        right={<PeriodBar shelf={win} months={mwin} />} />
      <SectionNav items={NAV()} />

      <section id="summary" className="mt-8 scroll-mt-32">
        <Verdict eyebrow={tr(`Skin & makeup on Nykaa · ${mwin.recentLabel} ${compareWord(mwin.compare)}`, `Nykaa 스킨케어·메이크업 · ${mwin.recentLabel} ${compareWord(mwin.compare)}`)}
          points={[
            tr(<>Nykaa reported <b>{signed(reported[0].value)}</b> for its beauty sales for {reported[0].period}. {gap !== null && Math.abs(gap) > 0.1 ? <>Our estimate is {Math.abs(gap * 100).toFixed(0)} points away: we see only the products we track, and only reviews.</> : <>Our estimate is within 10 points of it.</>}</>,
              <>Nykaa가 발표한 뷰티 거래액 성장률은 {reported[0].period}에 <b>{signed(reported[0].value)}</b>입니다. {gap !== null && Math.abs(gap) > 0.1 ? <>우리 추정치와 {Math.abs(gap * 100).toFixed(0)}%p 차이가 납니다. 추적 제품과 리뷰만 보기 때문입니다.</> : <>우리 추정치와 10%p 이내로 일치합니다.</>}</>),
            tr(<>New launches add up to <b>{t.launch !== null ? `${(t.launch * 100).toFixed(0)} points` : "–"}</b> on top. Read that as an upper bound: we only track launches that reached today&rsquo;s top 100.</>, <>신제품이 최대 <b>{t.launch !== null ? `${(t.launch * 100).toFixed(0)}%p` : "–"}</b>를 더합니다. 오늘 상위 100위에 든 신제품만 추적하므로 최대치로 보세요.</>),
            tr(<>In the {spanLabel(m.period.days)}, <b>{pct(kShare)}</b> of the value of shoppers&rsquo; new ratings went to K-beauty brands{kPrev !== null ? <> ({signed(kShare - kPrev, 1).replace("%", " pts")} on the period before)</> : null}.</>, <>{spanLabel(m.period.days)} 동안 소비자 신규 평가 금액의 <b>{pct(kShare)}</b>가 K-뷰티 브랜드에 갔습니다{kPrev !== null ? <> (직전 기간 대비 {signed(kShare - kPrev, 1).replace("%", "p")})</> : null}.</>),
            brandsTotal ? tr(<><b>{brandsTotal.toLocaleString("en-IN")} brands</b> sell in the 13 tracked skin and makeup categories; {new Set(flow.map((r) => r.brand)).size} of them hold at least one top-100 place.</>, <>추적 중인 13개 스킨케어·메이크업 카테고리에 <b>{brandsTotal.toLocaleString("en-IN")}개 브랜드</b>가 입점해 있고, 그중 {new Set(flow.map((r) => r.brand)).size}개가 상위 100위에 하나 이상 올라 있습니다.</>) : null,
            liveToday.length ? tr(<>Live on Nykaa&rsquo;s homepage now: {liveToday.map((r) => r.label).join(", ")}.</>, <>현재 Nykaa 홈페이지 진행 중: {liveToday.map((r) => r.label).join(", ")}.</>) : null,
          ].filter(Boolean) as React.ReactNode[]}>
          {tr(<>Products already on sale a year earlier sold about <b>{growthText(t)}</b> more ({mwin.recentLabel} {compareWord(mwin.compare)}). Skin {growthText(sk)}, makeup {growthText(mk)}{mk.products < THIN * 3 ? " (thin)" : ""}.{fastest[0] ? <> {CATEGORY_LABEL[fastest[0].c]} grew fastest ({signed(fastest[0].g!.existing!)}).</> : null}</>,
            <>1년 전에도 판매 중이던 제품의 구매가 약 <b>{growthText(t)}</b> 늘었습니다 ({mwin.recentLabel}, {compareWord(mwin.compare)}). 스킨케어 {growthText(sk)}, 메이크업 {growthText(mk)}{mk.products < THIN * 3 ? " (표본 적음)" : ""}.{fastest[0] ? <> {CATEGORY_LABEL[fastest[0].c]}가 가장 빠르게 성장했습니다({signed(fastest[0].g!.existing!)}).</> : null}</>)}
        </Verdict>
      </section>

      <ActionSection id="growth" kicker={tr("Growth", "성장")} title={tr(<>Like for like, skin &amp; makeup grew {growthText(t)}; Nykaa reported {signed(reported[0].value)}</>, <>동일 제품 기준 스킨케어·메이크업 {growthText(t)} 성장, Nykaa 발표치 {signed(reported[0].value)}</>)}
        note={tr(<>Review value = reviews written in the month × selling price, so a ₹2,000 serum counts more than a ₹200 lip balm. Categories add up by their share of value: the total equals Σ category weight × category growth. <Opens detail={{ kicker: tr("Method", "방법"), title: tr("How growth is measured", "성장률 계산 방법"), body: <MethodBody /> }}>How it works</Opens></>,
          <>리뷰 금액 = 해당 월 리뷰 수 × 판매가. ₹2,000 세럼이 ₹200 립밤보다 크게 반영됩니다. 카테고리는 금액 비중으로 합산하므로 전체 = Σ 카테고리 비중 × 카테고리 성장률. <Opens detail={{ kicker: tr("Method", "방법"), title: tr("How growth is measured", "성장률 계산 방법"), body: <MethodBody /> }}>계산 방법</Opens></>)}>
        <div className="grid gap-3 md:grid-cols-4">
          <Stat label={tr("Like for like", "동일 제품 기준")} value={growthText(t)} tone={t.existing !== null && t.existing >= 0 ? "good" : "bad"}
            sub={<><Def k="valueGrowth">{tr(`${t.products} products on sale in ${mwin.baseLabel}`, `${mwin.baseLabel}에 판매 중이던 ${t.products}개 제품`)}</Def></>} />
          <Stat label={tr("From launches (upper bound)", "신제품 기여 (최대치)")} value={t.launch !== null ? `+${(t.launch * 100).toFixed(0)} ${tr("pts", "%p")}` : "–"}
            sub={<Def k="launchGrowth">{tr(`${t.launches} products first reviewed after ${mwin.baseLabel}`, `${mwin.baseLabel} 이후 첫 리뷰가 달린 ${t.launches}개 제품`)}</Def>} />
          <Stat label={VERTICAL_LABEL().skin} value={growthText(sk)} sub={tr(`${sk.products} like-for-like products · launches +${sk.launch !== null ? (sk.launch * 100).toFixed(0) : "–"} pts`, `동일 제품 ${sk.products}개 · 신제품 +${sk.launch !== null ? (sk.launch * 100).toFixed(0) : "–"}%p`)} />
          <Stat label={VERTICAL_LABEL().makeup} value={growthText(mk)} sub={tr(`${mk.products} like-for-like products${mk.products < THIN * 3 ? ": thin, read with care" : ""}`, `동일 제품 ${mk.products}개${mk.products < THIN * 3 ? ": 표본이 적어 주의" : ""}`)} />
        </div>
        <Card className="mt-3 px-5 py-4">
          <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{tr("What Nykaa itself reported", "Nykaa 자체 발표")}</div>
          <div className="mt-2 grid gap-3 md:grid-cols-3">
            {reported.map((r) => (
              <div key={r.period} className="text-[13.5px]">
                <span className="font-display text-[22px] font-semibold tabular">{signed(r.value)}</span> <span className="text-ink-2">{r.label}</span>
                <Basis>{r.period} · <a href={r.url} target="_blank" rel="noreferrer" className="underline decoration-line-2 underline-offset-2">{r.source}</a></Basis>
              </div>
            ))}
          </div>
          <Basis className="mt-2">{MAKEUP_SHARE_NOTE()} {tr(`In our data makeup is ${pct(rows.filter((r) => verticalOf(r.c) === "makeup").reduce((a, r) => a + r.share, 0))} of review value: we track 3 makeup categories and 10 skin ones.`, `우리 데이터에서 메이크업은 리뷰 금액의 ${pct(rows.filter((r) => verticalOf(r.c) === "makeup").reduce((a, r) => a + r.share, 0))}입니다. 메이크업 3개, 스킨케어 10개 카테고리를 추적합니다.`)}</Basis>
        </Card>
      </ActionSection>

      <ActionSection id="categories" kicker={tr("Categories", "카테고리")}
        title={fastest.length ? tr(<>{CATEGORY_LABEL[fastest[0].c]} grows fastest; {CATEGORY_LABEL[rows[0].c].toLowerCase()} is the biggest</>, <>{CATEGORY_LABEL[fastest[0].c]} 성장 1위, 규모 1위는 {CATEGORY_LABEL[rows[0].c]}</>) : tr("Categories", "카테고리")}
        note={tr(<>Weight = the category&rsquo;s share of review value in {mwin.baseLabel}; the total growth above is these growths added up by weight. Share of buying = its share of new ratings × price in the {spanLabel(m.period.days)}. Click a category to open it.</>, <>비중 = {mwin.baseLabel} 리뷰 금액 중 카테고리 몫. 위의 전체 성장률은 이 성장률들을 비중대로 더한 값입니다. 구매 점유 = {spanLabel(m.period.days)} 동안 신규 평가 × 가격 중 몫. 카테고리를 누르면 열립니다.</>)}>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              <th className="px-4 py-2.5">{tr("Category", "카테고리")}</th><th className="px-2 py-2.5">{tr("Weight", "비중")}</th>
              <th className="px-2 py-2.5"><Def k="valueGrowth">{tr("Growth, like for like", "성장률(동일 제품)")}</Def></th><th className="px-2 py-2.5"><Def k="launchGrowth">{tr("+ launches", "+ 신제품")}</Def></th>
              <th className="px-2 py-2.5"><Def k="ratingFlow">{tr("Share of buying", "구매 점유")}</Def></th>
              <th className="px-2 py-2.5"><Def k="brandCount">{tr("Brands on Nykaa", "입점 브랜드")}</Def></th><th className="px-2 py-2.5">{tr("Brands in top 100", "상위 100위 브랜드")}</th><th className="px-2 py-2.5">{tr("Products on Nykaa", "입점 제품")}</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.c} className="border-b border-line/60 last:border-0 hover:bg-sunken/50">
                  <td className="px-4 py-2.5"><Link href={`/categories/?cat=${r.c}`} className="font-medium underline decoration-line-2 underline-offset-2 hover:decoration-ink">{CATEGORY_LABEL[r.c]}</Link>
                    <span className="ml-2 text-[11px] text-muted">{VERTICAL_LABEL()[verticalOf(r.c)]}</span></td>
                  <td className="px-2 py-2.5 tabular"><div className="flex items-center gap-2"><span className="w-10">{pct(r.weight)}</span><span className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.max(2, r.weight * 220)}px` }} /></div></td>
                  <td className="px-2 py-2.5 tabular">{r.g?.existing !== null && r.g?.existing !== undefined ? <span className={r.g.existing >= (t.existing ?? 0) ? "font-semibold text-good" : "text-ink-2"}>{signed(r.g.existing)}</span> : "–"}
                    <Basis>{tr(`${r.g?.products ?? 0} products`, `제품 ${r.g?.products ?? 0}개`)}{(r.g?.products ?? 0) < THIN ? tr(" · thin", " · 표본 적음") : ""}</Basis></td>
                  <td className="px-2 py-2.5 tabular text-ink-2">{r.g?.launch ? `+${(r.g.launch * 100).toFixed(0)} ${tr("pts", "%p")}` : "–"}<Basis>{tr(`${r.g?.launches ?? 0} launches`, `신제품 ${r.g?.launches ?? 0}개`)}</Basis></td>
                  <td className="px-2 py-2.5 tabular">{pct(r.buy, 1)}{r.buyPrev !== null && <Basis>{signed(r.buy - r.buyPrev, 1).replace("%", tr(" pts", "%p"))}</Basis>}{r.partial && <Basis>{tr("tracked part of the period", "기간 일부만 추적")}</Basis>}</td>
                  <td className="px-2 py-2.5 tabular">{r.stat ? r.stat.brands.toLocaleString("en-IN") : "–"}</td>
                  <td className="px-2 py-2.5 tabular">{r.top}</td>
                  <td className="px-2 py-2.5 tabular">{r.stat ? r.stat.products.toLocaleString("en-IN") : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Basis className="mt-2">{tr(`Growth: ${mwin.recentLabel} ${compareWord(mwin.compare)} (${mwin.baseLabel}). Brand counts: Nykaa's brand filter on ${latestStat ? dayMonth(latestStat) : "–"} (collected nightly from 17 Oct). Products left out of growth because Nykaa shows only their latest ~1,000 reviews: ${t.excluded}.`,
          `성장률: ${mwin.recentLabel}, ${compareWord(mwin.compare)} (${mwin.baseLabel}). 브랜드 수: ${latestStat ? dayMonth(latestStat) : "–"} Nykaa 브랜드 필터 (10월 17일부터 매일 수집). Nykaa가 최근 약 1,000개 리뷰만 보여 줘 성장률에서 제외한 제품: ${t.excluded}개.`)}</Basis>
      </ActionSection>

      {series && (
        <ActionSection id="trend" kicker={tr("Month by month", "월별 추이")} title={tr("Review value by month: the peaks line up with Nykaa's sales", "월별 리뷰 금액: 정점은 Nykaa 세일 시기와 겹침")}
          note={tr("The upper line is every product we track; it climbs partly because we track today's products, which were smaller or not yet launched two years ago. The lower line holds one set of products on sale since the chart starts, so its shape is the market's own. Compare months a year apart, not the slope of the upper line. Shaded: sales (estimated dates until confirmed).",
            "위쪽 선은 추적 중인 모든 제품입니다. 2년 전엔 작았거나 출시 전이던 오늘의 제품을 추적하므로 일부는 그 때문에 오릅니다. 아래쪽 선은 차트 시작부터 판매된 동일 제품군이라 시장 자체의 흐름입니다. 위쪽 선의 기울기가 아니라 1년 간격의 같은 달을 비교하세요. 음영: 세일 (확인 전까지 추정 날짜).")}>
          <Card className="px-4 py-4">
            <LineChart labels={axis.map((a) => monthYY(a))} markers={markers} format={(v) => Math.round(v).toString()} yLabel={tr(`index, ${monthYY(axis[0])}–${monthYY(axis[11])} = 100`, `지수, ${monthYY(axis[0])}–${monthYY(axis[11])} = 100`)}
              series={[
                { name: tr("All tracked products", "전체 추적 제품"), color: "#2c6e5a", values: series.all.total },
                { name: tr(`Same ${series.n} products`, `동일 제품 ${series.n}개`), color: "#5d6d7c", values: series.fixed.total },
                { name: tr("Makeup, all", "메이크업 전체"), color: "#e3b27c", values: series.all.makeup },
              ]} />
          </Card>
        </ActionSection>
      )}

      <ActionSection id="origins" kicker={tr("Indian, Korean, global", "인도·한국·글로벌")}
        title={tr(<>K-beauty takes {pct(kShare)} of shoppers&rsquo; new ratings by value in the {spanLabel(m.period.days)}</>, <>{spanLabel(m.period.days)} 신규 평가 금액 중 K-뷰티 {pct(kShare)}</>)}
        note={tr(<>Share of buying by brand origin, from new ratings × price on the 13 categories&rsquo; top 100s. Shoppers rate makeup with one tap far more often than they review it, so lipstick and foundation weigh more here than in review value: compare an origin or category with itself over time. The Brands tab breaks it down by category and brand.</>, <>13개 카테고리 상위 100위의 신규 평가 × 가격으로 본 브랜드 국적별 구매 점유. 메이크업은 리뷰보다 별점만 남기는 경우가 훨씬 많아 립스틱·파운데이션 비중이 리뷰 금액보다 크게 나옵니다. 같은 국적·카테고리끼리 시간에 따라 비교하세요. 카테고리·브랜드별 내역은 브랜드 탭에 있습니다.</>)}
        right={<Link href="/brands/" className="rounded-full px-3.5 py-2 text-[13px] font-medium text-accent-strong ring-1 ring-line hover:bg-sunken">{tr("Open Brands →", "브랜드 탭 열기 →")}</Link>}>
        <Card className="px-5 py-5">
          {[{ label: tr(`This period (${dayMonth(win.start)}–${dayMonth(win.end)})`, `이번 기간 (${dayMonth(win.start)}–${dayMonth(win.end)})`), agg: byOrigin, tot: flowTotal },
            ...(prevOrigin && win.prev ? [{ label: tr(`Period before (${dayMonth(win.prev.start)}–${dayMonth(win.prev.end)})`, `직전 기간 (${dayMonth(win.prev.start)}–${dayMonth(win.prev.end)})`), agg: prevOrigin, tot: prevTotal }] : [])].map((x) => (
            <div key={x.label} className="mb-4 last:mb-0">
              <div className="mb-1.5 text-[12.5px] text-ink-2">{x.label}</div>
              <div className="flex h-7 overflow-hidden rounded-lg text-[11.5px] font-semibold">
                {ORIGINS.map((o) => { const v = (x.agg.get(o)?.value ?? 0) / x.tot; return v > 0.005 ? <div key={o} title={`${ORIGIN_LABEL[o]} ${pct(v, 1)}`} style={{ width: `${v * 100}%`, background: ORIGIN_COLOR[o].fill, color: ORIGIN_COLOR[o].text }} className="grid place-items-center whitespace-nowrap">{v > 0.07 ? `${ORIGIN_LABEL[o]} ${pct(v)}` : ""}</div> : null; })}
              </div>
            </div>
          ))}
          <Basis>{tr(`${flowU.length.toLocaleString("en-IN")} listings on the shelf on both days; ${compact(flowU.reduce((a, r) => a + r.flow, 0))} new ratings. Unclassified = brand origin not yet known.`, `양일 모두 진열된 제품 ${flowU.length.toLocaleString("en-IN")}개, 신규 평가 ${compact(flowU.reduce((a, r) => a + r.flow, 0))}건. 미분류 = 국적 미확인 브랜드.`)}</Basis>
        </Card>
      </ActionSection>

      <ActionSection id="changes" kicker={tr("What changed", "변화")} title={tr(`What changed in the ${spanLabel(m.period.days)}`, `${spanLabel(m.period.days)}의 변화`)}
        note={tr(`${dayMonth(win.start)} to ${dayMonth(win.end)}, ${daysBetween(win.start, win.end)} days.`, `${dayMonth(win.start)}–${dayMonth(win.end)}, ${daysBetween(win.start, win.end)}일.`)}>
        <Card className="px-5 py-4"><Points items={changes} /></Card>
        <p className="mt-4 text-[13px] text-muted">{tr(<>The previous Market tab (shelf by origin day by day, movers, the Korean store, launches) is still here: <Link href="/market/" className="font-medium text-accent-strong underline underline-offset-2">open it</Link>.</>, <>이전 시장 탭(국적별 일별 진열, 순위 변동, K-뷰티 스토어, 신제품)도 그대로 있습니다: <Link href="/market/" className="font-medium text-accent-strong underline underline-offset-2">열기</Link>.</>)}</p>
      </ActionSection>
    </Shell>
  );
}

function MethodBody() {
  return (
    <div className="space-y-3 text-[13.5px] leading-relaxed">
      <p>{tr("Nykaa does not publish sales by product. Buyers write reviews at a fairly steady rate, so reviews (and ratings) move with sales.", "Nykaa는 제품별 판매량을 공개하지 않습니다. 구매자는 비교적 일정한 비율로 리뷰를 쓰므로 리뷰(와 평가)는 판매와 함께 움직입니다.")}</p>
      <pre className="overflow-x-auto rounded-xl bg-sunken px-4 py-3 text-[12.5px] leading-6">{tr(`Category value  = reviews in the months × selling price
Category growth = value now ÷ same products' value a year earlier − 1
Nykaa growth    = Σ ( category weight × category growth )
Category weight = category's share of value in the comparison months`, `카테고리 금액   = 해당 월 리뷰 수 × 판매가
카테고리 성장률 = 현재 금액 ÷ 같은 제품의 1년 전 금액 − 1
Nykaa 성장률    = Σ ( 카테고리 비중 × 카테고리 성장률 )
카테고리 비중   = 비교 기간 금액 중 카테고리 몫`)}</pre>
      <Points items={[
        tr("Like for like counts only products on sale in the comparison months. That is the figure to hold against Nykaa's reported growth.", "동일 제품 기준은 비교 기간에 판매 중이던 제품만 셉니다. Nykaa 발표치와 비교할 수치입니다."),
        tr("Launches (first review after the comparison months) are shown separately. Their effect is overstated: we track the launches that reached today's top 100, not the ones that failed.", "신제품(비교 기간 이후 첫 리뷰)은 따로 보여 줍니다. 오늘 상위 100위에 든 신제품만 추적하므로(실패한 제품은 빠짐) 과대평가됩니다."),
        tr("For the biggest bestsellers Nykaa shows only the latest ~1,000 reviews, so their older months are incomplete; they are left out of the comparison and counted in the note under the table.", "대형 베스트셀러는 Nykaa가 최근 약 1,000개 리뷰만 보여 줘 과거 월이 불완전하므로 비교에서 빠지고, 표 아래에 개수를 적었습니다."),
        tr("Why the old figure read +3%: it compared Jul–Sep with Apr–Jun (a quarter with the one before, not a year), on older products only, and counted reviews, not value.", "이전 수치가 +3%였던 이유: 7–9월을 4–6월과 비교했고(전년이 아닌 직전 분기), 기존 제품만, 금액이 아닌 리뷰 수를 셌기 때문입니다."),
        tr("Coverage: 13 skin and makeup categories. Hair, bath & body and fragrance are not tracked (owner decision, 17 Oct).", "범위: 스킨케어·메이크업 13개 카테고리. 헤어, 바디, 향수는 추적하지 않습니다 (10월 17일 결정)."),
      ]} />
    </div>
  );
}

export default function Page() { return <AuthGate><OverviewPage /></AuthGate>; }
