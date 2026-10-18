"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import PeriodBar from "@/components/PeriodBar";
import LineChart from "@/components/LineChart";
import Sparkline from "@/components/Sparkline";
import { Card, Loading, PageHead, Verdict } from "@/components/ui";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import { Basis, Def } from "@/components/Tiered";
import { ProductLink } from "@/components/Links";
import { ORIGIN_LABEL, norm } from "@/lib/brands";
import { useBrandOffers, useEvents, useHomepage, useSearch } from "@/lib/data";
import { CATEGORY_LABEL, inr, pct, shortName, signed } from "@/lib/format";
import { catsOn, classifyOffer, eventsBetween, isCombo, placesOn, REASON_COLOR } from "@/lib/market";
import { brandShareIn, homepageDays, latestOffers, listingMoves, reviewTrend, runsFrom, shareIn, type Context } from "@/lib/profile";
import { LATEST_REPORTED, NYKAA_REPORTED } from "@/lib/reference";
import { spanLabel } from "@/lib/period";
import { useTiers } from "@/lib/tiers";
import { useMarket } from "@/lib/useMarket";
import { dayMonth, josa, monthYY, tr } from "@/lib/i18n";

/** The brand page (plan v2, owner 17 Oct 2026: "the information would revolve around it"). Everything about one brand:
 *  what to know, its products on the shelf with their moves and reasons, where it wins buying, offers and homepage,
 *  its review trend, search, and links to the deeper briefs. */

const NAV = (): NavItem[] => [
  { id: "know", label: tr("What to know", "핵심") }, { id: "products", label: tr("Products on the shelf", "진열 제품") }, { id: "categories", label: tr("By category", "카테고리별") },
  { id: "offers", label: tr("Offers & homepage", "프로모션·홈페이지") }, { id: "demand", label: tr("Demand", "수요") }, { id: "search", label: tr("Search", "검색") }, { id: "deeper", label: tr("Go deeper", "더 보기") },
];
const catName = (c: string) => CATEGORY_LABEL[c] ?? c;

export default function BrandPage() {
  return <AuthGate><Suspense fallback={<Shell active="Top by category"><Loading what={tr("the brand", "브랜드")} /></Shell>}><Brand /></Suspense></AuthGate>;
}

function Brand() {
  const params = useSearchParams();
  const asked = params.get("b") ?? "";
  const m = useMarket(); const events = useEvents(); const home = useHomepage(); const offers = useBrandOffers(); const search = useSearch();
  const runs = useMemo(() => runsFrom(home.data ?? []), [home.data]);
  const known = useMemo(() => [...new Set([...m.shelf.map((r) => r.brand), ...[...m.dims.values()].map((d) => d.brand)])], [m.shelf, m.dims]);
  const brand = known.find((b) => norm(b) === norm(asked)) ?? asked;
  const tiers = useTiers(known);
  const ctx: Context | null = m.win ? { ix: m.ix, dims: m.dims, start: m.win.start, end: m.win.end, events: events.data ?? [], runs, offers: offers.data ?? [] } : null;
  const moves = useMemo(() => (ctx && brand ? listingMoves(ctx, brand) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [brand, m.win, m.ix, m.dims, events.data, runs, offers.data]);
  const pool = useMemo(() => m.pool.filter((p) => norm(p.brand) === norm(brand)), [m.pool, brand]);
  const trend = useMemo(() => (m.latest && pool.length ? reviewTrend(pool, m.latest) : null), [pool, m.latest]);

  if (!asked) return <Shell active="Top by category"><PageHead title={tr("No brand chosen", "선택된 브랜드 없음")} sub={tr("Open a brand from any table, or search for it at the top.", "표에서 브랜드를 열거나 위 검색창에서 찾으세요.")} /></Shell>;
  if (!m.ready || !m.win || !ctx) return <Shell active="Top by category"><PageHead eyebrow={tr("Brand", "브랜드")} title={brand} sub="" /><Loading what={tr("the brand", "브랜드")} /></Shell>;

  const win = m.win; const span = m.flowSpan!;
  const origin = m.originOf(brand);
  const inSet = tiers.inSet(brand); const pinned = norm(tiers.pinned ?? "") === norm(brand);
  const today = m.shelf.filter((r) => norm(r.brand) === norm(brand)).sort((a, b) => a.rank - b.rank);
  const cats = [...new Set(today.map((r) => r.subcategory))];
  // places change, counted on the categories tracked on both days
  const c0 = catsOn(m.ix, win.start); const c1 = catsOn(m.ix, win.end); const both = new Set([...c1].filter((c) => c0.has(c)));
  const p0 = placesOn(m.ix, m.dims, win.start, both); const p1 = placesOn(m.ix, m.dims, win.end, both);
  const key = [...p1.keys(), ...p0.keys()].find((b) => norm(b) === norm(brand)) ?? brand;
  const placesD = (p1.get(key) ?? 0) - (p0.get(key) ?? 0);
  const catShares = [...new Set([...cats, ...moves.map((x) => x.subcategory)])].map((c) => ({ c, s: brandShareIn(m.flow, c, brand), places: today.filter((r) => r.subcategory === c).length, best: today.find((r) => r.subcategory === c) ?? null }))
    .filter((x) => x.places > 0 || x.s).sort((a, b) => (b.s?.share ?? 0) - (a.s?.share ?? 0));
  const strongest = catShares.find((x) => x.s);
  const up = moves.filter((x) => x.gain >= 5 && !x.entered).sort((a, b) => b.gain - a.gain);
  const down = moves.filter((x) => x.gain <= -5 && !x.left).sort((a, b) => a.gain - b.gain);
  const entered = moves.filter((x) => x.entered); const left = moves.filter((x) => x.left);
  const own = latestOffers(offers.data ?? [], brand);
  const brandOwn = own.offers.filter((o) => classifyOffer(o).brandOwn);
  const hp = homepageDays(runs, brand, win.start, win.end);
  const myRuns = runs.filter((r) => r.brand && norm(r.brand) === norm(brand));
  const evs = eventsBetween(events.data ?? [], win.start, win.end);
  const kw = (search.data ?? []).filter((s) => norm(s.brand) === norm(brand));
  const kwBy = new Map<string, { best: number; paid: number; organic: number }>();
  for (const s of kw) { const k = kwBy.get(s.query) ?? { best: 999, paid: 0, organic: 0 }; if (!s.is_ad) k.best = Math.min(k.best, s.rank); if (s.is_ad) k.paid++; else if (s.rank <= 10) k.organic++; kwBy.set(s.query, k); }
  const nykaa = LATEST_REPORTED(); const kReported = NYKAA_REPORTED()[2];

  /* ---------------- what to know */
  const best = today[0];
  const lead = today.length
    ? tr(`${brand} holds ${today.length} top-100 place${today.length === 1 ? "" : "s"} across ${cats.length} categor${cats.length === 1 ? "y" : "ies"} today${both.size ? `, ${placesD === 0 ? "as many as" : `${Math.abs(placesD)} ${placesD > 0 ? "more" : "fewer"} than`} at the start of the ${spanLabel(m.period.days)}` : ""}. Its highest is ${shortName(best.name, brand)} at #${best.rank} in ${catName(best.subcategory).toLowerCase()}.`,
      `${josa(brand, "은/는")} 오늘 ${cats.length}개 카테고리에서 상위 100위 자리 ${today.length}개${both.size ? `, ${spanLabel(m.period.days)} 시작 대비 ${placesD === 0 ? "변화 없음" : `${placesD > 0 ? "+" : ""}${placesD}`}` : ""}. 가장 높은 제품은 ${catName(best.subcategory)} #${best.rank} ${shortName(best.name, brand)}.`)
    : tr(`${brand} has no product in any tracked top 100 today.`, `${brand}: 오늘 추적 중인 상위 100위에 제품이 없습니다.`);
  const points: React.ReactNode[] = [];
  if (strongest?.s) points.push(tr(<>Strongest in <b>{catName(strongest.c).toLowerCase()}</b>: {pct(strongest.s.share, 1)} of its buying, #{strongest.s.place} of {strongest.s.of} brands ({dayMonth(span.start)}–{dayMonth(span.end)}).</>,
    <>가장 강한 곳은 <b>{catName(strongest.c)}</b>: 구매의 {pct(strongest.s.share, 1)}, 브랜드 {strongest.s.of}개 중 {strongest.s.place}위 ({dayMonth(span.start)}–{dayMonth(span.end)}).</>));
  if (up[0] || down[0]) points.push(tr(<>{up[0] ? <><ProductLink id={up[0].product_id} cat={up[0].subcategory} className="text-on-brand">{shortName(up[0].name, brand)}</ProductLink> climbed #{up[0].from} → #{up[0].to}{up[0].why[0] ? ` (${up[0].why[0].text})` : ""}</> : null}{up[0] && down[0] ? "; " : ""}{down[0] ? <><ProductLink id={down[0].product_id} cat={down[0].subcategory} className="text-on-brand">{shortName(down[0].name, brand)}</ProductLink> fell #{down[0].from} → #{down[0].to}{down[0].why[0] ? ` (${down[0].why[0].text})` : ""}</> : null}.</>,
    <>{up[0] ? <><ProductLink id={up[0].product_id} cat={up[0].subcategory} className="text-on-brand">{shortName(up[0].name, brand)}</ProductLink> #{up[0].from} → #{up[0].to} 상승{up[0].why[0] ? ` (${up[0].why[0].text})` : ""}</> : null}{up[0] && down[0] ? "; " : ""}{down[0] ? <><ProductLink id={down[0].product_id} cat={down[0].subcategory} className="text-on-brand">{shortName(down[0].name, brand)}</ProductLink> #{down[0].from} → #{down[0].to} 하락{down[0].why[0] ? ` (${down[0].why[0].text})` : ""}</> : null}.</>));
  if (entered.length || left.length) points.push(tr(<>{entered.length} listing{entered.length === 1 ? "" : "s"} entered a top 100 and {left.length} left in the period.</>, <>기간 중 상위 100위 진입 {entered.length}개, 이탈 {left.length}개.</>));
  points.push(own.day ? (brandOwn.length ? tr(<>Running its own offer: {(brandOwn[0].description || brandOwn[0].title || "").replace(/\s+/g, " ").slice(0, 90)}.{hp ? ` On Nykaa's homepage ${hp} days.` : " Not on Nykaa's homepage in the period."}</>, <>자체 프로모션 진행: {(brandOwn[0].description || brandOwn[0].title || "").replace(/\s+/g, " ").slice(0, 90)}.{hp ? ` 홈페이지 노출 ${hp}일.` : " 기간 중 홈페이지 노출 없음."}</>)
    : tr(<>No brand-own offer on its pages{own.offers.length ? ` (only Nykaa-wide ones, such as "${(own.offers[0].title ?? "").slice(0, 40)}")` : ""}.{hp ? ` On Nykaa's homepage ${hp} days.` : " Not on Nykaa's homepage in the period."}</>, <>상품 페이지에 브랜드 자체 프로모션 없음{own.offers.length ? ` (Nykaa 전체 프로모션만)` : ""}.{hp ? ` 홈페이지 노출 ${hp}일.` : " 기간 중 홈페이지 노출 없음."}</>))
    : tr(<>{hp ? `On Nykaa's homepage ${hp} days in the period. ` : ""}Its offers are not read nightly (focus brands and the 40 brands with most places are).</>, <>{hp ? `기간 중 홈페이지 노출 ${hp}일. ` : ""}이 브랜드의 프로모션은 매일 읽지 않습니다.</>));
  if (trend && trend.change !== null) points.push(tr(<>Written reviews: <b>{trend.recent.toLocaleString("en-IN")}</b> in {trend.recentLabel} vs {trend.base.toLocaleString("en-IN")} a year earlier (<b>{signed(trend.change)}</b>, {trend.products} tracked products{trend.launches ? `, ${trend.launches} launched since` : ""}). For scale: Nykaa beauty {signed(nykaa.value)} ({nykaa.label}){origin === "kbeauty" ? `, Korean beauty on Nykaa ${signed(kReported.value)} (FY26)` : ""}.</>,
    <>작성 리뷰: {trend.recentLabel} <b>{trend.recent.toLocaleString("en-IN")}건</b>, 1년 전 {trend.base.toLocaleString("en-IN")}건 (<b>{signed(trend.change)}</b>, 추적 제품 {trend.products}개{trend.launches ? `, 이후 출시 ${trend.launches}개` : ""}). 참고: Nykaa 뷰티 {signed(nykaa.value)} ({nykaa.label}){origin === "kbeauty" ? `, Nykaa K-뷰티 ${signed(kReported.value)} (FY26)` : ""}.</>));

  const rowsShown = [...moves].sort((a, b) => (a.to ?? 999) - (b.to ?? 999));
  const spark = (s: typeof moves[number]) => m.ix.days.filter((d) => d >= win.start && d <= win.end).map((d) => m.ix.byDay.get(d)?.get(s.key)?.rank ?? null).map((v) => (v === null ? null : 101 - v));

  return (
    <Shell active="Top by category" asOf={m.latest ?? undefined}>
      <PageHead eyebrow={tr(`Brand · ${ORIGIN_LABEL[origin] ?? origin}${pinned ? " · our brand" : inSet ? " · focus brand" : ""}`, `브랜드 · ${ORIGIN_LABEL[origin] ?? origin}${pinned ? " · 우리 브랜드" : inSet ? " · 주요 브랜드" : ""}`)} title={brand}
        sub={tr(`Everything about ${brand} on Nykaa in one place: its products on the shelf and why they moved, where it wins, its offers, its review trend and search.`, `Nykaa에서의 ${brand}에 관한 모든 것: 진열 제품과 순위 변화 이유, 강한 카테고리, 프로모션, 리뷰 추세, 검색.`)}
        right={<PeriodBar shelf={win} freeze={m.freeze} />} />
      <SectionNav items={NAV()} />

      <section id="know" className="mt-8 scroll-mt-32">
        <Verdict eyebrow={tr(`What to know · ${spanLabel(m.period.days)}`, `핵심 · ${spanLabel(m.period.days)}`)} points={points}>{lead}</Verdict>
        <Basis className="mt-2">{tr(<>Places: top-100 places today; the change counts the {both.size} categories tracked on both days. Buying = <Def k="ratingFlow">new ratings × price</Def>, combos left out. Reviews: all tracked products of the brand, complete months only.</>,
          <>자리: 오늘 상위 100위 자리. 변화는 양일 모두 추적한 {both.size}개 카테고리 기준. 구매 = <Def k="ratingFlow">신규 평가 × 가격</Def>, 콤보 제외. 리뷰: 브랜드의 추적 제품 전체, 완결된 달만.</>)}</Basis>
      </section>

      <ActionSection id="products" kicker={tr("Products on the shelf", "진열 제품")} title={tr(`${today.length} listing${today.length === 1 ? "" : "s"} in a top 100 today${up.length || down.length ? `; ${up.length} rose, ${down.length} fell` : ""}`, `오늘 상위 100위 ${today.length}개${up.length || down.length ? `, 상승 ${up.length}, 하락 ${down.length}` : ""}`)}
        note={tr("Every listing of the brand seen in the period. Move = middle of the first three days to the middle of the last three. Click a product to open everything about it.", "기간 중 보인 브랜드의 모든 제품. 변화 = 처음 3일 중앙값 → 마지막 3일 중앙값. 제품을 클릭하면 전체 정보가 열립니다.")}>
        <Card className="overflow-x-auto p-5">
          {rowsShown.length ? <table className="w-full min-w-[760px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="py-2 pr-3">{tr("Product", "제품")}</th><th className="px-2">{tr("Category", "카테고리")}</th><th className="px-2">{tr("Rank", "순위")}</th><th className="px-2">{tr("Trend", "추세")}</th><th className="px-2">{tr("Price", "가격")}</th><th className="px-2">{tr("Share of buying", "구매 점유")}</th><th className="px-2">{tr("Likely why", "가능한 이유")}</th></tr></thead>
            <tbody>{rowsShown.map((x) => { const r = x.series[x.series.length - 1]; const s = shareIn(m.flow, x.subcategory).of(x.product_id); const best = Math.min(...x.series.map((d) => d.rank)); return (
              <tr key={x.key} className="border-b border-line/60 align-top">
                <td className="max-w-[300px] py-2 pr-3"><ProductLink id={x.product_id} cat={x.subcategory}>{shortName(x.name, brand)}</ProductLink>{isCombo(x.name) && <span className="ml-1 rounded bg-sunken px-1 text-[10.5px] text-muted">{tr("combo", "콤보")}</span>}</td>
                <td className="px-2 text-ink-2">{catName(x.subcategory)}</td>
                <td className="whitespace-nowrap px-2 tabular">{x.from === null && x.to === null ? <span className="text-ink-2">{tr(`in and out · ${x.series.length} day${x.series.length === 1 ? "" : "s"}, best #${best}`, `잠시 진입 · ${x.series.length}일, 최고 #${best}`)}</span> : x.entered ? tr(`new · #${x.to}`, `신규 · #${x.to}`) : x.left ? tr(`left · was #${x.from}`, `이탈 · 이전 #${x.from}`) : <>#{x.from} → <b>#{x.to}</b> <span className={x.gain > 0 ? "text-good" : x.gain < 0 ? "text-bad" : "text-muted"}>{x.gain > 0 ? `▲${x.gain}` : x.gain < 0 ? `▼${-x.gain}` : "="}</span></>}</td>
                <td className="px-2"><Sparkline values={spark(x)} color="#0e3b2e" width={90} height={24} /></td>
                <td className="px-2 tabular">{inr(r?.price ?? null)}{r?.has_offer ? <span className="ml-1 rounded bg-warn-soft px-1 text-[10.5px] text-warn">{tr("offer", "프로모션")}</span> : null}{r?.is_ad ? <span className="ml-1 rounded bg-[#efe9fb] px-1 text-[10.5px] text-[#7a5bd6]">AD</span> : null}</td>
                <td className="px-2 tabular">{s ? <>{pct(s.share, 1)} <span className="text-muted">#{s.place}</span></> : "–"}</td>
                <td className="px-2">{x.why.length ? <span className="flex flex-wrap gap-1">{x.why.slice(0, 2).map((w) => <span key={w.text} className="rounded-full px-2 py-0.5 text-[11.5px] text-white" style={{ background: REASON_COLOR[w.kind] }}>{w.text}</span>)}</span> : <span className="text-muted">{Math.abs(x.gain) >= 5 && !x.entered && !x.left ? tr("no clear cause", "뚜렷한 원인 없음") : ""}</span>}</td>
              </tr>); })}</tbody>
          </table> : <p className="text-[13px] text-muted">{tr("No listing in a tracked top 100 during the period.", "기간 중 추적 상위 100위 제품이 없습니다.")}</p>}
        </Card>
      </ActionSection>

      <ActionSection id="categories" kicker={tr("By category", "카테고리별")} title={strongest?.s ? tr(`Biggest slice of buying in ${catName(strongest.c).toLowerCase()} (${pct(strongest.s.share, 1)})`, `구매 점유가 가장 큰 곳은 ${catName(strongest.c)} (${pct(strongest.s.share, 1)})`) : tr("Where it sells", "판매 카테고리")}
        note={tr(`The brand's share of each category's buying (${dayMonth(span.start)}–${dayMonth(span.end)}) and its place among the brands there. Shares compare fairly within a category, not across categories.`, `카테고리별 브랜드의 구매 점유(${dayMonth(span.start)}–${dayMonth(span.end)})와 브랜드 순위. 점유는 카테고리 안에서만 비교하세요.`)}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{catShares.map((x) => (
          <Link key={x.c} href={`/categories/?cat=${x.c}`} className="lift block rounded-[16px] bg-surface px-5 py-4 shadow-card ring-1 ring-line">
            <div className="text-[12.5px] font-medium text-muted">{catName(x.c)}</div>
            <div className="mt-1 font-display text-[26px] font-semibold tabular">{x.s ? pct(x.s.share, 1) : "–"}</div>
            <div className="text-[12.5px] text-ink-2">{x.s ? tr(`#${x.s.place} of ${x.s.of} brands · ${x.places} place${x.places === 1 ? "" : "s"}`, `브랜드 ${x.s.of}개 중 ${x.s.place}위 · ${x.places}자리`) : tr(`${x.places} place${x.places === 1 ? "" : "s"} · no new ratings counted`, `${x.places}자리 · 집계된 신규 평가 없음`)}{x.best ? tr(` · best #${x.best.rank}`, ` · 최고 #${x.best.rank}`) : ""}</div>
          </Link>))}</div>
      </ActionSection>

      <ActionSection id="offers" kicker={tr("Offers & homepage", "프로모션·홈페이지")} title={brandOwn.length ? tr(`Running ${brandOwn.length} offer${brandOwn.length === 1 ? "" : "s"} of its own`, `자체 프로모션 ${brandOwn.length}개 진행 중`) : tr("No offer of its own right now", "현재 자체 프로모션 없음")}
        note={tr("Offers on the brand's product pages (latest check), its runs on Nykaa's homepage, and Nykaa sales in the period. Read nightly since 17 Oct.", "브랜드 상품 페이지의 프로모션(최근 확인), Nykaa 홈페이지 노출, 기간 중 Nykaa 세일. 10월 17일부터 매일 수집.")}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            <div className="text-[13px] font-semibold">{tr("Offers on its products", "제품 프로모션")}{own.day ? <span className="font-normal text-muted"> · {dayMonth(own.day)}</span> : null}</div>
            {own.offers.length ? <ul className="mt-2 space-y-2 text-[13px]">{own.offers.slice(0, 8).map((o) => { const c = classifyOffer(o); return (
              <li key={o.offer_id} className="rounded-xl bg-sunken px-3 py-2"><span className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold uppercase ${c.brandOwn ? "bg-brand text-on-brand" : "bg-line text-ink-2"}`}>{c.brandOwn ? tr("brand", "브랜드") : tr("Nykaa-wide", "Nykaa 전체")}</span>{(o.description || o.title || "").replace(/\s+/g, " ").slice(0, 160)}</li>); })}</ul>
              : <p className="mt-2 text-[13px] text-muted">{own.day ? tr("None on the latest check.", "최근 확인 시 없음.") : tr("Not among the brands whose offers are read nightly.", "매일 프로모션을 읽는 브랜드가 아닙니다.")}</p>}
          </Card>
          <Card className="p-5 text-[13px]">
            <div className="font-semibold">{tr("Nykaa's homepage", "Nykaa 홈페이지")}</div>
            {myRuns.length ? <ul className="mt-2 space-y-1">{myRuns.map((r) => <li key={`${r.target}|${r.start}`}>{r.label} · {dayMonth(r.start)}–{dayMonth(r.end)} ({tr(`${r.days} days`, `${r.days}일`)}){r.isAd ? " · AD" : ""}</li>)}</ul>
              : <p className="mt-2 text-muted">{tr("Not featured since homepage reading began (17 Oct).", "홈페이지 수집 시작(10월 17일) 이후 노출 없음.")}</p>}
            <div className="mt-4 font-semibold">{tr("Nykaa sales in the period", "기간 중 Nykaa 세일")}</div>
            {evs.length ? <ul className="mt-2 space-y-1">{evs.map((e) => <li key={e.id}>{e.label} · {dayMonth(e.happened_on)}{e.ends_on ? `–${dayMonth(e.ends_on)}` : ""}{e.status === "estimated" ? tr(" (estimated)", " (추정)") : ""}</li>)}</ul> : <p className="mt-2 text-muted">{tr("None logged.", "기록 없음.")}</p>}
          </Card>
        </div>
      </ActionSection>

      <ActionSection id="demand" kicker={tr("Demand", "수요")} title={trend && trend.change !== null ? tr(`Reviews ${signed(trend.change)} vs a year earlier (${trend.recentLabel})`, `리뷰 1년 전 대비 ${signed(trend.change)} (${trend.recentLabel})`) : tr("Written reviews per month", "월별 작성 리뷰")}
        note={tr(`Written reviews per month on the brand's tracked products, last 24 complete months. The brand's own trend, not sales; Nykaa's beauty sales grew ${signed(nykaa.value)} in ${nykaa.label}.`, `브랜드 추적 제품의 월별 작성 리뷰, 최근 완결된 24개월. 브랜드 자체 추세이며 매출이 아닙니다. Nykaa 뷰티 매출 ${nykaa.label} ${signed(nykaa.value)}.`)}>
        <Card className="p-5">
          {trend && trend.values.some((v) => v !== null) ? <LineChart labels={trend.axis.map((a) => monthYY(a))} series={[{ name: tr("Reviews", "리뷰"), color: "#2a78d6", values: trend.values }]} height={220} />
            : <p className="text-[13px] text-muted">{tr("None of the brand's products is in the review-history set.", "브랜드 제품 중 리뷰 이력 수집 대상이 없습니다.")}</p>}
        </Card>
      </ActionSection>

      <ActionSection id="search" kicker={tr("Search", "검색")} title={kwBy.size ? tr(`In the results for ${kwBy.size} tracked search${kwBy.size === 1 ? "" : "es"}`, `추적 검색어 ${kwBy.size}개 결과에 노출`) : tr("Not in the results for any tracked search", "추적 검색어 결과에 없음")}
        note={tr("Today's Nykaa search results for the keywords we track: its best unpaid position, and how many of its results were paid.", "추적 검색어의 오늘 Nykaa 검색 결과: 최고 비유료 순위와 유료 노출 수.")}>
        {kwBy.size ? <div className="flex flex-wrap gap-2">{[...kwBy.entries()].sort((a, b) => a[1].best - b[1].best).map(([q, k]) => <span key={q} className="rounded-full bg-surface px-3 py-1.5 text-[13px] ring-1 ring-line">&ldquo;{q}&rdquo; {k.best < 999 ? <b className="tabular">#{k.best}</b> : null}{k.paid ? <span className="ml-1 rounded bg-[#efe9fb] px-1 text-[10.5px] font-semibold text-[#7a5bd6]">AD ×{k.paid}</span> : null}</span>)}</div>
          : <p className="text-[13px] text-muted">{tr("See Search & ads for the keywords tracked.", "추적 검색어는 검색·광고 탭에서 볼 수 있습니다.")}</p>}
      </ActionSection>

      <ActionSection id="deeper" kicker={tr("Go deeper", "더 보기")} title={tr("Where to look next", "다음에 볼 곳")}>
        <div className="flex flex-wrap gap-2 text-[13.5px]">
          {inSet && <Link href={`/analysis/?brand=${encodeURIComponent(brand)}`} className="rounded-full bg-brand px-3.5 py-2 font-medium text-on-brand">{tr(`Full ${brand} brief: scoreboard, range gaps, next steps →`, `${brand} 전체 보고서: 스코어보드, 라인업 공백, 다음 단계 →`)}</Link>}
          {cats[0] && <Link href={`/compare/?cat=${cats[0]}`} className="rounded-full px-3.5 py-2 ring-1 ring-line hover:bg-sunken">{tr(`Head-to-head in ${catName(cats[0]).toLowerCase()} →`, `${catName(cats[0])} 일대일 비교 →`)}</Link>}
          <Link href="/offers/" className="rounded-full px-3.5 py-2 ring-1 ring-line hover:bg-sunken">{tr("All offers & events →", "전체 프로모션·이벤트 →")}</Link>
          <Link href="/brands/" className="rounded-full px-3.5 py-2 ring-1 ring-line hover:bg-sunken">{tr("All brands →", "전체 브랜드 →")}</Link>
        </div>
      </ActionSection>
    </Shell>
  );
}
