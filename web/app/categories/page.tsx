"use client";

import { useMemo, useState } from "react";
import AuthGate from "@/components/AuthGate";
import { useOpenProduct, type ProductRef } from "@/components/ProductDrawer";
import Shell from "@/components/Shell";
import { Card, Loading, PageHead } from "@/components/ui";
import { Missing, Points } from "@/components/Detail";
import { ORIGIN_LABEL, marketSet, norm } from "@/lib/brands";
import { useTiers } from "@/lib/tiers";
import { useShelf } from "@/lib/data";
import { CATEGORIES, CATEGORY_LABEL, CATEGORY_URL, compact, inr, median, shortName } from "@/lib/format";
import type { ShelfRow } from "@/lib/types";
import { push } from "@/lib/group";

type OriginKey = "all" | "kbeauty" | "local" | "global";
type Badge = "all" | "bestseller" | "new" | "paid";
const ORIGIN_CARDS = [
  { key: "kbeauty", title: "K-beauty brands", short: "K-beauty brands", tone: "#2c6e5a", chip: "bg-[#e4f0eb] text-[#1f5646]" },
  { key: "local", title: "Indian brands", short: "Indian brands", tone: "#e3b27c", chip: "bg-[#faefe2] text-[#8a5a22]" },
  { key: "global", title: "Global brands", short: "global brands", tone: "#a7b9cc", chip: "bg-[#e9eff5] text-[#3d5670]" },
] as const;
const ORIGIN_CHIP: Record<string, string> = { kbeauty: "bg-[#e4f0eb] text-[#1f5646]", local: "bg-[#faefe2] text-[#8a5a22]", global: "bg-[#e9eff5] text-[#3d5670]", unknown: "bg-sunken text-muted" };
const spf = (name: string) => { const m = name.match(/SPF\s*(\d{2,3})/i); return m ? Number(m[1]) : null; };
const page = (rank: number) => Math.ceil(rank / 20);
const ref = (r: ShelfRow): ProductRef => ({ product_id: r.product_id, name: r.name, brand: r.brand, url: r.url, image: r.image_url, price: r.price, mrp: r.mrp, rating: r.rating, rating_count: r.rating_count, usp: r.usp_summary, phrases: r.review_key_phrases, splitup: r.review_splitup, madeIn: r.country_name });

function Stars({ v }: { v: number | null }) {
  if (v === null) return <Missing>no rating</Missing>;
  return <span className="whitespace-nowrap tabular"><span className="text-[#d49a00]">★</span> {v.toFixed(1)}</span>;
}

/** Summary of one origin group within a category: the reference dashboard's three cards, in English and from our data. */
function originSummary(rs: ShelfRow[], total: number, isSunscreen: boolean) {
  if (!rs.length) return null;
  const prices = rs.map((r) => r.price ?? 0).filter((p) => p > 0).sort((a, b) => a - b);
  const q = (f: number) => prices[Math.min(prices.length - 1, Math.floor(f * (prices.length - 1)))];
  const byBrand = new Map<string, ShelfRow[]>(); rs.forEach((r) => push(byBrand, r.brand, r));
  const brands = [...byBrand.entries()].map(([b, g]) => ({ b, n: g.length, ratings: g.reduce((a, r) => a + (r.rating_count ?? 0), 0), ranks: g.map((r) => r.rank).sort((x, y) => x - y) }));
  const mostReviewed = [...brands].sort((a, b) => b.ratings - a.ratings)[0];
  const mostListed = [...brands].sort((a, b) => b.n - a.n || a.ranks[0] - b.ranks[0])[0];
  const rated = rs.filter((r) => r.rating !== null);
  const spfs = isSunscreen ? rs.map((r) => spf(r.name)).filter((x): x is number => x !== null) : [];
  const spfMode = spfs.length ? [...new Set(spfs)].map((v) => ({ v, n: spfs.filter((x) => x === v).length })).sort((a, b) => b.n - a.n)[0] : null;
  const discounts = rs.map((r) => r.discount_pct ?? 0);
  return {
    n: rs.length, share: rs.length / Math.max(1, total), top20: rs.filter((r) => r.rank <= 20).length, best: Math.min(...rs.map((r) => r.rank)),
    band: prices.length ? [q(0.25), q(0.75)] as const : null, median: median(prices),
    mostReviewed, mostListed, avgRating: rated.length ? rated.reduce((a, r) => a + (r.rating ?? 0), 0) / rated.length : null,
    avgDiscount: discounts.reduce((a, b) => a + b, 0) / discounts.length, paid: rs.filter((r) => r.is_ad).length,
    spf: spfMode ? { ...spfMode, of: spfs.length } : null,
  };
}

function CategoriesPage() {
  const shelf = useShelf(); const open = useOpenProduct();
  const rows = useMemo(() => shelf.data ?? [], [shelf.data]);
  const set = useMemo(() => marketSet(rows), [rows]);
  const tiers = useTiers(useMemo(() => [...new Set(rows.map((r) => r.brand))], [rows]));
  // the shared tiering: anchor, focus brand, another tracked Korean brand, or a rival holding many places in the anchor's categories
  const tagOf = (b: string) => (tiers.isPinned(b) ? "Anchor" : tiers.isFocus(b) ? "Focus" : set.tier(b) === "rival" ? "Rival in its categories" : set.tier(b) ? "Other K-beauty" : null);
  const [cat, setCat] = useState<string>(CATEGORIES[0]);
  const [noAds, setNoAds] = useState(false);
  const [origin, setOrigin] = useState<OriginKey>("all");
  const [badge, setBadge] = useState<Badge>("all");
  const [concern, setConcern] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [inView, setInView] = useState(false);

  const catRows = useMemo(() => rows.filter((r) => r.subcategory === cat).sort((a, b) => a.rank - b.rank), [rows, cat]);
  // with ads hidden, positions are renumbered so they read as the order a shopper sees without sponsored slots
  const base = useMemo(() => {
    const list = noAds ? catRows.filter((r) => !r.is_ad) : catRows;
    return list.map((r, i) => ({ r, pos: noAds ? i + 1 : r.rank }));
  }, [catRows, noAds]);
  const concerns = useMemo(() => {
    const c = new Map<string, number>(); catRows.forEach((r) => (r.concerns ?? []).forEach((x) => c.set(x, (c.get(x) ?? 0) + 1)));
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 9).map(([k]) => k);
  }, [catRows]);
  const shown = base.filter(({ r }) =>
    (origin === "all" || r.origin === origin) &&
    (badge === "all" || (badge === "bestseller" ? r.is_bestseller : badge === "new" ? r.is_new_tag : r.is_ad)) &&
    (!concern || (r.concerns ?? []).includes(concern)) &&
    (!inView || tiers.inSet(r.brand)) &&
    (!q || `${r.brand} ${r.name}`.toLowerCase().includes(q.toLowerCase())));
  const summaryRows = base.map((b) => b.r);
  const isSun = cat === "sunscreen";
  const anchorRows = catRows.filter((r) => norm(r.brand) === norm(set.anchor));

  const exportCsv = () => {
    const head = ["position", "nykaa_rank", "page", "origin", "brand", "product", "badges", "concerns", "mrp", "price", "discount_pct", "pack_size", "ratings", "rating", "url"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = shown.map(({ r, pos }) => [pos, r.rank, `P${page(r.rank)}`, ORIGIN_LABEL[r.origin], r.brand, r.name,
      [r.is_ad && "AD", r.is_bestseller && "BESTSELLER", r.is_new_tag && "NEW"].filter(Boolean).join(" "), (r.concerns ?? []).join("; "),
      r.mrp, r.price, r.discount_pct, r.pack_size, r.rating_count, r.rating, r.url].map(esc).join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `nykaa-top100-${cat}-${rows[0]?.scrape_date ?? ""}.csv`; a.click();
  };

  const asOf = rows[0] ? new Date(rows[0].scrape_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : undefined;
  return (
    <Shell active="Top by category" asOf={asOf}>
      <PageHead eyebrow="Category shelves" title="Top by category" sub="Each tracked category's top 100 on Nykaa, in the order the Nykaa app shows them today, with who holds it by origin." />
      {!shelf.data ? <Loading what="the shelves" /> : (
        <>
          <div className="mt-7 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => { setCat(c); setConcern(null); }}
                className={`rounded-full px-4 py-2 text-[13.5px] transition ${cat === c ? "bg-brand font-medium text-on-brand" : "bg-surface text-ink-2 ring-1 ring-line hover:text-ink"}`}>{CATEGORY_LABEL[c]}</button>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-[12px] font-semibold uppercase tracking-[0.14em] text-accent-strong">{CATEGORY_LABEL[cat]} · who holds the top 100{noAds ? ", sponsored slots removed" : ""}</div>
              <h2 className="mt-2 font-display text-[22px] font-semibold leading-snug tracking-[-0.015em] md:text-[25px]">{(() => {
                const by = ORIGIN_CARDS.map((o) => ({ o, n: summaryRows.filter((r) => r.origin === o.key).length })).sort((a, b) => b.n - a.n);
                const best = summaryRows.find((r) => r.origin === "kbeauty");
                const fN = summaryRows.filter((r) => tiers.inSet(r.brand)).length;
                return `${by[0].o.title} hold ${by[0].n} of the ${summaryRows.length} places (the 20 focus brands hold ${fN})${best ? `; the top K-beauty product is ${best.brand} at #${noAds ? base.find((b) => b.r === best)?.pos : best.rank}` : "; no K-beauty product ranks"}${anchorRows.length ? `, and ${set.anchor}'s best is #${anchorRows[0].rank}` : `, and ${set.anchor} is not in this top 100`}.`;
              })()}</h2>
            </div>
            <a href={CATEGORY_URL[cat]} target="_blank" rel="noreferrer" className="text-[12.5px] text-ink-2 underline underline-offset-4 hover:text-ink">This listing on Nykaa ↗</a>
          </div>
          <section className="mt-3 grid gap-3 lg:grid-cols-3">
            {ORIGIN_CARDS.map((o) => {
              const g = summaryRows.filter((r) => r.origin === o.key); const s = originSummary(g, summaryRows.length, isSun);
              const anchorHere = o.key === "kbeauty" ? anchorRows.filter((r) => !noAds || !r.is_ad) : [];
              return (
                <div key={o.key} className="rounded-2xl bg-surface p-5 shadow-card ring-1 ring-line" style={{ borderTop: `3px solid ${o.tone}` }}>
                  <div className="flex items-center justify-between">
                    <span className="font-display text-[16px] font-semibold">{o.title}</span>
                    {s && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${o.chip}`}>{s.n} listings · {Math.round(s.share * 100)}%</span>}
                  </div>
                  {!s ? <p className="mt-3 text-[13px] text-muted">No {o.short} in this top 100.</p> : (
                    <>
                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[12px]">
                        <div><dt className="text-muted">Price band</dt><dd className="font-display text-[17px] font-semibold tabular">{s.band ? `${inr(s.band[0])}–${inr(s.band[1])}` : <Missing>no prices</Missing>}</dd><dd className="text-[11px] text-muted">middle half of listings</dd></div>
                        <div><dt className="text-muted">Placement</dt><dd className="font-display text-[17px] font-semibold tabular">{s.top20} in top 20</dd><dd className="text-[11px] text-muted">best #{s.best}{s.paid ? ` · ${s.paid} paid slot${s.paid === 1 ? "" : "s"}` : ""}</dd></div>
                        <div><dt className="text-muted">Most reviewed</dt><dd className="font-display text-[15px] font-semibold">{s.mostReviewed.b}</dd><dd className="text-[11px] text-muted">{compact(s.mostReviewed.ratings)} ratings across {s.mostReviewed.n}</dd></div>
                        <div><dt className="text-muted">Most listings</dt><dd className="font-display text-[15px] font-semibold">{s.mostListed.b}</dd><dd className="text-[11px] text-muted">{s.mostListed.n} of {s.n} · ranks {s.mostListed.ranks.slice(0, 4).map((x) => `#${x}`).join(", ")}</dd></div>
                        <div><dt className="text-muted">Avg rating · discount</dt><dd className="font-display text-[15px] font-semibold tabular">{s.avgRating ? `★ ${s.avgRating.toFixed(2)}` : "no rating"} · {Math.round(s.avgDiscount)}%</dd></div>
                        {s.spf ? <div><dt className="text-muted">Usual SPF</dt><dd className="font-display text-[15px] font-semibold tabular">SPF {s.spf.v}</dd><dd className="text-[11px] text-muted">{s.spf.n} of {s.spf.of} that state one</dd></div>
                          : <div><dt className="text-muted">Typical price</dt><dd className="font-display text-[15px] font-semibold tabular">{inr(s.median)}</dd></div>}
                      </dl>
                      <Points className="mt-4 border-t border-line pt-3 text-[12.5px] text-ink-2" items={[
                        <><b className="text-ink">{s.mostReviewed.b}</b>: most ratings ({compact(s.mostReviewed.ratings)}, ranks {s.mostReviewed.ranks.slice(0, 3).map((x) => `#${x}`).join(", ")})</>,
                        ...(s.mostListed.b !== s.mostReviewed.b ? [<><b className="text-ink">{s.mostListed.b}</b>: most listings ({s.mostListed.n})</>] : []),
                        (() => { const fb = new Map<string, number[]>(); g.filter((r) => tiers.inSet(r.brand) && !tiers.isPinned(r.brand)).forEach((r) => push(fb, r.brand, r.rank));
                          const xs = [...fb.entries()].sort((a, b) => b[1].length - a[1].length || Math.min(...a[1]) - Math.min(...b[1]));
                          return <><b className="text-ink">Focus brands here</b>: {xs.length ? xs.slice(0, 4).map(([b, rk]) => `${b} ${rk.length} (best #${Math.min(...rk)})`).join(" · ") : "none"}{xs.length > 4 ? ` · +${xs.length - 4} more` : ""}</>; })(),
                        ...(o.key === "kbeauty" ? [<><b className="text-ink">{set.anchor}</b>: {anchorHere.length ? `${anchorHere.length} listing${anchorHere.length === 1 ? "" : "s"}, ${anchorHere.map((r) => `#${r.rank}`).join(", ")}` : "not in this top 100"}</>] : []),
                      ]} />
                    </>
                  )}
                </div>
              );
            })}
          </section>

          <Card className="mt-5">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search brand or product" className="w-64 rounded-xl border border-line bg-page px-3.5 py-2 text-[13px] outline-none focus:border-accent-strong" />
              <button onClick={() => setNoAds(!noAds)} className={`rounded-full px-3.5 py-1.5 text-[12.5px] ring-1 transition ${noAds ? "bg-[#fbecea] text-bad ring-bad/40" : "text-ink-2 ring-line hover:bg-sunken"}`}>⊘ Hide sponsored slots</button>
              <Chips value={origin} onChange={setOrigin} options={[["all", "All origins"], ["kbeauty", "K-beauty"], ["local", "Indian"], ["global", "Global"]]} />
              <Chips value={badge} onChange={setBadge} options={[["all", "All"], ["bestseller", "Bestseller"], ["new", "New"], ["paid", "Sponsored"]]} />
              <button onClick={() => setInView(!inView)} className={`rounded-full px-3.5 py-1.5 text-[12.5px] ring-1 transition ${inView ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line hover:bg-sunken"}`}>Focus brands only</button>
              <span className="ml-auto text-[12.5px] text-muted tabular"><b className="text-ink">{shown.length}</b> / {base.length} shown</span>
              <button onClick={exportCsv} className="rounded-lg px-3 py-1.5 text-[12.5px] text-ink-2 ring-1 ring-line hover:bg-sunken">⇩ CSV</button>
            </div>
            {concerns.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-2.5 text-[12px]">
                <span className="mr-1 text-muted">Targets:</span>
                {concerns.map((c) => <button key={c} onClick={() => setConcern(concern === c ? null : c)} className={`rounded-full px-2.5 py-1 ring-1 transition ${concern === c ? "bg-brand text-on-brand ring-brand" : "text-ink-2 ring-line hover:bg-sunken"}`}>{c}</button>)}
                <span className="ml-2 text-[11px] text-muted">from Nykaa&apos;s product pages; products without them never match</span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] text-[13px]">
                <thead><tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                  <th className="px-4 py-3 text-right">#</th><th className="px-2 py-3">Page</th><th className="px-2 py-3">Origin</th><th className="px-3 py-3">Brand</th>
                  <th className="px-3 py-3">Product</th><th className="px-2 py-3">Badge</th>{isSun && <th className="px-2 py-3 text-right">SPF</th>}<th className="px-3 py-3">Targets</th>
                  <th className="px-2 py-3 text-right">MRP</th><th className="px-2 py-3 text-right">Sells at</th><th className="px-2 py-3 text-right">Off</th>
                  <th className="px-2 py-3 text-right">Size</th><th className="px-2 py-3 text-right">Ratings</th><th className="px-4 py-3 text-right">Rating</th>
                </tr></thead>
                <tbody>
                  {shown.map(({ r, pos }) => {
                    const tag = tagOf(r.brand); const anchor = tag === "Anchor";
                    return (
                      <tr key={r.product_id} onClick={() => open(ref(r))} className={`cursor-pointer border-b border-line/70 align-top hover:bg-page ${anchor ? "bg-[#f3f7fd]" : ""}`}>
                        <td className="px-4 py-2.5 text-right tabular"><b>{pos}</b>{noAds && pos !== r.rank && <div className="text-[10.5px] text-muted">Nykaa #{r.rank}</div>}</td>
                        <td className="px-2 py-2.5"><span className="rounded border border-line px-1.5 text-[11px] text-muted tabular">P{page(r.rank)}</span></td>
                        <td className="px-2 py-2.5"><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${ORIGIN_CHIP[r.origin]}`}>{ORIGIN_LABEL[r.origin]}</span></td>
                        <td className="px-3 py-2.5 font-medium">{r.brand}{tag && <div className={`text-[10px] font-semibold uppercase tracking-[0.05em] ${tag === "Focus" || tag === "Anchor" ? "text-accent-strong" : "text-muted"}`}>{tag}</div>}</td>
                        <td className="max-w-[340px] px-3 py-2.5 leading-snug">{shortName(r.name, r.brand)}</td>
                        <td className="px-2 py-2.5"><div className="flex flex-col items-start gap-1">
                          {r.is_ad && <span className="rounded bg-[#fff4d6] px-1.5 text-[10.5px] font-semibold text-[#8a6100]">SPONSORED</span>}
                          {r.is_bestseller && <span className="rounded bg-[#fce8f1] px-1.5 text-[10.5px] font-semibold text-[#b03a72]">BESTSELLER</span>}
                          {r.is_new_tag && <span className="rounded bg-[#e6effb] px-1.5 text-[10.5px] font-semibold text-[#1f5fae]">NEW</span>}
                          {!r.is_ad && !r.is_bestseller && !r.is_new_tag && <span className="text-[11px] text-muted">none</span>}
                        </div></td>
                        {isSun && <td className="px-2 py-2.5 text-right tabular">{spf(r.name) ?? <Missing>not stated</Missing>}</td>}
                        <td className="px-3 py-2.5"><div className="flex max-w-[220px] flex-wrap gap-1">{(r.concerns ?? []).slice(0, 3).map((c) => <span key={c} className="rounded-full bg-sunken px-2 py-0.5 text-[11px] text-ink-2">{c}</span>)}{!r.concerns?.length && <Missing>not listed</Missing>}</div></td>
                        <td className="px-2 py-2.5 text-right font-medium tabular">{r.mrp ? inr(r.mrp) : inr(r.price)}</td>
                        <td className="px-2 py-2.5 text-right tabular text-ink-2">{r.price && r.mrp && r.price < r.mrp ? inr(r.price) : <span className="text-[11px] text-muted">same</span>}</td>
                        <td className="px-2 py-2.5 text-right tabular">{r.discount_pct ? <span className="text-good">{Math.round(r.discount_pct)}%</span> : <span className="text-[11px] text-muted">none</span>}</td>
                        <td className="px-2 py-2.5 text-right tabular text-ink-2">{r.pack_size ?? <Missing>not listed</Missing>}</td>
                        <td className="px-2 py-2.5 text-right tabular">{r.rating_count ? r.rating_count.toLocaleString("en-US") : <Missing>none yet</Missing>}</td>
                        <td className="px-4 py-2.5 text-right"><Stars v={r.rating} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!shown.length && <p className="px-5 py-6 text-[13px] text-muted">Nothing matches these filters.</p>}
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-t border-line px-4 py-3 text-[11.5px] text-muted">
              <span>Nykaa app ranking, top 100 (pages 1–5 of 20), collected {asOf}. Click a row for its rank history, demand and reviews.</span>
              <span>Origin: brand classification · Badges: Nykaa&apos;s own tags on the listing</span>
            </div>
          </Card>
        </>
      )}
    </Shell>
  );
}

function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="inline-flex rounded-full bg-sunken p-0.5 ring-1 ring-line">
      {options.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} className={`rounded-full px-3 py-1 text-[12.5px] transition ${value === v ? "bg-surface font-medium text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}>{l}</button>
      ))}
    </div>
  );
}

export default function Page() {
  return <AuthGate><CategoriesPage /></AuthGate>;
}
