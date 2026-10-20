"use client";

import { Fragment, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import BrandPicker from "@/components/BrandPicker";
import LineChart from "@/components/LineChart";
import { useOpenProduct, type ProductRef } from "@/components/ProductDrawer";
import Shell from "@/components/Shell";
import Segmented from "@/components/Segmented";
import { Card, Loading, PageHead, Stat, Verdict } from "@/components/ui";
import { Missing, Opens, Points, DetailHead } from "@/components/Detail";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import { Basis, TieredList } from "@/components/Tiered";
import { useDetail } from "@/components/Detail";
import { shelfShare } from "@/lib/analysis";
import { noteMarkers, unusual, useDataNotes } from "@/lib/notes";
import { useTiers } from "@/lib/tiers";
import { ANCHOR_BRAND, ORIGIN_LABEL, marketSet, norm, ORIGIN_COLOR } from "@/lib/brands";
import { useBrandDaily, useKoreanStore, useProductNames, useShareDaily, useShelf, useShelfDays } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL, compact, inr, median, shortName } from "@/lib/format";
import { useBrandSelection } from "@/lib/selection";
import type { ShelfRow } from "@/lib/types";
import { push } from "@/lib/group";
import { onePerRatingPool } from "@/lib/pools";
import { dayMonth, josa, labels, tr } from "@/lib/i18n";
import { tx } from "@/lib/dict";

const ORIGINS = ["kbeauty", "local", "global", "unknown"] as const;
const OC: Record<string, string> = Object.fromEntries(Object.entries(ORIGIN_COLOR).map(([k, v]) => [k, v.fill]));
const day = (d: string) => dayMonth(d);
const STORE_URL = "https://www.nykaa.com/korean-beauty/c/30710";
type Tag = "anchor" | "focus" | "korean" | "rival";
const TAG_STYLE: Record<Tag, string> = { anchor: "bg-brand text-on-brand", focus: "bg-[#e4f0eb] text-[#1f5646]", korean: "bg-[#eef4f1] text-[#4b6a5e]", rival: "bg-[#faefe2] text-[#8a5a22]" };
const TAG_LABEL: Record<Tag, string> = labels({ anchor: ["Anchor", "기준"], focus: ["Focus", "주요"], korean: ["Other K-beauty", "기타 K-뷰티"], rival: ["Rival in its categories", "동일 카테고리 경쟁사"] });
function TierTag({ tier }: { tier: Tag | null }) {
  return tier ? <span className={`ml-1.5 rounded px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-[0.05em] ${TAG_STYLE[tier]}`}>{TAG_LABEL[tier]}</span> : null;
}
const ratings = (r: { rating?: number | null; rating_count?: number | null }) =>
  r.rating_count ? `${r.rating ? `★ ${r.rating.toFixed(1)} · ` : ""}${tr(`${compact(r.rating_count)} ratings`, `평가 ${compact(r.rating_count)}건`)}` : tr("no ratings yet", "아직 평가 없음");
type Window = "7" | "14";
const NAV = (): NavItem[] => [
  { id: "summary", label: tr("Summary", "요약") }, { id: "origin", label: tr("Who holds the shelf", "상위 100위 점유") }, { id: "trend", label: tr("Day by day", "일별 추이") },
  { id: "movers", label: tr("Movers", "순위 변동") }, { id: "store", label: tr("Korean store", "K-뷰티 스토어") }, { id: "launches", label: tr("Launches", "신제품") },
];
interface Move { wasAd?: boolean; key: string; product_id: string; brand: string; name: string; sub: string; from: number | null; to: number | null; change: number; isAd: boolean; rating: number | null; rating_count: number | null; row?: ShelfRow; url?: string | null }

const ref = (r: ShelfRow): ProductRef => ({ product_id: r.product_id, name: r.name, brand: r.brand, url: r.url, image: r.image_url, price: r.price, mrp: r.mrp, rating: r.rating, rating_count: r.rating_count, usp: r.usp_summary, phrases: r.review_key_phrases, splitup: r.review_splitup, madeIn: r.country_name });

function MarketPage() {
  const shelf = useShelf(); const share = useShareDaily(); const bd = useBrandDaily(); const kstore = useKoreanStore();
  const open = useOpenProduct(); const detail = useDetail(); const notes = useDataNotes();
  const rows = useMemo(() => shelf.data ?? [], [shelf.data]);
  const days = useMemo(() => [...new Set((share.data ?? []).map((s) => s.scrape_date))].sort(), [share.data]);
  const first = days[0]; const last = days[days.length - 1];
  const [win, setWin] = useState<Window>("7");
  // the latest collected day at least `win` days before the latest one
  const past = useMemo(() => {
    if (!last) return undefined;
    const target = new Date(last).getTime() - Number(win) * 864e5;
    return [...days].reverse().find((d) => new Date(d).getTime() <= target);
  }, [days, last, win]);
  const moversData = useShelfDays(past && last ? [past, last] : []);
  const set = useMemo(() => marketSet(rows), [rows]);
  const [openBrand, setOpenBrand] = useState<string | null>(null);
  const known = useMemo(() => [...new Set((bd.data ?? []).map((r) => r.brand))], [bd.data]);
  const tiers = useTiers(known);
  const focus = useMemo(() => [tiers.pinned, ...tiers.focus].filter((b) => known.includes(b)), [tiers, known]);
  const isFocus = (b: string) => tiers.inSet(b);
  const tagOf = (b: string): Tag | null => { if (tiers.isPinned(b)) return "anchor"; if (tiers.isFocus(b)) return "focus"; const t = set.tier(b); return t === "rival" ? "rival" : t ? "korean" : null; };
  const [like, setLike] = useState(true);
  const [moverScope, setMoverScope] = useState<"set" | "all">("set");
  const [moreLists, setMoreLists] = useState(false);
  // the categories tracked from the first day: comparisons over time use only these, so added shelves never read as gains
  const baseCats = useMemo(() => { const d0 = days[0]; return new Set((bd.data ?? []).filter((r) => r.scrape_date === d0 && r.subcategory !== "kbeauty_store").map((r) => r.subcategory)); }, [bd.data, days]);
  const { selected, colors, toggle } = useBrandSelection(known);

  const shareOn = (d: string, sub?: string) => {
    const s = (share.data ?? []).filter((x) => x.scrape_date === d && (!sub || x.subcategory === sub));
    const tot = s.reduce((a, x) => a + Number(x.slots), 0) || 1;
    return Object.fromEntries(ORIGINS.map((o) => [o, s.filter((x) => x.origin === o).reduce((a, x) => a + Number(x.slots), 0) / tot])) as Record<string, number>;
  };
  const kNow = last ? shareOn(last).kbeauty : 0;
  const shareOnCats = (d: string) => {
    const s = (share.data ?? []).filter((x) => x.scrape_date === d && baseCats.has(x.subcategory));
    const tot = s.reduce((a, x) => a + Number(x.slots), 0) || 1; return s.filter((x) => x.origin === "kbeauty").reduce((a, x) => a + Number(x.slots), 0) / tot;
  };
  const kL = last ? shareOnCats(last) : 0; const kFirst = first ? shareOnCats(first) : 0;
  const focusSlots = rows.filter((r) => isFocus(r.brand)).length;

  const brandSeries = useMemo(() => selected.map((b) => ({ name: b, color: colors[b], values: days.map((d) => {
    const v = (bd.data ?? []).filter((r) => r.brand === b && r.scrape_date === d && r.subcategory !== "kbeauty_store" && (!like || baseCats.has(r.subcategory))).reduce((a, r) => a + Number(r.slots), 0);
    return v; }) })), [selected, colors, days, bd.data, like, baseCats]);
  const trendMarks = useMemo(() => {
    const shelfNotes = (notes.data ?? []).filter((n) => n.category !== "kbeauty_store" && !(like && n.kind === "coverage"));
    const logged = noteMarkers(shelfNotes, days, "shelf", selected);
    return [...logged, ...unusual(brandSeries, days, logged, 1.6, 8)];
  }, [notes.data, days, selected, brandSeries, like]);
  // listings per brand today, 14 days ago on the same categories, and the like-for-like change
  const listing = useMemo(() => {
    if (!bd.data || !last) return [];
    const then = days.length > 14 ? days.at(-15)! : days[0];
    const catsOn = (d: string) => new Set(bd.data!.filter((r) => r.scrape_date === d && r.subcategory !== "kbeauty_store").map((r) => r.subcategory));
    const both = new Set([...catsOn(last)].filter((c) => catsOn(then).has(c)));
    const nowL = shelfShare(bd.data, last, both); const thenL = shelfShare(bd.data, then, both);
    const by = new Map<string, ShelfRow[]>(); rows.forEach((r) => push(by, r.brand, r));
    return [...by.entries()].map(([b, rs]) => ({ brand: b, rows: [...rs].sort((x, y) => x.rank - y.rank), n: rs.length, top20: rs.filter((r) => r.rank <= 20).length, best: Math.min(...rs.map((r) => r.rank)),
      paid: rs.filter((r) => r.is_ad).length, cats: new Set(rs.map((r) => r.subcategory)).size, change: nowL.count(b) - thenL.count(b), then, both: both.size }))
      .sort((a, b) => (tiers.isPinned(a.brand) ? -1 : tiers.isPinned(b.brand) ? 1 : b.n - a.n));
  }, [bd.data, last, days, rows, tiers]);

  const allLaunches = useMemo(() => {
    if (!last) return [];
    const now = new Date(last).getTime();   // ages are measured from the latest collection day
    return rows.filter((r) => r.first_review_date && now - new Date(r.first_review_date).getTime() <= 90 * 864e5)
      .map((r) => { const age = Math.max(1, Math.round((now - new Date(r.first_review_date!).getTime()) / 864e5)); return { r, age, perDay: (r.rating_count ?? 0) / age }; })
      .sort((a, b) => b.perDay - a.perDay);
  }, [rows, last]);
  // "catching on" needs some evidence: a launch with a handful of ratings says nothing yet
  const launches = useMemo(() => allLaunches.filter((l) => (set.has(l.r.brand) || tiers.inSet(l.r.brand)) && (l.r.rating_count ?? 0) >= 10)
    .sort((a, b) => Number(tiers.inSet(b.r.brand)) - Number(tiers.inSet(a.r.brand)) || b.perDay - a.perDay), [allLaunches, set, tiers]);

  // rank moves within each category's top 100, for the brands that matter; exits and entries count too,
  // but only on shelves that were already tracked on the earlier day
  const pastRows = useMemo(() => (moversData.data ?? []).filter((x) => x.scrape_date === past), [moversData.data, past]);
  const exitIds = useMemo(() => {
    const now = new Set(rows.map((r) => `${r.subcategory}|${r.product_id}`));
    return [...new Set(pastRows.filter((x) => !now.has(`${x.subcategory}|${x.product_id}`)).map((x) => x.product_id))];
  }, [pastRows, rows]);
  const names = useProductNames(exitIds);
  const moves = useMemo(() => {
    if (!pastRows.length) return [] as Move[];
    const before = new Map(pastRows.map((x) => [`${x.subcategory}|${x.product_id}`, x]));
    const trackedThen = new Set(pastRows.map((x) => x.subcategory));
    const out: Move[] = [];
    for (const r of rows) {
      if (!trackedThen.has(r.subcategory)) continue;
      const b = before.get(`${r.subcategory}|${r.product_id}`);
      out.push({ key: `${r.subcategory}|${r.product_id}`, product_id: r.product_id, brand: r.brand, name: r.name, sub: r.subcategory, from: b?.rank ?? null, to: r.rank,
        change: (b?.rank ?? 101) - r.rank, isAd: r.is_ad, wasAd: b?.is_ad, rating: r.rating, rating_count: r.rating_count, row: r, url: r.url });
    }
    const nowKeys = new Set(out.map((m) => m.key));
    for (const x of pastRows) {
      const k = `${x.subcategory}|${x.product_id}`; const n = names.data?.get(x.product_id);
      if (nowKeys.has(k) || !n) continue;
      out.push({ key: k, product_id: x.product_id, brand: n.brand, name: n.name, sub: x.subcategory, from: x.rank, to: null, change: x.rank - 101,
        isAd: false, wasAd: x.is_ad, rating: x.rating === null ? null : Number(x.rating), rating_count: x.rating_count, url: n.url });
    }
    return out;
  }, [pastRows, rows, names.data]);
  const relevant = moves.filter((m) => moverScope === "all" || tiers.inSet(m.brand) || set.has(m.brand));
  // a real move is a product ranked on both days; entries and exits are mostly sponsored slots coming and going
  // or Nykaa swapping which listing of a product it shows, so they are kept apart
  const both = relevant.filter((m) => m.from !== null && m.to !== null);
  const moveWeight = (m: Move) => Math.abs(m.change) * (m.isAd || m.wasAd ? 0.4 : 1) * (tiers.inSet(m.brand) ? 1.5 : 1);
  const up = [...both].filter((m) => m.change > 0).sort((a, b) => moveWeight(b) - moveWeight(a)).slice(0, 10);
  const down = [...both].filter((m) => m.change < 0).sort((a, b) => moveWeight(b) - moveWeight(a)).slice(0, 10);
  const entered = relevant.filter((m) => m.from === null).sort((a, b) => a.to! - b.to!);
  const left = relevant.filter((m) => m.to === null).sort((a, b) => a.from! - b.from!);
  const anchorMoves = moves.filter((m) => norm(m.brand) === norm(set.anchor)).sort((a, b) => (a.to ?? 999) - (b.to ?? 999));

  // the Korean Beauty store: one row per brand, ordered by how many of the store's top 100 it holds
  const store = useMemo(() => {
    const k = kstore.data ?? []; const m = new Map<string, ShelfRow[]>(); k.forEach((r) => push(m, r.brand, r));
    return [...m.entries()].map(([b, rs]) => {
      const sorted = [...rs].sort((x, y) => x.rank - y.rank);
      const rated = onePerRatingPool(sorted).filter((r) => r.rating_count); // sizes sharing one set of Nykaa ratings count once
      return { b, rows: sorted, n: rs.length, top20: rs.filter((r) => r.rank <= 20).length, best: sorted[0].rank, med: median(rs.map((r) => r.rank)) ?? 0,
        paid: rs.filter((r) => r.is_ad).length, ratingsSum: rated.reduce((a, r) => a + (r.rating_count ?? 0), 0),
        avg: rated.length ? rated.reduce((a, r) => a + (r.rating ?? 0) * (r.rating_count ?? 0), 0) / rated.reduce((a, r) => a + (r.rating_count ?? 0), 0) : null };
    }).sort((a, b) => b.n - a.n || a.best - b.best);
  }, [kstore.data]);
  const storeLeaders = store;
  const storeShown = useMemo(() => {
    const top = store.slice(0, 12);
    const a = store.find((s) => norm(s.b) === norm(set.anchor));
    return a && !top.includes(a) ? [...top, a] : top;
  }, [store, set.anchor]);
  const anchorInStore = store.find((s) => norm(s.b) === norm(set.anchor));

  const ready = shelf.data && share.data && bd.data;
  const anchorRows = rows.filter((r) => norm(r.brand) === norm(ANCHOR_BRAND));
  const anchorSlots = anchorRows.length; const anchorBest = Math.min(...anchorRows.map((r) => r.rank), 999);
  return (
    <Shell active="Market" asOf={last ? day(last) : undefined}>
      <PageHead eyebrow={tr("The Nykaa shelf", "Nykaa 랭킹")} title={tr("Market", "시장")} sub={tr(<>The Nykaa shelf across {CATEGORIES.length} categories: who holds the top-100 places, how that moves day by day, who is climbing, the Korean store, and which launches are catching on.</>, <>{CATEGORIES.length}개 카테고리의 Nykaa 랭킹: 상위 100위를 누가 차지하는지, 날마다 어떻게 움직이는지, 누가 오르는지, K-뷰티 스토어, 반응이 오는 신제품.</>)} />
      {!ready ? <Loading what={tr("market data", "시장 데이터")} /> : (
        <>
          <SectionNav items={NAV()} />
          <section id="summary" className="mt-6 scroll-mt-32">
          {(() => {
            const setL = listing.filter((l) => tiers.inSet(l.brand) && !tiers.isPinned(l.brand));
            const gain = [...setL].sort((a, b) => b.change - a.change)[0]; const loss = [...setL].sort((a, b) => a.change - b.change)[0];
            const me = listing.find((l) => tiers.isPinned(l.brand));
            const ahead = setL.filter((l) => l.change > 0).length; const behind = setL.filter((l) => l.change < 0).length;
            const lfl = listing[0]?.both ?? 0;
            return (
              <Verdict eyebrow={tr("The shelf today", "오늘의 랭킹")} points={tr([
                <><b className="text-on-brand">K-beauty&rsquo;s share:</b> {(kL * 100).toFixed(1)}% of the top-100 places on the {baseCats.size} categories tracked since {day(first)}, {kL >= kFirst ? "up" : "down"} {Math.abs((kL - kFirst) * 100).toFixed(1)} pts. Across all {CATEGORIES.length} categories today it is {(kNow * 100).toFixed(1)}%; the gap is new categories, not growth.</>,
                <><b className="text-on-brand">Focus brands, 14 days:</b> {ahead} gained places, {behind} lost, counted on the {lfl} categories tracked on both days.{gain && gain.change > 0 ? ` ${gain.brand} gained most (+${gain.change}).` : ""}{loss && loss.change < 0 ? ` ${loss.brand} lost most (${loss.change}).` : ""}</>,
                <><b className="text-on-brand">Korean store:</b> its top three brands hold {storeLeaders.slice(0, 3).reduce((a, s) => a + s.n, 0)} of 100 places, led by {storeLeaders[0]?.b ?? "none"} ({storeLeaders[0]?.n ?? 0}); {storeLeaders.slice(0, 10).filter((s) => isFocus(s.b)).length} of its top 10 brands are focus brands.</>,
                <><b className="text-on-brand">Launches:</b> {launches.length} launches from the brands in view are catching on{launches[0] ? `, fastest ${launches[0].r.brand} (${launches[0].perDay.toFixed(1)} ratings a day)` : ""}; {launches.some((l) => norm(l.r.brand) === norm(set.anchor)) ? `${set.anchor} has one` : `${set.anchor} has none`}.</>,
              ], [
                <><b className="text-on-brand">K-뷰티 점유율:</b> {day(first)}부터 추적한 카테고리 {baseCats.size}개 기준 상위 100위 제품의 {(kL * 100).toFixed(1)}%, {Math.abs((kL - kFirst) * 100).toFixed(1)}%p {kL >= kFirst ? "상승" : "하락"}. 오늘 전체 {CATEGORIES.length}개 카테고리 기준으로는 {(kNow * 100).toFixed(1)}%. 차이는 성장이 아니라 새로 추가된 카테고리 때문.</>,
                <><b className="text-on-brand">주요 브랜드, 14일:</b> {ahead}곳 상승, {behind}곳 하락 (두 날짜 모두 추적한 카테고리 {lfl}개 기준).{gain && gain.change > 0 ? ` 가장 많이 오른 곳: ${gain.brand}(+${gain.change}).` : ""}{loss && loss.change < 0 ? ` 가장 많이 내린 곳: ${loss.brand}(${loss.change}).` : ""}</>,
                <><b className="text-on-brand">K-뷰티 스토어:</b> 상위 3개 브랜드가 100개 중 {storeLeaders.slice(0, 3).reduce((a, s) => a + s.n, 0)}개, 선두는 {storeLeaders[0]?.b ?? "없음"}({storeLeaders[0]?.n ?? 0}). 상위 10개 브랜드 중 주요 브랜드는 {storeLeaders.slice(0, 10).filter((s) => isFocus(s.b)).length}곳.</>,
                <><b className="text-on-brand">신제품:</b> 대상 브랜드의 신제품 {launches.length}개가 반응을 얻는 중{launches[0] ? `. 가장 빠른 제품: ${launches[0].r.brand}(하루 평가 ${launches[0].perDay.toFixed(1)}건)` : ""}. {launches.some((l) => norm(l.r.brand) === norm(set.anchor)) ? `${set.anchor} 신제품 있음` : `${set.anchor} 신제품 없음`}.</>,
              ])} foot={tr(<><b>So what:</b> {me ? `${set.anchor} holds ${me.n} places (best #${me.best}, ${me.change === 0 ? "unchanged" : `${me.change > 0 ? "+" : ""}${me.change}`} in 14 days)` : `${set.anchor} holds no place`} while {gain && gain.change > 0 ? `${gain.brand} adds ${gain.change}` : "the focus brands hold steady"}: {me && gain && gain.change > me.change + 2 ? "visibility is drifting to rivals; the movers below show where." : "no sharp shift this fortnight; watch the movers below."}</>,
                <><b>시사점:</b> {me ? `${set.anchor}: 상위 100위 제품 ${me.n}개(최고 #${me.best}, 14일간 ${me.change === 0 ? "변화 없음" : `${me.change > 0 ? "+" : ""}${me.change}`})` : `${set.anchor}: 상위 100위 제품 없음`}, {gain && gain.change > 0 ? `${gain.brand} ${gain.change}개 증가` : "주요 브랜드는 큰 변화 없음"}. {me && gain && gain.change > me.change + 2 ? "노출이 경쟁사로 옮겨 가는 중. 어디인지는 아래 순위 변동에서 확인." : "이번 2주는 큰 변화 없음. 아래 순위 변동 참고."}</>)}>
                {tr(<>K-beauty holds {(kL * 100).toFixed(1)}% of the top-100 places on like-for-like shelves ({kL >= kFirst ? "+" : "−"}{Math.abs((kL - kFirst) * 100).toFixed(1)} pts since {day(first)}); {set.anchor} holds {anchorSlots} of all {rows.length.toLocaleString("en-IN")} places{anchorSlots ? `, best #${anchorBest}` : ""}{anchorInStore ? `, and ${anchorInStore.n} of the Korean store's top 100` : ", and none in the Korean store's top 100"}.</>,
                  <>동일 조건 랭킹 기준 K-뷰티 = 상위 100위 제품의 {(kL * 100).toFixed(1)}%({day(first)} 대비 {kL >= kFirst ? "+" : "−"}{Math.abs((kL - kFirst) * 100).toFixed(1)}%p). {josa(set.anchor, "은/는")} 전체 {rows.length.toLocaleString("en-IN")}개 중 {anchorSlots}개{anchorSlots ? `(최고 #${anchorBest})` : ""}{anchorInStore ? `, K-뷰티 스토어 상위 100위 중 ${anchorInStore.n}개` : ", K-뷰티 스토어 상위 100위에는 없음"}.</>)}
              </Verdict>
            );
          })()}
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Stat label={tr("K-beauty share, like for like", "K-뷰티 점유율, 동일 조건")} value={`${(kL * 100).toFixed(1)}%`} sub={days.length > 1 ? tr(<>{kL >= kFirst ? "▲" : "▼"} {Math.abs((kL - kFirst) * 100).toFixed(1)} pts since {day(first)}<Basis>on the {baseCats.size} categories tracked since day one · all {CATEGORIES.length} today: {(kNow * 100).toFixed(1)}%</Basis></>, <>{day(first)} 대비 {kL >= kFirst ? "▲" : "▼"} {Math.abs((kL - kFirst) * 100).toFixed(1)}%p<Basis>첫날부터 추적한 카테고리 {baseCats.size}개 기준 · 오늘 전체 {CATEGORIES.length}개 기준: {(kNow * 100).toFixed(1)}%</Basis></>) : tr("first day of data", "데이터 첫날")} />
            <Stat label={tr("Focus brands' listings", "주요 브랜드 랭킹 제품")} value={String(focusSlots)} sub={tr(<>{((focusSlots / Math.max(1, rows.length)) * 100).toFixed(1)}% of all {rows.length.toLocaleString("en-IN")} top-100 places<Basis>{set.anchor} and the {tiers.focus.length} focus brands, today</Basis></>, <>상위 100위 전체 {rows.length.toLocaleString("en-IN")}자리의 {((focusSlots / Math.max(1, rows.length)) * 100).toFixed(1)}%<Basis>오늘 기준 {set.anchor}와 주요 브랜드 {tiers.focus.length}곳</Basis></>)} />
            <Stat label={tr("Launches on the shelf", "랭킹 내 신제품")} value={String(allLaunches.length)} sub={tr(<>{allLaunches.filter((l) => l.r.origin === "kbeauty").length} K-beauty · {launches.length} from brands in view<Basis>first reviewed in the last 90 days</Basis></>, <>K-뷰티 {allLaunches.filter((l) => l.r.origin === "kbeauty").length}개 · 대상 브랜드 {launches.length}개<Basis>최근 90일 안에 첫 리뷰</Basis></>)} />
            <Stat label={tr("Korean store leader", "K-뷰티 스토어 선두")} value={storeLeaders[0]?.b ?? tr("None today", "오늘 없음")} sub={storeLeaders[0] ? tr(<>{storeLeaders[0].n} of the store&rsquo;s top 100 · best #{storeLeaders[0].best}<Basis>Nykaa&rsquo;s Korean Beauty store, today</Basis></>, <>스토어 상위 100위 중 {storeLeaders[0].n}자리 · 최고 #{storeLeaders[0].best}<Basis>오늘 Nykaa K-뷰티 스토어</Basis></>) : tr("the store was not collected today", "오늘 스토어 미수집")} />
          </div>
          </section>

          <ActionSection id="origin" kicker={tr("Who holds the shelf · by brand origin", "상위 100위 점유 · 브랜드 국적별")} title={(() => {
            const k = CATEGORIES.map((c) => ({ c, v: shareOn(last, c).kbeauty })).sort((a, b) => b.v - a.v);
            return tr(`K-beauty is strongest in ${CATEGORY_LABEL[k[0].c].toLowerCase()} (${Math.round(k[0].v * 100)}% of the top 100) and weakest in ${CATEGORY_LABEL[k[k.length - 1].c].toLowerCase()} (${Math.round(k[k.length - 1].v * 100)}%).`, `K-뷰티는 ${CATEGORY_LABEL[k[0].c]}에서 가장 강하고(상위 100위의 ${Math.round(k[0].v * 100)}%), ${CATEGORY_LABEL[k[k.length - 1].c]}에서 가장 약함(${Math.round(k[k.length - 1].v * 100)}%).`);
          })()} note={tr(`Share of each category's top-100 places by brand origin, ${day(last)}. The top 20 is where most clicks land.`, `${day(last)} 카테고리별 상위 100위 제품의 브랜드 국적별 비중. 클릭은 대부분 상위 20위에서 발생.`)}>
            <Card className="p-5">
              <div className="mb-4 flex flex-wrap gap-4 text-[12.5px] text-ink-2">{ORIGINS.map((o) => <span key={o} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: OC[o] }} />{ORIGIN_LABEL[o]}</span>)}</div>
              <div className="space-y-2.5">
                {CATEGORIES.map((c) => {
                  const s = shareOn(last, c); const t20 = (share.data ?? []).filter((x) => x.scrape_date === last && x.subcategory === c);
                  const k20 = t20.filter((x) => x.origin === "kbeauty").reduce((a, x) => a + Number(x.top20), 0) / Math.max(1, t20.reduce((a, x) => a + Number(x.top20), 0));
                  return (
                    <div key={c} className="grid grid-cols-[130px_1fr_150px] items-center gap-4">
                      <span className="text-[13.5px] font-medium">{CATEGORY_LABEL[c]}</span>
                      <div className="flex h-7 overflow-hidden rounded-lg bg-sunken">
                        {ORIGINS.map((o) => s[o] > 0 && <div key={o} title={`${ORIGIN_LABEL[o]} ${(s[o] * 100).toFixed(0)}%`} className="flex items-center justify-center text-[11.5px] font-semibold" style={{ width: `${s[o] * 100}%`, background: OC[o], color: ORIGIN_COLOR[o].text, borderRight: "2px solid #fff" }}>{s[o] >= 0.07 ? `${Math.round(s[o] * 100)}%` : ""}</div>)}
                      </div>
                      <span className="text-[12.5px] text-ink-2 tabular">{tr("K-beauty in top 20", "상위 20위 K-뷰티")}: <b>{Math.round(k20 * 100)}%</b></span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </ActionSection>

          <ActionSection id="trend" kicker={tr("Focus brands, day by day", "주요 브랜드 일별 추이")} title={(() => {
            const t = brandSeries.map((b) => ({ b: b.name, d: (b.values.at(-1) ?? 0) - (b.values[0] ?? 0) })).sort((a, b) => b.d - a.d);
            return t.length && days.length > 1 ? tr(`On the ${like ? `same ${baseCats.size} categories` : "tracked categories"}, ${t[0].b} gained the most top-100 listings since ${day(first)} (${t[0].d >= 0 ? "+" : ""}${t[0].d}); ${t[t.length - 1].b} gained least (${t[t.length - 1].d >= 0 ? "+" : ""}${t[t.length - 1].d}).`,
              `${like ? `동일 카테고리 ${baseCats.size}개` : "추적 카테고리"} 기준, ${day(first)} 이후 상위 100위 제품이 가장 많이 는 곳은 ${t[0].b}(${t[0].d >= 0 ? "+" : ""}${t[0].d}), 가장 적게 는 곳은 ${t[t.length - 1].b}(${t[t.length - 1].d >= 0 ? "+" : ""}${t[t.length - 1].d}).`) : tr("Top-100 listings for the selected brands.", "선택한 브랜드의 상위 100위 제품 수.");
          })()} note={like ? tr(<>Counted on the {baseCats.size} categories tracked since {day(first)}, so the 27 Sept and 6 Oct category additions do not show as jumps. Switch to all categories to see the full count, with those additions marked.</>, <>{day(first)}부터 추적한 카테고리 {baseCats.size}개 기준이라 9월 27일·10월 6일 카테고리 추가가 급등으로 보이지 않음. 전체 카테고리로 바꾸면 추가 시점이 표시된 전체 수치 확인 가능.</>)
              : tr(<>All tracked categories. Purple markers: categories added (27 Sept: 5, 6 Oct: lip care), so listing counts jump for coverage, not for the market.</>, <>추적 중인 전체 카테고리. 보라색 표시 = 카테고리 추가 시점(9월 27일: 5개, 10월 6일: 립 케어). 이때의 증가는 시장이 아니라 수집 범위 때문.</>)}
            right={<div className="flex gap-1.5">{([[true, tr(`Same ${baseCats.size} categories`, `동일 카테고리 ${baseCats.size}개`)], [false, tr("All categories", "전체 카테고리")]] as const).map(([v, l]) => <button key={l} onClick={() => setLike(v)} className={`rounded-full px-3 py-1 text-[12.5px] ring-1 ${like === v ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line"}`}>{l}</button>)}</div>}>
            <div className="mb-3 rounded-2xl bg-surface/70 p-4 ring-1 ring-line"><BrandPicker focus={focus} all={known.map((b) => ({ brand: b, slots: rows.filter((r) => r.brand === b).length }))} selected={selected} colors={colors} onToggle={toggle} /></div>
            <Card className="p-5">
              {days.length > 1 ? <LineChart labels={days.map(day)} series={brandSeries} height={260} yLabel={tr("top-100 listings", "상위 100위 제품 수")} markers={trendMarks} /> : <p className="text-[13px] text-muted">{tr("Trends appear after a second day of data.", "데이터가 이틀 이상 쌓이면 추이 표시.")}</p>}
              {trendMarks.length > 0 && <div className="mt-3 grid gap-1 border-t border-line pt-3 text-[12px] text-ink-2 md:grid-cols-2">{trendMarks.map((m, i) => <div key={i} className={m.color === "#b8382e" ? "text-bad" : ""}><span className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: m.color }} />{days[m.from] ? day(days[m.from]) : ""}: {m.label}</div>)}</div>}
            </Card>

            <div className="mb-2 mt-6 text-[14px] font-semibold">{tr("Top-100 listings by brand today", "오늘 브랜드별 상위 100위 제품 수")} <span className="text-[12px] font-normal text-muted">· {tr("click a brand for every listing behind its count", "브랜드를 누르면 집계에 들어간 제품 전체 표시")}</span></div>
            <Card className="overflow-x-auto">
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[minmax(170px,1.4fr)_90px_80px_80px_80px_110px] border-b border-line px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <span>{tr("Brand", "브랜드")}</span><span className="text-right">{tr("Listings", "제품 수")}</span><span className="text-right">{tr("In top 20", "상위 20위")}</span><span className="text-right">{tr("Best", "최고")}</span><span className="text-right">{tr("Paid", "광고")}</span><span className="text-right">{tr("14-day change", "14일 변화")}</span>
                </div>
                <TieredList rows={listing} brandOf={(l) => l.brand} tiers={tiers} top={12} render={(l) => (
                  <button key={l.brand} onClick={() => detail({ kicker: tr(`${l.brand} · ${l.n} top-100 listings today`, `${l.brand} · 오늘 상위 100위 제품 ${l.n}개`), title: tr(`Every ${l.brand} listing in a tracked top 100, ${day(last)}`, `${day(last)} 추적 상위 100위 안의 ${l.brand} 제품 전체`), body: (<>
                    <p className="text-muted">{tr(`One row per listing: a product listed in two categories counts twice, which is how the count is built. Change = rank today vs ${day(l.then)}. Excludes the Korean Beauty store.`, `제품 등록 1건당 한 줄. 두 카테고리에 오른 제품은 두 번 세고, 집계도 동일. 변화 = 오늘 순위 vs ${day(l.then)}. K-뷰티 스토어 제외.`)}</p>
                    <DetailHead>{tr(`${l.cats} categor${l.cats === 1 ? "y" : "ies"}`, `카테고리 ${l.cats}개`)}</DetailHead>
                    <div className="space-y-0.5">{l.rows.map((r) => {
                      const was = pastRows.find((x) => x.product_id === r.product_id && x.subcategory === r.subcategory)?.rank;
                      return (
                        <button key={`${r.subcategory}${r.product_id}`} onClick={() => open(ref(r))} className="grid w-full grid-cols-[44px_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-surface">
                          <b className="tabular">#{r.rank}</b>
                          <span className="min-w-0"><span className="block truncate">{shortName(r.name, r.brand)}</span><span className="text-[11px] text-muted">{CATEGORY_LABEL[r.subcategory]}{r.is_ad ? tr(" · paid slot", " · 광고 구좌") : ""}</span></span>
                          <span className="text-right text-[11.5px] tabular text-muted">{was === undefined ? (pastRows.length ? tr("new", "신규") : "") : was === r.rank ? "=" : was > r.rank ? <span className="text-good">▲{was - r.rank}</span> : <span className="text-bad">▼{r.rank - was}</span>}</span>
                        </button>
                      );
                    })}</div>
                    <DetailHead>{tr("Cross-check on Nykaa", "Nykaa에서 확인")}</DetailHead>
                    <p><a href={`https://www.nykaa.com/search/result/?q=${encodeURIComponent(l.brand)}`} target="_blank" rel="noreferrer" className="text-accent-strong underline">{tr(`${l.brand} on Nykaa ↗`, `Nykaa의 ${l.brand} ↗`)}</a> · <a href={STORE_URL} target="_blank" rel="noreferrer" className="text-accent-strong underline">{tr("Nykaa’s Korean Beauty store ↗", "Nykaa K-뷰티 스토어 ↗")}</a></p>
                  </>) })} className={`grid w-full grid-cols-[minmax(170px,1.4fr)_90px_80px_80px_80px_110px] items-center border-b border-line px-4 py-2 text-left text-[13px] hover:bg-sunken/50 ${tiers.isPinned(l.brand) ? "bg-accent-soft/50" : ""}`}>
                    <span className="font-medium">{l.brand} <span className="text-muted">›</span>{!tiers.inSet(l.brand) && <span className="ml-1.5 text-[11px] font-normal text-muted">{tr("not in focus set", "주요 브랜드 외")}</span>}</span>
                    <b className="text-right tabular">{l.n}</b>
                    <span className="text-right tabular">{l.top20}</span>
                    <span className="text-right tabular">#{l.best}</span>
                    <span className="text-right tabular">{l.paid || <span className="text-muted">0</span>}</span>
                    <span className={`text-right tabular ${l.change > 0 ? "text-good" : l.change < 0 ? "text-bad" : "text-muted"}`}>{l.change === 0 ? tr("no change", "변화 없음") : `${l.change > 0 ? "+" : ""}${l.change}`}</span>
                  </button>
                )} />
              </div>
              <Basis className="border-t border-line px-4 py-2.5">{tr(`Listings across all ${CATEGORIES.length} tracked top 100s today (a product in two categories counts twice). 14-day change counts only categories tracked on both days, so the category additions are excluded.`, `오늘 추적 중인 상위 100위 ${CATEGORIES.length}개 전체의 제품 수 (두 카테고리에 오른 제품은 두 번). 14일 변화는 두 날짜 모두 추적한 카테고리만 세므로 새로 추가된 카테고리는 빠짐.`)}</Basis>
            </Card>
          </ActionSection>

          {days.length > 1 && (
            <ActionSection id="movers" kicker={tr("Movers · the brands that matter", "순위 변동 · 주요 브랜드")} title={up[0] ? tr(`Biggest climb that matters: ${up[0].brand}, ${up[0].change} places in ${CATEGORY_LABEL[up[0].sub].toLowerCase()}${down[0] ? `; biggest fall: ${down[0].brand}, ${Math.abs(down[0].change)} places in ${CATEGORY_LABEL[down[0].sub].toLowerCase()}` : ""} (${win} days; focus brands and unpaid moves count most).`, `가장 큰 상승: ${up[0].brand}, ${CATEGORY_LABEL[up[0].sub]}에서 ${up[0].change}계단${down[0] ? `. 가장 큰 하락: ${down[0].brand}, ${CATEGORY_LABEL[down[0].sub]}에서 ${Math.abs(down[0].change)}계단` : ""} (${win}일, 주요 브랜드와 자연 검색 변동에 가중치).`) : tr(`Rank moves over ${win} days.`, `${win}일간 순위 변동.`)}
              note={tr(<>Rank change inside each category&apos;s top 100{past ? `, ${day(past)} → ${day(last)}` : ""}, for {set.anchor}, the Korean brand set and the rivals holding the most places in {set.anchor}&apos;s categories. <Opens detail={{ kicker: "Method", title: "Which moves are counted", body: <Points items={[`Only products ranked on both days count as moves; entries and exits are listed separately.`, `Rivals in view: the Indian and global brands holding the most places in ${set.anchor}'s own categories today.`, `Shelves added after ${past ? day(past) : "that day"} are left out until they have a past to compare with.`, "Entries are often a sponsored slot or a new listing; exits are often a sponsored slot ending or Nykaa showing another listing of the same product."]} /> }}>Method</Opens></>,
                <>카테고리별 상위 100위 안의 순위 변화{past ? `, ${day(past)} → ${day(last)}` : ""}. 대상: {set.anchor}, K-뷰티 브랜드, {set.anchor} 카테고리에서 상위 100위 제품이 가장 많은 경쟁사. <Opens detail={{ kicker: "방법", title: "어떤 변동을 세는가", body: <Points items={["두 날짜 모두 순위에 있는 제품만 변동으로 집계. 진입·이탈은 따로 표시.", `대상 경쟁사: 오늘 ${set.anchor} 카테고리에서 상위 100위 제품이 가장 많은 인도·글로벌 브랜드.`, `${past ? day(past) : "그날"} 이후 추가된 카테고리는 비교할 과거 데이터가 생길 때까지 제외.`, "진입은 대개 광고 구좌나 신규 등록, 이탈은 광고 종료나 Nykaa가 같은 제품의 다른 등록을 보여 주는 경우."]} /> }}>방법</Opens></>)}
              right={<div className="flex flex-wrap gap-2"><div className="flex gap-1.5">{(["set", "all"] as const).map((v) => <button key={v} onClick={() => setMoverScope(v)} className={`rounded-full px-3 py-1 text-[12.5px] ring-1 ${moverScope === v ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line"}`}>{v === "set" ? tr("Brands that matter", "주요 브랜드") : tr("All brands", "전체 브랜드")}</button>)}</div><Segmented<Window> value={win} onChange={setWin} options={[{ value: "7", label: tr("7 days", "7일") }, { value: "14", label: tr("14 days", "14일") }]} /></div>}>
              <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-2">
                <span className="mr-1 text-muted">{moverScope === "set" ? tr("Shown: Innisfree, the focus brands and the rivals holding most places in its categories:", "표시: Innisfree, 주요 브랜드, Innisfree 카테고리에서 상위 100위 제품이 가장 많은 경쟁사:") : tr("Showing every brand. Rivals in Innisfree's categories:", "전체 브랜드 표시. Innisfree 카테고리의 경쟁사:")}</span>
                {set.rivals.map((r) => <span key={r.brand} className="rounded-full bg-surface px-2.5 py-0.5 ring-1 ring-line">{r.brand} <span className="text-muted">{ORIGIN_LABEL[r.origin]} · {tr(`${r.slots} slots`, `${r.slots}개`)}</span></span>)}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {([[tr("Climbing", "상승"), up], [tr("Falling", "하락"), down]] as const).map(([title, list]) => (
                  <Card key={title} className="p-4">
                    <div className="mb-1 grid grid-cols-[1fr_96px_64px] gap-3 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                      <span>{title}</span><span className="text-right">{tr("Rank", "순위")}</span><span className="text-right">{tr("Places", "계단")}</span>
                    </div>
                    {!moversData.data ? <p className="px-2 text-[12.5px] text-muted">{tr("Loading…", "불러오는 중…")}</p> : !list.length ? <p className="px-2 py-2 text-[12.5px] text-muted">{tr("No moves in this window.", "이 기간 변동 없음.")}</p> : list.map((m) => <MoveRow key={m.key} m={m} tier={tagOf(m.brand)} onOpen={() => m.row && open(ref(m.row))} />)}
                  </Card>
                ))}
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {([[tr("Entered the top 100", "상위 100위 진입"), entered, tr("Usually a sponsored slot or a new listing; ranked by today's position.", "대개 광고 구좌나 신규 등록. 오늘 순위 순.")], [tr("Left the top 100", "상위 100위 이탈"), left, tr("Often a sponsored slot ending, or Nykaa showing another listing of the same product.", "대개 광고 종료이거나, Nykaa가 같은 제품의 다른 등록을 보여 주는 경우.")]] as const).map(([title, list, note]) => (
                  <Card key={title} className="p-4">
                    <div className="px-2 text-[14px] font-semibold">{title} <span className="font-normal text-muted">· {list.length}</span></div>
                    <p className="mb-1 px-2 text-[12px] text-muted">{note}</p>
                    {(moreLists ? list : list.slice(0, 8)).map((m) => (
                      <button key={m.key} onClick={() => m.row && open(ref(m.row))} disabled={!m.row} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-xl px-2 py-1.5 text-left enabled:hover:bg-page">
                        <span className="min-w-0"><span className="block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-2">{m.brand}<TierTag tier={tagOf(m.brand)} /> <span className="font-normal normal-case tracking-normal text-muted">· {CATEGORY_LABEL[m.sub]}</span></span>
                          <span className="block truncate text-[12.5px]">{shortName(m.name, m.brand)}</span></span>
                        <span className="text-right text-[12.5px] tabular">{m.to ? <b>#{m.to}</b> : <span className="text-muted">{tr("was", "이전")} #{m.from}</span>}
                          {(m.isAd || m.wasAd) && <span className="ml-1.5 rounded bg-[#fff4d6] px-1 text-[10.5px] text-[#8a6100]">{m.isAd ? tr("paid slot", "광고 구좌") : tr("was paid", "이전 광고")}</span>}</span>
                      </button>
                    ))}
                    {list.length > 8 && <button onClick={() => setMoreLists(!moreLists)} className="px-2 pt-1 text-[12px] font-medium text-ink-2 underline decoration-line-2 underline-offset-2 hover:text-ink">{moreLists ? tr("Show fewer", "접기") : tr(`Show ${list.length - 8} more`, `${list.length - 8}개 더 보기`)}</button>}
                  </Card>
                ))}
              </div>
              <Card className="mt-4 p-4">
                <div className="mb-1 px-2 text-[14px] font-semibold">{tr(`${set.anchor} over the same ${win} days`, `같은 ${win}일간의 ${set.anchor}`)}</div>
                <p className="mb-2 px-2 text-[12.5px] text-muted">{tr(`Every ${set.anchor} listing in a tracked top 100 today, plus any that dropped out.`, `오늘 추적 상위 100위 안의 ${set.anchor} 제품 전체와 이탈한 제품.`)}</p>
                {!moversData.data ? <p className="px-2 text-[12.5px] text-muted">{tr("Loading…", "불러오는 중…")}</p> : !anchorMoves.length ? <p className="px-2 text-[12.5px] text-muted">{tr(`No ${set.anchor} listing in a tracked top 100 on either day.`, `두 날짜 모두 추적 상위 100위에 ${set.anchor} 제품 없음.`)}</p>
                  : <div className="grid gap-x-6 lg:grid-cols-2">{anchorMoves.map((m) => <MoveRow key={m.key} m={m} tier={null} onOpen={() => m.row && open(ref(m.row))} />)}</div>}
                {rows.filter((r) => norm(r.brand) === norm(set.anchor) && !moves.some((m) => m.product_id === r.product_id && m.sub === r.subcategory)).length > 0 && (
                  <p className="mt-2 px-2 text-[12px] text-muted">{tr(`Listings on shelves added after ${past ? day(past) : "that day"} are not shown here; they appear once the shelf has ${win} days of history.`, `${past ? day(past) : "그날"} 이후 추가된 카테고리 제품은 여기 안 나오고, ${win}일 이력이 쌓이면 표시.`)}</p>
                )}
              </Card>
            </ActionSection>
          )}

          <ActionSection id="store" kicker={tr("Nykaa's Korean Beauty store", "Nykaa K-뷰티 스토어")} title={storeLeaders[0] ? tr(`${storeLeaders[0].b} holds the most places in the Korean store (${storeLeaders[0].n} of 100); ${anchorInStore ? `${set.anchor} holds ${anchorInStore.n}, best #${anchorInStore.best}` : `${set.anchor} holds none`}.`, `K-뷰티 스토어 최다 노출: ${storeLeaders[0].b}(100개 중 ${storeLeaders[0].n}개). ${anchorInStore ? `${set.anchor}: ${anchorInStore.n}개, 최고 #${anchorInStore.best}` : `${set.anchor}: 없음`}.`) : tr("The Korean store was not collected today.", "오늘은 K-뷰티 스토어 수집 실패.")}
            note={tr(<>The store&rsquo;s first 100 products in the Nykaa app&rsquo;s order, all product types mixed; brands ordered by places held. Click a brand for its products. <Opens detail={{ kicker: "Method", title: "What the Korean store table shows", body: <Points items={["Nykaa runs a dedicated Korean Beauty store (category 30710) mixing serums, sunscreens, masks and makeup.", "We read its first 100 products every morning in the order the Nykaa app shows them (its default popularity sort; the website can order them differently).", "Brands are ordered by how many of those 100 places they hold, then by best position.", "A place can be bought: the paid column counts sponsored slots, often why a brand sits above one with more ratings.", "Ratings: Nykaa shows one set of ratings for all sizes of a product (e.g. a mask and its Mini), so a brand's total counts each set once."]} /> }}>Method</Opens> <a href={STORE_URL} target="_blank" rel="noreferrer" className="ml-1 underline underline-offset-2">Open the store ↗</a></>,
              <>Nykaa 앱 순서 기준 스토어 첫 100개 제품(제품 유형 혼합). 브랜드는 차지한 수 순, 브랜드를 누르면 제품 표시. <Opens detail={{ kicker: "방법", title: "K-뷰티 스토어 표의 의미", body: <Points items={["Nykaa는 세럼, 선크림, 마스크, 메이크업을 함께 파는 K-뷰티 전용 스토어(카테고리 30710)를 운영.", "매일 아침 Nykaa 앱의 기본 순서(인기순, 웹사이트 순서와 다를 수 있음)대로 첫 100개 제품 수집.", "브랜드 정렬: 100개 중 차지한 수 → 최고 순위.", "순위는 광고로 살 수 있음: 광고 열은 광고 구좌 수. 평가가 적은 브랜드가 위에 있는 이유인 경우가 많음.", "평가 수: Nykaa는 한 제품의 모든 용량(예: 본품과 미니)에 같은 평가를 보여 주므로 브랜드 합계에선 한 번만 집계."]} /> }}>방법</Opens> <a href={STORE_URL} target="_blank" rel="noreferrer" className="ml-1 underline underline-offset-2">스토어 열기 ↗</a></>)}>
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-[13px]">
                <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  <th className="px-5 py-3">{tr("Brand", "브랜드")}</th><th className="px-3 py-3 text-right">{tr("Places in top 100", "상위 100위 제품")}</th><th className="px-3 py-3 text-right">{tr("In top 20", "상위 20위")}</th>
                  <th className="px-3 py-3 text-right">{tr("Best", "최고")}</th><th className="px-3 py-3 text-right">{tr("Typical", "보통")}</th><th className="px-3 py-3 text-right">{tr("Paid", "광고")}</th>
                  <th className="px-3 py-3 text-right">{tr("Ratings on these products", "해당 제품 평가 수")}</th><th className="px-5 py-3 text-right">{tr("Avg rating", "평균 별점")}</th>
                </tr></thead>
                <tbody>
                  {storeShown.map((s, i) => {
                    const isAnchor = norm(s.b) === norm(set.anchor); const isOpen = openBrand === s.b;
                    return (
                      <Fragment key={s.b}>
                        <tr onClick={() => setOpenBrand(isOpen ? null : s.b)} className={`cursor-pointer border-b border-line/70 hover:bg-page ${isAnchor ? "bg-[#f3f7fd]" : ""}`}>
                          <td className="px-5 py-2.5"><span className="mr-2 inline-block w-5 text-right text-muted tabular">{store.indexOf(s) + 1}</span><b className="font-medium">{s.b}</b><TierTag tier={tagOf(s.b)} /><span className="ml-1.5 text-muted">{isOpen ? "▾" : "▸"}</span></td>
                          <td className="px-3 py-2.5 text-right tabular"><b>{s.n}</b></td>
                          <td className="px-3 py-2.5 text-right tabular">{s.top20}</td>
                          <td className="px-3 py-2.5 text-right tabular">#{s.best}</td>
                          <td className="px-3 py-2.5 text-right tabular text-ink-2">#{Math.round(s.med)}</td>
                          <td className="px-3 py-2.5 text-right tabular">{s.paid ? <span className="rounded bg-[#fff4d6] px-1.5 text-[#8a6100]">{s.paid}</span> : <span className="text-muted">0</span>}</td>
                          <td className="px-3 py-2.5 text-right tabular">{compact(s.ratingsSum)}</td>
                          <td className="px-5 py-2.5 text-right tabular">{s.avg ? `★ ${s.avg.toFixed(2)}` : <Missing>{tr("no ratings", "평가 없음")}</Missing>}</td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b border-line/70 bg-page/60"><td colSpan={8} className="px-5 py-3">
                            <table className="w-full text-[12.5px]"><tbody>
                              {s.rows.map((r) => (
                                <tr key={r.product_id} onClick={() => open(ref(r))} className="cursor-pointer hover:bg-surface">
                                  <td className="w-14 py-1.5 tabular text-ink-2">#{r.rank}</td>
                                  <td className="py-1.5 pr-3">{shortName(r.name, r.brand)}{r.is_ad && <span className="ml-1.5 rounded bg-[#fff4d6] px-1 text-[10.5px] text-[#8a6100]">{tr("paid", "광고")}</span>}</td>
                                  <td className="py-1.5 pr-3 text-muted">{tx(r.nykaa_l3) ?? ""}</td>
                                  <td className="py-1.5 pr-3 text-right tabular">{ratings(r)}</td>
                                  <td className="py-1.5 text-right tabular">{inr(r.price)}</td>
                                </tr>
                              ))}
                            </tbody></table>
                          </td></tr>
                        )}
                        {i === 11 && storeShown.length > 12 && <tr><td colSpan={8} className="px-5 py-1 text-center text-[11px] text-muted">…</td></tr>}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {!anchorInStore && <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-2">{tr(<><b>{set.anchor}</b> holds no place in the store&apos;s top 100 today.</>, <>오늘 스토어 상위 100위에 <b>{set.anchor}</b> 제품 없음.</>)}</p>}
            </Card>
          </ActionSection>

          <ActionSection id="launches" kicker={tr("Launches catching on", "초기 반응이 좋은 신제품")} title={launches[0] ? tr(`${launches[0].r.brand}'s ${shortName(launches[0].r.name, launches[0].r.brand).split(/,| - /)[0]} is the fastest-catching launch, at ${launches[0].perDay.toFixed(1)} ratings a day.`, `가장 빠르게 반응을 얻는 신제품: ${launches[0].r.brand} ${shortName(launches[0].r.name, launches[0].r.brand).split(/,| - /)[0]}(하루 평가 ${launches[0].perDay.toFixed(1)}건).`) : tr("No launch from these brands is catching on yet.", "아직 반응이 오는 이 브랜드들의 신제품 없음.")}
            note={tr(`First reviewed under 90 days ago, already in a top 100, with at least 10 ratings; ordered by ratings gained per day. ${allLaunches.length - launches.length} other launches are left out.`, `첫 리뷰 90일 미만, 이미 상위 100위 진입, 평가 10건 이상인 제품. 하루 평균 평가 증가 순. 그 외 신제품 ${allLaunches.length - launches.length}개 제외.`)}>
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-[13px]">
                <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  <th className="px-5 py-3" colSpan={2}>{tr("Product", "제품")}</th><th className="px-3 py-3">{tr("Shelf & rank", "카테고리·순위")}</th><th className="px-3 py-3 text-right">{tr("Ratings", "평가 수")}</th>
                  <th className="px-3 py-3 text-right">{tr("First review", "첫 리뷰")}</th><th className="px-5 py-3 text-right">{tr("Ratings / day", "하루 평가")}</th>
                </tr></thead>
                <tbody>
                  {launches.slice(0, 15).map(({ r, age, perDay }) => (
                    <tr key={`${r.subcategory}${r.product_id}`} onClick={() => open(ref(r))} className={`cursor-pointer border-b border-line/70 hover:bg-page ${norm(r.brand) === norm(set.anchor) ? "bg-[#f3f7fd]" : ""}`}>
                      <td className="w-14 py-2 pl-5">
                        <span className="grid h-10 w-10 place-items-center overflow-hidden rounded-lg bg-page ring-1 ring-line">
                          {/* eslint-disable-next-line @next/next/no-img-element -- Nykaa CDN image */}
                          {r.image_url ? <img src={r.image_url} alt="" className="h-8 w-8 object-contain" /> : null}
                        </span>
                      </td>
                      <td className="py-2 pr-3"><span className="block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-2">{r.brand}<TierTag tier={tagOf(r.brand)} /></span><span className="block max-w-[420px] truncate">{shortName(r.name, r.brand)}</span></td>
                      <td className="px-3 py-2 text-ink-2">#{r.rank} {CATEGORY_LABEL[r.subcategory]}{r.is_ad && <span className="ml-1.5 rounded bg-[#fff4d6] px-1 text-[10.5px] text-[#8a6100]">{tr("paid", "광고")}</span>}</td>
                      <td className="px-3 py-2 text-right tabular">{(r.rating_count ?? 0).toLocaleString("en-US")}{r.rating ? <span className="text-muted"> ★ {r.rating.toFixed(1)}</span> : null}</td>
                      <td className="px-3 py-2 text-right tabular text-ink-2">{day(r.first_review_date!)} <span className="text-muted">· {tr(`${age}d ago`, `${age}일 전`)}</span></td>
                      <td className="px-5 py-2 text-right tabular"><b>{perDay.toFixed(1)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!launches.length && <p className="px-5 py-4 text-[12.5px] text-muted">{tr("No launches from these brands on a tracked shelf.", "추적 랭킹 목록에 이 브랜드들의 신제품 없음.")}</p>}
              {!launches.some((l) => norm(l.r.brand) === norm(set.anchor)) && <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-2">{tr(<><b>{set.anchor}</b> has no launch under 90 days old on any tracked top 100.</>, <>추적 상위 100위에 출시 90일 미만인 <b>{set.anchor}</b> 신제품 없음.</>)}</p>}
            </Card>
          </ActionSection>
        </>
      )}
    </Shell>
  );
}

export default function Page() {
  return <AuthGate><MarketPage /></AuthGate>;
}

function MoveRow({ m, tier, onOpen }: { m: Move; tier: Tag | null; onOpen: () => void }) {
  return (
    <button onClick={onOpen} disabled={!m.row} className="grid w-full grid-cols-[1fr_96px_64px] items-center gap-3 rounded-xl px-2 py-2 text-left enabled:hover:bg-page">
      <span className="min-w-0">
        <span className="block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-2">{m.brand}<TierTag tier={tier} /> <span className="font-normal normal-case tracking-normal text-muted">· {CATEGORY_LABEL[m.sub]}</span></span>
        <span className="block truncate text-[13px]">{shortName(m.name, m.brand)}</span>
        <span className="block text-[11.5px] text-muted">{ratings(m)}{m.isAd && <span className="ml-1.5 rounded bg-[#fff4d6] px-1 text-[10.5px] text-[#8a6100]">{tr("paid slot today", "오늘 광고 구좌")}</span>}</span>
      </span>
      <span className="text-right text-[12.5px] text-muted tabular">{m.from ? `#${m.from}` : tr("outside", "순위 밖")} → <b className="text-ink">{m.to ? `#${m.to}` : tr("out", "이탈")}</b></span>
      <span className={`text-right text-[13px] font-semibold tabular ${m.change > 0 ? "text-good" : m.change < 0 ? "text-bad" : "text-muted"}`}>{m.change > 0 ? "▲" : m.change < 0 ? "▼" : "="} {Math.abs(m.change) || ""}</span>
    </button>
  );
}
