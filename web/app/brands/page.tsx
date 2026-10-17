"use client";

import { useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import PeriodBar from "@/components/PeriodBar";
import { Card, Loading, PageHead, Verdict, pill } from "@/components/ui";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import { Basis, Def } from "@/components/Tiered";
import { useRouter } from "next/navigation";
import { BrandLink, brandHref } from "@/components/Links";
import { ORIGIN_COLOR, ORIGIN_LABEL, norm } from "@/lib/brands";
import { CATEGORIES, CATEGORY_LABEL, compact, pct, signed } from "@/lib/format";
import { aggregate, catsOn, placesOn, uniqueFlow, type FlowRow } from "@/lib/market";
import { spanLabel } from "@/lib/period";
import { useTiers } from "@/lib/tiers";
import { useMarket } from "@/lib/useMarket";
import { dayMonth, tr } from "@/lib/i18n";

const ORIGINS = ["kbeauty", "local", "global", "unknown"] as const;
const NAV = (): NavItem[] => [
  { id: "summary", label: tr("Summary", "요약") }, { id: "origins", label: tr("Origin battle", "국적별 경쟁") },
  { id: "leaders", label: tr("Brand leaderboard", "브랜드 순위") }, { id: "movers", label: tr("Risers & fallers", "상승·하락") },
];
const pts = (v: number) => signed(v, 1).replace("%", tr(" pts", "%p"));

function OriginBar({ agg, total }: { agg: Map<string, { value: number }>; total: number }) {
  return (
    <div className="flex h-5 min-w-[220px] overflow-hidden rounded-md text-[10.5px] font-semibold">
      {ORIGINS.map((o) => { const v = (agg.get(o)?.value ?? 0) / (total || 1); return v > 0.004 ? <div key={o} title={`${ORIGIN_LABEL[o]} ${pct(v, 1)}`} style={{ width: `${v * 100}%`, background: ORIGIN_COLOR[o].fill, color: ORIGIN_COLOR[o].text }} className="grid place-items-center">{v >= 0.12 ? pct(v) : ""}</div> : null; })}
    </div>
  );
}

function BrandsPage() {
  const m = useMarket(); const router = useRouter();
  const { win, flow, prevFlow, ix, dims } = m;
  const [cat, setCat] = useState<string>("all");
  const [q, setQ] = useState(""); const [all, setAll] = useState(false);
  const known = useMemo(() => [...new Set(flow.map((r) => r.brand))], [flow]);
  const tiers = useTiers(known);

  const inCat = (r: FlowRow) => cat === "all" || r.subcategory === cat;
  const rows = useMemo(() => (cat === "all" ? uniqueFlow(flow) : flow.filter(inCat)), [flow, cat]); // eslint-disable-line react-hooks/exhaustive-deps
  const prevRows = useMemo(() => (prevFlow ? (cat === "all" ? uniqueFlow(prevFlow) : prevFlow.filter(inCat)) : null), [prevFlow, cat]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = rows.reduce((a, r) => a + r.value, 0) || 1;
  const prevTotal = prevRows ? prevRows.reduce((a, r) => a + r.value, 0) || 1 : 1;
  const byBrand = useMemo(() => aggregate(rows, (r) => r.brand), [rows]);
  const prevBrand = useMemo(() => (prevRows ? aggregate(prevRows, (r) => r.brand) : null), [prevRows]);
  const originOfBrand = useMemo(() => { const mm = new Map<string, string>(); rows.forEach((r) => mm.set(r.brand, r.origin)); return mm; }, [rows]);

  // places: like for like on the categories tracked on both days
  const places = useMemo(() => {
    if (!win) return null;
    const c0 = catsOn(ix, win.start); const c1 = catsOn(ix, win.end);
    const both = new Set([...c1].filter((c) => c0.has(c) && (cat === "all" || c === cat)));
    return { both, p0: placesOn(ix, dims, win.start, both), p1: placesOn(ix, dims, win.end, both), all: placesOn(ix, dims, win.end, cat === "all" ? undefined : new Set([cat])) };
  }, [ix, dims, win, cat]);

  const board = useMemo(() => [...byBrand.values()].map((a) => {
    const share = a.value / total; const prev = prevBrand ? (prevBrand.get(a.key)?.value ?? 0) / prevTotal : null;
    return { brand: a.key, origin: originOfBrand.get(a.key) ?? "unknown", share, change: prev === null ? null : share - prev, flow: a.flow, listings: a.listings, best: a.best,
      placesNow: places?.all.get(a.key) ?? 0, placesD: (places?.p1.get(a.key) ?? 0) - (places?.p0.get(a.key) ?? 0)};
  }).sort((a, b) => b.share - a.share), [byBrand, total, prevBrand, prevTotal, originOfBrand, places]);

  const originRows = useMemo(() => CATEGORIES.map((c) => {
    const rs = flow.filter((r) => r.subcategory === c); const tot = rs.reduce((a, r) => a + r.value, 0);
    const prs = prevFlow?.filter((r) => r.subcategory === c) ?? null; const ptot = prs?.reduce((a, r) => a + r.value, 0) ?? 0;
    const agg = aggregate(rs, (r) => r.origin); const pagg = prs ? aggregate(prs, (r) => r.origin) : null;
    const k = (agg.get("kbeauty")?.value ?? 0) / (tot || 1); const kp = pagg && ptot ? (pagg.get("kbeauty")?.value ?? 0) / ptot : null;
    const leader = [...aggregate(rs, (r) => r.brand).values()].sort((a, b) => b.value - a.value)[0];
    const kLeader = [...aggregate(rs.filter((r) => r.origin === "kbeauty"), (r) => r.brand).values()].sort((a, b) => b.value - a.value)[0];
    return { c, agg, tot, k, kChange: kp === null ? null : k - kp, leader, kLeader, slots: rs.length, kSlots: rs.filter((r) => r.origin === "kbeauty").length };
  }).sort((a, b) => b.tot - a.tot), [flow, prevFlow]);

  if (!m.ready || !win) return <Shell active="Brands"><PageHead eyebrow={tr("Brands", "브랜드")} title={tr("Who is winning on Nykaa", "Nykaa에서 누가 이기고 있나")} sub="" /><Loading what={tr("brands", "브랜드")} /></Shell>;

  const totalOrigin = aggregate(rows, (r) => r.origin);
  const top = board[0];
  const focusOnBoard = board.filter((b) => tiers.inSet(b.brand));
  const bestK = board.find((b) => b.origin === "kbeauty");
  const placeMoves = places ? [...new Set([...places.p0.keys(), ...places.p1.keys()])].map((b) => ({ b, d: (places.p1.get(b) ?? 0) - (places.p0.get(b) ?? 0), now: places.p1.get(b) ?? 0, origin: originOfBrand.get(b) ?? dims.get([...ix.byDay.get(win.end)?.values() ?? []].find((r) => dims.get(r.product_id)?.brand === b)?.product_id ?? "")?.origin ?? "unknown" })) : [];
  const risers = [...placeMoves].sort((a, b) => b.d - a.d).filter((x) => x.d > 0).slice(0, 8);
  const fallers = [...placeMoves].sort((a, b) => a.d - b.d).filter((x) => x.d < 0).slice(0, 8);
  const shareRisers = board.filter((b) => b.change !== null).sort((a, b) => b.change! - a.change!).slice(0, 8);
  const shareFallers = board.filter((b) => b.change !== null).sort((a, b) => a.change! - b.change!).slice(0, 8);

  const shown = q ? board.filter((b) => norm(b.brand).includes(norm(q))) : all ? board : board.slice(0, 25);
  const focusMissing = focusOnBoard.filter((f) => !shown.includes(f));

  // plan v2: a brand opens its own page, where everything about it sits together
  const openBrand = (brand: string) => router.push(brandHref(brand));

  return (
    <Shell active="Brands" asOf={m.latest ?? undefined}>
      <PageHead eyebrow={tr("Brands · step 3", "브랜드 · 3단계")} title={tr("Who is winning on Nykaa", "Nykaa에서 누가 이기고 있나")}
        sub={tr("Indian, Korean and global brands against each other, category by category, then every brand ranked by what shoppers bought in the period.", "인도·한국·글로벌 브랜드를 카테고리별로 비교하고, 기간 중 소비자 구매 기준으로 모든 브랜드를 순위화합니다.")}
        right={<PeriodBar shelf={win} freeze={m.freeze} />} />
      <SectionNav items={NAV()} />

      <div className="mt-6 flex flex-wrap gap-2">
        <button className={pill(cat === "all")} onClick={() => setCat("all")}>{tr("All 13 categories", "13개 카테고리 전체")}</button>
        {CATEGORIES.map((c) => <button key={c} className={pill(cat === c)} onClick={() => setCat(c)}>{CATEGORY_LABEL[c]}</button>)}
      </div>

      <section id="summary" className="mt-6 scroll-mt-32">
        <Verdict eyebrow={tr(`${cat === "all" ? "All categories" : CATEGORY_LABEL[cat]} · ${spanLabel(m.period.days)}`, `${cat === "all" ? "전체 카테고리" : CATEGORY_LABEL[cat]} · ${spanLabel(m.period.days)}`)}
          points={[
            tr(<>By origin: Indian {pct((totalOrigin.get("local")?.value ?? 0) / total)}, global {pct((totalOrigin.get("global")?.value ?? 0) / total)}, K-beauty {pct((totalOrigin.get("kbeauty")?.value ?? 0) / total)} of the value of new ratings.</>, <>국적별: 인도 {pct((totalOrigin.get("local")?.value ?? 0) / total)}, 글로벌 {pct((totalOrigin.get("global")?.value ?? 0) / total)}, K-뷰티 {pct((totalOrigin.get("kbeauty")?.value ?? 0) / total)} (신규 평가 금액 기준).</>),
            bestK ? tr(<>Strongest K-beauty brand: <b>{bestK.brand}</b>, #{board.indexOf(bestK) + 1} overall with {pct(bestK.share, 1)}.</>, <>가장 강한 K-뷰티 브랜드: <b>{bestK.brand}</b>, 전체 {board.indexOf(bestK) + 1}위 ({pct(bestK.share, 1)}).</>) : null,
            risers[0] ? tr(<>Most top-100 places gained: <b>{risers[0].b}</b> (+{risers[0].d}, now {risers[0].now}).</>, <>상위 100위 자리를 가장 많이 늘린 브랜드: <b>{risers[0].b}</b> (+{risers[0].d}, 현재 {risers[0].now}).</>) : null,
            prevFlow ? null : tr(<>No earlier {m.period.days || ""}-day period is collected yet, so share changes are not shown; pick 7 or 14 days to see them.</>, <>같은 길이의 직전 기간이 아직 없어 점유율 변화는 표시하지 않습니다. 7일 또는 14일을 고르면 보입니다.</>),
          ].filter(Boolean) as React.ReactNode[]}>
          {top ? tr(<><BrandLink brand={top.brand} className="font-semibold text-on-brand" /> leads with {pct(top.share, 1)} of shoppers&rsquo; new ratings by value, from {top.listings} top-100 listings.</>, <><BrandLink brand={top.brand} className="font-semibold text-on-brand" />가 소비자 신규 평가 금액의 {pct(top.share, 1)}로 1위입니다 (상위 100위 제품 {top.listings}개).</>) : "–"}
        </Verdict>
      </section>

      <ActionSection id="origins" kicker={tr("Origin battle", "국적별 경쟁")} title={tr("Indian vs Korean vs global, category by category", "카테고리별 인도 vs 한국 vs 글로벌")}
        note={tr(<>Each bar is one category&rsquo;s <Def k="ratingFlow">share of buying</Def> by brand origin in the {spanLabel(m.period.days)}. Sorted by the category&rsquo;s value of new ratings. Shoppers rate makeup with one tap far more often, so makeup brands weigh heavily in the all-category board: pick a category to compare like with like.</>, <>막대는 {spanLabel(m.period.days)} 동안 카테고리별 브랜드 국적의 <Def k="ratingFlow">구매 점유</Def>입니다. 카테고리 신규 평가 금액순. 메이크업은 별점만 남기는 경우가 훨씬 많아 전체 순위에서 메이크업 브랜드 비중이 큽니다. 같은 조건끼리 보려면 카테고리를 고르세요.</>)}>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              <th className="px-4 py-2.5">{tr("Category", "카테고리")}</th><th className="px-2 py-2.5">{tr("Share of buying by origin", "국적별 구매 점유")}</th>
              <th className="px-2 py-2.5">{tr("K-beauty", "K-뷰티")}</th><th className="px-2 py-2.5">{tr("Leader", "1위")}</th><th className="px-2 py-2.5">{tr("Top K-beauty brand", "K-뷰티 1위")}</th>
            </tr></thead>
            <tbody>{originRows.map((r) => (
              <tr key={r.c} className={`border-b border-line/60 last:border-0 ${cat === r.c ? "bg-accent-soft/40" : ""}`}>
                <td className="px-4 py-2.5"><button onClick={() => setCat(r.c)} className="font-medium underline decoration-line-2 underline-offset-2">{CATEGORY_LABEL[r.c]}</button></td>
                <td className="px-2 py-2.5"><OriginBar agg={r.agg} total={r.tot} /></td>
                <td className="px-2 py-2.5 tabular">{pct(r.k, 1)}{r.kChange !== null && <Basis>{pts(r.kChange)}</Basis>}<Basis>{tr(`${r.kSlots} of ${r.slots} places`, `${r.slots}자리 중 ${r.kSlots}`)}</Basis></td>
                <td className="px-2 py-2.5">{r.leader ? <><BrandLink brand={r.leader.key} /><Basis>{pct(r.leader.value / (r.tot || 1))}</Basis></> : "–"}</td>
                <td className="px-2 py-2.5">{r.kLeader ? <><BrandLink brand={r.kLeader.key} /><Basis>{pct(r.kLeader.value / (r.tot || 1))}</Basis></> : <span className="text-muted">{tr("none in top 100", "상위 100위 없음")}</span>}</td>
              </tr>))}</tbody>
          </table>
        </Card>
        <div className="mt-2 flex flex-wrap gap-3 text-[12px] text-ink-2">{ORIGINS.map((o) => <span key={o} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: ORIGIN_COLOR[o].fill }} />{ORIGIN_LABEL[o]}</span>)}</div>
      </ActionSection>

      <ActionSection id="leaders" kicker={tr("Brand leaderboard", "브랜드 순위")}
        title={top ? tr(<>{top.brand} leads {cat === "all" ? "skin & makeup" : CATEGORY_LABEL[cat].toLowerCase()}; {focusOnBoard[0]?.brand ?? "–"} is the top focus brand</>, <>{cat === "all" ? "스킨케어·메이크업" : CATEGORY_LABEL[cat]} 1위는 {top.brand}, 주요 브랜드 중 1위는 {focusOnBoard[0]?.brand ?? "–"}</>) : ""}
        note={tr(<>Share of buying in the {spanLabel(m.period.days)}; change against the period before when collected. Places: top-100 places at the end of the period; the change below is counted on the categories tracked on both days. Click a brand to open its page: its products, why they moved, offers and review trend.</>,
          <>{spanLabel(m.period.days)} 구매 점유, 직전 기간 대비 변화(수집된 경우). 자리: 기간 말 상위 100위 자리. 아래 변화는 양일 모두 추적한 카테고리 기준. 브랜드를 누르면 제품, 순위 변화 이유, 프로모션, 리뷰 추세가 있는 페이지가 열립니다.</>)}>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              <th className="px-4 py-2.5">#</th><th className="px-2 py-2.5">{tr("Brand", "브랜드")}</th><th className="px-2 py-2.5"><Def k="ratingFlow">{tr("Share of buying", "구매 점유")}</Def></th>
              <th className="px-2 py-2.5">{tr("New ratings", "신규 평가")}</th><th className="px-2 py-2.5">{tr("Places", "자리")}</th><th className="px-2 py-2.5">{tr("Best rank", "최고 순위")}</th>
            </tr></thead>
            <tbody>{[...shown, ...focusMissing].map((b) => (
              <tr key={b.brand} className={`border-b border-line/60 last:border-0 hover:bg-sunken/50 ${tiers.inSet(b.brand) ? "bg-accent-soft/30" : ""}`}>
                <td className="px-4 py-2 tabular text-muted">{board.indexOf(b) + 1}</td>
                <td className="px-2 py-2"><button onClick={() => openBrand(b.brand)} className="font-medium underline decoration-line-2 underline-offset-2 hover:decoration-ink">{b.brand}</button>
                  <span className="ml-2 rounded px-1.5 py-px text-[10px] font-semibold uppercase" style={{ background: ORIGIN_COLOR[b.origin]?.soft, color: ORIGIN_COLOR[b.origin]?.ink }}>{ORIGIN_LABEL[b.origin]}</span>
                  {tiers.inSet(b.brand) && <span className="ml-1.5 rounded bg-brand px-1.5 py-px text-[10px] font-semibold uppercase text-on-brand">{tiers.isPinned(b.brand) ? tr("anchor", "기준") : tr("focus", "주요")}</span>}</td>
                <td className="px-2 py-2 tabular"><div className="flex items-center gap-2"><span className="w-11">{pct(b.share, 1)}</span><span className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.max(2, (b.share / (top?.share || 1)) * 120)}px` }} /></div>{b.change !== null && <Basis>{pts(b.change)}</Basis>}</td>
                <td className="px-2 py-2 tabular">{compact(b.flow)}</td>
                <td className="px-2 py-2 tabular">{b.placesNow}<Basis className={b.placesD > 0 ? "text-good" : b.placesD < 0 ? "text-bad" : ""}>{b.placesD > 0 ? "+" : ""}{b.placesD} {tr(`since ${dayMonth(win.start)}`, `${dayMonth(win.start)} 대비`)}</Basis></td>
                <td className="px-2 py-2 tabular">{b.best ? `#${b.best}` : "–"}</td>
              </tr>))}</tbody>
          </table>
          <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-2.5">
            {!q && board.length > 25 && <button onClick={() => setAll(!all)} className="text-[12px] font-medium text-ink-2 underline decoration-line-2 underline-offset-2">{all ? tr("Top 25 only", "상위 25개만") : tr(`All ${board.length} brands`, `브랜드 ${board.length}개 모두`)}</button>}
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr("Find a brand", "브랜드 찾기")} className="w-56 rounded-full border border-line bg-page px-3 py-1 text-[12.5px] outline-none focus:border-accent-strong" />
            {focusMissing.length > 0 && !q && <span className="text-[12px] text-muted">{tr("Focus brands outside the top 25 are added at the end.", "상위 25위 밖의 주요 브랜드는 끝에 추가했습니다.")}</span>}
          </div>
        </Card>
      </ActionSection>

      <ActionSection id="movers" kicker={tr("Risers & fallers", "상승·하락")} title={tr(`Who gained and lost ground, ${dayMonth(win.start)} to ${dayMonth(win.end)}`, `${dayMonth(win.start)}–${dayMonth(win.end)} 상승·하락 브랜드`)}
        note={tr(`Places counted on the ${places?.both.size ?? 0} categories tracked on both days, so a category added later does not read as a gain.`, `양일 모두 추적한 ${places?.both.size ?? 0}개 카테고리 기준이라, 나중에 추가된 카테고리는 상승으로 잡히지 않습니다.`)}>
        <div className="grid gap-3 md:grid-cols-2">
          <MoverList title={tr("Most top-100 places gained", "상위 100위 자리 증가")} items={risers.map((x) => ({ brand: x.b, origin: x.origin, value: `+${x.d}`, sub: tr(`now ${x.now}`, `현재 ${x.now}`) }))} onPick={openBrand} />
          <MoverList title={tr("Most top-100 places lost", "상위 100위 자리 감소")} items={fallers.map((x) => ({ brand: x.b, origin: x.origin, value: `${x.d}`, sub: tr(`now ${x.now}`, `현재 ${x.now}`) }))} onPick={openBrand} bad />
          {prevFlow && <>
            <MoverList title={tr("Share of buying gained", "구매 점유 증가")} items={shareRisers.map((b) => ({ brand: b.brand, origin: b.origin, value: pts(b.change!), sub: pct(b.share, 1) }))} onPick={openBrand} />
            <MoverList title={tr("Share of buying lost", "구매 점유 감소")} items={shareFallers.map((b) => ({ brand: b.brand, origin: b.origin, value: pts(b.change!), sub: pct(b.share, 1) }))} onPick={openBrand} bad />
          </>}
        </div>
      </ActionSection>
    </Shell>
  );
}

function MoverList({ title, items, onPick, bad }: { title: string; items: { brand: string; origin: string; value: string; sub: string }[]; onPick: (b: string) => void; bad?: boolean }) {
  return (
    <Card className="px-5 py-4">
      <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{title}</div>
      <ul className="mt-2 divide-y divide-line/60">
        {items.length ? items.map((x) => (
          <li key={x.brand} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
            <button onClick={() => onPick(x.brand)} className="flex items-center gap-2 text-left underline decoration-line-2 underline-offset-2"><span className="h-2 w-2 rounded-full" style={{ background: ORIGIN_COLOR[x.origin]?.fill ?? "#ccc" }} />{x.brand}</button>
            <span className="tabular"><b className={bad ? "text-bad" : "text-good"}>{x.value}</b> <span className="text-[11.5px] text-muted">{x.sub}</span></span>
          </li>)) : <li className="py-2 text-[12.5px] text-muted">{tr("None in this period.", "이 기간에는 없습니다.")}</li>}
      </ul>
    </Card>
  );
}

export default function Page() { return <AuthGate><BrandsPage /></AuthGate>; }
