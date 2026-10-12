"use client";

import { Fragment, useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import BrandPicker from "@/components/BrandPicker";
import LineChart from "@/components/LineChart";
import { useOpenProduct, type ProductRef } from "@/components/ProductDrawer";
import Shell from "@/components/Shell";
import Segmented from "@/components/Segmented";
import { Card, Loading, PageHead, Stat, Verdict } from "@/components/ui";
import { Missing, Opens, Points } from "@/components/Detail";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import { ANCHOR_BRAND, FOCUS_BRANDS, ORIGIN_LABEL, TIER_LABEL, marketSet, norm, resolveBrand, type Tier } from "@/lib/brands";
import { useBrandDaily, useKoreanStore, useProductNames, useShareDaily, useShelf, useShelfDays } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL, compact, inr, median, shortName } from "@/lib/format";
import { useBrandSelection } from "@/lib/selection";
import type { ShelfRow } from "@/lib/types";

const ORIGINS = ["kbeauty", "local", "global", "unknown"] as const;
const OC: Record<string, string> = { kbeauty: "#2a78d6", local: "#eb6834", global: "#1baf7a", unknown: "#c9c7bf" };
const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
const isFocus = (b: string) => FOCUS_BRANDS.some((f) => norm(f) === norm(b));
const STORE_URL = "https://www.nykaa.com/korean-beauty/c/30710";
const TIER_STYLE: Record<Tier, string> = { anchor: "bg-brand text-on-brand", kbeauty: "bg-[#e6effb] text-[#1f5fae]", watch: "bg-[#eef3fa] text-[#4a6b94]", rival: "bg-[#fdeee6] text-[#b4501f]" };
function TierTag({ tier }: { tier: Tier | null }) {
  return tier ? <span className={`ml-1.5 rounded px-1.5 py-[1px] text-[10px] font-semibold uppercase tracking-[0.05em] ${TIER_STYLE[tier]}`}>{TIER_LABEL[tier]}</span> : null;
}
const ratings = (r: { rating?: number | null; rating_count?: number | null }) =>
  r.rating_count ? `${r.rating ? `★ ${r.rating.toFixed(1)} · ` : ""}${compact(r.rating_count)} ratings` : "no ratings yet";
type Window = "7" | "14";
const NAV: NavItem[] = [
  { id: "summary", label: "Summary" }, { id: "origin", label: "Who holds the shelf" }, { id: "trend", label: "Day by day" },
  { id: "movers", label: "Movers" }, { id: "store", label: "Korean store" }, { id: "launches", label: "Launches" },
];
interface Move { wasAd?: boolean; key: string; product_id: string; brand: string; name: string; sub: string; from: number | null; to: number | null; change: number; isAd: boolean; rating: number | null; rating_count: number | null; row?: ShelfRow; url?: string | null }

const ref = (r: ShelfRow): ProductRef => ({ product_id: r.product_id, name: r.name, brand: r.brand, url: r.url, image: r.image_url, price: r.price, mrp: r.mrp, rating: r.rating, rating_count: r.rating_count, usp: r.usp_summary, phrases: r.review_key_phrases, splitup: r.review_splitup, madeIn: r.country_name });

function MarketPage() {
  const shelf = useShelf(); const share = useShareDaily(); const bd = useBrandDaily(); const kstore = useKoreanStore();
  const open = useOpenProduct();
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
  const focus = useMemo(() => FOCUS_BRANDS.map((b) => resolveBrand(b, known) ?? b).filter((b) => known.includes(b)), [known]);
  const { selected, colors, toggle } = useBrandSelection(known);

  const shareOn = (d: string, sub?: string) => {
    const s = (share.data ?? []).filter((x) => x.scrape_date === d && (!sub || x.subcategory === sub));
    const tot = s.reduce((a, x) => a + Number(x.slots), 0) || 1;
    return Object.fromEntries(ORIGINS.map((o) => [o, s.filter((x) => x.origin === o).reduce((a, x) => a + Number(x.slots), 0) / tot])) as Record<string, number>;
  };
  const kNow = last ? shareOn(last).kbeauty : 0; const kFirst = first ? shareOn(first).kbeauty : 0;
  const focusSlots = rows.filter((r) => isFocus(r.brand)).length;

  const brandSeries = useMemo(() => selected.map((b) => ({ name: b, color: colors[b], values: days.map((d) => {
    const v = (bd.data ?? []).filter((r) => r.brand === b && r.scrape_date === d && r.subcategory !== "kbeauty_store").reduce((a, r) => a + Number(r.slots), 0);
    return v; }) })), [selected, colors, days, bd.data]);

  const allLaunches = useMemo(() => {
    if (!last) return [];
    const now = new Date(last).getTime();   // ages are measured from the latest collection day
    return rows.filter((r) => r.first_review_date && now - new Date(r.first_review_date).getTime() <= 90 * 864e5)
      .map((r) => { const age = Math.max(1, Math.round((now - new Date(r.first_review_date!).getTime()) / 864e5)); return { r, age, perDay: (r.rating_count ?? 0) / age }; })
      .sort((a, b) => b.perDay - a.perDay);
  }, [rows, last]);
  // "catching on" needs some evidence: a launch with a handful of ratings says nothing yet
  const launches = useMemo(() => allLaunches.filter((l) => set.has(l.r.brand) && (l.r.rating_count ?? 0) >= 10), [allLaunches, set]);

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
  const relevant = moves.filter((m) => set.has(m.brand));
  // a real move is a product ranked on both days; entries and exits are mostly sponsored slots coming and going
  // or Nykaa swapping which listing of a product it shows, so they are kept apart
  const both = relevant.filter((m) => m.from !== null && m.to !== null);
  const up = [...both].filter((m) => m.change > 0).sort((a, b) => b.change - a.change).slice(0, 10);
  const down = [...both].filter((m) => m.change < 0).sort((a, b) => a.change - b.change).slice(0, 10);
  const entered = relevant.filter((m) => m.from === null).sort((a, b) => a.to! - b.to!);
  const left = relevant.filter((m) => m.to === null).sort((a, b) => a.from! - b.from!);
  const anchorMoves = moves.filter((m) => norm(m.brand) === norm(set.anchor)).sort((a, b) => (a.to ?? 999) - (b.to ?? 999));

  // the Korean Beauty store: one row per brand, ordered by how many of the store's top 100 it holds
  const store = useMemo(() => {
    const k = kstore.data ?? []; const m = new Map<string, ShelfRow[]>(); k.forEach((r) => m.set(r.brand, [...(m.get(r.brand) ?? []), r]));
    return [...m.entries()].map(([b, rs]) => {
      const sorted = [...rs].sort((x, y) => x.rank - y.rank);
      const rated = rs.filter((r) => r.rating_count);
      return { b, rows: sorted, n: rs.length, top20: rs.filter((r) => r.rank <= 20).length, best: sorted[0].rank, med: median(rs.map((r) => r.rank)) ?? 0,
        paid: rs.filter((r) => r.is_ad).length, ratingsSum: rs.reduce((a, r) => a + (r.rating_count ?? 0), 0),
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
  const anchorRatings = anchorRows.reduce((a, r) => a + (r.rating_count ?? 0), 0);
  return (
    <Shell active="Market" asOf={last ? day(last) : undefined}>
      <PageHead eyebrow="The Nykaa shelf" title="Market" sub={<>The Nykaa shelf across {CATEGORIES.length} categories: who holds the top-100 places, how that moves day by day, who is climbing, the Korean store, and which launches are catching on.</>} />
      {!ready ? <Loading what="market data" /> : (
        <>
          <SectionNav items={NAV} />
          <section id="summary" className="mt-6 scroll-mt-32">
          <Verdict eyebrow="The shelf today" points={[
              <>{set.anchor}&rsquo;s listed products carry {compact(anchorRatings)} ratings in total.</>,
              <>The Korean store&rsquo;s top three brands hold {storeLeaders.slice(0, 3).reduce((a, s) => a + s.n, 0)} of its 100 places; {storeLeaders.slice(0, 10).filter((s) => isFocus(s.b)).length} of its top 10 brands are in the focus set.</>,
            ]}>
              K-beauty holds {(kNow * 100).toFixed(1)}% of all top-100 places{days.length > 1 ? `, ${kNow >= kFirst ? "up" : "down"} ${Math.abs((kNow - kFirst) * 100).toFixed(1)} points since ${day(first)}` : ""}; {set.anchor} holds {anchorSlots} of them{anchorSlots ? `, best #${anchorBest}` : ""}{anchorInStore ? `, and ${anchorInStore.n} of the Korean store's top 100` : ", and no place in the Korean store's top 100"}.
            </Verdict>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Stat label="K-beauty share of the shelf" value={`${(kNow * 100).toFixed(1)}%`} sub={days.length > 1 ? `${kNow >= kFirst ? "▲" : "▼"} ${Math.abs((kNow - kFirst) * 100).toFixed(1)} pts since ${day(first)} · ${days.length} days tracked` : "first day of data"} />
            <Stat label="Focus brands' listings" value={String(focusSlots)} sub={`${((focusSlots / Math.max(1, rows.length)) * 100).toFixed(1)}% of all top-100 slots`} />
            <Stat label="Launches on the shelf" value={String(allLaunches.length)} sub={`first reviewed in the last 90 days · ${allLaunches.filter((l) => l.r.origin === "kbeauty").length} K-beauty · ${launches.length} from brands in view`} />
            <Stat label="Korean store leader" value={storeLeaders[0]?.b ?? "None today"} sub={storeLeaders[0] ? `${storeLeaders[0].n} of the store's top 100 · best #${storeLeaders[0].best}` : "the store was not collected today"} />
          </div>
          </section>

          <ActionSection id="origin" kicker="Who holds the shelf · by brand origin" title={(() => {
            const k = CATEGORIES.map((c) => ({ c, v: shareOn(last, c).kbeauty })).sort((a, b) => b.v - a.v);
            return `K-beauty is strongest in ${CATEGORY_LABEL[k[0].c].toLowerCase()} (${Math.round(k[0].v * 100)}% of the top 100) and weakest in ${CATEGORY_LABEL[k[k.length - 1].c].toLowerCase()} (${Math.round(k[k.length - 1].v * 100)}%).`;
          })()} note={`Share of each category's top-100 places by brand origin, ${day(last)}. The top 20 is where most clicks land.`}>
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
                        {ORIGINS.map((o) => s[o] > 0 && <div key={o} title={`${ORIGIN_LABEL[o]} ${(s[o] * 100).toFixed(0)}%`} className="flex items-center justify-center text-[11.5px] font-semibold text-white" style={{ width: `${s[o] * 100}%`, background: OC[o], borderRight: "2px solid #fff" }}>{s[o] >= 0.07 ? `${Math.round(s[o] * 100)}%` : ""}</div>)}
                      </div>
                      <span className="text-[12.5px] text-ink-2 tabular">K-beauty in top 20: <b>{Math.round(k20 * 100)}%</b></span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </ActionSection>

          <ActionSection id="trend" kicker="Focus brands, day by day" title={(() => {
            const t = brandSeries.map((b) => ({ b: b.name, d: (b.values.at(-1) ?? 0) - (b.values[0] ?? 0) })).sort((a, b) => b.d - a.d);
            return t.length && days.length > 1 ? `${t[0].b} gained the most top-100 listings since ${day(first)} (${t[0].d >= 0 ? "+" : ""}${t[0].d}); ${t[t.length - 1].b} gained least (${t[t.length - 1].d >= 0 ? "+" : ""}${t[t.length - 1].d}).` : "Top-100 listings for the selected brands.";
          })()} note="Total top-100 listings across the tracked categories. Pick brands below; hover the chart for values.">
            <div className="mb-3 rounded-2xl bg-surface/70 p-4 ring-1 ring-line"><BrandPicker focus={focus} all={known.map((b) => ({ brand: b, slots: rows.filter((r) => r.brand === b).length }))} selected={selected} colors={colors} onToggle={toggle} /></div>
            <Card className="p-5">{days.length > 1 ? <LineChart labels={days.map(day)} series={brandSeries} height={260} yLabel="top-100 listings" /> : <p className="text-[13px] text-muted">Trends appear after a second day of data.</p>}</Card>
          </ActionSection>

          {days.length > 1 && (
            <ActionSection id="movers" kicker="Movers · the brands that matter" title={up[0] ? `${up[0].brand} climbed furthest (${up[0].change} places in ${CATEGORY_LABEL[up[0].sub].toLowerCase()})${down[0] ? `; ${down[0].brand} fell furthest (${Math.abs(down[0].change)} places in ${CATEGORY_LABEL[down[0].sub].toLowerCase()})` : ""}, over ${win} days.` : `Rank moves over ${win} days.`}
              note={<>Rank change inside each category&apos;s top 100{past ? `, ${day(past)} → ${day(last)}` : ""}, for {set.anchor}, the Korean brand set and the rivals holding the most places in {set.anchor}&apos;s categories. <Opens detail={{ kicker: "Method", title: "Which moves are counted", body: <Points items={[`Only products ranked on both days count as moves; entries and exits are listed separately.`, `Rivals in view: the Indian and global brands holding the most places in ${set.anchor}'s own categories today.`, `Shelves added after ${past ? day(past) : "that day"} are left out until they have a past to compare with.`, "Entries are often a sponsored slot or a new listing; exits are often a sponsored slot ending or Nykaa showing another listing of the same product."]} /> }}>Method</Opens></>}
              right={<Segmented<Window> value={win} onChange={setWin} options={[{ value: "7", label: "7 days" }, { value: "14", label: "14 days" }]} />}>
              <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-2">
                <span className="mr-1 text-muted">Rivals in view:</span>
                {set.rivals.map((r) => <span key={r.brand} className="rounded-full bg-surface px-2.5 py-0.5 ring-1 ring-line">{r.brand} <span className="text-muted">{ORIGIN_LABEL[r.origin]} · {r.slots} slots</span></span>)}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {([["Climbing", up], ["Falling", down]] as const).map(([title, list]) => (
                  <Card key={title} className="p-4">
                    <div className="mb-1 grid grid-cols-[1fr_96px_64px] gap-3 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                      <span>{title}</span><span className="text-right">Rank</span><span className="text-right">Places</span>
                    </div>
                    {!moversData.data ? <p className="px-2 text-[12.5px] text-muted">Loading…</p> : !list.length ? <p className="px-2 py-2 text-[12.5px] text-muted">No moves in this window.</p> : list.map((m) => <MoveRow key={m.key} m={m} tier={set.tier(m.brand)} onOpen={() => m.row && open(ref(m.row))} />)}
                  </Card>
                ))}
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                {([["Entered the top 100", entered, "Usually a sponsored slot or a new listing; ranked by today's position."], ["Left the top 100", left, "Often a sponsored slot ending, or Nykaa showing another listing of the same product."]] as const).map(([title, list, note]) => (
                  <Card key={title} className="p-4">
                    <div className="px-2 text-[14px] font-semibold">{title} <span className="font-normal text-muted">· {list.length}</span></div>
                    <p className="mb-1 px-2 text-[12px] text-muted">{note}</p>
                    {list.slice(0, 8).map((m) => (
                      <button key={m.key} onClick={() => m.row && open(ref(m.row))} disabled={!m.row} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 rounded-xl px-2 py-1.5 text-left enabled:hover:bg-page">
                        <span className="min-w-0"><span className="block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-2">{m.brand}<TierTag tier={set.tier(m.brand)} /> <span className="font-normal normal-case tracking-normal text-muted">· {CATEGORY_LABEL[m.sub]}</span></span>
                          <span className="block truncate text-[12.5px]">{shortName(m.name, m.brand)}</span></span>
                        <span className="text-right text-[12.5px] tabular">{m.to ? <b>#{m.to}</b> : <span className="text-muted">was #{m.from}</span>}
                          {(m.isAd || m.wasAd) && <span className="ml-1.5 rounded bg-[#fff4d6] px-1 text-[10.5px] text-[#8a6100]">{m.isAd ? "paid slot" : "was paid"}</span>}</span>
                      </button>
                    ))}
                    {list.length > 8 && <p className="px-2 pt-1 text-[11.5px] text-muted">+{list.length - 8} more</p>}
                  </Card>
                ))}
              </div>
              <Card className="mt-4 p-4">
                <div className="mb-1 px-2 text-[14px] font-semibold">{set.anchor} over the same {win} days</div>
                <p className="mb-2 px-2 text-[12.5px] text-muted">Every {set.anchor} listing in a tracked top 100 today, plus any that dropped out.</p>
                {!moversData.data ? <p className="px-2 text-[12.5px] text-muted">Loading…</p> : !anchorMoves.length ? <p className="px-2 text-[12.5px] text-muted">No {set.anchor} listing in a tracked top 100 on either day.</p>
                  : <div className="grid gap-x-6 lg:grid-cols-2">{anchorMoves.map((m) => <MoveRow key={m.key} m={m} tier={null} onOpen={() => m.row && open(ref(m.row))} />)}</div>}
                {rows.filter((r) => norm(r.brand) === norm(set.anchor) && !moves.some((m) => m.product_id === r.product_id && m.sub === r.subcategory)).length > 0 && (
                  <p className="mt-2 px-2 text-[12px] text-muted">Listings on shelves added after {past ? day(past) : "that day"} are not shown here; they appear once the shelf has {win} days of history.</p>
                )}
              </Card>
            </ActionSection>
          )}

          <ActionSection id="store" kicker="Nykaa's Korean Beauty store" title={storeLeaders[0] ? `${storeLeaders[0].b} holds the most places in the Korean store (${storeLeaders[0].n} of 100); ${anchorInStore ? `${set.anchor} holds ${anchorInStore.n}, best #${anchorInStore.best}` : `${set.anchor} holds none`}.` : "The Korean store was not collected today."}
            note={<>The store&rsquo;s first 100 products in the Nykaa app&rsquo;s order, all product types mixed; brands ordered by places held. Click a brand for its products. <Opens detail={{ kicker: "Method", title: "What the Korean store table shows", body: <Points items={["Nykaa runs a dedicated Korean Beauty store (category 30710) mixing serums, sunscreens, masks and makeup.", "We read its first 100 products every morning in the order the Nykaa app shows them (its default popularity sort; the website can order them differently).", "Brands are ordered by how many of those 100 places they hold, then by best position.", "A place can be bought: the paid column counts sponsored slots, often why a brand sits above one with more ratings."]} /> }}>Method</Opens> <a href={STORE_URL} target="_blank" rel="noreferrer" className="ml-1 underline underline-offset-2">Open the store ↗</a></>}>
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-[13px]">
                <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  <th className="px-5 py-3">Brand</th><th className="px-3 py-3 text-right">Places in top 100</th><th className="px-3 py-3 text-right">In top 20</th>
                  <th className="px-3 py-3 text-right">Best</th><th className="px-3 py-3 text-right">Typical</th><th className="px-3 py-3 text-right">Paid</th>
                  <th className="px-3 py-3 text-right">Ratings on these products</th><th className="px-5 py-3 text-right">Avg rating</th>
                </tr></thead>
                <tbody>
                  {storeShown.map((s, i) => {
                    const isAnchor = norm(s.b) === norm(set.anchor); const isOpen = openBrand === s.b;
                    return (
                      <Fragment key={s.b}>
                        <tr onClick={() => setOpenBrand(isOpen ? null : s.b)} className={`cursor-pointer border-b border-line/70 hover:bg-page ${isAnchor ? "bg-[#f3f7fd]" : ""}`}>
                          <td className="px-5 py-2.5"><span className="mr-2 inline-block w-5 text-right text-muted tabular">{store.indexOf(s) + 1}</span><b className="font-medium">{s.b}</b><TierTag tier={set.tier(s.b)} /><span className="ml-1.5 text-muted">{isOpen ? "▾" : "▸"}</span></td>
                          <td className="px-3 py-2.5 text-right tabular"><b>{s.n}</b></td>
                          <td className="px-3 py-2.5 text-right tabular">{s.top20}</td>
                          <td className="px-3 py-2.5 text-right tabular">#{s.best}</td>
                          <td className="px-3 py-2.5 text-right tabular text-ink-2">#{Math.round(s.med)}</td>
                          <td className="px-3 py-2.5 text-right tabular">{s.paid ? <span className="rounded bg-[#fff4d6] px-1.5 text-[#8a6100]">{s.paid}</span> : <span className="text-muted">0</span>}</td>
                          <td className="px-3 py-2.5 text-right tabular">{compact(s.ratingsSum)}</td>
                          <td className="px-5 py-2.5 text-right tabular">{s.avg ? `★ ${s.avg.toFixed(2)}` : <Missing>no ratings</Missing>}</td>
                        </tr>
                        {isOpen && (
                          <tr className="border-b border-line/70 bg-page/60"><td colSpan={8} className="px-5 py-3">
                            <table className="w-full text-[12.5px]"><tbody>
                              {s.rows.map((r) => (
                                <tr key={r.product_id} onClick={() => open(ref(r))} className="cursor-pointer hover:bg-surface">
                                  <td className="w-14 py-1.5 tabular text-ink-2">#{r.rank}</td>
                                  <td className="py-1.5 pr-3">{shortName(r.name, r.brand)}{r.is_ad && <span className="ml-1.5 rounded bg-[#fff4d6] px-1 text-[10.5px] text-[#8a6100]">paid</span>}</td>
                                  <td className="py-1.5 pr-3 text-muted">{r.nykaa_l3 ?? ""}</td>
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
              {!anchorInStore && <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-2"><b>{set.anchor}</b> holds no place in the store&apos;s top 100 today.</p>}
            </Card>
          </ActionSection>

          <ActionSection id="launches" kicker="Launches catching on" title={launches[0] ? `${launches[0].r.brand}'s ${shortName(launches[0].r.name, launches[0].r.brand).split(/,| - /)[0]} is the fastest-catching launch, at ${launches[0].perDay.toFixed(1)} ratings a day.` : "No launch from these brands is catching on yet."}
            note={`First reviewed under 90 days ago, already in a top 100, with at least 10 ratings; ordered by ratings gained per day. ${allLaunches.length - launches.length} other launches are left out.`}>
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-[13px]">
                <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  <th className="px-5 py-3" colSpan={2}>Product</th><th className="px-3 py-3">Shelf &amp; rank</th><th className="px-3 py-3 text-right">Ratings</th>
                  <th className="px-3 py-3 text-right">First review</th><th className="px-5 py-3 text-right">Ratings / day</th>
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
                      <td className="py-2 pr-3"><span className="block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-2">{r.brand}<TierTag tier={set.tier(r.brand)} /></span><span className="block max-w-[420px] truncate">{shortName(r.name, r.brand)}</span></td>
                      <td className="px-3 py-2 text-ink-2">#{r.rank} {CATEGORY_LABEL[r.subcategory]}{r.is_ad && <span className="ml-1.5 rounded bg-[#fff4d6] px-1 text-[10.5px] text-[#8a6100]">paid</span>}</td>
                      <td className="px-3 py-2 text-right tabular">{(r.rating_count ?? 0).toLocaleString("en-US")}{r.rating ? <span className="text-muted"> ★ {r.rating.toFixed(1)}</span> : null}</td>
                      <td className="px-3 py-2 text-right tabular text-ink-2">{new Date(r.first_review_date!).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} <span className="text-muted">· {age}d ago</span></td>
                      <td className="px-5 py-2 text-right tabular"><b>{perDay.toFixed(1)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!launches.length && <p className="px-5 py-4 text-[12.5px] text-muted">No launches from these brands on a tracked shelf.</p>}
              {!launches.some((l) => norm(l.r.brand) === norm(set.anchor)) && <p className="border-t border-line px-5 py-3 text-[12.5px] text-ink-2"><b>{set.anchor}</b> has no launch under 90 days old on any tracked top 100.</p>}
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

function MoveRow({ m, tier, onOpen }: { m: Move; tier: Tier | null; onOpen: () => void }) {
  return (
    <button onClick={onOpen} disabled={!m.row} className="grid w-full grid-cols-[1fr_96px_64px] items-center gap-3 rounded-xl px-2 py-2 text-left enabled:hover:bg-page">
      <span className="min-w-0">
        <span className="block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-2">{m.brand}<TierTag tier={tier} /> <span className="font-normal normal-case tracking-normal text-muted">· {CATEGORY_LABEL[m.sub]}</span></span>
        <span className="block truncate text-[13px]">{shortName(m.name, m.brand)}</span>
        <span className="block text-[11.5px] text-muted">{ratings(m)}{m.isAd && <span className="ml-1.5 rounded bg-[#fff4d6] px-1 text-[10.5px] text-[#8a6100]">paid slot today</span>}</span>
      </span>
      <span className="text-right text-[12.5px] text-muted tabular">{m.from ? `#${m.from}` : "outside"} → <b className="text-ink">{m.to ? `#${m.to}` : "out"}</b></span>
      <span className={`text-right text-[13px] font-semibold tabular ${m.change > 0 ? "text-good" : m.change < 0 ? "text-bad" : "text-muted"}`}>{m.change > 0 ? "▲" : m.change < 0 ? "▼" : "="} {Math.abs(m.change) || ""}</span>
    </button>
  );
}
