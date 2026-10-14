import { norm } from "./brands";
import type { CatalogRow, Movement, ProductDemand } from "./types";
import { push } from "@/lib/group";
import { tr } from "./i18n";

/** What makes a product a brand's hero, scored against the median product in its own category.
 *  Four factors, each 0–1, and the page names whichever one is furthest ahead of the category — that
 *  is the answer to "why is this the hero", stated as the thing it beats its category on. */
export interface HeroScore {
  product_id: string;
  name: string;
  brand: string;
  category: string | null;
  score: number;
  rank: number | null;
  recent: number;
  ratingCount: number | null;
  rating: number | null;
  price: number | null;
  /** The factor it leads its category on, and by how much. */
  edge: { factor: "visibility" | "demand" | "rating" | "reach"; label: string; detail: string } | null;
  factors: { label: string; value: number }[];
}

const median = (xs: number[]) => {
  const v = xs.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
};

export function heroProducts(
  anchor: string,
  movement: Movement[],
  demand: ProductDemand[],
  catalog: CatalogRow[],
): HeroScore[] {
  const same = (b: string) => norm(b) === norm(anchor);

  // Category baselines come from every brand on the shelf, not just the anchor — a hero is a hero
  // against the category, not against its own siblings.
  const catRank = new Map<string, number[]>();
  const catRating = new Map<string, number[]>();
  for (const m of movement) {
    if (!m.category) continue;
    push(catRank, m.category, m.rank);
  }
  const catDemand = new Map<string, number[]>();
  for (const d of demand) {
    if (!d.category) continue;
    push(catDemand, d.category, d.recent);
  }
  for (const c of catalog) {
    for (const cat of c.subcategories ?? []) {
      if (c.rating) push(catRating, cat, c.rating);
    }
  }

  const demandBy = new Map(demand.map((d) => [d.product_id, d]));
  const moveBy = new Map<string, Movement>();
  for (const m of movement) {
    const prev = moveBy.get(m.product_id);
    if (!prev || m.rank < prev.rank) moveBy.set(m.product_id, m); // a product's best shelf position
  }

  const rows = new Map<string, HeroScore>();
  const consider = (
    product_id: string, name: string, category: string | null,
    rank: number | null, rating: number | null, ratingCount: number | null, price: number | null,
  ) => {
    const d = demandBy.get(product_id);
    const recent = d?.recent ?? 0;
    const cat = category ?? d?.category ?? null;

    const medRank = cat ? median(catRank.get(cat) ?? []) : 50;
    const medDemand = cat ? median(catDemand.get(cat) ?? []) : 0;
    const medRating = cat ? median(catRating.get(cat) ?? []) : 4.2;

    const visibility = rank === null ? 0 : Math.max(0, 1 - rank / 100);
    const demandScore = medDemand > 0 ? Math.min(recent / (medDemand * 2), 1) : recent > 0 ? 0.5 : 0;
    const ratingScore = rating ? Math.max(0, Math.min((rating - 3.5) / 1.5, 1)) : 0;
    const reach = ratingCount ? Math.min(Math.log10(ratingCount) / 5, 1) : 0;

    const factors = [
      { label: tr("Shelf position", "진열 순위"), value: visibility },
      { label: tr("Recent demand", "최근 수요"), value: demandScore },
      { label: tr("Rating", "평점"), value: ratingScore },
      { label: tr("Buyer base", "구매자 규모"), value: reach },
    ];
    const score = visibility * 0.3 + demandScore * 0.3 + ratingScore * 0.15 + reach * 0.25;

    // The edge is whichever factor is furthest above the category's own middle.
    const gaps: { factor: HeroScore["edge"] extends null ? never : NonNullable<HeroScore["edge"]>["factor"]; gap: number; label: string; detail: string }[] = [];
    if (rank !== null && medRank > 0) {
      gaps.push({ factor: "visibility", gap: (medRank - rank) / Math.max(medRank, 1), label: tr("Shelf position", "진열 순위"),
        detail: tr(`rank ${rank} where the category's middle product sits at ${Math.round(medRank)}`, `${rank}위 (카테고리 중앙값 제품은 ${Math.round(medRank)}위)`) });
    }
    if (recent > 0 && medDemand > 0) {
      gaps.push({ factor: "demand", gap: (recent - medDemand) / Math.max(medDemand, 1), label: tr("Recent demand", "최근 수요"),
        detail: tr(`${recent} reviews in three months against a category median of ${Math.round(medDemand)}`, `3개월 리뷰 ${recent}건 (카테고리 중앙값 ${Math.round(medDemand)}건)`) });
    }
    if (rating && medRating) {
      gaps.push({ factor: "rating", gap: (rating - medRating) / Math.max(medRating, 1) * 4, label: tr("Rating", "평점"),
        detail: tr(`${rating.toFixed(1)} against a category median of ${medRating.toFixed(1)}`, `${rating.toFixed(1)} (카테고리 중앙값 ${medRating.toFixed(1)})`) });
    }
    if (ratingCount) {
      gaps.push({ factor: "reach", gap: Math.log10(ratingCount) / 5, label: tr("Buyer base", "구매자 규모"),
        detail: tr(`${ratingCount.toLocaleString("en-IN")} ratings collected`, `누적 평가 ${ratingCount.toLocaleString("en-IN")}건`) });
    }
    const best = gaps.sort((a, b) => b.gap - a.gap)[0];

    const existing = rows.get(product_id);
    if (!existing || existing.score < score) {
      rows.set(product_id, {
        product_id, name, brand: anchor, category: cat, score, rank, recent, ratingCount, rating, price,
        edge: best && best.gap > 0 ? { factor: best.factor, label: best.label, detail: best.detail } : null,
        factors,
      });
    }
  };

  for (const m of movement) {
    if (!same(m.brand)) continue;
    consider(m.product_id, m.name, m.category, m.rank, null, null, m.price);
  }
  for (const c of catalog) {
    if (!same(c.brand)) continue;
    const m = moveBy.get(c.product_id);
    consider(c.product_id, c.name, (c.subcategories ?? [])[0] ?? null, m?.rank ?? null, c.rating, c.rating_count, c.price);
  }

  // Collapse variants that share a review pool, so a product and its Mini are not two heroes.
  const pooled = new Map<string, HeroScore>();
  for (const r of [...rows.values()].filter((r) => r.score > 0)) {
    const key = demandBy.get(r.product_id)?.pool_id ?? r.product_id;
    const cur = pooled.get(key);
    if (!cur || r.score > cur.score) pooled.set(key, r);
  }
  return [...pooled.values()].sort((a, b) => b.score - a.score);
}
