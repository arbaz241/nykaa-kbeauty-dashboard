"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import PeriodBar from "@/components/PeriodBar";
import { Card, Loading, PageHead } from "@/components/ui";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import { Def } from "@/components/Tiered";
import { BrandQuick, DetailsButton, ProductQuick, useMoveContext } from "@/components/Quick";
import ExternalNewsList from "@/components/External";
import MethodNotes, { BUYING_METHOD } from "@/components/MethodNotes";
import { norm } from "@/lib/brands";
import { useCategoryBrands, useEvents, useHomepage, useShelfDaily } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL, median, pct, shortName, signed } from "@/lib/format";
import { catsOn, isCombo, MAKEUP, perDay, placesOn, rankAgreement } from "@/lib/market";
import { listingMoves, runsFrom, type ListingMove } from "@/lib/profile";
import { cagr, DERMA_BRANDS, ECB_KRW_PER_INR, eok, HON_BRANDS, HON_ON_NYKAA, IR_CLAIMS, IR_PAGE, KRW_PER_INR, NYKAA_QUARTERS, NYKAA_YEARS, type ClaimCheck } from "@/lib/reference";
import { spanLabel } from "@/lib/period";
import { useTiers } from "@/lib/tiers";
import { useMarket } from "@/lib/useMarket";
import { dayMonth, tr } from "@/lib/i18n";

/** The Brief (plan v4, owner 18 Oct 2026: "this can be the tab that shows the accuracy and soundness of our data with
 *  the facts available from outside sources, primarily Nykaa"). Nykaa's own size by year and quarter, what Nykaa says
 *  held against what its shelf shows, how far to trust our data, then what changed: Innisfree first, then Korean
 *  brands, then the whole market, each with outside headlines where there are any. */

const NAV = (): NavItem[] => [
  { id: "results", label: tr("Nykaa's beauty business", "Nykaa 뷰티 실적") }, { id: "check", label: tr("Nykaa says vs our data", "Nykaa 발표 vs 우리 데이터") },
  { id: "sound", label: tr("How sound our data is", "데이터 신뢰도") }, { id: "changed", label: tr("What changed", "달라진 점") }, { id: "method", label: tr("How this page works", "계산 방법") },
];
const catName = (c: string) => CATEGORY_LABEL[c] ?? c;
type Verdict = "match" | "close" | "differs" | "context" | "pending";
const VERDICT = () => ({
  match: { t: tr("Matches", "일치"), c: "bg-[#eaf6ee] text-good" }, close: { t: tr("Consistent", "부합"), c: "bg-[#eaf6ee] text-good" },
  differs: { t: tr("Differs", "다름"), c: "bg-warn-soft text-warn" }, context: { t: tr("Different measures", "다른 지표"), c: "bg-sunken text-ink-2" },
  pending: { t: tr("Not yet measurable", "아직 측정 불가"), c: "bg-sunken text-muted" },
});
type Sure = "high" | "medium" | "low";
const SURE = () => ({ high: tr("High", "높음"), medium: tr("Medium", "보통"), low: tr("Low", "낮음") });
const PdfLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <a href={href} target="_blank" rel="noreferrer" className="whitespace-nowrap text-accent-strong underline decoration-line-2 underline-offset-2 hover:decoration-ink">{children} ↗</a>
);

function BriefPage() {
  const m = useMarket(); const cb = useCategoryBrands(); const home = useHomepage(); const events = useEvents(); const raw = useShelfDaily();
  const ctx = useMoveContext();
  const runs = useMemo(() => runsFrom(home.data ?? []), [home.data]);
  const tiers = useTiers(useMemo(() => [...new Set(m.shelf.map((r) => r.brand))], [m.shelf]));
  const moves = useMemo(() => (ctx ? listingMoves(ctx, null) : []), [ctx]);
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
  const unclassified = new Set(listBrands.filter((b) => b.origin === "unknown").map((b) => norm(b.brand))).size;
  const firstBrandDay = (cb.data ?? []).reduce((a, b) => (!a || b.first_seen < a ? b.first_seen : a), "");
  // a brand is new only when it appears after its list's own first day (lists added later would count every brand)
  const listStart = new Map<string, string>(); for (const b of cb.data ?? []) { const c = listStart.get(b.subcategory); if (!c || b.first_seen < c) listStart.set(b.subcategory, b.first_seen); }
  const newBrands = new Set((cb.data ?? []).filter((b) => CATEGORIES.includes(b.subcategory) && b.first_seen > (listStart.get(b.subcategory) ?? "")).map((b) => norm(b.brand))).size;
  const maySale = (events.data ?? []).find((e) => e.happened_on.startsWith("2026-05"));
  const kaySun = m.shelf.filter((r) => r.subcategory === "sunscreen" && norm(r.brand) === norm("Kay Beauty")).sort((a, b) => a.rank - b.rank)[0];
  const listCount = CATEGORIES.filter((c) => m.ix.catStart.has(c)).length;

  const checkOf = (c: ClaimCheck): { ours: React.ReactNode; v: Verdict; sure: Sure } => {
    const dk = (cat: string, want: number) => { const r = brandRank(cat, "Dot & Key"); return { ours: r ? tr(<>#{r.place} by share of buying: {pct(r.share, 1)} of all {catName(cat).toLowerCase()} buying{r.place > 1 ? <>; {r.leader} leads</> : null}</>, <>구매 점유율 {r.place}위: {catName(cat)} 구매 전체의 {pct(r.share, 1)}{r.place > 1 ? <>. 1위 {r.leader}</> : null}</>) : tr("Not in the top 100", "상위 100위 밖"), v: (r?.place === want ? "match" : "differs") as Verdict, sure: "high" as Sure }; };
    switch (c) {
      case "kbeauty": return { ours: tr(<>58% is growth over a year; our data shows size today. Korean brands lead {korLead.length} of {cats.length} categories ({korLead.map((x) => catName(x).toLowerCase()).join(", ") || "none"}) and are in the top 3 of {korTop3.length} more ({korTop3.map((x) => catName(x).toLowerCase()).join(", ") || "none"}). See K-beauty for each category.</>,
        <>58%는 1년 성장률이고, 우리 데이터는 현재 규모입니다. 한국 브랜드는 {cats.length}개 중 {korLead.length}개 카테고리 1위({korLead.map((x) => catName(x)).join(", ") || "없음"}), {korTop3.length}개에서 3위 안({korTop3.map((x) => catName(x)).join(", ") || "없음"}). 카테고리별 내용은 K-뷰티 탭에.</>), v: "context", sure: "medium" };
      case "korean_70": return { ours: tr(<>Nykaa&rsquo;s own Korean Beauty store lists <b>{storeBrands}</b> brands today; <b>{koreanInLists}</b> Korean brands sell in our {listCount} lists. Nykaa&rsquo;s 70+ likely counts brands outside the store and these lists.</>, <>Nykaa 한국 뷰티 스토어에 오늘 <b>{storeBrands}</b>개 브랜드, 우리 {listCount}개 목록에서 판매하는 한국 브랜드 <b>{koreanInLists}</b>개. Nykaa의 70개 이상은 스토어와 이 목록 밖의 브랜드도 포함한 것으로 보입니다.</>), v: "close", sure: "medium" };
      case "dotkey_sun": return dk("sunscreen", 1);
      case "dotkey_moist": return dk("face_moisturizer", 2);
      case "dotkey_wash": { const d = dk("face_wash", 3); return { ...d, ours: <>{d.ours}{tr(". Nykaa's rank also counts Amazon, Flipkart and Blinkit.", ". Nykaa 순위는 Amazon·Flipkart·Blinkit도 포함.")}</> }; }
      case "kay_sun": return kaySun ? { ours: tr(<>Kay Beauty has a product at #{kaySun.rank} among sunscreens today{brandRank("sunscreen", "Kay Beauty") ? <>, {pct(brandRank("sunscreen", "Kay Beauty")!.share, 1)} of sunscreen buying</> : null}.</>, <>케이 뷰티 제품이 오늘 선크림 {kaySun.rank}위{brandRank("sunscreen", "Kay Beauty") ? <>, 선크림 구매의 {pct(brandRank("sunscreen", "Kay Beauty")!.share, 1)}</> : null}.</>), v: kaySun.rank <= 50 ? "close" : "context", sure: "medium" }
        : { ours: tr("No Kay Beauty sunscreen in the sunscreen top 100 today.", "오늘 선크림 상위 100위에 케이 뷰티 제품 없음."), v: "differs", sure: "medium" };
      case "hon_growth": { const k = brandRank("foundation", "Kay Beauty"); const d = brandRank("sunscreen", "Dot & Key"); return { ours: tr(<>Kay Beauty is {k ? `#${k.place} in foundation (${pct(k.share, 0)} of buying)` : "not ranked in foundation"}; Dot &amp; Key {d ? `#${d.place} in sunscreen (${pct(d.share, 0)})` : "not ranked in sunscreen"}. Growth itself we can&rsquo;t measure; the positions fit it.</>, <>케이 뷰티 {k ? `파운데이션 ${k.place}위 (구매의 ${pct(k.share, 0)})` : "파운데이션 순위 없음"}; 닷앤키 {d ? `선크림 ${d.place}위 (${pct(d.share, 0)})` : "선크림 순위 없음"}. 성장률 자체는 측정할 수 없지만 위치는 부합합니다.</>), v: k?.place === 1 && d?.place === 1 ? "close" : "context", sure: "medium" }; }
      case "hon": return { ours: tr(<>Nykaa&rsquo;s own brands take <b>{pct(hon, 0)}</b> of daily buying in our lists. Nykaa&rsquo;s figures imply about {pct(2788 * HON_ON_NYKAA / 14954, 0)} of its beauty GMV (₹2,788 cr × {pct(HON_ON_NYKAA, 0)} sold on Nykaa ÷ ₹14,954 cr; our estimate). Our lists are categories where its brands are strong (Kay Beauty foundation, Nykaa Cosmetics lipstick, Dot &amp; Key sunscreen).</>,
        <>Nykaa 자체 브랜드는 우리 목록 일 구매의 <b>{pct(hon, 0)}</b>. Nykaa 수치로는 뷰티 GMV의 약 {pct(2788 * HON_ON_NYKAA / 14954, 0)}(₹2,788억 × Nykaa 판매 {pct(HON_ON_NYKAA, 0)} ÷ ₹14,954억; 우리 추정). 우리 목록은 자체 브랜드가 강한 카테고리입니다(케이 뷰티 파운데이션, Nykaa 코스메틱 립스틱, 닷앤키 선크림).</>), v: "differs", sure: "medium" };
      case "derma": return { ours: tr(<>Global derma houses (Cetaphil, CeraVe, Bioderma, La Roche-Posay…) take {pct(derma, 0)} of daily skincare buying in our lists. Nykaa doesn&rsquo;t list which brands it counts as derma; its 20% likely includes Indian derma brands too.</>, <>글로벌 더마 브랜드(Cetaphil, CeraVe, Bioderma, La Roche-Posay…)는 우리 목록 일 스킨케어 구매의 {pct(derma, 0)}. Nykaa는 더마 브랜드 목록을 공개하지 않으며, 20%에는 인도 더마 브랜드도 포함된 것으로 보입니다.</>), v: "differs", sure: "low" };
      case "brands_6000": return { ours: tr(<><b>{allBrands}</b> brands sell in our {listCount} lists (Nykaa&rsquo;s brand filter, complete for these lists): about 1 in {Math.round(6000 / Math.max(1, allBrands))} of Nykaa&rsquo;s brands.</>, <>우리 {listCount}개 목록의 판매 브랜드 <b>{allBrands}</b>개(Nykaa 브랜드 필터, 이 목록에서는 전체): Nykaa 브랜드의 약 {Math.round(6000 / Math.max(1, allBrands))}분의 1.</>), v: "context", sure: "high" };
      case "new_brands": return { ours: tr(<>{newBrands} brand{newBrands === 1 ? "" : "s"} appeared in our lists&rsquo; brand filters since {dayMonth(firstBrandDay || win.end)}. Nykaa&rsquo;s pace (about 107 a month across all of Nykaa) can be compared from early November.</>, <>{dayMonth(firstBrandDay || win.end)} 이후 우리 목록 브랜드 필터에 새로 나타난 브랜드 {newBrands}개. Nykaa 속도(전체 월 약 107개)와는 11월 초부터 비교 가능.</>), v: "pending", sure: "low" };
      case "sales": return { ours: maySale ? tr(<>Our log has &ldquo;{maySale.label}&rdquo; {maySale.status === "estimated" ? "marked as estimated; Nykaa's report confirms a May sale" : "confirmed"}. The Birthday Sale is not in our log yet.</>, <>기록: &ldquo;{maySale.label}&rdquo; {maySale.status === "estimated" ? "추정으로 표시; Nykaa 보고서가 5월 세일을 확인" : "확인됨"}. 생일 세일은 아직 기록에 없음.</>) : tr("No May sale in our log.", "기록에 5월 세일 없음."), v: maySale && maySale.status !== "estimated" ? "match" : "differs", sure: "high" };
    }
  };
  const claims = IR_CLAIMS().map((c) => ({ c, k: checkOf(c.check) }));
  const dkMatch = claims.filter((x) => x.c.check.startsWith("dotkey")); const dkOk = dkMatch.filter((x) => x.k.v === "match").length;

  /* ---------------- how sound */
  const agree = cats.map((c) => ({ c, rho: rankAgreement(m.ix, m.flow, c, span.start, span.end) })).filter((x): x is { c: string; rho: number } => x.rho !== null).sort((a, b) => a.rho - b.rho);
  const medRho = median(agree.map((x) => x.rho));
  const gaps: string[] = []; for (let i = 1; i < m.ix.days.length; i++) { const a = new Date(m.ix.days[i - 1]); const b = new Date(m.ix.days[i]); const d = Math.round((+b - +a) / 864e5); for (let k = 1; k < d; k++) gaps.push(new Date(+a + k * 864e5).toISOString().slice(0, 10)); }
  const lastDay = m.ix.days[m.ix.days.length - 1];
  const rawToday = (raw.data ?? []).filter((r) => r.scrape_date === lastDay && r.subcategory !== "kbeauty_store" && CATEGORIES.includes(r.subcategory));
  const counted = cats.map((c) => ({ c, n: m.ix.byDay.get(lastDay) ? [...m.ix.byDay.get(lastDay)!.values()].filter((r) => r.subcategory === c).length : 0, of: rawToday.filter((r) => r.subcategory === c).length }));
  const countedAll = counted.reduce((a, x) => a + x.n, 0); const ofAll = counted.reduce((a, x) => a + x.of, 0);

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
    <>{kUp ? <>한국 브랜드 중 <b>{kUp.b}</b>가 상위 100위 제품을 가장 많이 늘림(+{kUp.d}, 현재 {nowIn(kUp.b)})</> : null}{kUp && kDown ? "; " : ""}{kDown ? <><b>{kDown.b}</b> 가장 많이 감소({kDown.d}, 현재 {nowIn(kDown.b)})</> : null}.</>), detail: <BrandQuick brand={(kUp ?? kDown)!.b} />, news: (kUp ?? kDown)!.b });
  if (kClimb) kItems.push({ key: "k2", text: moveLine(kClimb), detail: <ProductQuick pid={kClimb.product_id} cat={kClimb.subcategory} />, news: kClimb.brand });
  if (kItems.length) groups.push({ title: tr("Korean brands", "한국 브랜드"), items: kItems });
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

  const sureChip = (s: Sure) => <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ring-1 ${s === "high" ? "text-good ring-good/30" : s === "medium" ? "text-ink-2 ring-line" : "text-warn ring-warn/30"}`}>{SURE()[s]}</span>;
  const growthBar = (v: number | null) => v !== null && <span className="ml-2 inline-block h-1.5 rounded-full bg-[#c29a5b] align-middle" style={{ width: `${(v / 0.3) * 56}px` }} />;

  return (
    <Shell active="Overview" asOf={m.latest ?? undefined}>
      <PageHead eyebrow={tr("Brief · start here", "브리핑 · 여기서 시작")} title={tr("What you need to know", "알아야 할 것")}
        sub={tr("Nykaa's own figures, what Nykaa says held against its shelf, how far to trust our data, then what changed: Innisfree first, then Korean brands, then the market.", "Nykaa 공식 수치, Nykaa 발표와 진열 데이터 비교, 우리 데이터의 신뢰도, 그리고 달라진 점: 이니스프리, 한국 브랜드, 시장 순서.")}
        right={<PeriodBar shelf={win} freeze={m.freeze} />} />
      <SectionNav items={NAV()} />

      <ActionSection id="results" kicker={tr("Nykaa's beauty business", "Nykaa 뷰티 실적")} title={tr(`Beauty GMV ₹${fyN.gmv.toLocaleString("en-IN")} cr in FY26, growing ${pct(threeYear, 0)} a year since FY23; ${signed(lastQ.value)} in ${lastQ.label}`, `FY26 뷰티 GMV ₹${fyN.gmv.toLocaleString("en-IN")}억, FY23 이후 연 ${pct(threeYear, 0)} 성장; ${lastQ.label} ${signed(lastQ.value)}`)}
        note={<>{tr("From FSN E-Commerce Ventures' investor documents; each row links to its PDF. ", "FSN E-Commerce Ventures 투자자 자료 기준, 각 행은 원본 PDF로 연결됩니다. ")}<PdfLink href={IR_PAGE}>{tr("All documents", "전체 자료")}</PdfLink>{tr(` Won at the planning rate ₹1 = ₩${KRW_PER_INR} (market rate on ${dayMonth(ECB_KRW_PER_INR.date)}: ₩${ECB_KRW_PER_INR.rate}, ECB). Fixed figures: the period picker doesn't change them.`, ` 원화는 기획 환율 ₹1 = ₩${KRW_PER_INR} 적용 (${dayMonth(ECB_KRW_PER_INR.date)} 시장 환율 ₩${ECB_KRW_PER_INR.rate}, ECB). 고정 수치이며 기간 선택과 무관합니다.`)}</>}>
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
              <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Quarter", "분기")}</th><th className="px-2 text-right">{tr("Beauty GMV", "뷰티 GMV")}</th><th className="px-2 text-right">{tr("In won", "원화")}</th><th className="px-2">{tr("vs a year earlier", "전년 동기 대비")}</th><th className="px-2 pr-4" /></tr></thead>
              <tbody>{quarters.map((q) => (
                <Fragment key={q.fy}>
                  <tr className={`${q.note ? "" : "border-b border-line/60"}`}>
                    <td className="px-4 py-2 font-medium">{q.label} <span className="text-[11px] font-normal text-muted">{q.fy}</span></td>
                    <td className="px-2 py-2 text-right tabular">{q.gmv ? `₹${q.gmv.toLocaleString("en-IN")} cr` : "–"}</td>
                    <td className="whitespace-nowrap px-2 py-2 text-right tabular text-ink-2">{q.gmv ? eok(q.gmv) : "–"}</td>
                    <td className="whitespace-nowrap px-2 py-2 font-semibold tabular">{q.value !== null ? signed(q.value) : <span className="font-normal text-muted">{tr("provisional", "잠정")}</span>}{growthBar(q.value)}</td>
                    <td className="px-2 py-2 pr-4 text-right text-[12px]"><PdfLink href={q.url}>PDF</PdfLink></td>
                  </tr>
                  {q.note && <tr><td colSpan={5} className="px-4 pb-2.5 text-[12px] text-ink-2">{q.note}</td></tr>}
                </Fragment>))}</tbody>
            </table>
          </Card>
        </div>
      </ActionSection>

      <ActionSection id="check" kicker={tr("Nykaa says vs our data", "Nykaa 발표 vs 우리 데이터")} title={tr(`${claims.length} things Nykaa tells investors, held against what its shelf shows`, `Nykaa가 투자자에게 말한 ${claims.length}가지와 진열 데이터 비교`)}
        note={tr(<>Our side: <Def k="ratingFlow">share of buying</Def> ({dayMonth(span.start)}–{dayMonth(span.end)}), counting only products Nykaa files under each category. Totals across categories add up buying per day, because the lists started on different days.</>,
          <>우리 데이터: <Def k="ratingFlow">구매 점유율</Def> ({dayMonth(span.start)}–{dayMonth(span.end)}), Nykaa가 해당 카테고리로 분류한 제품만. 카테고리 합계는 목록 시작일이 달라 일 평균으로 더합니다.</>)}>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Nykaa says", "Nykaa 발표")}</th><th className="px-2">{tr("What our data shows", "우리 데이터")}</th><th className="px-2">{tr("Verdict", "판정")}</th><th className="px-2 pr-4">{tr("How sure", "확실성")}</th></tr></thead>
            <tbody>{claims.map(({ c, k }) => { const v = VERDICT()[k.v]; return (
              <tr key={c.check} className="border-b border-line/60 align-top last:border-0">
                <td className="max-w-[340px] px-4 py-2.5">{c.says}<div className="mt-0.5 text-[11.5px] text-muted">{c.url ? <PdfLink href={c.url}>{c.doc}</PdfLink> : c.doc}</div></td>
                <td className="px-2 py-2.5 text-ink-2">{k.ours}</td>
                <td className="px-2 py-2.5"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${v.c}`}>{v.t}</span></td>
                <td className="px-2 py-2.5 pr-4">{sureChip(k.sure)}</td>
              </tr>); })}</tbody>
          </table>
        </Card>
      </ActionSection>

      <ActionSection id="sound" kicker={tr("How sound our data is", "데이터 신뢰도")} title={tr(`${listCount} Nykaa lists read every night with ${gaps.length ? `${gaps.length} missing` : "no missing"} day${gaps.length === 1 ? "" : "s"}; ${dkOk} of ${dkMatch.length} of Nykaa's rank claims match`, `Nykaa 목록 ${listCount}개를 매일 수집, 누락 ${gaps.length}일; Nykaa 순위 주장 ${dkMatch.length}개 중 ${dkOk}개 일치`)}
        note={tr("How far to trust the other tabs: what we cover, whether any day is missing, how closely our buying figures follow Nykaa's own order, and what we don't know yet.", "다른 탭을 얼마나 믿을 수 있는지: 수집 범위, 누락 여부, 우리 구매 수치와 Nykaa 순위의 일치도, 아직 모르는 것.")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { v: tr(`${listCount} lists · ${allBrands} brands`, `목록 ${listCount}개 · 브랜드 ${allBrands}개`), s: tr(`About 1 in ${Math.round(6000 / Math.max(1, allBrands))} of Nykaa's 6,000+ brands. Nykaa's brand filter is complete for these lists (its product counts add up to Nykaa's own totals).`, `Nykaa 6,000개 이상 브랜드의 약 ${Math.round(6000 / Math.max(1, allBrands))}분의 1. 이 목록에서는 Nykaa 브랜드 필터가 전체입니다(제품 수 합계가 Nykaa 총계와 일치).`) },
            { v: tr(`${m.ix.days.length} nights, ${gaps.length ? `${gaps.length} missing` : "none missing"}`, `${m.ix.days.length}일, ${gaps.length ? `${gaps.length}일 누락` : "누락 없음"}`), s: tr(`${dayMonth(m.ix.days[0])} → ${dayMonth(lastDay)}. Lists added later start on their own first day (5 on 27 Sep, lip care 6 Oct, 3 makeup lists 18 Oct).`, `${dayMonth(m.ix.days[0])} → ${dayMonth(lastDay)}. 나중에 추가한 목록은 각자 첫날부터 (9월 27일 5개, 10월 6일 립케어, 10월 18일 메이크업 3개).`) },
            { v: tr(`${countedAll} of ${ofAll} listings count`, `목록 ${ofAll}개 중 ${countedAll}개 집계`), s: tr("Only products Nykaa files under the category count (e.g. sheet masks are left out of Masks & peels and counted in Sheet masks).", "Nykaa가 해당 카테고리로 분류한 제품만 집계 (예: 시트 마스크는 마스크·필링에서 빼고 시트 마스크에서 집계).") },
            { v: tr(`Agreement with Nykaa's order: ${medRho !== null ? medRho.toFixed(2) : "–"}`, `Nykaa 순위와의 일치도: ${medRho !== null ? medRho.toFixed(2) : "–"}`), s: tr(`Median across categories on a −1 to 1 scale; lowest in ${agree[0] ? `${catName(agree[0].c).toLowerCase()} (${agree[0].rho.toFixed(2)})` : "–"}, highest in ${agree.length ? `${catName(agree[agree.length - 1].c).toLowerCase()} (${agree[agree.length - 1].rho.toFixed(2)})` : "–"}. Nykaa's order also reflects paid spots and launches, so it never reaches 1.`, `카테고리 중앙값(−1~1); 최저 ${agree[0] ? `${catName(agree[0].c)} (${agree[0].rho.toFixed(2)})` : "–"}, 최고 ${agree.length ? `${catName(agree[agree.length - 1].c)} (${agree[agree.length - 1].rho.toFixed(2)})` : "–"}. Nykaa 순위에는 광고와 신제품도 반영되어 1이 될 수 없습니다.`) },
            { v: m.freeze ? tr(`Ratings frozen since ${dayMonth(m.freeze.since)}`, `${dayMonth(m.freeze.since)}부터 평가 수 정지`) : tr("Ratings current", "평가 수 최신"), s: m.freeze ? tr(`Nykaa stopped updating rating counts, so buying figures end on ${dayMonth(m.freeze.lastLive)}. Written-review counts are read nightly from 18 Oct as a stand-in; you'll see a comparison before they're used.`, `Nykaa가 평가 수 갱신을 멈춰 구매 수치는 ${dayMonth(m.freeze.lastLive)}에 끝납니다. 10월 18일부터 대안으로 작성 리뷰 수를 매일 수집하며, 사용 전에 비교를 보여드립니다.`) : "" },
            { v: tr(`${unclassified} brands not yet classified`, `미분류 브랜드 ${unclassified}개`), s: tr("Small brands outside the top 100 whose country we haven't set. Counted and shown as \"not yet classified\", never guessed.", "상위 100위 밖 소규모 브랜드로 국가를 아직 정하지 않았습니다. \"미분류\"로 집계·표시하며 추측하지 않습니다.") },
          ].map((x) => <Card key={String(x.v)} className="px-5 py-4"><div className="font-display text-[19px] font-semibold leading-snug">{x.v}</div><div className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{x.s}</div></Card>)}
        </div>
        <details className="mt-3 rounded-[14px] bg-surface px-5 py-3 ring-1 ring-line">
          <summary className="cursor-pointer text-[13px] font-medium">{tr("Every list: products counted today and agreement with Nykaa's order", "모든 목록: 오늘 집계 제품과 Nykaa 순위 일치도")}</summary>
          <div className="mt-2 grid gap-x-8 gap-y-1 text-[12.5px] sm:grid-cols-2">{counted.map((x) => { const a = agree.find((y) => y.c === x.c); return (
            <div key={x.c} className="flex justify-between gap-3 border-b border-line/50 py-1"><span>{catName(x.c)}</span><span className="tabular text-ink-2">{tr(`${x.n} of ${x.of} counted`, `${x.of}개 중 ${x.n}개`)} · {a ? a.rho.toFixed(2) : "–"}</span></div>); })}</div>
        </details>
      </ActionSection>

      <ActionSection id="changed" kicker={tr(`What changed · ${spanLabel(m.period.days)}`, `달라진 점 · ${spanLabel(m.period.days)}`)} title={tr(`${anchor} first, then Korean brands, then the whole market`, `${anchor}, 한국 브랜드, 시장 전체 순서로`)}
        note={tr(`Daily top 100s, ${dayMonth(win.start)}–${dayMonth(win.end)}. Products in the top 100 count only the ${both.size} categories tracked for the whole period. Moves use the middle of the first and last three days. Lines marked External are headlines from outside Nykaa, read nightly: context, not proof.`, `일별 상위 100위, ${dayMonth(win.start)}–${dayMonth(win.end)}. 상위 100위 제품 수는 기간 내내 추적한 ${both.size}개 카테고리 기준. 변화는 처음·마지막 3일 중앙값. "외부" 표시는 매일 수집한 Nykaa 밖 헤드라인으로, 참고일 뿐 증거가 아닙니다.`)}>
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
                    {s.news && <ExternalNewsList brand={s.news} max={1} compact />}
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
          tr(<>Nykaa&rsquo;s figures: FSN E-Commerce Ventures&rsquo; investor presentations, call transcripts and quarterly updates, linked on each row. Nothing from news is used for Nykaa&rsquo;s own figures.</>, <>Nykaa 수치: FSN E-Commerce Ventures 투자자 자료, 컨퍼런스콜 녹취록, 분기 업데이트(각 행에 링크). Nykaa 자체 수치에는 뉴스를 쓰지 않습니다.</>),
          tr(`Our data: Nykaa's top 100 in ${listCount} lists every night, Nykaa's brand filter for each list, Nykaa's homepage and brand offers (from 17 Oct).`, `우리 데이터: 매일 밤 Nykaa ${listCount}개 목록 상위 100위, 목록별 Nykaa 브랜드 필터, Nykaa 홈페이지와 브랜드 프로모션(10월 17일부터).`),
          tr("External headlines: Google News' search feed, read nightly for the main brands and the day's movers; a headline is kept only when it names the brand.", "외부 헤드라인: Google News 검색 피드, 주요 브랜드와 당일 급변 브랜드를 매일 밤 수집, 브랜드 이름이 들어간 헤드라인만."),
        ],
        calc: [
          tr(`Won: ₹ crore × ${KRW_PER_INR} ÷ 10 = 억원 (planning rate ₹1 = ₩${KRW_PER_INR}). 3-year growth rate: (FY26 ÷ FY23)^(1/3) − 1. Latest 12 months: the last four reported quarters added.`, `원화: ₹ crore × ${KRW_PER_INR} ÷ 10 = 억원 (기획 환율 ₹1 = ₩${KRW_PER_INR}). 3년 연평균 성장률: (FY26 ÷ FY23)^(1/3) − 1. 최근 12개월: 최근 발표 4개 분기 합.`),
          ...BUYING_METHOD().calc,
          tr("Across categories (e.g. Nykaa's own brands' share): each category's buying is divided by its number of rating days, then added.", "카테고리 합계(예: Nykaa 자체 브랜드 비중): 카테고리별 구매를 평가 일수로 나눈 뒤 더합니다."),
          tr("Agreement with Nykaa's order: rank correlation (Spearman) between each product's average place in the window and its buying, per category.", "Nykaa 순위와의 일치도: 카테고리별로 기간 중 평균 순위와 구매 금액의 순위 상관(스피어만)."),
        ],
        assume: [...BUYING_METHOD().assume, tr("Nykaa's claims are taken as stated; where Nykaa doesn't define a group (derma brands), we use our own list and say so.", "Nykaa의 주장은 발표대로 받아들이고, Nykaa가 정의하지 않은 집단(더마 브랜드)은 우리 목록을 쓰고 그렇게 밝힙니다.")],
        limits: [...BUYING_METHOD().limits, tr(`Our ${listCount} lists are about 1 in 8 of Nykaa's brands, so Nykaa-wide shares (derma, Nykaa's own brands) can differ from ours for that reason alone.`, `우리 ${listCount}개 목록은 Nykaa 브랜드의 약 8분의 1이므로, Nykaa 전체 비중(더마, 자체 브랜드)은 그 이유만으로도 다를 수 있습니다.`)],
      }} />
    </Shell>
  );
}

export default function Page() { return <AuthGate><BriefPage /></AuthGate>; }
