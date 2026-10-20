"use client";

import { TrackedLink } from "@/components/TrackedProducts";
import MethodNotes from "@/components/MethodNotes";
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
import { MoMInline } from "@/components/MonthOnMonth";
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
import { dayMonth, monthYY, tr } from "@/lib/i18n";
import { ScopeLine } from "@/components/Scope";

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
  { id: "summary", label: tr("Summary", "요약") }, { id: "demand", label: tr("Written reviews", "작성 리뷰") },
  { id: "search", label: tr("Search", "검색") }, { id: "ads", label: tr("Ads", "광고") }, { id: "suggest", label: tr("What shoppers type", "소비자 검색어") }, { id: "method", label: tr("How this page works", "계산 방법") },
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
    return { ...b, last3: rs.reduce((a, r) => a + r.recent, 0), prev3: g.products ? g.prior : null, same3: g.products ? g.recent : null, growth: g.growth };
  }).sort((a, b) => (b.last3 ?? -1) - (a.last3 ?? -1)), [data, aggBy]);
  const products = useMemo(() => demandLines(data, "product").map((p) => {
    const r = rowBy.get(p.key); if (!r) return p;
    return { ...p, last3: r.recent, prev3: r.complete ? r.prior : null, same3: r.complete ? r.recent : null, growth: r.complete && r.prior > 0 ? r.recent / r.prior - 1 : null };
  }).sort((a, b) => (b.last3 ?? -1) - (a.last3 ?? -1)), [data, rowBy]);
  const market = useMemo(() => {
    const m = demandLines(data.map((x) => ({ ...x, brand: tr("All tracked brands", "추적 전체 브랜드") })), "brand")[0] as DemandLine | undefined; if (!m) return m;
    const g = growthOf(drows); return { ...m, last3: drows.reduce((a, r) => a + r.recent, 0), prev3: g.prior, same3: g.recent, growth: g.growth };
  }, [data, drows]);
  const origin = useMemo(() => { const m = new Map<string, string>(); (shelf.data ?? []).forEach((r) => m.set(r.brand, r.origin)); return m; }, [shelf.data]);
  const win = monthsWindow(12);
  const dw = demandWindow(); const period = `${dw.recent} vs ${dw.prior}`;
  const mkt = market?.growth ?? null;
  const solid = (b: DemandLine) => b.growth !== null && (b.last3 ?? 0) >= 60;
  const focusLines = brands.filter((b) => tiers.inSet(b.brand) && !isA(b.brand));
  const risers = focusLines.filter(solid).sort((a, b) => b.growth! - a.growth!);
  const up = risers[0]; const dn = risers.at(-1);
  const outliers = brands.filter((b) => !tiers.inSet(b.brand) && b.growth !== null && (b.last3 ?? 0) >= 60 && (b.prev3 ?? 0) >= 20 && Math.abs(b.growth) >= 0.5).sort((a, b) => Math.abs(b.growth!) - Math.abs(a.growth!)).slice(0, 3);
  const anchorD = brands.find((b) => isA(b.brand));
  const setRanked = brands.filter((b) => tiers.inSet(b.brand) && b.last3 !== null).sort((a, b) => (b.last3 ?? 0) - (a.last3 ?? 0));
  const anchorRank = setRanked.findIndex((b) => isA(b.brand)) + 1;
  const demTot = brands.reduce((a, b) => a + (b.last3 ?? 0), 0);
  const topProducts = products.filter((p) => p.last3 !== null);
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
  // the real number of unpaid top-10 places today: a keyword with fewer unpaid results has fewer places (audit 19 Oct:
  // "18 of 250" while "korean beauty lipstick" shows 5 unpaid results, so 245, as the K-beauty tab counts)
  const places10 = useMemo(() => [...byKw.values()].reduce((a, rs) => a + Math.min(10, split(rs).unpaid.length), 0), [byKw]);
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
  // owner 20 Oct: the ad timeline opens on two weeks by day and widens to everything collected, by day or by week
  const [adSpan, setAdSpan] = useState<number>(14); const [adWeekly, setAdWeekly] = useState(false); const [adAll, setAdAll] = useState(false);
  const adGrid = useMemo(() => {
    const ds = adSpan ? days.slice(-adSpan) : days; const inKw = (r: SearchRow) => adAll || r.query === active;
    // a column is a day, or a Monday-to-Sunday week (key = its Monday)
    const col = (d: string) => { if (!adWeekly) return d; const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7)); return t.toISOString().slice(0, 10); };
    const cols = [...new Set(ds.map(col))]; const daysIn = new Map(cols.map((c) => [c, ds.filter((d) => col(d) === c)]));
    const bs = new Map<string, Map<string, number>>();
    rows.filter((r) => inKw(r) && r.is_ad && ds.includes(r.scrape_date)).forEach((r) => {
      const c = col(r.scrape_date); const m = bs.get(r.brand) ?? new Map<string, number>(); m.set(c, (m.get(c) ?? 0) + 1); bs.set(r.brand, m);
    });
    // last row: the #1 unpaid brand (one keyword), or the brand most often #1 that day or week (all keywords, or a week)
    const unpaid1 = cols.map((c) => {
      const tally = new Map<string, number>();
      for (const d of daysIn.get(c)!) { const by = new Map<string, SearchRow[]>(); rows.filter((r) => inKw(r) && r.scrape_date === d).forEach((r) => push(by, r.query, r)); for (const rs of by.values()) { const b = split(rs).unpaid[0]?.brand; if (b) tally.set(b, (tally.get(b) ?? 0) + 1); } }
      return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    });
    const total = (m: Map<string, number>) => [...m.values()].reduce((x, y) => x + y, 0);
    return { cols, daysIn, brands: [...bs.entries()].sort((a, b) => (tiers.order(a[0]) - tiers.order(b[0])) || total(b[1]) - total(a[1])), unpaid1, from: ds[0], to: ds[ds.length - 1], max: Math.max(1, ...[...bs.values()].flatMap((m) => [...m.values()])) };
  }, [rows, days, active, tiers, adSpan, adWeekly, adAll]);
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

  /* ---- what shoppers type */
  const typed = useMemo(() => suggestionInsights(sugg.data ?? [], suggHist.data ?? [], known, A, (b) => tiers.inSet(b)), [sugg.data, suggHist.data, known, A, tiers]);

  /* ---- verdict */
  const verdict = anchorD ? tr(`${A}'s written reviews are ${anchorD.growth === null ? "too thinly tracked to read" : `${anchorD.growth >= (mkt ?? 0) ? "growing faster than" : "lagging"} all products we follow (${signed(anchorD.growth)} vs ${signed(mkt)}; Nykaa beauty as a whole: see the Brief)`}, #${anchorRank} of ${setRanked.length} main brands by reviews; it reaches the unpaid top 10 on ${keywords.length - absent} of ${keywords.length} search keywords.`,
      `${A} 작성 리뷰: ${anchorD.growth === null ? "추적 데이터 부족으로 판단 어려움" : `추적 전체보다 ${anchorD.growth >= (mkt ?? 0) ? "빠르게 성장" : "뒤처짐"}(${signed(anchorD.growth)}, 추적 전체 ${signed(mkt)})`}, 리뷰 기준 주요 브랜드 ${setRanked.length}개 중 ${anchorRank}위. 검색어 ${keywords.length}개 중 ${keywords.length - absent}개에서 비광고 상위 10위 안.`) : "";
  const soWhat = !anchorD ? null : keywords.length > 0 && absent > keywords.length / 2 ? tr(`Search is the gap: ${A} is outside the unpaid top 10 on ${absent} of ${keywords.length} keywords. Winning those searches is the cheapest demand to add.`, `약점은 검색: ${A}는 키워드 ${keywords.length}개 중 ${absent}개에서 비광고 상위 10위 밖. 이 검색어를 가져오는 게 가장 적은 비용으로 수요를 늘리는 방법.`)
    : anchorD.growth !== null && mkt !== null && anchorD.growth < mkt ? tr(`Demand is losing momentum against all tracked products; check its top products' prices and stock first.`, `추적 전체 대비 리뷰 모멘텀 약화 중. 대표 제품의 가격·재고부터 확인.`)
    : tr(`${A} is found in most searches, and its written reviews are growing faster than all tracked products; protect the products driving it (${topProducts.find((p) => isA(p.brand)) ? shortName(topProducts.find((p) => isA(p.brand))!.label, A).split(/,| - /)[0] : "its leaders"}) and keep them in stock.`, `${A}: 대부분의 검색에서 노출되고, 작성 리뷰는 추적 전체보다 빠르게 성장 중. 성장을 이끄는 제품(${topProducts.find((p) => isA(p.brand)) ? shortName(topProducts.find((p) => isA(p.brand))!.label, A).split(/,| - /)[0] : "대표 제품"})의 노출·재고 유지.`);

  return (
    <Shell active="Demand" asOf={latest ? day(latest) : undefined}>
      <PageHead eyebrow={tr("Demand & search", "수요·검색")} title={tr("Demand & search", "수요·검색")} sub={tr(<>Who is gaining written reviews fastest (a 12-month trend, since ratings froze on 10 Oct), and who shoppers find when they search on Nykaa: unpaid results, paid ads, and what Nykaa suggests as they type. {A} against the {tiers.focus.length} main brands.</>, <>작성 리뷰가 가장 빠르게 느는 브랜드(12개월 추세)와, Nykaa 검색 시 소비자가 만나는 브랜드(비광고 결과, 광고, 입력 중 추천 검색어). 주요 브랜드 {tiers.focus.length}곳과 비교한 {A}.</>)} />
      <ScopeLine uses={["followed"]} measure={tr("growth in written reviews (the last 3 complete months against the same months a year earlier, same products only), and who appears in Nykaa search for the keywords we read nightly.", "작성 리뷰 성장률(최근 완결된 3개월 vs 전년 같은 달, 동일 제품만)과 매일 밤 수집하는 검색어의 Nykaa 검색 결과.")} />
      {(!months.data || !hist.data || !demandView.data) ? <Loading what={tr("demand and search data", "수요·검색 데이터")} /> : (
        <>
          <SectionNav items={NAV()} />

          <section id="summary" className="mt-6 scroll-mt-32">
            {verdict && <Verdict eyebrow={tr(<>Verdict for {A}</>, <>{A} 종합 판단</>)} points={(tr([
              <><b className="text-on-brand">Demand:</b> {compact(anchorD?.last3 ?? 0)} reviews in {dw.recent} ({pct((anchorD?.last3 ?? 0) / Math.max(1, demTot))} of all tracked reviews). Top {A} product: {topProducts.find((p) => isA(p.brand)) ? shortName(topProducts.find((p) => isA(p.brand))!.label, A) : "none tracked"}.</>,
              up && dn ? <><b className="text-on-brand">Main brands:</b> {up.brand} rose fastest ({signed(up.growth)}, {compact(up.prev3)} → {compact(up.same3 ?? up.last3)} reviews); {dn.brand} fell hardest ({signed(dn.growth)}, {compact(dn.prev3)} → {compact(dn.same3 ?? dn.last3)}).</> : null,
              <><b className="text-on-brand">Search:</b> outside the unpaid top 10 on {absent} of {keywords.length} keywords; {anchorS?.top5 ?? 0} unpaid top-5 places today.</>,
              <><b className="text-on-brand">Ads:</b> {anchorS?.ads ?? 0} of {totalAds} ad slots today; the main brands hold {pct(focusAds / Math.max(1, totalAds), 0)}, led by {topAdv?.brand ?? "none"} ({topAdv?.ads ?? 0}).</>,
            ], [
              <><b className="text-on-brand">작성 리뷰:</b> {dw.recent} 리뷰 {compact(anchorD?.last3 ?? 0)}건 (추적 전체 리뷰의 {pct((anchorD?.last3 ?? 0) / Math.max(1, demTot))}). {A} 대표 제품: {topProducts.find((p) => isA(p.brand)) ? shortName(topProducts.find((p) => isA(p.brand))!.label, A) : "추적 제품 없음"}.</>,
              up && dn ? <><b className="text-on-brand">주요 경쟁사:</b> 가장 빠른 상승: {up.brand}({signed(up.growth)}, 리뷰 {compact(up.prev3)} → {compact(up.same3 ?? up.last3)}건), 가장 큰 하락: {dn.brand}({signed(dn.growth)}, {compact(dn.prev3)} → {compact(dn.same3 ?? dn.last3)}건).</> : null,
              <><b className="text-on-brand">검색:</b> 키워드 {keywords.length}개 중 {absent}개에서 비광고 상위 10위 밖. 오늘 비광고 상위 5위 자리 {anchorS?.top5 ?? 0}개.</>,
              <><b className="text-on-brand">광고:</b> 오늘 광고 자리 {totalAds}개 중 {anchorS?.ads ?? 0}개. 주요 브랜드 {pct(focusAds / Math.max(1, totalAds), 0)}, 선두 {topAdv?.brand ?? "없음"}({topAdv?.ads ?? 0}개).</>,
            ]) as React.ReactNode[]).filter(Boolean)} foot={soWhat && <><b>{tr("So what:", "시사점:")}</b> {soWhat}</>}>{verdict}</Verdict>}
            {outliers.length > 0 && <p className="mt-3 text-[12.5px] text-ink-2"><span className="text-muted">{tr("Other notable movers, outside the main brands:", "주요 브랜드 외 눈에 띄는 변화:")}</span> {outliers.map((o, i) => <span key={o.brand}>{i ? "; " : ""}<b className="font-medium">{o.brand}</b> {signed(o.growth)} ({tr(`${compact(o.prev3)} → ${compact(o.same3 ?? o.last3)} reviews`, `리뷰 ${compact(o.prev3)} → ${compact(o.same3 ?? o.last3)}건`)})</span>)}.</p>}
          </section>

          <p className="mt-6 text-[13px] text-muted">{tr(<>Rank moves and their reasons now sit with the products: in <Link href="/categories/" className="underline underline-offset-2">Categories</Link> for each category, and on every brand and product page.</>, <>순위 변화와 이유는 이제 제품 옆에서 확인: <Link href="/categories/" className="underline underline-offset-2">카테고리</Link>별, 각 브랜드·제품 페이지.</>)}</p>

          <ActionSection id="demand" kicker={tr("Written reviews · who is gaining fastest", "작성 리뷰 · 가장 빨리 느는 브랜드")} title={tr(`${up ? `Among the main brands, ${up.brand} is rising fastest (${signed(up.growth)}) and ${dn?.brand} falling hardest (${signed(dn?.growth)})` : "Written reviews by brand"}; ${A} is ${anchorD?.growth != null ? `${signed(anchorD.growth)} against all tracked products' ${signed(mkt)}` : "not tracked"}.`,
              `${up ? `주요 브랜드 중 ${up.brand} 가장 빠르게 상승(${signed(up.growth)}), ${dn?.brand ?? ""} 가장 크게 하락(${signed(dn?.growth)})` : "브랜드별 작성 리뷰"}. ${A}: ${anchorD?.growth != null ? `${signed(anchorD.growth)} (추적 전체 ${signed(mkt)})` : "추적 안 됨"}.`)}
            note={tr(<>Monthly reviews track sales. <Def k="growth">Growth</Def> = reviews in {period}, counting only products whose history reaches back to {dw.prior} (the same months a year earlier). Shaded bands and markers explain the spikes; red markers flag a jump with no logged cause. <Opens detail={{ kicker: "Method", title: "How demand is measured", body: <Points items={["Nykaa does not publish sales; buyers write reviews at a steady rate, so monthly review volume tracks sales momentum.", "Dates are the reviews' own dates on Nykaa, read from each product's history, so the comparison is not limited by how long we have been collecting.", "Nykaa serves about 1,000 reviews per product, so for big bestsellers only recent months are complete; earlier months are left blank rather than counted as zero.", "Products are those on today's shelves and catalogues, so growth reads slightly high across the board; compare a brand with the all-tracked line, not with zero.", `July holds Nykaa's Hot Pink sale; May a smaller probable sale. Index view compares every brand with its own ${monthYY(win[6])}–${monthYY(win[8])} average.`]} /> }}>Method</Opens></>,
              <>월별 리뷰 = 판매 흐름. <Def k="growth">성장률</Def> = {period} 리뷰, {dw.prior}(전년 동기)까지 이력이 있는 제품만 집계. 음영·표시선 = 급등락 이유, 빨간 표시선 = 기록된 원인 없는 급등. <Opens detail={{ kicker: "방법", title: "측정 방법", body: <Points items={["Nykaa는 판매량을 공개하지 않음. 구매자는 일정 비율로 리뷰를 쓰기 때문에 월별 리뷰 수가 판매 흐름을 따라감.", "날짜는 각 제품 이력의 Nykaa 리뷰 작성일 → 수집 기간이 짧아도 과거와 비교 가능.", "Nykaa는 제품당 리뷰를 약 1,000건까지만 보여 줌 → 대형 베스트셀러는 최근 몇 달만 완전. 그 이전 달은 0이 아니라 빈칸 처리.", "대상이 오늘 진열·카탈로그에 있는 제품이라 성장률이 전반적으로 약간 높게 나옴. 0이 아니라 시장선과 비교.", `7월엔 Nykaa Hot Pink 세일, 5월엔 그보다 작은 세일(추정)이 있었음. 지수 보기는 브랜드마다 자신의 ${monthYY(win[6])}–${monthYY(win[8])} 평균과 비교.`]} /> }}>방법</Opens></>)}
            right={<div className="flex gap-1.5">{(["reviews", "index"] as const).map((m) => <button key={m} onClick={() => setMode(m)} className={`rounded-full px-3 py-1 text-[12.5px] ring-1 ${mode === m ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line"}`}>{m === "reviews" ? tr("Reviews per month", "월별 리뷰") : tr("Index vs all tracked", "추적 전체 대비 지수")}</button>)}</div>}>
            <Card className="p-5">
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><div className="text-[14px] font-semibold">{mode === "reviews" ? tr("Monthly reviews, last 12 complete months", "월별 리뷰, 최근 완결된 12개월") : tr(`Each line indexed to its own ${dw.prior} average = 100; grey = all tracked brands`, `각 선을 자신의 ${dw.prior} 평균 = 100으로 환산, 회색 = 추적 전체 브랜드`)}</div><span className="text-[12px] text-muted">{tr("Hover for values and causes", "마우스를 올리면 값·원인 표시")}</span></div>
              <div className="mb-3"><BrandPicker focus={focus} all={brands.map((b) => ({ brand: b.brand, slots: b.last3 ?? 0 }))} selected={selected} colors={colors} onToggle={toggle} /></div>
              {series.length ? <LineChart labels={win.map(monthLabel)} series={series} height={300} yLabel={mode === "reviews" ? tr("reviews per month", "월별 리뷰 수") : tr(`index, ${dw.prior} = 100`, `지수, ${dw.prior} = 100`)} markers={[...logged, ...eventMarks, ...flags]} />
                : <p className="text-[13px] text-muted">{tr("None of the selected brands has review history yet.", "선택한 브랜드에 아직 리뷰 이력 없음.")}</p>}
              {chartNotes.length > 0 && (
                <div className="mt-3 grid gap-1.5 border-t border-line pt-3 md:grid-cols-2">
                  {chartNotes.map((n) => <div key={n.id} className="text-[12px] leading-snug text-ink-2"><b className="font-semibold text-ink">{n.title}</b>: {n.detail}</div>)}
                  {flags.map((f, i) => <div key={i} className="text-[12px] leading-snug text-bad">{f.label}</div>)}
                </div>
              )}
            </Card>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1.5fr_1fr]">
              <div className="min-w-0">
                <div className="mb-2 text-[14px] font-semibold">{tr("Review growth by brand", "브랜드별 리뷰 성장률")} <span className="text-[12px] font-normal text-muted">· {tr(`${A} and the main brands; search for any other · click a brand for its products`, `${A}와 주요 브랜드. 다른 브랜드는 검색 · 브랜드를 누르면 제품 표시`)}</span></div>
                <Card className="overflow-x-auto"><div className="min-w-[600px]">
                  <div className="grid grid-cols-[minmax(170px,1.4fr)_110px_1fr_120px_100px] border-b border-line px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted">
                    <span>{tr("Brand", "브랜드")}</span><span>{tr("12 months", "12개월")}</span><span>{tr("Reviews, last 3 mo", "최근 3개월 리뷰")}</span><span className="text-right">{tr(`Same products, ${dw.prior} → now`, `같은 제품, ${dw.prior} → 현재`)}</span><span className="pl-3">{tr("Change", "변화")}</span>
                  </div>
                  {market && (
                    <div className="grid grid-cols-[minmax(170px,1.4fr)_110px_1fr_120px_100px] items-center border-b border-line bg-sunken/50 px-4 py-2">
                      <span className="text-[13px] font-semibold">{tr("All tracked brands", "추적 전체 브랜드")} <span className="text-[11px] font-normal text-muted"><TrackedLink>{tr("which products?", "어떤 제품?")}</TrackedLink></span></span>
                      <Sparkline values={market.spark} color="#8a8880" width={96} height={24} />
                      <b className="text-[13px] tabular">{compact(market.last3)}</b>
                      <span className="text-right text-[12.5px] text-ink-2 tabular">{`${compact(market.prev3)} → ${compact(market.same3 ?? market.last3)}`}</span>
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
                            <span className="text-right text-[12.5px]"><b className="tabular">{p.last3 === null ? <Missing>{tr("partial", "일부")}</Missing> : compact(p.last3)}</b><span className="block"><Change g={p.growth} vol={p.last3} market={mkt} /></span><MoMInline values={p.monthly ?? p.spark} win={win} open={p.open} /></span>
                          </button>); })}</div>
                      </>) })} className={`grid w-full grid-cols-[minmax(170px,1.4fr)_110px_1fr_120px_100px] items-center border-b border-line px-4 py-2 text-left transition hover:bg-sunken/50 ${isA(b.brand) ? "bg-accent-soft/50" : ""}`}>
                        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: colors[b.brand] ?? "#d9d7cf" }} /><span className={`text-[13.5px] ${isA(b.brand) ? "font-semibold" : "font-medium"}`}>{b.brand} <span className="text-muted">›</span></span><span className="text-[11px] text-muted">{tiers.inSet(b.brand) ? ORIGIN_LABEL[origin.get(b.brand) ?? "unknown"] : tr("not a main brand", "주요 브랜드 외")}</span></span>
                        <Sparkline values={b.spark} color={c} width={96} height={24} />
                        <span className="flex items-center gap-2 pr-4"><b className="w-12 text-[13.5px] tabular">{b.last3 === null ? <Missing>{tr("partial", "일부")}</Missing> : compact(b.last3)}</b><span className="h-1.5 flex-1 rounded-full bg-sunken"><span className="block h-1.5 rounded-full" style={{ width: `${Math.min(100, ((b.last3 ?? 0) / maxL) * 100)}%`, background: c }} /></span></span>
                        <span className="text-right text-[12.5px] text-ink-2 tabular">{b.prev3 === null ? <Missing>{tr("partial", "일부")}</Missing> : `${compact(b.prev3)} → ${compact(b.same3 ?? b.last3)}`}</span>
                        <span className="pl-3"><Change g={b.growth} vol={b.last3} market={mkt} /></span>
                      </button>
                    );
                  }} />
                </div></Card>
                <Basis className="mt-1.5">{tr(<>Change = reviews {period}. Green = growing faster than <TrackedLink /> ({signed(mkt)}), red = slower. “Small base” = under 30 reviews in 3 months.</>, <>변화 = {period} 리뷰. 초록 = <TrackedLink />({signed(mkt)})보다 빠른 성장, 빨강 = 느린 성장. “표본 적음” = 3개월 리뷰 30건 미만.</>)}</Basis>
              </div>
              <div className="min-w-0">
                <div className="mb-2 text-[14px] font-semibold">{tr("Top products by written reviews", "작성 리뷰 상위 제품")} <span className="text-[12px] font-normal text-muted">· {tr("main brands; search for others", "주요 브랜드. 다른 브랜드는 검색")}</span></div>
                <Card className="overflow-hidden">
                  <div className="grid grid-cols-[20px_36px_1fr_auto] gap-2.5 border-b border-line px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted"><span>#</span><span /><span>{tr("Product", "제품")}</span><span className="text-right">{tr(`Reviews · vs ${dw.prior}`, `리뷰 · ${dw.prior} 대비`)}</span></div>
                  <TieredList rows={topProducts} brandOf={(p) => p.brand} tiers={tiers} top={10} noun={tr("products", "제품")} setNoun={tr("main-brand products", "주요 브랜드 제품")} render={(p, i) => (
                    <button key={p.key} onClick={() => openProduct(p.key, p.label, p.brand, p.url)} className={`grid w-full grid-cols-[20px_36px_1fr_auto] items-center gap-2.5 border-b border-line px-4 py-1.5 text-left hover:bg-sunken/50 ${isA(p.brand) ? "bg-accent-soft/50" : ""}`}>
                      <span className="text-[11.5px] text-muted tabular">{i + 1}</span>
                      <Thumb src={imgFor(p.key)} />
                      <span className="min-w-0"><span className="block text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-2">{p.brand}</span><span className="block truncate text-[12.5px] leading-snug">{shortName(p.label, p.brand)}</span></span>
                      <span className="text-right text-[12.5px] tabular"><b>{compact(p.last3)}</b><span className={`block text-[11px] ${p.growth === null ? "text-muted" : mkt !== null && p.growth >= mkt ? "text-good" : "text-bad"}`}>{p.growth === null ? (p.prev3 === null ? tr(`history doesn't reach ${dw.prior}`, `이력이 ${dw.prior}까지 안 닿음`) : tr(`new: no ${dw.prior}`, `신규: ${dw.prior} 없음`)) : signed(p.growth)}</span><MoMInline values={p.monthly ?? p.spark} win={win} open={p.open} /></span>
                    </button>
                  )} />
                </Card>
                <Basis className="mt-1.5">{tr(`Reviews in the last 3 complete months; change = ${period}. “New” = no reviews in ${dw.prior}, so no growth rate.`, `최근 완결된 3개월 리뷰. 변화 = ${period}. “신규” = ${dw.prior} 리뷰가 없어 성장률 없음.`)}</Basis>
              </div>
            </div>
          </ActionSection>

          <ActionSection id="search" kicker={tr("Search · who shoppers find", "검색 · 소비자가 만나는 브랜드")} title={tr(`${A} reaches the unpaid top 10 on ${keywords.length - absent} of ${keywords.length} keywords; ${grid.cols[1] ? `${grid.cols[1]} reaches ${grid.reach(grid.cols[1])}` : ""}.`, `${A}: 키워드 ${keywords.length}개 중 ${keywords.length - absent}개에서 비광고 상위 10위 안${grid.cols[1] ? `. ${grid.cols[1]}: ${grid.reach(grid.cols[1])}개` : ""}.`)}
            note={tr("Unpaid results are the same for every shopper. The grid shows each brand's best unpaid place per keyword (· = not in the top 10; AD = it also bought a slot). Click a keyword to see its results.", "비광고 결과는 모든 소비자에게 동일. 표 = 키워드별 각 브랜드의 최고 비광고 순위 (· = 상위 10위 밖, AD = 광고 자리도 구매). 키워드를 누르면 결과 표시.")}>
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
                    <span className="flex items-center gap-2"><span>{s.brand}</span><span className="text-[11px] font-normal text-muted">{tiers.inSet(s.brand) ? ORIGIN_LABEL[s.origin] : tr("not a main brand", "주요 브랜드 외")}</span></span>
                    <span className="flex items-center gap-2 pr-6 tabular"><b className="w-6">{s.top5}</b><span className="h-1.5 flex-1 rounded-full bg-sunken"><span className="block h-1.5 rounded-full bg-brand" style={{ width: `${(s.top5 / mx) * 100}%` }} /></span></span>
                    <span className="tabular">{s.top10} <span className="text-[11px] text-muted">{tr(`of ${places10}`, `/ ${places10}`)}</span></span>
                  </div>
                );
              }} />
            </Card>
          </ActionSection>

          <ActionSection id="ads" kicker={tr("Ads · who is paying for attention", "광고 · 누가 노출에 돈을 쓰나")} title={tr(`${topAdv?.brand ?? "No main brand"} buys the most ad slots among the main brands (${topAdv?.ads ?? 0} today, ${topAdv?.adDays ?? 0} keyword-days this week); ${A} holds ${anchorS?.ads ?? 0} today and ${anchorS?.adDays ?? 0} keyword-days.`,
              `주요 브랜드 중 광고 자리를 가장 많이 산 곳: ${topAdv?.brand ?? "없음"}(오늘 ${topAdv?.ads ?? 0}개, 이번 주 키워드-일 ${topAdv?.adDays ?? 0}). ${A}: 오늘 ${anchorS?.ads ?? 0}개, 키워드-일 ${anchorS?.adDays ?? 0}.`)}
            note={tr(<>A daily sample of the paid tiles Nykaa shows, not every shopper&rsquo;s view. <Opens detail={{ kicker: "Method", title: "How ads are sampled", body: <Points items={["Ads are what Nykaa showed our collector at about 07:00 IST from a data centre outside India.", "A 22 Sep test found identical ads across fresh sessions minutes apart, but different ads by location.", "Treat ad counts as a daily sample, comparable day to day, not as every shopper's view."]} /> }}>Method</Opens></>,
              <>Nykaa가 보여 주는 광고를 하루 한 번 표본으로 수집. 모든 소비자의 화면은 아님. <Opens detail={{ kicker: "방법", title: "광고 표본 수집 방법", body: <Points items={["광고 = 인도 시간 오전 7시경, 인도 밖 데이터센터에서 접속한 수집기에 Nykaa가 보여 준 것.", "9월 22일 테스트: 몇 분 간격의 새 세션은 같은 광고, 위치가 다르면 다른 광고.", "광고 수는 날짜끼리 비교하는 일일 표본. 모든 소비자의 화면은 아님."]} /> }}>방법</Opens></>)}>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {keywords.map((k) => <button key={k} onClick={() => setKw(k)} className={`rounded-full px-3 py-1 text-[12.5px] transition ${active === k ? "bg-brand font-medium text-on-brand" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink"}`}>{k}</button>)}
            </div>
            <Card className="p-5">
              <div className="mb-1 text-[14px] font-semibold">{tr("Ad placements over time", "광고 노출 추이")} · {adAll ? tr("all keywords", "전체 키워드") : <>&ldquo;{active}&rdquo;</>}</div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]">
                <div className="inline-flex rounded-full bg-sunken p-0.5 ring-1 ring-line">
                  {([[10, tr("10 days", "10일")], [14, tr("2 weeks", "2주")], [28, tr("4 weeks", "4주")], [0, tr(`Everything (${days.length} days)`, `전체 (${days.length}일)`)]] as [number, string][]).map(([v, l]) => <button key={v} onClick={() => setAdSpan(v)} aria-pressed={adSpan === v} className={`rounded-full px-3 py-1 transition ${adSpan === v ? "bg-surface font-medium text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}>{l}</button>)}
                </div>
                <div className="inline-flex rounded-full bg-sunken p-0.5 ring-1 ring-line">
                  {([[false, tr("By day", "일별")], [true, tr("By week", "주별")]] as [boolean, string][]).map(([v, l]) => <button key={String(v)} onClick={() => setAdWeekly(v)} aria-pressed={adWeekly === v} className={`rounded-full px-3 py-1 transition ${adWeekly === v ? "bg-surface font-medium text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}>{l}</button>)}
                </div>
                <button onClick={() => setAdAll(!adAll)} aria-pressed={adAll} className={`rounded-full px-3 py-1 ring-1 transition ${adAll ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line hover:bg-sunken"}`}>{tr("All keywords together", "전체 키워드 합산")}</button>
              </div>
              <div className="mb-3 text-[12px] text-muted">{tr(`AD tiles each brand held ${adWeekly ? "per week (Monday to Sunday, summed over the days collected)" : "per day"}, ${adAll ? "summed over every keyword" : "on this keyword"}, ${day(adGrid.from)}–${day(adGrid.to)}; main brands first. Last row: the #1 unpaid result${adAll || adWeekly ? " most often in that column" : ""}, for comparison.`,
                `브랜드별 ${adWeekly ? "주간(월–일, 수집일 합계)" : "일일"} 광고 자리 수, ${adAll ? "전체 키워드 합산" : "이 키워드"}, ${day(adGrid.from)}–${day(adGrid.to)} (주요 브랜드 먼저). 마지막 줄은 비교용 비광고 1위${adAll || adWeekly ? " (가장 자주 1위)" : ""}.`)}</div>
              <div className="overflow-x-auto">
              <table className="w-full text-[12.5px] tabular" style={{ minWidth: Math.max(620, 180 + adGrid.cols.length * 44) }}>
                <thead><tr><th className="sticky left-0 z-[1] bg-surface pb-2 pr-3 text-left font-medium text-muted">{tr("Brand", "브랜드")}</th>{adGrid.cols.map((c) => <th key={c} className="pb-2 text-center font-medium text-muted" title={adWeekly ? `${day(adGrid.daysIn.get(c)![0])}–${day(adGrid.daysIn.get(c)!.slice(-1)[0])} · ${adGrid.daysIn.get(c)!.length} ${tr("days", "일")}` : undefined}>{adWeekly ? tr(`wk of ${day(c)}`, `${day(c)} 주`) : day(c)}</th>)}<th className="pb-2 pl-2 text-right font-medium text-muted">{tr("Total", "합계")}</th></tr></thead>
                <tbody>
                  {adGrid.brands.map(([b, m]) => (
                    <tr key={b} className={`border-t border-line ${isA(b) ? "bg-accent-soft/50" : ""}`}>
                      <td className="sticky left-0 z-[1] bg-surface py-1.5 pr-3 font-medium">{b}{!tiers.inSet(b) && <span className="ml-1.5 text-[10.5px] font-normal text-muted">{tr("not a main brand", "주요 브랜드 외")}</span>}</td>
                      {adGrid.cols.map((c) => { const n = m.get(c) ?? 0; return <td key={c} className="py-1.5 text-center">{n ? <span className="inline-grid h-6 min-w-6 place-items-center rounded-md px-1 text-[11.5px] font-semibold text-white" style={{ background: `rgba(217,154,30,${0.5 + (n / adGrid.max) * 0.48})` }}>{n}</span> : <span className="text-line-2">·</span>}</td>; })}
                      <td className="py-1.5 pl-2 text-right font-semibold">{[...m.values()].reduce((x, y) => x + y, 0)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-line"><td className="sticky left-0 z-[1] bg-surface py-1.5 pr-3 text-muted">{tr("#1 unpaid", "비광고 1위")}</td>{adGrid.unpaid1.map((b, i) => <td key={i} className="py-1.5 text-center text-[11px] text-ink-2">{b ?? <Missing>{tr("not collected", "미수집")}</Missing>}</td>)}<td /></tr>
                </tbody>
              </table>
              </div>
              {adGrid.brands.length === 0 && <p className="mt-2 text-[12.5px] text-muted">{adAll ? tr("No ads recorded in this period.", "이 기간에 기록된 광고 없음.") : tr("No ads recorded on this keyword in this period.", "이 기간 이 키워드에 기록된 광고 없음.")}</p>}
            </Card>
            <Card className="mt-4 overflow-hidden">
              <div className="grid grid-cols-[minmax(180px,1.5fr)_1fr_1fr_1fr] border-b border-line px-5 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted"><span>{tr("Ads by brand, all keywords", "브랜드별 광고, 전체 키워드")}</span><span>{tr("Ad slots today", "오늘 광고 자리")}</span><span>{tr("Ad keyword-days, 7 d", "광고 키워드-일, 7일")}</span><span>{tr("Unpaid top 10 today", "오늘 비광고 상위 10")}</span></div>
              <TieredList rows={[...sov].filter((s) => s.ads || s.adDays || isA(s.brand)).sort((a, b) => (isA(a.brand) ? -1 : isA(b.brand) ? 1 : b.adDays - a.adDays || b.ads - a.ads))} brandOf={(s) => s.brand} tiers={tiers} top={10} render={(s) => {
                const mx = Math.max(1, ...sov.map((x) => x.adDays));
                return (
                  <div key={s.brand} className={`grid grid-cols-[minmax(180px,1.5fr)_1fr_1fr_1fr] items-center border-b border-line px-5 py-2 text-[13px] ${isA(s.brand) ? "bg-accent-soft/50 font-semibold" : ""}`}>
                    <span className="flex items-center gap-2"><span>{s.brand}</span>{!tiers.inSet(s.brand) && <span className="text-[11px] font-normal text-muted">{tr("not a main brand", "주요 브랜드 외")}</span>}</span>
                    <span className="tabular">{s.ads || <span className="text-muted">0</span>}</span>
                    <span className="flex items-center gap-2 pr-6 tabular"><b className="w-6">{s.adDays}</b><span className="h-1.5 flex-1 rounded-full bg-sunken"><span className="block h-1.5 rounded-full bg-[#d99a1e]" style={{ width: `${(s.adDays / mx) * 100}%` }} /></span></span>
                    <span className="tabular text-ink-2">{s.top10}</span>
                  </div>
                );
              }} />
            </Card>
          </ActionSection>

          <ActionSection id="suggest" kicker={tr("What shoppers type", "소비자 검색어")} title={typed.topGeneric.length ? tr(`When shoppers type a category, Nykaa suggests ${typed.topGeneric[0][0]}'s products most (${typed.topGeneric[0][1]} of ${typed.genericSlots} product suggestions); ${A} gets ${typed.anchorGeneric}.`, `카테고리를 입력하면 Nykaa가 가장 많이 추천하는 브랜드: ${typed.topGeneric[0][0]}(제품 추천 ${typed.genericSlots}개 중 ${typed.topGeneric[0][1]}개). ${A}: ${typed.anchorGeneric}개.`) : tr("Nykaa's suggestions as shoppers type.", "소비자가 입력할 때 Nykaa가 보여 주는 추천.")}
            note={tr("Nykaa's search box suggests products and searches before a shopper finishes typing, which shapes what they look at first. Read daily for 39 starting words: 16 category words and 23 brand names.", "Nykaa 검색창은 입력이 끝나기 전에 제품·검색어를 추천 → 소비자가 처음 보는 것을 좌우. 시작 단어 39개(카테고리 16개, 브랜드명 23개)로 매일 수집.")}>
            {!sugg.data ? <Loading what={tr("suggestions", "추천 검색어")} /> : (
              <div className="grid gap-4 lg:grid-cols-3">
                <Card className="p-4">
                  <div className="text-[13.5px] font-semibold">{tr("Whose products Nykaa suggests for category words", "카테고리 입력 시 Nykaa가 추천하는 브랜드")}</div>
                  <Basis className="mb-2">{tr(<>Product suggestions for {typed.genericSeeds.length} category words (&ldquo;serum&rdquo;, &ldquo;sunscreen&rdquo;…), today</>, <>카테고리 단어 {typed.genericSeeds.length}개(&ldquo;serum&rdquo;, &ldquo;sunscreen&rdquo;…) 오늘의 제품 추천</>)}</Basis>
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
                  <Basis className="mt-2">{tr("Blue = names a main brand.", "파랑 = 주요 브랜드 이름 포함.")}</Basis>
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
      <MethodNotes parts={{
        sources: [tr("Written reviews of the tracked products, by month, up to two years back (the main brands' key products and Nykaa's top products); Nykaa search results for the tracked keywords every day (unpaid results and AD tiles, first 20); Nykaa's autosuggest as shoppers type.", "추적 제품의 월별 작성 리뷰(최대 2년; 주요 브랜드 핵심 제품과 Nykaa 상위 제품), 추적 키워드의 Nykaa 검색 결과(매일, 비광고 결과와 광고, 첫 20개), 입력 중 Nykaa 추천 검색어.")],
        calc: [tr("Review growth: written reviews in the last 3 complete months against the same months a year earlier, counting only products whose history reaches back that far.", "리뷰 성장률: 최근 완결된 3개월 작성 리뷰를 1년 전 같은 달과 비교, 그때까지 이력이 있는 제품만."),
          tr("Search: each brand's best unpaid place per keyword today, and how many keywords put it in the unpaid top 10.", "검색: 오늘 키워드별 브랜드 최고 비광고 순위, 비광고 상위 10위 안에 든 키워드 수."),
          tr("Ads: AD tiles in the first 20 results of each keyword, per day.", "광고: 키워드별 첫 20개 결과의 광고 수, 일별.")],
        assume: [tr("Written reviews rise and fall with sales over months; one day of search stands for the shopper's view that day.", "작성 리뷰는 몇 달에 걸쳐 판매와 함께 오르내린다고 보고, 하루치 검색 결과는 그날 쇼핑객이 보는 화면을 대표한다고 봄.")],
        limits: [tr("Written reviews are fewer than ratings (about 1 in 11) and the ratio varies by product; this tab shows trends, while the Market tab's share of buying decides who is winning.", "작성 리뷰는 평가보다 적고(약 11분의 1) 제품마다 비율이 다름. 이 탭은 추세용이고, 승자는 Market 탭의 구매 점유율로 판단."),
          tr("Search results vary by time and place; we read them once a day from one location.", "검색 결과는 시간·장소에 따라 다름. 하루 한 번, 한 곳에서 수집.")],
      }} />
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
