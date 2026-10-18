"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import PeriodBar from "@/components/PeriodBar";
import { Card, Loading, PageHead } from "@/components/ui";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import { Basis, Def } from "@/components/Tiered";
import { BrandQuick, DetailsButton, ProductQuick, useMoveContext } from "@/components/Quick";
import { norm } from "@/lib/brands";
import { useCategoryBrands, useCategoryStats, useEvents, useHomepage } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL, pct, shortName, signed } from "@/lib/format";
import { catsOn, isCombo, MAKEUP, placesOn } from "@/lib/market";
import { listingMoves, runsFrom, type ListingMove } from "@/lib/profile";
import { DERMA_BRANDS, HON_BRANDS, IR_CLAIMS, IR_PAGE, NYKAA_QUARTERS, type IrClaim } from "@/lib/reference";
import { spanLabel } from "@/lib/period";
import { useTiers } from "@/lib/tiers";
import { useMarket } from "@/lib/useMarket";
import { dayMonth, tr } from "@/lib/i18n";

/** The Brief (plan v3, owner 18 Oct 2026). Nykaa's own results from its investor documents, what Nykaa says held
 *  against our shelf, the shelf today in a few numbers, and what changed, in sentences whose details open in place.
 *  Category and brand tables live on Market; this page only says what matters. */

const NAV = (): NavItem[] => [
  { id: "results", label: tr("Nykaa's results", "Nykaa 실적") }, { id: "check", label: tr("Nykaa's claims vs our data", "Nykaa 발표 vs 우리 데이터") },
  { id: "today", label: tr("The shelf today", "오늘의 진열") }, { id: "changed", label: tr("What changed", "달라진 점") }, { id: "how", label: tr("How the numbers work", "수치 계산 방법") },
];
const PLAN_URL = "https://claude.ai/artifact/EHrtxEG82NePyf1d9CJPBv";
const catName = (c: string) => CATEGORY_LABEL[c] ?? c;
type Verdict = "match" | "differs" | "context";
const VERDICT = () => ({ match: { t: tr("Matches", "일치"), c: "bg-[#eaf6ee] text-good" }, differs: { t: tr("Differs", "다름"), c: "bg-warn-soft text-warn" }, context: { t: tr("Different measures", "다른 지표"), c: "bg-sunken text-ink-2" } });

function BriefPage() {
  const m = useMarket(); const stats = useCategoryStats(); const cb = useCategoryBrands(); const home = useHomepage(); const events = useEvents();
  const ctx = useMoveContext();
  const runs = useMemo(() => runsFrom(home.data ?? []), [home.data]);
  const tiers = useTiers(useMemo(() => [...new Set(m.shelf.map((r) => r.brand))], [m.shelf]));
  const moves = useMemo(() => (ctx ? listingMoves(ctx, null) : []), [ctx]);
  const [open, setOpen] = useState<number | null>(null);
  const latestStat = useMemo(() => [...new Set((stats.data ?? []).map((s) => s.scrape_date))].sort().pop() ?? null, [stats.data]);

  if (!m.ready || !m.win || !ctx) return <Shell active="Overview"><PageHead eyebrow={tr("Brief", "브리핑")} title={tr("What you need to know", "알아야 할 것")} sub="" /><Loading what={tr("the brief", "브리핑")} /></Shell>;
  const win = m.win; const span = m.flowSpan!;
  const quarters = NYKAA_QUARTERS();
  const lastQ = [...quarters].reverse().find((q) => q.value !== null)!;

  /* ---------------- buying slices (to the last day Nykaa updated ratings) */
  const flow = m.flow.filter((r) => r.value > 0);
  const sum = (f: (r: (typeof flow)[number]) => boolean) => flow.filter(f).reduce((a, r) => a + r.value, 0);
  const skin = sum((r) => !MAKEUP.has(r.subcategory)); const makeup = sum((r) => MAKEUP.has(r.subcategory)); const all = skin + makeup || 1;
  const kSkin = sum((r) => !MAKEUP.has(r.subcategory) && r.origin === "kbeauty") / (skin || 1);
  const kMakeup = sum((r) => MAKEUP.has(r.subcategory) && r.origin === "kbeauty") / (makeup || 1);
  const isHon = (b: string) => HON_BRANDS.some((x) => norm(x) === norm(b)); const isDerma = (b: string) => DERMA_BRANDS.some((x) => norm(x) === norm(b));
  const hon = sum((r) => isHon(r.brand)) / all;
  const derma = sum((r) => !MAKEUP.has(r.subcategory) && isDerma(r.brand)) / (skin || 1);
  const brandRank = (cat: string, b: string) => {
    const by = new Map<string, number>(); for (const r of flow) if (r.subcategory === cat) by.set(norm(r.brand), (by.get(norm(r.brand)) ?? 0) + r.value);
    const tot = [...by.values()].reduce((a, v) => a + v, 0); const ranked = [...by.entries()].sort((a, c) => c[1] - a[1]);
    const i = ranked.findIndex(([k]) => k === norm(b)); return i < 0 ? null : { place: i + 1, share: ranked[i][1] / (tot || 1), leader: ranked[0][0] };
  };
  const leaderName = (key: string) => m.shelf.find((r) => norm(r.brand) === key)?.brand ?? key;
  const today = m.shelf.filter((r) => r.subcategory !== "kbeauty_store");
  const kPlaces = today.filter((r) => r.origin === "kbeauty").length / (today.length || 1);
  const allBrands = new Set((cb.data ?? []).filter((b) => b.last_seen === latestStat && b.subcategory !== "kbeauty_store").map((b) => b.brand)).size;
  const perCat = CATEGORIES.map((c) => ({ c, n: (stats.data ?? []).find((s) => s.scrape_date === latestStat && s.subcategory === c)?.brands ?? 0 })).sort((a, b) => b.n - a.n);
  const maxN = Math.max(1, ...perCat.map((x) => x.n));
  const maySale = (events.data ?? []).find((e) => e.happened_on.startsWith("2026-05"));

  const checkOf = (c: IrClaim["check"]): { ours: React.ReactNode; v: Verdict } => {
    const dk = (cat: string, want: number) => { const r = brandRank(cat, "Dot & Key"); return { ours: r ? tr(<>#{r.place} on Nykaa&rsquo;s shelf, {pct(r.share, 1)} of {catName(cat).toLowerCase()} buying{r.place > 1 ? <>; {leaderName(r.leader)} leads</> : null}</>, <>Nykaa 진열 {r.place}위, {catName(cat)} 구매의 {pct(r.share, 1)}{r.place > 1 ? <>. 1위 {leaderName(r.leader)}</> : null}</>) : tr("Not in the top 100", "상위 100위 밖"), v: (r?.place === want ? "match" : "differs") as Verdict }; };
    switch (c) {
      case "kbeauty": return { ours: tr(<>Korean brands take {pct(kSkin, 0)} of skincare buying and {pct(kMakeup, 1)} of makeup, and hold {pct(kPlaces, 0)} of top-100 places. 58% is growth over a year; these are sizes today, so they do not contradict it.</>, <>한국 브랜드는 스킨케어 구매의 {pct(kSkin, 0)}, 메이크업의 {pct(kMakeup, 1)}, 상위 100위 자리의 {pct(kPlaces, 0)}. 58%는 1년 성장률이고 이 값들은 현재 크기이므로 모순이 아닙니다.</>), v: "context" };
      case "dotkey_sun": return dk("sunscreen", 1);
      case "dotkey_moist": return dk("face_moisturizer", 2);
      case "dotkey_wash": { const d = dk("face_wash", 3); return { ...d, ours: <>{d.ours}{tr(". Nykaa's rank includes Amazon, Flipkart and Blinkit.", ". Nykaa 순위는 Amazon·Flipkart·Blinkit 포함.")}</> }; }
      case "derma": return { ours: tr(<>Global derma houses (Cetaphil, CeraVe, Bioderma, La Roche-Posay…) take {pct(derma, 0)} of skincare buying. Nykaa doesn&rsquo;t list which brands it counts as derma, so its 20% likely includes more.</>, <>글로벌 더마 브랜드(Cetaphil, CeraVe, Bioderma, La Roche-Posay…)는 스킨케어 구매의 {pct(derma, 0)}. Nykaa는 더마 브랜드 목록을 공개하지 않아 20%에는 더 많은 브랜드가 포함됐을 수 있습니다.</>), v: "differs" };
      case "hon": return { ours: tr(<>Nykaa&rsquo;s own brands (Dot &amp; Key, Kay Beauty, Nykaa Cosmetics, Nykaa Skin, Earth Rhythm…) take {pct(hon, 0)} of all top-100 buying: the biggest single rival bloc on the shelf.</>, <>Nykaa 자체 브랜드(Dot &amp; Key, Kay Beauty, Nykaa Cosmetics, Nykaa Skin, Earth Rhythm…)가 상위 100위 구매의 {pct(hon, 0)}: 진열에서 가장 큰 경쟁 집단.</>), v: "context" };
      case "sales": return { ours: maySale ? tr(<>Our log has &ldquo;{maySale.label}&rdquo; {maySale.status === "estimated" ? "marked as estimated; Nykaa's report confirms a May sale" : "confirmed"}. The Birthday Sale is not in our log yet.</>, <>기록: &ldquo;{maySale.label}&rdquo; {maySale.status === "estimated" ? "추정으로 표시; Nykaa 보고서가 5월 세일을 확인" : "확인됨"}. 생일 세일은 아직 기록에 없음.</>) : tr("No May sale in our log.", "기록에 5월 세일 없음."), v: maySale && maySale.status !== "estimated" ? "match" : "differs" };
    }
  };

  /* ---------------- what changed */
  const c0 = catsOn(m.ix, win.start); const c1 = catsOn(m.ix, win.end); const both = new Set([...c1].filter((c) => c0.has(c)));
  const p0 = placesOn(m.ix, m.dims, win.start, both); const p1 = placesOn(m.ix, m.dims, win.end, both);
  const placeMoves = [...new Set([...p0.keys(), ...p1.keys()])].map((b) => ({ b, d: (p1.get(b) ?? 0) - (p0.get(b) ?? 0), now: p1.get(b) ?? 0 }));
  const gainer = [...placeMoves].sort((a, b) => b.d - a.d)[0]; const loser = [...placeMoves].sort((a, b) => a.d - b.d)[0];
  const score = (x: ListingMove) => Math.abs(x.gain) / Math.sqrt(Math.max(1, Math.min(x.from ?? 100, x.to ?? 100)));
  const singles = moves.filter((x) => !isCombo(x.name));
  const climber = singles.filter((x) => x.gain >= 5 && !x.entered && x.from !== null && x.to !== null).sort((a, b) => score(b) - score(a))[0];
  const faller = singles.filter((x) => x.gain <= -5 && !x.left && x.from !== null && x.to !== null).sort((a, b) => score(b) - score(a))[0];
  const krivals = [tiers.pinned, ...tiers.focus.filter((b) => tiers.group(b) === "korean")];
  const kr = krivals.map((b) => { const key = [...p1.keys(), ...p0.keys()].find((x) => norm(x) === norm(b)) ?? b; return { b, d: (p1.get(key) ?? 0) - (p0.get(key) ?? 0), now: m.shelf.filter((r) => norm(r.brand) === norm(b)).length }; });
  const ours = kr[0]; const krUp = kr.slice(1).sort((a, b) => b.d - a.d)[0];
  const homeDay = (home.data ?? []).reduce((a, x) => (x.scrape_date > a ? x.scrape_date : a), "");
  const liveSales = runs.filter((r) => r.end === homeDay && (r.kind === "sale" || r.kind === "campaign"));
  const why = (x: ListingMove) => (x.why[0] ? tr(`, around the time ${x.why[0].text}`, `, 같은 시기: ${x.why[0].text}`) : tr("; nothing we track changed at the same time", "; 같은 시기 추적 항목 변화 없음"));

  const said: { text: React.ReactNode; detail: React.ReactNode; go?: { href: string; label: string } }[] = [];
  if (ours) said.push({ text: tr(<><b>{ours.b}</b> holds {ours.now} top-100 places ({ours.d === 0 ? "no change" : `${ours.d > 0 ? "+" : ""}${ours.d}`} over the {spanLabel(m.period.days)}){krUp && krUp.d > 0 ? <>; among its Korean rivals <b>{krUp.b}</b> gained the most (+{krUp.d})</> : null}.</>,
      <><b>{ours.b}</b> 상위 100위 {ours.now}자리 ({spanLabel(m.period.days)} {ours.d === 0 ? "변화 없음" : `${ours.d > 0 ? "+" : ""}${ours.d}`}){krUp && krUp.d > 0 ? <>. 한국 경쟁사 중 <b>{krUp.b}</b>가 가장 많이 늘림(+{krUp.d})</> : null}.</>),
    detail: <BrandQuick brand={ours.b} />, go: { href: "/analysis/", label: tr("K-beauty tab", "K-뷰티 탭") } });
  if (gainer && gainer.d > 0) said.push({ text: tr(<>Across all brands, <b>{gainer.b}</b> gained the most places (+{gainer.d}, now {gainer.now}){loser && loser.d < 0 ? <> and <b>{loser.b}</b> lost the most ({loser.d})</> : null}.</>,
      <>전체 브랜드 중 <b>{gainer.b}</b>가 자리를 가장 많이 늘렸고(+{gainer.d}, 현재 {gainer.now}){loser && loser.d < 0 ? <>, <b>{loser.b}</b>가 가장 많이 잃었습니다({loser.d})</> : null}.</>), detail: <BrandQuick brand={gainer.b} /> });
  if (climber) said.push({ text: tr(<>Biggest climb: <b>{climber.brand}</b> {shortName(climber.name, climber.brand)} went from #{climber.from} to #{climber.to} in {catName(climber.subcategory).toLowerCase()}{why(climber)}.</>,
      <>최대 상승: <b>{climber.brand}</b> {shortName(climber.name, climber.brand)}, {catName(climber.subcategory)} #{climber.from} → #{climber.to}{why(climber)}.</>), detail: <ProductQuick pid={climber.product_id} cat={climber.subcategory} /> });
  if (faller) said.push({ text: tr(<>Biggest fall: <b>{faller.brand}</b> {shortName(faller.name, faller.brand)} went from #{faller.from} to #{faller.to} in {catName(faller.subcategory).toLowerCase()}{why(faller)}.</>,
      <>최대 하락: <b>{faller.brand}</b> {shortName(faller.name, faller.brand)}, {catName(faller.subcategory)} #{faller.from} → #{faller.to}{why(faller)}.</>), detail: <ProductQuick pid={faller.product_id} cat={faller.subcategory} /> });
  if (homeDay) said.push({ text: tr(<>Nykaa&rsquo;s homepage on {dayMonth(homeDay)}: {liveSales.length ? <b>{liveSales.map((r) => r.label).slice(0, 3).join(", ")}</b> : "no sale banner"}.</>, <>{dayMonth(homeDay)} Nykaa 홈페이지: {liveSales.length ? <b>{liveSales.map((r) => r.label).slice(0, 3).join(", ")}</b> : "세일 배너 없음"}.</>),
    detail: null, go: { href: "/offers/", label: tr("Offers & events", "프로모션·이벤트") } });

  return (
    <Shell active="Overview" asOf={m.latest ?? undefined}>
      <PageHead eyebrow={tr("Brief · start here", "브리핑 · 여기서 시작")} title={tr("What you need to know", "알아야 할 것")}
        sub={tr("Nykaa's own results first, then what they mean on Nykaa's shelves, then what changed. Press \"Details\" to see more without leaving the page.", "Nykaa 실적, 그 의미가 진열에서 어떻게 보이는지, 그리고 달라진 점. \"자세히\"를 누르면 페이지를 떠나지 않고 더 볼 수 있습니다.")}
        right={<PeriodBar shelf={win} freeze={m.freeze} />} />
      <SectionNav items={NAV()} />

      <ActionSection id="results" kicker={tr("Nykaa's results", "Nykaa 실적")} title={tr(`Nykaa's beauty sales grew ${signed(lastQ.value)} in ${lastQ.label} and 26–28% in every quarter for a year`, `Nykaa 뷰티 매출 ${lastQ.label} ${signed(lastQ.value)}, 1년 내내 분기마다 26–28% 성장`)}
        note={<>{tr("Beauty GMV against the same quarter a year earlier. Source: FSN E-Commerce Ventures' investor documents ", "뷰티 거래액(GMV), 전년 동기 대비. 출처: FSN E-Commerce Ventures 투자자 자료 ")}(<a href={IR_PAGE} target="_blank" rel="noreferrer" className="underline underline-offset-2">nykaa.com/investor-relations ↗</a>){tr(". Fixed figures: the period picker doesn't change them.", ". 고정 수치이며 기간 선택과 무관합니다.")}</>}>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Quarter", "분기")}</th><th className="px-2">{tr("Beauty GMV", "뷰티 GMV")}</th><th className="px-2">{tr("vs a year earlier", "전년 동기 대비")}</th><th className="px-2" /><th className="px-2 pr-4">{tr("Document", "자료")}</th></tr></thead>
            <tbody>{quarters.map((q) => (
              <tr key={q.fy} className="border-b border-line/60 align-top last:border-0">
                <td className="px-4 py-2.5 font-medium">{q.label} <span className="text-[11.5px] text-muted">{q.fy}</span></td>
                <td className="px-2 py-2.5 tabular">{q.gmv ? tr(`₹${q.gmv.toLocaleString("en-IN")} cr`, `₹${q.gmv.toLocaleString("en-IN")}억`) : "–"}</td>
                <td className="px-2 py-2.5 font-semibold tabular">{q.value !== null ? signed(q.value) : <span className="font-normal text-ink-2">{q.note}</span>}</td>
                <td className="px-2 py-2.5">{q.value !== null && <span className="block h-2 rounded-full bg-[#c29a5b]" style={{ width: `${(q.value / 0.3) * 120}px` }} />}</td>
                <td className="px-2 py-2.5 pr-4 text-ink-2">{q.doc}</td>
              </tr>))}</tbody>
          </table>
        </Card>
      </ActionSection>

      <ActionSection id="check" kicker={tr("Nykaa's claims vs our data", "Nykaa 발표 vs 우리 데이터")} title={tr("What Nykaa tells investors, and what Nykaa's shelf shows", "Nykaa가 투자자에게 한 말과 진열이 보여주는 것")}
        note={tr(<>Our side: <Def k="ratingFlow">share of buying</Def> ({dayMonth(span.start)}–{dayMonth(span.end)}), single products in the 13 categories we track.</>, <>우리 데이터: <Def k="ratingFlow">구매 점유</Def> ({dayMonth(span.start)}–{dayMonth(span.end)}), 추적 13개 카테고리의 단일 제품.</>)}>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Nykaa says", "Nykaa 발표")}</th><th className="px-2">{tr("Nykaa's shelf shows", "진열 데이터")}</th><th className="px-2 pr-4" /></tr></thead>
            <tbody>{IR_CLAIMS().map((c) => { const k = checkOf(c.check); const v = VERDICT()[k.v]; return (
              <tr key={c.check} className="border-b border-line/60 align-top last:border-0">
                <td className="max-w-[360px] px-4 py-2.5">{c.says}<div className="text-[11.5px] text-muted">{c.doc}</div></td>
                <td className="px-2 py-2.5 text-ink-2">{k.ours}</td>
                <td className="px-2 py-2.5 pr-4"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${v.c}`}>{v.t}</span></td>
              </tr>); })}</tbody>
          </table>
        </Card>
      </ActionSection>

      <ActionSection id="today" kicker={tr("The shelf today", "오늘의 진열")} title={tr(`${allBrands || "–"} brands sell in the 13 categories we track; Korean brands take ${pct(kSkin, 0)} of skincare buying and ${pct(kMakeup, 0)} of makeup`, `추적 13개 카테고리 판매 브랜드 ${allBrands || "–"}개, 한국 브랜드는 스킨케어 구매의 ${pct(kSkin, 0)}, 메이크업의 ${pct(kMakeup, 0)}`)}
        note={tr(`Brands: Nykaa's own brand filter${latestStat ? ` on ${dayMonth(latestStat)}` : ""}, a brand counted once however many categories it sells in. Buying to ${dayMonth(span.end)}.`, `브랜드: Nykaa 브랜드 필터${latestStat ? ` (${dayMonth(latestStat)})` : ""}, 여러 카테고리 판매 브랜드는 한 번만. 구매는 ${dayMonth(span.end)}까지.`)}>
        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
          <div className="grid grid-cols-2 content-start gap-3">
            {[
              { v: allBrands ? allBrands.toLocaleString("en-IN") : "–", l: tr("brands across the 13 categories", "13개 카테고리 브랜드") },
              { v: `${today.length.toLocaleString("en-IN")}`, l: tr("top-100 places today", "오늘 상위 100위 자리") },
              { v: pct(kSkin, 0), l: tr("Korean brands' slice of skincare buying", "스킨케어 구매 중 한국 브랜드") },
              { v: pct(hon, 0), l: tr("Nykaa's own brands' slice of all buying", "전체 구매 중 Nykaa 자체 브랜드") },
            ].map((s) => <Card key={s.l} className="px-5 py-4"><div className="font-display text-[28px] font-semibold tabular">{s.v}</div><div className="mt-1 text-[12.5px] text-ink-2">{s.l}</div></Card>)}
          </div>
          <Card className="px-5 py-4">
            <div className="text-[12.5px] font-semibold text-ink-2">{tr("Brands selling in each category", "카테고리별 판매 브랜드")}</div>
            <div className="mt-2 space-y-1">{perCat.map((x) => (
              <div key={x.c} className="grid grid-cols-[120px_1fr_88px] items-center gap-3 text-[12.5px]">
                <span className="truncate">{catName(x.c)}</span>
                <span className="h-2 rounded-full bg-brand" style={{ width: `${(x.n / maxN) * 100}%` }} />
                <span className="text-right tabular text-ink-2">{x.n} <span className="text-muted">({allBrands ? pct(x.n / allBrands) : "–"})</span></span>
              </div>))}</div>
            <Basis className="mt-2">{tr("Percentages are of all brands across the 13 categories; they add to more than 100% because many brands sell in several categories.", "비율은 13개 카테고리 전체 브랜드 대비이며, 여러 카테고리에서 파는 브랜드가 많아 합이 100%를 넘습니다.")} <Link href="/categories/" className="underline underline-offset-2">{tr("Market tab →", "시장 탭 →")}</Link></Basis>
          </Card>
        </div>
      </ActionSection>

      <ActionSection id="changed" kicker={tr(`What changed · ${spanLabel(m.period.days)}`, `달라진 점 · ${spanLabel(m.period.days)}`)} title={tr("Five things that moved on the shelf", "진열에서 움직인 다섯 가지")}
        note={tr(`Daily top 100s, ${dayMonth(win.start)}–${dayMonth(win.end)}. Place changes count only the ${both.size} categories tracked for the whole period. Moves use the middle of the first and last three days, so one odd day can't create a big move.`, `일별 상위 100위, ${dayMonth(win.start)}–${dayMonth(win.end)}. 자리 변화는 기간 내내 추적한 ${both.size}개 카테고리 기준. 변화는 처음·마지막 3일 중앙값 기준입니다.`)}>
        <ol className="grid gap-2.5">
          {said.map((s, i) => (
            <li key={i} className="rounded-[16px] bg-surface px-5 py-4 shadow-card ring-1 ring-line">
              <div className="flex items-start gap-4">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-[12px] font-semibold text-on-brand">{i + 1}</span>
                <span className="min-w-0 flex-1 text-[15px] leading-relaxed">{s.text}</span>
                {s.detail && <DetailsButton open={open === i} onClick={() => setOpen(open === i ? null : i)} />}
                {s.go && <Link href={s.go.href} className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] text-ink-2 ring-1 ring-line hover:bg-sunken">{s.go.label} →</Link>}
              </div>
              {open === i && s.detail}
            </li>
          ))}
        </ol>
      </ActionSection>

      <section id="how" className="mt-16 scroll-mt-32">
        <details className="rounded-[16px] bg-surface px-5 py-4 shadow-card ring-1 ring-line">
          <summary className="cursor-pointer text-[14px] font-semibold">{tr("How the numbers work", "수치 계산 방법")} <span className="font-normal text-muted">{tr("(open)", "(열기)")}</span></summary>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[13.5px] leading-relaxed text-ink-2">
            <li>{tr("Market growth is Nykaa's own reported figure for a fixed quarter. Our review data can't measure it: products get fewer reviews as they age, and new launches swing the total.", "시장 성장률은 고정 분기의 Nykaa 발표 수치입니다. 리뷰 데이터로는 측정할 수 없습니다: 제품은 나이가 들수록 리뷰가 줄고, 신제품이 합계를 흔듭니다.")}</li>
            <li>{tr("Share of buying decides who is winning: ratings each top-100 product gained in the period × its price, as a share of its category. Fair within one category, not across categories. Combo packs are left out because Nykaa shows them with their contents' ratings.", "구매 점유가 승자를 가립니다: 기간 중 상위 100위 제품이 얻은 평가 × 가격의 카테고리 내 비중. 카테고리 안에서만 공정합니다. 콤보는 구성품 평가를 합쳐 보여주므로 제외합니다.")}</li>
            {m.freeze && <li className="text-warn">{tr(`Nykaa stopped updating rating counts on ${dayMonth(m.freeze.since)}, so buying runs to ${dayMonth(m.freeze.lastLive)}. Ranks, prices and offers are current.`, `Nykaa가 ${dayMonth(m.freeze.since)}부터 평가 수 갱신을 멈춰 구매 수치는 ${dayMonth(m.freeze.lastLive)}까지입니다. 순위·가격·프로모션은 최신입니다.`)}</li>}
            <li>{tr("Places, sponsored spots, price and offers explain why a brand won or lost; they are not added into a score.", "자리·광고·가격·프로모션은 승패의 이유를 설명할 뿐 점수에 합산하지 않습니다.")}</li>
            <li>{tr("No day is missing since 13 Sep. Categories started on different dates (7 on 13 Sep, 5 on 27 Sep, lip care on 6 Oct), so changes only count categories tracked for the whole period.", "9월 13일 이후 누락된 날은 없습니다. 카테고리별 시작일이 달라(9월 13일 7개, 9월 27일 5개, 립케어 10월 6일) 변화는 기간 내내 추적한 카테고리만 셉니다.")}</li>
          </ul>
          <p className="mt-3 text-[13px]"><a href={PLAN_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">{tr("The full explanation, with diagrams ↗", "도표로 된 전체 설명 ↗")}</a></p>
        </details>
      </section>
    </Shell>
  );
}

export default function Page() { return <AuthGate><BriefPage /></AuthGate>; }
