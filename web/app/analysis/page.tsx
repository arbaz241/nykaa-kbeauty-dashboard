"use client";

import { useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { DetailHead, Missing, Opens, Points, useDetail, type DetailContent } from "@/components/Detail";
import EventLog from "@/components/EventLog";
import OpportunityMap from "@/components/analysis/OpportunityMap";
import { useOpenProduct } from "@/components/ProductDrawer";
import { ActionSection, SectionNav, type NavItem } from "@/components/Report";
import Shell from "@/components/Shell";
import { Basis, BrandSelect, Def, TieredList } from "@/components/Tiered";
import { Card, Loading, PageHead, Verdict } from "@/components/ui";
import { norm } from "@/lib/brands";
import { useAvailability, useBrandDaily, useBrandShares, useCatalog, useCategoryCoverage, useDemand, useMovement, useReviewMonths, useSearch, useShelf } from "@/lib/data";
import { BANDS, QUAD, categoryMap, demandRows, demandWindow, rangeGrid, rankOn, scoreboard, type CategoryCell, type DemandRow, type GapCell, type ScoreRow } from "@/lib/analysis";
import { buildFindings, type Finding } from "@/lib/findings";
import { CATEGORY_LABEL, compact, inr, shortName } from "@/lib/format";
import { heroProducts } from "@/lib/hero";
import { useTiers } from "@/lib/tiers";
import type { CatalogRow, SearchRow } from "@/lib/types";

/** Analysis: the landing page, as one story (Round 3 plan, owner decisions 12 Oct 2026).
 *  Verdict → scoreboard vs the focus set → where the anchor wins and loses by category → what changed →
 *  hero products → range gaps → next steps → events. Every number carries what it is compared against. */

const NAV: NavItem[] = [
  { id: "summary", label: "Verdict" }, { id: "standing", label: "Scoreboard" }, { id: "portfolio", label: "By category" },
  { id: "changes", label: "What changed" }, { id: "heroes", label: "Hero products" }, { id: "gaps", label: "Range gaps" },
  { id: "next", label: "Next steps" }, { id: "events", label: "Events" },
];
const THEMES: { id: string; label: string; test: (f: Finding) => boolean }[] = [
  { id: "shelf", label: "Shelf position", test: (f) => /^(climb|slip|entry|origin)/.test(f.id) },
  { id: "demand", label: "Demand", test: (f) => /^(demand|fade)/.test(f.id) },
  { id: "search", label: "Search & ads", test: (f) => f.id.startsWith("paid") },
  { id: "price", label: "Price", test: (f) => f.id.startsWith("price") },
  { id: "stock", label: "Stock", test: (f) => f.id.startsWith("oos") },
];
const TONE_DOT = { threat: "bg-bad", opening: "bg-good", watch: "bg-muted" } as const;
const TONE_WORD = { threat: "Threat", opening: "Opening", watch: "Watch" } as const;
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const signed = (v: number | null) => (v === null ? "n/a" : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);
const pts = (v: number) => (Math.abs(v) < 0.0005 ? "no change" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)} pts`);
const dayLabel = (d: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "");
const moved = (n: number) => (n === 0 ? "no change" : `${n > 0 ? "+" : ""}${n}`);
const cat = (c: string | null | undefined) => (c ? CATEGORY_LABEL[c] ?? c : "uncategorised");
const same = (a: string, b: string) => norm(a) === norm(b);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

export default function AnalysisPage() {
  return <AuthGate><Analysis /></AuthGate>;
}

function Analysis() {
  const shelf = useShelf(); const movement = useMovement(); const shares = useBrandShares(); const demand = useDemand(); const months = useReviewMonths();
  const daily = useBrandDaily(); const availability = useAvailability(); const catalog = useCatalog(); const coverage = useCategoryCoverage(); const search = useSearch();
  const detail = useDetail(); const open = useOpenProduct();

  const known = useMemo(() => [...new Set([...(shelf.data ?? []).map((r) => r.brand), ...(months.data ?? []).map((m) => m.brand)])].sort(), [shelf.data, months.data]);
  const tiers = useTiers(known);
  const [picked, setPicked] = useState<string | null>(null);
  const anchor = picked ?? tiers.pinned;
  const deep = tiers.inSet(anchor);
  const [scope, setScope] = useState<"set" | "all">("set");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [openTheme, setOpenTheme] = useState<string | null>(null);
  const win = demandWindow();

  const ready = !!(shelf.data && movement.data && shares.data && demand.data && months.data && daily.data && catalog.data);
  const rows = useMemo(() => (ready ? demandRows(months.data!, demand.data!, shelf.data!, catalog.data!) : []), [ready, months.data, demand.data, shelf.data, catalog.data]);
  const complete = useMemo(() => {
    // every product whose own history covers both windows (variants included), for the demand rules
    const cov = new Map<string, string>(); for (const m of months.data ?? []) if (!cov.has(m.product_id) || m.coverage_start > cov.get(m.product_id)!) cov.set(m.product_id, m.coverage_start);
    return new Set([...cov.entries()].filter(([, c]) => c <= win.priorMonths[0]).map(([p]) => p));
  }, [months.data, win.priorMonths]);
  const setBrands = useMemo(() => [...new Set([tiers.pinned, ...tiers.focus, anchor])], [tiers, anchor]);
  const board = useMemo(() => {
    if (!ready) return null;
    const others = known.filter((b) => !setBrands.some((x) => same(x, b)));
    return scoreboard([...setBrands, ...others], daily.data!, shares.data!, rows);
  }, [ready, known, setBrands, daily.data, shares.data, rows]);
  const setRows = useMemo(() => (board ? board.rows.filter((r) => setBrands.some((b) => same(b, r.brand))) : []), [board, setBrands]);
  const me = setRows.find((r) => same(r.brand, anchor));
  const cmap = useMemo(() => (ready ? categoryMap(anchor, rows, (b) => tiers.inSet(b)) : null), [ready, anchor, rows, tiers]);
  const findings = useMemo(() => (ready ? buildFindings({ anchor, movement: movement.data!, shares: shares.data!, demand: demand.data!, availability: availability.data ?? [], coverage: coverage.data ?? [], complete }) : []),
    [ready, anchor, movement.data, shares.data, demand.data, availability.data, coverage.data, complete]);
  const heroes = useMemo(() => (ready ? heroProducts(anchor, movement.data!, demand.data!, catalog.data!).slice(0, 4) : []), [ready, anchor, movement.data, demand.data, catalog.data]);
  const gaps = useMemo(() => (catalog.data ? rangeGrid(anchor, catalog.data, (b) => tiers.inSet(b)) : []), [catalog.data, anchor, tiers]);
  const kw = useMemo(() => keywordView(search.data ?? [], anchor, (b) => tiers.inSet(b)), [search.data, anchor, tiers]);

  if (!ready || !board || !cmap) return <Shell active="Analysis"><PageHead eyebrow="Executive summary" title="Analysis" sub="Where the brand stands, where it wins and loses, what changed and what to do next." /><Loading what="today's analysis" /></Shell>;

  /* ---------------- relevance: the brands that matter first */
  const anchorCats = new Set((shelf.data ?? []).filter((r) => same(r.brand, anchor)).map((r) => r.subcategory));
  const relevant = (f: Finding) => !f.brand || same(f.brand, anchor) || tiers.inSet(f.brand);
  const weight = (f: Finding) => f.weight * (f.brand && same(f.brand, anchor) ? 1.6 : !f.brand ? 1.1 : tiers.inSet(f.brand) ? 1.3 : 0.5) * (f.category && anchorCats.has(f.category) ? 1.2 : 1);
  const ranked = [...findings].sort((a, b) => weight(b) - weight(a));
  const top5 = ranked.filter(relevant).slice(0, 5);
  const inScope = (f: Finding) => (scope === "all" || relevant(f)) && (catFilter === "all" || f.category === catFilter);
  const findingCats = [...new Set(findings.map((f) => f.category).filter((c): c is string => !!c))].sort();

  /* ---------------- verdict */
  const n = setRows.length;
  const rS = rankOn(setRows, anchor, "shelf"); const rQ = rankOn(setRows, anchor, "search"); const rD = rankOn(setRows, anchor, "demand");
  const lead = (k: "shelf" | "search" | "demand") => [...setRows].filter((r) => !same(r.brand, anchor)).sort((a, b) => b[k] - a[k])[0];
  const mkt = board.market.growth;
  const avgRank = (rS + rQ + rD) / 3;
  const standing = avgRank <= n / 3 ? "one of the leaders" : avgRank <= (2 * n) / 3 ? "mid-table" : "a small player";
  const gapCells = gaps.flatMap((g) => g.bands.filter((b) => b.gap).map((b) => ({ category: g.category, ...b })));
  const oos = (availability.data ?? []).filter((a) => same(a.brand, anchor));
  const opps = cmap.cells.filter((c) => c.quadrant === "opportunity").sort((a, b) => b.recent - a.recent);
  const lever = rQ > rD + 3 ? { text: `shoppers who search do not find ${anchor} as often as buyers choose it, so search visibility is the first lever`, href: "#standing" }
    : rS > rD + 3 ? { text: `buyers choose ${anchor} more often than Nykaa's lists show it, so shelf visibility (offers, ads, listing quality) is the first lever`, href: "#standing" }
    : rD > Math.min(rS, rQ) + 3 ? { text: `${anchor} is seen more than it is bought, so the offer itself (price, range, claims) is the first lever`, href: "#gaps" }
    : { text: `visibility and buying are in line, so growth has to come from the categories where it under-indexes${opps[0] ? `, starting with ${cat(opps[0].category).toLowerCase()}` : ""}`, href: "#portfolio" };
  const priority = me && mkt !== null && me.growth !== null && (me.growth < mkt - 0.05 || avgRank > n * 0.6) ? "High" : me && mkt !== null && me.growth !== null && (me.growth < mkt || avgRank > n / 3) ? "Medium" : "Watch";
  const headline = me ? `${anchor} is ${standing} among the ${n} focus brands on Nykaa (#${rS} on the shelf, #${rQ} in search, #${rD} in demand), and its demand is ${me.growth === null || mkt === null ? "too thinly tracked to call" : me.growth >= mkt ? `growing faster than the market (${signed(me.growth)} vs ${signed(mkt)})` : `growing slower than the market (${signed(me.growth)} vs ${signed(mkt)})`}.` : `${anchor} has no listing or tracked demand today.`;
  const verdictPoints = me ? [
    <><b className="text-on-brand">Shelf:</b> {me.shelfSlots} of {board.shelfTotal.toLocaleString("en-IN")} top-100 places ({pct(me.shelf)}); {lead("shelf")?.brand} leads the focus set with {lead("shelf")?.shelfSlots}. {me.slotsChange !== null && <>{me.slotsChange === 0 ? "No change" : `${me.slotsChange > 0 ? "+" : ""}${me.slotsChange} places`} in 14 days, counted on the {board.likeForLikeCats} categories tracked throughout.</>}</>,
    <><b className="text-on-brand">Search:</b> {pct(me.search)} of unpaid top-10 results across today&rsquo;s keywords; {lead("search")?.brand} leads with {pct(lead("search")?.search ?? 0)}.{kw.total ? ` Absent from the top 10 on ${kw.absent} of ${kw.total} keywords.` : ""}</>,
    <><b className="text-on-brand">Demand:</b> {pct(me.demand)} of tracked reviews in {win.recent}; {lead("demand")?.brand} leads with {pct(lead("demand")?.demand ?? 0)}. Growth {signed(me.growth)} vs market {signed(mkt)} ({win.recent} vs {win.prior}).</>,
    <><b className="text-on-brand">Range and stock:</b> {gapCells.length ? `${gapCells.length} price band${gapCells.length === 1 ? "" : "s"} where focus brands sell 3+ products and ${anchor} none` : "no price band left open to the focus brands"}; {oos.length ? `${oos.length} product${oos.length === 1 ? "" : "s"} out of stock today` : "nothing out of stock today"}.</>,
  ] : [];

  /* ---------------- next steps: up to five, ranked by impact, each tied to its evidence */
  const steps = nextSteps({ anchor, cmap: cmap.cells, market: mkt, usual: cmap.usual, gapCells, gaps, me, kw, oos, findings: ranked.filter((f) => f.tone === "threat" && f.brand && tiers.inSet(f.brand) && !same(f.brand, anchor)), rows });

  const catDetail = (c: CategoryCell): DetailContent => {
    const ps = rows.filter((r) => r.category === c.category).sort((a, b) => b.recent - a.recent);
    const mine = ps.filter((r) => same(r.brand, anchor));
    return {
      kicker: `${cat(c.category)} · ${c.quadrant ? QUAD[c.quadrant].label : "not classified"}`,
      title: c.quadrant ? QUAD[c.quadrant].read.replace("the anchor", anchor) : `Not classified: ${c.thin ?? "no growth reading"}`,
      body: (<>
        <Points items={[
          <>Category growth <b>{signed(c.growth)}</b>: {c.growthBase.recent.toLocaleString("en-IN")} reviews in {win.recent} vs {c.growthBase.prior.toLocaleString("en-IN")} in {win.prior}, from {c.growthBase.products} products with complete history. Market: {signed(mkt)}.</>,
          <>{anchor}: {c.anchorRecent} of {c.recent.toLocaleString("en-IN")} reviews ({pct(c.anchorShare)}), against its usual {pct(cmap.usual)} across all categories.</>,
          <>Leader: {c.leader.brand} ({pct(c.leader.share)}){c.focusLeader && !same(c.focusLeader.brand, c.leader.brand) ? `; leading focus brand ${c.focusLeader.brand} (${pct(c.focusLeader.share)})` : ""}.</>,
        ]} />
        <DetailHead>Top products by reviews, {win.recent}</DetailHead>
        <ProductBars rows={ps.slice(0, 8)} anchor={anchor} />
        {mine.length > 0 && !ps.slice(0, 8).some((r) => same(r.brand, anchor)) && <><DetailHead>{anchor} here</DetailHead><ProductBars rows={mine} anchor={anchor} /></>}
      </>),
    };
  };
  const findingDetail = (f: Finding): DetailContent => ({
    kicker: `${TONE_WORD[f.tone]} · evidence from ${f.source}`, title: f.headline,
    body: (<>
      <p className="text-ink-2">{f.detail}</p>
      <p className="mt-2 font-medium">{f.soWhat}</p>
      <DetailHead>The numbers</DetailHead>
      <Points items={f.evidence.map((e) => <><span className="text-muted">{e.label}:</span> <b className="font-medium tabular">{e.value}</b></>)} />
      {f.product && <button onClick={() => open(f.product!)} className="mt-4 rounded-lg px-3 py-1.5 text-[13px] text-ink-2 ring-1 ring-line hover:bg-surface">Open the product ›</button>}
    </>),
  });
  const gapDetail = (category: string, b: GapCell): DetailContent => ({
    kicker: `Range · ${cat(category)} · ${b.label} (by MRP)`,
    title: b.gap ? `${anchor} has nothing here; ${b.rivalBrands.length} focus brand${b.rivalBrands.length === 1 ? "" : "s"} sell ${b.rivals.length} products` : `${anchor} ${b.anchor.length} · focus brands ${b.rivals.length}`,
    body: (<>
      <p className="text-muted">Products in {cat(category).toLowerCase()} with an MRP of {b.label.toLowerCase()}, from each brand&rsquo;s own Nykaa catalogue. Focus brands only.</p>
      <DetailHead>{anchor} ({b.anchor.length})</DetailHead>
      {b.anchor.length ? <CatalogList rows={b.anchor} /> : <Missing>No {anchor} product in this band</Missing>}
      <DetailHead>Focus brands ({b.rivals.length})</DetailHead>
      {b.rivals.length ? <CatalogList rows={[...b.rivals].sort((x, y) => (y.rating_count ?? 0) - (x.rating_count ?? 0))} /> : <Missing>No focus brand sells here</Missing>}
    </>),
  });

  const asOf = shelf.data?.[0]?.scrape_date;
  return (
    <Shell active="Analysis" asOf={asOf}>
      <PageHead eyebrow="Executive summary" title="Analysis" sub={<>Where {anchor} stands against the {n - 1} brands that matter, where it wins and loses, what changed today and what to do next. Hover a measure for its definition; click anything with › for the evidence.</>}
        right={<BrandSelect value={anchor} onChange={setPicked} tiers={tiers} all={known} />} />
      <SectionNav items={NAV} />
      {!deep && <p className="mt-4 rounded-xl bg-accent-soft px-4 py-2.5 text-[13px] text-ink-2"><b>{anchor}</b> is outside the focus set, so this is a scorecard: it is compared with the focus brands, and sections without data for it say so.</p>}

      <section id="summary" className="mt-6 scroll-mt-32">
        <Verdict eyebrow={<>Verdict for {anchor}</>} points={verdictPoints}
          foot={me && <div className="flex flex-wrap items-start gap-3"><span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] ${priority === "High" ? "bg-bad-soft text-bad" : priority === "Medium" ? "bg-warn-soft text-warn" : "bg-accent-soft text-accent-strong"}`}>{priority} priority</span><span className="min-w-0 flex-1"><b>So what:</b> {lever.text}. <a href={lever.href} className="text-accent underline underline-offset-2">See the evidence ↓</a></span></div>}>
          {headline}
        </Verdict>
      </section>

      <ActionSection id="standing" kicker="Scoreboard · against the focus brands" title={scoreTitle(anchor, setRows)}
        note={<>Three ways to read the same market. Where a brand&rsquo;s bars disagree is the story: seen but not bought, or bought but not seen. The grey tick on each bar is the focus brands&rsquo; median.</>}>
        <Scoreboard rows={board.rows} setRows={setRows} anchor={anchor} tiers={tiers} board={board} win={win.recent} />
      </ActionSection>

      <ActionSection id="portfolio" kicker="By category · where it wins and loses" title={opps.length ? `${opps.length} growing categor${opps.length === 1 ? "y is" : "ies are"} where ${anchor} does worse than its usual share: ${opps.slice(0, 3).map((c) => cat(c.category).toLowerCase()).join(", ")}.` : `No growing category where ${anchor} under-indexes.`}
        note={<>Each category is placed by how fast its buying grows (up) and by {anchor}&rsquo;s slice of it (across). The dashed lines are the market&rsquo;s growth ({signed(mkt)}) and {anchor}&rsquo;s usual share ({pct(cmap.usual)}). Hollow bubbles have too little data to classify. Bubble size = reviews in {win.recent}.</>}>
        <div className="grid gap-4">
          <Card className="p-4"><OpportunityMap cells={cmap.cells} usual={cmap.usual} market={mkt} anchor={anchor} onPick={(c) => detail(catDetail(c))} /></Card>
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12.5px]">
              <thead><tr className="border-b border-line text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">
                <th className="px-4 py-2.5">Category</th><th className="px-2 py-2.5"><Def k="growth">Growth</Def></th><th className="px-2 py-2.5"><Def k="catShare">{anchor}</Def></th><th className="px-4 py-2.5">Read</th>
              </tr></thead>
              <tbody>{cmap.cells.map((c) => (
                <tr key={c.category} onClick={() => detail(catDetail(c))} className="cursor-pointer border-b border-line last:border-0 hover:bg-sunken/60">
                  <td className="px-4 py-2 font-medium">{cat(c.category)} <span className="text-muted">›</span></td>
                  <td className="px-2 py-2 tabular"><span className={c.growth !== null && mkt !== null && c.growth >= mkt ? "text-good" : "text-ink-2"}>{signed(c.growth)}</span><Basis>{c.growthBase.products} products</Basis></td>
                  <td className="px-2 py-2 tabular">{c.anchorRecent ? pct(c.anchorShare) : <Missing>none</Missing>}<Basis>{c.anchorRecent} of {compact(c.recent)}</Basis></td>
                  <td className="px-4 py-2">{c.quadrant ? <QuadTag q={c.quadrant} /> : <Missing>thin data: {c.thin}</Missing>}</td>
                </tr>))}</tbody>
            </table>
            <Basis className="border-t border-line px-4 py-2.5">Growth = reviews {win.recent} vs {win.prior}, only products with complete history. {anchor} = its share of the category&rsquo;s reviews in {win.recent}.</Basis>
          </Card>
        </div>
      </ActionSection>

      <ActionSection id="changes" kicker="What changed · today's findings" title={top5.length ? `${top5.length} moves matter most today; ${findings.length - top5.length} more are grouped below.` : "Nothing involving the brands that matter crossed a threshold today."}
        note="Ranked by impact on the anchor: its own products first, then the focus brands, then its categories. Each rule states its threshold; click a finding for the numbers.">
        <div className="grid gap-2.5">
          {top5.map((f) => (
            <Card key={f.id} className="lift px-5 py-3.5">
              <Opens detail={findingDetail(f)} className="w-full">
                <span className="flex items-start gap-3">
                  <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${TONE_DOT[f.tone]}`} />
                  <span className="min-w-0"><span className="block text-[14px] font-medium leading-snug">{f.headline}</span><span className="mt-0.5 block text-[12.5px] text-ink-2">{f.soWhat}</span></span>
                  <span className="ml-auto shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{TONE_WORD[f.tone]}</span>
                </span>
              </Opens>
            </Card>
          ))}
        </div>
        <div className="mb-2 mt-6 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span className="text-muted">All findings by type:</span>
          {(["set", "all"] as const).map((s) => <button key={s} onClick={() => setScope(s)} className={`rounded-full px-3 py-1 ring-1 ${scope === s ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line"}`}>{s === "set" ? "Focus brands" : "All brands"}</button>)}
          <select value={catFilter} onChange={(e) => setCatFilter(e.target.value)} className="rounded-full border border-line bg-surface px-3 py-1 text-[12.5px]">
            <option value="all">All categories</option>{findingCats.map((c) => <option key={c} value={c}>{cat(c)}</option>)}
          </select>
        </div>
        <Card className="overflow-hidden">
          {THEMES.map((th) => {
            const xs = ranked.filter(th.test).filter(inScope);
            const t = { threat: xs.filter((f) => f.tone === "threat").length, opening: xs.filter((f) => f.tone === "opening").length };
            const isOpen = openTheme === th.id;
            return (
              <div key={th.id} className="border-b border-line last:border-0">
                <button onClick={() => setOpenTheme(isOpen ? null : th.id)} disabled={!xs.length} className="grid w-full grid-cols-[150px_70px_1fr_20px] items-center gap-3 px-5 py-3 text-left enabled:hover:bg-sunken/60">
                  <span className="text-[13.5px] font-semibold">{th.label}</span>
                  <span className="text-[12.5px] tabular text-ink-2">{xs.length} move{xs.length === 1 ? "" : "s"}</span>
                  <span className="min-w-0 truncate text-[12.5px] text-ink-2">{xs.length ? <>{t.threat} threat{t.threat === 1 ? "" : "s"}, {t.opening} opening{t.opening === 1 ? "" : "s"} · biggest: {xs[0].headline}</> : <Missing>nothing crossed this theme&rsquo;s threshold</Missing>}</span>
                  <span className="text-muted">{xs.length ? (isOpen ? "▾" : "▸") : ""}</span>
                </button>
                {isOpen && (
                  <ul className="space-y-1.5 bg-sunken/40 px-5 py-3">
                    {xs.map((f) => (
                      <li key={f.id} className="flex items-start gap-2 text-[13px] leading-snug">
                        <span className={`mt-[6px] h-2 w-2 shrink-0 rounded-full ${TONE_DOT[f.tone]}`} />
                        <Opens detail={findingDetail(f)}>{f.headline}{f.brand && !tiers.inSet(f.brand) && <span className="ml-1.5 rounded bg-sunken px-1 text-[10.5px] text-muted ring-1 ring-line">outside focus set</span>}</Opens>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </Card>
      </ActionSection>

      <ActionSection id="heroes" kicker="Hero products" title={heroes.length ? `${anchor}'s strongest product is ${shortName(heroes[0].name, anchor)}${heroes[0].edge ? `, which beats its category on ${heroes[0].edge.label.toLowerCase()}` : ""}.` : `${anchor} has no product on a tracked shelf or catalogue.`}
        note={<><Def k="hero">How heroes are picked</Def>: shelf rank, reviews in {win.recent}, rating and buyer base, each scored against the median product of the same category. The bars compare each hero with the category&rsquo;s best sellers on reviews.</>}>
        {heroes.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {heroes.map((h, i) => {
              const peers = h.category ? rows.filter((r) => r.category === h.category).sort((a, b) => b.recent - a.recent) : [];
              const self = rows.find((r) => r.product_id === h.product_id);
              const shown = [...peers.filter((r) => r.product_id !== h.product_id).slice(0, 4), ...(self ? [self] : [])].sort((a, b) => b.recent - a.recent);
              const pos = self ? peers.findIndex((r) => r.product_id === h.product_id) + 1 : 0;
              return (
                <Card key={h.product_id} className="px-5 py-4">
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-display text-[13px] font-semibold tabular text-muted">{i + 1}</span>
                    <button onClick={() => open({ product_id: h.product_id, name: h.name, brand: h.brand, price: h.price })} className="text-left text-[14px] font-medium leading-snug hover:underline">{shortName(h.name, anchor)} ›</button>
                  </div>
                  <Basis className="mt-1">{cat(h.category)}{h.rank ? ` · shelf #${h.rank}` : ""}{h.rating ? ` · ★ ${h.rating.toFixed(1)}` : ""}{h.ratingCount ? ` · ${compact(h.ratingCount)} ratings` : ""}{h.edge ? ` · leads on ${h.edge.label.toLowerCase()}: ${h.edge.detail}` : ""}</Basis>
                  {shown.length > 1 ? (<>
                    <div className="mb-1 mt-3 text-[11.5px] font-medium text-ink-2">Reviews in {win.recent} vs the category&rsquo;s best sellers{pos ? ` (it ranks #${pos} of ${peers.length})` : ""}</div>
                    <ProductBars rows={shown} anchor={anchor} highlight={h.product_id} compactNames />
                  </>) : <p className="mt-3"><Missing>No review history to compare in this category</Missing></p>}
                </Card>
              );
            })}
          </div>
        ) : <Missing>Nothing to rank</Missing>}
      </ActionSection>

      <ActionSection id="gaps" kicker="Range gaps · where the focus brands sell and the brand doesn't" title={!gaps.length ? `No catalogue is collected for ${anchor}, so its range cannot be compared.` : gapCells.length ? `${gapCells.length} price band${gapCells.length === 1 ? "" : "s"} across ${new Set(gapCells.map((g) => g.category)).size} categor${new Set(gapCells.map((g) => g.category)).size === 1 ? "y" : "ies"} have 3+ focus-brand products and no ${anchor} product.` : `${anchor} has a product in every price band where the focus brands sell three or more.`}
        note={<><Def k="rangeGap">How a gap is defined</Def>: each brand&rsquo;s full Nykaa range, by category and MRP band; only the focus brands count as rivals. Red = a gap. Click any cell for the exact products.</>}>
        {gaps.length > 0 && (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-[13px]">
              <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted"><th className="px-5 py-2.5">Category</th>{BANDS.map(([l]) => <th key={l} className="px-3 py-2.5">{l}</th>)}</tr></thead>
              <tbody>{gaps.map((g) => (
                <tr key={g.category} className="border-b border-line last:border-0">
                  <td className="px-5 py-2.5 font-medium">{cat(g.category)}</td>
                  {g.bands.map((b) => (
                    <td key={b.label} className="px-2 py-1.5">
                      <button onClick={() => detail(gapDetail(g.category, b))} disabled={!b.anchor.length && !b.rivals.length}
                        className={`w-full rounded-lg px-2.5 py-1.5 text-left tabular enabled:hover:ring-1 enabled:hover:ring-line-2 ${b.gap ? "bg-bad-soft text-bad" : ""}`}>
                        {!b.anchor.length && !b.rivals.length ? <span className="text-[12px] text-faint">nobody</span> : <>
                          <b className="font-semibold">{b.anchor.length}</b> <span className={b.gap ? "" : "text-muted"}>{anchor}</span>
                          <span className={`block text-[11.5px] ${b.gap ? "" : "text-muted"}`}>{b.rivals.length} from {b.rivalBrands.length} focus brand{b.rivalBrands.length === 1 ? "" : "s"} ›</span>
                        </>}
                      </button>
                    </td>
                  ))}
                </tr>))}</tbody>
            </table>
          </Card>
        )}
      </ActionSection>

      <ActionSection id="next" kicker="Suggested next steps" title={steps.length ? `${steps.length} actions, ranked by expected impact.` : "Nothing needs action today."}
        note="Rule-based from the evidence above, limited to the focus brands and the anchor's own levers: range, price, search, stock and hero products. Each links to its evidence.">
        <div className="grid gap-3 md:grid-cols-2">
          {steps.map((s, i) => (
            <Card key={i} className="relative overflow-hidden px-5 py-4">
              <span className={`absolute left-0 top-0 h-full w-1 ${s.tone === "good" ? "bg-good" : s.tone === "bad" ? "bg-bad" : "bg-accent-strong"}`} />
              <div className="flex items-baseline gap-2"><span className="font-display text-[13px] font-semibold tabular text-muted">{i + 1}</span><div className="text-[14.5px] font-semibold leading-snug">{s.what}</div></div>
              <dl className="mt-2 grid grid-cols-[44px_1fr] gap-x-2 gap-y-1 text-[12.5px] leading-snug">
                <dt className="text-muted">Who</dt><dd>{s.who}</dd>
                <dt className="text-muted">Why</dt><dd className="text-ink-2">{s.why}</dd>
              </dl>
              <a href={s.href} className="mt-2 inline-block text-[12px] font-medium text-accent-strong">Evidence ↑</a>
            </Card>
          ))}
        </div>
      </ActionSection>

      <EventLog />
    </Shell>
  );
}

/* ================================================================ pieces */

function scoreTitle(anchor: string, rows: ScoreRow[]) {
  const me = rows.find((r) => same(r.brand, anchor)); if (!me) return `${anchor} is not on any tracked shelf today.`;
  const m = (k: "shelf" | "search" | "demand") => median(rows.map((r) => r[k])) || 1e-9;
  const xs = ([["shelf", "shelf share"], ["search", "search share"], ["demand", "demand share"]] as const).map(([k, l]) => ({ l, r: me[k] / m(k) })).sort((a, b) => b.r - a.r);
  const fx = (r: number) => `${r.toFixed(1)}×`;
  return `${anchor}'s ${xs[0].l} is ${fx(xs[0].r)} the focus median, but its ${xs[2].l} only ${fx(xs[2].r)}.`;
}

function Scoreboard({ rows, setRows, anchor, tiers, board, win }: { rows: ScoreRow[]; setRows: ScoreRow[]; anchor: string; tiers: ReturnType<typeof useTiers>; board: NonNullable<ReturnType<typeof scoreboard>>; win: string }) {
  const sorted = [...rows].sort((a, b) => (same(a.brand, anchor) ? -1 : same(b.brand, anchor) ? 1 : b.demand - a.demand));
  const max = { shelf: Math.max(...setRows.map((r) => r.shelf), 1e-9), search: Math.max(...setRows.map((r) => r.search), 1e-9), demand: Math.max(...setRows.map((r) => r.demand), 1e-9) };
  const med = { shelf: median(setRows.map((r) => r.shelf)), search: median(setRows.map((r) => r.search)), demand: median(setRows.map((r) => r.demand)) };
  const cols = "grid-cols-[minmax(130px,1fr)_minmax(150px,1.3fr)_minmax(150px,1.3fr)_minmax(150px,1.3fr)_110px]";
  const Cell = ({ v, k, sub, hl }: { v: number; k: "shelf" | "search" | "demand"; sub: React.ReactNode; hl: boolean }) => (
    <span className="pr-4">
      <span className="flex items-center gap-2"><b className="w-12 text-[13px] tabular">{pct(v)}</b>
        <span className="relative h-2 flex-1 rounded-full bg-sunken"><span className={`block h-2 rounded-full ${hl ? "bg-accent-strong" : "bg-brand/70"}`} style={{ width: `${Math.min(100, (v / max[k]) * 100)}%` }} />
          <span className="absolute -top-0.5 h-3 w-0.5 rounded bg-ink/35" style={{ left: `${Math.min(100, (med[k] / max[k]) * 100)}%` }} title={`Focus median ${pct(med[k])}`} /></span></span>
      <span className="block text-[11px] text-muted">{sub}</span>
    </span>
  );
  return (
    <Card className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className={`grid ${cols} border-b border-line px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted`}>
          <span>Brand</span>
          <span><Def k="shelf">Share of top-100 shelf</Def><span className="block font-normal normal-case tracking-normal">places held today · change in 14 days</span></span>
          <span><Def k="search">Share of top-10 search</Def><span className="block font-normal normal-case tracking-normal">unpaid results today · change in 7 days</span></span>
          <span><Def k="demand">Share of reviews</Def><span className="block font-normal normal-case tracking-normal">{win}</span></span>
          <span><Def k="growth">Demand growth</Def><span className="block font-normal normal-case tracking-normal">vs market {signed(board.market.growth)}</span></span>
        </div>
        <TieredList rows={sorted} brandOf={(r) => r.brand} tiers={tiers} top={9} render={(r) => {
          const hl = same(r.brand, anchor); const out = !tiers.inSet(r.brand);
          return (
            <div key={r.brand} className={`grid ${cols} items-center border-b border-line px-4 py-2 ${hl ? "bg-accent-soft/50" : ""}`}>
              <span className="text-[13px]"><span className={hl ? "font-semibold" : "font-medium"}>{r.brand}</span>{out && <span className="ml-1.5 rounded bg-sunken px-1 text-[10px] text-muted ring-1 ring-line">not in focus set</span>}</span>
              <Cell v={r.shelf} k="shelf" hl={hl} sub={<>{r.shelfSlots} places{r.slotsChange !== null ? ` · ${moved(r.slotsChange)}` : ""}</>} />
              <Cell v={r.search} k="search" hl={hl} sub={<>{r.searchChange !== null ? pts(r.searchChange) : "no earlier day"}{r.paid ? ` · ${Math.round(r.paid * 100)}% paid` : ""}</>} />
              <Cell v={r.demand} k="demand" hl={hl} sub={<>{compact(r.demandRecent)} reviews</>} />
              <span className="text-[12.5px] tabular">{r.growth === null ? <Missing>no full history</Missing> : <><b className={board.market.growth !== null && r.growth >= board.market.growth ? "text-good" : "text-bad"}>{signed(r.growth)}</b><span className="block text-[11px] text-muted">{r.growthProducts} products</span></>}</span>
            </div>
          );
        }} />
      </div>
      <Basis className="border-t border-line px-4 py-2.5">
        Shelf: {board.shelfTotal.toLocaleString("en-IN")} top-100 places on {dayLabel(board.shelfDay)}; the 14-day change counts only the {board.likeForLikeCats} categories tracked on both days. Search: unpaid top 10 of every tracked keyword on {dayLabel(board.searchDay)}. Reviews: {compact(board.demandTotal)} reviews for tracked products in {win}. Grey tick = median of the focus brands.
      </Basis>
    </Card>
  );
}

function QuadTag({ q }: { q: NonNullable<CategoryCell["quadrant"]> }) {
  const c = { accent: "bg-accent-soft text-accent-strong", good: "bg-good-soft text-good", muted: "bg-sunken text-ink-2", bad: "bg-bad-soft text-bad" }[QUAD[q].tone];
  return <span title={QUAD[q].read} className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${c}`}>{QUAD[q].label}</span>;
}

function ProductBars({ rows, anchor, highlight, compactNames }: { rows: DemandRow[]; anchor: string; highlight?: string; compactNames?: boolean }) {
  const open = useOpenProduct();
  const max = Math.max(1, ...rows.map((r) => r.recent));
  return (
    <div className="space-y-1">
      {rows.map((r) => {
        const hl = highlight ? r.product_id === highlight : same(r.brand, anchor);
        return (
          <button key={r.product_id} onClick={() => open({ product_id: r.product_id, name: r.name, brand: r.brand, url: r.url })} className="grid w-full grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_44px] items-center gap-2 rounded-md px-1 py-0.5 text-left text-[12px] hover:bg-sunken/60">
            <span className={`truncate ${hl ? "font-semibold" : ""}`} title={r.name}><span className="text-muted">{r.brand}</span> {compactNames ? shortName(r.name, r.brand).split(/,| - | with /)[0] : shortName(r.name, r.brand)}</span>
            <span className="h-2 rounded-full bg-sunken"><span className={`block h-2 rounded-full ${hl ? "bg-accent-strong" : "bg-brand/60"}`} style={{ width: `${(r.recent / max) * 100}%` }} /></span>
            <span className="text-right tabular">{compact(r.recent)}</span>
          </button>
        );
      })}
    </div>
  );
}

function CatalogList({ rows }: { rows: CatalogRow[] }) {
  const open = useOpenProduct();
  return (
    <div className="space-y-0.5">
      {rows.map((r) => (
        <button key={r.product_id} onClick={() => open({ product_id: r.product_id, name: r.name, brand: r.brand, url: r.url, price: r.price, mrp: r.mrp, rating: r.rating, rating_count: r.rating_count })}
          className="grid w-full grid-cols-[1fr_auto] gap-3 rounded-lg px-2 py-1.5 text-left text-[12.5px] hover:bg-surface">
          <span className="min-w-0"><span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-ink-2">{r.brand}</span> <span className="block truncate">{shortName(r.name, r.brand)}</span></span>
          <span className="text-right tabular">{inr(r.mrp ?? r.price)}<span className="block text-[11px] text-muted">{r.rating_count ? `${compact(r.rating_count)} ratings` : "no ratings"}</span></span>
        </button>
      ))}
    </div>
  );
}

/* ================================================================ keyword view and next steps */

function keywordView(search: SearchRow[], anchor: string, inSet: (b: string) => boolean) {
  const byQ = new Map<string, SearchRow[]>(); search.forEach((r) => byQ.set(r.query, [...(byQ.get(r.query) ?? []), r]));
  const out: { q: string; pos: number | null; leader: string | null; focusTop3: string | null }[] = [];
  for (const [q, rs] of byQ) {
    const minS = Math.min(...rs.map((r) => r.sample));
    const unpaid = rs.filter((r) => !r.is_ad && r.sample === minS).sort((a, b) => a.rank - b.rank).slice(0, 10);
    if (!unpaid.length) continue;
    const i = unpaid.findIndex((r) => same(r.brand, anchor));
    out.push({ q, pos: i >= 0 ? i + 1 : null, leader: unpaid[0]?.brand ?? null, focusTop3: unpaid.slice(0, 3).find((r) => inSet(r.brand) && !same(r.brand, anchor))?.brand ?? null });
  }
  return { rows: out, total: out.length, absent: out.filter((x) => x.pos === null).length };
}

interface Step { what: string; who: string; why: string; href: string; tone?: "good" | "bad"; impact: number }

function nextSteps({ anchor, cmap, market, usual, gapCells, gaps, me, kw, oos, findings, rows }: {
  anchor: string; cmap: CategoryCell[]; market: number | null; usual: number; gapCells: (GapCell & { category: string })[]; gaps: ReturnType<typeof rangeGrid>;
  me: ScoreRow | undefined; kw: ReturnType<typeof keywordView>; oos: { name: string; brand: string; rating_count: number | null }[]; findings: Finding[]; rows: DemandRow[];
}): Step[] {
  const out: Step[] = [];
  const best = (c: string) => rows.filter((r) => r.category === c && same(r.brand, anchor)).sort((a, b) => b.recent - a.recent)[0];
  const growthOf = (c: string) => cmap.find((x) => x.category === c)?.growth ?? null;
  for (const o of oos.filter((x) => (x.rating_count ?? 0) >= 1000).slice(0, 2)) out.push({ what: `Restock ${shortName(o.name, o.brand)}`, who: `${anchor} supply team`, why: `Out of stock today with ${compact(o.rating_count ?? 0)} ratings of demand behind it; Nykaa drops unavailable products from its lists, so every day out sends buyers to rivals.`, href: "#changes", tone: "bad", impact: 70 + Math.min(25, (o.rating_count ?? 0) / 1000) });
  for (const c of cmap.filter((x) => x.quadrant === "opportunity").slice(0, 2)) {
    const b = best(c.category);
    out.push({ what: `Push ${b ? shortName(b.name, anchor).split(/,| - | with /)[0] : "a product"} in ${cat(c.category).toLowerCase()}`, who: b ? `${anchor}'s best seller here (${b.recent} reviews in 3 months)` : `${anchor} has no tracked product here yet`,
      why: `The category grows ${signed(c.growth)} vs the market's ${signed(market)}, but ${anchor} holds ${pct(c.anchorShare)} of it against its usual ${pct(usual)}; ${c.focusLeader?.brand ?? c.leader.brand} leads with ${pct(c.focusLeader?.share ?? c.leader.share)}.`, href: "#portfolio", impact: 80 + Math.min(15, c.recent / 1000) });
  }
  const growingGaps = [...gapCells].sort((a, b) => (growthOf(b.category) ?? -1) - (growthOf(a.category) ?? -1) || b.rivals.length - a.rivals.length);
  for (const g of growingGaps.slice(0, 1)) out.push({ what: `Fill the ${g.label} band in ${cat(g.category).toLowerCase()}`, who: `${anchor} range planning`, why: `${g.rivals.length} focus-brand products (${g.rivalBrands.slice(0, 3).join(", ")}${g.rivalBrands.length > 3 ? "…" : ""}) sell at this MRP and ${anchor} has none; the category grows ${signed(growthOf(g.category))}.`, href: "#gaps", impact: 70 + g.rivals.length });
  if (me && me.search < me.demand * 0.8 && kw.total) {
    const lost = kw.rows.filter((x) => x.pos === null && x.focusTop3).slice(0, 3);
    out.push({ what: `Win back search${lost.length ? ` on "${lost.map((x) => x.q).join('", "')}"` : ""}`, who: `${anchor} search and ads`, why: `${anchor} gets ${pct(me.search)} of search but ${pct(me.demand)} of reviews: shoppers who search find it less often than buyers choose it. ${lost.length ? `A focus brand sits in the top 3 on these keywords where ${anchor} is absent.` : ""}`, href: "#standing", impact: 75 });
  }
  for (const f of findings.slice(0, 1)) out.push({ what: `Answer ${f.brand}'s move${f.category ? ` in ${cat(f.category).toLowerCase()}` : ""}`, who: `${anchor} category team`, why: `${f.headline}. ${f.soWhat}`, href: "#changes", tone: "bad", impact: 60 + Math.min(20, f.weight / 5) });
  for (const c of cmap.filter((x) => x.quadrant === "invest").slice(0, 1)) {
    const b = best(c.category);
    out.push({ what: `Protect ${cat(c.category).toLowerCase()}`, who: b ? `${shortName(b.name, anchor).split(/,| - | with /)[0]}` : anchor, why: `A growing category (${signed(c.growth)}) where ${anchor} does better than usual (${pct(c.anchorShare)} vs ${pct(usual)}); keep the hero visible and in stock.`, href: "#portfolio", tone: "good", impact: 55 });
  }
  if (!gaps.length) out.push({ what: "Collect this brand's catalogue", who: "Data", why: "Range gaps and heroes need the brand's full Nykaa range.", href: "#gaps", impact: 10 });
  return out.sort((a, b) => b.impact - a.impact).slice(0, 5);
}
