"use client";

import { useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { Chip } from "@/components/CompareGrid";
import { DetailHead, Missing, Opens, Points, useDetail, type DetailContent } from "@/components/Detail";
import EventLog from "@/components/EventLog";
import Matrix from "@/components/Matrix";
import Presentation from "@/components/Presentation";
import { useOpenProduct } from "@/components/ProductDrawer";
import { ActionSection, SectionNav, ShowAll, type NavItem } from "@/components/Report";
import Shell from "@/components/Shell";
import { Card, Loading } from "@/components/ui";
import { ANCHOR_BRAND, FOCUS_BRANDS, norm, resolveBrand } from "@/lib/brands";
import { useAvailability, useBrandShares, useCatalog, useCategoryCoverage, useDemand, useMovement, useShelf, useThumbnails } from "@/lib/data";
import { buildFindings, portfolioGaps, threeShares, type Finding } from "@/lib/findings";
import { CATEGORY_LABEL, compact } from "@/lib/format";
import { heroProducts } from "@/lib/hero";
import { QUADRANT, categoryPortfolio, type CategoryPosition, type Quadrant } from "@/lib/portfolio";

/** Analysis: the dashboard's executive summary, in report form (docs/other-tabs-plan.md).
 *  Verdict first; then where the brand stands, its portfolio (BCG growth-share matrix), what changed,
 *  its heroes, how it looks on the shelf, where rivals sell and it doesn't, and suggested next steps. */

const TONE = {
  threat: { label: "Threat", dot: "bg-bad", text: "text-bad" },
  opening: { label: "Opening", dot: "bg-good", text: "text-good" },
  watch: { label: "Watch", dot: "bg-muted", text: "text-muted" },
} as const;
const THEMES: { id: string; label: string; test: (f: Finding) => boolean }[] = [
  { id: "shelf", label: "Shelf position", test: (f) => /^(climb|slip|entry|origin)/.test(f.id) },
  { id: "demand", label: "Demand", test: (f) => /^(demand|fade)/.test(f.id) },
  { id: "search", label: "Search & ads", test: (f) => f.id.startsWith("paid") },
  { id: "price", label: "Price", test: (f) => f.id.startsWith("price") },
  { id: "stock", label: "Stock", test: (f) => f.id.startsWith("oos") },
];
const NAV: NavItem[] = [
  { id: "summary", label: "Verdict" }, { id: "standing", label: "Where it stands" }, { id: "portfolio", label: "Portfolio" },
  { id: "changes", label: "What changed" }, { id: "heroes", label: "Hero products" }, { id: "shelf", label: "Shelf image" },
  { id: "gaps", label: "Range gaps" }, { id: "next", label: "Next steps" }, { id: "events", label: "Events" },
];
const pctS = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`;
const signedPct = (v: number) => `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`;
const cat = (c: string) => CATEGORY_LABEL[c] ?? c;

export default function AnalysisPage() {
  return <AuthGate><Analysis /></AuthGate>;
}

function Analysis() {
  const shelf = useShelf(); const movement = useMovement(); const shares = useBrandShares(); const demand = useDemand();
  const availability = useAvailability(); const catalog = useCatalog(); const coverage = useCategoryCoverage(); const thumbs = useThumbnails();
  const detail = useDetail();

  const known = useMemo(() => [...new Set((shelf.data ?? []).map((r) => r.brand))].sort(), [shelf.data]);
  const [anchorInput, setAnchorInput] = useState(ANCHOR_BRAND);
  const anchor = resolveBrand(anchorInput, known) ?? anchorInput;
  const [filter, setFilter] = useState<"all" | "threat" | "opening" | "watch">("all");

  const ready = !!(movement.data && shares.data && demand.data && shelf.data && catalog.data);
  const findings = useMemo(() => (movement.data && shares.data && demand.data
    ? buildFindings({ anchor, movement: movement.data, shares: shares.data, demand: demand.data, availability: availability.data ?? [], coverage: coverage.data ?? [] }) : []),
  [anchor, movement.data, shares.data, demand.data, availability.data, coverage.data]);
  const stance = useMemo(() => (shares.data && demand.data ? threeShares(anchor, shares.data, demand.data) : null), [anchor, shares.data, demand.data]);
  const portfolio = useMemo(() => (demand.data && shelf.data && catalog.data ? categoryPortfolio(anchor, demand.data, shelf.data, catalog.data) : { rows: [], growthSplit: 0 }), [anchor, demand.data, shelf.data, catalog.data]);
  const gaps = useMemo(() => {
    if (!catalog.data) return [];
    const anchorCats = new Set(catalog.data.filter((r) => norm(r.brand) === norm(anchor)).flatMap((r) => r.subcategories ?? []));
    // the catalogue also holds rival brands' ranges (for Competitive Analysis pricing); the gap read stays on the K-beauty set
    const focus = new Set(FOCUS_BRANDS.map(norm));
    const rows = catalog.data.filter((r) => focus.has(norm(r.brand)))
      .flatMap((r) => (r.subcategories ?? []).map((c) => ({ brand: r.brand, category: c, price: r.mrp ?? r.price })))
      .filter((r) => anchorCats.size === 0 || anchorCats.has(r.category));
    return portfolioGaps(anchor, rows);
  }, [anchor, catalog.data]);
  const heroes = useMemo(() => (movement.data && demand.data && catalog.data
    ? heroProducts(anchor, movement.data, demand.data, catalog.data.filter((r) => FOCUS_BRANDS.some((f) => norm(f) === norm(r.brand)))).slice(0, 6) : []),
  [anchor, movement.data, demand.data, catalog.data]);

  const counts = { threat: findings.filter((f) => f.tone === "threat").length, opening: findings.filter((f) => f.tone === "opening").length, watch: findings.filter((f) => f.tone === "watch").length };
  const placed = portfolio.rows.filter((r) => r.quadrant);
  const byQ = (q: Quadrant) => placed.filter((r) => r.quadrant === q);
  const closest = [...placed].sort((a, b) => b.relShare - a.relShare)[0];
  const openGaps = gaps.filter((g) => g.bands.some((b) => b.anchorHas === 0 && b.rivalProducts >= 3));

  const headline = stance ? (() => {
    const lead = byQ("star").length + byQ("cash_cow").length;
    const sh = `${anchor} holds ${pctS(stance.shelf)} of the shelf, ${pctS(stance.voice)} of K-beauty search and ${pctS(stance.demand)} of tracked demand`;
    const pos = !placed.length ? "" : lead ? `; it leads ${lead} of ${placed.length} categories` : `; it leads none of its ${placed.length} categories${closest ? `, and is closest in ${cat(closest.category).toLowerCase()} (${closest.relShare.toFixed(2)}× ${closest.leader.brand})` : ""}`;
    return `${sh}${pos}. ${counts.threat} threat${counts.threat === 1 ? "" : "s"} and ${counts.opening} opening${counts.opening === 1 ? "" : "s"} came up in today's data.`;
  })() : "";

  const findingDetail = (f: Finding): DetailContent => ({
    kicker: `${TONE[f.tone].label} · evidence on ${f.source}`, title: f.headline,
    body: (<>
      <p className="text-ink-2">{f.detail}</p>
      <DetailHead>The numbers</DetailHead>
      <Points items={f.evidence.map((e) => <><span className="text-muted">{e.label}:</span> <b className="font-medium tabular">{e.value}</b></>)} />
      {f.product && <OpenProduct p={f.product} />}
    </>),
  });
  const posDetail = (r: CategoryPosition): DetailContent => ({
    kicker: `${cat(r.category)} · portfolio position`, title: r.quadrant ? `${QUADRANT[r.quadrant].label}: ${QUADRANT[r.quadrant].read.toLowerCase()}` : `${anchor} has no tracked demand here`,
    body: (<>
      <Points items={[
        `Category growth: ${signedPct(r.growth)} (${compact(r.total)} reviews in the last 3 months vs ${compact(r.prior)} before); the median category grew ${signedPct(portfolio.growthSplit)}`,
        `${anchor}: ${compact(r.anchorRecent)} recent reviews${r.anchorRank ? `, #${r.anchorRank} of ${r.brands} brands` : ""}`,
        `Leader: ${r.leader.brand} with ${compact(r.leader.recent)}, so ${anchor} is at ${r.relShare.toFixed(2)}× the leader`,
        `Based on ${r.products} tracked products`,
      ]} />
      {r.quadrant && <><DetailHead>What the matrix suggests</DetailHead><p>{QUADRANT[r.quadrant].action}</p></>}
    </>),
  });

  // suggested next steps: one per placed category that matters most, and the biggest threats; rule-based, never AI
  const steps = (() => {
    const out: { text: string; why: string; tone?: "good" | "bad" }[] = [];
    const q = [...placed].sort((a, b) => b.growth - a.growth);
    for (const r of q.filter((x) => x.quadrant === "star" || x.quadrant === "cash_cow").slice(0, 2))
      out.push({ text: `${r.quadrant === "star" ? "Invest to keep" : "Defend"} the lead in ${cat(r.category).toLowerCase()}`, why: `${anchor} is ${r.relShare.toFixed(1)}× ${r.leader.brand} in a category growing ${signedPct(r.growth)}.`, tone: "good" });
    for (const r of q.filter((x) => x.quadrant === "question").slice(0, 2))
      out.push({ text: `Decide on ${cat(r.category).toLowerCase()}: push to lead or step back`, why: `The category is growing ${signedPct(r.growth)}, but ${anchor} has ${r.relShare.toFixed(2)}× ${r.leader.brand}'s recent reviews.` });
    for (const r of q.filter((x) => x.quadrant === "dog").slice(-1))
      out.push({ text: `Hold spend in ${cat(r.category).toLowerCase()}`, why: `A slower category (${signedPct(r.growth)}) where ${anchor} is at ${r.relShare.toFixed(2)}× ${r.leader.brand}.`, tone: "bad" });
    for (const f of findings.filter((x) => x.tone === "threat").slice(0, 2)) out.push({ text: `Respond: ${f.headline}`, why: f.detail, tone: "bad" });
    if (stance && stance.voice < stance.shelf * 0.5) out.push({ text: "Close the search gap", why: `${anchor}'s share of K-beauty search (${pctS(stance.voice)}) is under half its share of the shelf (${pctS(stance.shelf)}): shoppers who search do not find it.` });
    return out;
  })();

  return (
    <Shell active="Analysis" asOf={shelf.data?.[0]?.scrape_date}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[30px] font-semibold leading-tight tracking-[-0.02em]">Analysis</h1>
          <p className="mt-1 max-w-[860px] text-[14px] text-ink-2">The executive summary: where {anchor} stands, which categories to back, what changed today, and what to do next. Every figure is a stored observation; click anything with › for the numbers.</p>
        </div>
        <label className="flex items-center gap-2 text-[13px] text-muted">Seen from
          <select value={anchor} onChange={(e) => setAnchorInput(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13.5px] font-medium text-ink">
            {[...new Set([...FOCUS_BRANDS.map((b) => resolveBrand(b, known) ?? b), ...known])].filter(Boolean).slice(0, 60).map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </label>
      </div>
      {!ready ? <Loading what="today's analysis" /> : (<>
        <SectionNav items={NAV} />

        <section id="summary" className="mt-6 scroll-mt-32">
          <Card className="px-6 py-5">
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Verdict for {anchor}</div>
            <p className="mt-2 max-w-[110ch] font-display text-[19px] font-medium leading-snug tracking-tight">{headline}</p>
          </Card>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <SummaryCard label="Where it stands" href="#standing" tone={stance && stance.demand > stance.shelf ? "good" : undefined}>
              {stance ? <>Shelf <b>{pctS(stance.shelf)}</b> · search <b>{pctS(stance.voice)}</b> · demand <b>{pctS(stance.demand)}</b></> : <Missing>Not on any shelf today</Missing>}
            </SummaryCard>
            <SummaryCard label="Portfolio" href="#portfolio" tone={byQ("star").length ? "good" : placed.length ? "bad" : undefined}>
              {placed.length ? <>{(["star", "cash_cow", "question", "dog"] as Quadrant[]).filter((q) => byQ(q).length).map((q) => `${byQ(q).length} ${QUADRANT[q].label.toLowerCase()}${byQ(q).length === 1 ? "" : "s"}`).join(" · ")}</> : <Missing>No tracked demand to place</Missing>}
            </SummaryCard>
            <SummaryCard label="What changed" href="#changes" tone={counts.threat > counts.opening ? "bad" : counts.opening > counts.threat ? "good" : undefined}>
              <b>{counts.threat}</b> threats · <b>{counts.opening}</b> openings · <b>{counts.watch}</b> to watch
            </SummaryCard>
            <SummaryCard label="Range gaps" href="#gaps">
              {openGaps.length ? <>{openGaps.length} categor{openGaps.length === 1 ? "y has" : "ies have"} a price band rivals fill and {anchor} doesn&rsquo;t</> : <>No price band left open to rivals</>}
            </SummaryCard>
          </div>
        </section>

        {stance && (
          <ActionSection id="standing" kicker="Where it stands · three shares" title={(() => {
            const xs = [{ k: "shelf", v: stance.shelf }, { k: "search", v: stance.voice }, { k: "demand", v: stance.demand }].sort((a, b) => b.v - a.v);
            return `${anchor} is strongest on ${xs[0].k} (${pctS(xs[0].v)}) and weakest on ${xs[2].k} (${pctS(xs[2].v)}).`;
          })()} note="A brand can lead one of these and lose the others; where they disagree is where the story is. Hover a number for its definition.">
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Share of shelf", v: stance.shelf, sub: `${stance.slots} top-100 listings today${stance.bestRank ? `, best #${stance.bestRank}` : ""}`, def: "Share of all top-100 places across the tracked categories: what Nykaa gives the brand" },
                { label: "Share of search", v: stance.voice, sub: stance.paidDependency !== null ? `${Math.round(stance.paidDependency * 100)}% of its appearances are paid` : "No search appearances", def: "Share of appearances in the tracked K-beauty searches: what shoppers who search find" },
                { label: "Share of demand", v: stance.demand, sub: `${stance.demandMeasured} products measured`, def: "Share of reviews in the last 3 months across tracked products: what buyers give the brand" },
              ].map((i) => (
                <Card key={i.label} className="px-5 py-4">
                  <div className="text-[11.5px] uppercase tracking-[0.1em] text-muted" title={i.def}>{i.label}</div>
                  <div className="mt-1 font-display text-[27px] font-semibold tabular tracking-tight">{pctS(i.v)}</div>
                  <div className="text-[12.5px] text-ink-2">{i.sub}</div>
                </Card>
              ))}
            </div>
          </ActionSection>
        )}

        <ActionSection id="portfolio" kicker="Portfolio · growth-share matrix" title={placed.length
          ? `${byQ("star").length + byQ("cash_cow").length ? `${anchor} leads ${byQ("star").length + byQ("cash_cow").length} categor${byQ("star").length + byQ("cash_cow").length === 1 ? "y" : "ies"}` : `${anchor} leads no category`}; ${byQ("question").length} are growing faster than average without it in front.`
          : `${anchor} has no tracked demand to place on the matrix.`}
          note={<>The BCG growth-share matrix: each category placed by how fast it is growing (reviews, a stand-in for sales) and by {anchor}&rsquo;s recent reviews against the category leader&rsquo;s. Right of the dashed line = {anchor} leads; above = growing faster than the median category. Bubble size = category volume. Click a bubble for the numbers. <Opens detail={{ kicker: "Method", title: "How the matrix is built", body: <Points items={["Growth: tracked reviews in the last 3 complete months against the 3 before, per category.", `Relative share: ${anchor}'s recent reviews ÷ the largest other brand's, so 1.0× means level with the leader.`, "Split lines: 1.0× for share (the leadership line in the original matrix) and the median category for growth.", "Indicative: demand covers each focus brand's leading products and the most visible rivals, not every listing.", "Categories with under 100 recent reviews are left out as too thin."]} /> }}>Method</Opens></>}>
          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card className="p-4">{placed.length ? <Matrix rows={portfolio.rows} split={portfolio.growthSplit} anchor={anchor} onPick={(r) => detail(posDetail(r))} /> : <Missing>No category to place</Missing>}</Card>
            <Card className="overflow-hidden">
              <div className="grid grid-cols-[1.2fr_70px_80px_1fr] border-b border-line px-4 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted"><span>Category</span><span>Growth</span><span>vs leader</span><span>Position</span></div>
              {portfolio.rows.map((r) => (
                <button key={r.category} onClick={() => detail(posDetail(r))} className="grid w-full grid-cols-[1.2fr_70px_80px_1fr] items-center border-b border-line px-4 py-2 text-left text-[12.5px] last:border-0 hover:bg-page">
                  <span className="font-medium">{cat(r.category)}</span>
                  <span className={`tabular ${r.growth >= portfolio.growthSplit ? "text-good" : "text-ink-2"}`}>{signedPct(r.growth)}</span>
                  <span className="tabular">{r.anchorRecent ? `${r.relShare.toFixed(2)}×` : <Missing>none</Missing>}</span>
                  <span>{r.quadrant ? <Chip tone={QUADRANT[r.quadrant].tone}>{QUADRANT[r.quadrant].label}</Chip> : <Missing>{anchor} not tracked here</Missing>}</span>
                </button>
              ))}
            </Card>
          </div>
        </ActionSection>

        <ActionSection id="changes" kicker="What changed · today's findings" title={findings.length ? `${findings.length} moves crossed a threshold today: ${counts.threat} threats, ${counts.opening} openings, ${counts.watch} to watch.` : "Nothing crossed a threshold today."}
          note="Each line is a rule applied to stored observations (rank moves, review counts, paid slots, price at an unchanged pack size, stock), grouped by theme. Click a line for the numbers behind it."
          right={<div className="flex gap-1.5">{(["all", "threat", "opening", "watch"] as const).map((t) => (
            <button key={t} onClick={() => setFilter(t)} className={`rounded-full px-3 py-1 text-[12.5px] capitalize ring-1 transition ${filter === t ? "bg-ink text-page ring-ink" : "bg-surface text-ink-2 ring-line hover:text-ink"}`}>
              {t === "all" ? `All ${findings.length}` : `${t === "watch" ? "watch" : `${t}s`} ${counts[t]}`}</button>))}</div>}>
          <div className="grid gap-3 lg:grid-cols-2">
            {THEMES.map((th) => {
              const xs = findings.filter(th.test).filter((f) => filter === "all" || f.tone === filter);
              return (
                <Card key={th.id} className="px-5 py-4">
                  <div className="flex items-baseline justify-between"><span className="text-[13.5px] font-semibold">{th.label}</span><span className="rounded-full bg-sunken px-2 py-px text-[11.5px] font-semibold tabular text-ink-2">{xs.length}</span></div>
                  {xs.length ? (
                    <ul className="mt-2 space-y-1.5">
                      <ShowAll n={5} items={xs} render={(f) => (
                        <li key={f.id} className="flex items-start gap-2 text-[13px] leading-snug">
                          <span className={`mt-[6px] h-2 w-2 shrink-0 rounded-full ${TONE[f.tone].dot}`} />
                          <Opens detail={findingDetail(f)}>{f.headline}</Opens>
                        </li>)} />
                    </ul>
                  ) : <p className="mt-2"><Missing>No move crossed this theme&rsquo;s threshold today</Missing></p>}
                </Card>
              );
            })}
          </div>
        </ActionSection>

        {heroes.length > 0 && (
          <ActionSection id="heroes" kicker="Hero products" title={`${anchor}'s strongest product is ${heroes[0].name.replace(new RegExp(`^${anchor}\\s*`, "i"), "")}${heroes[0].edge ? `, which leads its category on ${heroes[0].edge.label.toLowerCase()}` : ""}.`}
            note="Scored on shelf position, recent demand, rating and buyer base, each against the median product in the same category, so a hero is a hero against the market rather than against its siblings.">
            <div className="grid gap-2.5 md:grid-cols-2"><Heroes anchor={anchor} heroes={heroes} /></div>
          </ActionSection>
        )}

        <Presentation anchor={anchor} thumbs={thumbs.data} movement={movement.data} />

        <ActionSection id="gaps" kicker="Range gaps · where rivals sell and the brand doesn't" title={openGaps.length ? `${openGaps.length} of ${gaps.length} categories ${anchor} sells in have a price band where rivals list three or more products and ${anchor} none.` : `${anchor} covers every price band its K-beauty rivals sell in.`}
          note={`Each K-beauty brand's own Nykaa catalogue, split by category and MRP band. An empty band with rivals in it is a price point ${anchor} has no answer to: not proof of an opportunity, but the place to look for one.`}>
          {openGaps.length ? (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-[13px]">
                <thead><tr className="border-b border-line text-[11px] uppercase tracking-[0.08em] text-muted"><th className="px-5 py-2.5 text-left font-semibold">Category</th>{gaps[0]?.bands.map((b) => <th key={b.label} className="px-5 py-2.5 text-left font-semibold">{b.label}</th>)}</tr></thead>
                <tbody>{openGaps.map((g) => (
                  <tr key={g.category} className="border-b border-line last:border-0">
                    <td className="px-5 py-3 font-medium">{cat(g.category)}</td>
                    {g.bands.map((b) => <td key={b.label} className="px-5 py-3">{b.anchorHas > 0 ? <span className="text-ink-2">{b.anchorHas} product{b.anchorHas > 1 ? "s" : ""}<span className="text-muted"> · {b.rivalProducts} rival</span></span>
                      : b.rivalProducts >= 3 ? <span className="rounded-md bg-[#fbecea] px-2 py-0.5 text-bad">none · {b.rivalProducts} rival products</span> : <Missing>{b.rivalProducts ? `${b.rivalProducts} rival product${b.rivalProducts === 1 ? "" : "s"} only` : "nobody sells here"}</Missing>}</td>)}
                  </tr>))}</tbody>
              </table>
            </Card>
          ) : null}
        </ActionSection>

        <ActionSection id="next" kicker="Suggested next steps" title={steps.length ? `${steps.length} things to act on, from the matrix and today's threats.` : "Nothing needs action today."}
          note="Rule-based suggestions, each with the evidence that triggered it. They frame a decision; they are not a recommendation from anyone who knows the budget.">
          <div className="grid gap-3 md:grid-cols-2">
            {steps.map((s, i) => (
              <Card key={i} className="relative overflow-hidden px-5 py-4">
                <span className={`absolute left-0 top-0 h-full w-1 ${s.tone === "good" ? "bg-good" : s.tone === "bad" ? "bg-bad" : "bg-line-2"}`} />
                <div className="text-[14px] font-semibold leading-snug">{s.text}</div>
                <div className="mt-1 text-[12.5px] leading-snug text-ink-2">{s.why}</div>
              </Card>
            ))}
          </div>
        </ActionSection>

        <EventLog />
      </>)}
    </Shell>
  );
}

function SummaryCard({ label, href, tone, children }: { label: string; href: string; tone?: "good" | "bad"; children: React.ReactNode }) {
  return (
    <a href={href} className="relative block overflow-hidden rounded-2xl bg-surface px-5 py-4 shadow-card ring-1 ring-line transition hover:ring-line-2">
      <span className={`absolute left-0 top-0 h-full w-1 ${tone === "good" ? "bg-good" : tone === "bad" ? "bg-bad" : "bg-line-2"}`} />
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-muted"><span>{label}</span><span className="font-normal normal-case tracking-normal">see ↓</span></div>
      <div className="mt-1.5 text-[13.5px] leading-snug">{children}</div>
    </a>
  );
}

function OpenProduct({ p }: { p: NonNullable<Finding["product"]> }) {
  const open = useOpenProduct();
  return <button onClick={() => open(p)} className="mt-4 rounded-lg px-3 py-1.5 text-[13px] text-ink-2 ring-1 ring-line hover:bg-surface">Open the product ›</button>;
}

function Heroes({ anchor, heroes }: { anchor: string; heroes: ReturnType<typeof heroProducts> }) {
  const open = useOpenProduct();
  return (<>
    {heroes.map((h, i) => (
      <Card key={h.product_id}>
        <div className="flex items-start gap-3 px-5 py-4">
          <span className="mt-0.5 font-display text-[13px] font-semibold tabular text-muted">{i + 1}</span>
          <div className="min-w-0 flex-1">
            <button onClick={() => open({ product_id: h.product_id, name: h.name, brand: h.brand, price: h.price })} className="block text-left text-[14px] font-medium leading-snug hover:underline">
              {h.name.replace(new RegExp(`^${anchor}\\s*`, "i"), "")} ›
            </button>
            {h.edge && <p className="mt-1 text-[12.5px] text-ink-2"><span className="font-medium">Leads on {h.edge.label.toLowerCase()}</span>: {h.edge.detail}.</p>}
            <div className="mt-2.5 grid gap-1">
              {h.factors.map((f) => (
                <div key={f.label} className="flex items-center gap-2.5">
                  <span className="w-[104px] shrink-0 text-[11.5px] text-muted">{f.label}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken"><span className="block h-full rounded-full bg-ink/70" style={{ width: `${Math.round(f.value * 100)}%` }} /></span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    ))}
  </>);
}
