"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import PeriodBar from "@/components/PeriodBar";
import LineChart, { type Marker } from "@/components/LineChart";
import { Card, Loading, PageHead, Verdict } from "@/components/ui";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import { Basis, Def } from "@/components/Tiered";
import { ImageRead, UspRead } from "@/components/ProductDrawer";
import { BrandLink, ProductLink } from "@/components/Links";
import { ORIGIN_LABEL } from "@/lib/brands";
import { useBrandOffers, useEvents, useHomepage, useProduct, useSearch } from "@/lib/data";
import { CATEGORY_LABEL, compact, inr, pct, shortName, signed } from "@/lib/format";
import { classifyOffer, isCombo, REASON_COLOR } from "@/lib/market";
import { brandShareIn, homepageDays, latestOffers, listingMove, reviewTrend, runsFrom, shareIn, type Context, type ListingMove } from "@/lib/profile";
import { LATEST_REPORTED } from "@/lib/reference";
import { spanLabel } from "@/lib/period";
import { useUspComparisons } from "@/lib/usp";
import { useMarket } from "@/lib/useMarket";
import { dayMonth, dayMonthYear, monthYY, tr } from "@/lib/i18n";
import { tx } from "@/lib/dict";
import type { ShelfRow } from "@/lib/types";
import TrailBar, { useTrail } from "@/components/Trail";
import MethodNotes, { BUYING_METHOD } from "@/components/MethodNotes";

/** The product page (plan v2, owner 17 Oct 2026: "I don't want to find the ads on the ad page, the price on the price
 *  page and the reviews on the review section"). Everything about one product on one page: what to know first, then
 *  rank and why it moved, price and offers, demand, what buyers say, its message, search, and its rivals. */

const NAV = (): NavItem[] => [
  { id: "know", label: tr("What to know", "핵심") }, { id: "shelf", label: tr("Rank & why", "순위와 이유") }, { id: "price", label: tr("Price & offers", "가격·프로모션") },
  { id: "demand", label: tr("Written reviews", "작성 리뷰") }, { id: "buyers", label: tr("What buyers say", "구매자 반응") }, { id: "message", label: tr("Its message", "메시지") },
  { id: "search", label: tr("Search", "검색") }, { id: "rivals", label: tr("Rivals", "경쟁 제품") }, { id: "method", label: tr("How this page works", "계산 방법") },
];
const CAT_COLORS = ["#0e3b2e", "#eb6834", "#2a78d6", "#eda100"];
const catName = (c: string) => CATEGORY_LABEL[c] ?? (c === "kbeauty_store" ? tr("Korean store", "K-뷰티 스토어") : c);

export default function ProductPage() {
  return <AuthGate><Suspense fallback={<Shell active="auto"><Loading what={tr("the product", "제품")} /></Shell>}><Product /></Suspense></AuthGate>;
}

function Product() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const m = useMarket(); const hist = useProduct(id || null);
  const events = useEvents(); const home = useHomepage(); const offers = useBrandOffers(); const search = useSearch(); const comps = useUspComparisons();
  const runs = useMemo(() => runsFrom(home.data ?? []), [home.data]);

  const rows = useMemo(() => m.shelf.filter((r) => r.product_id === id).sort((a, b) => a.rank - b.rank), [m.shelf, id]);
  const cat0 = m.catalog.find((r) => r.product_id === id) ?? null;
  const dim = m.dims.get(id);
  const brand = rows[0]?.brand ?? cat0?.brand ?? dim?.brand ?? hist.data?.months[0]?.brand ?? "";
  const name = rows[0]?.name ?? cat0?.name ?? dim?.name ?? hist.data?.months[0]?.name ?? id;
  const origin = rows[0]?.origin ?? dim?.origin ?? (brand ? m.originOf(brand) : "unknown");
  const cats = useMemo(() => {
    const seen = new Set<string>(); for (const k of m.ix.series.keys()) { const [c, p] = k.split("|"); if (p === id && c !== "kbeauty_store") seen.add(c); }
    const want = params.get("cat");
    return [...seen].sort((a, b) => (a === want ? -1 : b === want ? 1 : (rows.find((r) => r.subcategory === a)?.rank ?? 999) - (rows.find((r) => r.subcategory === b)?.rank ?? 999)));
  }, [m.ix, id, rows, params]);
  const main = cats[0] ?? rows[0]?.subcategory ?? cat0?.subcategories?.[0] ?? null;
  const row: Partial<ShelfRow> | null = rows.find((r) => r.subcategory === main) ?? rows[0] ?? (cat0 ? { ...cat0, image_url: cat0.best_image } as Partial<ShelfRow> : null);

  const ctx: Context | null = m.win ? { ix: m.ix, dims: m.dims, start: m.win.start, end: m.win.end, events: events.data ?? [], runs, offers: offers.data ?? [] } : null;
  const moves = useMemo(() => (ctx ? cats.map((c) => listingMove(ctx, c, id)).filter((x): x is ListingMove => !!x) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cats, id, m.win, m.ix, events.data, runs, offers.data]);
  const poolMine = useMemo(() => m.pool.filter((p) => p.product_id === id), [m.pool, id]);
  const trend = useMemo(() => (m.latest && poolMine.length ? reviewTrend(poolMine, m.latest) : null), [poolMine, m.latest]);
  const hero = (comps.data ?? []).find((g) => g.anchor_product_id === id || g.products.includes(id));
  const trail = useTrail(id && name !== id ? shortName(name, brand) : null);

  if (!id) return <Shell active="auto"><PageHead title={tr("No product chosen", "선택된 제품 없음")} sub={tr("Open a product from any table, or search for it at the top.", "표에서 제품을 열거나 위 검색창에서 찾으세요.")} /></Shell>;
  if (!m.ready || !m.win || !ctx) return <Shell active="auto"><div className="mt-6"><TrailBar trail={trail} /></div><PageHead eyebrow={tr("Product", "제품")} title={name === id ? tr("Loading product…", "제품 불러오는 중…") : shortName(name, brand)} sub="" /><Loading what={tr("the product", "제품")} /></Shell>;

  const win = m.win; const span = m.flowSpan!;
  const mv = moves.find((x) => x.subcategory === main) ?? null;
  const share = main ? shareIn(m.flow, main).of(id) : null;
  const bShare = main && brand ? brandShareIn(m.flow, main, brand) : null;
  const combo = isCombo(name);
  const days = (hist.data?.history ?? []).filter((h) => h.subcategory === main);
  const inWin = days.filter((h) => h.scrape_date >= win.start && h.scrape_date <= win.end);
  const prices = inWin.map((h) => h.price).filter((x): x is number => x !== null);
  const adDays = inWin.filter((h) => h.is_ad).length; const offerDays = inWin.filter((h) => h.has_offer).length;
  const lo = prices.length ? Math.min(...prices) : null; const hi = prices.length ? Math.max(...prices) : null;
  const price = row?.price ?? null; const mrp = row?.mrp ?? null;
  const own = brand ? latestOffers(offers.data ?? [], brand) : { day: null, offers: [] };
  const hp = brand ? homepageDays(runs, brand, win.start, win.end) : 0;
  const phrases = (row?.review_key_phrases ?? []).filter((p) => p.sentiment === "Positive").slice(0, 4).map((p) => tx(p.text));
  const minus = (row?.review_key_phrases ?? []).filter((p) => p.sentiment === "Negative").slice(0, 3).map((p) => tx(p.text));
  const kw = (search.data ?? []).filter((s) => s.product_id === id).sort((a, b) => a.rank - b.rank);
  const kwBest = new Map<string, (typeof kw)[number]>(); for (const s of kw) if (!kwBest.has(s.query) || s.rank < kwBest.get(s.query)!.rank) kwBest.set(s.query, s);
  const nykaa = LATEST_REPORTED();

  /* ---------------- what to know: one sentence per question, each with its number */
  const where = rows.length ? rows.filter((r) => r.subcategory !== "kbeauty_store").map((r) => `#${r.rank} ${tr("among", "")} ${catName(r.subcategory).toLowerCase()}${r.nykaa_rank && r.nykaa_rank !== r.rank ? tr(` (#${r.nykaa_rank} on Nykaa's page)`, ` (Nykaa 페이지 #${r.nykaa_rank})`) : ""}`).join(", ") : null;
  const lead = !where ? tr(`${shortName(name, brand)} is not in any tracked top 100 today.`, `${shortName(name, brand)}은(는) 오늘 추적 중인 상위 100위에 없습니다.`)
    : !mv || mv.from === null || mv.to === null ? tr(`${shortName(name, brand)} is ${where} today.`, `${shortName(name, brand)}: 오늘 ${where}.`)
    : Math.abs(mv.gain) < 5 ? tr(`${shortName(name, brand)} is ${where} today, steady over the ${spanLabel(m.period.days)} (around #${mv.to}).`, `${shortName(name, brand)}: 오늘 ${where}. ${spanLabel(m.period.days)} 동안 #${mv.to} 안팎에서 안정적.`)
    : tr(`${shortName(name, brand)} is ${where} today, ${mv.gain > 0 ? "up" : "down"} from about #${mv.from} to #${mv.to} over the ${spanLabel(m.period.days)}.`, `${shortName(name, brand)}: 오늘 ${where}. ${spanLabel(m.period.days)} 동안 약 #${mv.from} → #${mv.to}로 ${mv.gain > 0 ? "상승" : "하락"}.`);
  const points: React.ReactNode[] = [];
  if (mv && Math.abs(mv.gain) >= 5) points.push(mv.why.length
    ? tr(<>Likely why: {mv.why.slice(0, 2).map((r) => r.text).join("; ")}.</>, <>가능한 이유: {mv.why.slice(0, 2).map((r) => r.text).join("; ")}.</>)
    : tr(<>No clear cause found for the move (price, offers, ads, stock, homepage and sales were checked).</>, <>뚜렷한 원인이 없습니다 (가격·프로모션·광고·재고·홈페이지·세일 확인).</>));
  if (combo) points.push(tr(<>This is a combo: Nykaa shows it with the ratings of the products inside, so it is left out of buying shares.</>, <>콤보 제품입니다. Nykaa가 구성품 평가를 합쳐 보여주므로 구매 점유에서 제외합니다.</>));
  else if (share && main) points.push(tr(<>It took <b>{pct(share.share, 1)}</b> of all {catName(main).toLowerCase()} buying and {pct(share.units, 1)} of units ({dayMonth(span.start)}–{dayMonth(span.end)}), <b>#{share.place}</b> of {share.of} single products{bShare ? <>; {brand} as a brand holds {pct(bShare.share, 1)} (#{bShare.place})</> : null}.{share.poolSize > 1 ? ` Nykaa shows one rating count for ${share.poolSize} of ${brand}'s products; it is counted once, at their median price.` : ""}</>,
    <>{catName(main)} 구매 전체의 <b>{pct(share.share, 1)}</b>, 수량의 {pct(share.units, 1)}({dayMonth(span.start)}–{dayMonth(span.end)}), 단일 제품 {share.of}개 중 <b>{share.place}위</b>{bShare ? <>. 브랜드 {brand} 전체는 {pct(bShare.share, 1)} ({bShare.place}위)</> : null}.{share.poolSize > 1 ? ` Nykaa가 ${brand} 제품 ${share.poolSize}개에 하나의 평가 수를 보여주므로 중간 가격으로 한 번만 집계.` : ""}</>));
  if (price !== null) points.push(tr(<>Sells at <b>{inr(price)}</b>{mrp && mrp > price ? <> ({Math.round((1 - price / mrp) * 100)}% off {inr(mrp)})</> : null}{lo !== null && hi !== null && hi > lo ? <>; between {inr(lo)} and {inr(hi)} in the period</> : null}. {offerDays ? `Offer tag on ${offerDays} of ${inWin.length} days` : "No offer tag in the period"}{adDays ? `; in a paid slot on ${adDays} days` : ""}.</>,
    <>판매가 <b>{inr(price)}</b>{mrp && mrp > price ? <> (정가 {inr(mrp)}에서 {Math.round((1 - price / mrp) * 100)}% 할인)</> : null}{lo !== null && hi !== null && hi > lo ? <>. 기간 중 {inr(lo)}–{inr(hi)}</> : null}. {offerDays ? `프로모션 표시 ${inWin.length}일 중 ${offerDays}일` : "기간 중 프로모션 표시 없음"}{adDays ? `, 광고 자리 ${adDays}일` : ""}.</>));
  if (trend && trend.change !== null) points.push(tr(<>Written reviews: <b>{trend.recent}</b> in {trend.recentLabel} vs {trend.base} a year earlier (<b>{signed(trend.change)}</b>). Nykaa&rsquo;s beauty sales grew {signed(nykaa.value)} in {nykaa.label}.</>,
    <>작성 리뷰: {trend.recentLabel} <b>{trend.recent}건</b>, 1년 전 {trend.base}건 (<b>{signed(trend.change)}</b>). Nykaa 뷰티 매출 성장률 {signed(nykaa.value)} ({nykaa.label}).</>));
  if (phrases.length) points.push(tr(<>Buyers praise {phrases.join(", ").toLowerCase()}{minus.length ? <>; complaints: {minus.join(", ").toLowerCase()}</> : null}.</>, <>구매자 호평: {phrases.join(", ")}{minus.length ? <>. 불만: {minus.join(", ")}</> : null}.</>));

  /* ---------------- rank chart across its categories, with offer and ad days marked */
  const allDays = m.ix.days;
  const series = cats.slice(0, 4).map((c, i) => ({ name: catName(c), color: CAT_COLORS[i], values: allDays.map((d) => m.ix.byDay.get(d)?.get(`${c}|${id}`)?.rank ?? null) }));
  const brandRuns = runs.filter((r) => r.brand && brand && r.brand.toLowerCase() === brand.toLowerCase());
  const markers: Marker[] = [
    ...(events.data ?? []).filter((e) => (e.ends_on ?? e.happened_on) >= allDays[0] && e.happened_on <= allDays[allDays.length - 1]).map((e) => ({ from: Math.max(0, allDays.findIndex((d) => d >= e.happened_on)), to: Math.max(0, allDays.findIndex((d) => d >= (e.ends_on ?? e.happened_on))), label: e.label, color: "#b4532a" })),
    ...brandRuns.map((r) => ({ from: Math.max(0, allDays.indexOf(r.start)), to: Math.max(0, allDays.indexOf(r.end)), label: tr("on homepage", "홈페이지"), color: "#e87ba4" })),
  ];
  const priceDays = days.map((h) => h.scrape_date);

  /* ---------------- rivals: the category's top sellers and the listings around it */
  const sh = main ? shareIn(m.flow, main) : null;
  const shelfHere = main ? m.shelf.filter((r) => r.subcategory === main).sort((a, b) => a.rank - b.rank) : [];
  const myRank = rows.find((r) => r.subcategory === main)?.rank ?? null;
  const near = myRank ? shelfHere.filter((r) => r.product_id !== id && Math.abs(r.rank - myRank) <= 3) : [];
  const topSellers = sh ? sh.rows.filter((r) => r.product_id !== id).slice(0, 6) : [];
  const rivalIds = [...new Set([...topSellers.map((r) => r.product_id), ...near.map((r) => r.product_id)])];
  const rivalRow = (pid: string) => shelfHere.find((r) => r.product_id === pid);
  const rivalMove = (pid: string) => (main ? listingMove(ctx, main, pid) : null);

  return (
    <Shell active="auto" asOf={m.latest ?? undefined}>
      <div className="mt-6"><TrailBar trail={trail} /></div>
      <PageHead eyebrow={tr(`Product · ${main ? catName(main) : "not on a tracked shelf"}`, `제품 · ${main ? catName(main) : "추적 진열 밖"}`)} title={shortName(name, brand)}
        sub={<><BrandLink brand={brand} className="font-medium text-ink" /> · {ORIGIN_LABEL[origin] ?? origin}{row?.country_name ? tr(` · made in ${row.country_name}`, ` · ${tx(row.country_name)} 생산`) : ""}{row?.rating ? <> · ★ {row.rating.toFixed(1)} ({compact(row.rating_count)} {tr("ratings", "평가")})</> : null}{row?.url ? <> · <a href={row.url} target="_blank" rel="noreferrer" className="text-accent-strong underline underline-offset-2">{tr("Open on Nykaa ↗", "Nykaa에서 보기 ↗")}</a></> : null}</>}
        right={<div className="flex items-end gap-4">
          {row?.image_url && <div className="hidden h-28 w-28 place-items-center rounded-2xl bg-surface ring-1 ring-line sm:grid">
            {/* eslint-disable-next-line @next/next/no-img-element -- images served by Nykaa's CDN */}
            <img src={row.image_url} alt="" className="h-[85%] w-[85%] object-contain" />
          </div>}
          <PeriodBar shelf={win} freeze={m.freeze} />
        </div>} />
      <SectionNav items={NAV()} />

      <section id="know" className="mt-8 scroll-mt-32">
        <Verdict eyebrow={tr(`What to know · ${spanLabel(m.period.days)}`, `핵심 · ${spanLabel(m.period.days)}`)} points={points}>{lead}</Verdict>
        <Basis className="mt-2">{tr(<>Rank moves use the middle of the first and last three days. Buying = <Def k="ratingFlow">new ratings × price</Def>, combos left out. Reviews: complete months only.</>, <>순위 변화는 처음·마지막 3일의 중앙값 기준. 구매 = <Def k="ratingFlow">신규 평가 × 가격</Def>, 콤보 제외. 리뷰: 완결된 달만.</>)}</Basis>
      </section>

      <ActionSection id="shelf" kicker={tr("Rank & why", "순위와 이유")} title={mv && Math.abs(mv.gain) >= 5 ? tr(`${mv.gain > 0 ? "Up" : "Down"} ${Math.abs(mv.gain)} places in ${main ? catName(main).toLowerCase() : ""} over the ${spanLabel(m.period.days)}`, `${spanLabel(m.period.days)} ${main ? catName(main) : ""}에서 ${Math.abs(mv.gain)}계단 ${mv.gain > 0 ? "상승" : "하락"}`) : tr("Its place on Nykaa's lists", "Nykaa 목록에서의 위치")}
        note={tr("Daily rank in each category's top 100 since tracking began (1 = top; gaps = outside the top 100). Shaded: Nykaa sales and days the brand was on Nykaa's homepage.", "수집 시작 이후 카테고리별 상위 100위 일별 순위 (1 = 최상위, 끊김 = 100위 밖). 음영: Nykaa 세일과 브랜드의 홈페이지 노출일.")}>
        <Card className="p-5">
          {series.some((s) => s.values.some((v) => v !== null)) ? <LineChart labels={allDays.map((d) => dayMonth(d))} series={series} invert height={240} markers={markers} />
            : <p className="text-[13px] text-muted">{tr("Not in any tracked top 100 since tracking began.", "수집 시작 이후 추적 중인 상위 100위에 든 적이 없습니다.")}</p>}
          {!!moves.length && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-[13px]">
                <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="py-2 pr-3">{tr("Category", "카테고리")}</th><th className="px-2">{tr("Move", "변화")}</th><th className="px-2">{tr("Share of buying", "구매 점유")}</th><th className="px-2">{tr("Likely why", "가능한 이유")}</th></tr></thead>
                <tbody>{moves.map((x) => { const s = shareIn(m.flow, x.subcategory).of(id); return (
                  <tr key={x.key} className="border-b border-line/60 align-top">
                    <td className="py-2 pr-3 font-medium">{catName(x.subcategory)}</td>
                    <td className="px-2 tabular">{x.entered ? tr(`entered at #${x.to}`, `#${x.to}로 진입`) : x.left ? tr(`left (was #${x.from})`, `이탈 (이전 #${x.from})`) : <>#{x.from} → <b>#{x.to}</b> <span className={x.gain > 0 ? "text-good" : x.gain < 0 ? "text-bad" : "text-muted"}>{x.gain > 0 ? `▲${x.gain}` : x.gain < 0 ? `▼${-x.gain}` : "="}</span></>}</td>
                    <td className="px-2 tabular">{combo ? <span className="text-muted">{tr("combo, not counted", "콤보, 제외")}</span> : s ? <>{pct(s.share, 1)} <span className="text-muted">#{s.place}</span></> : "–"}</td>
                    <td className="px-2">{x.why.length ? <span className="flex flex-wrap gap-1">{x.why.slice(0, 3).map((r) => <span key={r.text} className="rounded-full px-2 py-0.5 text-[11.5px] text-white" style={{ background: REASON_COLOR[r.kind] }}>{r.text}</span>)}</span> : <span className="text-muted">{Math.abs(x.gain) >= 5 ? tr("no clear cause", "뚜렷한 원인 없음") : tr("steady", "안정")}</span>}</td>
                  </tr>); })}</tbody>
              </table>
            </div>
          )}
        </Card>
      </ActionSection>

      <ActionSection id="price" kicker={tr("Price & offers", "가격·프로모션")} title={price !== null ? tr(`Sells at ${inr(price)}${mrp && mrp > price ? `, ${Math.round((1 - price / mrp) * 100)}% off MRP` : ""}`, `판매가 ${inr(price)}${mrp && mrp > price ? `, 정가 대비 ${Math.round((1 - price / mrp) * 100)}% 할인` : ""}`) : tr("Price", "가격")}
        note={tr("Selling price on each collection day in its main category, the offers the brand runs on its product pages, and Nykaa's homepage.", "주 카테고리에서 수집일마다 표시된 판매가, 브랜드가 상품 페이지에 건 프로모션, Nykaa 홈페이지.")}>
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card className="p-5">
            {days.some((h) => h.price !== null) ? <LineChart labels={priceDays.map((d) => dayMonth(d))} series={[{ name: tr("Selling price", "판매가"), color: "#0e3b2e", values: days.map((h) => h.price) }, { name: "MRP", color: "#a3b0a9", values: days.map((h) => h.mrp) }]} height={200} format={(v) => inr(v)} />
              : <p className="text-[13px] text-muted">{hist.data ? tr("No price history on a tracked shelf.", "추적 진열의 가격 이력이 없습니다.") : tr("Loading…", "불러오는 중…")}</p>}
            <div className="mt-3 flex flex-wrap gap-2 text-[12.5px]">
              <span className="rounded-full bg-sunken px-2.5 py-1">{tr(`Offer tag: ${offerDays} of ${inWin.length} days`, `프로모션 표시: ${inWin.length}일 중 ${offerDays}일`)}</span>
              <span className="rounded-full bg-sunken px-2.5 py-1">{tr(`Paid slot: ${adDays} days`, `광고 자리: ${adDays}일`)}</span>
              <span className="rounded-full bg-sunken px-2.5 py-1">{tr(`${brand} on the homepage: ${hp} days`, `${brand} 홈페이지 노출: ${hp}일`)}</span>
            </div>
          </Card>
          <Card className="p-5">
            <div className="text-[13px] font-semibold">{tr(`Offers on ${brand}'s products`, `${brand} 제품 프로모션`)}{own.day ? <span className="font-normal text-muted"> · {dayMonth(own.day)}</span> : null}</div>
            {row?.offer_message && <p className="mt-2 rounded-xl bg-warn-soft px-3 py-2 text-[13px] text-warn">{tr("On this listing today: ", "오늘 이 제품: ")}{row.offer_message}</p>}
            {own.offers.length ? <ul className="mt-2 space-y-2 text-[13px]">{own.offers.slice(0, 6).map((o) => { const c = classifyOffer(o); return (
              <li key={o.offer_id} className="rounded-xl bg-sunken px-3 py-2"><span className={`mr-1.5 rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold uppercase ${c.brandOwn ? "bg-brand text-on-brand" : "bg-line text-ink-2"}`}>{c.brandOwn ? tr("brand", "브랜드") : tr("Nykaa-wide", "Nykaa 전체")}</span>{(o.description || o.title || "").replace(/\s+/g, " ").slice(0, 140)}</li>); })}</ul>
              : <p className="mt-2 text-[13px] text-muted">{own.day ? tr("No offer on its product pages on the latest check.", "최근 확인 시 상품 페이지 프로모션 없음.") : tr("Not among the brands whose offers are read nightly.", "매일 프로모션을 읽는 브랜드가 아닙니다.")}</p>}
            <p className="mt-3 text-[12px] text-muted">{tr("Offers are read nightly since 17 Oct for the focus brands and the 40 brands with most top-100 places.", "10월 17일부터 주요 브랜드와 상위 100위 자리가 많은 40개 브랜드의 프로모션을 매일 읽습니다.")} <Link href="/offers/" className="underline underline-offset-2">{tr("All offers & events", "전체 프로모션·이벤트")}</Link></p>
          </Card>
        </div>
      </ActionSection>

      <ActionSection id="demand" kicker={tr("Written reviews, 12-month trend", "작성 리뷰, 12개월 추세")} title={trend && trend.change !== null ? tr(`Reviews ${signed(trend.change)} vs a year earlier (${trend.recentLabel})`, `리뷰 1년 전 대비 ${signed(trend.change)} (${trend.recentLabel})`) : tr("Written reviews per month", "월별 작성 리뷰")}
        note={tr(`Written reviews dated by Nykaa, last 24 complete months. This is the product's own trend, not a sales figure; for scale, Nykaa's beauty sales grew ${signed(nykaa.value)} in ${nykaa.label}.`, `Nykaa가 날짜를 붙인 작성 리뷰, 최근 완결된 24개월. 제품 자체의 추세이며 매출이 아닙니다. 참고: Nykaa 뷰티 매출 ${nykaa.label} ${signed(nykaa.value)}.`)}>
        <Card className="p-5">
          {trend && trend.values.some((v) => v !== null) ? <LineChart labels={trend.axis.map((a) => monthYY(a))} series={[{ name: tr("Reviews", "리뷰"), color: "#2a78d6", values: trend.values }]} height={220} />
            : <p className="text-[13px] text-muted">{tr("This product is not in the review-history set (we follow the focus brands' ranges and the most visible competitors).", "이 제품은 리뷰 이력 수집 대상이 아닙니다 (주요 브랜드 라인업과 노출이 많은 경쟁 제품만 추적).")}</p>}
        </Card>
      </ActionSection>

      <ActionSection id="buyers" kicker={tr("What buyers say", "구매자 반응")} title={phrases.length ? tr(`Praised for ${phrases.slice(0, 3).join(", ").toLowerCase()}`, `호평: ${phrases.slice(0, 3).join(", ")}`) : tr("What buyers say", "구매자 반응")}
        note={tr("Nykaa's review themes, its star split and the latest reviews.", "Nykaa 리뷰 주제, 별점 분포, 최근 리뷰.")}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5">
            {row?.review_splitup ? (() => { const sp = row.review_splitup!; const tot = Object.values(sp).reduce((a, b) => a + b, 0) || 1; return ["5", "4", "3", "2", "1"].map((k) => (
              <div key={k} className="flex items-center gap-3 py-0.5 text-[12px] text-muted tabular"><span className="w-3">{k}★</span><div className="h-2 flex-1 rounded-full bg-sunken"><div className="h-2 rounded-full bg-brand" style={{ width: `${((sp[k] ?? 0) / tot) * 100}%`, opacity: Number(k) >= 4 ? 1 : 0.45 }} /></div><span className="w-10 text-right">{Math.round(((sp[k] ?? 0) / tot) * 100)}%</span></div>)); })()
              : <p className="text-[13px] text-muted">{tr("No star split collected.", "별점 분포 없음.")}</p>}
            {!!row?.review_key_phrases?.length && <div className="mt-4 flex flex-wrap gap-1.5">{row.review_key_phrases.map((ph) => <span key={ph.text} className={`rounded-full px-2.5 py-1 text-[12px] ${ph.sentiment === "Positive" ? "bg-[#eaf6ee] text-good" : "bg-[#fbecea] text-bad"}`}>{tx(ph.text)}</span>)}</div>}
            {!!hist.data?.aspects.length && <div className="mt-4 space-y-1.5">{hist.data.aspects.slice(0, 6).map((a) => { const p = Math.round((a.positive / a.total) * 100); return (
              <div key={a.label} className="flex items-center gap-3 text-[12.5px]"><span className="w-36 shrink-0 truncate text-ink-2">{tx(a.label)}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-sunken"><div className="h-full bg-good" style={{ width: `${p}%` }} /></div><span className="w-24 text-right text-muted tabular">{tr(`${p}% of ${a.total}`, `${a.total}건 중 ${p}%`)}</span></div>); })}</div>}
          </Card>
          <Card className="p-5">
            {hist.data?.texts.length ? <div className="space-y-3">{hist.data.texts.slice(0, 4).map((t) => (
              <div key={t.review_id} className="rounded-xl bg-sunken px-4 py-3"><div className="flex justify-between text-[12px] text-muted"><span>{"★".repeat(t.rating ?? 0)}{t.is_buyer ? tr(" · verified buyer", " · 구매 인증") : ""}</span><span>{dayMonthYear(t.created_on)}</span></div>
                {t.title && <div className="mt-1 text-[13.5px] font-medium">{t.title}</div>}{t.body && <div className="mt-0.5 text-[13px] leading-relaxed text-ink-2">{t.body.slice(0, 220)}{t.body.length > 220 ? "…" : ""}</div>}</div>))}</div>
              : <p className="text-[13px] text-muted">{hist.data ? tr("No review text collected for this product.", "이 제품의 리뷰 원문이 없습니다.") : tr("Loading…", "불러오는 중…")}</p>}
          </Card>
        </div>
      </ActionSection>

      <ActionSection id="message" kicker={tr("Its message", "메시지")} title={tr("What it sells itself on", "핵심 소구점")}
        note={tr("From its Nykaa page: claims, key ingredients and concerns, plus the reading of its gallery and reviews where it was analysed.", "Nykaa 상품 페이지의 소구점·핵심 성분·고민, 분석된 제품은 상세 이미지와 리뷰 분석 포함.")}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5 text-[13.5px]">
            {row?.usp_summary ? <p className="leading-relaxed">{tx(row.usp_summary)}</p> : <p className="text-muted">{tr("No claims text on its page.", "상품 페이지에 소구 문구가 없습니다.")}</p>}
            {!!row?.usp_points?.length && <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">{row.usp_points.slice(0, 5).map((u) => <li key={u}>{tx(u)}</li>)}</ul>}
            {!!row?.key_ingredients?.length && <p className="mt-3 text-ink-2"><span className="text-muted">{tr("Key ingredients: ", "핵심 성분: ")}</span>{row.key_ingredients.join(", ")}</p>}
            {!!row?.concerns?.length && <p className="mt-1 text-ink-2"><span className="text-muted">{tr("For: ", "대상: ")}</span>{row.concerns.join(", ")}</p>}
            {hero && main && <Link href={`/compare/?cat=${main}&hero=${hero.anchor_product_id}`} className="mt-4 inline-flex rounded-lg bg-brand px-3 py-1.5 text-[13px] font-medium text-on-brand">{tr("Message vs its rivals, side by side →", "경쟁 제품과 메시지 비교 →")}</Link>}
          </Card>
          <div className="-mt-7"><UspRead productId={id} /><ImageRead productId={id} /></div>
        </div>
      </ActionSection>

      <ActionSection id="search" kicker={tr("Search", "검색")} title={kwBest.size ? tr(`Shows up in the top results for ${kwBest.size} tracked search${kwBest.size === 1 ? "" : "es"}`, `추적 검색어 ${kwBest.size}개의 상위 결과에 노출`) : tr("Not in the top results for any tracked search", "추적 검색어 상위 결과에 없음")}
        note={tr("Today's Nykaa search results for the keywords we track. AD = a paid position.", "추적 중인 검색어의 오늘 Nykaa 검색 결과. AD = 유료 노출.")}>
        {kwBest.size ? <div className="flex flex-wrap gap-2">{[...kwBest.values()].map((s) => <span key={s.query} className="rounded-full bg-surface px-3 py-1.5 text-[13px] ring-1 ring-line">&ldquo;{s.query}&rdquo; <b className="tabular">#{s.rank}</b>{s.is_ad ? <span className="ml-1 rounded bg-[#efe9fb] px-1 text-[10.5px] font-semibold text-[#7a5bd6]">AD</span> : null}</span>)}</div>
          : <p className="text-[13px] text-muted">{tr("Searches are tracked for category words and a few brand names; see Search & ads.", "카테고리 단어와 일부 브랜드명 검색어를 추적합니다. 검색·광고 탭 참고.")}</p>}
      </ActionSection>

      <ActionSection id="rivals" kicker={tr("Rivals", "경쟁 제품")} title={main ? tr(`Who it competes with in ${catName(main).toLowerCase()}`, `${catName(main)}에서의 경쟁 제품`) : tr("Rivals", "경쟁 제품")}
        note={tr("The category's biggest sellers in the period and the listings ranked just around it. Click any to open its page.", "기간 중 카테고리 최대 판매 제품과 바로 위아래 순위 제품. 클릭하면 해당 페이지가 열립니다.")}
        right={main ? <Link href={hero ? `/compare/?cat=${main}&hero=${hero.anchor_product_id}` : `/compare/?cat=${main}`} className="rounded-full bg-brand px-3.5 py-1.5 text-[13px] font-medium text-on-brand">{tr("Head-to-head comparison →", "일대일 비교 →")}</Link> : null}>
        <Card className="overflow-x-auto p-5">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="py-2 pr-3">{tr("Product", "제품")}</th><th className="px-2">{tr("Rank", "순위")}</th><th className="px-2">{tr("Move", "변화")}</th><th className="px-2">{tr("Price", "가격")}</th><th className="px-2">{tr("Share of buying", "구매 점유")}</th></tr></thead>
            <tbody>
              {main && share && <tr className="border-b border-line/60 bg-accent-soft/60"><td className="py-2 pr-3 font-semibold">{tr("This product", "이 제품")}</td><td className="px-2 tabular">#{myRank ?? "–"}</td><td className="px-2 tabular">{mv && mv.from !== null && mv.to !== null ? `#${mv.from} → #${mv.to}` : "–"}</td><td className="px-2 tabular">{inr(price)}</td><td className="px-2 tabular">{pct(share.share, 1)}</td></tr>}
              {rivalIds.map((pid) => { const r = rivalRow(pid); const d = m.dims.get(pid); const s = sh?.of(pid); const rm = rivalMove(pid); return (
                <tr key={pid} className="border-b border-line/60">
                  <td className="py-2 pr-3"><BrandLink brand={d?.brand ?? r?.brand ?? ""} className="font-medium" /> <ProductLink id={pid} cat={main}>{shortName(d?.name ?? r?.name ?? pid, d?.brand ?? r?.brand ?? "")}</ProductLink></td>
                  <td className="px-2 tabular">{r ? `#${r.rank}` : tr("out", "밖")}</td>
                  <td className="px-2 tabular">{rm && rm.from !== null && rm.to !== null ? <span className={rm.gain > 0 ? "text-good" : rm.gain < 0 ? "text-bad" : "text-muted"}>#{rm.from} → #{rm.to}</span> : "–"}</td>
                  <td className="px-2 tabular">{inr(r?.price ?? null)}</td>
                  <td className="px-2 tabular">{s ? pct(s.share, 1) : "–"}</td>
                </tr>); })}
            </tbody>
          </table>
        </Card>
      </ActionSection>
      <MethodNotes parts={{
        sources: [tr("Nykaa's top 100 of each tracked category (nightly), the product's Nykaa page (details, buyers' review highlights), Nykaa's homepage and search results, its written reviews by month.", "추적 카테고리별 Nykaa 상위 100위(매일), 제품의 Nykaa 페이지(상세, 리뷰 요약), Nykaa 홈페이지와 검색 결과, 월별 작성 리뷰.")],
        calc: [...BUYING_METHOD().calc, tr("Rank: place among the category's own products; Nykaa's page position shown next to it when different. Move: middle of the first three days to the middle of the last three; reasons are what changed on the same dates.", "순위: 카테고리 자체 제품 중 위치(다르면 Nykaa 페이지 순위를 함께 표시). 변화: 처음 3일 중앙값 → 마지막 3일 중앙값, 이유는 같은 날 달라진 것.")],
        assume: BUYING_METHOD().assume,
        limits: [...BUYING_METHOD().limits, tr("Reasons for a move are what changed at the same time, not proof.", "변화의 이유는 같은 시기에 달라진 것이며 증거가 아닙니다.")],
      }} />
    </Shell>
  );
}
