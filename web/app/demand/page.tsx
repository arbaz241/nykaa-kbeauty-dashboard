"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AuthGate from "@/components/AuthGate";
import BrandPicker from "@/components/BrandPicker";
import LineChart from "@/components/LineChart";
import { eventsInWindow } from "@/components/EventLog";
import { useOpenProduct } from "@/components/ProductDrawer";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import { Missing, Opens, Points, useDetail } from "@/components/Detail";
import Shell from "@/components/Shell";
import Sparkline from "@/components/Sparkline";
import { Basis, Def, TieredList } from "@/components/Tiered";
import { Card, Loading, PageHead, Verdict } from "@/components/ui";
import { ORIGIN_LABEL, norm } from "@/lib/brands";
import { useCatalog, useDemand, useEvents, useReviewMonths, useSearchHistory, useShelf, useSuggestions } from "@/lib/data";
import { demandRows, demandWindow, growthOf, type DemandRow } from "@/lib/analysis";
import { compact, inr, shortName } from "@/lib/format";
import { demandLines, momentumWord, monthsWindow, type DemandLine } from "@/lib/metrics";
import { noteMarkers, unusual, useDataNotes } from "@/lib/notes";
import { useBrandSelection } from "@/lib/selection";
import { fetchAll } from "@/lib/supabase";
import { useTiers } from "@/lib/tiers";
import type { SearchRow, Suggestion } from "@/lib/types";
import useSWR from "swr";
import { push } from "@/lib/group";
import { dayMonth, josa, monthYY, tr } from "@/lib/i18n";

/** Demand (Round 3): who is buying more, who shoppers find when they search, who pays for attention, and what
 *  Nykaa suggests as they type, always as the anchor against the focus brands (owner decisions 12 Oct 2026). */

// Keep in sync with scraper/signals.py SEARCH_QUERIES
const CORE = ["korean skincare", "korean sunscreen", "korean serum", "korean moisturizer", "korean face wash", "korean toner", "korean sheet mask", "korean lip tint", "glass skin", "snail mucin", "cica", "rice toner", "centella", "niacinamide serum", "sunscreen for oily skin"];
const day = (d: string) => dayMonth(d);
const monthLabel = (m: string) => monthYY(m);
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const signed = (v: number | null | undefined) => (v === null || v === undefined ? tr("n/a", "해당 없음") : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
const same = (a: string, b: string) => norm(a) === norm(b);

const NAV = (): NavItem[] => [
  { id: "summary", label: tr("Summary", "요약") }, { id: "demand", label: tr("Demand", "수요") }, { id: "sos", label: tr("Search vs demand", "검색 vs 수요") },
  { id: "search", label: tr("Search", "검색") }, { id: "ads", label: tr("Ads", "광고") }, { id: "suggest", label: tr("What shoppers type", "소비자 검색어") },
];

/** Unpaid order from one sample per (day, query); ads counted across samples. */
function split(rows: SearchRow[]) {
  const minS = Math.min(...rows.map((r) => r.sample));
  const unpaid = rows.filter((r) => !r.is_ad && r.sample === minS).sort((a, b) => a.rank - b.rank);
  const ads = rows.filter((r) => r.is_ad).sort((a, b) => a.sample - b.sample || a.rank - b.rank);
  return { unpaid, ads };
}

function Change({ g, vol, market }: { g: number | null; vol: number | null; market?: number | null }) {
  const w = momentumWord(g, vol);
  if (g === null || vol === null) return <span className="text-[12px] text-muted">{w}</span>;
  const beat = market === undefined || market === null ? null : g >= market;
  // rising / falling exactly as momentumWord reads them (not by its wording, which follows the language)
  const tone = beat === null ? (vol >= 30 && g > 0.05 ? "text-good" : vol >= 30 && g < -0.05 ? "text-bad" : "text-ink-2") : beat ? "text-good" : "text-bad";
  return <span className={`tabular ${tone}`}><b>{g > 0 ? "▲" : g < 0 ? "▼" : ""} {Math.abs(Math.round(g * 100))}%</b>{vol < 30 && <span className="ml-1.5 text-[11px] font-normal text-muted">{tr("small base", "표본 적음")}</span>}</span>;
}

function Thumb({ src }: { src: string | null }) {
  return (
    <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-lg bg-page ring-1 ring-line">
      {/* eslint-disable-next-line @next/next/no-img-element -- Nykaa CDN image */}
      {src ? <img src={src} alt="" className="h-8 w-8 object-contain" /> : null}
    </span>
  );
}

function Kpi({ label, value, sub, basis, href, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; basis?: React.ReactNode; href: string; tone?: "good" | "bad" }) {
  return (
    <a href={href} className="lift block rounded-[16px] bg-surface px-4 py-3.5 shadow-card ring-1 ring-line">
      <div className="text-[11.5px] font-medium text-muted">{label}</div>
      <div className={`mt-1 font-display text-[20px] font-semibold leading-tight tracking-tight tabular ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>{value}</div>
      {sub && <div className="mt-1 text-[12px] leading-snug text-ink-2">{sub}</div>}
      {basis && <Basis className="mt-1">{basis}</Basis>}
    </a>
  );
}

/** Suggestion history for the "new this week" read (the latest-day view cannot show what changed). */
function useSuggestionHistory() {
  return useSWR("suggestion_history", () => fetchAll<Suggestion>("web_suggestion_history"), { revalidateOnFocus: false });
}

function DemandPage() {
  const months = useReviewMonths(); const shelf = useShelf(); const catalog = useCatalog(); const events = useEvents(); const notes = useDataNotes(); const demandView = useDemand();
  const hist = useSearchHistory(); const sugg = useSuggestions(); const suggHist = useSuggestionHistory();
  const open = useOpenProduct(); const detail = useDetail();

  /* ---- demand (reviews) */
  // one product per review pool (sizes and variants share Nykaa's reviews), counted exactly as on Analysis:
  // reviews = every tracked product's last 3 months; growth = only products with complete history (lib/analysis)
  const drows = useMemo(() => (months.data && demandView.data && shelf.data && catalog.data ? demandRows(months.data, demandView.data, shelf.data, catalog.data) : []), [months.data, demandView.data, shelf.data, catalog.data]);
  const data = useMemo(() => {
    if (!months.data || !drows.length) return months.data ?? [];
    const keep = new Set(drows.map((r) => r.product_id));
    return months.data.filter((m) => keep.has(m.product_id));
  }, [months.data, drows]);
  const aggBy = useMemo(() => {
    const by = new Map<string, DemandRow[]>(); drows.forEach((r) => { const k = norm(r.brand); push(by, k, r); });
    return by;
  }, [drows]);
  const rowBy = useMemo(() => new Map(drows.map((r) => [r.product_id, r])), [drows]);
  const known = useMemo(() => [...new Set(data.map((m) => m.brand))], [data]);
  const tiers = useTiers(known);
  const A = tiers.pinned;
  const isA = (b: string) => same(b, A);
  const focus = useMemo(() => [tiers.pinned, ...tiers.focus].filter((b) => known.includes(b)), [tiers, known]);
  const { selected, colors, toggle } = useBrandSelection(known);
  const [mode, setMode] = useState<"reviews" | "index">("reviews");
  const brands = useMemo(() => demandLines(data, "brand").map((b) => {
    const rs = aggBy.get(norm(b.brand)) ?? []; if (!rs.length) return b; const g = growthOf(rs);
    return { ...b, last3: rs.reduce((a, r) => a + r.recent, 0), prev3: g.products ? g.prior : null, growth: g.growth };
  }).sort((a, b) => (b.last3 ?? -1) - (a.last3 ?? -1)), [data, aggBy]);
  const products = useMemo(() => demandLines(data, "product").map((p) => {
    const r = rowBy.get(p.key); if (!r) return p;
    return { ...p, last3: r.recent, prev3: r.complete ? r.prior : null, growth: r.complete && r.prior > 0 ? r.recent / r.prior - 1 : null };
  }).sort((a, b) => (b.last3 ?? -1) - (a.last3 ?? -1)), [data, rowBy]);
  const market = useMemo(() => {
    const m = demandLines(data.map((x) => ({ ...x, brand: tr("All tracked brands", "추적 전체 브랜드") })), "brand")[0] as DemandLine | undefined; if (!m) return m;
    const g = growthOf(drows); return { ...m, last3: drows.reduce((a, r) => a + r.recent, 0), prev3: g.prior, growth: g.growth };
  }, [data, drows]);
  const origin = useMemo(() => { const m = new Map<string, string>(); (shelf.data ?? []).forEach((r) => m.set(r.brand, r.origin)); return m; }, [shelf.data]);
  const win = monthsWindow(12);
  const dw = demandWindow(); const period = `${dw.recent} vs ${dw.prior}`;
  const mkt = market?.growth ?? null;
  const solid = (b: DemandLine) => b.growth !== null && (b.last3 ?? 0) >= 60;
  const focusLines = brands.filter((b) => tiers.inSet(b.brand) && !isA(b.brand));
  const risers = focusLines.filter(solid).sort((a, b) => b.growth! - a.growth!);
  const up = risers[0]; const dn = risers.at(-1);
  const outliers = brands.filter((b) => !tiers.inSet(b.brand) && b.growth !== null && (b.last3 ?? 0) >= 60 && Math.abs(b.growth) >= 0.5).sort((a, b) => Math.abs(b.growth!) - Math.abs(a.growth!)).slice(0, 3);
  const anchorD = brands.find((b) => isA(b.brand));
  const setRanked = brands.filter((b) => tiers.inSet(b.brand) && b.last3 !== null).sort((a, b) => (b.last3 ?? 0) - (a.last3 ?? 0));
  const anchorRank = setRanked.findIndex((b) => isA(b.brand)) + 1;
  const demTot = brands.reduce((a, b) => a + (b.last3 ?? 0), 0);
  const topProducts = products.filter((p) => p.last3 !== null);
  const topFocusProduct = topProducts.find((p) => tiers.inSet(p.brand));
  const imgFor = (pid: string) => (shelf.data ?? []).find((r) => r.product_id === pid)?.image_url ?? (catalog.data ?? []).find((r) => r.product_id === pid)?.best_image ?? null;
  const shelfFor = (pid: string) => (shelf.data ?? []).find((r) => r.product_id === pid);
  const openProduct = (pid: string, label: string, brand: string, url?: string | null) => {
    const s = shelfFor(pid);
    open({ product_id: pid, name: label, brand, url, image: imgFor(pid), price: s?.price, mrp: s?.mrp, rating: s?.rating, rating_count: s?.rating_count, usp: s?.usp_summary, phrases: s?.review_key_phrases, splitup: s?.review_splitup, madeIn: s?.country_name });
  };

  // chart: reviews per month, or each line indexed to its own average over chart months 7-9 (=100) with the market pinned
  const sel = brands.filter((b) => selected.includes(b.brand) && b.last3 !== null);
  const indexed = (v: (number | null)[]) => { const base = v.slice(6, 9).filter((x): x is number => x !== null); const m = base.length ? base.reduce((a, b) => a + b, 0) / base.length : 0; return v.map((x) => (x === null || !m ? null : (x / m) * 100)); };
  const series = mode === "reviews" ? sel.map((b) => ({ name: b.brand, color: colors[b.brand], values: b.spark }))
    : [...(market ? [{ name: tr("All tracked brands", "추적 전체 브랜드"), color: "#8a8880", values: indexed(market.spark) }] : []), ...sel.map((b) => ({ name: b.brand, color: colors[b.brand], values: indexed(b.spark) }))];
  const logged = noteMarkers(notes.data, win, "demand", sel.map((b) => b.brand), true);
  const eventMarks = eventsInWindow(events.data, win).map((e) => ({ from: Math.max(0, win.findIndex((m) => m.slice(0, 7) === e.happened_on.slice(0, 7))), to: e.ends_on ? win.findIndex((m) => m.slice(0, 7) === e.ends_on!.slice(0, 7)) : undefined, label: e.label, color: e.color })).filter((m) => m.from >= 0);
  const flags = mode === "reviews" ? unusual(series, win, [...logged, ...eventMarks]) : [];
  const chartNotes = (notes.data ?? []).filter((n) => n.kind !== "method" && (n.scope === "demand" || n.scope === "all") && (!n.brand || sel.some((b) => same(b.brand, n.brand!))));

  /* ---- search & ads */
  const rows = useMemo(() => hist.data ?? [], [hist.data]);
  const days = useMemo(() => [...new Set(rows.map((r) => r.scrape_date))].sort(), [rows]);
  const latest = days[days.length - 1];
  const today = useMemo(() => rows.filter((r) => r.scrape_date === latest), [rows, latest]);
  const keywords = useMemo(() => [...new Set(today.map((r) => r.query))].sort((a, b) => (CORE.includes(a) ? 0 : 1) - (CORE.includes(b) ? 0 : 1) || a.localeCompare(b)), [today]);
  const [kw, setKw] = useState<string | null>(null);
  const active = kw ?? keywords.find((k) => k === "korean sunscreen") ?? keywords[0];
  const byKw = useMemo(() => { const m = new Map<string, SearchRow[]>(); today.forEach((r) => push(m, r.query, r)); return m; }, [today]);
  const sov = useMemo(() => {
    const t = new Map<string, { brand: string; origin: string; top5: number; top10: number; ads: number; adDays: number }>();
    const get = (b: string, o: string) => t.get(b) ?? t.set(b, { brand: b, origin: o, top5: 0, top10: 0, ads: 0, adDays: 0 }).get(b)!;
    for (const [, rs] of byKw) {
      const { unpaid, ads } = split(rs);
      unpaid.slice(0, 10).forEach((r, i) => { const e = get(r.brand, r.origin); e.top10++; if (i < 5) e.top5++; });
      ads.forEach((r) => get(r.brand, r.origin).ads++);
    }
    const week = new Set(days.slice(-7)); const seen = new Set<string>();
    rows.filter((r) => r.is_ad && week.has(r.scrape_date)).forEach((r) => { const k = `${r.brand}|${r.scrape_date}|${r.query}`; if (!seen.has(k)) { seen.add(k); get(r.brand, r.origin).adDays++; } });
    return [...t.values()].sort((a, b) => b.top5 - a.top5 || b.top10 - a.top10 || b.ads - a.ads);
  }, [byKw, rows, days]);
  const cur = byKw.get(active) ? split(byKw.get(active)!) : { unpaid: [], ads: [] };
  const adGrid = useMemo(() => {
    const ds = days.slice(-10); const bs = new Map<string, Map<string, number>>();
    rows.filter((r) => r.query === active && r.is_ad && ds.includes(r.scrape_date)).forEach((r) => {
      const m = bs.get(r.brand) ?? new Map<string, number>(); m.set(r.scrape_date, (m.get(r.scrape_date) ?? 0) + 1); bs.set(r.brand, m);
    });
    const unpaid1 = ds.map((d) => { const rs = rows.filter((r) => r.query === active && r.scrape_date === d); return rs.length ? split(rs).unpaid[0]?.brand ?? null : null; });
    return { ds, brands: [...bs.entries()].sort((a, b) => (tiers.order(a[0]) - tiers.order(b[0])) || [...b[1].values()].reduce((x, y) => x + y, 0) - [...a[1].values()].reduce((x, y) => x + y, 0)), unpaid1 };
  }, [rows, days, active, tiers]);
  const totalTop10 = sov.reduce((a, s) => a + s.top10, 0);
  const totalAds = sov.reduce((a, s) => a + s.ads, 0);
  const focusAds = sov.filter((s) => tiers.inSet(s.brand)).reduce((a, s) => a + s.ads, 0);
  const anchorS = sov.find((s) => isA(s.brand));
  const topAdv = [...sov].filter((s) => tiers.inSet(s.brand)).sort((a, b) => b.ads - a.ads || b.adDays - a.adDays)[0];

  // keyword × brand grid: the anchor and the focus brands that reach any unpaid top 10 today
  const grid = useMemo(() => {
    const pos = new Map<string, Map<string, { rank: number | null; ad: boolean }>>();
    for (const k of keywords) {
      const { unpaid, ads } = split(byKw.get(k) ?? []); const m = new Map<string, { rank: number | null; ad: boolean }>();
      unpaid.slice(0, 10).forEach((r, i) => { const e = m.get(norm(r.brand)); if (!e || e.rank === null) m.set(norm(r.brand), { rank: e?.rank ?? i + 1, ad: e?.ad ?? false }); });
      ads.forEach((r) => { const e = m.get(norm(r.brand)); m.set(norm(r.brand), { rank: e?.rank ?? null, ad: true }); });
      pos.set(k, m);
    }
    const reach = (b: string) => keywords.filter((k) => pos.get(k)?.get(norm(b))?.rank).length;
    const cols = [A, ...tiers.focus.filter((b) => reach(b) > 0).sort((a, b) => reach(b) - reach(a))].slice(0, 11);
    return { pos, cols, reach };
  }, [keywords, byKw, A, tiers.focus]);
  const absent = keywords.filter((k) => !grid.pos.get(k)?.get(norm(A))?.rank).length;

  // share of search (unpaid top-10 places) vs share of demand (reviews, last 3 months): Binet's "excess share of search"
  const sos = useMemo(() => {
    const names = new Set([...sov.filter((s) => s.top10 > 0).map((s) => s.brand), ...brands.filter((b) => (b.last3 ?? 0) > 0).map((b) => b.brand)]);
    return [...names].map((b) => {
      const s = sov.find((x) => same(x.brand, b)); const d = brands.find((x) => same(x.brand, b));
      const search = s ? s.top10 / Math.max(1, totalTop10) : 0; const demand = d?.last3 ? d.last3 / Math.max(1, demTot) : 0;
      return { brand: b, search, demand, excess: search - demand, origin: s?.origin ?? origin.get(b) ?? "unknown", tracked: !!d?.last3 };
    }).filter((x) => x.search > 0 || x.demand > 0.002)
      .sort((a, b) => (isA(a.brand) ? -1 : isA(b.brand) ? 1 : tiers.order(a.brand) - tiers.order(b.brand) || b.search + b.demand - a.search - a.demand));
  }, [brands, sov, totalTop10, demTot, origin, tiers]); // eslint-disable-line react-hooks/exhaustive-deps
  const launchOf = (b: string) => { const n = (notes.data ?? []).find((x) => x.kind === "launch" && x.brand && same(x.brand, b)); return n ? dayMonth(n.starts_on) : null; };
  const anchorSos = sos.find((x) => isA(x.brand));
  const focusSos = sos.filter((x) => tiers.inSet(x.brand) && x.tracked);
  const ahead = focusSos.filter((x) => !isA(x.brand) && x.excess > 0.01).sort((a, b) => b.excess - a.excess).slice(0, 3);
  const behind = focusSos.filter((x) => !isA(x.brand) && !launchOf(x.brand) && x.excess < -0.01).sort((a, b) => a.excess - b.excess).slice(0, 3);

  /* ---- what shoppers type */
  const typed = useMemo(() => suggestionInsights(sugg.data ?? [], suggHist.data ?? [], known, A, (b) => tiers.inSet(b)), [sugg.data, suggHist.data, known, A, tiers]);

  /* ---- verdict */
  const gap = anchorSos ? anchorSos.excess : null;
  const verdict = anchorD ? tr(`${A}'s demand is ${anchorD.growth === null ? "too thinly tracked to read" : `${anchorD.growth >= (mkt ?? 0) ? "growing faster than" : "lagging"} all tracked products (${signed(anchorD.growth)} vs ${signed(mkt)})`}, #${anchorRank} of ${setRanked.length} focus brands by reviews; ${gap === null ? "" : gap < -0.005 ? `but shoppers who search find it less than buyers choose it (${pct(anchorSos!.search)} of search vs ${pct(anchorSos!.demand)} of demand)` : gap > 0.005 ? `and shoppers find it more often than buyers choose it (${pct(anchorSos!.search)} of search vs ${pct(anchorSos!.demand)} of demand), a lead indicator of growth` : `and its search share matches its demand (${pct(anchorSos!.search)})`}.`,
      `${A}의 수요는 ${anchorD.growth === null ? "추적 데이터가 부족해 판단하기 어렵고" : `추적 전체보다 ${anchorD.growth >= (mkt ?? 0) ? "빠르게 성장하고 있으며" : "뒤처지고 있으며"}(${signed(anchorD.growth)}, 시장 ${signed(mkt)})`}, 리뷰 기준 주요 브랜드 ${setRanked.length}개 중 ${anchorRank}위입니다. ${gap === null ? "" : gap < -0.005 ? `다만 구매자가 선택하는 만큼 검색에서는 잘 보이지 않습니다(검색 ${pct(anchorSos!.search)}, 수요 ${pct(anchorSos!.demand)}).` : gap > 0.005 ? `구매자가 선택하는 것보다 검색에서 더 자주 보이며(검색 ${pct(anchorSos!.search)}, 수요 ${pct(anchorSos!.demand)}), 이는 성장의 선행 신호입니다.` : `검색 점유율이 수요 점유율과 비슷합니다(${pct(anchorSos!.search)}).`}`) : "";
  const soWhat = !anchorD ? null : gap !== null && gap < -0.005 ? tr(`Search is the gap: ${A} is outside the unpaid top 10 on ${absent} of ${keywords.length} keywords. Winning those searches is the cheapest demand to add.`, `검색이 약점입니다: ${josa(A, "은/는")} 키워드 ${keywords.length}개 중 ${absent}개에서 비광고 상위 10위 밖입니다. 이 검색어를 가져오는 것이 가장 적은 비용으로 수요를 늘리는 길입니다.`)
    : anchorD.growth !== null && mkt !== null && anchorD.growth < mkt ? tr(`Demand is losing momentum against all tracked products; check its top products' prices and stock first.`, `추적 전체 대비 수요 모멘텀이 약해지고 있습니다. 대표 제품의 가격과 재고부터 확인하세요.`)
    : tr(`${A}'s search share is level with its demand share, and demand is growing faster than all tracked products; protect the products driving it (${topProducts.find((p) => isA(p.brand)) ? shortName(topProducts.find((p) => isA(p.brand))!.label, A).split(/,| - /)[0] : "its leaders"}) and keep them in stock.`, `${A}의 검색 점유율은 수요 점유율과 비슷하고, 수요는 추적 전체보다 빠르게 성장하고 있습니다. 성장을 이끄는 제품(${topProducts.find((p) => isA(p.brand)) ? shortName(topProducts.find((p) => isA(p.brand))!.label, A).split(/,| - /)[0] : "대표 제품"})을 지키고 재고를 유지하세요.`);

  return (
    <Shell active="Demand" asOf={latest ? day(latest) : undefined}>
      <PageHead eyebrow={tr("Demand & search · step 6", "수요·검색 · 6단계")} title={tr("Demand & search", "수요·검색")} sub={tr(<>Who is selling more (monthly reviews as the sales signal), and who shoppers find when they search on Nykaa: unpaid results, paid ads, and what Nykaa suggests as they type. {A} against the {tiers.focus.length} focus brands.</>, <>누가 더 많이 팔고 있는지(월별 리뷰를 판매 신호로 사용), 그리고 Nykaa에서 검색할 때 소비자가 누구를 만나는지: 비광고 결과, 광고, 입력 중 Nykaa 추천 검색어. 주요 브랜드 {tiers.focus.length}곳과 비교한 {A}.</>)} />
      {(!months.data || !hist.data || !demandView.data) ? <Loading what={tr("demand and search data", "수요·검색 데이터")} /> : (
        <>
          <SectionNav items={NAV()} />

          <section id="summary" className="mt-6 scroll-mt-32">
            {verdict && <Verdict eyebrow={tr(<>Verdict for {A}</>, <>{A} 종합 판단</>)} points={(tr([
              <><b className="text-on-brand">Demand:</b> {compact(anchorD?.last3 ?? 0)} reviews in {dw.recent} ({pct((anchorD?.last3 ?? 0) / Math.max(1, demTot))} of all tracked reviews). Top {A} product: {topProducts.find((p) => isA(p.brand)) ? shortName(topProducts.find((p) => isA(p.brand))!.label, A) : "none tracked"}.</>,
              up && dn ? <><b className="text-on-brand">Focus rivals:</b> {up.brand} rose fastest ({signed(up.growth)}, {compact(up.prev3)} → {compact(up.last3)} reviews); {dn.brand} fell hardest ({signed(dn.growth)}, {compact(dn.prev3)} → {compact(dn.last3)}).</> : null,
              <><b className="text-on-brand">Search:</b> outside the unpaid top 10 on {absent} of {keywords.length} keywords; {anchorS?.top5 ?? 0} unpaid top-5 places today.</>,
              <><b className="text-on-brand">Ads:</b> {anchorS?.ads ?? 0} of {totalAds} ad slots today; the focus brands hold {pct(focusAds / Math.max(1, totalAds), 0)}, led by {topAdv?.brand ?? "none"} ({topAdv?.ads ?? 0}).</>,
            ], [
              <><b className="text-on-brand">수요:</b> {dw.recent} 리뷰 {compact(anchorD?.last3 ?? 0)}건 (추적 전체 리뷰의 {pct((anchorD?.last3 ?? 0) / Math.max(1, demTot))}). {A} 대표 제품: {topProducts.find((p) => isA(p.brand)) ? shortName(topProducts.find((p) => isA(p.brand))!.label, A) : "추적 제품 없음"}.</>,
              up && dn ? <><b className="text-on-brand">주요 경쟁사:</b> 가장 빠른 상승은 {up.brand}({signed(up.growth)}, 리뷰 {compact(up.prev3)} → {compact(up.last3)}건), 가장 큰 하락은 {dn.brand}({signed(dn.growth)}, {compact(dn.prev3)} → {compact(dn.last3)}건).</> : null,
              <><b className="text-on-brand">검색:</b> 키워드 {keywords.length}개 중 {absent}개에서 비광고 상위 10위 밖. 오늘 비광고 상위 5위 자리 {anchorS?.top5 ?? 0}개.</>,
              <><b className="text-on-brand">광고:</b> 오늘 광고 자리 {totalAds}개 중 {anchorS?.ads ?? 0}개. 주요 브랜드가 {pct(focusAds / Math.max(1, totalAds), 0)}를 차지하며, 선두는 {topAdv?.brand ?? "없음"}({topAdv?.ads ?? 0}개).</>,
            ]) as React.ReactNode[]).filter(Boolean)} foot={soWhat && <><b>{tr("So what:", "시사점:")}</b> {soWhat}</>}>{verdict}</Verdict>}
            <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Kpi href="#demand" label={tr(`${A} reviews, last 3 months`, `${A} 최근 3개월 리뷰`)} value={anchorD?.last3 != null ? compact(anchorD.last3) : <Missing>{tr("not tracked", "추적 안 됨")}</Missing>}
                sub={anchorD ? <>{tr("Growth", "성장률")} <b className={anchorD.growth !== null && mkt !== null && anchorD.growth >= mkt ? "text-good" : "text-bad"}>{signed(anchorD.growth)}</b> {tr(`vs all tracked ${signed(mkt)}`, `(추적 전체 ${signed(mkt)})`)}</> : undefined} basis={period} />
              <Kpi href="#demand" label={tr("Fastest-rising focus brand", "가장 빠르게 상승한 주요 브랜드")} value={up?.brand ?? <Missing>{tr("too little history", "이력 부족")}</Missing>} tone="good" sub={up ? tr(<>{signed(up.growth)}: {compact(up.prev3)} → {compact(up.last3)} reviews</>, <>{signed(up.growth)}: 리뷰 {compact(up.prev3)} → {compact(up.last3)}건</>) : undefined} basis={period} />
              <Kpi href="#demand" label={tr("Sharpest decline, focus brands", "가장 크게 하락한 주요 브랜드")} value={dn?.brand ?? <Missing>{tr("too little history", "이력 부족")}</Missing>} tone="bad" sub={dn ? tr(<>{signed(dn.growth)}: {compact(dn.prev3)} → {compact(dn.last3)} reviews</>, <>{signed(dn.growth)}: 리뷰 {compact(dn.prev3)} → {compact(dn.last3)}건</>) : undefined} basis={period} />
              <Kpi href="#demand" label={tr("Top focus product by demand", "수요 1위 주요 브랜드 제품")} value={topFocusProduct?.brand ?? <Missing>{tr("none tracked", "추적 제품 없음")}</Missing>} sub={topFocusProduct ? tr(`${shortName(topFocusProduct.label, topFocusProduct.brand).split(/,| - /)[0]} · ${compact(topFocusProduct.last3)} reviews`, `${shortName(topFocusProduct.label, topFocusProduct.brand).split(/,| - /)[0]} · 리뷰 ${compact(topFocusProduct.last3)}건`) : undefined} basis={tr("reviews, last 3 complete months", "최근 완결된 3개월 리뷰")} />
              <Kpi href="#sos" label={tr(`${A}: search vs demand`, `${A}: 검색 vs 수요`)} value={anchorSos ? `${pct(anchorSos.search)} vs ${pct(anchorSos.demand)}` : <Missing>{tr("not tracked", "추적 안 됨")}</Missing>} sub={anchorSos ? (anchorSos.excess >= 0 ? tr("search ahead of demand", "검색이 수요보다 앞섬") : tr("search behind demand", "검색이 수요보다 뒤처짐")) : undefined} basis={tr("unpaid top 10 today vs reviews, 3 months", "오늘 비광고 상위 10 vs 3개월 리뷰")} />
              <Kpi href="#ads" label={tr(`${A} ad slots today`, `${A} 오늘 광고 자리`)} value={tr(`${anchorS?.ads ?? 0} of ${totalAds}`, `${totalAds}개 중 ${anchorS?.ads ?? 0}개`)} sub={tr(`focus brands hold ${pct(focusAds / Math.max(1, totalAds), 0)}`, `주요 브랜드 비중 ${pct(focusAds / Math.max(1, totalAds), 0)}`)} basis={tr(`first 20 results of ${keywords.length} keywords`, `키워드 ${keywords.length}개의 첫 20개 결과`)} />
            </div>
            {outliers.length > 0 && <p className="mt-2 text-[12.5px] text-ink-2"><span className="text-muted">{tr("Other notable movers, outside the focus set:", "주요 브랜드 외 눈에 띄는 변화:")}</span> {outliers.map((o, i) => <span key={o.brand}>{i ? "; " : ""}<b className="font-medium">{o.brand}</b> {signed(o.growth)} ({tr(`${compact(o.prev3)} → ${compact(o.last3)} reviews`, `리뷰 ${compact(o.prev3)} → ${compact(o.last3)}건`)})</span>)}.</p>}
          </section>

          <p className="mt-6 text-[13px] text-muted">{tr(<>Rank moves and their reasons now sit with the products: in <Link href="/categories/" className="underline underline-offset-2">Categories</Link> for each category, and on every brand and product page.</>, <>순위 변화와 이유는 이제 제품과 함께 있습니다: <Link href="/categories/" className="underline underline-offset-2">카테고리</Link>별, 그리고 각 브랜드·제품 페이지.</>)}</p>

          <ActionSection id="demand" kicker={tr("Demand · who is selling more", "수요 · 누가 더 팔고 있나")} title={tr(`${up ? `Among the focus brands, ${up.brand} is rising fastest (${signed(up.growth)}) and ${dn?.brand} falling hardest (${signed(dn?.growth)})` : "Demand by brand"}; ${A} is ${anchorD?.growth != null ? `${signed(anchorD.growth)} against a market ${signed(mkt)}` : "not tracked"}.`,
              `${up ? `주요 브랜드 중 ${josa(up.brand, "이/가")} 가장 빠르게 상승(${signed(up.growth)})하고 ${josa(dn?.brand ?? "", "이/가")} 가장 크게 하락(${signed(dn?.growth)})했습니다` : "브랜드별 수요"}. ${A}: ${anchorD?.growth != null ? `${signed(anchorD.growth)} (추적 전체 ${signed(mkt)})` : "추적 안 됨"}.`)}
            note={tr(<>Monthly reviews track sales. <Def k="growth">Growth</Def> = reviews in {period}, counting only products whose history reaches back to {dw.prior} (the same months a year earlier). Shaded bands and markers explain the spikes; red markers flag a jump with no logged cause. <Opens detail={{ kicker: "Method", title: "How demand is measured", body: <Points items={["Nykaa does not publish sales; buyers write reviews at a steady rate, so monthly review volume tracks sales momentum.", "Dates are the reviews' own dates on Nykaa, read from each product's history, so the comparison is not limited by how long we have been collecting.", "Nykaa serves about 1,000 reviews per product, so for big bestsellers only recent months are complete; earlier months are left blank rather than counted as zero.", "Products are those on today's shelves and catalogues, so growth reads slightly high across the board; compare a brand with the all-tracked line, not with zero.", `July holds Nykaa's Hot Pink sale; May a smaller probable sale. Index view compares every brand with its own ${monthYY(win[6])}–${monthYY(win[8])} average.`]} /> }}>Method</Opens></>,
              <>월별 리뷰는 판매를 따라갑니다. <Def k="growth">성장률</Def> = {period} 리뷰, {dw.prior}(전년 동기)까지 이력이 있는 제품만 셉니다. 음영과 표시선이 급등락의 이유를 보여 주며, 빨간 표시선은 기록된 원인이 없는 급등입니다. <Opens detail={{ kicker: "방법", title: "수요 측정 방법", body: <Points items={["Nykaa는 판매량을 공개하지 않습니다. 구매자는 일정한 비율로 리뷰를 쓰므로, 월별 리뷰 수가 판매 흐름을 따라갑니다.", "날짜는 각 제품 이력에서 읽은 Nykaa 리뷰 작성일이므로, 수집 기간이 짧아도 과거와 비교할 수 있습니다.", "Nykaa는 제품당 리뷰를 약 1,000건까지만 보여 주므로, 대형 베스트셀러는 최근 몇 달만 완전합니다. 그 이전 달은 0으로 세지 않고 비워 둡니다.", "대상 제품은 오늘의 진열 목록과 카탈로그에 있는 제품이라 성장률이 전반적으로 약간 높게 나옵니다. 0이 아니라 시장선과 비교하세요.", `7월에는 Nykaa Hot Pink sale이, 5월에는 그보다 작은 세일(추정)이 있었습니다. 지수 보기는 브랜드마다 자신의 ${monthYY(win[6])}–${monthYY(win[8])} 평균과 비교합니다.`]} /> }}>방법</Opens></>)}
            right={<div className="flex gap-1.5">{(["reviews", "index"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1 text-[12.5px] ring-1 ${mode === m ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line"}`}>{m === "reviews" ? tr("Reviews per month", "월별 리뷰") : tr("Index vs all tracked", "추적 전체 대비 지수")}</button>)}</div>}>
            <Card className="p-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><div className="text-[14px] font-semibold">{mode === "reviews" ? tr("Monthly reviews, last 12 complete months", "월별 리뷰, 최근 완결된 12개월") : tr(`Each line indexed to its own ${dw.prior} average = 100; grey = all tracked brands`, `각 선을 자신의 ${dw.prior} 평균 = 100으로 환산, 회색 = 추적 전체 브랜드`)}</div><span className="text-[12px] text-muted">{tr("Hover for values and causes", "마우스를 올리면 값과 원인이 나옵니다")}</span></div>
              <div className="mb-3"><BrandPicker focus={focus} all={brands.map((b) => ({ brand: b.brand, slots: b.last3 ?? 0 }))} selected={selected} colors={colors} onToggle={toggle} /></div>
              {series.length ? <LineChart labels={win.map(monthLabel)} series={series} height={300} yLabel={mode === "reviews" ? tr("reviews per month", "월별 리뷰 수") : tr(`index, ${dw.prior} = 100`, `지수, ${dw.prior} = 100`)} markers={[...logged, ...eventMarks, ...flags]} />
                : <p className="text-[13px] text-muted">{tr("None of the selected brands has review history yet.", "선택한 브랜드에 아직 리뷰 이력이 없습니다.")}</p>}
              {chartNotes.length > 0 && (
                <div className="mt-3 grid gap-1.5 border-t border-line pt-3 md:grid-cols-2">
                  {chartNotes.map((n) => <div key={n.id} className="text-[12px] leading-snug text-ink-2"><b className="font-semibold text-ink">{n.title}</b>: {n.detail}</div>)}
                  {flags.map((f, i) => <div key={i} className="text-[12px] leading-snug text-bad">{f.label}</div>)}
                </div>
              )}
            </Card>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
              <div className="min-w-0">
                <div className="mb-2 text-[14px] font-semibold">{tr("Review growth by brand", "브랜드별 리뷰 성장률")} <span className="text-[12px] font-normal text-muted">· {tr(`${A} and the focus brands; search for any other · click a brand for its products`, `${A}와 주요 브랜드. 다른 브랜드는 검색 · 브랜드를 누르면 제품이 나옵니다`)}</span></div>
                <Card className="overflow-x-auto"><div className="min-w-[600px]">
                  <div className="grid grid-cols-[minmax(170px,1.4fr)_110px_1fr_80px_100px] border-b border-line px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                    <span>{tr("Brand", "브랜드")}</span><span>{tr("12 months", "12개월")}</span><span>{tr("Reviews, last 3 mo", "최근 3개월 리뷰")}</span><span className="text-right">{dw.prior}</span><span className="pl-3">{tr("Change", "변화")}</span>
                  </div>
                  {market && (
                    <div className="grid grid-cols-[minmax(170px,1.4fr)_110px_1fr_80px_100px] items-center border-b border-line bg-sunken/50 px-4 py-2">
                      <span className="text-[13px] font-semibold">{tr("All tracked brands", "추적 전체 브랜드")} <span className="text-[11px] font-normal text-muted">{tr("all tracked", "추적 전체")}</span></span>
                      <Sparkline values={market.spark} color="#8a8880" width={96} height={24} />
                      <b className="text-[13px] tabular">{compact(market.last3)}</b>
                      <span className="text-right text-[12.5px] text-ink-2 tabular">{compact(market.prev3)}</span>
                      <span className="pl-3 text-[12.5px] tabular"><b>{signed(mkt)}</b></span>
                    </div>
                  )}
                  <TieredList rows={[...brands].sort((a, b) => (isA(a.brand) ? -1 : isA(b.brand) ? 1 : (b.last3 ?? -1) - (a.last3 ?? -1)))} brandOf={(b) => b.brand} tiers={tiers} top={12} render={(b) => {
                    const ps = products.filter((p) => p.brand === b.brand); const c = colors[b.brand] ?? "#8a8880";
                    const maxL = Math.max(1, ...brands.filter((x) => tiers.inSet(x.brand)).map((x) => x.last3 ?? 0));
                    return (
                      <button key={b.brand} onClick={() => detail({ kicker: tr(`${b.brand} · tracked products`, `${b.brand} · 추적 제품`), title: `${b.brand}: ${b.last3 === null ? tr("partial history", "이력 일부") : tr(`${compact(b.last3)} reviews in 3 months`, `3개월 리뷰 ${compact(b.last3)}건`)}`, body: (<>
                        <p className="text-muted">{tr(`${ps.length} tracked product${ps.length === 1 ? "" : "s"}, ranked by reviews in the last 3 months. Change = ${period}.`, `추적 제품 ${ps.length}개, 최근 3개월 리뷰 순. 변화 = ${period}.`)}</p>
                        <div className="mt-3 space-y-1">{ps.map((p) => { const s = shelfFor(p.key); return (
                          <button key={p.key} onClick={() => openProduct(p.key, p.label, p.brand, p.url)} className="grid w-full grid-cols-[40px_1fr_auto] items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-surface">
                            <Thumb src={imgFor(p.key)} />
                            <span className="min-w-0 text-[12.5px] leading-snug">{shortName(p.label, p.brand)}{s ? <span className="ml-2 text-[11px] text-muted">{tr(`#${s.rank} on shelf`, `진열 ${s.rank}위`)}</span> : null}<span className="mt-0.5 block"><Sparkline values={p.spark} color={c} width={120} height={20} /></span></span>
                            <span className="text-right text-[12.5px]"><b className="tabular">{p.last3 === null ? <Missing>{tr("partial", "일부")}</Missing> : compact(p.last3)}</b><span className="block"><Change g={p.growth} vol={p.last3} market={mkt} /></span></span>
                          </button>); })}</div>
                      </>) })} className={`grid w-full grid-cols-[minmax(170px,1.4fr)_110px_1fr_80px_100px] items-center border-b border-line px-4 py-2 text-left transition hover:bg-sunken/50 ${isA(b.brand) ? "bg-accent-soft/50" : ""}`}>
                        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: colors[b.brand] ?? "#d9d7cf" }} /><span className={`text-[13.5px] ${isA(b.brand) ? "font-semibold" : "font-medium"}`}>{b.brand} <span className="text-muted">›</span></span><span className="text-[11px] text-muted">{tiers.inSet(b.brand) ? ORIGIN_LABEL[origin.get(b.brand) ?? "unknown"] : tr("not in focus set", "주요 브랜드 외")}</span></span>
                        <Sparkline values={b.spark} color={c} width={96} height={24} />
                        <span className="flex items-center gap-2 pr-4"><b className="w-12 text-[13.5px] tabular">{b.last3 === null ? <Missing>{tr("partial", "일부")}</Missing> : compact(b.last3)}</b><span className="h-1.5 flex-1 rounded-full bg-sunken"><span className="block h-1.5 rounded-full" style={{ width: `${Math.min(100, ((b.last3 ?? 0) / maxL) * 100)}%`, background: c }} /></span></span>
                        <span className="text-right text-[12.5px] text-ink-2 tabular">{b.prev3 === null ? <Missing>{tr("partial", "일부")}</Missing> : compact(b.prev3)}</span>
                        <span className="pl-3"><Change g={b.growth} vol={b.last3} market={mkt} /></span>
                      </button>
                    );
                  }} />
                </div></Card>
                <Basis className="mt-1.5">{tr(`Change = reviews ${period}. Green = growing faster than all tracked products (${signed(mkt)}), red = slower. “Small base” = under 30 reviews in 3 months.`, `변화 = ${period} 리뷰. 초록 = 시장(${signed(mkt)})보다 빠른 성장, 빨강 = 느린 성장. “표본 적음” = 3개월 리뷰 30건 미만.`)}</Basis>
              </div>
              <div className="min-w-0">
                <div className="mb-2 text-[14px] font-semibold">{tr("Top products by demand", "수요 상위 제품")} <span className="text-[12px] font-normal text-muted">· {tr("focus brands; search for others", "주요 브랜드. 다른 브랜드는 검색")}</span></div>
                <Card className="overflow-hidden">
                  <div className="grid grid-cols-[20px_36px_1fr_auto] gap-2.5 border-b border-line px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted"><span>#</span><span /><span>{tr("Product", "제품")}</span><span className="text-right">{tr(`Reviews · vs ${dw.prior}`, `리뷰 · ${dw.prior} 대비`)}</span></div>
                  <TieredList rows={topProducts} brandOf={(p) => p.brand} tiers={tiers} top={10} noun={tr("products", "제품")} setNoun={tr("focus-brand products", "주요 브랜드 제품")} render={(p, i) => (
                    <button key={p.key} onClick={() => openProduct(p.key, p.label, p.brand, p.url)} className={`grid w-full grid-cols-[20px_36px_1fr_auto] items-center gap-2.5 border-b border-line px-4 py-1.5 text-left hover:bg-sunken/50 ${isA(p.brand) ? "bg-accent-soft/50" : ""}`}>
                      <span className="text-[11.5px] text-muted tabular">{i + 1}</span>
                      <Thumb src={imgFor(p.key)} />
                      <span className="min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-2">{p.brand}</span><span className="block truncate text-[12.5px] leading-snug">{shortName(p.label, p.brand)}</span></span>
                      <span className="text-right text-[12.5px] tabular"><b>{compact(p.last3)}</b><span className={`block text-[11px] ${p.growth === null ? "text-muted" : mkt !== null && p.growth >= mkt ? "text-good" : "text-bad"}`}>{p.growth === null ? (p.prev3 ? tr("partial history", "이력 일부") : tr(`new: no ${dw.prior}`, `신규: ${dw.prior} 없음`)) : signed(p.growth)}</span></span>
                    </button>
                  )} />
                </Card>
                <Basis className="mt-1.5">{tr(`Reviews in the last 3 complete months; change = ${period}. “New” = no reviews in ${dw.prior}, so no growth rate.`, `최근 완결된 3개월 리뷰. 변화 = ${period}. “신규” = ${dw.prior} 리뷰가 없어 성장률 없음.`)}</Basis>
              </div>
            </div>
          </ActionSection>

          <ActionSection id="sos" kicker={tr("Search vs demand · a leading signal", "검색 vs 수요 · 선행 신호")} title={tr(`${ahead.length ? `${ahead.map((x) => x.brand).join(", ")} take more of search than of demand, a sign they are set to grow` : "No focus brand's search share clearly runs ahead of its demand"}${anchorSos ? `; ${A} is ${anchorSos.excess > 0.005 ? "ahead" : anchorSos.excess < -0.005 ? "behind" : "level"} (${pct(anchorSos.search)} of search vs ${pct(anchorSos.demand)} of demand)` : ""}.`,
              `${ahead.length ? `${ahead.map((x) => x.brand).join(", ")}는 수요보다 검색에서 더 큰 비중을 차지합니다. 성장이 이어질 신호입니다` : "검색 점유율이 수요를 뚜렷이 앞서는 주요 브랜드는 없습니다"}${anchorSos ? `. ${A}: ${anchorSos.excess > 0.005 ? "검색이 앞섬" : anchorSos.excess < -0.005 ? "검색이 뒤처짐" : "비슷함"} (검색 ${pct(anchorSos.search)}, 수요 ${pct(anchorSos.demand)})` : ""}.`)}
            note={tr(<>Research on share of search (Les Binet) found that a brand whose share of search runs ahead of its share of sales tends to grow next; one behind tends to lose ground. Here, demand = reviews.</>, <>검색 점유율 연구(Les Binet)에 따르면, 검색 점유율이 판매 점유율보다 앞서는 브랜드는 이후 성장하는 경향이 있고, 뒤처지는 브랜드는 점유율을 잃는 경향이 있습니다. 여기서 수요 = 리뷰.</>)}>
            <div className="mb-3 grid gap-2 md:grid-cols-3">
              {(tr([["1", "Share of search", "Who shoppers find: the brand's share of unpaid top-10 results across today's keywords."], ["2", "Share of demand", "Who buyers choose: the brand's share of reviews in the last 3 complete months."], ["3", "The gap", "Search ahead of demand (green dot to the right) usually comes before growth; behind usually comes before decline."]],
                [["1", "검색 점유율", "소비자가 찾는 브랜드: 오늘 키워드 전체의 비광고 상위 10개 결과 중 브랜드 비중."], ["2", "수요 점유율", "구매자가 선택하는 브랜드: 최근 완결된 3개월 리뷰 중 브랜드 비중."], ["3", "격차", "검색이 수요보다 앞서면(초록 점이 오른쪽) 대개 성장이 뒤따르고, 뒤처지면 대개 하락이 뒤따릅니다."]])).map(([n, t, d]) => (
                <div key={n} className="flex gap-3 rounded-[14px] bg-sunken/60 px-4 py-3"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-[12px] font-semibold text-on-brand">{n}</span><span className="text-[12.5px] leading-snug"><b className="block text-[13px]">{t}</b><span className="text-ink-2">{d}</span></span></div>
              ))}
            </div>
            <Card className="overflow-x-auto">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[minmax(160px,1fr)_minmax(260px,2fr)_110px] border-b border-line px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                  <span>{tr("Brand", "브랜드")}</span><span className="flex items-center gap-4"><span className="flex items-center gap-1.5 normal-case tracking-normal"><span className="h-2.5 w-2.5 rounded-full bg-good" />{tr("share of search", "검색 점유율")}</span><span className="flex items-center gap-1.5 normal-case tracking-normal"><span className="h-2.5 w-2.5 rounded-full bg-accent-strong" />{tr("share of demand", "수요 점유율")}</span></span><span className="text-right">{tr("Gap", "격차")}</span>
                </div>
                <TieredList rows={sos} brandOf={(x) => x.brand} tiers={tiers} top={12} render={(x) => {
                  const mx = Math.max(0.01, ...sos.filter((s) => tiers.inSet(s.brand)).map((s) => Math.max(s.search, s.demand)));
                  const l = (v: number) => `${Math.min(100, (v / mx) * 100)}%`; const lo = Math.min(x.search, x.demand); const hi = Math.max(x.search, x.demand);
                  return (
                    <div key={x.brand} className={`grid grid-cols-[minmax(160px,1fr)_minmax(260px,2fr)_110px] items-center border-b border-line px-4 py-2 text-[12.5px] ${isA(x.brand) ? "bg-accent-soft/50 font-semibold" : ""}`}>
                      <span>{x.brand} <span className="text-[11px] font-normal text-muted">{!tiers.inSet(x.brand) ? tr("not in focus set", "주요 브랜드 외") : !x.tracked ? tr("demand not tracked", "수요 추적 안 됨") : launchOf(x.brand) ? tr(`launched ${launchOf(x.brand)}: demand is the launch push`, `${launchOf(x.brand)} 출시: 수요는 출시 효과`) : ""}</span></span>
                      <span className="relative mr-4 h-5">
                        <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
                        <span className={`absolute top-1/2 h-1 -translate-y-1/2 rounded ${x.excess >= 0 ? "bg-good/40" : "bg-bad/40"}`} style={{ left: l(lo), width: `calc(${l(hi)} - ${l(lo)})` }} />
                        <span title={tr(`Search ${pct(x.search)}`, `검색 ${pct(x.search)}`)} className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-good ring-2 ring-surface" style={{ left: l(x.search) }} />
                        <span title={tr(`Demand ${pct(x.demand)}`, `수요 ${pct(x.demand)}`)} className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-strong ring-2 ring-surface" style={{ left: l(x.demand) }} />
                      </span>
                      <span className={`text-right tabular ${x.excess > 0.005 ? "text-good" : x.excess < -0.005 ? "text-bad" : "text-ink-2"}`}>{x.excess > 0 ? "+" : ""}{(x.excess * 100).toFixed(1)}{tr(" pts", "%p")}<span className="block text-[10.5px] font-normal text-muted">{pct(x.search)} vs {pct(x.demand)}</span></span>
                    </div>
                  );
                }} />
              </div>
              <Basis className="border-t border-line px-4 py-2.5">{tr(`Search: unpaid top 10 of ${keywords.length} keywords on ${latest ? day(latest) : "the latest day"}. Demand: reviews in the last 3 complete months. Indicative: one day of search against three months of reviews.${behind.length ? ` Furthest behind among the focus brands: ${behind.map((b) => b.brand).join(", ")}.` : ""}`,
                `검색: ${latest ? day(latest) : "최근일"} 키워드 ${keywords.length}개의 비광고 상위 10개. 수요: 최근 완결된 3개월 리뷰. 하루치 검색과 3개월 리뷰를 비교한 참고 지표입니다.${behind.length ? ` 주요 브랜드 중 가장 뒤처진 곳: ${behind.map((b) => b.brand).join(", ")}.` : ""}`)}</Basis>
            </Card>
          </ActionSection>

          <ActionSection id="search" kicker={tr("Search · who shoppers find", "검색 · 소비자가 만나는 브랜드")} title={tr(`${A} reaches the unpaid top 10 on ${keywords.length - absent} of ${keywords.length} keywords; ${grid.cols[1] ? `${grid.cols[1]} reaches ${grid.reach(grid.cols[1])}` : ""}.`, `${josa(A, "은/는")} 키워드 ${keywords.length}개 중 ${keywords.length - absent}개에서 비광고 상위 10위에 듭니다${grid.cols[1] ? `. ${josa(grid.cols[1], "은/는")} ${grid.reach(grid.cols[1])}개` : ""}.`)}
            note={tr("Unpaid results are the same for every shopper. The grid shows each brand's best unpaid place per keyword (· = not in the top 10; AD = it also bought a slot). Click a keyword to see its results.", "비광고 결과는 모든 소비자에게 같습니다. 표는 키워드별 각 브랜드의 최고 비광고 순위입니다 (· = 상위 10위 밖, AD = 광고 자리도 구매). 키워드를 누르면 결과가 나옵니다.")}>
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[12.5px]">
                <thead><tr className="border-b border-line">
                  <th className="sticky left-0 bg-surface px-4 py-2.5 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">{tr("Keyword", "키워드")}</th>
                  {grid.cols.map((b) => <th key={b} className={`px-1.5 py-2.5 text-center text-[11px] font-semibold ${isA(b) ? "text-accent-strong" : "text-ink-2"}`}><span className="block max-w-[78px] truncate" title={b}>{b}</span><span className="block text-[10px] font-normal text-muted">{tr(`${grid.reach(b)} kw`, `${grid.reach(b)}개`)}</span></th>)}
                </tr></thead>
                <tbody>{keywords.map((k) => (
                  <tr key={k} onClick={() => setKw(k)} className={`cursor-pointer border-b border-line last:border-0 hover:bg-sunken/50 ${active === k ? "bg-sunken/70" : ""}`}>
                    <td className="sticky left-0 bg-surface px-4 py-1.5"><span className="font-medium">{k}</span>{!CORE.includes(k) && <span className="ml-1.5 text-[10.5px] text-muted">{tr("suggested", "추천어")}</span>}</td>
                    {grid.cols.map((b) => { const c = grid.pos.get(k)?.get(norm(b)); const r = c?.rank ?? null;
                      return <td key={b} className={`px-1.5 py-1.5 text-center ${isA(b) ? "bg-accent-soft/40" : ""}`}>
                        {r ? <span className={`inline-grid h-6 min-w-6 place-items-center rounded-md px-1 text-[11.5px] font-semibold tabular ${r <= 3 ? "bg-brand text-on-brand" : r <= 5 ? "bg-brand/60 text-on-brand" : "bg-brand/15 text-ink"}`}>{r}</span> : <span className="text-faint">·</span>}
                        {c?.ad && <span className="ml-0.5 align-top text-[9px] font-semibold text-warn">AD</span>}
                      </td>; })}
                  </tr>))}</tbody>
              </table>
            </Card>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <Card className="min-w-0 p-4">
                <div className="mb-1 px-2 text-[14px] font-semibold">{tr("Top 5 unpaid", "비광고 상위 5")} · &ldquo;{active}&rdquo;</div>
                <div className="mb-2 px-2 text-[12px] text-muted">{latest ? day(latest) : ""} · {cur.unpaid[0]?.total_found ? tr(`${cur.unpaid[0].total_found} results on Nykaa`, `Nykaa 검색 결과 ${cur.unpaid[0].total_found}개`) : tr("redirects to a category or brand page", "카테고리 또는 브랜드 페이지로 이동")}</div>
                {cur.unpaid.slice(0, 5).map((r, i) => <Tile key={r.product_id} r={r} pos={i + 1} />)}
              </Card>
              <Card className="min-w-0 p-4">
                <div className="mb-1 px-2 text-[14px] font-semibold">{tr("Paid slots today", "오늘 광고 자리")} · &ldquo;{active}&rdquo;</div>
                <div className="mb-2 px-2 text-[12px] text-muted">{cur.ads.length ? tr(`${cur.ads.length} AD tiles in the first 20 results`, `첫 20개 결과 중 광고 ${cur.ads.length}개`) : tr("No ads on this keyword today", "오늘 이 키워드에 광고 없음")}</div>
                {cur.ads.slice(0, 6).map((r, i) => <Tile key={`${r.product_id}-${i}`} r={r} pos={i + 1} paid />)}
              </Card>
            </div>
            <Card className="mt-4 overflow-hidden">
              <div className="grid grid-cols-[minmax(180px,1.5fr)_1fr_1fr] border-b border-line px-5 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted"><span>{tr("Unpaid places by brand, all keywords", "브랜드별 비광고 자리, 전체 키워드")}</span><span>{tr("Top 5", "상위 5")}</span><span>{tr("Top 10", "상위 10")}</span></div>
              <TieredList rows={sov.filter((s) => s.top10 > 0).sort((a, b) => (isA(a.brand) ? -1 : isA(b.brand) ? 1 : b.top5 - a.top5 || b.top10 - a.top10))} brandOf={(s) => s.brand} tiers={tiers} top={10} render={(s) => {
                const mx = Math.max(1, ...sov.map((x) => x.top5));
                return (
                  <div key={s.brand} className={`grid grid-cols-[minmax(180px,1.5fr)_1fr_1fr] items-center border-b border-line px-5 py-2 text-[13px] ${isA(s.brand) ? "bg-accent-soft/50 font-semibold" : ""}`}>
                    <span className="flex items-center gap-2"><span>{s.brand}</span><span className="text-[11px] font-normal text-muted">{tiers.inSet(s.brand) ? ORIGIN_LABEL[s.origin] : tr("not in focus set", "주요 브랜드 외")}</span></span>
                    <span className="flex items-center gap-2 pr-6 tabular"><b className="w-6">{s.top5}</b><span className="h-1.5 flex-1 rounded-full bg-sunken"><span className="block h-1.5 rounded-full bg-brand" style={{ width: `${(s.top5 / mx) * 100}%` }} /></span></span>
                    <span className="tabular">{s.top10} <span className="text-[11px] text-muted">{tr(`of ${keywords.length * 10}`, `/ ${keywords.length * 10}`)}</span></span>
                  </div>
                );
              }} />
            </Card>
          </ActionSection>

          <ActionSection id="ads" kicker={tr("Ads · who is paying for attention", "광고 · 누가 노출에 돈을 쓰나")} title={tr(`${topAdv?.brand ?? "No focus brand"} buys the most ad slots among the focus brands (${topAdv?.ads ?? 0} today, ${topAdv?.adDays ?? 0} keyword-days this week); ${A} holds ${anchorS?.ads ?? 0} today and ${anchorS?.adDays ?? 0} keyword-days.`,
              `주요 브랜드 중 광고 자리를 가장 많이 산 곳은 ${topAdv?.brand ?? "없음"}입니다(오늘 ${topAdv?.ads ?? 0}개, 이번 주 키워드-일 ${topAdv?.adDays ?? 0}). ${A}: 오늘 ${anchorS?.ads ?? 0}개, 키워드-일 ${anchorS?.adDays ?? 0}.`)}
            note={tr(<>A daily sample of the paid tiles Nykaa shows, not every shopper&rsquo;s view. <Opens detail={{ kicker: "Method", title: "How ads are sampled", body: <Points items={["Ads are what Nykaa showed our collector at about 07:00 IST from a data centre outside India.", "A 22 Sep test found identical ads across fresh sessions minutes apart, but different ads by location.", "Treat ad counts as a daily sample, comparable day to day, not as every shopper's view."]} /> }}>Method</Opens></>,
              <>Nykaa가 보여 주는 광고를 하루 한 번 표본으로 수집한 것이며, 모든 소비자의 화면은 아닙니다. <Opens detail={{ kicker: "방법", title: "광고 표본 수집 방법", body: <Points items={["광고는 인도 시간 오전 7시경, 인도 밖 데이터센터에서 접속한 수집기에 Nykaa가 보여 준 것입니다.", "9월 22일 테스트에서 몇 분 간격의 새 세션은 같은 광고를 받았지만, 위치가 다르면 광고도 달랐습니다.", "광고 수는 날짜끼리 비교할 수 있는 일일 표본으로 보세요. 모든 소비자의 화면은 아닙니다."]} /> }}>방법</Opens></>)}>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {keywords.map((k) => <button key={k} onClick={() => setKw(k)} className={`rounded-full px-3 py-1 text-[12.5px] transition ${active === k ? "bg-brand font-medium text-on-brand" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink"}`}>{k}</button>)}
            </div>
            <Card className="overflow-x-auto p-5">
              <div className="mb-1 text-[14px] font-semibold">{tr("Ad placements over time", "광고 노출 추이")} · &ldquo;{active}&rdquo;</div>
              <div className="mb-3 text-[12px] text-muted">{tr("AD tiles each brand held per day, focus brands first. Last row: the #1 unpaid result, for comparison.", "브랜드별 일일 광고 자리 수 (주요 브랜드 먼저). 마지막 줄은 비교용 비광고 1위 결과입니다.")}</div>
              <table className="w-full min-w-[620px] text-[12.5px] tabular">
                <thead><tr><th className="pb-2 pr-3 text-left font-medium text-muted">{tr("Brand", "브랜드")}</th>{adGrid.ds.map((d) => <th key={d} className="pb-2 text-center font-medium text-muted">{day(d)}</th>)}</tr></thead>
                <tbody>
                  {adGrid.brands.map(([b, m]) => (
                    <tr key={b} className={`border-t border-line ${isA(b) ? "bg-accent-soft/50" : ""}`}>
                      <td className="py-1.5 pr-3 font-medium">{b}{!tiers.inSet(b) && <span className="ml-1.5 text-[10.5px] font-normal text-muted">{tr("not in focus set", "주요 브랜드 외")}</span>}</td>
                      {adGrid.ds.map((d) => { const n = m.get(d) ?? 0; return <td key={d} className="py-1.5 text-center">{n ? <span className="inline-grid h-6 w-6 place-items-center rounded-md text-[11.5px] font-semibold text-white" style={{ background: `rgba(217,154,30,${0.5 + Math.min(n, 3) * 0.16})` }}>{n}</span> : <span className="text-line-2">·</span>}</td>; })}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-line"><td className="py-1.5 pr-3 text-muted">{tr("#1 unpaid", "비광고 1위")}</td>{adGrid.unpaid1.map((b, i) => <td key={i} className="py-1.5 text-center text-[11px] text-ink-2">{b ?? <Missing>{tr("not collected", "미수집")}</Missing>}</td>)}</tr>
                </tbody>
              </table>
              {adGrid.brands.length === 0 && <p className="mt-2 text-[12.5px] text-muted">{tr("No ads recorded on this keyword.", "이 키워드에 기록된 광고가 없습니다.")}</p>}
            </Card>
            <Card className="mt-4 overflow-hidden">
              <div className="grid grid-cols-[minmax(180px,1.5fr)_1fr_1fr_1fr] border-b border-line px-5 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted"><span>{tr("Ads by brand, all keywords", "브랜드별 광고, 전체 키워드")}</span><span>{tr("Ad slots today", "오늘 광고 자리")}</span><span>{tr("Ad keyword-days, 7 d", "광고 키워드-일, 7일")}</span><span>{tr("Unpaid top 10 today", "오늘 비광고 상위 10")}</span></div>
              <TieredList rows={[...sov].filter((s) => s.ads || s.adDays || isA(s.brand)).sort((a, b) => (isA(a.brand) ? -1 : isA(b.brand) ? 1 : b.adDays - a.adDays || b.ads - a.ads))} brandOf={(s) => s.brand} tiers={tiers} top={10} render={(s) => {
                const mx = Math.max(1, ...sov.map((x) => x.adDays));
                return (
                  <div key={s.brand} className={`grid grid-cols-[minmax(180px,1.5fr)_1fr_1fr_1fr] items-center border-b border-line px-5 py-2 text-[13px] ${isA(s.brand) ? "bg-accent-soft/50 font-semibold" : ""}`}>
                    <span className="flex items-center gap-2"><span>{s.brand}</span>{!tiers.inSet(s.brand) && <span className="text-[11px] font-normal text-muted">{tr("not in focus set", "주요 브랜드 외")}</span>}</span>
                    <span className="tabular">{s.ads || <span className="text-muted">0</span>}</span>
                    <span className="flex items-center gap-2 pr-6 tabular"><b className="w-6">{s.adDays}</b><span className="h-1.5 flex-1 rounded-full bg-sunken"><span className="block h-1.5 rounded-full bg-[#d99a1e]" style={{ width: `${(s.adDays / mx) * 100}%` }} /></span></span>
                    <span className="tabular text-ink-2">{s.top10}</span>
                  </div>
                );
              }} />
            </Card>
          </ActionSection>

          <ActionSection id="suggest" kicker={tr("What shoppers type", "소비자 검색어")} title={typed.topGeneric.length ? tr(`When shoppers type a category, Nykaa suggests ${typed.topGeneric[0][0]}'s products most (${typed.topGeneric[0][1]} of ${typed.genericSlots} product suggestions); ${A} gets ${typed.anchorGeneric}.`, `소비자가 카테고리를 입력하면 Nykaa는 ${typed.topGeneric[0][0]} 제품을 가장 많이 추천합니다(제품 추천 ${typed.genericSlots}개 중 ${typed.topGeneric[0][1]}개). ${A}: ${typed.anchorGeneric}개.`) : tr("Nykaa's suggestions as shoppers type.", "소비자가 입력할 때 Nykaa가 보여 주는 추천.")}
            note={tr("Nykaa's search box suggests products and searches before a shopper finishes typing, which shapes what they look at first. Read daily for 39 starting words: 16 category words and 23 brand names.", "Nykaa 검색창은 소비자가 입력을 마치기 전에 제품과 검색어를 추천하며, 이것이 처음 보는 것을 좌우합니다. 시작 단어 39개(카테고리 16개, 브랜드명 23개)로 매일 수집합니다.")}>
            {!sugg.data ? <Loading what={tr("suggestions", "추천 검색어")} /> : (
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="p-4">
                  <div className="text-[13.5px] font-semibold">{tr("Whose products Nykaa suggests for category words", "카테고리 입력 시 Nykaa가 추천하는 브랜드")}</div>
                  <Basis className="mb-2">{tr(<>Product suggestions for {typed.genericSeeds.length} category words (&ldquo;serum&rdquo;, &ldquo;sunscreen&rdquo;…), today</>, <>카테고리 단어 {typed.genericSeeds.length}개(&ldquo;serum&rdquo;, &ldquo;sunscreen&rdquo;…)에 대한 오늘의 제품 추천</>)}</Basis>
                  {typed.topGeneric.slice(0, 8).map(([b, n]) => (
                    <div key={b} className={`grid grid-cols-[1fr_1.2fr_28px] items-center gap-2 py-1 text-[12.5px] ${isA(b) ? "font-semibold" : ""}`}>
                      <span className="truncate">{b}{!tiers.inSet(b) && <span className="ml-1 text-[10.5px] font-normal text-muted">{tr("other", "기타")}</span>}</span>
                      <span className="h-1.5 rounded-full bg-sunken"><span className={`block h-1.5 rounded-full ${isA(b) ? "bg-accent-strong" : "bg-brand/70"}`} style={{ width: `${(n / typed.topGeneric[0][1]) * 100}%` }} /></span>
                      <span className="text-right tabular">{n}</span>
                    </div>
                  ))}
                  {!typed.topGeneric.some(([b]) => isA(b)) && <p className="mt-1 text-[12px] text-bad">{tr(`${A}: none of today’s category suggestions.`, `${A}: 오늘 카테고리 추천에 없음.`)}</p>}
                </Card>
                <Card className="p-4">
                  <div className="text-[13.5px] font-semibold">{tr("What shoppers pair with each brand", "소비자가 브랜드와 함께 찾는 것")}</div>
                  <Basis className="mb-2">{tr("Searches Nykaa suggests after a brand name: the categories shoppers link it with", "브랜드명 뒤에 Nykaa가 추천하는 검색어: 소비자가 그 브랜드와 연결하는 카테고리")}</Basis>
                  {typed.pairs.slice(0, 7).map(([b, qs]) => (
                    <div key={b} className={`border-b border-line py-1.5 text-[12.5px] last:border-0 ${isA(b) ? "font-semibold" : ""}`}>
                      <span>{b}</span>
                      <span className="mt-0.5 flex flex-wrap gap-1">{qs.length ? qs.map((q) => <span key={q} className="rounded-full bg-sunken px-2 py-0.5 text-[11.5px] font-normal text-ink-2">{q}</span>) : <Missing>{tr("no suggested searches", "추천 검색어 없음")}</Missing>}</span>
                    </div>
                  ))}
                </Card>
                <Card className="p-4">
                  <div className="text-[13.5px] font-semibold">{tr("New this week", "이번 주 신규")}</div>
                  <Basis className="mb-2">{tr("Suggested searches seen in the last 7 days but not in the 7 days before", "최근 7일에는 나왔지만 그 전 7일에는 없던 추천 검색어")}</Basis>
                  {typed.fresh.length ? <div className="flex flex-wrap gap-1.5">{typed.fresh.slice(0, 24).map((f) => <span key={f.s + f.seed} title={tr(`after "${f.seed || "popular"}"`, `"${f.seed || "인기"}" 입력 후`)} className={`rounded-full px-2.5 py-1 text-[12px] ${typed.mentionsFocus(f.s) ? "bg-accent-soft text-accent-strong" : "bg-sunken text-ink-2"}`}>{f.s}</span>)}</div>
                    : <Missing>{suggHist.data ? tr("No new terms this week", "이번 주 신규 검색어 없음") : tr("Loading history…", "이력 불러오는 중…")}</Missing>}
                  <Basis className="mt-2">{tr("Blue = names a focus brand.", "파랑 = 주요 브랜드 이름 포함.")}</Basis>
                </Card>
              </div>
            )}
            <button onClick={() => detail({ kicker: tr("What shoppers type", "소비자 검색어"), title: tr("Every suggestion today, by starting word", "시작 단어별 오늘의 전체 추천"), body: (
              <div className="space-y-4">{typed.bySeed.map(([seed, ss]) => (
                <div key={seed || "popular"}>
                  <div className="text-[13px] font-semibold">{seed ? tr(<>Typing &ldquo;{seed}&rdquo;</>, <>&ldquo;{seed}&rdquo; 입력 시</>) : tr("Popular searches on Nykaa", "Nykaa 인기 검색어")}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">{ss.filter((s) => s.kind !== "product").sort((a, b) => a.position - b.position).map((s) => <span key={`${s.kind}${s.position}`} className="rounded-full bg-sunken px-2.5 py-1 text-[12px] text-ink-2">{s.suggestion}</span>)}</div>
                  {ss.some((s) => s.kind === "product") && <div className="mt-1 text-[11.5px] text-muted">{tr("Products", "제품")}: {ss.filter((s) => s.kind === "product").sort((a, b) => a.position - b.position).map((s) => s.suggestion.split(" ").slice(0, 4).join(" ")).join(" · ")}</div>}
                </div>))}</div>
            ) })} className="mt-3 rounded-lg px-3 py-1.5 text-[12.5px] text-ink-2 ring-1 ring-line hover:bg-surface">{tr("See every suggestion ›", "전체 추천 보기 ›")}</button>
          </ActionSection>
        </>
      )}
    </Shell>
  );

  function Tile({ r, pos, paid }: { r: SearchRow; pos: number; paid?: boolean }) {
    return (
      <button onClick={() => open({ product_id: r.product_id, name: r.name, brand: r.brand, image: imgFor(r.product_id), price: r.price, url: `https://www.nykaa.com/search/result/?q=${encodeURIComponent(r.name)}` })}
        className={`group flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-sunken/60 ${isA(r.brand) ? "bg-accent-soft/50" : ""}`}>
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${paid ? "bg-warn-soft text-warn" : "bg-brand text-on-brand"}`}>{paid ? "AD" : pos}</span>
        <Thumb src={imgFor(r.product_id)} />
        <span className="min-w-0 flex-1">
          <span className="block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-2">{r.brand}{tiers.inSet(r.brand) && <span className="ml-1.5 rounded bg-sunken px-1 text-[10px] text-muted">{tr("focus", "주요")}</span>}</span>
          <span className="block text-[12.5px] leading-snug group-hover:underline">{shortName(r.name, r.brand)}</span>
        </span>
        <span className="text-[12px] text-ink-2 tabular">{inr(r.price)}</span>
      </button>
    );
  }
}

/** What the autosuggest data can actually tell us: whose products Nykaa puts in front of shoppers typing a
 *  category, which categories shoppers pair with each brand, and which terms are new this week. */
function suggestionInsights(latest: Suggestion[], history: Suggestion[], known: string[], anchor: string, inSet: (b: string) => boolean) {
  const brandSeeds = new Set(known.map(norm));
  const bySeedMap = new Map<string, Suggestion[]>(); latest.forEach((s) => push(bySeedMap, s.seed, s));
  const bySeed = [...bySeedMap.entries()].sort((a, b) => (a[0] === "" ? -1 : b[0] === "" ? 1 : a[0].localeCompare(b[0])));
  const isBrandSeed = (seed: string) => brandSeeds.has(norm(seed)) || [...brandSeeds].some((k) => k.startsWith(norm(seed)) && norm(seed).length >= 4);
  const genericSeeds = bySeed.map(([s]) => s).filter((s) => s && !isBrandSeed(s));
  const byLen = [...known].sort((a, b) => b.length - a.length);
  const brandOf = (text: string) => byLen.find((b) => norm(text).startsWith(norm(b))) ?? null;
  const counts = new Map<string, number>(); let genericSlots = 0;
  for (const seed of genericSeeds) for (const s of bySeedMap.get(seed) ?? []) {
    if (s.kind !== "product") continue; genericSlots++;
    const b = brandOf(s.suggestion); if (b) counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  const topGeneric = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const pairs = bySeed.filter(([seed]) => seed && isBrandSeed(seed)).map(([seed, ss]) => {
    const b = known.find((k) => norm(k) === norm(seed)) ?? known.find((k) => norm(k).startsWith(norm(seed))) ?? seed;
    const qs = ss.filter((s) => s.kind === "query" || s.kind === "search").map((s) => s.suggestion.replace(new RegExp(`^${seed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*`, "i"), "").trim()).filter(Boolean);
    return [b, [...new Set(qs)].slice(0, 5)] as [string, string[]];
  }).filter(([b]) => inSet(b)).sort((a, b) => (same(a[0], anchor) ? -1 : same(b[0], anchor) ? 1 : 0));
  const days = [...new Set(history.map((h) => h.scrape_date))].sort();
  const last = days.at(-1); const cut = last ? new Date(new Date(last).getTime() - 7 * 864e5).toISOString().slice(0, 10) : "";
  const before = new Set(history.filter((h) => h.scrape_date <= cut).map((h) => norm(h.suggestion)));
  // only starting words tracked in both weeks: a newly added word would make all its terms look new
  const oldSeeds = new Set(history.filter((h) => h.scrape_date <= cut).map((h) => h.seed));
  const fresh = days.length >= 9 ? [...new Map(history.filter((h) => h.scrape_date > cut && oldSeeds.has(h.seed) && !before.has(norm(h.suggestion))).map((h) => [norm(h.suggestion), { s: h.suggestion, seed: h.seed }])).values()] : [];
  const mentionsFocus = (t: string) => known.some((b) => inSet(b) && norm(t).includes(norm(b)));
  return { bySeed, genericSeeds, topGeneric, genericSlots, anchorGeneric: counts.get(known.find((k) => same(k, anchor)) ?? anchor) ?? 0, pairs, fresh, mentionsFocus };
}

export default function Page() {
  return <AuthGate><DemandPage /></AuthGate>;
}
