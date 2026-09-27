"use client";

import { useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import Shell from "@/components/Shell";
import { Card, Loading } from "@/components/ui";
import EventLog from "@/components/EventLog";
import { useOpenProduct } from "@/components/ProductDrawer";
import { useAvailability, useBrandShares, useCatalog, useCategoryCoverage, useDemand, useMovement, useShelf } from "@/lib/data";
import { buildFindings, portfolioGaps, threeShares, type Finding } from "@/lib/findings";
import { heroProducts } from "@/lib/hero";
import { ANCHOR_BRAND, FOCUS_BRANDS, resolveBrand } from "@/lib/brands";
import { CATEGORY_LABEL, num } from "@/lib/format";

const TONE = {
  threat: { label: "Threat", dot: "bg-bad", ring: "ring-bad/25", text: "text-bad" },
  opening: { label: "Opening", dot: "bg-good", ring: "ring-good/25", text: "text-good" },
  watch: { label: "Watch", dot: "bg-muted", ring: "ring-line", text: "text-muted" },
} as const;

export default function AnalysisPage() {
  return (
    <AuthGate>
      <Analysis />
    </AuthGate>
  );
}

function Analysis() {
  const shelf = useShelf();
  const movement = useMovement();
  const shares = useBrandShares();
  const demand = useDemand();
  const availability = useAvailability();
  const catalog = useCatalog();
  const coverage = useCategoryCoverage();

  const known = useMemo(() => [...new Set((shelf.data ?? []).map((r) => r.brand))].sort(), [shelf.data]);
  const [anchorInput, setAnchorInput] = useState(ANCHOR_BRAND);
  const anchor = resolveBrand(anchorInput, known) ?? anchorInput;
  const [filter, setFilter] = useState<"all" | "threat" | "opening" | "watch">("all");

  const loading = movement.isLoading || shares.isLoading || demand.isLoading;
  const findings = useMemo(() => {
    if (!movement.data || !shares.data || !demand.data) return [];
    return buildFindings({
      anchor,
      movement: movement.data,
      shares: shares.data,
      demand: demand.data,
      availability: availability.data ?? [],
      coverage: coverage.data ?? [],
    });
  }, [anchor, movement.data, shares.data, demand.data, availability.data, coverage.data]);

  const stance = useMemo(
    () => (shares.data && demand.data ? threeShares(anchor, shares.data, demand.data) : null),
    [anchor, shares.data, demand.data],
  );

  const gaps = useMemo(() => {
    if (!catalog.data) return [];
    const anchorCats = new Set(
      catalog.data.filter((r) => r.brand.toLowerCase() === anchor.toLowerCase()).flatMap((r) => r.subcategories ?? []),
    );
    const rows = catalog.data
      .flatMap((r) => (r.subcategories ?? []).map((c) => ({ brand: r.brand, category: c, price: r.price })))
      .filter((r) => anchorCats.size === 0 || anchorCats.has(r.category));
    return portfolioGaps(anchor, rows);
  }, [anchor, catalog.data]);

  const heroes = useMemo(
    () => (movement.data && demand.data && catalog.data ? heroProducts(anchor, movement.data, demand.data, catalog.data).slice(0, 6) : []),
    [anchor, movement.data, demand.data, catalog.data],
  );

  const shown = filter === "all" ? findings : findings.filter((f) => f.tone === filter);
  const counts = {
    threat: findings.filter((f) => f.tone === "threat").length,
    opening: findings.filter((f) => f.tone === "opening").length,
    watch: findings.filter((f) => f.tone === "watch").length,
  };

  return (
    <Shell active="Analysis" asOf={shelf.data?.[0]?.scrape_date}>
      <header className="mb-7">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] font-semibold tracking-tight">What changed, and what it means for {anchor}</h1>
            <p className="mt-1 max-w-[70ch] text-[13.5px] text-muted">
              Every line below is a rule applied to stored observations — rank moves, review counts, paid slots,
              price at unchanged pack size, stock. Nothing is estimated. Open one to see the numbers behind it.
            </p>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-muted">
            Seen from
            <select
              id="anchor-brand"
              value={anchor}
              onChange={(e) => setAnchorInput(e.target.value)}
              className="rounded-lg border border-line bg-surface px-3 py-1.5 text-[13.5px] font-medium text-ink"
            >
              {[...new Set([...FOCUS_BRANDS.map((b) => resolveBrand(b, known) ?? b), ...known])]
                .filter(Boolean)
                .slice(0, 60)
                .map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
            </select>
          </label>
        </div>
      </header>

      {stance && <Stance anchor={anchor} stance={stance} />}

      <div className="mb-4 mt-9 flex flex-wrap items-center gap-2">
        <h2 className="font-display text-[17px] font-semibold tracking-tight">Findings</h2>
        <span className="text-[12.5px] text-muted">{findings.length} from today&rsquo;s data</span>
        <div className="ml-auto flex gap-1.5">
          {(["all", "threat", "opening", "watch"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`rounded-full px-3 py-1 text-[12.5px] capitalize transition ring-1 ${
                filter === t ? "bg-ink text-page ring-ink" : "bg-surface text-ink-2 ring-line hover:text-ink"
              }`}
            >
              {t === "all" ? `All ${findings.length}` : `${t}s ${counts[t]}`}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Loading what="today's findings" />
      ) : shown.length === 0 ? (
        <Card>
          <div className="px-5 py-8 text-center">
            <p className="text-[14px] font-medium">Nothing crossed a threshold</p>
            <p className="mt-1 text-[13px] text-muted">The rules only fire on moves big enough to act on. Check back after the next daily run.</p>
          </div>
        </Card>
      ) : (
        <div className="grid gap-2.5">
          {shown.slice(0, 40).map((f) => (
            <FindingRow key={f.id} f={f} />
          ))}
        </div>
      )}

      <Heroes anchor={anchor} heroes={heroes} />

      <PortfolioGaps anchor={anchor} gaps={gaps} loading={catalog.isLoading} />

      <EventLog />
    </Shell>
  );
}

function Stance({ anchor, stance }: { anchor: string; stance: ReturnType<typeof threeShares> }) {
  const items = [
    { label: "Share of shelf", value: stance.shelf, note: `${stance.slots} slots today${stance.bestRank ? `, best rank ${stance.bestRank}` : ""}`, hint: "What Nykaa gives it" },
    { label: "Share of voice", value: stance.voice, note: stance.paidDependency !== null ? `${Math.round(stance.paidDependency * 100)}% of appearances paid` : "no search presence", hint: "What shoppers' searches give it" },
    { label: "Share of demand", value: stance.demand, note: `${stance.demandMeasured} products measured`, hint: "What buyers give it" },
  ];
  return (
    <Card>
      <div className="border-b border-line px-5 py-3">
        <h2 className="font-display text-[15px] font-semibold tracking-tight">{anchor}&rsquo;s standing, three ways</h2>
        <p className="mt-0.5 text-[12.5px] text-muted">
          A brand can lead one of these and lose the others. Where they disagree is where the story is.
        </p>
      </div>
      <div className="grid gap-px bg-line sm:grid-cols-3">
        {items.map((i) => (
          <div key={i.label} className="bg-surface px-5 py-4">
            <div className="text-[11.5px] uppercase tracking-[0.1em] text-muted">{i.label}</div>
            <div className="mt-1 font-display text-[27px] font-semibold tabular-nums tracking-tight">
              {(i.value * 100).toFixed(1)}%
            </div>
            <div className="text-[12.5px] text-ink-2">{i.note}</div>
            <div className="mt-1 text-[11.5px] text-muted">{i.hint}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function FindingRow({ f }: { f: Finding }) {
  const [open, setOpen] = useState(false);
  const openProduct = useOpenProduct();
  const tone = TONE[f.tone];
  return (
    <div className={`rounded-xl bg-surface ring-1 ${tone.ring} transition`}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 px-5 py-3.5 text-left">
        <span className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-medium leading-snug">{f.headline}</span>
          {open && <span className="mt-1.5 block text-[13px] leading-relaxed text-ink-2">{f.detail}</span>}
        </span>
        <span className={`shrink-0 text-[11.5px] uppercase tracking-[0.08em] ${tone.text}`}>{tone.label}</span>
      </button>
      {open && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-line px-5 py-3">
          {f.evidence.map((e) => (
            <div key={e.label} className="text-[12.5px]">
              <span className="text-muted">{e.label}</span>{" "}
              <span className="font-medium tabular-nums">{e.value}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-3 text-[12.5px]">
            <span className="text-muted">Evidence on {f.source}</span>
            {f.product && (
              <button onClick={() => openProduct(f.product!)} className="rounded-lg px-2.5 py-1 text-ink-2 ring-1 ring-line hover:bg-sunken">
                Open product
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Heroes({ anchor, heroes }: { anchor: string; heroes: ReturnType<typeof heroProducts> }) {
  const openProduct = useOpenProduct();
  if (!heroes.length) return null;
  return (
    <section className="mt-10">
      <h2 className="font-display text-[17px] font-semibold tracking-tight">{anchor}&rsquo;s hero products, and what makes them one</h2>
      <p className="mb-4 mt-1 max-w-[70ch] text-[13.5px] text-muted">
        Scored on shelf position, recent demand, rating and buyer base — each measured against the median
        product in the same category, so a hero is a hero against the market rather than against its siblings.
      </p>
      <div className="grid gap-2.5 md:grid-cols-2">
        {heroes.map((h, i) => (
          <Card key={h.product_id}>
            <div className="flex items-start gap-3 px-5 py-4">
              <span className="mt-0.5 font-display text-[13px] font-semibold tabular-nums text-muted">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <button onClick={() => openProduct({ product_id: h.product_id, name: h.name, brand: h.brand, price: h.price })}
                  className="block text-left text-[14px] font-medium leading-snug hover:underline">
                  {h.name.replace(new RegExp(`^${anchor}\\s*`, "i"), "")}
                </button>
                {h.edge && (
                  <p className="mt-1 text-[13px] text-ink-2">
                    <span className="font-medium">{h.edge.label}</span> — {h.edge.detail}.
                  </p>
                )}
                <div className="mt-2.5 grid gap-1">
                  {h.factors.map((f) => (
                    <div key={f.label} className="flex items-center gap-2.5">
                      <span className="w-[104px] shrink-0 text-[11.5px] text-muted">{f.label}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                        <span className="block h-full rounded-full bg-ink/70" style={{ width: `${Math.round(f.value * 100)}%` }} />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

function PortfolioGaps({ anchor, gaps, loading }: { anchor: string; gaps: ReturnType<typeof portfolioGaps>; loading: boolean }) {
  if (loading) return null;
  const rows = gaps.filter((g) => g.bands.some((b) => b.anchorHas === 0 && b.rivalProducts >= 3));
  if (rows.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="font-display text-[17px] font-semibold tracking-tight">Where rivals sell and {anchor} doesn&rsquo;t</h2>
      <p className="mb-4 mt-1 max-w-[70ch] text-[13.5px] text-muted">
        Each brand&rsquo;s own Nykaa catalogue, split by category and price band. An empty cell with rivals in it is a
        price point {anchor} has no answer to — not proof of an opportunity, but the place to look for one.
      </p>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead>
              <tr className="border-b border-line bg-sunken text-[11.5px] uppercase tracking-[0.08em] text-muted">
                <th className="px-5 py-2.5 text-left font-semibold">Category</th>
                {gaps[0]?.bands.map((b) => (
                  <th key={b.label} className="px-5 py-2.5 text-left font-semibold">{b.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.category} className="border-b border-line last:border-0">
                  <td className="px-5 py-3 font-medium">{CATEGORY_LABEL[g.category] ?? g.category}</td>
                  {g.bands.map((b) => (
                    <td key={b.label} className="px-5 py-3">
                      {b.anchorHas > 0 ? (
                        <span className="text-ink-2">
                          {b.anchorHas} product{b.anchorHas > 1 ? "s" : ""}
                          <span className="text-muted"> · {b.rivalProducts} rival</span>
                        </span>
                      ) : b.rivalProducts >= 3 ? (
                        <span className="rounded-md bg-[#fbecea] px-2 py-0.5 text-bad">
                          none · {b.rivalProducts} rival products
                        </span>
                      ) : (
                        <span className="text-muted">–</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-2 text-[12px] text-muted">
        Counts are live products in each brand&rsquo;s catalogue on the latest weekly crawl, {num(gaps.length)} categories
        {anchor} sells in.
      </p>
    </section>
  );
}
