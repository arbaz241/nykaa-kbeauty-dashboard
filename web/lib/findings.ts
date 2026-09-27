import { CATEGORY_LABEL } from "./format";
import { norm } from "./brands";
import type { Availability, BrandShare, Movement, ProductDemand } from "./types";

/** A finding is a sentence the data supports, plus the numbers that support it.
 *  Rules are deliberately conservative: each one states its own threshold, and anything that
 *  cannot be told apart from a listing artefact (a pack swap, a thin review base) never fires. */
export interface Finding {
  id: string;
  tone: "threat" | "opening" | "watch";
  /** Sorting weight: bigger = more worth the reader's attention. */
  weight: number;
  headline: string;
  detail: string;
  evidence: { label: string; value: string }[];
  brand?: string;
  category?: string | null;
  /** Enough for the product drawer to open without another lookup. */
  product?: { product_id: string; name: string; brand: string; url?: string | null; price?: number | null };
  /** Which page backs this up. */
  source: "Market" | "Demand" | "Search & Ads" | "Compare";
}

const pct = (v: number, d = 0) => `${v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
const cat = (c: string | null | undefined) => (c ? CATEGORY_LABEL[c] ?? c : "across categories");
const same = (a: string, b: string) => norm(a) === norm(b);

interface Input {
  anchor: string;
  movement: Movement[];
  shares: BrandShare[];
  demand: ProductDemand[];
  availability: Availability[];
  /** Days each shelf has been tracked. A shelf added yesterday has no past to compare against. */
  coverage: { category: string; days_tracked: number }[];
}

export function buildFindings({ anchor, movement, shares, demand: demandAll, availability, coverage }: Input): Finding[] {
  const out: Finding[] = [];
  // One row per review pool: a product and its variants serve the same reviews, so reporting both
  // would state the same demand twice. Keep the listing with the most reviews of its own pool.
  const demand = dedupePools(demandAll);
  // Rules that compare today against two weeks ago can only run on shelves that existed two weeks ago —
  // otherwise every product on a newly added shelf reads as a new entrant.
  const settled = new Set(coverage.filter((c) => c.days_tracked >= 15).map((c) => c.category));
  const hasPast = (category: string | null | undefined) => !!category && settled.has(category);
  const days = [...new Set(shares.map((s) => s.scrape_date))].sort();
  const today = days.at(-1);
  const twoWeeksAgo = days.length > 14 ? days.at(-15) : days[0];
  const anchorRows = movement.filter((m) => same(m.brand, anchor));
  const anchorCats = new Set(anchorRows.map((m) => m.category));

  /* 1. A rival climbing hard in a category the anchor sells in. */
  for (const m of movement) {
    if (!hasPast(m.category)) continue;
    if (same(m.brand, anchor) || !m.gain_14d || m.gain_14d < 25 || m.rank > 30) continue;
    if (!anchorCats.has(m.category) && anchorCats.size > 0) continue;
    const anchorBest = Math.min(...anchorRows.filter((a) => a.category === m.category).map((a) => a.rank), Infinity);
    const passed = anchorBest !== Infinity && m.rank < anchorBest;
    out.push({
      id: `climb-${m.product_id}-${m.category}`,
      tone: passed ? "threat" : "watch",
      weight: m.gain_14d + (passed ? 40 : 0),
      headline: `${m.brand} climbed ${m.gain_14d} places in ${cat(m.category)}${passed ? ` — now ahead of ${anchor}` : ""}`,
      detail: passed
        ? `${shorten(m.name, m.brand)} moved from rank ${m.rank_14d} to ${m.rank} in two weeks. ${anchor}'s best product in ${cat(m.category)} sits at ${anchorBest}.`
        : `${shorten(m.name, m.brand)} moved from rank ${m.rank_14d} to ${m.rank} in two weeks.`,
      evidence: [
        { label: "Rank now", value: `${m.rank}` },
        { label: "14 days ago", value: `${m.rank_14d}` },
        ...(anchorBest !== Infinity ? [{ label: `${anchor} best`, value: `${anchorBest}` }] : []),
      ],
      brand: m.brand, category: m.category, product: ref(m), source: "Market",
    });
  }

  /* 2. The anchor losing ground. */
  for (const m of anchorRows) {
    if (!hasPast(m.category) || !m.gain_14d || m.gain_14d > -20) continue;
    out.push({
      id: `slip-${m.product_id}-${m.category}`,
      tone: "threat",
      weight: Math.abs(m.gain_14d) + 30,
      headline: `${anchor} fell ${Math.abs(m.gain_14d)} places in ${cat(m.category)}`,
      detail: `${shorten(m.name, m.brand)} went from rank ${m.rank_14d} to ${m.rank}. Nothing in the price or discount data changed, so this is Nykaa's ranking moving, not a promotion ending.`,
      evidence: [{ label: "Rank now", value: `${m.rank}` }, { label: "14 days ago", value: `${m.rank_14d}` }],
      brand: m.brand, category: m.category, product: ref(m), source: "Market",
    });
  }

  /* 3. Demand inflection — only where the review base is thick enough to mean something. */
  for (const d of demand) {
    if (d.momentum === null || d.momentum < 0.5 || d.recent < 60) continue;
    const isAnchor = same(d.brand, anchor);
    out.push({
      id: `demand-${d.product_id}`,
      tone: isAnchor ? "opening" : "threat",
      weight: 60 + Math.min(d.momentum, 8) * 12 + (isAnchor ? 0 : 15),
      headline: `${d.brand}\u2019s ${shorten(d.name, d.brand)} is converting — reviews up ${pct(d.momentum)}`,
      detail: `${d.recent} reviews in the last three months against ${d.prior} in the three before — ${cat(d.category)}. Review count is the only public proxy for purchases, so this is demand moving, not visibility.`,
      evidence: [
        { label: "Last 3 months", value: `${d.recent}` },
        { label: "Prior 3 months", value: `${d.prior}` },
        { label: "Change", value: pct(d.momentum) },
      ],
      brand: d.brand, category: d.category, product: ref(d), source: "Demand",
    });
  }

  /* 4. Demand draining away. */
  for (const d of demand) {
    if (d.momentum === null || d.momentum > -0.45 || d.prior < 80) continue;
    out.push({
      id: `fade-${d.product_id}`,
      tone: same(d.brand, anchor) ? "threat" : "opening",
      weight: 55 + Math.abs(d.momentum) * 20,
      headline: `${d.brand}\u2019s ${shorten(d.name, d.brand)} is fading — reviews down ${pct(d.momentum)}`,
      detail: `${d.prior} reviews three-to-six months ago, ${d.recent} since. ${
        same(d.brand, anchor) ? "This is the anchor losing purchase volume." : "A rival losing volume in a category you sell in."
      }`,
      evidence: [
        { label: "Prior 3 months", value: `${d.prior}` },
        { label: "Last 3 months", value: `${d.recent}` },
        { label: "Change", value: pct(d.momentum) },
      ],
      brand: d.brand, category: d.category, product: ref(d), source: "Demand",
    });
  }

  /* 5. Paid dependency: who is renting their visibility. Needs a week of appearances to judge. */
  const weekShares = shares.filter((s) => s.scrape_date >= (days.at(-7) ?? ""));
  const byBrand = new Map<string, { earned: number; paid: number }>();
  for (const s of weekShares) {
    const b = byBrand.get(s.brand) ?? { earned: 0, paid: 0 };
    b.earned += s.search_earned; b.paid += s.search_paid;
    byBrand.set(s.brand, b);
  }
  for (const [brand, v] of byBrand) {
    const total = v.earned + v.paid;
    if (total < 25) continue;
    const dep = v.paid / total;
    if (dep < 0.45) continue;
    out.push({
      id: `paid-${brand}`,
      tone: same(brand, anchor) ? "watch" : "opening",
      weight: 50 + dep * 40,
      headline: `${brand} is paying for ${Math.round(dep * 100)}% of its search presence`,
      detail: `${v.paid} of ${total} appearances across the tracked Korean-intent queries this week were paid slots. Its earned position is ${
        v.earned === 0 ? "nothing at all" : `just ${v.earned} results`
      } — the visibility stops the day the spend does.`,
      evidence: [
        { label: "Paid slots", value: `${v.paid}` },
        { label: "Earned slots", value: `${v.earned}` },
        { label: "Paid share", value: `${Math.round(dep * 100)}%` },
      ],
      brand, source: "Search & Ads",
    });
  }

  /* 6. A real price cut — never a pack swap (MRP must be unchanged). */
  for (const m of movement) {
    if (!hasPast(m.category)) continue;
    if (m.price_change_14d === null || m.price_change_14d > -0.1 || !m.same_pack) continue;
    if (!anchorCats.has(m.category) && anchorCats.size > 0) continue;
    out.push({
      id: `price-${m.product_id}-${m.category}`,
      tone: same(m.brand, anchor) ? "watch" : "threat",
      weight: 45 + Math.abs(m.price_change_14d) * 100,
      headline: `${m.brand} cut ${shorten(m.name, m.brand)} by ${pct(m.price_change_14d)} in ${cat(m.category)}`,
      detail: `₹${m.price_14d} to ₹${m.price} at the same MRP, so this is a genuine discount rather than Nykaa switching the pack size shown.`,
      evidence: [
        { label: "Was", value: `₹${m.price_14d}` },
        { label: "Now", value: `₹${m.price}` },
        { label: "Discount now", value: `${m.discount_pct}%` },
      ],
      brand: m.brand, category: m.category, product: ref(m), source: "Compare",
    });
  }

  /* 7. Anchor products out of stock — invisible on shelves, which only list what Nykaa can sell. */
  for (const a of availability) {
    const isAnchor = same(a.brand, anchor);
    if (!isAnchor && (a.rating_count ?? 0) < 5000) continue;
    out.push({
      id: `oos-${a.product_id}`,
      tone: isAnchor ? "threat" : "opening",
      weight: isAnchor ? 70 + Math.min((a.rating_count ?? 0) / 1000, 30) : 40 + Math.min((a.rating_count ?? 0) / 2000, 25),
      headline: isAnchor
        ? `${anchor} is out of stock on ${shorten(a.name, a.brand)}`
        : `${a.brand} is out of stock on ${shorten(a.name, a.brand)}`,
      detail: isAnchor
        ? `${(a.rating_count ?? 0).toLocaleString("en-IN")} ratings of demand with nothing to sell. Shelf rankings never show this — Nykaa only lists what it can ship.`
        : `A rival's product with ${(a.rating_count ?? 0).toLocaleString("en-IN")} ratings is unavailable. Its buyers are shopping for a substitute right now.`,
      evidence: [
        { label: "Ratings", value: (a.rating_count ?? 0).toLocaleString("en-IN") },
        { label: "Price", value: a.price ? `₹${a.price}` : "–" },
      ],
      brand: a.brand, product: ref(a), source: "Compare",
    });
  }

  /* 8. New arrivals from brands that matter. */
  const entrants = new Map<string, Movement[]>();
  for (const m of movement) {
    if (!hasPast(m.category) || !m.new_since_14d || m.rank > 60) continue;
    entrants.set(m.brand, [...(entrants.get(m.brand) ?? []), m]);
  }
  for (const [brand, list] of entrants) {
    if (list.length < 2 || same(brand, anchor)) continue;
    const cats = [...new Set(list.map((m) => cat(m.category)))];
    out.push({
      id: `entry-${brand}`,
      tone: "watch",
      weight: 35 + list.length * 8,
      headline: `${brand} put ${list.length} new products into the top 60 in two weeks`,
      detail: `Across ${cats.join(", ")}. Best new entry is rank ${Math.min(...list.map((m) => m.rank))}. A cluster of entries this tight is a push, not a coincidence.`,
      evidence: [
        { label: "New entries", value: `${list.length}` },
        { label: "Best rank", value: `${Math.min(...list.map((m) => m.rank))}` },
      ],
      brand, source: "Market",
    });
  }

  /* 9. Shelf composition shifting under the anchor's feet. */
  if (today && twoWeeksAgo && today !== twoWeeksAgo) {
    const sumShare = (day: string, origin: string) =>
      shares.filter((s) => s.scrape_date === day && s.origin === origin).reduce((n, s) => n + s.slots, 0);
    const totalOn = (day: string) => shares.filter((s) => s.scrape_date === day).reduce((n, s) => n + s.slots, 0);
    const nowShare = sumShare(today, "kbeauty") / (totalOn(today) || 1);
    const thenShare = sumShare(twoWeeksAgo, "kbeauty") / (totalOn(twoWeeksAgo) || 1);
    const delta = nowShare - thenShare;
    if (Math.abs(delta) >= 0.005) {
      out.push({
        id: "origin-shift",
        tone: delta > 0 ? "opening" : "watch",
        weight: 30 + Math.abs(delta) * 400,
        headline: `K-beauty's share of shelf ${delta > 0 ? "rose" : "slipped"} to ${(nowShare * 100).toFixed(1)}%`,
        detail: `From ${(thenShare * 100).toFixed(1)}% two weeks ago, across every tracked shelf. This is the baseline any claim about Korean brands has to beat.`,
        evidence: [
          { label: "Now", value: `${(nowShare * 100).toFixed(1)}%` },
          { label: "2 weeks ago", value: `${(thenShare * 100).toFixed(1)}%` },
        ],
        source: "Market",
      });
    }
  }

  return out.sort((a, b) => b.weight - a.weight);
}

/** Three shares for one brand on the latest day: what Nykaa gives it, what shoppers' searches give it,
 *  and what buyers give it. A brand can lead one and lose the others. */
export function threeShares(brand: string, shares: BrandShare[], demand: ProductDemand[]) {
  const days = [...new Set(shares.map((s) => s.scrape_date))].sort();
  const today = days.at(-1);
  const row = shares.find((s) => s.scrape_date === today && same(s.brand, brand));
  const recentAll = demand.reduce((n, d) => n + d.recent, 0);
  const recentBrand = demand.filter((d) => same(d.brand, brand)).reduce((n, d) => n + d.recent, 0);
  return {
    shelf: row?.share_of_shelf ?? 0,
    voice: row?.share_of_voice ?? 0,
    demand: recentAll ? recentBrand / recentAll : 0,
    slots: row?.slots ?? 0,
    bestRank: row?.best_rank ?? null,
    paidDependency: row?.paid_dependency ?? null,
    demandMeasured: demand.filter((d) => same(d.brand, brand)).length,
  };
}

/** Where rivals sell and the anchor does not: category × price band, from the brands' own catalogues. */
export function portfolioGaps(anchor: string, rows: { brand: string; category: string | null; price: number | null }[]) {
  const BANDS: [string, number, number][] = [["Under ₹500", 0, 500], ["₹500–999", 500, 1000], ["₹1,000–1,999", 1000, 2000], ["₹2,000+", 2000, Infinity]];
  const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))] as string[];
  return cats.map((c) => ({
    category: c,
    bands: BANDS.map(([label, lo, hi]) => {
      const inCell = rows.filter((r) => r.category === c && (r.price ?? 0) >= lo && (r.price ?? 0) < hi);
      const anchorHas = inCell.filter((r) => same(r.brand, anchor)).length;
      const rivals = new Set(inCell.filter((r) => !same(r.brand, anchor)).map((r) => r.brand));
      return { label, anchorHas, rivalBrands: rivals.size, rivalProducts: inCell.length - anchorHas };
    }),
  }));
}

/** Nykaa serves one review pool per product family; keep the strongest listing of each. */
function dedupePools(rows: ProductDemand[]): ProductDemand[] {
  const best = new Map<string, ProductDemand>();
  for (const r of rows) {
    const key = r.pool_id || r.product_id;
    const cur = best.get(key);
    if (!cur || r.lifetime > cur.lifetime) best.set(key, r);
  }
  return [...best.values()];
}

const ref = (r: { product_id: string; name: string; brand: string; url?: string | null; price?: number | null }) =>
  ({ product_id: r.product_id, name: r.name, brand: r.brand, url: r.url ?? null, price: r.price ?? null });

function shorten(name: string, brand?: string) {
  let n = name.replace(/\s*[-–,]\s*(with|for|featuring).*$/i, "").trim();
  if (brand && norm(n).startsWith(norm(brand))) n = n.slice(brand.length).replace(/^[\s-–:]+/, "");
  return n.length > 46 ? `${n.slice(0, 46)}…` : n;
}
