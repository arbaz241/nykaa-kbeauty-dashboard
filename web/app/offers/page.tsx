"use client";

import { useMemo } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import PeriodBar from "@/components/PeriodBar";
import EventLog from "@/components/EventLog";
import LineChart from "@/components/LineChart";
import { Card, Loading, PageHead, Verdict } from "@/components/ui";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import { Basis } from "@/components/Tiered";
import { ORIGIN_COLOR, ORIGIN_LABEL } from "@/lib/brands";
import { useBrandOffers, useEvents, useHomepage } from "@/lib/data";
import { median, pct } from "@/lib/format";
import { classifyOffer, eventsBetween, homepageRuns, offerDepth, OFFER_KIND_LABEL, type OfferKind } from "@/lib/market";
import { spanLabel } from "@/lib/period";
import { useTiers } from "@/lib/tiers";
import { useMarket } from "@/lib/useMarket";
import { dayMonth, tr } from "@/lib/i18n";
import type { BrandOffer } from "@/lib/types";

const NAV = (): NavItem[] => [
  { id: "summary", label: tr("In one line", "요약") }, { id: "discounts", label: tr("Who discounts most", "할인 깊이") }, { id: "cuts", label: tr("Price cuts in the period", "기간 중 가격 인하") },
  { id: "calendar", label: tr("Sales calendar", "세일 캘린더") }, { id: "offers", label: tr("Brand offers", "브랜드 프로모션") },
  { id: "tags", label: tr("Offers on the shelf", "진열 프로모션") }, { id: "effect", label: tr("Do offers move rank?", "프로모션 효과") }, { id: "events", label: tr("Event log", "이벤트 기록") },
];
const KIND_CHIP: Record<OfferKind, string> = { percent: "bg-[#e9eff5] text-[#3d5670]", bogo: "bg-[#e4f0eb] text-[#1f5646]", gift: "bg-[#faefe2] text-[#8a5a22]", members: "bg-sunken text-muted", other: "bg-sunken text-muted" };

function OffersPage() {
  const m = useMarket(); const offers = useBrandOffers(); const home = useHomepage(); const events = useEvents();
  const { win, ix, dims } = m;
  const tiers = useTiers(useMemo(() => [...new Set((offers.data ?? []).map((o) => o.brand))], [offers.data]));

  const offerDays = useMemo(() => [...new Set((offers.data ?? []).map((o) => o.scrape_date))].sort(), [offers.data]);
  const today = offerDays[offerDays.length - 1];
  const runs = useMemo(() => homepageRuns(home.data ?? []), [home.data]);

  // brand offers on the latest night, with how many nights in the period each brand ran one
  const brands = useMemo(() => {
    const by = new Map<string, BrandOffer[]>();
    for (const o of offers.data ?? []) { if (!by.has(o.brand)) by.set(o.brand, []); by.get(o.brand)!.push(o); }
    return [...by.entries()].map(([brand, os]) => {
      const now = os.filter((o) => o.scrape_date === today && o.offer_id !== "none");
      const checked = new Set(os.filter((o) => !win || o.scrape_date >= win.start).map((o) => o.scrape_date));
      const withOffer = new Set(os.filter((o) => o.offer_id !== "none" && (!win || o.scrape_date >= win.start)).map((o) => o.scrape_date));
      const cls = now.map((o) => ({ o, ...classifyOffer(o), depth: offerDepth(o) }));
      return { brand, origin: m.originOf(brand), now: cls, own: cls.filter((c) => c.brandOwn), depth: Math.max(0, ...cls.filter((c) => c.brandOwn).map((c) => c.depth)), nights: withOffer.size, checked: checked.size };
    }).sort((a, b) => Number(tiers.inSet(b.brand)) - Number(tiers.inSet(a.brand)) || b.own.length - a.own.length || a.brand.localeCompare(b.brand));
  }, [offers.data, today, win, m, tiers]);

  // offer tags on the top-100 listings, by origin, day by day (collected since 13 Sep)
  const tagSeries = useMemo(() => {
    if (!win) return null;
    const out: Record<string, number[]> = { kbeauty: [], local: [], global: [] };
    for (const d of win.days) {
      const rs = [...(ix.byDay.get(d)?.values() ?? [])].filter((r) => r.subcategory !== "kbeauty_store");
      for (const o of Object.keys(out)) {
        const g = rs.filter((r) => (dims.get(r.product_id)?.origin ?? "unknown") === o);
        out[o].push(g.length ? (g.filter((r) => r.has_offer).length / g.length) * 100 : 0);
      }
    }
    return out;
  }, [ix, dims, win]);

  // does an offer tag lift rank? listings whose tag switched on, rank the day before vs three collected days later,
  // against every other listing over the same spans
  const effect = useMemo(() => {
    if (!win) return null;
    const flips: number[] = []; const others: number[] = [];
    for (const [, s] of ix.series) {
      const inWin = s.filter((r) => r.scrape_date >= win.start && r.subcategory !== "kbeauty_store");
      for (let i = 1; i + 3 < inWin.length; i++) {
        const before = inWin[i - 1]; const after = inWin[i + 3];
        const d = before.rank - after.rank; // positive = moved up
        if (!before.has_offer && inWin[i].has_offer) flips.push(d); else if (i % 4 === 1) others.push(d);
      }
    }
    const up = (xs: number[]) => (xs.length ? xs.filter((x) => x > 0).length / xs.length : null);
    return { n: flips.length, med: median(flips), up: up(flips), baseMed: median(others), baseUp: up(others), baseN: others.length };
  }, [ix, win]);

  // discount depth today: how far below the printed price each top-100 listing sells, by origin and by brand
  const disc = useMemo(() => {
    const rows = m.shelf.filter((r) => r.subcategory !== "kbeauty_store" && r.price && r.mrp);
    const d = (r: (typeof rows)[number]) => (r.mrp! > r.price! ? 1 - r.price! / r.mrp! : 0);
    const byOrigin = Object.fromEntries((["kbeauty", "local", "global"] as const).map((o) => { const xs = rows.filter((r) => r.origin === o).map(d); return [o, { med: median(xs) ?? 0, n: xs.length, none: xs.filter((x) => x < 0.01).length / (xs.length || 1) }]; }));
    const catMed = new Map<string, number>(); for (const c of new Set(rows.map((r) => r.subcategory))) catMed.set(c, median(rows.filter((r) => r.subcategory === c).map(d)) ?? 0);
    const by = new Map<string, { brand: string; origin: string; xs: number[]; rel: number[] }>();
    for (const r of rows) { const k = r.brand; const c = by.get(k) ?? { brand: k, origin: r.origin, xs: [], rel: [] }; c.xs.push(d(r)); c.rel.push(d(r) - (catMed.get(r.subcategory) ?? 0)); by.set(k, c); }
    const brands = [...by.values()].filter((b) => b.xs.length >= 3).map((b) => ({ ...b, med: median(b.xs) ?? 0, rel: median(b.rel) ?? 0 }));
    return { byOrigin, deepest: [...brands].sort((a, b) => b.med - a.med).slice(0, 8), shallowest: [...brands].sort((a, b) => a.med - b.med).slice(0, 8), all: brands };
  }, [m.shelf]);
  // price changes in the period: listings on the shelf at both ends with the same printed price
  const cuts = useMemo(() => {
    if (!win) return null;
    const by = new Map<string, { brand: string; origin: string; cut: number; raised: number; listings: number }>();
    const byO = new Map<string, { cut: number; raised: number; n: number }>();
    for (const [k, s] of ix.series) {
      if (k.startsWith("kbeauty_store|")) continue;
      const inW = s.filter((r) => r.scrape_date >= win.start && r.scrape_date <= win.end);
      const a = inW[0]; const b = inW[inW.length - 1];
      if (!a || !b || a === b || !a.price || !b.price || a.mrp !== b.mrp) continue;
      const dim = dims.get(b.product_id); const brand = dim?.brand ?? "?"; const origin = dim?.origin ?? "unknown";
      const ch = b.price / a.price - 1;
      const c = by.get(brand) ?? { brand, origin, cut: 0, raised: 0, listings: 0 }; c.listings++;
      const o = byO.get(origin) ?? { cut: 0, raised: 0, n: 0 }; o.n++;
      if (ch <= -0.05) { c.cut++; o.cut++; } else if (ch >= 0.05) { c.raised++; o.raised++; }
      by.set(brand, c); byO.set(origin, o);
    }
    return { brands: [...by.values()].filter((x) => x.cut + x.raised > 0).sort((a, b) => b.cut - a.cut || b.raised - a.raised).slice(0, 12), byO };
  }, [ix, dims, win]);

  if (!m.ready || !win || !offers.data || !home.data) return <Shell active="Offers"><PageHead eyebrow={tr("Offers & events", "프로모션·이벤트")} title={tr("What Nykaa and the brands are running", "Nykaa와 브랜드의 프로모션")} sub="" /><Loading what={tr("offers and events", "프로모션·이벤트")} /></Shell>;

  // plan v3: one table, no scope switch; the main brands and brands with their own offer first
  const shown = [...brands].sort((a, b) => Number(b.own.length > 0) - Number(a.own.length > 0) || Number(tiers.inSet(b.brand)) - Number(tiers.inSet(a.brand)) || a.brand.localeCompare(b.brand));
  const running = brands.filter((b) => b.own.length);
  const kRunning = running.filter((b) => b.origin === "kbeauty");
  const latestHome = (home.data ?? []).reduce((a, x) => (x.scrape_date > a ? x.scrape_date : a), "");
  const liveSales = runs.filter((r) => r.end === latestHome && (r.kind === "sale" || r.kind === "campaign"));
  const evs = eventsBetween(events.data ?? [], win.start, win.end);

  // the calendar: one row per event or homepage run, across the period's days
  const calRows = [
    ...evs.map((e) => ({ label: e.label, start: e.happened_on, end: e.ends_on ?? e.happened_on, color: "#b4532a", tag: e.status === "estimated" ? tr("estimated", "추정") : tr("logged", "기록") })),
    ...runs.filter((r) => r.end >= win.start && r.kind !== "brand").map((r) => ({ label: r.label, start: r.start, end: r.end, color: r.kind === "sale" ? "#b4532a" : "#2a78d6", tag: tr("homepage", "홈페이지") })),
    ...runs.filter((r) => r.end >= win.start && r.kind === "brand").map((r) => ({ label: r.label, start: r.start, end: r.end, color: "#e87ba4", tag: tr("brand banner", "브랜드 배너") })),
  ];
  const dayIdx = (d: string) => Math.max(0, Math.min(win.days.length - 1, win.days.findIndex((x) => x >= d) === -1 ? win.days.length - 1 : win.days.findIndex((x) => x >= d)));

  return (
    <Shell active="Offers" asOf={m.latest ?? undefined}>
      <PageHead eyebrow={tr("Offers & events", "프로모션·이벤트")} title={tr("What Nykaa and the brands are running", "Nykaa와 브랜드가 진행 중인 것")}
        sub={tr("Nykaa's sales and homepage banners, read every night, and the offers each brand runs, so a move on the shelf can be read against them.", "매일 밤 수집한 Nykaa 세일·홈페이지 배너와 브랜드별 프로모션. 진열 순위 변화를 이것과 함께 읽을 수 있습니다.")}
        right={<PeriodBar shelf={win} freeze={m.freeze} />} />
      <SectionNav items={NAV()} />

      <section id="summary" className="mt-8 scroll-mt-32">
        <Verdict eyebrow={tr(`In one line · ${spanLabel(m.period.days)}`, `요약 · ${spanLabel(m.period.days)}`)}
          points={[
            tr(<>Typical discount on today&rsquo;s top 100: Indian brands <b>{pct(disc.byOrigin.local.med)}</b> off the printed price, global <b>{pct(disc.byOrigin.global.med)}</b>, Korean <b>{pct(disc.byOrigin.kbeauty.med)}</b>.</>, <>오늘 상위 100위 일반 할인율: 인도 <b>{pct(disc.byOrigin.local.med)}</b>, 글로벌 <b>{pct(disc.byOrigin.global.med)}</b>, 한국 <b>{pct(disc.byOrigin.kbeauty.med)}</b>.</>),
            cuts ? tr(<>Over the period, {cuts.byO.get("kbeauty")?.cut ?? 0} Korean, {cuts.byO.get("local")?.cut ?? 0} Indian and {cuts.byO.get("global")?.cut ?? 0} global listings were sold at least 5% cheaper by the end{cuts.brands[0] ? <>; {cuts.brands[0].brand} cut the most ({cuts.brands[0].cut})</> : null}.</>, <>기간 중 5% 이상 싸게 팔린 제품: 한국 {cuts.byO.get("kbeauty")?.cut ?? 0}, 인도 {cuts.byO.get("local")?.cut ?? 0}, 글로벌 {cuts.byO.get("global")?.cut ?? 0}개{cuts.brands[0] ? <>. 가장 많이 내린 브랜드: {cuts.brands[0].brand} ({cuts.brands[0].cut})</> : null}.</>) : null,
            effect && effect.n ? tr(<>When an offer starts on a product it rises in {pct(effect.up)} of cases, against {pct(effect.baseUp)} for products without one.</>, <>프로모션이 시작되면 {pct(effect.up)}의 경우 순위 상승 (없는 제품 {pct(effect.baseUp)}).</>) : null,
            liveSales.length ? tr(<>Live on Nykaa&rsquo;s homepage: <b>{liveSales.map((r) => r.label).join(", ")}</b>.</>, <>Nykaa 홈페이지 진행 중: <b>{liveSales.map((r) => r.label).join(", ")}</b>.</>) : null,
            tr(<>Brand offers and the homepage are read nightly since 17 Oct ({offerDays.length} night{offerDays.length === 1 ? "" : "s"} so far), so their trends appear after about two weeks. Prices and offer tags go back to 13 Sep.</>, <>브랜드 프로모션과 홈페이지는 10월 17일부터 매일 수집(지금까지 {offerDays.length}일)하므로 추세는 약 2주 후에 보입니다. 가격과 프로모션 표시는 9월 13일부터 있습니다.</>),
          ].filter(Boolean) as React.ReactNode[]}>
          {(() => { const os = (["kbeauty", "local", "global"] as const).map((o) => ({ o, v: disc.byOrigin[o].med })).sort((a, b) => a.v - b.v); const lo = os[0]; const hi = os[os.length - 1];
            const tie = os.filter((x) => Math.round(x.v * 100) === Math.round(lo.v * 100)).map((x) => ORIGIN_LABEL[x.o]).join(tr(" and ", "·"));
            return tr(<>{tie} brands discount least ({pct(lo.v)} off the printed price) and {ORIGIN_LABEL[hi.o]} brands most ({pct(hi.v)}); {running.length} of the {brands.length} brands we check run an offer of their own ({kRunning.length} Korean).</>,
              <>{tie} 브랜드가 가장 적게({pct(lo.v)}), {ORIGIN_LABEL[hi.o]} 브랜드가 가장 많이({pct(hi.v)}) 할인합니다. 확인한 {brands.length}개 브랜드 중 {running.length}개가 자체 프로모션 진행 (한국 {kRunning.length}개).</>); })()}
        </Verdict>
      </section>

      <ActionSection id="discounts" kicker={tr("Who discounts most", "할인 깊이")} title={tr(`${disc.deepest[0]?.brand ?? "–"} sells deepest below its printed price (${pct(disc.deepest[0]?.med ?? 0)} off, typical across its listings)`, `정가 대비 가장 깊게 할인하는 브랜드: ${disc.deepest[0]?.brand ?? "–"} (일반 ${pct(disc.deepest[0]?.med ?? 0)})`)}
        note={tr("Discount = how far the selling price is below the printed price (MRP) on today's top-100 listings. Typical = the middle value of a brand's listings (3 or more). \"vs category\" compares each listing with the middle discount of its own category.", "할인 = 오늘 상위 100위 제품의 정가(MRP) 대비 판매가 차이. 일반 = 브랜드 제품(3개 이상)의 중앙값. \"카테고리 대비\"는 각 제품을 해당 카테고리 중앙값과 비교합니다.")}>
        <div className="grid gap-3 md:grid-cols-3">
          {(["kbeauty", "local", "global"] as const).map((o) => (
            <Card key={o} className="px-5 py-4"><div className="text-[12.5px] text-muted">{ORIGIN_LABEL[o]}</div><div className="mt-1 font-display text-[28px] font-semibold tabular">{pct(disc.byOrigin[o].med)}</div>
              <Basis>{tr(`typical discount · ${pct(disc.byOrigin[o].none)} of ${disc.byOrigin[o].n} listings sell at the printed price`, `일반 할인율 · ${disc.byOrigin[o].n}개 중 ${pct(disc.byOrigin[o].none)}는 정가 판매`)}</Basis></Card>))}
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {[{ t: tr("Deepest discounts", "할인이 가장 깊은 브랜드"), rows: disc.deepest }, { t: tr("Closest to the printed price", "정가에 가장 가까운 브랜드"), rows: disc.shallowest }].map((g) => (
            <Card key={g.t} className="px-5 py-4">
              <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">{g.t}</div>
              <ul className="mt-2 divide-y divide-line/60">{g.rows.map((b) => (
                <li key={b.brand} className="flex items-center justify-between gap-3 py-1.5 text-[13px]"><span><b className="font-medium">{b.brand}</b> <span className="rounded px-1.5 py-px text-[10px] font-semibold uppercase" style={{ background: ORIGIN_COLOR[b.origin]?.soft, color: ORIGIN_COLOR[b.origin]?.ink }}>{ORIGIN_LABEL[b.origin]}</span></span>
                  <span className="tabular"><b>{pct(b.med)}</b> <span className="text-[11.5px] text-muted">{tr(`${b.rel >= 0 ? "+" : ""}${Math.round(b.rel * 100)} pts vs category · ${b.xs.length} listings`, `카테고리 대비 ${b.rel >= 0 ? "+" : ""}${Math.round(b.rel * 100)}%p · ${b.xs.length}개`)}</span></span></li>))}</ul>
            </Card>))}
        </div>
      </ActionSection>

      {cuts && <ActionSection id="cuts" kicker={tr("Price cuts in the period", "기간 중 가격 인하")} title={cuts.brands[0] ? tr(`${cuts.brands[0].brand} cut the price on the most listings (${cuts.brands[0].cut})`, `가장 많은 제품 가격을 내린 브랜드: ${cuts.brands[0].brand} (${cuts.brands[0].cut}개)`) : tr("No price cuts of 5% or more in the period", "기간 중 5% 이상 가격 인하 없음")}
        note={tr(`Listings on the shelf at the start and end of the ${spanLabel(m.period.days)} with the same printed price, sold at least 5% cheaper (cut) or dearer (raised) by the end. A changed printed price means a new pack, so it is left out.`, `${spanLabel(m.period.days)} 시작과 끝에 모두 있고 정가가 같은 제품 중 판매가가 5% 이상 내리거나(인하) 오른(인상) 제품. 정가가 바뀌면 새 포장이므로 제외합니다.`)}>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.08em] text-muted"><th className="px-4 py-2.5">{tr("Brand", "브랜드")}</th><th className="px-2">{tr("Sold cheaper", "인하")}</th><th className="px-2">{tr("Sold dearer", "인상")}</th><th className="px-2 pr-4">{tr("Listings checked", "확인 제품")}</th></tr></thead>
            <tbody>{cuts.brands.map((b) => (
              <tr key={b.brand} className="border-b border-line/60 last:border-0"><td className="px-4 py-2 font-medium">{b.brand} <span className="rounded px-1.5 py-px text-[10px] font-semibold uppercase" style={{ background: ORIGIN_COLOR[b.origin]?.soft, color: ORIGIN_COLOR[b.origin]?.ink }}>{ORIGIN_LABEL[b.origin]}</span></td><td className="px-2 py-2 tabular text-good">{b.cut || "–"}</td><td className="px-2 py-2 tabular text-bad">{b.raised || "–"}</td><td className="px-2 py-2 pr-4 tabular">{b.listings}</td></tr>))}</tbody>
          </table>
        </Card>
      </ActionSection>}

      <ActionSection id="calendar" kicker={tr("Sales calendar", "세일 캘린더")} title={tr(`What ran in the ${spanLabel(m.period.days)}`, `${spanLabel(m.period.days)} 진행된 것`)}
        note={tr("Sales and campaigns from Nykaa's homepage (read nightly), brand banners in its carousel, and the event log below. Past sales from deal-site calendars stay marked estimated until confirmed.", "Nykaa 홈페이지(매일 수집)의 세일·캠페인, 배너 속 브랜드, 아래 이벤트 기록. 딜 사이트 달력에서 가져온 과거 세일은 확인 전까지 추정으로 표시합니다.")}>
        <Card className="overflow-x-auto px-4 py-4">
          <div className="min-w-[760px]">
            <div className="ml-[220px] flex justify-between text-[11px] text-muted"><span>{dayMonth(win.start)}</span><span>{dayMonth(win.days[Math.floor(win.days.length / 2)])}</span><span>{dayMonth(win.end)}</span></div>
            {calRows.length ? calRows.map((r, i) => {
              const a = dayIdx(r.start); const b = dayIdx(r.end); const n = Math.max(1, win.days.length - 1);
              return (
                <div key={i} className="mt-1.5 flex items-center gap-3 text-[12.5px]">
                  <div className="w-[208px] shrink-0 truncate" title={r.label}>{r.label} <span className="text-[10.5px] uppercase text-muted">{r.tag}</span></div>
                  <div className="relative h-4 flex-1 rounded bg-sunken">
                    <div className="absolute top-0 h-4 rounded" style={{ left: `${(a / n) * 100}%`, width: `${Math.max(1.2, ((b - a) / n) * 100)}%`, background: r.color }} title={`${dayMonth(r.start)} – ${dayMonth(r.end)}`} />
                  </div>
                </div>
              );
            }) : <p className="text-[13px] text-muted">{tr("Nothing logged or seen on the homepage in this period.", "이 기간에 기록되거나 홈페이지에서 본 이벤트가 없습니다.")}</p>}
          </div>
        </Card>
      </ActionSection>

      <ActionSection id="offers" kicker={tr("Brand offers", "브랜드 프로모션")} title={tr(`${running.length} brands are running their own offer`, `${running.length}개 브랜드가 자체 프로모션 진행 중`)}
        note={tr(<>From each brand&rsquo;s Nykaa product page on {today ? dayMonth(today) : "–"}. <b>Brand offer</b> = run on that brand; <b>Nykaa-wide</b> = a category, Luxe, members or new-customer offer that also shows on its page. Nights with an offer count from 17 Oct.</>, <>{today ? dayMonth(today) : "–"} 각 브랜드 Nykaa 제품 페이지 기준. <b>브랜드 프로모션</b> = 해당 브랜드 행사, <b>Nykaa 전체</b> = 카테고리·Luxe·회원·신규 고객 행사가 페이지에 함께 표시된 것. 프로모션 일수는 10월 17일부터 셉니다.</>)}
>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-[13px]">
            <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              <th className="px-4 py-2.5">{tr("Brand", "브랜드")}</th><th className="px-2 py-2.5">{tr("Brand offers tonight", "오늘 브랜드 프로모션")}</th><th className="px-2 py-2.5">{tr("Nykaa-wide", "Nykaa 전체")}</th>
              <th className="px-2 py-2.5">{tr("Deepest", "최대")}</th><th className="px-2 py-2.5">{tr("Nights with an offer", "프로모션 일수")}</th>
            </tr></thead>
            <tbody>{shown.map((b) => (
              <tr key={b.brand} className={`border-b border-line/60 align-top last:border-0 ${tiers.inSet(b.brand) ? "bg-accent-soft/30" : ""}`}>
                <td className="px-4 py-2.5 font-medium">{b.brand}<div><span className="rounded px-1.5 py-px text-[10px] font-semibold uppercase" style={{ background: ORIGIN_COLOR[b.origin]?.soft, color: ORIGIN_COLOR[b.origin]?.ink }}>{ORIGIN_LABEL[b.origin]}</span></div></td>
                <td className="px-2 py-2.5">{b.own.length ? <ul className="space-y-1">{b.own.map((c) => <li key={c.o.offer_id}><span className={`mr-1.5 rounded px-1.5 py-px text-[10px] font-semibold uppercase ${KIND_CHIP[c.kind]}`}>{OFFER_KIND_LABEL()[c.kind]}</span>{c.o.description || c.o.title}</li>)}</ul> : <span className="text-muted">{tr("none", "없음")}</span>}</td>
                <td className="px-2 py-2.5 text-[12px] text-ink-2">{b.now.filter((c) => !c.brandOwn).map((c) => c.o.title).filter((t, i, a) => a.indexOf(t) === i).join(" · ") || "–"}</td>
                <td className="px-2 py-2.5 tabular">{b.depth ? `${b.depth}%` : "–"}</td>
                <td className="px-2 py-2.5 tabular">{b.nights} / {b.checked}</td>
              </tr>))}</tbody>
          </table>
        </Card>
      </ActionSection>

      {tagSeries && (
        <ActionSection id="tags" kicker={tr("Offers on the shelf", "진열 프로모션")} title={tr("Share of top-100 listings carrying an offer tag, by origin", "국적별 프로모션 표시 제품 비율 (상위 100위)")}
          note={tr("Nykaa's own offer tag on the listing (free gift, buy-one-get-one, extra % off), as shown on the category pages each morning.", "매일 아침 카테고리 페이지에 표시된 Nykaa 프로모션 표시(사은품, 1+1, 추가 할인).")}>
          <Card className="px-4 py-4">
            <LineChart labels={win.days.map((d) => dayMonth(d))} format={(v) => `${Math.round(v)}%`} yLabel={tr("% of listings", "제품 비율 %")}
              markers={calRows.filter((r) => r.color === "#b4532a").map((r) => ({ from: dayIdx(r.start), to: dayIdx(r.end), label: r.label, color: "#b4532a" }))}
              series={(["kbeauty", "local", "global"] as const).map((o) => ({ name: ORIGIN_LABEL[o], color: ORIGIN_COLOR[o].fill, values: tagSeries[o] }))} />
          </Card>
        </ActionSection>
      )}

      {effect && (
        <ActionSection id="effect" kicker={tr("Do offers move rank?", "프로모션이 순위를 올리나?")}
          title={effect.n ? tr(<>When an offer tag appears, the listing moves up in {pct(effect.up)} of cases, against {pct(effect.baseUp)} for listings without one</>, <>프로모션 표시가 생기면 {pct(effect.up)}의 경우 순위가 오릅니다 (표시 없는 제품 {pct(effect.baseUp)})</>) : tr("Not enough offer switches in this period yet", "이 기간에는 프로모션 변화가 아직 적습니다")}
          note={tr(<>Rank the day before the tag appeared vs three collected days later, for {effect.n} switches in the {spanLabel(m.period.days)}; the comparison is every other listing over spans of the same length ({effect.baseN.toLocaleString("en-IN")}). It shows association, not proof.</>, <>{spanLabel(m.period.days)} 동안 프로모션 표시가 생긴 {effect.n}건에 대해 전날 순위와 3일 뒤 순위를 비교. 비교군은 같은 길이 구간의 다른 모든 제품({effect.baseN.toLocaleString("en-IN")}건). 연관성이지 인과 증명은 아닙니다.</>)}>
          <div className="grid gap-3 md:grid-cols-3">
            <Card className="px-5 py-4"><div className="text-[12.5px] text-muted">{tr("Median places gained, with a new offer", "새 프로모션 시 순위 상승 중앙값")}</div><div className="mt-1 font-display text-[28px] font-semibold tabular">{effect.med === null ? "–" : `${effect.med > 0 ? "+" : ""}${effect.med}`}</div><Basis>{tr(`${effect.n} offer switches`, `프로모션 변화 ${effect.n}건`)}</Basis></Card>
            <Card className="px-5 py-4"><div className="text-[12.5px] text-muted">{tr("Median places gained, all others", "기타 제품 순위 상승 중앙값")}</div><div className="mt-1 font-display text-[28px] font-semibold tabular">{effect.baseMed === null ? "–" : `${effect.baseMed > 0 ? "+" : ""}${effect.baseMed}`}</div><Basis>{tr("same-length spans", "같은 길이 구간")}</Basis></Card>
            <Card className="px-5 py-4"><div className="text-[12.5px] text-muted">{tr("Moved up", "순위 상승 비율")}</div><div className="mt-1 font-display text-[28px] font-semibold tabular">{pct(effect.up)} <span className="text-[15px] text-muted">vs {pct(effect.baseUp)}</span></div><Basis>{tr("with a new offer vs all others", "새 프로모션 vs 기타")}</Basis></Card>
          </div>
        </ActionSection>
      )}

      <EventLog />
    </Shell>
  );
}

export default function Page() { return <AuthGate><OffersPage /></AuthGate>; }
