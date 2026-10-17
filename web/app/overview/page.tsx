"use client";

import { useMemo } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import PeriodBar from "@/components/PeriodBar";
import { Card, Loading, PageHead } from "@/components/ui";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import { Basis, Def } from "@/components/Tiered";
import { BrandLink, ProductLink } from "@/components/Links";
import { ORIGIN_LABEL, norm } from "@/lib/brands";
import { useBrandOffers, useCategoryStats, useEvents, useHomepage } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL, pct, shortName, signed } from "@/lib/format";
import { catsOn, classifyOffer, isCombo, placesOn, valueGrowth } from "@/lib/market";
import { brandShareIn, homepageDays, latestOffers, listingMoves, runsFrom, shareIn, type Context, type ListingMove } from "@/lib/profile";
import { MAKEUP_SHARE_NOTE, NYKAA_QUARTERS, NYKAA_REPORTED } from "@/lib/reference";
import { monthsLabel, spanLabel, type MonthWindow } from "@/lib/period";
import { useTiers } from "@/lib/tiers";
import { useMarket } from "@/lib/useMarket";
import { dayMonth, tr } from "@/lib/i18n";

/** The Brief (plan v2, owner 17 Oct 2026: "I want this dashboard to be talking to them... giving them an overview,
 *  telling them what they need to know, and then more if they want to dig in"). The market's growth is Nykaa's own
 *  figure for fixed quarters; our data says who is winning inside it, in sentences that each open their evidence. */

const NAV = (): NavItem[] => [
  { id: "market", label: tr("The market", "시장") }, { id: "month", label: tr("This period", "이번 기간") },
  { id: "categories", label: tr("Categories", "카테고리") }, { id: "focus", label: tr("Focus brands", "주요 브랜드") }, { id: "how", label: tr("How we know", "근거") },
];
const PLAN_URL = "https://claude.ai/artifact/EHrtxEG82NePyf1d9CJPBv";
const catName = (c: string) => CATEGORY_LABEL[c] ?? c;

function BriefPage() {
  const m = useMarket(); const stats = useCategoryStats(); const home = useHomepage(); const events = useEvents(); const offers = useBrandOffers();
  const runs = useMemo(() => runsFrom(home.data ?? []), [home.data]);
  const known = useMemo(() => [...new Set(m.shelf.map((r) => r.brand))], [m.shelf]);
  const tiers = useTiers(known);
  const ctx: Context | null = m.win ? { ix: m.ix, dims: m.dims, start: m.win.start, end: m.win.end, events: events.data ?? [], runs, offers: offers.data ?? [] } : null;
  const moves = useMemo(() => (ctx ? listingMoves(ctx, null) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [m.win, m.ix, m.dims, events.data, runs, offers.data]);

  // our review-based estimate per Nykaa quarter: kept only as a check, to show why it is not the headline
  const check = useMemo(() => {
    if (!m.ready) return [];
    return NYKAA_QUARTERS().map((q) => {
      const recent = [0, 1, 2].map((i) => { const d = new Date(`${q.start}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + i); return d.toISOString().slice(0, 10); });
      const base = recent.map((x) => `${Number(x.slice(0, 4)) - 1}${x.slice(4)}`);
      const w: MonthWindow = { recent, base, recentLabel: monthsLabel(recent), baseLabel: monthsLabel(base), compare: "yoy" };
      const g = valueGrowth(m.pool, w, m.originOf).total;
      return { q, ours: g.existing, total: g.growth, products: g.products };
    });
  }, [m.ready, m.pool, m.originOf]);

  const latestStat = useMemo(() => { const ds = [...new Set((stats.data ?? []).map((s) => s.scrape_date))].sort(); return ds[ds.length - 1] ?? null; }, [stats.data]);

  if (!m.ready || !m.win || !ctx) return <Shell active="Overview"><PageHead eyebrow={tr("Brief", "브리핑")} title={tr("What you need to know", "알아야 할 것")} sub="" /><Loading what={tr("the brief", "브리핑")} /></Shell>;

  const win = m.win; const span = m.flowSpan!;
  const oursAll = check.map((c) => c.ours).filter((x): x is number => x !== null);
  const lo = oursAll.length ? Math.min(...oursAll) : null; const hi = oursAll.length ? Math.max(...oursAll) : null;
  const quarters = NYKAA_QUARTERS(); const rep = NYKAA_REPORTED();
  const lastQ = [...quarters].reverse().find((q) => q.value !== null)!;

  /* ---------------- this period, from the shelf */
  const c0 = catsOn(m.ix, win.start); const c1 = catsOn(m.ix, win.end); const both = new Set([...c1].filter((c) => c0.has(c)));
  const p0 = placesOn(m.ix, m.dims, win.start, both); const p1 = placesOn(m.ix, m.dims, win.end, both);
  const originSlots = (day: string) => { let k = 0; let n = 0; for (const r of m.ix.byDay.get(day)?.values() ?? []) { if (!both.has(r.subcategory)) continue; n++; if (m.dims.get(r.product_id)?.origin === "kbeauty") k++; } return n ? k / n : 0; };
  const k0 = originSlots(win.start); const k1 = originSlots(win.end);
  const shelfNow = m.shelf.filter((r) => r.subcategory !== "kbeauty_store");
  const kNow = shelfNow.filter((r) => r.origin === "kbeauty").length / (shelfNow.length || 1);
  const placeMoves = [...new Set([...p0.keys(), ...p1.keys()])].map((b) => ({ b, d: (p1.get(b) ?? 0) - (p0.get(b) ?? 0), now: p1.get(b) ?? 0 }));
  const gainer = [...placeMoves].sort((a, b) => b.d - a.d)[0]; const loser = [...placeMoves].sort((a, b) => a.d - b.d)[0];
  const score = (x: ListingMove) => Math.abs(x.gain) / Math.sqrt(Math.max(1, Math.min(x.from ?? 100, x.to ?? 100)));
  const singles = moves.filter((x) => !isCombo(x.name));
  const climbers = singles.filter((x) => x.gain >= 5 && !x.entered && x.from !== null && x.to !== null).sort((a, b) => score(b) - score(a));
  const fallers = singles.filter((x) => x.gain <= -5 && !x.left && x.from !== null && x.to !== null).sort((a, b) => score(b) - score(a));
  const entries = singles.filter((x) => x.entered).sort((a, b) => (a.to ?? 999) - (b.to ?? 999));
  const focus = [...new Set([tiers.pinned, ...tiers.focus])].filter(Boolean);
  const focusRows = focus.map((b) => {
    const key = [...p1.keys(), ...p0.keys()].find((x) => norm(x) === norm(b)) ?? b;
    const today = m.shelf.filter((r) => norm(r.brand) === norm(b)).sort((x, y) => x.rank - y.rank);
    const cats = [...new Set(today.map((r) => r.subcategory))];
    const shares = cats.map((c) => ({ c, s: brandShareIn(m.flow, c, b) })).filter((x) => x.s).sort((x, y) => y.s!.share - x.s!.share);
    const own = latestOffers(offers.data ?? [], b);
    return { b, origin: m.originOf(b), now: today.length, d: (p1.get(key) ?? 0) - (p0.get(key) ?? 0), best: today[0] ?? null, top: shares[0] ?? null,
      offer: own.offers.find((o) => classifyOffer(o).brandOwn) ?? null, offersRead: !!own.day, hp: homepageDays(runs, b, win.start, win.end) };
  });
  const fUp = focusRows.filter((r) => r.d > 0).length; const fDown = focusRows.filter((r) => r.d < 0).length;
  const pinnedRow = focusRows.find((r) => norm(r.b) === norm(tiers.pinned));
  const homeDay = (home.data ?? []).reduce((a, x) => (x.scrape_date > a ? x.scrape_date : a), "");
  const liveSales = runs.filter((r) => r.end === homeDay && (r.kind === "sale" || r.kind === "campaign"));
  const featured = runs.filter((r) => r.kind === "brand" && r.end === homeDay && r.brand);

  const said: { text: React.ReactNode; href: string; go: string }[] = [];
  said.push({ href: "/brands/", go: tr("Brands", "브랜드"), text: tr(<>Korean brands hold <b>{pct(kNow, 0)}</b> of today&rsquo;s top-100 places across {c1.size} categories{both.size ? <>; on the {both.size} categories tracked all period their share went from {pct(k0, 1)} to {pct(k1, 1)}</> : null}.</>,
    <>한국 브랜드가 오늘 {c1.size}개 카테고리 상위 100위 자리의 <b>{pct(kNow, 0)}</b>를 차지{both.size ? <>. 기간 내내 추적한 {both.size}개 카테고리 기준 {pct(k0, 1)} → {pct(k1, 1)}</> : null}.</>) });
  if (gainer && gainer.d > 0) said.push({ href: `/brand/?b=${encodeURIComponent(gainer.b)}`, go: gainer.b, text: tr(<><BrandLink brand={gainer.b} className="font-semibold" /> gained the most places (+{gainer.d}, now {gainer.now}){loser && loser.d < 0 ? <>; <BrandLink brand={loser.b} className="font-semibold" /> lost the most ({loser.d})</> : null}.</>,
    <><BrandLink brand={gainer.b} className="font-semibold" />가 자리를 가장 많이 늘렸고(+{gainer.d}, 현재 {gainer.now}){loser && loser.d < 0 ? <>, <BrandLink brand={loser.b} className="font-semibold" />가 가장 많이 잃었습니다({loser.d})</> : null}.</>) });
  if (climbers[0]) { const x = climbers[0]; said.push({ href: `/product/?id=${x.product_id}&cat=${x.subcategory}`, go: tr("Product", "제품"), text: tr(<>Biggest climber: <BrandLink brand={x.brand} className="font-semibold" /> <ProductLink id={x.product_id} cat={x.subcategory}>{shortName(x.name, x.brand)}</ProductLink>, #{x.from} → #{x.to} in {catName(x.subcategory).toLowerCase()}. {x.why[0] ? <>Likely why: {x.why[0].text}.</> : "No clear cause found."}</>,
    <>가장 크게 오른 제품: <BrandLink brand={x.brand} className="font-semibold" /> <ProductLink id={x.product_id} cat={x.subcategory}>{shortName(x.name, x.brand)}</ProductLink>, {catName(x.subcategory)} #{x.from} → #{x.to}. {x.why[0] ? <>가능한 이유: {x.why[0].text}.</> : "뚜렷한 원인 없음."}</>) }); }
  if (fallers[0]) { const x = fallers[0]; said.push({ href: `/product/?id=${x.product_id}&cat=${x.subcategory}`, go: tr("Product", "제품"), text: tr(<>Biggest fall: <BrandLink brand={x.brand} className="font-semibold" /> <ProductLink id={x.product_id} cat={x.subcategory}>{shortName(x.name, x.brand)}</ProductLink>, #{x.from} → #{x.to} in {catName(x.subcategory).toLowerCase()}. {x.why[0] ? <>Likely why: {x.why[0].text}.</> : "No clear cause found."}</>,
    <>가장 크게 내린 제품: <BrandLink brand={x.brand} className="font-semibold" /> <ProductLink id={x.product_id} cat={x.subcategory}>{shortName(x.name, x.brand)}</ProductLink>, {catName(x.subcategory)} #{x.from} → #{x.to}. {x.why[0] ? <>가능한 이유: {x.why[0].text}.</> : "뚜렷한 원인 없음."}</>) }); }
  said.push({ href: "#focus", go: tr("Focus brands", "주요 브랜드"), text: tr(<>Of {focusRows.length} focus brands, <b>{fUp}</b> gained places and <b>{fDown}</b> lost{pinnedRow ? <>; <BrandLink brand={pinnedRow.b} className="font-semibold" /> {pinnedRow.d === 0 ? "held steady" : pinnedRow.d > 0 ? `gained ${pinnedRow.d}` : `lost ${-pinnedRow.d}`} ({pinnedRow.now} places now)</> : null}.</>,
    <>주요 브랜드 {focusRows.length}개 중 <b>{fUp}</b>개가 자리를 늘리고 <b>{fDown}</b>개가 잃었습니다{pinnedRow ? <>. <BrandLink brand={pinnedRow.b} className="font-semibold" />는 {pinnedRow.d === 0 ? "유지" : pinnedRow.d > 0 ? `${pinnedRow.d}자리 증가` : `${-pinnedRow.d}자리 감소`} (현재 {pinnedRow.now}자리)</> : null}.</>) });
  if (entries.length) said.push({ href: `/product/?id=${entries[0].product_id}&cat=${entries[0].subcategory}`, go: tr("Product", "제품"), text: tr(<><b>{entries.length}</b> single products entered a top 100; the highest is <BrandLink brand={entries[0].brand} className="font-semibold" /> <ProductLink id={entries[0].product_id} cat={entries[0].subcategory}>{shortName(entries[0].name, entries[0].brand)}</ProductLink> at #{entries[0].to} in {catName(entries[0].subcategory).toLowerCase()}.</>,
    <>단일 제품 <b>{entries.length}</b>개가 상위 100위에 진입. 가장 높은 제품은 {catName(entries[0].subcategory)} #{entries[0].to} <BrandLink brand={entries[0].brand} className="font-semibold" /> <ProductLink id={entries[0].product_id} cat={entries[0].subcategory}>{shortName(entries[0].name, entries[0].brand)}</ProductLink>.</>) });
  if (homeDay) said.push({ href: "/offers/", go: tr("Offers", "프로모션"), text: tr(<>On Nykaa&rsquo;s homepage ({dayMonth(homeDay)}): {liveSales.length ? <b>{liveSales.map((r) => r.label).slice(0, 3).join(", ")}</b> : "no sale banner"}{featured.length ? <>; brands featured: {featured.slice(0, 6).map((r, i) => <span key={r.target}>{i ? ", " : ""}<BrandLink brand={r.brand!} /></span>)}</> : null}.</>,
    <>Nykaa 홈페이지({dayMonth(homeDay)}): {liveSales.length ? <b>{liveSales.map((r) => r.label).slice(0, 3).join(", ")}</b> : "세일 배너 없음"}{featured.length ? <>. 노출 브랜드: {featured.slice(0, 6).map((r, i) => <span key={r.target}>{i ? ", " : ""}<BrandLink brand={r.brand!} /></span>)}</> : null}.</>) });

  /* ---------------- categories at a glance */
  const catRows = CATEGORIES.filter((c) => c1.has(c)).map((c) => {
    const today = m.shelf.filter((r) => r.subcategory === c);
    const k = today.filter((r) => r.origin === "kbeauty").length / (today.length || 1);
    const sh = shareIn(m.flow, c); const top = sh.rows[0];
    const byB = new Map<string, number>(); for (const r of sh.rows) byB.set(norm(r.brand), (byB.get(norm(r.brand)) ?? 0) + r.value);
    const top5 = [...byB.values()].sort((a, b) => b - a).slice(0, 5).reduce((a, v) => a + v, 0) / (sh.total || 1);
    const climb = climbers.find((x) => x.subcategory === c);
    const stat = (stats.data ?? []).find((s) => s.scrape_date === latestStat && s.subcategory === c);
    return { c, k, top, topShare: top && sh.total ? top.value / sh.total : null, top5: sh.total ? top5 : null, climb, brands: stat?.brands ?? null };
  });

  return (
    <Shell active="Overview" asOf={m.latest ?? undefined}>
      <PageHead eyebrow={tr("Brief · start here", "브리핑 · 여기서 시작")} title={tr("What you need to know", "알아야 할 것")}
        sub={tr("The market from Nykaa's own results, then what changed on Nykaa's shelves in plain sentences. Every name opens its own page with everything about it.", "Nykaa 실적으로 본 시장, 이어서 Nykaa 진열에서 달라진 점을 문장으로. 모든 이름을 누르면 그에 관한 전체 페이지가 열립니다.")}
        right={<PeriodBar shelf={win} freeze={m.freeze} />} />
      <SectionNav items={NAV()} />

      <ActionSection id="market" kicker={tr("The market · Nykaa's own figures", "시장 · Nykaa 발표 수치")} title={tr(`Nykaa's beauty sales grew ${signed(lastQ.value)} in ${lastQ.label}, and have grown 26–28% every quarter for a year`, `Nykaa 뷰티 매출은 ${lastQ.label} ${signed(lastQ.value)} 성장했고, 1년 내내 분기마다 26–28% 성장`)}
        note={tr("Beauty GMV against the same quarter a year earlier, from Nykaa's results. These are fixed: they belong to their quarter and do not change with the period picker.", "Nykaa 실적의 뷰티 거래액(GMV), 전년 동기 대비. 분기에 고정된 수치로 기간 선택과 무관합니다.")}>
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card className="p-5">
            <div className="flex h-[190px] items-end gap-3">
              {quarters.map((q) => (
                <div key={q.fy} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                  <span className="text-[12.5px] font-semibold tabular">{q.value !== null ? signed(q.value) : q.fy === "Q4 FY26" ? tr("late 20s", "20% 후반") : tr("due Nov", "11월 발표")}</span>
                  <div className={`w-full max-w-[56px] rounded-t-md ${q.value !== null ? "bg-[#c29a5b]" : "border border-dashed border-[#c29a5b]"}`} style={{ height: `${((q.value ?? (q.fy === "Q4 FY26" ? 0.27 : 0.005)) / 0.32) * 140}px` }} title={q.note ?? q.source} />
                  <span className="text-center text-[11px] leading-tight text-muted">{q.label}</span>
                </div>
              ))}
            </div>
            <Basis className="mt-3">{tr("Sources: ", "출처: ")}{quarters.filter((q) => q.url).map((q, i) => <span key={q.fy}>{i ? " · " : ""}<a href={q.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">{q.source}</a></span>)}. {quarters.find((q) => q.fy === "Q4 FY26")?.note}.</Basis>
          </Card>
          <div className="grid gap-3">
            {rep.slice(1).map((r) => (
              <a key={r.label + r.period} href={r.url} target="_blank" rel="noreferrer" className="lift block rounded-[16px] bg-surface px-5 py-4 shadow-card ring-1 ring-line">
                <div className="text-[12.5px] font-medium text-muted">{r.label}</div>
                <div className="mt-1 font-display text-[28px] font-semibold tabular">{signed(r.value)}</div>
                <div className="text-[12.5px] text-ink-2">{r.period} · {r.source} ↗</div>
              </a>
            ))}
            <p className="text-[12.5px] text-muted">{MAKEUP_SHARE_NOTE()}</p>
          </div>
        </div>
      </ActionSection>

      <ActionSection id="month" kicker={tr(`This period on Nykaa's shelves · ${spanLabel(m.period.days)}`, `이번 기간 Nykaa 진열 · ${spanLabel(m.period.days)}`)} title={tr("What changed, and who it matters for", "무엇이 달라졌고 누구에게 중요한가")}
        note={tr(<>From the daily top 100 in {c1.size} categories ({dayMonth(win.start)}–{dayMonth(win.end)}). Moves use the middle of the first and last three days; buying = <Def k="ratingFlow">new ratings × price</Def>{span.end < win.end ? `, to ${dayMonth(span.end)} (Nykaa froze rating counts after that)` : ""}. Combos left out.</>,
          <>{c1.size}개 카테고리의 일별 상위 100위 ({dayMonth(win.start)}–{dayMonth(win.end)}). 순위 변화는 처음·마지막 3일 중앙값 기준. 구매 = <Def k="ratingFlow">신규 평가 × 가격</Def>{span.end < win.end ? `, ${dayMonth(span.end)}까지 (이후 Nykaa가 평가 수를 멈춤)` : ""}. 콤보 제외.</>)}>
        <ol className="grid gap-2.5">
          {said.map((s, i) => (
            <li key={i} className="flex items-start gap-4 rounded-[16px] bg-surface px-5 py-4 shadow-card ring-1 ring-line">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-[12px] font-semibold text-on-brand">{i + 1}</span>
              <span className="min-w-0 flex-1 text-[15px] leading-relaxed">{s.text}</span>
              <Link href={s.href} className="hidden shrink-0 whitespace-nowrap text-[12.5px] font-medium text-accent-strong hover:underline sm:block">{s.go} →</Link>
            </li>
          ))}
        </ol>
      </ActionSection>

      <ActionSection id="categories" kicker={tr("Categories at a glance", "카테고리 한눈에")} title={tr("Who leads each category, and how concentrated it is", "카테고리별 선두와 집중도")}
        note={tr(<>Brands on Nykaa: Nykaa&rsquo;s own brand filter{latestStat ? ` on ${dayMonth(latestStat)}` : ""}. Korean share: of today&rsquo;s top-100 places. Top seller and top 5: share of the category&rsquo;s buying, single products. Click a category for its full page.</>,
          <>Nykaa 입점 브랜드: Nykaa 브랜드 필터{latestStat ? ` (${dayMonth(latestStat)})` : ""}. 한국 비중: 오늘 상위 100위 자리 중. 최다 판매·상위 5개: 카테고리 구매 점유, 단일 제품. 카테고리를 누르면 전체 페이지가 열립니다.</>)}>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Category", "카테고리")}</th><th className="px-2">{tr("Brands on Nykaa", "입점 브랜드")}</th><th className="px-2">{tr("Korean share of places", "한국 자리 비중")}</th><th className="px-2">{tr("Top seller", "최다 판매")}</th><th className="px-2">{tr("Top 5 brands hold", "상위 5개 브랜드")}</th><th className="px-2 pr-4">{tr("Biggest climber", "최대 상승")}</th></tr></thead>
            <tbody>{catRows.map((r) => (
              <tr key={r.c} className="border-b border-line/60 align-top">
                <td className="px-4 py-2.5 font-medium"><Link href={`/categories/?cat=${r.c}`} className="underline decoration-line-2 underline-offset-2 hover:decoration-ink">{catName(r.c)}</Link></td>
                <td className="px-2 py-2.5 tabular">{r.brands ?? "–"}</td>
                <td className="px-2 py-2.5 tabular">{pct(r.k, 0)}</td>
                <td className="max-w-[280px] px-2 py-2.5">{r.top ? <><BrandLink brand={r.top.brand} className="font-medium" /> <ProductLink id={r.top.product_id} cat={r.c}>{shortName(r.top.name, r.top.brand)}</ProductLink> <span className="text-muted tabular">{pct(r.topShare, 1)}</span></> : "–"}</td>
                <td className="px-2 py-2.5 tabular">{r.top5 !== null ? pct(r.top5, 0) : "–"}</td>
                <td className="max-w-[260px] px-2 py-2.5 pr-4">{r.climb ? <><BrandLink brand={r.climb.brand} className="font-medium" /> <ProductLink id={r.climb.product_id} cat={r.c}>{shortName(r.climb.name, r.climb.brand)}</ProductLink> <span className="text-good tabular">#{r.climb.from}→#{r.climb.to}</span></> : <span className="text-muted">–</span>}</td>
              </tr>))}</tbody>
          </table>
        </Card>
      </ActionSection>

      <ActionSection id="focus" kicker={tr("Focus brands", "주요 브랜드")} title={tr(`${fUp} of ${focusRows.length} focus brands gained places, ${fDown} lost`, `주요 브랜드 ${focusRows.length}개 중 ${fUp}개 자리 증가, ${fDown}개 감소`)}
        note={tr("Places today in any top 100, the change on categories tracked on both days, the highest listing, where the brand takes the biggest slice of buying, its own offer and homepage days. Click a brand for everything about it.", "오늘 상위 100위 자리, 양일 추적 카테고리 기준 변화, 최고 순위 제품, 구매 점유가 가장 큰 카테고리, 자체 프로모션, 홈페이지 노출일. 브랜드를 누르면 전체 정보가 열립니다.")}>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Brand", "브랜드")}</th><th className="px-2">{tr("Places", "자리")}</th><th className="px-2">{tr("Change", "변화")}</th><th className="px-2">{tr("Highest listing", "최고 순위 제품")}</th><th className="px-2">{tr("Biggest slice of buying", "최대 구매 점유")}</th><th className="px-2">{tr("Own offer", "자체 프로모션")}</th><th className="px-2 pr-4">{tr("Homepage days", "홈페이지")}</th></tr></thead>
            <tbody>{focusRows.sort((a, b) => b.now - a.now).map((r) => (
              <tr key={r.b} className="border-b border-line/60 align-top">
                <td className="px-4 py-2.5"><BrandLink brand={r.b} className="font-semibold" /><div className="text-[11.5px] text-muted">{ORIGIN_LABEL[r.origin] ?? r.origin}</div></td>
                <td className="px-2 py-2.5 tabular">{r.now}</td>
                <td className={`px-2 py-2.5 tabular ${r.d > 0 ? "text-good" : r.d < 0 ? "text-bad" : "text-muted"}`}>{r.d > 0 ? `+${r.d}` : r.d < 0 ? r.d : "="}</td>
                <td className="max-w-[260px] px-2 py-2.5">{r.best ? <><ProductLink id={r.best.product_id} cat={r.best.subcategory}>{shortName(r.best.name, r.b)}</ProductLink> <span className="text-muted">#{r.best.rank} {catName(r.best.subcategory).toLowerCase()}</span></> : <span className="text-muted">{tr("none in a top 100", "상위 100위 없음")}</span>}</td>
                <td className="px-2 py-2.5">{r.top ? <>{pct(r.top.s!.share, 1)} <span className="text-muted">{catName(r.top.c).toLowerCase()}, #{r.top.s!.place}</span></> : "–"}</td>
                <td className="max-w-[220px] px-2 py-2.5 text-[12.5px]">{r.offer ? (r.offer.description || r.offer.title || "").replace(/\s+/g, " ").slice(0, 60) : <span className="text-muted">{r.offersRead ? tr("none", "없음") : tr("not read", "미수집")}</span>}</td>
                <td className="px-2 py-2.5 pr-4 tabular">{r.hp || <span className="text-muted">0</span>}</td>
              </tr>))}</tbody>
          </table>
        </Card>
      </ActionSection>

      <ActionSection id="how" kicker={tr("How we know", "근거")} title={tr("What each number is made of", "각 수치의 구성")}
        note={<>{tr("The full explanation, with diagrams: ", "도표로 된 전체 설명: ")}<a href={PLAN_URL} target="_blank" rel="noreferrer" className="underline underline-offset-2">{tr("how the numbers work ↗", "수치 계산 방법 ↗")}</a></>}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5 text-[13.5px] leading-relaxed">
            <ul className="list-disc space-y-2 pl-5">
              <li>{tr(<><b>Market growth</b> is Nykaa&rsquo;s reported figure for a fixed quarter. Our reviews can&rsquo;t measure it: a product collects fewer reviews as it ages, and new launches swing the total (see the check on the right).</>, <><b>시장 성장률</b>은 고정된 분기의 Nykaa 발표 수치입니다. 리뷰로는 측정할 수 없습니다: 제품은 나이가 들수록 리뷰가 줄고, 신제품이 합계를 흔듭니다 (오른쪽 점검 참고).</>)}</li>
              <li>{tr(<><b>Share of buying</b>: ratings each top-100 listing gained in the period × its price, as a share of its category. Fair within a category, not across (people rate a lipstick more readily than a serum). Combos are left out because Nykaa gives them their contents&rsquo; ratings.</>, <><b>구매 점유</b>: 기간 중 상위 100위 제품이 얻은 평가 × 가격, 카테고리 내 비중. 카테고리 안에서만 공정합니다. 콤보는 구성품 평가를 합쳐 보여주므로 제외합니다.</>)}</li>
              {m.freeze && <li className="text-warn">{tr(<><b>Nykaa froze rating counts</b> from {dayMonth(m.freeze.since)}: its own pages still show the {dayMonth(m.freeze.lastLive)} count. Buying runs to {dayMonth(m.freeze.lastLive)} until Nykaa resumes.</>, <><b>Nykaa가 {dayMonth(m.freeze.since)}부터 평가 수 갱신을 멈췄습니다</b>. 재개될 때까지 구매 수치는 {dayMonth(m.freeze.lastLive)}까지입니다.</>)}</li>}
              <li>{tr(<><b>Rank moves</b>: the middle of the first three days to the middle of the last three, because single days jump (one cream went between #1 and #100 in a fortnight). Reasons are checked in order: price cut, paid slot, offer tag, stock, homepage or sale, ratings burst, rivals dropping out; otherwise &ldquo;no clear cause&rdquo;.</>, <><b>순위 변화</b>: 처음 3일 중앙값 → 마지막 3일 중앙값. 이유는 가격 인하, 광고, 프로모션, 재고, 홈페이지·세일, 평가 급증, 경쟁 이탈 순으로 확인하고, 없으면 &ldquo;뚜렷한 원인 없음&rdquo;.</>)}</li>
              <li>{tr(<><b>Reviews</b> are each brand&rsquo;s and product&rsquo;s own trend (latest 3 months vs the same months a year earlier), shown on their pages, never added up into a market figure.</>, <><b>리뷰</b>는 브랜드·제품 자체의 추세(최근 3개월 vs 1년 전 같은 달)로 각 페이지에 표시하며, 시장 수치로 합산하지 않습니다.</>)}</li>
            </ul>
          </Card>
          <Card className="p-5">
            <div className="text-[13.5px] font-semibold">{tr("Check: our review-based estimate against Nykaa, same quarters", "점검: 리뷰 기반 추정치 vs Nykaa, 같은 분기")}</div>
            <table className="mt-3 w-full text-[13px]">
              <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="py-2">{tr("Quarter", "분기")}</th><th className="px-2">Nykaa</th><th className="px-2"><Def k="valueGrowth">{tr("Ours, like for like", "우리 추정(동일 제품)")}</Def></th><th className="px-2">{tr("Ours, all products", "우리 추정(전체)")}</th></tr></thead>
              <tbody>{check.map((c) => (
                <tr key={c.q.fy} className="border-b border-line/60"><td className="py-1.5">{c.q.label}</td><td className="px-2 tabular">{c.q.value !== null ? signed(c.q.value) : "–"}</td><td className={`px-2 tabular ${c.ours !== null && c.ours < 0 ? "text-bad" : ""}`}>{signed(c.ours)}</td><td className="px-2 tabular text-ink-2">{signed(c.total)}</td></tr>))}</tbody>
            </table>
            <p className="mt-3 text-[12.5px] text-muted">{tr(`The like-for-like line swings from ${signed(lo)} to ${signed(hi)} while Nykaa holds at 26–28%, and the all-products line swings with launches. Neither tracks the market, which is why the market figure is Nykaa's own.`, `동일 제품 기준은 ${signed(lo)}에서 ${signed(hi)}까지 흔들리는 반면 Nykaa는 26–28%를 유지하고, 전체 제품 기준은 신제품 출시에 따라 흔들립니다. 둘 다 시장을 따라가지 못하므로 시장 수치는 Nykaa 발표를 씁니다.`)}</p>
          </Card>
        </div>
      </ActionSection>
    </Shell>
  );
}

export default function Page() { return <AuthGate><BriefPage /></AuthGate>; }
