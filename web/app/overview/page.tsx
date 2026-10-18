"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { Card, Loading, PageHead } from "@/components/ui";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import { Def } from "@/components/Tiered";
import { BrandQuick, DetailsButton, ProductQuick, useMoveContext } from "@/components/Quick";
import ExternalNewsList from "@/components/External";
import MethodNotes, { BUYING_METHOD } from "@/components/MethodNotes";
import { ScopePanel } from "@/components/Scope";
import { norm } from "@/lib/brands";
import { useCategoryBrands, useHomepage } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL, pct, shortName, signed } from "@/lib/format";
import { catsOn, isCombo, MAKEUP, perDay, placesOn } from "@/lib/market";
import { listingMoves, runsFrom, sameProductGrowth, type ListingMove } from "@/lib/profile";
import { cagr, DERMA_BRANDS, DOC, ECB_KRW_PER_INR, eok, HON_BRANDS, IR_PAGE, KRW_PER_INR, NYKAA_QUARTERS, NYKAA_YEARS } from "@/lib/reference";
import { spanLabel } from "@/lib/period";
import { useTiers } from "@/lib/tiers";
import { useMarket } from "@/lib/useMarket";
import { useScope } from "@/lib/scope";
import { ORIGIN_COLOR, ORIGIN_LABEL } from "@/lib/brands";
import type { Origin } from "@/lib/types";
import { dayMonth, tr } from "@/lib/i18n";

/** The Brief (plan v4, owner 18 Oct 2026: "this can be the tab that shows the accuracy and soundness of our data with
 *  the facts available from outside sources, primarily Nykaa"). Nykaa's own size by year and quarter, what Nykaa says
 *  backing what its shelf shows (owner 18 Oct: verdicts and data checks are for the owner, not the page), then
 *  what changed: Innisfree first, then Korean
 *  brands, then the whole market, each with outside headlines where there are any. */

const NAV = (): NavItem[] => [
  { id: "scope", label: tr("What we track", "추적 범위") }, { id: "growth", label: tr("How Nykaa is growing", "Nykaa 성장") },
  { id: "results", label: tr("Nykaa's official figures", "Nykaa 공식 실적") }, { id: "findings", label: tr("What the shelf shows", "진열 데이터") },
  { id: "changed", label: tr("What changed", "달라진 점") }, { id: "method", label: tr("How this page works", "계산 방법") },
];
const catName = (c: string) => CATEGORY_LABEL[c] ?? c;
const PdfLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="whitespace-nowrap text-accent-strong underline decoration-line-2 underline-offset-2 hover:decoration-ink">{children} ↗</a>
);

function BriefPage() {
  const m = useMarket(); const cb = useCategoryBrands(); const home = useHomepage();
  const ctx = useMoveContext();
  const runs = useMemo(() => runsFrom(home.data ?? []), [home.data]);
  const tiers = useTiers(useMemo(() => [...new Set(m.shelf.map((r) => r.brand))], [m.shelf]));
  const moves = useMemo(() => (ctx ? listingMoves(ctx, null) : []), [ctx]);
  const scope = useScope();
  const [open, setOpen] = useState<string | null>(null);
  const latestBrandDay = useMemo(() => (cb.data ?? []).reduce((a, b) => (b.last_seen > a ? b.last_seen : a), ""), [cb.data]);

  if (!m.ready || !m.win || !ctx) return <Shell active="Overview"><PageHead eyebrow={tr("Brief", "브리핑")} title={tr("What you need to know", "알아야 할 것")} sub="" /><Loading what={tr("the brief", "브리핑")} /></Shell>;
  const win = m.win; const span = m.flowSpan!;
  const quarters = NYKAA_QUARTERS(); const years = NYKAA_YEARS();
  const lastQ = [...quarters].reverse().find((q) => q.value !== null)!;
  const fy0 = years[0]; const fyN = years[years.length - 1];
  const threeYear = cagr(fy0.gmv, fyN.gmv, years.length - 1);
  const last4 = quarters.filter((q) => q.gmv !== null).slice(-4);
  const ttm = last4.reduce((a, q) => a + (q.gmv ?? 0), 0);
  /* ---------------- our own growth, the standard rule (owner 19 Oct 2026: show what our crawled data says next to
     Nykaa's figure): written reviews on every tracked product, same products only, a quarter against the same
     quarter a year earlier. Shown for the two latest complete quarters; further back, the products we track (picked
     from today's lists) stand for the market less and less, so the comparison isn't shown. */
  const monthAdd = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)).toISOString().slice(0, 10); };
  const thisMonth = m.latest ? `${m.latest.slice(0, 7)}-01` : "9999";
  const complete = quarters.filter((q) => monthAdd(q.start, 3) <= thisMonth).slice(-2);

  /* ---------------- buying, per category and per day (lists started on different days) */
  const flow = m.flow.filter((r) => r.value > 0);
  const cats = CATEGORIES.filter((c) => flow.some((r) => r.subcategory === c));
  const days = new Map(cats.map((c) => [c, perDay(m.ix, c, span.start, span.end)]));
  const daily = (f: (r: (typeof flow)[number]) => boolean) => flow.filter(f).reduce((a, r) => a + r.value / Math.max(1, days.get(r.subcategory) ?? 1), 0);
  const allDaily = daily(() => true) || 1;
  const skinDaily = daily((r) => !MAKEUP.has(r.subcategory)) || 1;
  const isHon = (b: string) => HON_BRANDS.some((x) => norm(x) === norm(b)); const isDerma = (b: string) => DERMA_BRANDS.some((x) => norm(x) === norm(b));
  const hon = daily((r) => isHon(r.brand)) / allDaily;
  const derma = daily((r) => !MAKEUP.has(r.subcategory) && isDerma(r.brand)) / skinDaily;
  const brandsIn = (cat: string) => {
    const by = new Map<string, { b: string; v: number; o: string }>(); let tot = 0;
    for (const r of flow) if (r.subcategory === cat) { const k = norm(r.brand); const e = by.get(k) ?? { b: r.brand, v: 0, o: r.origin }; e.v += r.value; by.set(k, e); tot += r.value; }
    return { ranked: [...by.values()].sort((a, b) => b.v - a.v), tot: tot || 1 };
  };
  const brandRank = (cat: string, b: string) => {
    const { ranked, tot } = brandsIn(cat); const i = ranked.findIndex((x) => norm(x.b) === norm(b));
    return i < 0 ? null : { place: i + 1, share: ranked[i].v / tot, leader: ranked[0].b };
  };
  const korLead = cats.filter((c) => brandsIn(c).ranked[0]?.o === "kbeauty");
  const korTop3 = cats.filter((c) => !korLead.includes(c) && brandsIn(c).ranked.slice(0, 3).some((x) => x.o === "kbeauty"));
  const latestBrands = (cb.data ?? []).filter((b) => b.last_seen === latestBrandDay);
  const listBrands = latestBrands.filter((b) => b.subcategory !== "kbeauty_store" && CATEGORIES.includes(b.subcategory));
  const allBrands = new Set(listBrands.map((b) => norm(b.brand))).size;
  const storeBrands = new Set(latestBrands.filter((b) => b.subcategory === "kbeauty_store").map((b) => norm(b.brand))).size;
  const koreanInLists = new Set(listBrands.filter((b) => b.origin === "kbeauty").map((b) => norm(b.brand))).size;
  const listCount = CATEGORIES.filter((c) => m.ix.catStart.has(c)).length;

  /* ---------------- our growth, weighted by origin (owner 19 Oct 2026: "how is Nykaa growing on our figures", big,
     before Nykaa's own). The products we follow month by month are the main brands and their rivals, about two in
     three Korean, so their plain total would mostly be K-beauty's growth. Each origin's growth (same products, a
     quarter against the same quarter a year earlier) is weighted by that origin's share of daily buying in today's
     top 100s; unclassified brands carry no weight. */
  const ORIGINS: Origin[] = ["kbeauty", "local", "global"];
  const weight = new Map(ORIGINS.map((o) => [o, daily((r) => r.origin === o)] as const));
  const wTot = ORIGINS.reduce((a, o) => a + (weight.get(o) ?? 0), 0) || 1;
  const ours = new Map(complete.map((q) => {
    const rec = [0, 1, 2].map((i) => monthAdd(q.start, i)); const base = rec.map((x) => monthAdd(x, -12));
    const all = sameProductGrowth(m.pool, rec, base);
    const byOrigin = ORIGINS.map((o) => ({ o, w: (weight.get(o) ?? 0) / wTot, g: sameProductGrowth(m.pool.filter((p) => m.originOf(p.brand) === o), rec, base) }));
    const used = byOrigin.filter((x) => x.g.change !== null && x.g.products >= 10);
    const uw = used.reduce((a, x) => a + x.w, 0);
    const estimate = uw > 0 ? used.reduce((a, x) => a + x.w * x.g.change!, 0) / uw : null;
    return [q.fy, { q, all, byOrigin, estimate }] as const;
  }));
  const growthRows = complete.map((q) => ours.get(q.fy)!);
  const lastG = growthRows[growthRows.length - 1] ?? null;
  const nykaaSays = (q: (typeof quarters)[number]) => (q.value !== null ? signed(q.value) : tr("\"late twenties\"", "\"20% 후반\""));

  /* ---------------- what our data shows, each backed by Nykaa's own documents (owner 18 Oct: "the important
     information people would be curious about, with supporting figures around it"; no verdicts on the page) */
  const kProducts = m.shelf.filter((r) => r.origin === "kbeauty").length / Math.max(1, m.shelf.length);
  const dkS = brandRank("sunscreen", "Dot & Key"); const dkM = brandRank("face_moisturizer", "Dot & Key"); const dkW = brandRank("face_wash", "Dot & Key");
  const kayF = brandRank("foundation", "Kay Beauty"); const nyL = brandRank("lipstick", "Nykaa Cosmetics");
  const ceW = brandRank("face_wash", "Cetaphil");
  const homeDay0 = (home.data ?? []).reduce((a, x) => (x.scrape_date > a ? x.scrape_date : a), "");
  const salesNow = runs.filter((r) => r.end === homeDay0 && r.kind === "sale").map((r) => r.label);
  const list = (cs: string[]) => cs.map((x) => catName(x).toLowerCase()).join(", ");
  type Finding = { key: string; topic: string; big: string; ours: React.ReactNode; nykaa: React.ReactNode; doc: string; url: string };
  const findings: Finding[] = [
    { key: "korean", topic: tr("Korean beauty", "K-뷰티"), big: tr(`${korLead.length} of ${cats.length}`, `${cats.length}개 중 ${korLead.length}개`),
      ours: tr(<>Korean brands lead {korLead.length} of the {cats.length} categories we track{korLead.length ? ` (${list(korLead)})` : ""}{korTop3.length ? `, and are in the top 3 of ${korTop3.length} more (${list(korTop3)})` : ""}. They hold {pct(kProducts, 0)} of the top-100 products; Nykaa&rsquo;s Korean Beauty store lists {storeBrands} brands.</>,
        <>K-뷰티 브랜드는 추적 {cats.length}개 카테고리 중 {korLead.length}곳에서 1위{korLead.length ? `(${korLead.map(catName).join(", ")})` : ""}{korTop3.length ? `, ${korTop3.length}곳에서 3위 안(${korTop3.map(catName).join(", ")})` : ""}. 상위 100위 제품의 {pct(kProducts, 0)}, Nykaa K-뷰티 스토어 브랜드 {storeBrands}개.</>),
      nykaa: tr(<>&ldquo;Korean brands grew <b>58%</b> on Nykaa in FY26&rdquo; (Apr 2025–Mar 2026), across 70+ Korean brands, with 27 Korean launches that year including Aestura, Arencia, Anua and Mise en Scène.</>,
        <>&ldquo;Nykaa의 K-뷰티 브랜드 FY26 <b>58%</b> 성장&rdquo;(2025년 4월–2026년 3월). 브랜드 70개 이상, 그해 Aestura·Arencia·Anua·Mise en Scène 등 27개 신규 입점.</>),
      doc: tr("Investor presentation Q4 FY26", "투자자 자료 FY26 4분기"), url: DOC.q4fy26 },
    { key: "dotkey", topic: "Dot & Key", big: dkS ? `#${dkS.place}` : "–",
      ours: tr(<>On Nykaa&rsquo;s shelf Dot &amp; Key is {dkS ? <><b>#{dkS.place} in sunscreen</b> ({pct(dkS.share, 0)} of all buying)</> : "not ranked in sunscreen"}{dkM ? `, #${dkM.place} in moisturiser` : ""}{dkW ? ` and #${dkW.place} in face wash` : ""}.</>,
        <>Nykaa 진열에서 Dot &amp; Key: {dkS ? <><b>선크림 {dkS.place}위</b>(전체 구매의 {pct(dkS.share, 0)})</> : "선크림 순위 없음"}{dkM ? `, 보습 ${dkM.place}위` : ""}{dkW ? `, 클렌저 ${dkW.place}위` : ""}.</>),
      nykaa: tr(<>&ldquo;Dot &amp; Key is <b>#1 in sunscreen</b>, #2 in moisturiser and #3 in face wash&rdquo; across Nykaa, Amazon, Flipkart and Blinkit (FY26).</>, <>&ldquo;Dot &amp; Key <b>선크림 1위</b>, 보습 2위, 클렌저 3위&rdquo; (Nykaa·Amazon·Flipkart·Blinkit 합산, FY26).</>),
      doc: tr("Investor presentation Q4 FY26", "투자자 자료 FY26 4분기"), url: DOC.q4fy26 },
    { key: "hon", topic: tr("Nykaa's own brands", "Nykaa 자체 브랜드"), big: pct(hon, 0),
      ours: tr(<>Nykaa&rsquo;s own brands take <b>{pct(hon, 0)}</b> of daily buying in the categories we track.{kayF?.place === 1 ? ` Kay Beauty leads foundation (${pct(kayF.share, 0)}).` : ""}{nyL?.place === 1 ? ` Nykaa Cosmetics leads lipstick (${pct(nyL.share, 0)}).` : ""}</>,
        <>Nykaa 자체 브랜드 = 추적 카테고리 일 구매의 <b>{pct(hon, 0)}</b>.{kayF?.place === 1 ? ` Kay Beauty 파운데이션 1위(${pct(kayF.share, 0)}).` : ""}{nyL?.place === 1 ? ` Nykaa Cosmetics 립스틱 1위(${pct(nyL.share, 0)}).` : ""}</>),
      nykaa: tr(<>House of Nykaa beauty: <b>₹2,788 cr</b> GMV in FY26, up 64%; Dot &amp; Key grew 13×+ and Kay Beauty 3×+ over FY23–26.</>, <>House of Nykaa 뷰티: FY26 GMV <b>₹2,788 cr (4,461억원)</b>, 64% 성장. FY23–26 Dot &amp; Key 13배 이상, Kay Beauty 3배 이상.</>),
      doc: tr("Investor presentation Q4 FY26", "투자자 자료 FY26 4분기"), url: DOC.q4fy26 },
    { key: "derma", topic: tr("Derma brands", "더마 브랜드"), big: ceW ? `#${ceW.place}` : pct(derma, 0),
      ours: tr(<>{ceW ? <>Cetaphil is <b>#{ceW.place} in face wash</b> ({pct(ceW.share, 0)} of all buying). </> : null}The global derma houses (Cetaphil, CeraVe, Bioderma, La Roche-Posay and others) take {pct(derma, 0)} of daily skincare buying in our categories.</>,
        <>{ceW ? <>Cetaphil: <b>클렌저 {ceW.place}위</b>(전체 구매의 {pct(ceW.share, 0)}). </> : null}글로벌 더마 브랜드(Cetaphil, CeraVe, Bioderma, La Roche-Posay 등) = 우리 카테고리 일 스킨케어 구매의 {pct(derma, 0)}.</>),
      nykaa: tr(<>&ldquo;Derma brands grew <b>40%</b> in FY26 and are 20% of skincare&rdquo; (Nykaa&rsquo;s own grouping, which also counts Indian derma brands).</>, <>&ldquo;더마 브랜드 FY26 <b>40%</b> 성장, 스킨케어의 20%&rdquo; (Nykaa 자체 분류, 인도 더마 브랜드 포함).</>),
      doc: tr("Investor presentation Q4 FY26", "투자자 자료 FY26 4분기"), url: DOC.q4fy26 },
    { key: "brands", topic: tr("Brands on Nykaa", "Nykaa 입점 브랜드"), big: allBrands.toLocaleString("en-IN"),
      ours: tr(<><b>{allBrands}</b> brands sell in the {listCount} categories we track (Nykaa&rsquo;s own brand filter for each), {koreanInLists} of them Korean.</>, <>추적 {listCount}개 카테고리에서 <b>{allBrands}</b>개 브랜드 판매(카테고리별 Nykaa 브랜드 필터), 그중 K-뷰티 브랜드 {koreanInLists}개.</>),
      nykaa: tr(<>Nykaa sells <b>6,000+ brands</b>, and launched 1,280 new brands in FY26.</>, <>Nykaa 입점 브랜드 <b>6,000개 이상</b>, FY26 신규 브랜드 1,280개.</>),
      doc: tr("Investor presentation Q4 FY26", "투자자 자료 FY26 4분기"), url: DOC.q4fy26 },
    { key: "sales", topic: tr("Sales", "세일"), big: "",
      ours: tr(<>{homeDay0 ? <>Nykaa&rsquo;s homepage on {dayMonth(homeDay0)}: {salesNow.length ? <b>{salesNow.slice(0, 3).join(", ")}</b> : "no sale running"}.</> : "Homepage read nightly from 17 Oct."} The sale calendar is on Offers &amp; events.</>,
        <>{homeDay0 ? <>{dayMonth(homeDay0)} Nykaa 홈페이지: {salesNow.length ? <b>{salesNow.slice(0, 3).join(", ")}</b> : "진행 중인 세일 없음"}.</> : "홈페이지는 10월 17일부터 매일 수집."} 세일 일정은 Offers &amp; events 탭에서.</>),
      nykaa: tr(<>The Pink Summer Sale (May 2026) and the Birthday Sale drove Apr–Jun 2026; Pink Summer Sale GMV was about <b>40%</b> higher than a year earlier.</>, <>핑크 서머 세일(2026년 5월)·생일 세일이 2026년 4–6월 실적 견인. 핑크 서머 세일 GMV 약 <b>40%</b> 증가 (전년 대비).</>),
      doc: tr("Investor presentation Q1 FY27", "투자자 자료 FY27 1분기"), url: DOC.q1fy27 },
  ];

  /* ---------------- what changed: Innisfree, then Korean brands, then the market */
  const c0 = catsOn(m.ix, win.start); const c1 = catsOn(m.ix, win.end); const both = new Set([...c1].filter((c) => c0.has(c)));
  const p0 = placesOn(m.ix, m.dims, win.start, both); const p1 = placesOn(m.ix, m.dims, win.end, both);
  const placeMove = (b: string) => { const k1 = [...p1.keys()].find((x) => norm(x) === norm(b)); const k0 = [...p0.keys()].find((x) => norm(x) === norm(b)); return (k1 ? p1.get(k1)! : 0) - (k0 ? p0.get(k0)! : 0); };
  const nowIn = (b: string) => m.shelf.filter((r) => norm(r.brand) === norm(b)).length;
  const score = (x: ListingMove) => Math.abs(x.gain) / Math.sqrt(Math.max(1, Math.min(x.from ?? 100, x.to ?? 100)));
  const singles = moves.filter((x) => !isCombo(x.name) && x.from !== null && x.to !== null && !x.entered && !x.left);
  const anchor = tiers.pinned ?? "Innisfree";
  const seller = (b: string) => m.flow.filter((r) => norm(r.brand) === norm(b) && r.value > 0).sort((a, c) => c.value - a.value)[0] ?? null;
  const why = (x: ListingMove) => (x.why[0] ? tr(`, around the time ${x.why[0].text}`, `, 같은 시기: ${x.why[0].text}`) : tr("; nothing we track changed at the same time", "; 같은 시기 추적 항목 변화 없음"));
  const moveLine = (x: ListingMove) => tr(<><b>{x.brand}</b> {shortName(x.name, x.brand)} {x.gain > 0 ? "climbed" : "fell"} from #{x.from} to #{x.to} among {catName(x.subcategory).toLowerCase()}{why(x)}.</>,
    <><b>{x.brand}</b> {shortName(x.name, x.brand)}, {catName(x.subcategory)} #{x.from} → #{x.to} {x.gain > 0 ? "상승" : "하락"}{why(x)}.</>);

  // a headline sits next to a move only when it is about India and dated from two weeks before the period to its end
  const newsWindow = { from: new Date(+new Date(win.start) - 14 * 864e5).toISOString().slice(0, 10), to: win.end };
  type Item = { key: string; text: React.ReactNode; detail: React.ReactNode; news?: string; go?: { href: string; label: string } };
  const groups: { title: string; items: Item[] }[] = [];
  // 1. Innisfree
  const aSeller = seller(anchor); const aShare = aSeller ? brandRank(aSeller.subcategory, anchor) : null;
  const aMove = singles.filter((x) => norm(x.brand) === norm(anchor) && Math.abs(x.gain) >= 5).sort((a, b) => score(b) - score(a))[0];
  const aItems: Item[] = [{ key: "a1", text: tr(<><b>{anchor}</b> has {nowIn(anchor)} products in the top 100 today ({placeMove(anchor) === 0 ? "as many as" : `${Math.abs(placeMove(anchor))} ${placeMove(anchor) > 0 ? "more than" : "fewer than"}`} on {dayMonth(win.start)}).{aSeller && aShare ? <> Its best seller, {shortName(aSeller.name, anchor)}, gives it <b>{pct(aShare.share, 1)}</b> of all {catName(aSeller.subcategory).toLowerCase()} buying (#{aShare.place}).</> : null}</>,
    <><b>{anchor}</b> 오늘 상위 100위 제품 {nowIn(anchor)}개 ({dayMonth(win.start)} 대비 {placeMove(anchor) === 0 ? "변화 없음" : `${placeMove(anchor) > 0 ? "+" : ""}${placeMove(anchor)}`}).{aSeller && aShare ? <> 베스트셀러 {shortName(aSeller.name, anchor)}로 {catName(aSeller.subcategory)} 구매 전체의 <b>{pct(aShare.share, 1)}</b>({aShare.place}위).</> : null}</>),
    detail: <BrandQuick brand={anchor} />, news: anchor, go: { href: "/analysis/", label: tr("K-beauty tab", "K-뷰티 탭") } }];
  if (aMove) aItems.push({ key: "a2", text: moveLine(aMove), detail: <ProductQuick pid={aMove.product_id} cat={aMove.subcategory} /> });
  groups.push({ title: anchor, items: aItems });
  // 2. Korean brands
  const korean = [...new Set(m.shelf.filter((r) => r.origin === "kbeauty").map((r) => r.brand))].filter((b) => norm(b) !== norm(anchor));
  const kMoves = korean.map((b) => ({ b, d: placeMove(b) })).sort((a, b) => b.d - a.d);
  const kUp = kMoves[0]?.d > 0 ? kMoves[0] : null; const kDown = kMoves[kMoves.length - 1]?.d < 0 ? kMoves[kMoves.length - 1] : null;
  const kClimb = singles.filter((x) => m.originOf(x.brand) === "kbeauty" && norm(x.brand) !== norm(anchor) && x.gain >= 5).sort((a, b) => score(b) - score(a))[0];
  const kItems: Item[] = [];
  if (kUp || kDown) kItems.push({ key: "k1", text: tr(<>{kUp ? <><b>{kUp.b}</b> gained the most products in the top 100 among Korean brands (+{kUp.d}, now {nowIn(kUp.b)})</> : null}{kUp && kDown ? "; " : ""}{kDown ? <><b>{kDown.b}</b> lost the most ({kDown.d}, now {nowIn(kDown.b)})</> : null}.</>,
    <>{kUp ? <>K-뷰티 브랜드 중 <b>{kUp.b}</b>: 상위 100위 제품 최다 증가(+{kUp.d}, 현재 {nowIn(kUp.b)})</> : null}{kUp && kDown ? "; " : ""}{kDown ? <><b>{kDown.b}</b> 최다 감소({kDown.d}, 현재 {nowIn(kDown.b)})</> : null}.</>), detail: <BrandQuick brand={(kUp ?? kDown)!.b} />, news: (kUp ?? kDown)!.b });
  if (kClimb) kItems.push({ key: "k2", text: moveLine(kClimb), detail: <ProductQuick pid={kClimb.product_id} cat={kClimb.subcategory} />, news: kClimb.brand });
  if (kItems.length) groups.push({ title: tr("Korean brands", "K-뷰티 브랜드"), items: kItems });
  // 3. the market
  const climber = singles.filter((x) => x.gain >= 5).sort((a, b) => score(b) - score(a))[0];
  const faller = singles.filter((x) => x.gain <= -5).sort((a, b) => score(b) - score(a))[0];
  const homeDay = (home.data ?? []).reduce((a, x) => (x.scrape_date > a ? x.scrape_date : a), "");
  const liveSales = runs.filter((r) => r.end === homeDay && (r.kind === "sale" || r.kind === "campaign"));
  const mItems: Item[] = [];
  if (climber) mItems.push({ key: "m1", text: <>{tr("Biggest climb: ", "최대 상승: ")}{moveLine(climber)}</>, detail: <ProductQuick pid={climber.product_id} cat={climber.subcategory} />, news: climber.brand });
  if (faller) mItems.push({ key: "m2", text: <>{tr("Biggest fall: ", "최대 하락: ")}{moveLine(faller)}</>, detail: <ProductQuick pid={faller.product_id} cat={faller.subcategory} />, news: faller.brand });
  if (homeDay) mItems.push({ key: "m3", text: tr(<>Nykaa&rsquo;s homepage on {dayMonth(homeDay)}: {liveSales.length ? <b>{liveSales.map((r) => r.label).slice(0, 3).join(", ")}</b> : "no sale banner"}.</>, <>{dayMonth(homeDay)} Nykaa 홈페이지: {liveSales.length ? <b>{liveSales.map((r) => r.label).slice(0, 3).join(", ")}</b> : "세일 배너 없음"}.</>),
    detail: null, go: { href: "/offers/", label: tr("Offers & events", "프로모션·이벤트") } });
  if (mItems.length) groups.push({ title: tr("The whole market", "시장 전체"), items: mItems });

  const growthBar = (v: number | null) => v !== null && <span className="ml-2 inline-block h-1.5 rounded-full bg-[#c29a5b] align-middle" style={{ width: `${(v / 0.3) * 56}px` }} />;

  return (
    <Shell active="Overview" asOf={m.latest ?? undefined}>
      <PageHead eyebrow={tr("Brief · start here", "브리핑 · 여기서 시작")} title={tr("What you need to know", "알아야 할 것")}
        sub={tr("What we track, how Nykaa beauty is growing on our figures and on Nykaa's, what the shelf shows backed by Nykaa's own statements, then what changed: Innisfree first, then K-beauty brands, then the whole market.", "추적 범위, 우리 데이터와 Nykaa 발표로 본 Nykaa 뷰티 성장, 진열 데이터와 이를 뒷받침하는 Nykaa 발표, 그리고 달라진 점(Innisfree → K-뷰티 브랜드 → 시장 전체).")} />
      <SectionNav items={NAV()} />

      <ActionSection id="scope" kicker={tr("What we track", "추적 범위")}
        title={scope ? tr(`Inside ${scope.lists} Nykaa categories: ${scope.selling.brands.toLocaleString("en-IN")} brands sell, ${scope.top100.brands} reach a top 100 today, ${scope.followed.brands} are followed month by month`, `Nykaa 카테고리 ${scope.lists}개 안: 판매 브랜드 ${scope.selling.brands.toLocaleString("en-IN")}개, 오늘 상위 100위 안 ${scope.top100.brands}개, 월별 추적 ${scope.followed.brands}개`) : tr("What we track", "추적 범위")}
        note={tr(<>We count two things, brands and products, in three groups. Every number on every tab comes from one of these depths, and each tab says which at the top. Read nightly since 13 Sep 2026{scope?.day ? `; latest ${dayMonth(scope.day)}` : ""}.</>,
          <>브랜드와 제품 두 가지를 세 그룹으로 집계. 모든 탭의 숫자는 이 중 한 단계에서 나오고, 각 탭 상단에 어느 단계인지 표시. 2026년 9월 13일부터 매일 밤 수집{scope?.day ? `, 최근 ${dayMonth(scope.day)}` : ""}.</>)}>
        <ScopePanel />
      </ActionSection>

      {lastG && <ActionSection id="growth" kicker={tr("How Nykaa beauty is growing", "Nykaa 뷰티 성장")}
        title={tr(`On our figures, Nykaa beauty grew about ${signed(lastG.estimate)} in ${lastG.q.label} against a year earlier; Nykaa reports ${nykaaSays(lastG.q)}`, `우리 데이터 기준 Nykaa 뷰티 ${lastG.q.label} 전년 대비 약 ${signed(lastG.estimate)} 성장; Nykaa 발표 ${nykaaSays(lastG.q)}`)}
        note={tr(<>Our estimate first, then Nykaa&rsquo;s own figure for the same quarter. Growth here follows the one rule used on every page: written reviews, same products, a quarter against the same quarter a year earlier.</>, <>우리 추정치 먼저, 그다음 같은 분기 Nykaa 공식 수치. 성장률은 모든 페이지와 같은 기준: 작성 리뷰, 동일 제품, 전년 같은 분기 대비.</>)}>
        <div className="grid gap-4 lg:grid-cols-2">
          {[...growthRows].reverse().map((g) => {
            const scale = (v: number | null) => `${Math.max(2, Math.min(100, ((v ?? 0) / 0.6) * 100))}%`;
            return (
              <Card key={g.q.fy} className="px-5 py-5">
                <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">{g.q.label} <span className="font-normal normal-case tracking-normal">{tr("vs the same months a year earlier", "전년 같은 달 대비")}</span></div>
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[12.5px] font-semibold text-accent-strong">{tr("Our estimate", "우리 추정")}</div>
                    <div className="font-display text-[46px] font-semibold leading-none tracking-tight tabular">{signed(g.estimate)}</div>
                    <div className="mt-1 text-[12px] text-ink-2">{tr(`${g.all.products} of the ${scope?.followed.products ?? "–"} products we follow, those that sold a year earlier`, `월별 추적 제품 ${scope?.followed.products ?? "–"}개 중 1년 전에도 팔린 ${g.all.products}개`)}</div>
                  </div>
                  <div>
                    <div className="text-[12.5px] font-semibold text-ink-2">{tr("Nykaa reports", "Nykaa 발표")}</div>
                    <div className="font-display text-[46px] font-semibold leading-none tracking-tight tabular text-ink-2">{g.q.value !== null ? signed(g.q.value) : <span className="text-[26px]">{tr("late 20s", "20% 후반")}</span>}</div>
                    <div className="mt-1 text-[12px] text-ink-2">{tr("Beauty GMV", "뷰티 GMV")}{g.q.value === null ? tr(" (provisional)", " (잠정)") : ""} · <PdfLink href={g.q.url}>{g.q.fy}</PdfLink></div>
                  </div>
                </div>
                <div className="mt-4 border-t border-line pt-3">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{tr("By brand origin, our figures", "브랜드 출신별, 우리 데이터")}</div>
                  <div className="grid gap-1.5">
                    {g.byOrigin.map((x) => (
                      <div key={x.o} className="grid grid-cols-[92px_1fr_64px] items-center gap-3 text-[12.5px]">
                        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: ORIGIN_COLOR[x.o].fill }} />{ORIGIN_LABEL[x.o]}</span>
                        <span className="h-2 rounded-full bg-sunken"><span className="block h-2 rounded-full" style={{ width: scale(x.g.change), background: ORIGIN_COLOR[x.o].fill }} /></span>
                        <b className="text-right tabular">{x.g.change !== null ? signed(x.g.change) : "–"}</b>
                        <span className="col-start-2 col-end-4 -mt-1 text-[11px] text-muted">{tr(`${x.g.products} products · weight ${pct(x.w, 0)} (its share of buying)`, `제품 ${x.g.products}개 · 가중치 ${pct(x.w, 0)} (구매 점유율)`)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
        <div className="mt-4 rounded-[16px] bg-sunken px-5 py-4">
          <div className="text-[13px] font-semibold">{tr("Why we calculate it this way", "이렇게 계산하는 이유")}</div>
          <ol className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(tr([
              ["Nykaa doesn't publish sales", "by product or brand. Written reviews are the closest public record of purchases, and Nykaa dates each one, so we can look back a year even though we started collecting on 13 Sep."],
              ["Same products only", `a quarter against the same quarter a year earlier, counting only products that already had reviews then. ${lastG.all.launches} products launched since are left out: we pick products from today's lists, so launches would add growth the market didn't have.`],
              ["Weighted by origin", `the ${scope?.followed.products ?? "–"} products we follow lean K-beauty (we started from Innisfree's rivals; every category's top 30 is being added from 19 Oct), so each origin's growth counts by its share of buying on Nykaa's shelf, not by how many products we follow.`],
              ["Checked against Nykaa", "Nykaa's reported beauty growth for the same quarter sits beside ours. Ours stays a stand-in: reviews per purchase can drift, and we follow some brands more closely than others."],
            ], [
              ["Nykaa는 판매량 비공개", "(제품·브랜드별). 작성 리뷰가 구매에 가장 가까운 공개 기록이고 Nykaa가 작성일을 남겨, 9월 13일에 수집을 시작했어도 1년 전까지 확인 가능."],
              ["동일 제품만", `분기를 전년 같은 분기와 비교, 그때도 리뷰가 있던 제품만. 이후 출시 제품 ${lastG.all.launches}개는 제외: 오늘 목록에서 제품을 뽑기 때문에 신제품을 넣으면 시장에 없던 성장이 잡힘.`],
              ["출신별 가중", `월별 추적 제품 ${scope?.followed.products ?? "–"}개는 K-뷰티 비중이 큼(Innisfree 경쟁 제품에서 출발, 10월 19일부터 카테고리별 상위 30위 추가 중) → 출신별 성장률을 추적 제품 수가 아니라 Nykaa 진열의 구매 점유율로 가중.`],
              ["Nykaa 수치와 대조", "같은 분기 Nykaa 뷰티 성장률을 나란히 표시. 우리 수치는 대용치: 구매당 리뷰 비율이 변할 수 있고, 브랜드마다 추적 깊이가 다름."],
            ]) as string[][]).map(([h, d], i) => (
              <li key={h} className="flex gap-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-[12px] font-semibold text-on-brand">{i + 1}</span><span className="text-[12.5px] leading-snug text-ink-2"><b className="block text-[13px] text-ink">{h}</b>{d}</span></li>
            ))}
          </ol>
          <div className="mt-3 border-t border-line pt-3 text-[12.5px] leading-relaxed text-ink-2">
            <b className="text-ink">{tr("Nykaa on K-beauty: ", "Nykaa의 K-뷰티 발표: ")}</b>{tr(<>&ldquo;Korean brands grew 58% on Nykaa in FY26&rdquo; (Apr 2025–Mar 2026). </>, <>&ldquo;Nykaa의 K-뷰티 브랜드 FY26 58% 성장&rdquo;(2025년 4월–2026년 3월). </>)}<PdfLink href={DOC.q4fy26}>{tr("Investor presentation Q4 FY26", "투자자 자료 FY26 4분기")}</PdfLink>
          </div>
        </div>
      </ActionSection>}

      <ActionSection id="results" kicker={tr("Nykaa's official figures", "Nykaa 공식 실적")} title={tr(`Beauty GMV ₹${fyN.gmv.toLocaleString("en-IN")} cr (${eok(fyN.gmv)}) in FY26, growing ${pct(threeYear, 0)} a year since FY23; ${signed(lastQ.value)} in ${lastQ.label}`, `FY26 뷰티 GMV ₹${fyN.gmv.toLocaleString("en-IN")} cr (${eok(fyN.gmv)}), FY23 이후 연 ${pct(threeYear, 0)} 성장; ${lastQ.label} ${signed(lastQ.value)}`)}
        note={<>{tr("From FSN E-Commerce Ventures' investor documents; each row links to its PDF. ", "FSN E-Commerce Ventures 투자자 자료 기준, 행마다 원본 PDF 링크. ")}<PdfLink href={IR_PAGE}>{tr("All documents", "전체 자료")}</PdfLink>{tr(` Won at the planning rate ₹1 = ₩${KRW_PER_INR} (market rate on ${dayMonth(ECB_KRW_PER_INR.date)}: ₩${ECB_KRW_PER_INR.rate}, ECB).`, ` 원화는 기획 환율 ₹1 = ₩${KRW_PER_INR} 적용 (${dayMonth(ECB_KRW_PER_INR.date)} 시장 환율 ₩${ECB_KRW_PER_INR.rate}, ECB).`)}</>}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-[13px]">
              <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Year (Apr–Mar)", "연도 (4월–3월)")}</th><th className="px-2 text-right">{tr("Beauty GMV", "뷰티 GMV")}</th><th className="px-2 text-right">{tr("In won", "원화")}</th><th className="px-2">{tr("Growth", "성장률")}</th><th className="px-2 pr-4" /></tr></thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.fy} className="border-b border-line/60">
                    <td className="px-4 py-2 font-medium">{y.fy} <span className="text-[11px] font-normal text-muted">{y.label}</span></td>
                    <td className="px-2 py-2 text-right tabular">₹{y.gmv.toLocaleString("en-IN")} cr</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular text-ink-2">{eok(y.gmv)}</td>
                    <td className="whitespace-nowrap px-2 py-2 font-semibold tabular">{y.value !== null ? signed(y.value) : "–"}{growthBar(y.value)}</td>
                    <td className="px-2 py-2 pr-4 text-right text-[12px]"><PdfLink href={quarters.find((q) => q.fy === "Q4 FY26")!.url}>PDF</PdfLink></td>
                  </tr>))}
                <tr className="border-b border-line/60 bg-sunken/50"><td className="px-4 py-2 font-semibold">{tr("3-year growth rate", "3년 연평균 성장률")}</td><td colSpan={3} className="px-2 py-2 text-right font-semibold tabular">{tr(`${pct(threeYear, 1)} a year (FY23 → FY26, ×${(fyN.gmv / fy0.gmv).toFixed(1)})`, `연 ${pct(threeYear, 1)} (FY23 → FY26, ${(fyN.gmv / fy0.gmv).toFixed(1)}배)`)}</td><td className="px-2 pr-4 text-right text-[11px] text-muted">{tr("calculated", "계산")}</td></tr>
                <tr><td className="px-4 py-2 font-semibold">{tr("Latest 12 months", "최근 12개월")} <span className="text-[11px] font-normal text-muted">{last4[0]?.label} – {last4[last4.length - 1]?.label}</span></td><td className="px-2 py-2 text-right font-semibold tabular">₹{ttm.toLocaleString("en-IN")} cr</td><td className="whitespace-nowrap px-2 py-2 text-right tabular text-ink-2">{eok(ttm)}</td><td className="px-2 py-2 text-muted">–</td><td className="px-2 pr-4 text-right text-[11px] text-muted">{tr("4 quarters", "4개 분기 합")}</td></tr>
              </tbody>
            </table>
          </Card>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-[13px]">
              <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Quarter", "분기")}</th><th className="px-2 text-right">{tr("Beauty GMV", "뷰티 GMV")}</th><th className="px-2 text-right">{tr("In won", "원화")}</th><th className="px-2">{tr("Nykaa vs a year earlier", "Nykaa 전년 대비")}</th><th className="px-2 text-right">{tr("Our estimate", "우리 추정")}</th><th className="px-2 pr-4" /></tr></thead>
              <tbody>{quarters.map((q) => (
                <Fragment key={q.fy}>
                  <tr className={`${q.note ? "" : "border-b border-line/60"}`}>
                    <td className="px-4 py-2 font-medium">{q.label} <span className="text-[11px] font-normal text-muted">{q.fy}</span></td>
                    <td className="px-2 py-2 text-right tabular">{q.gmv ? `₹${q.gmv.toLocaleString("en-IN")} cr` : "–"}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular text-ink-2">{q.gmv ? eok(q.gmv) : "–"}</td>
                    <td className="whitespace-nowrap px-2 py-2 font-semibold tabular">{q.value !== null ? signed(q.value) : <span className="font-normal text-muted">{tr("provisional", "잠정")}</span>}{growthBar(q.value)}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular text-ink-2">{ours.get(q.fy)?.estimate != null ? <a href="#growth" className="underline decoration-line-2 underline-offset-2">{signed(ours.get(q.fy)!.estimate)}</a> : "–"}</td>
                    <td className="px-2 py-2 pr-4 text-right text-[12px]"><PdfLink href={q.url}>PDF</PdfLink></td>
                  </tr>
                  {q.note && <tr><td colSpan={6} className="px-4 pb-2.5 text-[12px] text-ink-2">{q.note}</td></tr>}
                </Fragment>))}</tbody>
            </table>
          </Card>
        </div>
      </ActionSection>

      <ActionSection id="findings" kicker={tr("What the shelf shows, and what Nykaa says", "진열 데이터와 Nykaa의 발표")} title={tr(`Korean brands lead ${korLead.length} of ${cats.length} categories on Nykaa; Nykaa reports Korean brands grew 58% last year`, `K-뷰티 브랜드는 Nykaa ${cats.length}개 카테고리 중 ${korLead.length}곳에서 1위; Nykaa 발표 K-뷰티 브랜드 지난해 58% 성장`)}
        note={tr(<>Each card: what our data shows on Nykaa&rsquo;s shelf (<Def k="ratingFlow">share of buying</Def>, {dayMonth(span.start)}–{dayMonth(span.end)}), and what Nykaa itself reports in its investor documents, with the link.</>,
          <>각 카드: Nykaa 진열에서 우리 데이터가 보여주는 것(<Def k="ratingFlow">구매 점유율</Def>, {dayMonth(span.start)}–{dayMonth(span.end)}) + 이를 뒷받침하는 Nykaa 투자자 자료(링크 포함).</>)}>
        <div className="grid gap-3 md:grid-cols-2">
          {findings.map((f) => (
            <Card key={f.key} className="flex flex-col px-5 py-4">
              <div className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-accent-strong">{f.topic}</div>
              <div className="mt-1 flex items-start gap-4">
                {f.big && <div className="shrink-0 font-display text-[30px] font-semibold leading-none tabular">{f.big}</div>}
                <p className="text-[13.5px] leading-relaxed text-ink">{f.ours}</p>
              </div>
              <div className="mt-3 rounded-xl bg-sunken px-4 py-3 text-[13px] leading-relaxed text-ink-2">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{tr("Nykaa's documents", "Nykaa 공식 자료")}</div>
                {f.nykaa} <PdfLink href={f.url}>{f.doc}</PdfLink>
              </div>
            </Card>
          ))}
        </div>
      </ActionSection>

      <ActionSection id="changed" kicker={tr(`What changed · ${spanLabel(m.period.days)}`, `달라진 점 · ${spanLabel(m.period.days)}`)} title={tr(`${anchor} first, then Korean brands, then the whole market`, `${anchor} → K-뷰티 브랜드 → 시장 전체`)}
        note={tr(`Daily top 100s, ${dayMonth(win.start)}–${dayMonth(win.end)}. Products in the top 100 count only the ${both.size} categories tracked for the whole period. Moves use the middle of the first and last three days. Lines marked External are headlines about the brand in India from the same weeks, read nightly: context, not proof; none is shown when nothing related was found.`, `일별 상위 100위, ${dayMonth(win.start)}–${dayMonth(win.end)}. 상위 100위 제품 수는 기간 내내 추적한 ${both.size}개 카테고리 기준. 변화 = 처음·마지막 3일 중앙값. "외부" = 같은 시기 인도 관련 헤드라인. 참고일 뿐 증거 아님, 관련 소식이 없으면 표시 안 함.`)}>
        <div className="grid gap-5">
          {groups.map((g, gi) => (
            <div key={g.title}>
              <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted"><span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-[11px] text-on-brand">{gi + 1}</span>{g.title}</div>
              <ol className="grid gap-2">
                {g.items.map((s) => (
                  <li key={s.key} className="rounded-[16px] bg-surface px-5 py-3.5 shadow-card ring-1 ring-line">
                    <div className="flex items-start gap-4">
                      <span className="min-w-0 flex-1 text-[14.5px] leading-relaxed">{s.text}</span>
                      {s.detail && <DetailsButton open={open === s.key} onClick={() => setOpen(open === s.key ? null : s.key)} />}
                      {s.go && <Link href={s.go.href} className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] text-ink-2 ring-1 ring-line hover:bg-sunken">{s.go.label} →</Link>}
                    </div>
                    {s.news && <ExternalNewsList brand={s.news} max={1} compact window={newsWindow} />}
                    {open === s.key && s.detail}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </ActionSection>

      <MethodNotes parts={{
        sources: [
          tr(<>Nykaa&rsquo;s figures: FSN E-Commerce Ventures&rsquo; investor presentations, call transcripts and quarterly updates, linked on each row. Nothing from news is used for Nykaa&rsquo;s own figures.</>, <>Nykaa 수치: FSN E-Commerce Ventures 투자자 자료, 컨퍼런스콜 녹취록, 분기 업데이트(행마다 링크). Nykaa 자체 수치에 뉴스는 쓰지 않음.</>),
          tr(`Our data: Nykaa's top 100 in ${listCount} lists every night, Nykaa's brand filter for each list, Nykaa's homepage and brand offers (from 17 Oct).`, `우리 데이터: 매일 밤 Nykaa ${listCount}개 목록 상위 100위, 목록별 Nykaa 브랜드 필터, Nykaa 홈페이지와 브랜드 프로모션(10월 17일부터).`),
          tr("External headlines: Google News' search feed, read nightly for the main brands and the day's movers; a headline is shown only when it names the brand, is about India (India, an Indian city or Nykaa) and dates from two weeks before the period to its end.", "외부 헤드라인: Google News 검색 피드, 주요 브랜드와 당일 급변 브랜드를 매일 밤 수집. 브랜드 이름이 들어가고 인도 관련(인도·인도 도시·Nykaa)이며, 기간 2주 전부터 기간 끝까지의 헤드라인만 표시."),
        ],
        calc: [
          tr(`Won: ₹ crore × ${KRW_PER_INR} ÷ 10 = 억원 (planning rate ₹1 = ₩${KRW_PER_INR}). 3-year growth rate: (FY26 ÷ FY23)^(1/3) − 1. Latest 12 months: the last four reported quarters added.`, `원화: ₹ crore × ${KRW_PER_INR} ÷ 10 = 억원 (기획 환율 ₹1 = ₩${KRW_PER_INR}). 3년 연평균 성장률: (FY26 ÷ FY23)^(1/3) − 1. 최근 12개월: 최근 발표 4개 분기 합.`),
          tr("Our growth (the same rule on product, brand and Nykaa level): written reviews in a quarter against the same quarter a year earlier, only products that already had reviews a year earlier. Products launched since are left out, because the products we track are picked from today's lists. Nykaa-level estimate: K-beauty, Indian and global growth, each weighted by that origin's share of daily buying in today's top 100s (unclassified brands carry no weight; an origin with fewer than 10 products is left out).", "우리 성장률 (제품·브랜드·Nykaa 전체 동일 기준): 분기 작성 리뷰를 전년 같은 분기와 비교, 1년 전에도 리뷰가 있던 제품만. 이후 출시 제품은 제외 (추적 제품이 오늘 목록에서 뽑혔기 때문). Nykaa 전체 추정: K-뷰티·인도·글로벌 성장률을 오늘 상위 100위의 출신별 일 구매 점유율로 가중 (미분류 브랜드는 가중치 없음, 제품 10개 미만 출신은 제외)."),
          ...BUYING_METHOD().calc,
          tr("Across categories (e.g. Nykaa's own brands' share): each category's buying is divided by its number of rating days, then added.", "카테고리 합계(예: Nykaa 자체 브랜드 비중): 카테고리별 구매를 평가 일수로 나눈 뒤 합산."),
        ],
        assume: [...BUYING_METHOD().assume, tr("Nykaa's claims are taken as stated; where Nykaa doesn't define a group (derma brands), we use our own list and say so.", "Nykaa 발표는 그대로 인용. Nykaa가 정의하지 않은 그룹(더마 브랜드)은 자체 목록을 쓰고 그렇게 명시.")],
        limits: [...BUYING_METHOD().limits, tr(`Our ${listCount} lists are about 1 in 8 of Nykaa's brands, so Nykaa-wide shares (derma, Nykaa's own brands) can differ from ours for that reason alone.`, `우리 ${listCount}개 목록은 Nykaa 브랜드의 약 8분의 1 → Nykaa 전체 비중(더마, 자체 브랜드)과는 이 이유만으로도 다를 수 있음.`)],
      }} />
    </Shell>
  );
}

export default function Page() { return <AuthGate><BriefPage /></AuthGate>; }
